import { describe, it, expect } from 'vitest';
import {
  PRICES, priceAgeDays, pricesAreStale,
  Eligibility, grantEligibility,
  Assumptions, BATTERY_OPTIONS, BATTERY_PRODUCTS, BATTERY_SIZES, BATTERY_TIERS, BatteryTier, batteryPrice, batteryTierInfo, BandMonthly, bandHours, medianFromBands, profileFromBands, Band, Tariff, bandBreakdown, bandOf, bandsOfDay, blendedRate, dayStats, rateFor, BEST_MAX_GEN_RATIO, CONNECTION_LIMIT_KW, HOUSE_TYPES, ROOF_TYPES, STOREY_ACCESS, roofTypeInfo, DEFAULT_ASSUMPTIONS as A, HomeInputs, MONTH_DAYS, NO_OBSTACLES, Usage,
  annualFromBill, annualFromProfile, averageDay, buildGrid, cashflow, DEFAULT_GOALS, Goals, EXPORT_PRESETS, ratePreset, RATE_PRESETS, inverterLimitKw, loanPayment, paybackRange, exportTaxFor, EXPORT_TAX_RATES, LIFETIME, paybackFrom, project, connectionLimitPanels, costBreakdown, estimateProfile,
  maxPanels, obstacleArea, orientationFactor, pickStrategies, roofFitPanels, seaiGrantFor, shadingFactor, simulate, solarDay,
  splitUsage, systemCost, usableArea, withExtras,
} from './engine';

const HOME: HomeInputs = { houseType: 'semi', roofType: 'pitched', storeys: 2, taxpayers: 1, yearOccupied: null, occupancy: 'mixed', orientation: 'S', shading: 'none', roofAreaM2: 30, obstacles: { ...NO_OBSTACLES }, threePhase: false, addEv: false, addHeatPump: false };
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
    near(systemCost(4, 5, A), 2200 + 1250 * 4 + batteryPrice('mainstream', 5).mid);
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
    expect(systemCost(4, 5, assump({ batteryTier: 'premium' }))).toBeCloseTo(systemCost(4, 0, A) + batteryPrice('premium', 5).mid, -1);
  });
  it('result totals use the same rows and the grant comes off the typical price', () => {
    const r = simulate(usage(), home(), A, { panels: 10, batteryKwh: 0 });
    expect(r.grossCost).toBe(r.breakdown.reduce((t, x) => t + x.mid, 0));
    expect(r.grossLow).toBe(r.breakdown.reduce((t, x) => t + x.low, 0));
    expect(r.grossHigh).toBe(r.breakdown.reduce((t, x) => t + x.high, 0));
    expect(r.grant).toBe(seaiGrantFor(r.kwp));
    expect(r.netCost).toBe(r.grossCost - r.grant - r.batteryGrant);
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
    expect(connectionLimitPanels(home(), A)).toBe(Math.floor((CONNECTION_LIMIT_KW.single * 1000) / A.panelWatts)); // 12 at 465 W
    expect(connectionLimitPanels(home({ threePhase: true }), A)).toBe(Math.floor((CONNECTION_LIMIT_KW.three * 1000) / A.panelWatts)); // 23 at 465 W
  });
  it('is limited by the smaller of roof space and connection', () => {
    expect(maxPanels(home({ roofAreaM2: 100 }), A)).toBe(12);
    expect(maxPanels(home({ roofAreaM2: 100, threePhase: true }), A)).toBe(23);
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
    expect(r.annualBenefit).toBeCloseTo(r.billSaving + r.exportIncome - r.exportTax, 6);
    expect(r.exportIncome).toBeCloseTo(r.exportKwh * A.exportRate, 6);
    expect(r.netCost).toBe(r.grossCost - r.grant - r.batteryGrant);
    if (r.annualBenefit > 0) expect(r.paybackYears).toBeGreaterThanOrEqual(r.netCost / r.annualBenefit / 1.5);
  });

  it('generates kWp x yield x orientation x shading over a year', () => {
    for (const [o, s] of [['S', 'none'], ['SE_SW', 'some'], ['E_W', 'heavy']] as const) {
      const r = simulate(usage(), home({ orientation: o, shading: s }), A, { panels: 10, batteryKwh: 0 });
      expect(r.generationKwh).toBeCloseTo(10 * A.panelWatts / 1000 * 920 * orientationFactor(o) * shadingFactor(s), 6);
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
    expect(sizes.has(12)).toBe(true);
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
    const plain = pick(4200, home({ roofAreaM2: 100, threePhase: true }))[1].panels;
    const loaded = pick(4200, home({ roofAreaM2: 100, threePhase: true, addEv: true, addHeatPump: true }))[1].panels;
    expect(loaded).toBeGreaterThan(plain);
  });
});

