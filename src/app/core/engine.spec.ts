import { describe, it, expect } from 'vitest';
import {
  Assumptions, BATTERY_OPTIONS, BEST_MAX_GEN_RATIO, CONNECTION_LIMIT_KW, DEFAULT_ASSUMPTIONS as A, HomeInputs, MONTH_DAYS, NO_OBSTACLES, Usage,
  annualFromBill, annualFromProfile, averageDay, buildGrid, cashflow, connectionLimitPanels, costBreakdown, estimateProfile,
  maxPanels, obstacleArea, orientationFactor, pickStrategies, roofFitPanels, seaiGrantFor, shadingFactor, simulate, solarDay,
  splitUsage, systemCost, usableArea, withExtras,
} from './engine';

const HOME: HomeInputs = { occupancy: 'mixed', orientation: 'S', shading: 'none', roofAreaM2: 30, obstacles: { ...NO_OBSTACLES }, threePhase: false, addEv: false, addHeatPump: false };
const home = (p: Partial<HomeInputs> = {}): HomeInputs => ({ ...HOME, ...p, obstacles: { ...NO_OBSTACLES, ...(p.obstacles ?? {}) } });
const usage = (kwh = 4200, occ: HomeInputs['occupancy'] = 'mixed'): Usage => ({ annualKwh: kwh, profile: estimateProfile(kwh, occ), source: 'estimate' });
const assump = (p: Partial<Assumptions> = {}): Assumptions => ({ ...A, ...p });
const isNight = (h: number) => h >= 23 || h < 8;

describe('usage profile', () => {
  it('adds up to the yearly kWh the user entered', () => {
    for (const kwh of [1500, 4200, 9000]) for (const occ of ['away', 'mixed', 'home'] as const)
      expect(annualFromProfile(estimateProfile(kwh, occ))).toBeCloseTo(kwh, 6);
  });
  it('has no negative hours and uses more in winter than summer', () => {
    const p = estimateProfile(4200, 'mixed');
    expect(p.flat().every((v) => v >= 0)).toBe(true);
    const day = (m: number) => p[m].reduce((a, b) => a + b, 0);
    expect(day(0)).toBeGreaterThan(day(6));
  });
  it('puts more use in the daytime for people at home than for people out', () => {
    expect(splitUsage(estimateProfile(4200, 'home')).daytimePct).toBeGreaterThan(splitUsage(estimateProfile(4200, 'away')).daytimePct);
  });
  it('splits into night, daytime and evening that add up to the whole', () => {
    const s = splitUsage(estimateProfile(4200, 'mixed'));
    expect(s.nightPct + s.daytimePct + s.eveningPct).toBeCloseTo(1, 9);
    expect(s.night + s.daytime + s.evening).toBeCloseTo(4200 / 365, 6);
  });
  it('averageDay totals the average daily kWh', () => {
    expect(averageDay(estimateProfile(3650, 'mixed')).reduce((a, b) => a + b, 0)).toBeCloseTo(10, 6);
  });
});

describe('planned extras', () => {
  it('adds about 2,600 kWh for an EV and 3,500 kWh for a heat pump', () => {
    const u = usage(4000);
    expect(withExtras(u, home({ addEv: true })).annualKwh).toBe(6600);
    expect(withExtras(u, home({ addHeatPump: true })).annualKwh).toBe(7500);
    const both = withExtras(u, home({ addEv: true, addHeatPump: true }));
    expect(both.annualKwh).toBe(10100);
    expect(annualFromProfile(both.profile)).toBeCloseTo(10100, 4);
  });
  it('leaves usage unchanged when nothing is planned', () => {
    expect(withExtras(usage(4000), home()).annualKwh).toBe(4000);
  });
  it('charges the EV mostly overnight', () => {
    const night = (u: Usage) => splitUsage(u.profile).night;
    expect(night(withExtras(usage(4000), home({ addEv: true })))).toBeGreaterThan(night(usage(4000)) + (0.7 * 2600) / 365); // at least 70% of the EV's energy is at night
  });
});

describe('bill to kWh', () => {
  it('removes standing charges then divides by the blended unit rate', () => {
    // blended = 0.35 * 0.75 + 0.23 * 0.25 = 0.32 ; (140 - 35) * 12 / 0.32 = 3937.5
    expect(annualFromBill(140, A)).toBe(3938);
  });
  it('never returns less than 500 kWh', () => {
    expect(annualFromBill(10, A)).toBe(500);
  });
  it('rises with the bill', () => {
    expect(annualFromBill(200, A)).toBeGreaterThan(annualFromBill(120, A));
  });
});

describe('SEAI grant', () => {
  it.each([
    [0, 0], [1, 700], [2, 1400], [2.5, 1500], [3, 1600], [4, 1800], [5, 1800], [6, 1800], [1.8, 1260],
  ])('%s kWp gets %s', (kwp, grant) => expect(seaiGrantFor(kwp)).toBe(grant));
  it('is capped at 1,800 for any size', () => {
    expect(seaiGrantFor(30)).toBe(1800);
  });
});

describe('cost breakdown', () => {
  it('adds up to the system cost', () => {
    for (const [kwp, bat] of [[1.8, 0], [4.4, 0], [5.7, 10], [2, 5]] as const) {
      const rows = costBreakdown(kwp, bat, A);
      expect(rows.reduce((t, r) => t + r.mid, 0)).toBe(systemCost(kwp, bat, A));
    }
  });
  it('matches the cost model: base + per kWp (+ battery base + per kWh)', () => {
    const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(10); // rounding across rows
    near(systemCost(4, 0, A), 2200 + 1250 * 4);
    near(systemCost(4, 5, A), 2200 + 1250 * 4 + 800 + 500 * 5);
  });
  it('lands in the published Irish ranges (4 kWp about 6.5k to 8.5k, 6 kWp about 9k to 12k)', () => {
    expect(systemCost(4, 0, A)).toBeGreaterThanOrEqual(6500);
    expect(systemCost(4, 0, A)).toBeLessThanOrEqual(8500);
    expect(systemCost(6, 0, A)).toBeGreaterThanOrEqual(9000);
    expect(systemCost(6, 0, A)).toBeLessThanOrEqual(12000);
  });
  it('has low < typical < high on every line', () => {
    for (const r of costBreakdown(5, 10, A)) { expect(r.low).toBeLessThan(r.mid); expect(r.mid).toBeLessThan(r.high); }
  });
  it('only shows battery lines when there is a battery', () => {
    expect(costBreakdown(4, 0, A).some((r) => r.group === 'battery')).toBe(false);
    expect(costBreakdown(4, 5, A).filter((r) => r.group === 'battery').length).toBe(2);
  });
  it('is empty with no panels, and grows with size', () => {
    expect(costBreakdown(0, 0, A)).toEqual([]);
    expect(systemCost(6, 0, A)).toBeGreaterThan(systemCost(3, 0, A));
  });
  it('scales when the user edits the cost assumptions', () => {
    const base = systemCost(4, 0, A);
    expect(systemCost(4, 0, assump({ panelCostPerKwp: 2500 }))).toBeCloseTo(base + 1250 * 4, -1);
    expect(systemCost(4, 5, assump({ batteryCostPerKwh: 1000 }))).toBeCloseTo(systemCost(4, 5, A) + 500 * 5, -1);
  });
  it('result totals use the same rows and the grant comes off the typical price', () => {
    const r = simulate(usage(), home(), A, { panels: 10, batteryKwh: 0 });
    expect(r.grossCost).toBe(r.breakdown.reduce((t, x) => t + x.mid, 0));
    expect(r.grossLow).toBe(r.breakdown.reduce((t, x) => t + x.low, 0));
    expect(r.grossHigh).toBe(r.breakdown.reduce((t, x) => t + x.high, 0));
    expect(r.grant).toBe(seaiGrantFor(r.kwp));
    expect(r.netCost).toBe(r.grossCost - r.grant);
  });
  it('applies no grant when the home does not qualify', () => {
    const r = simulate(usage(), home(), assump({ seaiGrant: false }), { panels: 10, batteryKwh: 0 });
    expect(r.grant).toBe(0);
    expect(r.netCost).toBe(r.grossCost);
  });
});