describe('25 year cash flow', () => {
  const r = simulate(usage(), home(), A, { panels: 10, batteryKwh: 0 });
  const flow = cashflow(r, A);
  it('starts at minus the net cost', () => expect(flow[0].cumulative).toBeCloseTo(-r.netCost, 9));
  it('has 26 points, year 0 to 25', () => { expect(flow.length).toBe(26); expect(flow[25].year).toBe(25); });
  it('adds one year of benefit in year 1', () => expect(flow[1].cumulative).toBeCloseTo(-r.netCost + r.annualBenefit, 9));
  it('ages panels, raises the bill saving with prices and holds export income flat', () => {
    const y2 = flow[2].benefit;
    const saving = r.billSaving * 0.995 * (1 + A.tariffInflation);
    const income = r.exportIncome * 0.995;
    const tax = Math.max(0, income - r.exportTaxFree) * A.exportTaxRate;
    expect(y2).toBeCloseTo(saving + income - tax, 6);
  });
  it('breaks even, and payback comes from the same projection', () => {
    const be = flow.find((p) => p.cumulative >= 0);
    expect(be).toBeDefined();
    expect(Math.ceil(r.paybackYears)).toBe(be!.year);
    expect(r.netGain).toBeCloseTo(flow[25].cumulative, 9);
  });
  it('replaces the inverter in year 13 at a lower price', () => {
    expect(flow[13].replacement).toBeCloseTo(r.inverterCost * LIFETIME.inverterCostShare, 9);
    expect(flow[12].replacement).toBe(0);
    expect(r.inverterCost).toBeGreaterThan(0);
  });
  it('replaces a battery in year 15 and not without one', () => {
    const b = simulate(usage(), home(), A, { panels: 10, batteryKwh: 10 });
    const f = cashflow(b, A);
    expect(b.batteryCost).toBeGreaterThan(0);
    expect(f[15].replacement).toBeCloseTo(b.batteryCost * LIFETIME.batteryCostShare + 0, 6);
    expect(flow[15].replacement).toBe(0);
  });
  it('has infinite payback when savings never repay the cost', () => {
    const f = project({ billSaving: 10, exportIncome: 0, exportTaxFree: 0, netCost: 5000, inverterCost: 0, batteryCost: 0 }, A);
    expect(paybackFrom(f)).toBe(Infinity);
  });
  it('interpolates inside the year it breaks even', () => {
    const f = project({ billSaving: 1000, exportIncome: 0, exportTaxFree: 0, netCost: 2500, inverterCost: 0, batteryCost: 0 }, { ...A, tariffInflation: 0 });
    const p = paybackFrom(f);
    expect(p).toBeGreaterThan(2.4);
    expect(p).toBeLessThan(2.7);
  });
  it('taxes export income above the allowance in each year', () => {
    const f = project({ billSaving: 0, exportIncome: 2000, exportTaxFree: 600, netCost: 0, inverterCost: 0, batteryCost: 0 }, A);
    expect(f[1].benefit).toBeCloseTo(2000 - 1400 * A.exportTaxRate, 6);
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

describe('house, storeys and roof type', () => {
  const row = (rows: ReturnType<typeof costBreakdown>, key: string) => rows.find((r) => r.key === key)!.mid;
  const site = (roofType: HomeInputs['roofType'], storeys: HomeInputs['storeys']) => ({ roofType, storeys });

  it('costs less to access a bungalow and more for three storeys', () => {
    const one = row(costBreakdown(5, 0, A, site('pitched', 1)), 'access');
    const two = row(costBreakdown(5, 0, A, site('pitched', 2)), 'access');
    const three = row(costBreakdown(5, 0, A, site('pitched', 3)), 'access');
    expect(one).toBeLessThan(two);
    expect(two).toBeLessThan(three);
    expect(two).toBe(800); // the base two-storey scaffolding allowance
    expect(one).toBe(Math.round(800 * STOREY_ACCESS[1]));
  });
  it('only storeys change the access line and only roof type changes mounting and labour', () => {
    const base = costBreakdown(5, 0, A, site('pitched', 2));
    const tall = costBreakdown(5, 0, A, site('pitched', 3));
    for (const r of base) if (r.key !== 'access') expect(row(tall, r.key)).toBe(r.mid);
    const slate = costBreakdown(5, 0, A, site('slate', 2));
    for (const r of base) if (!['mounting', 'labour'].includes(r.key)) expect(row(slate, r.key)).toBe(r.mid);
    expect(row(slate, 'mounting')).toBeGreaterThan(row(base, 'mounting'));
    expect(row(slate, 'labour')).toBeGreaterThan(row(base, 'labour'));
  });
  it('a standard two-storey tiled roof costs the same as the base model', () => {
    expect(systemCost(5, 0, A, site('pitched', 2))).toBe(systemCost(5, 0, A));
  });
  it('costs more for slate and flat roofs than for tiles, and less for metal sheet', () => {
    const c = (t: HomeInputs['roofType']) => systemCost(5, 0, A, site(t, 2));
    expect(c('slate')).toBeGreaterThan(c('pitched'));
    expect(c('flat')).toBeGreaterThan(c('pitched'));
    expect(c('metal')).toBeLessThan(c('pitched'));
  });
  it('keeps the breakdown rows adding up to the total with site factors applied', () => {
    const r = simulate(usage(), home({ roofType: 'slate', storeys: 3 }), A, { panels: 10, batteryKwh: 5 });
    expect(r.grossCost).toBe(r.breakdown.reduce((t, x) => t + x.mid, 0));
    expect(r.grossCost).toBeGreaterThan(simulate(usage(), home(), A, { panels: 10, batteryKwh: 5 }).grossCost);
  });
  it('treats a flat roof as south-facing frames: direction no longer matters, yield is 95%', () => {
    const gen = (o: HomeInputs['orientation']) => simulate(usage(), home({ roofType: 'flat', orientation: o }), A, { panels: 10, batteryKwh: 0 }).generationKwh;
    const south = simulate(usage(), home({ orientation: 'S' }), A, { panels: 10, batteryKwh: 0 }).generationKwh;
    expect(gen('N')).toBeCloseTo(gen('S'), 6);
    expect(gen('E_W')).toBeCloseTo(gen('S'), 6);
    expect(gen('S')).toBeCloseTo(south * roofTypeInfo('flat').yield, 6);
  });
  it('only counts about 60% of a flat roof as usable, and no other type loses area', () => {
    expect(usableArea(home({ roofType: 'flat', roofAreaM2: 50 }))).toBeCloseTo(30, 9);
    for (const t of ['pitched', 'slate', 'hipped', 'metal'] as const) expect(usableArea(home({ roofType: t, roofAreaM2: 50 }))).toBe(50);
  });
  it('applies obstacles before the flat-roof factor', () => {
    expect(usableArea(home({ roofType: 'flat', roofAreaM2: 50, obstacles: { chimney: 1 } as any }))).toBeCloseTo((50 - 3) * 0.6, 9);
  });
  it('flat roof yield also applies to the hourly solar chart', () => {
    const flat = solarDay(home({ roofType: 'flat' }), A, 10, 5).reduce((a, b) => a + b, 0);
    const pitched = solarDay(home(), A, 10, 5).reduce((a, b) => a + b, 0);
    expect(flat / pitched).toBeCloseTo(0.95, 6);
  });
  it('has a sensible starting roof area for every house type, smaller for terraces and flats', () => {
    const size = (k: string) => HOUSE_TYPES.find((t) => t.key === k)!.roofM2;
    expect(HOUSE_TYPES.length).toBe(5);
    expect(size('detached')).toBeGreaterThan(size('semi'));
    expect(size('semi')).toBeGreaterThan(size('midTerrace'));
    expect(size('midTerrace')).toBeGreaterThan(size('apartment'));
    for (const t of HOUSE_TYPES) expect(t.roofM2).toBeGreaterThanOrEqual(8);
  });
  it('defines every roof type with positive factors', () => {
    for (const t of ROOF_TYPES) for (const v of [t.mounting, t.labour, t.yield, t.area]) expect(v).toBeGreaterThan(0);
  });
});

describe('Irish tariff bands and rates', () => {
  const hours = Array.from({ length: 24 }, (_, h) => h);
  it('uses the CRU time-of-use bands: night 11pm-8am, peak 5pm-7pm, day the rest', () => {
    const b = bandsOfDay('smart');
    expect(hours.filter((h) => b[h] === 'night')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 23]);
    expect(hours.filter((h) => b[h] === 'peak')).toEqual([17, 18]);
    expect(hours.filter((h) => b[h] === 'day')).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 22]);
  });
  it('has no peak on a day and night plan, and one band on a flat plan', () => {
    expect(bandsOfDay('dayNight').includes('peak')).toBe(false);
    expect(hours.filter((h) => bandOf(h, 'dayNight') === 'night').length).toBe(9);
    expect(new Set(bandsOfDay('flat'))).toEqual(new Set(['flat']));
  });
  it('charges each hour the rate of its band', () => {
    const a = assump({ tariff: 'smart', dayRate: 0.3, nightRate: 0.2, peakRate: 0.45 });
    expect(rateFor(3, a)).toBe(0.2);
    expect(rateFor(12, a)).toBe(0.3);
    expect(rateFor(17, a)).toBe(0.45);
    expect(rateFor(18, a)).toBe(0.45);
    expect(rateFor(19, a)).toBe(0.3);
    expect(rateFor(23, a)).toBe(0.2);
    expect(rateFor(5, assump({ tariff: 'flat', flatRate: 0.31 }))).toBe(0.31);
    expect(rateFor(18, assump({ tariff: 'dayNight', dayRate: 0.3, peakRate: 0.9 }))).toBe(0.3); // peak ignored without a smart plan
  });
  it('prices the bill by hour for every plan type (independent recalculation)', () => {
    const u = usage(4200, 'mixed');
    for (const tariff of ['flat', 'dayNight', 'smart'] as Tariff[]) {
      const a = assump({ tariff, flatRate: 0.31, dayRate: 0.33, nightRate: 0.18, peakRate: 0.44 });
      let expected = 0;
      u.profile.forEach((row, m) => row.forEach((kwh, h) => {
        const rate = tariff === 'flat' ? 0.31 : isNight(h) ? 0.18 : tariff === 'smart' && h >= 17 && h < 19 ? 0.44 : 0.33;
        expected += kwh * MONTH_DAYS[m] * rate;
      }));
      expect(simulate(u, home(), a, { panels: 4, batteryKwh: 0 }).billBefore).toBeCloseTo(expected, 6);
    }
  });
  it('a smart plan with the same rates plus a dearer peak costs more than day and night', () => {
    const u = usage();
    const dn = simulate(u, home(), assump({ tariff: 'dayNight' }), { panels: 4, batteryKwh: 0 }).billBefore;
    const sm = simulate(u, home(), assump({ tariff: 'smart' }), { panels: 4, batteryKwh: 0 }).billBefore;
    expect(sm).toBeGreaterThan(dn);
  });
  it('shifts value to the evening: a battery saves more under a dearer peak rate', () => {
    const saving = (peak: number) => simulate(usage(), home({ roofAreaM2: 60 }), assump({ tariff: 'smart', peakRate: peak }), { panels: 12, batteryKwh: 10 }).billSaving;
    expect(saving(0.6)).toBeGreaterThan(saving(0.35));
  });
});

describe('band breakdown shown to the user', () => {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const prof = estimateProfile(4200, 'mixed');
  it.each(['flat', 'dayNight', 'smart'] as Tariff[])('adds up to the whole day and the whole bill on a %s plan', (tariff) => {
    const a = assump({ tariff });
    const rows = bandBreakdown(prof, a);
    expect(sum(rows.map((r) => r.usePct))).toBeCloseTo(1, 9);
    expect(sum(rows.map((r) => r.costPct))).toBeCloseTo(1, 9);
    expect(sum(rows.map((r) => r.kwhPerDay))).toBeCloseTo(4200 / 365, 6);
    expect(sum(rows.map((r) => r.hours))).toBe(24);
    expect(sum(rows.map((r) => r.yearlyCost))).toBeCloseTo(simulate({ annualKwh: 4200, profile: prof, source: 'estimate' }, home(), a, { panels: 0, batteryKwh: 0 }).billBefore, 6);
  });
  it('lists night, day and peak in that order on a smart plan with the right windows', () => {
    const rows = bandBreakdown(prof, assump({ tariff: 'smart' }));
    expect(rows.map((r) => r.band)).toEqual(['night', 'day', 'peak']);
    expect(rows.map((r) => r.window)).toEqual(['11pm to 8am', '8am to 5pm and 7pm to 11pm', '5pm to 7pm']);
    expect(rows.map((r) => r.hours)).toEqual([9, 13, 2]);
  });
  it('shows a lower share of the bill than of the use for night, and the reverse for peak', () => {
    const [night, , peak] = bandBreakdown(prof, assump({ tariff: 'smart' }));
    expect(night.costPct).toBeLessThan(night.usePct);
    expect(peak.costPct).toBeGreaterThan(peak.usePct);
  });
  it('describes the median day when one is given, but costs the full year', () => {
    const flatDay = new Array(24).fill(0.25); // 6 kWh a day
    const rows = bandBreakdown(prof, assump({ tariff: 'dayNight' }), flatDay);
    expect(sum(rows.map((r) => r.kwhPerDay))).toBeCloseTo(6, 9);
    expect(rows[0].kwhPerDay).toBeCloseTo(9 * 0.25, 9); // 9 night hours at 0.25 kWh
    expect(sum(rows.map((r) => r.usePct))).toBeCloseTo(1, 9);
    expect(sum(rows.map((r) => r.yearlyCost))).toBeGreaterThan(900); // still the full-year profile
  });
});

describe('day statistics', () => {
  it('finds the busiest hour, always-on load and sunny-hours share', () => {
    const shape = new Array(24).fill(0.2);
    shape[19] = 0.9;
    shape[3] = 0.1;
    for (let h = 9; h < 17; h++) shape[h] = 0.3;
    const s = dayStats(shape);
    expect(s.busiestHour).toBe(19);
    expect(s.busiestKwh).toBe(0.9);
    expect(s.baseloadWatts).toBeCloseTo(100, 9);
    const total = shape.reduce((a, b) => a + b, 0);
    expect(s.totalKwh).toBeCloseTo(total, 9);
    expect(s.sunnyHoursPct).toBeCloseTo((0.3 * 8) / total, 9);
  });
  it('puts the busiest hour in the evening for a typical estimated home', () => {
    const st = dayStats(averageDay(estimateProfile(4200, 'away')));
    expect(st.busiestHour).toBeGreaterThanOrEqual(17);
    expect(st.busiestHour).toBeLessThanOrEqual(21);
  });
  it('people at home use a larger share in sunny hours than people who are out', () => {
    const share = (o: HomeInputs['occupancy']) => dayStats(averageDay(estimateProfile(4200, o))).sunnyHoursPct;
    expect(share('home')).toBeGreaterThan(share('away'));
  });
});

describe('bills to kWh under each plan', () => {
  it('uses the blended unit rate for the chosen plan', () => {
    expect(blendedRate(assump({ tariff: 'flat', flatRate: 0.4 }))).toBe(0.4);
    expect(blendedRate(assump({ tariff: 'dayNight', dayRate: 0.4, nightRate: 0.2 }))).toBeCloseTo(0.35, 9);
    expect(blendedRate(assump({ tariff: 'smart', dayRate: 0.4, nightRate: 0.2, peakRate: 0.5 }))).toBeCloseTo(0.2 * 0.25 + 0.5 * 0.12 + 0.4 * 0.63, 9);
  });
  it('converts a bill using the user\'s own standing charge and rate', () => {
    expect(annualFromBill(100, assump({ tariff: 'flat', flatRate: 0.3, standingChargeMonthly: 25 }))).toBe(Math.round((75 * 12) / 0.3));
  });
  it('gives fewer kWh when the unit rate is higher', () => {
    expect(annualFromBill(150, assump({ dayRate: 0.5 }))).toBeLessThan(annualFromBill(150, assump({ dayRate: 0.3 })));
  });
  it('keeps the median consistent when an EV or heat pump is added', () => {
    const u = { ...usage(4000), median: new Array(24).fill(0.4), medianDaily: 9.6 };
    const w = withExtras(u, home({ addEv: true }));
    expect(w.median!.reduce((a, b) => a + b, 0)).toBeCloseTo(9.6 + 2600 / 365, 4);
    expect(w.medianDaily).toBeCloseTo(9.6 + 2600 / 365, 6);
    expect(withExtras(u, home()).median).toEqual(u.median);
  });
});

describe('profiles built from daily band totals', () => {
  const flat = (v: number) => new Array(12).fill(v);
  const b: BandMonthly = { night: flat(5), offpeak: flat(6), peak: flat(1), hasPeak: true, medianNight: 4, medianOffpeak: 5, medianPeak: 0.8 };
  const sumHours = (row: number[], hours: number[]) => hours.reduce((t, h) => t + row[h], 0);

  it('splits the day into 9 night hours, 13 day hours and 2 peak hours, or 15 day hours with no peak register', () => {
    const h = bandHours(true);
    expect([h.night.length, h.offpeak.length, h.peak.length]).toEqual([9, 13, 2]);
    expect(h.peak).toEqual([17, 18]);
    const dn = bandHours(false);
    expect([dn.night.length, dn.offpeak.length, dn.peak.length]).toEqual([9, 15, 0]);
  });
  it('keeps the measured night, day and peak totals exactly, in every month and for every household type', () => {
    for (const occ of ['away', 'mixed', 'home'] as const) {
      const p = profileFromBands(b, occ), h = bandHours(true);
      for (const m of [0, 6, 11]) {
        expect(sumHours(p[m], h.night)).toBeCloseTo(5, 9);
        expect(sumHours(p[m], h.offpeak)).toBeCloseTo(6, 9);
        expect(sumHours(p[m], h.peak)).toBeCloseTo(1, 9);
      }
      expect(annualFromProfile(p)).toBeCloseTo(12 * 365, 4);
    }
  });
  it('does not put daytime use into the night hours (regression: everything landed in one hour)', () => {
    const p = profileFromBands({ ...b, night: flat(0), peak: flat(0) }, 'mixed');
    for (const h of bandHours(true).night) expect(p[0][h]).toBe(0);
    expect(Math.max(...p[0])).toBeLessThan(2); // spread over many hours, never one big spike
  });
  it('shapes use within a band by who is home, without changing band totals', () => {
    const away = profileFromBands(b, 'away'), home_ = profileFromBands(b, 'home');
    expect(home_[0][12]).toBeGreaterThan(away[0][12]); // midday use is higher for people at home
    expect(sumHours(home_[0], bandHours(true).offpeak)).toBeCloseTo(sumHours(away[0], bandHours(true).offpeak), 9);
  });
  it('builds the median day from the median of each band', () => {
    const m = medianFromBands(b, 'mixed'), h = bandHours(true);
    expect(sumHours(m, h.night)).toBeCloseTo(4, 9);
    expect(sumHours(m, h.offpeak)).toBeCloseTo(5, 9);
    expect(sumHours(m, h.peak)).toBeCloseTo(0.8, 9);
  });
  it('flows through to the rate band table with the same totals', () => {
    const rows = bandBreakdown(profileFromBands(b, 'mixed'), assump({ tariff: 'smart' }));
    expect(rows.map((r) => Math.round(r.kwhPerDay * 100) / 100)).toEqual([5, 6, 1]);
    expect(rows[0].usePct).toBeCloseTo(5 / 12, 9);
  });
  it('reports the real yearly share of use even when the median day is skewed', () => {
    const skewed = bandBreakdown(profileFromBands(b, 'mixed'), assump({ tariff: 'smart' }), medianFromBands({ ...b, medianNight: 1 }, 'mixed'));
    expect(skewed[0].usePct).toBeCloseTo(5 / 12, 9); // yearly share, not the median day's
    expect(skewed[0].kwhPerDay).toBeCloseTo(1, 9); // median per day still shown
  });
});

describe('battery sizes and prices', () => {
  const tiers: BatteryTier[] = ['value', 'mainstream', 'premium'];

  it('offers the sizes the main brands sell, plus none', () => {
    expect(BATTERY_SIZES).toEqual([5, 7, 8, 10, 13.5, 15, 20]);
    expect(BATTERY_OPTIONS).toEqual([0, ...BATTERY_SIZES]);
    for (let i = 1; i < BATTERY_SIZES.length; i++) expect(BATTERY_SIZES[i]).toBeGreaterThan(BATTERY_SIZES[i - 1]);
    expect(BATTERY_SIZES[0]).toBeGreaterThanOrEqual(PRICES.grants.seaiBatteryMinKwh);
  });
  it('lists each brand with sizes and a tier', () => {
    expect(BATTERY_PRODUCTS.length).toBeGreaterThanOrEqual(10);
    for (const p of BATTERY_PRODUCTS) { expect(p.sizes).toMatch(/\d/); expect(['value', 'mainstream', 'premium']).toContain(p.tier); }
  });
  it('has three tiers with named examples of real products', () => {
    expect(BATTERY_TIERS.map((t) => t.key)).toEqual(tiers);
    for (const t of BATTERY_TIERS) { expect(t.examples.length).toBeGreaterThanOrEqual(2); expect(t.blurb.length).toBeGreaterThan(10); }
    expect(batteryTierInfo('premium').examples.join(' ')).toContain('Tesla Powerwall 3');
    expect(batteryTierInfo('mainstream').examples.join(' ')).toContain('Huawei');
    expect(batteryTierInfo('value').examples.join(' ')).toContain('GivEnergy');
  });
  const anchors = (['value', 'mainstream', 'premium'] as BatteryTier[]).flatMap((t) => PRICES.battery[t].map((a) => [t, a.kwh, a.low, a.high] as [BatteryTier, number, number, number]));
  it.each(anchors)('%s %s kWh returns exactly the price-file range %s to %s', (tier, kwh, low, high) => {
    const p = batteryPrice(tier, kwh);
    expect(p.low).toBe(low);
    expect(p.high).toBe(high);
    expect(p.mid).toBe((low + high) / 2);
  });
  it('costs more for a bigger battery, in every tier and size step', () => {
    for (const t of tiers) for (let i = 1; i < BATTERY_SIZES.length; i++)
      expect(batteryPrice(t, BATTERY_SIZES[i]).mid).toBeGreaterThan(batteryPrice(t, BATTERY_SIZES[i - 1]).mid);
  });
  it('costs less per kWh as the battery gets bigger (fixed fitting costs spread out)', () => {
    for (const t of tiers) {
      const perKwh = (k: number) => batteryPrice(t, k).mid / k;
      expect(perKwh(10)).toBeLessThan(perKwh(5));
      expect(perKwh(13.5)).toBeLessThan(perKwh(5));
    }
  });
  it('puts premium above mainstream above value at the common sizes', () => {
    for (const k of [5, 10, 13.5]) {
      expect(batteryPrice('premium', k).mid).toBeGreaterThan(batteryPrice('mainstream', k).mid);
      expect(batteryPrice('mainstream', k).mid).toBeGreaterThan(batteryPrice('value', k).mid);
    }
  });
  it('interpolates between published points and keeps low below high', () => {
    const [a, b] = PRICES.battery.mainstream; // the 5 and 10 kWh points
    const p = batteryPrice('mainstream', (a.kwh + b.kwh) / 2); // halfway between them
    expect(p.low).toBe(Math.round((a.low + b.low) / 2 / 10) * 10);
    expect(p.high).toBe(Math.round((a.high + b.high) / 2 / 10) * 10);
    for (const t of tiers) for (const k of [3, 5, 7.5, 9.7, 13.5, 20]) { const q = batteryPrice(t, k); expect(q.low).toBeLessThan(q.high); expect(q.mid).toBeGreaterThan(q.low); }
  });
  it('lands in the published per-kWh ranges (about 600 to 1,100 euro per kWh at common sizes)', () => {
    expect(batteryPrice('mainstream', 5).mid / 5).toBeGreaterThanOrEqual(800);
    expect(batteryPrice('mainstream', 5).mid / 5).toBeLessThanOrEqual(1100);
    expect(batteryPrice('mainstream', 10).mid / 10).toBeGreaterThanOrEqual(650);
    expect(batteryPrice('mainstream', 10).mid / 10).toBeLessThanOrEqual(800);
    expect(batteryPrice('premium', 13.5).mid / 13.5).toBeGreaterThanOrEqual(667);
    expect(batteryPrice('premium', 13.5).mid / 13.5).toBeLessThanOrEqual(889);
  });
  it('is free for no battery', () => {
    expect(batteryPrice('premium', 0)).toEqual({ low: 0, mid: 0, high: 0 });
  });

  it('adds the battery to the cost breakdown at the tier price, with rows that add up', () => {
    for (const t of tiers) for (const kwh of BATTERY_SIZES) {
      const rows = costBreakdown(5, kwh, assump({ batteryTier: t })).filter((r) => r.group === 'battery');
      const p = batteryPrice(t, kwh);
      expect(rows.length).toBe(2);
      expect(rows.reduce((s, r) => s + r.mid, 0)).toBe(p.mid);
      expect(rows.reduce((s, r) => s + r.low, 0)).toBe(p.low);
      expect(rows.reduce((s, r) => s + r.high, 0)).toBe(p.high);
    }
  });
  it('names the tier and size on the battery line', () => {
    const row = costBreakdown(5, 10, assump({ batteryTier: 'premium' })).find((r) => r.key === 'battery')!;
    expect(row.label).toBe('Premium battery, 10 kWh');
    expect(row.note).toContain('Tesla');
  });
  it('is not affected by roof type or storeys', () => {
    const a = costBreakdown(5, 10, A).filter((r) => r.group === 'battery').map((r) => r.mid);
    const b = costBreakdown(5, 10, A, { roofType: 'flat', storeys: 3 }).filter((r) => r.group === 'battery').map((r) => r.mid);
    expect(b).toEqual(a);
  });
  it('changes the total installed cost when the tier changes', () => {
    const cost = (t: BatteryTier) => simulate(usage(), home(), assump({ batteryTier: t }), { panels: 10, batteryKwh: 10 }).grossCost;
    expect(cost('premium')).toBeGreaterThan(cost('mainstream'));
    expect(cost('mainstream')).toBeGreaterThan(cost('value'));
    expect(cost('premium') - cost('value')).toBe(batteryPrice('premium', 10).mid - batteryPrice('value', 10).mid);
  });
  it('does not change what the battery does, only what it costs', () => {
    const run = (t: BatteryTier) => simulate(usage(), home({ roofAreaM2: 60 }), assump({ batteryTier: t }), { panels: 12, batteryKwh: 10 });
    expect(run('premium').selfUseKwh).toBeCloseTo(run('value').selfUseKwh, 9);
    expect(run('premium').annualBenefit).toBeCloseTo(run('value').annualBenefit, 9);
    expect(run('premium').paybackYears).toBeGreaterThan(run('value').paybackYears);
  });

  describe('optional 600 euro SEAI battery grant', () => {
    const run = (grant: boolean, kwh: number, panels = 10) => simulate(usage(), home(), assump({ seaiBatteryGrant: grant }), { panels, batteryKwh: kwh });
    it('is on by default now SEAI has confirmed it, and can be switched off', () => {
      expect(PRICES.grants.seaiBatteryConfirmed).toBe(true);
      expect(A.seaiBatteryGrant).toBe(true);
      expect(run(false, 10).batteryGrant).toBe(0);
      expect(run(true, 10).batteryGrant).toBe(600);
    });
    it('takes 600 off for a battery of 5 kWh or more when switched on', () => {
      const off = run(false, 5), on = run(true, 5);
      expect(on.batteryGrant).toBe(600);
      expect(on.netCost).toBe(off.netCost - 600);
      expect(run(true, 15).batteryGrant).toBe(600);
    });
    it('gives nothing without a battery or without panels', () => {
      expect(run(true, 0).batteryGrant).toBe(0);
      expect(simulate(usage(), home(), assump({ seaiBatteryGrant: true }), { panels: 0, batteryKwh: 10 }).batteryGrant).toBe(0);
    });
    it('is separate from the solar grant and never makes the net cost negative', () => {
      const r = run(true, 10);
      expect(r.grant).toBe(seaiGrantFor(r.kwp));
      expect(r.netCost).toBe(r.grossCost - r.grant - r.batteryGrant);
      expect(r.netCost).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('price data file', () => {
  it('has a valid review date that is not in the future', () => {
    expect(Number.isNaN(new Date(PRICES.reviewedOn).getTime())).toBe(false);
    expect(priceAgeDays()).toBeGreaterThanOrEqual(0);
  });
  it('tells visitors when prices are overdue for review', () => {
    const reviewed = new Date(PRICES.reviewedOn + 'T00:00:00Z').getTime();
    const day = 86400000;
    expect(pricesAreStale(new Date(reviewed + PRICES.reviewEveryDays * day))).toBe(false);
    expect(pricesAreStale(new Date(reviewed + (PRICES.reviewEveryDays + 1) * day))).toBe(true);
    expect(priceAgeDays(new Date(reviewed + 10 * day))).toBe(10);
  });
  it('lists a source for the figures and the links are web addresses', () => {
    expect(PRICES.sources.length).toBeGreaterThanOrEqual(5);
    for (const s of PRICES.sources) { expect(s.url).toMatch(/^https:\/\//); expect(s.label.length).toBeGreaterThan(3); }
  });
  it('has battery price points in ascending size order with low below high', () => {
    for (const t of ['value', 'mainstream', 'premium'] as BatteryTier[]) {
      const a = PRICES.battery[t];
      expect(a.length).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < a.length; i++) {
        expect(a[i].low).toBeLessThan(a[i].high);
        if (i) { expect(a[i].kwh).toBeGreaterThan(a[i - 1].kwh); expect(a[i].low).toBeGreaterThan(a[i - 1].low); }
      }
    }
  });
  it('is sane: catches a typo that would change a price by an order of magnitude', () => {
    expect(PRICES.solar.costPerKwp).toBeGreaterThan(800);
    expect(PRICES.solar.costPerKwp).toBeLessThan(2500);
    expect(PRICES.solar.costBase).toBeGreaterThan(1000);
    expect(PRICES.solar.costBase).toBeLessThan(4000);
    expect(PRICES.solar.yieldPerKwp).toBeGreaterThan(700);
    expect(PRICES.solar.yieldPerKwp).toBeLessThan(1100);
    for (const r of [PRICES.tariffs.flat, PRICES.tariffs.day, PRICES.tariffs.night, PRICES.tariffs.peak]) { expect(r).toBeGreaterThan(0.1); expect(r).toBeLessThan(0.8); }
    expect(PRICES.tariffs.night).toBeLessThan(PRICES.tariffs.day);
    expect(PRICES.tariffs.peak).toBeGreaterThan(PRICES.tariffs.day);
    expect(PRICES.tariffs.export).toBeLessThan(PRICES.tariffs.day);
    expect(PRICES.grants.seaiSolarMax).toBe(2 * PRICES.grants.seaiSolarFirst2kwpPerKwp + 2 * PRICES.grants.seaiSolarNext2kwpPerKwp);
  });
  it('feeds the engine defaults, so editing the file changes the estimates', () => {
    expect(A.panelCostBase).toBe(PRICES.solar.costBase);
    expect(A.panelCostPerKwp).toBe(PRICES.solar.costPerKwp);
    expect(A.dayRate).toBe(PRICES.tariffs.day);
    expect(A.exportRate).toBe(PRICES.tariffs.export);
    expect(seaiGrantFor(10)).toBe(PRICES.grants.seaiSolarMax);
  });
  it('has sane export tax settings: the announced limit is above the one in force', () => {
    expect(PRICES.tax.exportExemptionInForcePerPerson).toBe(400);
    expect(PRICES.tax.exportExemptionPerPerson).toBeGreaterThanOrEqual(PRICES.tax.exportExemptionInForcePerPerson);
    expect(PRICES.tax.exportTaxRate).toBeGreaterThan(0.1);
    expect(PRICES.tax.exportTaxRate).toBeLessThan(0.6);
  });
  it('lists official SEAI links for the grants, as web addresses', () => {
    for (const k of ['solarGrant', 'batteryGrant', 'enhanced', 'howToApply', 'installers'] as const) expect(PRICES.links[k]).toMatch(/^https:\/\/www\.seai\.ie\//);
    expect(PRICES.sources.some((x) => x.url === PRICES.links.batteryGrant)).toBe(true);
  });
  it('has grant rules matching SEAI: 600 euro battery from 5 kWh, homes occupied before 2025', () => {
    expect(PRICES.grants.seaiBattery).toBe(600);
    expect(PRICES.grants.seaiBatteryMinKwh).toBe(5);
    expect(PRICES.grants.seaiSolarBuiltBefore).toBe(2025);
    expect(PRICES.grants.seaiBatteryBuiltBefore).toBe(2025);
  });
});

describe('tax on export income', () => {
  // a big, south-facing system on a modest home exports a lot: good for exercising the allowance
  const run = (taxpayers: 1 | 2, a: Partial<Assumptions> = {}, panels = 13) =>
    simulate(usage(2000), home({ roofAreaM2: 60, taxpayers }), assump({ exportRate: 0.32, ...a }), { panels, batteryKwh: 0 });

  it('uses the announced 600 euro per person by default, per the price file', () => {
    expect(A.exportTaxFreePerPerson).toBe(PRICES.tax.exportExemptionPerPerson);
    expect(A.exportTaxFreePerPerson).toBe(600);
    expect(A.exportTaxRate).toBe(PRICES.tax.exportTaxRate);
  });
  it('gives each person on the bill their own allowance: 600 for one, 1,200 for two', () => {
    expect(run(1).exportTaxFree).toBe(600);
    expect(run(2).exportTaxFree).toBe(1200);
  });
  it('charges no tax on export income inside the allowance', () => {
    const r = simulate(usage(), home({ taxpayers: 1 }), assump({ exportRate: 0.1 }), { panels: 8, batteryKwh: 0 });
    expect(r.exportIncome).toBeLessThan(600);
    expect(r.exportTax).toBe(0);
    expect(r.annualBenefit).toBeCloseTo(r.billSaving + r.exportIncome, 9);
  });
  it('taxes only the part above the allowance, at the chosen rate', () => {
    const r = run(1);
    expect(r.exportIncome).toBeGreaterThan(600);
    expect(r.exportTax).toBeCloseTo((r.exportIncome - 600) * A.exportTaxRate, 9);
    expect(run(1, { exportTaxRate: 0.48 }).exportTax).toBeCloseTo((r.exportIncome - 600) * 0.48, 9);
  });
  it('two people pay less tax than one on the same export income, and the difference is the extra allowance', () => {
    const one = run(1), two = run(2);
    expect(two.exportIncome).toBeCloseTo(one.exportIncome, 9);
    expect(two.exportIncome).toBeGreaterThan(1200); // test only means something if both are over their allowance
    expect(two.exportTax).toBeLessThan(one.exportTax);
    expect(one.exportTax - two.exportTax).toBeCloseTo(600 * A.exportTaxRate, 9);
  });
  it('shows up in the benefit, the payback and the cash flow', () => {
    const one = run(1), two = run(2);
    expect(one.annualBenefit).toBeCloseTo(one.billSaving + one.exportIncome - one.exportTax, 9);
    expect(two.annualBenefit).toBeGreaterThan(one.annualBenefit);
    expect(two.paybackYears).toBeLessThan(one.paybackYears);
    expect(cashflow(two, A)[1].cumulative).toBeGreaterThan(cashflow(one, A)[1].cumulative);
  });
  it('does not change the cost, the bill saving or what is exported', () => {
    const one = run(1), two = run(2);
    expect(two.netCost).toBe(one.netCost);
    expect(two.billSaving).toBeCloseTo(one.billSaving, 9);
    expect(two.exportKwh).toBeCloseTo(one.exportKwh, 9);
  });
  it('lets the user use the limit in force (400) instead, which means more tax', () => {
    const announced = run(1), inForce = run(1, { exportTaxFreePerPerson: PRICES.tax.exportExemptionInForcePerPerson });
    expect(inForce.exportTaxFree).toBe(400);
    expect(inForce.exportTax).toBeGreaterThan(announced.exportTax);
    expect(inForce.exportTax - announced.exportTax).toBeCloseTo(200 * A.exportTaxRate, 9);
  });
  it('is zero when nothing is exported or there are no panels', () => {
    expect(simulate(usage(), home(), A, { panels: 0, batteryKwh: 0 }).exportTax).toBe(0);
  });
  it('makes the recommendation less keen on oversizing for exports', () => {
    const best = (kwh: number, payers: 1 | 2) => pickStrategies(buildGrid(usage(kwh), home({ roofAreaM2: 100, taxpayers: payers }), assump({ exportRate: 0.3 })))[1];
    // with two allowances the optimiser can justify at least as many panels as with one
    expect(best(2500, 2).panels).toBeGreaterThanOrEqual(best(2500, 1).panels);
  });
});

describe('SEAI grant eligibility by year occupied', () => {
  const at = (y: number | null) => grantEligibility({ yearOccupied: y }, new Date('2026-10-18'));
  const run = (year: number | null, kwh = 10, a: Partial<Assumptions> = {}) => simulate(usage(), home({ yearOccupied: year }), assump(a), { panels: 10, batteryKwh: kwh });

  it('says unknown until the year is given, and for impossible years', () => {
    for (const y of [null, NaN, 1500, 2100]) expect(at(y as number | null)).toEqual({ solar: 'unknown', battery: 'unknown', yearValid: false });
  });
  it('makes homes occupied before 2025 eligible for both grants', () => {
    for (const y of [1850, 1975, 2004, 2020, 2024]) expect(at(y)).toEqual({ solar: 'eligible', battery: 'eligible', yearValid: true });
  });
  it('makes homes first occupied in 2025 or later ineligible', () => {
    for (const y of [2025, 2026]) expect(at(y)).toEqual({ solar: 'ineligible', battery: 'ineligible', yearValid: true });
  });
  it('applies both grants to an eligible home', () => {
    const r = run(1998);
    expect(r.grant).toBe(seaiGrantFor(r.kwp));
    expect(r.batteryGrant).toBe(600);
  });
  it('takes both grants off for a home occupied in 2025 or later, raising the net cost by exactly that much', () => {
    const ok = run(1998), no = run(2025);
    expect(no.grant).toBe(0);
    expect(no.batteryGrant).toBe(0);
    expect(no.netCost).toBe(ok.netCost + ok.grant + ok.batteryGrant);
    expect(no.grossCost).toBe(ok.grossCost);
    expect(no.paybackYears).toBeGreaterThan(ok.paybackYears);
  });
  it('assumes the grants apply while the year is unknown, so the user sees the typical case', () => {
    const unknown = run(null), ok = run(1998);
    expect(unknown.grant).toBe(ok.grant);
    expect(unknown.batteryGrant).toBe(ok.batteryGrant);
  });
  it('only gives the battery grant for batteries of 5 kWh or more', () => {
    expect(run(1998, 0).batteryGrant).toBe(0);
    expect(run(1998, 5).batteryGrant).toBe(600);
    expect(run(1998, 15).batteryGrant).toBe(600);
  });
  it('lets the user switch either grant off', () => {
    expect(run(1998, 10, { seaiGrant: false }).grant).toBe(0);
    expect(run(1998, 10, { seaiGrant: false }).batteryGrant).toBe(600);
    expect(run(1998, 10, { seaiBatteryGrant: false }).batteryGrant).toBe(0);
    expect(run(1998, 10, { seaiBatteryGrant: false }).grant).toBeGreaterThan(0);
  });
  it('never makes the net cost negative', () => {
    expect(run(1998, 5).netCost).toBeGreaterThanOrEqual(0);
  });
  it('is checked against the price-file cut-off years, so changing them changes eligibility', () => {
    expect(at(PRICES.grants.seaiSolarBuiltBefore - 1).solar).toBe('eligible');
    expect(at(PRICES.grants.seaiSolarBuiltBefore).solar).toBe('ineligible');
  });
});

describe('export tax by number of people', () => {
  it('takes nothing off income within the allowance', () => {
    const x = exportTaxFor(500, 1, A);
    expect(x.tax).toBe(0);
    expect(x.kept).toBe(500);
  });
  it('taxes only the part above the allowance', () => {
    const x = exportTaxFor(1000, 1, A);
    expect(x.allowance).toBe(A.exportTaxFreePerPerson);
    expect(x.tax).toBeCloseTo((1000 - A.exportTaxFreePerPerson) * A.exportTaxRate, 9);
    expect(x.kept).toBeCloseTo(1000 - x.tax, 9);
  });
  it('doubles the allowance for two people and keeps more', () => {
    const one = exportTaxFor(1500, 1, A), two = exportTaxFor(1500, 2, A);
    expect(two.allowance).toBe(2 * one.allowance);
    expect(two.kept - one.kept).toBeCloseTo(A.exportTaxFreePerPerson * A.exportTaxRate, 9);
  });
  it('taxes more at the higher rate and lists both rates', () => {
    const hi = exportTaxFor(2000, 1, { ...A, exportTaxRate: 0.48 });
    expect(hi.tax).toBeGreaterThan(exportTaxFor(2000, 1, A).tax);
    expect(EXPORT_TAX_RATES.map((r) => r.rate)).toEqual([0.28, 0.48]);
  });
  it('agrees with the tax in a simulation', () => {
    const r = simulate(usage(), home(), A, { panels: 12, batteryKwh: 0 });
    expect(exportTaxFor(r.exportIncome, home().taxpayers, A).tax).toBeCloseTo(r.exportTax, 9);
  });
});

describe('payback range', () => {
  const r = simulate(usage(), home(), A, { panels: 10, batteryKwh: 0 });
  const [cautious, expected, optimistic] = paybackRange(r, A);
  it('orders the cases from slowest to quickest payback', () => {
    expect(cautious.payback).toBeGreaterThan(expected.payback);
    expect(expected.payback).toBeGreaterThan(optimistic.payback);
  });
  it('orders the 25 year gain the other way', () => {
    expect(cautious.netGain).toBeLessThan(expected.netGain);
    expect(expected.netGain).toBeLessThan(optimistic.netGain);
  });
  it('makes the expected case match the headline numbers', () => {
    expect(expected.payback).toBeCloseTo(r.paybackYears, 9);
    expect(expected.netGain).toBeCloseTo(r.netGain, 6);
    expect(expected.netCost).toBeCloseTo(r.netCost, 6);
  });
  it('uses the dearer and cheaper installed prices', () => {
    expect(cautious.netCost).toBeGreaterThan(optimistic.netCost);
  });
});

describe('loan repayment', () => {
  it('matches a known example', () => {
    const l = loanPayment(10000, 6, 5);
    expect(l.monthly).toBeCloseTo(193.33, 1);
    expect(l.total).toBeCloseTo(l.monthly * 60, 9);
  });
  it('splits evenly at zero interest', () => {
    const l = loanPayment(6000, 0, 5);
    expect(l.monthly).toBeCloseTo(100, 9);
    expect(l.interest).toBeCloseTo(0, 9);
  });
  it('costs more interest over a longer term', () => {
    expect(loanPayment(10000, 6, 10).interest).toBeGreaterThan(loanPayment(10000, 6, 5).interest);
    expect(loanPayment(10000, 6, 10).monthly).toBeLessThan(loanPayment(10000, 6, 5).monthly);
  });
  it('is zero for nothing borrowed', () => expect(loanPayment(0, 6, 5).monthly).toBe(0));
});

describe('selling extra power', () => {
  const big = () => ({ ...home(), roofAreaM2: 120 });
  it('keeps panels to the connection limit by default and lifts it with a plan to export', () => {
    expect(maxPanels(big(), A)).toBe(connectionLimitPanels(big(), A));
    expect(maxPanels(big(), { ...A, exportExtra: true })).toBeGreaterThan(connectionLimitPanels(big(), A));
    expect(maxPanels(big(), { ...A, exportExtra: true })).toBeLessThanOrEqual(30);
  });
  it('never goes past what the roof fits', () => {
    const small = { ...home(), roofAreaM2: 22 };
    expect(maxPanels(small, { ...A, exportExtra: true })).toBeLessThanOrEqual(roofFitPanels(small, A));
  });
  it('loses output above the inverter limit', () => {
    const lo = simulate(usage(), big(), A, { panels: 13, batteryKwh: 0 });
    const hi = simulate(usage(), big(), A, { panels: 26, batteryKwh: 0 });
    expect(hi.generationKwh).toBeGreaterThan(lo.generationKwh);
    expect(hi.generationKwh).toBeLessThan(lo.generationKwh * 2);
    expect(inverterLimitKw(big())).toBe(6);
  });
  it('lets the recommendation use more panels when exporting, if it pays', () => {
    const a = { ...A, exportExtra: true };
    const base = pickStrategies(buildGrid(usage(), big(), A))[1];
    const more = pickStrategies(buildGrid(usage(), big(), a), true)[1];
    expect(more.panels).toBeGreaterThanOrEqual(base.panels);
  });
});

describe('charging the battery from the grid at the night rate', () => {
  const run = (a: Partial<typeof A>, kwh = 10, panels = 8) => simulate(usage(), home(), { ...A, ...a }, { panels, batteryKwh: kwh });
  it('adds benefit on a day and night tariff', () => {
    const off = run({ gridCharge: false }), on = run({ gridCharge: true });
    expect(on.annualBenefit).toBeGreaterThan(off.annualBenefit);
    expect(on.importKwh).toBeGreaterThan(off.importKwh);
  });
  it('does not claim grid energy as solar self-use', () => {
    const on = run({ gridCharge: true });
    expect(on.selfUseKwh).toBeLessThanOrEqual(on.generationKwh + 1e-6);
    expect(on.selfSufficiency).toBeLessThanOrEqual(1);
  });
  it('does nothing without a battery, on a flat tariff, or when night power is not cheap enough', () => {
    expect(run({ gridCharge: true }, 0).annualBenefit).toBeCloseTo(run({ gridCharge: false }, 0).annualBenefit, 9);
    expect(run({ gridCharge: true, tariff: 'flat' }).annualBenefit).toBeCloseTo(run({ gridCharge: false, tariff: 'flat' }).annualBenefit, 9);
    expect(run({ gridCharge: true, nightRate: 0.33 }).annualBenefit).toBeCloseTo(run({ gridCharge: false, nightRate: 0.33 }).annualBenefit, 9);
  });
  it('helps more when night power is cheaper', () => {
    const gain = (night: number) => run({ gridCharge: true, nightRate: night }).annualBenefit - run({ gridCharge: false, nightRate: night }).annualBenefit;
    expect(gain(0.12)).toBeGreaterThan(gain(0.2));
  });
  it('keeps energy balanced: imports cover the load the panels and battery do not', () => {
    const on = run({ gridCharge: true });
    expect(on.importKwh).toBeGreaterThan(0);
    expect(on.billAfter).toBeGreaterThan(0);
  });
});

describe('roof direction in the calculation', () => {
  it('cuts the output of every panel by the direction factor', () => {
    const s = simulate(usage(), { ...home(), orientation: 'S' }, A, { panels: 8, batteryKwh: 0 });
    const ew = simulate(usage(), { ...home(), orientation: 'E_W' }, A, { panels: 8, batteryKwh: 0 });
    expect(ew.generationKwh / s.generationKwh).toBeCloseTo(0.82, 2);
  });
  it('lowers the yearly benefit for the same panels', () => {
    const s = simulate(usage(), { ...home(), orientation: 'S' }, A, { panels: 8, batteryKwh: 0 });
    const ew = simulate(usage(), { ...home(), orientation: 'E_W' }, A, { panels: 8, batteryKwh: 0 });
    expect(ew.annualBenefit).toBeLessThan(s.annualBenefit);
  });
});

describe('watts per panel', () => {
  it('defaults to 465 W', () => expect(A.panelWatts).toBe(465));
  it('sets the system size, so more watts means fewer panels for the connection limit', () => {
    expect(connectionLimitPanels(home(), assump({ panelWatts: 400 }))).toBeGreaterThan(connectionLimitPanels(home(), assump({ panelWatts: 550 })));
  });
  it('scales output and cost with the rating', () => {
    const lo = simulate(usage(), home(), assump({ panelWatts: 400 }), { panels: 10, batteryKwh: 0 });
    const hi = simulate(usage(), home(), assump({ panelWatts: 500 }), { panels: 10, batteryKwh: 0 });
    expect(hi.kwp).toBeCloseTo(5, 9);
    expect(hi.generationKwh / lo.generationKwh).toBeCloseTo(500 / 400, 2);
    expect(hi.grossCost).toBeGreaterThan(lo.grossCost);
  });
});

describe('where the power comes from', () => {
  const run = (kwh: number, a: Partial<typeof A> = {}) => simulate(usage(), home(), { ...A, ...a }, { panels: 10, batteryKwh: kwh });
  it('adds the bands up to the bill and the imports', () => {
    const r = run(10);
    expect(r.byBand.reduce((t, b) => t + b.afterCost, 0)).toBeCloseTo(r.billAfter, 6);
    expect(r.byBand.reduce((t, b) => t + b.beforeCost, 0)).toBeCloseTo(r.billBefore, 6);
    expect(r.byBand.reduce((t, b) => t + b.afterKwh, 0)).toBeCloseTo(r.importKwh, 6);
    expect(r.byBand.reduce((t, b) => t + b.beforeKwh, 0)).toBeCloseTo(r.baselineImportKwh, 6);
  });
  it('splits all demand between solar, battery and the grid', () => {
    const r = run(10);
    const demand = r.monthlyDemand.reduce((a, b) => a + b, 0);
    expect(r.supply.direct + r.supply.battery + r.supply.gridDay + r.supply.gridNight).toBeCloseTo(demand, 6);
  });
  it('has no battery supply without a battery, and some with one', () => {
    expect(run(0).supply.battery).toBe(0);
    expect(run(10).supply.battery).toBeGreaterThan(0);
  });
  it('uses the battery at night when it can, and still buys power at night', () => {
    const r = run(10);
    expect(r.supply.batteryNight).toBeGreaterThan(0);
    expect(r.supply.batteryNight).toBeLessThanOrEqual(r.supply.battery);
    expect(r.supply.gridNight).toBeGreaterThan(0);
  });
  it('buys more at night with grid charging because the battery fills overnight', () => {
    expect(run(10, { gridCharge: true }).supply.gridNight).toBeGreaterThan(run(10, { gridCharge: false }).supply.gridNight);
  });
  it('lists only the bands the tariff uses', () => {
    expect(run(0, { tariff: 'flat' }).byBand.map((b) => b.band)).toEqual(['flat']);
    expect(run(0, { tariff: 'smart' }).byBand.map((b) => b.band).sort()).toEqual(['day', 'night', 'peak']);
  });
});

describe('rate presets and VAT', () => {
  it('adds 9% VAT by default', () => expect(A.vat).toBe(0.09));
  it('builds below typical from the bill rates less 32%, plus VAT', () => {
    const p = ratePreset('below', 0.09);
    expect(p.dayRate).toBeCloseTo(0.3865 * 0.68 * 1.09, 6);
    expect(p.nightRate).toBeCloseTo(0.2125 * 0.68 * 1.09, 6);
    expect(p.peakRate).toBeCloseTo(0.434 * 0.68 * 1.09, 6);
  });
  it('builds above typical from the list rates plus VAT, with no discount', () => {
    const p = ratePreset('above', 0.09);
    expect(p.dayRate).toBeCloseTo(0.3865 * 1.09, 6);
  });
  it('uses the published typical rates for typical', () => {
    const p = ratePreset('typical', 0.09);
    expect(p.dayRate).toBe(A.dayRate);
    expect(p.nightRate).toBe(A.nightRate);
    expect(p.flatRate).toBe(A.flatRate);
  });
  it('orders below, typical, above for every rate', () => {
    const [b, t, a] = (['below', 'typical', 'above'] as const).map((k) => ratePreset(k, 0.09));
    expect(b.dayRate).toBeLessThan(t.dayRate);
    expect(t.dayRate).toBeLessThan(a.dayRate);
    expect(b.nightRate).toBeLessThan(a.nightRate);
    expect(b.flatRate).toBeLessThan(a.flatRate);
  });
  it('follows a different VAT rate and lists all three presets', () => {
    expect(ratePreset('above', 0.135).dayRate).toBeGreaterThan(ratePreset('above', 0.09).dayRate);
    expect(RATE_PRESETS.map((p) => p.key)).toEqual(['below', 'typical', 'above']);
  });
  it('matches the bill: the discount is 32% of unit charges', () => {
    const units = 102.01 + 29.38 + 16.22;
    expect(47.23 / units).toBeCloseTo(0.32, 2);
  });
  it('lowers the bill and raises payback when rates are lower', () => {
    const lo = simulate(usage(), home(), { ...A, ...ratePreset('below', 0.09) }, { panels: 10, batteryKwh: 0 });
    const hi = simulate(usage(), home(), { ...A, ...ratePreset('above', 0.09) }, { panels: 10, batteryKwh: 0 });
    expect(lo.billBefore).toBeLessThan(hi.billBefore);
    expect(lo.paybackYears).toBeGreaterThan(hi.paybackYears);
  });
});

describe('export rate presets', () => {
  it('has a typical average and a premium rate', () => {
    expect(EXPORT_PRESETS.map((x) => x.key)).toEqual(['typical', 'premium']);
    expect(EXPORT_PRESETS[0].rate).toBe(A.exportRate);
    expect(EXPORT_PRESETS[1].rate).toBeCloseTo(0.31, 9);
    expect(EXPORT_PRESETS[1].rate).toBeGreaterThan(EXPORT_PRESETS[0].rate);
  });
  it('pays more export income at the premium rate, and shortens payback', () => {
    const run = (rate: number) => simulate(usage(), home(), { ...A, exportRate: rate }, { panels: 12, batteryKwh: 0 });
    const typical = run(EXPORT_PRESETS[0].rate), premium = run(EXPORT_PRESETS[1].rate);
    expect(premium.exportIncome).toBeGreaterThan(typical.exportIncome);
    expect(premium.exportKwh).toBeCloseTo(typical.exportKwh, 9);
    expect(premium.paybackYears).toBeLessThan(typical.paybackYears);
  });
});

describe('sizing from goals, not from the roof', () => {
  const rec = (roof: number, goals: Goals, a: Partial<typeof A> = {}, extra: Partial<HomeInputs> = {}) => {
    const h = { ...home(), roofAreaM2: roof, threePhase: true, ...extra };
    return pickStrategies(buildGrid(usage(), h, { ...A, ...a }), !!a.exportExtra, goals)[1];
  };
  it('recommends the same system on a bigger roof when the goals are already met', () => {
    const small = rec(40, DEFAULT_GOALS), big = rec(110, DEFAULT_GOALS);
    expect(big.panels).toBe(small.panels);
    expect(big.batteryKwh).toBe(small.batteryKwh);
  });
  it('meets the coverage goal when it can, with the cheapest system that does', () => {
    const r = rec(110, { cover: 0.6, exportIncome: 0 });
    expect(r.meetsGoals).toBe(true);
    expect(r.selfSufficiency).toBeGreaterThanOrEqual(0.6);
  });
  it('asks for a bigger or costlier system when more cover is wanted', () => {
    const low = rec(110, { cover: 0.3, exportIncome: 0 }), high = rec(110, { cover: 0.7, exportIncome: 0 });
    expect(high.netCost).toBeGreaterThan(low.netCost);
  });
  it('pairs panels with a battery to reach high coverage', () => {
    expect(rec(110, { cover: 0.7, exportIncome: 0 }).batteryKwh).toBeGreaterThan(0);
  });
  it('adds panels to reach an export goal', () => {
    const none = rec(110, { cover: 0.4, exportIncome: 0 }, { exportExtra: true });
    const goal = rec(110, { cover: 0.4, exportIncome: 600 }, { exportExtra: true });
    expect(goal.exportIncome).toBeGreaterThanOrEqual(600);
    expect(goal.panels).toBeGreaterThanOrEqual(none.panels);
  });
  it('says so and gets as close as it can when the goals cannot be met', () => {
    const r = rec(12, { cover: 0.9, exportIncome: 2000 }, {}, { threePhase: false });
    expect(r.meetsGoals).toBe(false);
    const all = buildGrid(usage(), { ...home(), roofAreaM2: 12, threePhase: false }, A);
    expect(r.selfSufficiency).toBeGreaterThan(Math.min(...all.map((x) => x.selfSufficiency)));
  });
  it('still returns the three strategies with the right size second', () => {
    const s = pickStrategies(buildGrid(usage(), home(), A));
    expect(s.map((x) => x.key)).toEqual(['lean', 'best', 'bold']);
    expect(s[1].label).toBe('Right size');
  });
});