describe('roof space and connection limit', () => {
  it('takes obstacles off the roof area', () => {
    const h = home({ roofAreaM2: 30, obstacles: { chimney: 1, skylight: 2, vent: 1 } as any });
    expect(obstacleArea(h)).toBeCloseTo(3 + 4 + 0.7, 9);
    expect(usableArea(h)).toBeCloseTo(22.3, 9);
    expect(roofFitPanels(h, A)).toBe(11);
  });
  it('never lets usable area fall below 6 m2', () => {
    expect(usableArea(home({ roofAreaM2: 8, obstacles: { dormer: 3 } as any }))).toBe(6);
  });
  it('limits a single-phase home to about 6 kW and three-phase to about 11 kW', () => {
    expect(connectionLimitPanels(home(), A)).toBe(Math.floor((CONNECTION_LIMIT_KW.single * 1000) / A.panelWatts)); // 13
    expect(connectionLimitPanels(home({ threePhase: true }), A)).toBe(25);
  });
  it('is limited by the smaller of roof space and connection', () => {
    expect(maxPanels(home({ roofAreaM2: 100 }), A)).toBe(13);
    expect(maxPanels(home({ roofAreaM2: 100, threePhase: true }), A)).toBe(25);
    expect(maxPanels(home({ roofAreaM2: 20 }), A)).toBe(10);
    expect(maxPanels(home({ roofAreaM2: 5 }), A)).toBe(3); // usable area never drops below 6 m2
    expect(maxPanels(home({ roofAreaM2: 5 }), assump({ panelAreaM2: 4 }))).toBe(2); // and we always test at least 2 panels
  });
  it('allows panel count up to 30 at most', () => {
    expect(maxPanels(home({ roofAreaM2: 200, threePhase: true }), assump({ panelWatts: 300 }))).toBe(30);
  });
});

describe('simulate: energy and money add up', () => {
  const cases: { label: string; u: Usage; h: HomeInputs; panels: number; battery: number }[] = [];
  for (const panels of [4, 10, 13]) for (const battery of BATTERY_OPTIONS) for (const [o, occ] of [['S', 'mixed'], ['E_W', 'away'], ['N', 'home']] as const)
    cases.push({ label: `${panels}p ${battery}kWh ${o}`, u: usage(4200, occ), h: home({ orientation: o, occupancy: occ, shading: o === 'N' ? 'heavy' : 'some' }), panels, battery });

  it.each(cases)('$label balances', ({ u, h, panels, battery }) => {
    const r = simulate(u, h, A, { panels, batteryKwh: battery });
    const demand = annualFromProfile(u.profile);
    // everything the home uses is either solar (direct or via battery) or imported
    expect(r.selfUseKwh + r.importKwh).toBeCloseTo(demand, 6);
    expect(r.baselineImportKwh).toBeCloseTo(demand, 6);
    // solar is either used, exported, or lost in the battery
    const loss = r.generationKwh - r.selfUseKwh - r.exportKwh;
    expect(loss).toBeGreaterThanOrEqual(-1e-6);
    if (battery === 0) expect(loss).toBeCloseTo(0, 6);
    expect(r.selfSufficiency).toBeGreaterThanOrEqual(0);
    expect(r.selfSufficiency).toBeLessThanOrEqual(1);
    expect(r.selfConsumption).toBeGreaterThanOrEqual(0);
    expect(r.selfConsumption).toBeLessThanOrEqual(1);
    expect(r.billAfter).toBeLessThanOrEqual(r.billBefore + 1e-9);
    expect(r.annualBenefit).toBeCloseTo(r.billSaving + r.exportIncome, 6);
    expect(r.exportIncome).toBeCloseTo(r.exportKwh * A.exportRate, 6);
    expect(r.netCost).toBe(r.grossCost - r.grant);
    if (r.annualBenefit > 0) expect(r.paybackYears).toBeCloseTo(r.netCost / r.annualBenefit, 9);
  });

  it('generates kWp x yield x orientation x shading over a year', () => {
    for (const [o, s] of [['S', 'none'], ['SE_SW', 'some'], ['E_W', 'heavy']] as const) {
      const r = simulate(usage(), home({ orientation: o, shading: s }), A, { panels: 10, batteryKwh: 0 });
      expect(r.generationKwh).toBeCloseTo(4.4 * 920 * orientationFactor(o) * shadingFactor(s), 6);
      expect(r.monthlyGen.reduce((a, b) => a + b, 0)).toBeCloseTo(r.generationKwh, 6);
    }
  });
  it('4 kWp facing south yields roughly 3,400 to 3,900 kWh a year in Ireland', () => {
    const r = simulate(usage(), home(), assump({ panelWatts: 400 }), { panels: 10, batteryKwh: 0 });
    expect(r.kwp).toBe(4);
    expect(r.generationKwh).toBeGreaterThan(3400);
    expect(r.generationKwh).toBeLessThan(3900);
  });
  it('produces most in summer and least in winter', () => {
    const g = simulate(usage(), home(), A, { panels: 10, batteryKwh: 0 }).monthlyGen;
    expect(Math.max(...g)).toBe(g[5] > g[6] ? g[5] : g[6]);
    expect(Math.min(...g)).toBe(g[11]);
    expect(g[5] / g[11]).toBeGreaterThan(4);
  });
  it('ranks orientations south, south-east/west, east/west, north', () => {
    const gen = (o: HomeInputs['orientation']) => simulate(usage(), home({ orientation: o }), A, { panels: 10, batteryKwh: 0 }).generationKwh;
    expect(gen('S')).toBeGreaterThan(gen('SE_SW'));
    expect(gen('SE_SW')).toBeGreaterThan(gen('E_W'));
    expect(gen('E_W')).toBeGreaterThan(gen('N'));
  });
  it('prices the bill by hour: 11pm to 8am at the night rate, the rest at the day rate', () => {
    const u = usage(4200, 'mixed');
    let expected = 0;
    u.profile.forEach((row, m) => row.forEach((kwh, h) => { expected += kwh * MONTH_DAYS[m] * (isNight(h) ? A.nightRate : A.dayRate); }));
    expect(simulate(u, home(), A, { panels: 4, batteryKwh: 0 }).billBefore).toBeCloseTo(expected, 6);
  });
  it('has no benefit and infinite payback with no panels', () => {
    const r = simulate(usage(), home(), A, { panels: 0, batteryKwh: 0 });
    expect(r.generationKwh).toBe(0);
    expect(r.grossCost).toBe(0);
    expect(r.annualBenefit).toBe(0);
    expect(r.paybackYears).toBe(Infinity);
  });
});

describe('simulate: more equipment behaves sensibly', () => {
  const run = (panels: number, battery: number) => simulate(usage(), home({ roofAreaM2: 60 }), A, { panels, batteryKwh: battery });
  it('more panels means more generation, use and export', () => {
    const a = run(6, 0), b = run(12, 0);
    expect(b.generationKwh).toBeGreaterThan(a.generationKwh);
    expect(b.selfUseKwh).toBeGreaterThanOrEqual(a.selfUseKwh);
    expect(b.exportKwh).toBeGreaterThan(a.exportKwh);
  });
  it('a battery raises self-use and cuts exports, without creating energy', () => {
    const none = run(12, 0), bat = run(12, 10);
    const used = bat.selfUseKwh - none.selfUseKwh, exported = none.exportKwh - bat.exportKwh;
    expect(used).toBeGreaterThan(0);
    expect(used).toBeLessThanOrEqual(exported + 1e-6); // losses mean you gain no more than you stop exporting
    expect(bat.importKwh).toBeLessThan(none.importKwh);
  });
  it('bigger batteries never use less solar', () => {
    const s = BATTERY_OPTIONS.map((b) => run(12, b).selfUseKwh);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThanOrEqual(s[i - 1] - 1e-9);
  });
  it('a bigger home uses more of the solar it generates', () => {
    const small = simulate(usage(2500), home(), A, { panels: 10, batteryKwh: 0 });
    const big = simulate(usage(8000), home(), A, { panels: 10, batteryKwh: 0 });
    expect(big.selfConsumption).toBeGreaterThan(small.selfConsumption);
  });
  it('higher export rate raises income but not the bill saving', () => {
    const lo = simulate(usage(), home(), assump({ exportRate: 0.1 }), { panels: 10, batteryKwh: 0 });
    const hi = simulate(usage(), home(), assump({ exportRate: 0.3 }), { panels: 10, batteryKwh: 0 });
    expect(hi.exportIncome).toBeGreaterThan(lo.exportIncome);
    expect(hi.billSaving).toBeCloseTo(lo.billSaving, 9);
  });
});

describe('recommended strategies', () => {
  const grid = (kwh: number, h: HomeInputs) => buildGrid(withExtras(usage(kwh, h.occupancy), h), h, A);
  const pick = (kwh: number, h: HomeInputs) => pickStrategies(grid(kwh, h));

  it('never recommends 30 panels because the roof is big (regression)', () => {
    for (const roof of [30, 50, 70, 120]) {
      const [lean, best, bold] = pick(4200, home({ roofAreaM2: roof }));
      for (const s of [lean, best, bold]) expect(s.panels).toBeLessThanOrEqual(13);
    }
  });
  it('gives the same answer for any roof that is larger than the connection allows', () => {
    const a = pick(4200, home({ roofAreaM2: 40 })), b = pick(4200, home({ roofAreaM2: 90 }));
    expect(a.map((s) => s.panels)).toEqual(b.map((s) => s.panels));
  });
  it('stays within the connection limit and the roof, single and three phase', () => {
    for (const threePhase of [false, true]) for (const kwh of [2500, 4200, 9000, 14000]) {
      const h = home({ roofAreaM2: 100, threePhase });
      for (const s of pick(kwh, h)) {
        expect(s.panels).toBeLessThanOrEqual(maxPanels(h, A));
        expect(s.kwp).toBeLessThanOrEqual(threePhase ? 11 : 6);
      }
    }
  });
  it('does not oversize "best value" far beyond the home\'s own use', () => {
    for (const kwh of [2500, 4200, 6000, 9000]) {
      const best = pick(kwh, home({ roofAreaM2: 100 }))[1];
      expect(best.generationKwh).toBeLessThanOrEqual(BEST_MAX_GEN_RATIO * kwh + 1);
    }
  });
  it('suggests more panels for a bigger home', () => {
    const small = pick(2500, home({ roofAreaM2: 100 }))[1].panels;
    const big = pick(9000, home({ roofAreaM2: 100 }))[1].panels;
    expect(big).toBeGreaterThan(small);
  });
  it('orders the three options by outlay and independence', () => {
    const [lean, best, bold] = pick(4200, home({ roofAreaM2: 60 }));
    expect(lean.netCost).toBeLessThanOrEqual(best.netCost);
    expect(bold.selfSufficiency).toBeGreaterThanOrEqual(best.selfSufficiency);
  });
  it('tests the largest allowed system, not only even panel counts', () => {
    const sizes = new Set(grid(4200, home({ roofAreaM2: 100 })).map((r) => r.panels));
    expect(sizes.has(13)).toBe(true);
    expect(sizes.has(4)).toBe(true);
  });
  it('handles a tiny roof', () => {
    const [lean, best, bold] = pick(4200, home({ roofAreaM2: 8 }));
    for (const s of [lean, best, bold]) { expect(s.panels).toBeGreaterThanOrEqual(2); expect(s.panels).toBeLessThanOrEqual(4); }
  });
  it('recommends a payback that is finite and reasonable for a typical home', () => {
    const best = pick(4200, home())[1];
    expect(best.paybackYears).toBeGreaterThan(2);
    expect(best.paybackYears).toBeLessThan(12);
  });
  it('a heat pump and EV push the suggested system up', () => {
    const plain = pick(4200, home({ roofAreaM2: 100 }))[1].panels;
    const loaded = pick(4200, home({ roofAreaM2: 100, addEv: true, addHeatPump: true }))[1].panels;
    expect(loaded).toBeGreaterThan(plain);
  });
});

describe('25 year cash flow', () => {
  const r = simulate(usage(), home(), A, { panels: 10, batteryKwh: 0 });
  const flow = cashflow(r, A);
  it('starts at minus the net cost', () => expect(flow[0].cumulative).toBeCloseTo(-r.netCost, 9));
  it('has 26 points, year 0 to 25', () => { expect(flow.length).toBe(26); expect(flow[25].year).toBe(25); });
  it('adds one year of benefit in year 1', () => expect(flow[1].cumulative).toBeCloseTo(-r.netCost + r.annualBenefit, 9));
  it('ages panels 0.5% a year and raises prices by the assumed inflation', () => {
    const y2 = flow[2].cumulative - flow[1].cumulative;
    expect(y2).toBeCloseTo(r.annualBenefit * 0.995 * (1 + A.tariffInflation), 6);
  });
  it('breaks even and keeps rising', () => {
    const be = flow.find((p) => p.cumulative >= 0);
    expect(be).toBeDefined();
    expect(be!.year).toBeGreaterThan(0);
    for (let i = 1; i < flow.length; i++) expect(flow[i].cumulative).toBeGreaterThan(flow[i - 1].cumulative);
  });
  it('fades a battery after 12 years', () => {
    const b = simulate(usage(), home(), A, { panels: 10, batteryKwh: 10 });
    const f = cashflow(b, A);
    const step = (y: number) => f[y].cumulative - f[y - 1].cumulative;
    const infl = (y: number) => Math.pow(1 + A.tariffInflation, y - 1) * Math.pow(0.995, y - 1);
    expect(step(12)).toBeCloseTo(b.annualBenefit * infl(12), 6);
    expect(step(13)).toBeCloseTo(b.annualBenefit * infl(13) * 0.9, 6);
  });
});

describe('solar by the hour', () => {
  const h = home();
  it('adds up to the daily generation for the month', () => {
    const june = solarDay(h, A, 10, 5).reduce((a, b) => a + b, 0);
    const r = simulate(usage(), h, A, { panels: 10, batteryKwh: 0 });
    expect(june).toBeCloseTo(r.monthlyGen[5] / 30, 6);
  });
  it('is zero at night and peaks around midday in June', () => {
    const d = solarDay(h, A, 10, 5);
    for (const hour of [0, 1, 2, 23]) expect(d[hour]).toBe(0);
    const peak = d.indexOf(Math.max(...d));
    expect(peak).toBeGreaterThanOrEqual(11);
    expect(peak).toBeLessThanOrEqual(14);
  });
  it('has a shorter day in December than June', () => {
    const lit = (m: number) => solarDay(h, A, 10, m).filter((v) => v > 0).length;
    expect(lit(11)).toBeLessThan(lit(5) - 5);
  });
});
