import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PlanStore } from '../core/store';
import { Assumptions, EXPORT_PRESETS, RATE_PRESETS, RatePresetKey, ratePreset, inverterLimitKw, siteOrientationFactor, shadingFactor, roofTypeInfo, BATTERY_PRODUCTS, BATTERY_SIZES, loanPayment, paybackRange, EXPORT_TAX_RATES, exportTaxFor, PRICES, grantEligibility, seaiGrantFor, BATTERY_GUIDE, BATTERY_OPTIONS, BATTERY_TIERS, BatteryTier, batteryPrice, HOUSE_TYPES, HouseType, OBSTACLES, ObstacleKey, ROOF_TYPES, RoofType, Storeys, Orientation, Occupancy, Shading, Scenario, Tariff, bandsOfDay, simulate, solarDay } from '../core/engine';
import { HdfError, parseHdf } from '../core/hdf';
import { inferHousehold } from '../core/infer';
import { CashChart, DayChart, Legend, MonthChart } from '../ui/charts';
import { EstimateNote } from '../ui/estimate-note';
import { INSTALLER_CHECKLIST } from '../core/site';

const STEPS = ['Usage', 'Home', 'Strategy', 'Cost'];
export const STEP_KEYS = ['usage', 'home', 'strategy', 'cost'];

@Component({
  selector: 'page-plan',
  imports: [RouterLink, DecimalPipe, DayChart, MonthChart, CashChart, EstimateNote],
  templateUrl: './plan.html',
  styleUrl: './plan.scss',
})
export class PlanPage {
  readonly s = inject(PlanStore);
  readonly steps = STEPS;
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  /** The step lives in the URL (?step=cost), so browser Back and links to a step work. */
  readonly step = signal(0);
  readonly batterySizes = BATTERY_SIZES;
  readonly products = BATTERY_PRODUCTS;
  readonly lastBattery = signal(10);
  readonly hasBattery = computed(() => this.cfg().batteryKwh > 0);
  /** The figures behind the "How we worked this out" section, using the user's own numbers. */
  readonly walk = computed(() => {
    const a = this.s.assumptions(), h = this.s.home(), r = this.r(), u = this.s.usage();
    const ori = siteOrientationFactor(h), shade = shadingFactor(h.shading);
    const withShade = r.kwp * a.yieldPerKwp * shade;
    const raw = withShade * ori;
    const oriName = h.roofType === 'flat' ? 'a flat roof' : ({ S: 'south', SE_SW: 'south-east or south-west', E_W: 'east or west', N: 'north' } as const)[h.orientation];
    const tariff = a.tariff === 'flat' ? `a flat ${this.cents('flatRate')}c` : a.tariff === 'dayNight' ? `day ${this.cents('dayRate')}c and night ${this.cents('nightRate')}c` : `day ${this.cents('dayRate')}c, night ${this.cents('nightRate')}c and peak ${this.cents('peakRate')}c`;
    const source = u.source === 'estimate' ? 'your bill or yearly figure, shaped into a typical day for your household' : 'your meter file, using your own median day';
    return {
      ori, shade, withShade, raw, oriName, tariff, source,
      yield: a.yieldPerKwp, watts: a.panelWatts, june: r.monthlyGen[5], dec: r.monthlyGen[11],
      clipped: Math.max(0, raw - r.generationKwh), limit: inverterLimitKw(h),
      usable: Math.round(r.batteryKwh * 0.9 * 10) / 10, eff: Math.round(a.batteryEfficiency * 100),
      sunny: this.s.dayStats().sunnyHoursPct,
    };
  });
  readonly bandNames: Record<string, string> = { flat: 'All day', night: 'Night (11pm to 8am)', day: 'Day', peak: 'Peak (5pm to 7pm)' };
  /** Yearly electricity by source, as shares of what the home uses. */
  readonly sources = computed(() => {
    const r = this.r();
    const demand = r.monthlyDemand.reduce((a, b) => a + b, 0) || 1;
    const sp = r.supply;
    const rows = [
      { label: 'Solar, straight to the house', kwh: sp.direct },
      ...(r.batteryKwh ? [{ label: 'Battery, in the evening', kwh: sp.battery - sp.batteryNight }, { label: 'Battery, overnight', kwh: sp.batteryNight }] : []),
      { label: 'Bought from the grid, daytime and evening', kwh: sp.gridDay },
      { label: 'Bought from the grid, overnight', kwh: sp.gridNight },
    ];
    return { demand, rows: rows.map((x) => ({ ...x, share: x.kwh / demand })) };
  });
  inverterKw() { return inverterLimitKw(this.s.home()); }
  setCover(e: Event) { this.s.chosen.set(null); this.s.goals.update((g) => ({ ...g, cover: this.num(e) / 100 })); }
  setExportGoal(v: number) { this.s.chosen.set(null); this.s.goals.update((g) => ({ ...g, exportIncome: v })); }
  readonly exportGoals = [0, 300, 600, 1000];
  setExportExtra(on: boolean) { this.s.chosen.set(null); this.s.patchAssumptions({ exportExtra: on }); }
  setWatts(e: Event) {
    const v = this.num(e);
    if (v >= 250 && v <= 700) this.s.patchAssumptions({ panelWatts: Math.round(v) });
  }
  setGridCharge(on: boolean) { this.s.patchAssumptions({ gridCharge: on }); }
  gridChargeHint(): string {
    const a = this.s.assumptions();
    const night = Math.round(a.nightRate * 1000) / 10, day = Math.round(a.dayRate * 1000) / 10;
    const worth = a.nightRate / a.batteryEfficiency < a.dayRate;
    if (!worth) return `At ${night}c night and ${day}c day, charging from the grid does not beat the day rate after losses, so it is switched off in the numbers.`;
    return a.gridCharge
      ? `The battery tops up overnight (11pm to 8am, ${night}c) only as far as the next day needs after your solar, then supplies the ${day}c hours. Needs a smart meter and a day and night or smart tariff.`
      : `Turn this on to top the battery up overnight at ${night}c instead of buying at ${day}c later. It helps most in winter, and with an EV or heat pump.`;
  }
  setHasBattery(on: boolean) { this.setBattery(on ? this.lastBattery() : 0); }
  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((q) => {
      const i = STEP_KEYS.indexOf(q.get('step') ?? 'usage');
      this.step.set(i < 0 ? 0 : i);
    });
  }
  readonly fileError = signal('');
  readonly fileName = signal('');
  readonly showAssump = signal(false);
  readonly checklist = INSTALLER_CHECKLIST;
  readonly priceDate = new Date(PRICES.reviewedOn + 'T00:00:00Z').toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  readonly today = new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
  readonly batteryOptions = BATTERY_OPTIONS;
  readonly tiers = BATTERY_TIERS;
  readonly guide = BATTERY_GUIDE;
  price(t: BatteryTier, kwh: number) { return batteryPrice(t, kwh); }
  setTier(t: BatteryTier) { this.s.patchAssumptions({ batteryTier: t }); }
  readonly obstacles = OBSTACLES;
  readonly houseTypes = HOUSE_TYPES;
  readonly roofTypes = ROOF_TYPES;
  setHouse(t: HouseType) { this.s.setHouseType(t); }
  setRoofType(t: RoofType) { this.s.patchHome({ roofType: t }); }
  setStoreys(n: Storeys) { this.s.patchHome({ storeys: n }); }
  count(k: ObstacleKey) { return this.s.home().obstacles[k] ?? 0; }
  bump(k: ObstacleKey, d: number, max: number) { this.s.setObstacle(k, Math.min(max, this.count(k) + d)); }

  readonly oriHints: Record<Orientation, string> = {
    S: 'Best output. The baseline for the calculation.',
    SE_SW: 'About 5% less than south. Applied to every panel in the calculation.',
    E_W: 'About 18% less than south, applied to every panel in the calculation, but spread across the day.',
    N: 'Poor output and rarely advised.',
  };
  readonly occHints: Record<Occupancy, string> = {
    away: 'Home from about 5pm, so most use is evening and night.',
    mixed: 'A mix of daytime and evening use.',
    home: 'More use while the sun is up, which suits solar.',
  };
  readonly houseHint = computed(() => HOUSE_TYPES.find((t) => t.key === this.s.home().houseType)?.hint ?? '');
  readonly roofHint = computed(() => {
    const h = this.s.home();
    const base = ROOF_TYPES.find((t) => t.key === h.roofType)?.hint ?? '';
    return h.roofType === 'flat' ? base + '. About 60% of the area counts as usable because rows need space between them.' : base + '.';
  });
  readonly obstacleSummary = computed(() => {
    const o = this.s.home().obstacles;
    const parts = OBSTACLES.filter((x) => o[x.key] > 0).map((x) => `${o[x.key]} ${x.label.toLowerCase()}`);
    return parts.length ? parts.join(', ') : 'Nothing marked. Add chimneys, skylights and more';
  });
  readonly ratesSummary = computed(() => {
    const a = this.s.assumptions();
    const c = (n: number) => this.round1(n * 100) + 'c';
    const plan = a.tariff === 'flat' ? `One rate ${c(a.flatRate)}` : a.tariff === 'dayNight' ? `Day ${c(a.dayRate)}, night ${c(a.nightRate)}` : `Day ${c(a.dayRate)}, night ${c(a.nightRate)}, peak ${c(a.peakRate)}`;
    return `${plan} incl. VAT, export ${c(a.exportRate)}`;
  });
  readonly tierLine = computed(() => {
    const t = BATTERY_TIERS.find((x) => x.key === this.s.assumptions().batteryTier)!;
    const kwh = this.cfg().batteryKwh || 10;
    const p = batteryPrice(t.key, kwh);
    return `${t.blurb} ${kwh} kWh costs about ${this.eur(p.low)} to ${this.eur(p.high)} installed. Examples: ${t.examples.slice(0, 2).join(', ')}.`;
  });
  readonly links = PRICES.links;
  readonly grantsCfg = PRICES.grants;
  readonly batteryOpened = new Date(PRICES.grants.seaiBatteryOpened + 'T00:00:00Z').toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  readonly thisYear = new Date().getFullYear();
  readonly elig = computed(() => grantEligibility(this.s.home()));
  setYear(e: Event) {
    const raw = (e.target as HTMLInputElement).value.trim();
    this.s.patchHome({ yearOccupied: raw === '' ? null : Math.round(+raw) });
  }
  readonly yearHint = computed(() => {
    const y = this.s.home().yearOccupied, e = this.elig(), cut = PRICES.grants.seaiSolarBuiltBefore;
    if (y == null || !e.yearValid) return `SEAI's solar and battery grants need a home built and occupied before ${cut}. Enter the year to check. Until then we assume you qualify.`;
    return e.solar === 'eligible'
      ? `Occupied before ${cut}, so the home meets SEAI's age rule for the solar and battery grants.`
      : `Homes first occupied in ${cut} or later are not eligible for SEAI's solar or battery grants, so we have taken both off your costs.`;
  });
  /** What each grant means for this plan, in plain words. */
  readonly grantRows = computed(() => {
    const e = this.elig(), a = this.s.assumptions(), r = this.r(), g = PRICES.grants, cut = g.seaiSolarBuiltBefore;
    const unknown = e.solar === 'unknown';
    const solar = !a.seaiGrant ? 'You switched this grant off in the assumptions.'
      : e.solar === 'ineligible' ? `Not eligible: first occupied in ${this.s.home().yearOccupied}, after the ${cut} cut-off.`
      : unknown ? 'Assumed eligible. Enter the year your home was first occupied on the Home step to check.'
      : 'Eligible on age. Other conditions below also apply.';
    const hasBattery = this.cfg().batteryKwh > 0;
    const battery = e.battery === 'ineligible' ? `Not eligible: first occupied in ${this.s.home().yearOccupied}, after the ${cut} cut-off.`
      : !hasBattery ? `No battery in this plan. A battery of ${g.seaiBatteryMinKwh} kWh or more would qualify.`
      : !a.seaiBatteryGrant ? 'You switched this grant off in the assumptions.'
      : unknown ? 'Assumed eligible. Enter the year your home was first occupied on the Home step to check.'
      : 'Eligible on age. Other conditions below also apply.';
    return {
      solar: { text: solar, amount: r.grant ? this.eur(r.grant) : (e.solar === 'ineligible' || !a.seaiGrant ? 'Not applied' : this.eur(seaiGrantFor(r.kwp))) },
      battery: { text: battery, amount: r.batteryGrant ? this.eur(r.batteryGrant) : 'Not applied' },
    };
  });
  setPayers(n: 1 | 2) { this.s.patchHome({ taxpayers: n }); }
  readonly payersHint = computed(() => {
    const per = this.s.assumptions().exportTaxFreePerPerson, n = this.s.home().taxpayers;
    return `Export income is tax-free up to ${this.eur(per)} for each person named on the bill, so ${this.eur(per * n)} for ${n === 1 ? 'one person' : 'two'}. Above that it is taxed.`;
  });
  /** What the meter data suggests, in plain words, so the user can see what we filled in and why. */
  readonly notes = computed<{ text: string; warn: boolean }[]>(() => {
    const n = this.s.noticed(), out: { text: string; warn: boolean }[] = [];
    if (n.occupancy) out.push({ text: `${n.occupancy.why} We use your real readings, so you do not need to answer who is home.`, warn: false });
    if (n.nightLoad) out.push({ text: n.nightLoad.why + ' That is typical of an electric car or night-time heating, so we will ask on the Home step whether to count a new one.', warn: false });
    if (n.winterHeavy) out.push({ text: n.winterHeavy.why + ' That often means electric heating or a heat pump.', warn: false });
    if (n.existingSolar) out.push({ text: 'Your file has export readings, so you may already have solar. This planner assumes you have none, so savings will look larger than they are.', warn: true });
    return out;
  });
  readonly isMedian = computed(() => !!this.s.usage().median);
  /** True for the daily night/day/peak file: band totals are measured, hours inside a band are estimated. */
  readonly bandsOnly = computed(() => this.s.usage().source === 'smart-meter-daily');
  readonly avgDaily = computed(() => this.s.usage().annualKwh / 365);
  band(b: 'night' | 'day' | 'peak' | 'flat') { return this.s.bands().find((x) => x.band === b); }
  readonly medianDaily = computed(() => this.s.usage().medianDaily ?? this.s.usage().annualKwh / 365);
  readonly chartBands = computed(() => bandsOfDay(this.s.assumptions().tariff));
  readonly legend = computed<Legend[]>(() => this.s.bands().map((b) => ({ cls: b.band, text: `${b.label}, ${b.window}: ${this.round1(b.rate * 100)}c` })));
  readonly presets = RATE_PRESETS;
  readonly exportPresets = EXPORT_PRESETS;
  exportPresetOn(rate: number): boolean { return Math.abs(this.s.assumptions().exportRate - rate) < 0.0005; }
  /** Whether the rate boxes show prices before VAT (as bills do) or including it. We always calculate with VAT included. */
  readonly vatMode = signal<'ex' | 'inc'>('ex');
  private vatFactor() { return this.vatMode() === 'ex' ? 1 + this.s.assumptions().vat : 1; }
  /** c/kWh for a rate in the mode shown. */
  shown(k: 'flatRate' | 'dayRate' | 'nightRate' | 'peakRate'): number { return Math.round((this.s.assumptions()[k] / this.vatFactor()) * 10000) / 100; }
  setShown(k: 'flatRate' | 'dayRate' | 'nightRate' | 'peakRate', e: Event) { const v = this.num(e); if (v >= 0) this.setAssump(k, (v / 100) * this.vatFactor()); }
  /** Standing charge per month in the mode shown. */
  standing(): number { return Math.round((this.s.assumptions().standingChargeMonthly / this.vatFactor()) * 100) / 100; }
  setStanding(e: Event) { const v = this.num(e); if (v >= 0) this.setAssump('standingChargeMonthly', v * this.vatFactor()); }
  vatPct() { return Math.round(this.s.assumptions().vat * 1000) / 10; }
  setVat(e: Event) { const v = this.num(e); if (v >= 0 && v <= 30) this.setAssump('vat', v / 100); }
  applyPreset(k: RatePresetKey) { this.s.patchAssumptions(ratePreset(k, this.s.assumptions().vat)); }
  presetOn(k: RatePresetKey): boolean {
    const a = this.s.assumptions(), p = ratePreset(k, a.vat);
    const near = (x: number, y: number) => Math.abs(x - y) < 0.0005;
    return near(a.dayRate, p.dayRate) && near(a.nightRate, p.nightRate) && near(a.peakRate, p.peakRate) && near(a.flatRate, p.flatRate);
  }
  /** What a preset's rates look like in the mode shown, for the button hint. */
  presetLine(k: RatePresetKey): string {
    const a = this.s.assumptions(), p = ratePreset(k, a.vat), f = this.vatFactor();
    const c = (n: number) => (Math.round((n / f) * 10000) / 100) + 'c';
    return a.tariff === 'flat' ? c(p.flatRate) : a.tariff === 'dayNight' ? `${c(p.dayRate)} day, ${c(p.nightRate)} night` : `${c(p.dayRate)} day, ${c(p.nightRate)} night, ${c(p.peakRate)} peak`;
  }
  readonly tariffHint = computed(() => ({
    flat: 'One price for every unit, at any time of day.',
    dayNight: 'A cheaper rate from 11pm to 8am and a higher rate for the rest of the day.',
    smart: 'The time-of-use plan for smart meters. Night is 11pm to 8am, peak is 5pm to 7pm, and day is everything else. The same times apply whichever supplier you use.',
  }[this.s.assumptions().tariff]));

  /** Plain-English findings drawn from the numbers above. */
  readonly insights = computed<string[]>(() => {
    const st = this.s.dayStats(), bands = this.s.bands(), shape = this.s.dayShape();
    const tariff = this.s.assumptions().tariff;
    const out: string[] = [];
    if (this.bandsOnly()) {
      const n = bands.find((b) => b.band === 'night'), d = bands.find((b) => b.band === 'day'), p = bands.find((b) => b.band === 'peak');
      if (n && d) {
        out.push(`${this.pc(n.usePct)} of your electricity is used at night (11pm to 8am), ${this.pc(d.usePct)} in the day${p ? ' and ' + this.pc(p.usePct) + ' at peak' : ''}. These shares come straight from your meter.`);
        if (n.usePct >= 0.4) out.push(`Night is your biggest block of use. Panels cannot supply it directly. A cheap night rate suits that pattern, and solar pays off most if you can move some use into the day, for example by running appliances or charging an electric car while the sun is up, or by adding a battery.`);
        else out.push(`Most of your use is while the sun is up or at the edges of the day, which suits solar. A battery would cover the evening and night share.`);
      }
      if (p) out.push(`Peak (5pm to 7pm) is ${this.pc(p.usePct)} of your use but ${this.pc(p.costPct)} of your electricity cost.`);
      if (n && n.costPct < n.usePct) out.push(`Night is ${this.pc(n.usePct)} of your use but ${this.pc(n.costPct)} of the cost, because the night rate is lower.`);
      return out;
    }
    out.push(`Your busiest hour is ${this.hourName(st.busiestHour)} to ${this.hourName(st.busiestHour + 1)}, using about ${st.busiestKwh.toFixed(2)} kWh${this.isMedian() ? ' on a typical day' : ''}.`);
    out.push(`Only ${this.pc(st.sunnyHoursPct)} of your use falls between 9am and 5pm, when panels produce the most. The other ${this.pc(1 - st.sunnyHoursPct)} is when there is little or no sun. That gap is what a battery, or moving use into the daytime, can close.`);
    out.push(`Your home draws at least ${Math.round(st.baseloadWatts)} W all the time (about ${(st.baseloadWatts * 24 / 1000).toFixed(1)} kWh a day) from the fridge, router and standby devices. Solar cannot cover this overnight without a battery.`);
    const night = bands.find((b) => b.band === 'night'), peak = bands.find((b) => b.band === 'peak');
    if (peak && night) {
      out.push(`Peak (5pm to 7pm) is ${this.pc(peak.usePct)} of your use but ${this.pc(peak.costPct)} of your electricity cost. Night is ${this.pc(night.usePct)} of your use and ${this.pc(night.costPct)} of the cost.`);
    } else if (night) {
      out.push(`Night (11pm to 8am) is ${this.pc(night.usePct)} of your use but only ${this.pc(night.costPct)} of the cost, because the night rate is lower.`);
    }
    if (tariff !== 'smart') {
      const total = shape.reduce((a, b) => a + b, 0) || 1;
      out.push(`On a smart time-of-use plan, 5pm to 7pm costs more. You use ${this.pc((shape[17] + shape[18]) / total)} of your power then. Choose "Smart" above to see the effect.`);
    }
    return out;
  });
  hourName(h: number): string { h = ((h % 24) + 24) % 24; return h === 0 ? '12am' : h < 12 ? h + 'am' : h === 12 ? '12pm' : h - 12 + 'pm'; }
  round1(n: number): number { return Math.round(n * 10) / 10; }
  cents(k: 'flatRate' | 'dayRate' | 'nightRate' | 'peakRate' | 'exportRate'): number { return this.round1(this.s.assumptions()[k] * 100); }
  setCents(k: 'flatRate' | 'dayRate' | 'nightRate' | 'peakRate' | 'exportRate', e: Event) { const v = this.num(e); if (v >= 0) this.setAssump(k, v / 100); }
  setTariff(t: Tariff) { this.s.patchAssumptions({ tariff: t }); }
  readonly r = this.s.result;
  readonly cfg = this.s.config;
  readonly solarJune = computed(() => solarDay(this.s.home(), this.s.assumptions(), this.cfg().panels, 5));
  readonly juneUsage = computed(() => this.s.usage().profile[5]);

  /** Compare the same panels with and without battery to answer "do I need one?" */
  readonly batteryVerdict = computed(() => {
    const p = this.cfg().panels;
    const a = this.s.assumptions(), h = this.s.home(), u = this.s.usage();
    const none = simulate(u, h, a, { panels: p, batteryKwh: 0 });
    const withB = simulate(u, h, a, { panels: p, batteryKwh: this.cfg().batteryKwh || 5 });
    const extraCost = withB.netCost - none.netCost;
    const extraBenefit = withB.annualBenefit - none.annualBenefit;
    const years = extraBenefit > 0 ? extraCost / extraBenefit : Infinity;
    const kwh = this.cfg().batteryKwh || 5;
    let text: string;
    if (years <= 10) text = `A ${kwh} kWh battery adds about €${Math.round(extraBenefit)} a year and pays back its extra cost in roughly ${years.toFixed(0)} years. It looks worthwhile for you.`;
    else if (isFinite(years) && years <= 16) text = `A ${kwh} kWh battery would add about €${Math.round(extraBenefit)} a year but takes around ${years.toFixed(0)} years to repay its extra cost, close to battery lifespan. Optional, not essential.`;
    else text = `With your usage pattern a battery would add only about €${Math.round(Math.max(0, extraBenefit))} a year. Solar panels alone are the better first step; you can add a battery later.`;
    return { text, years, extraCost: Math.round(extraCost), extraBenefit: Math.round(extraBenefit) };
  });

  /** The chosen panels with no battery and with each common battery size, so the cost of adding storage is plain to see. */
  readonly compare = computed(() => {
    const a = this.s.assumptions(), h = this.s.home(), u = this.s.usage();
    const panels = this.r().panels;
    const base = simulate(u, h, a, { panels, batteryKwh: 0 });
    return [0, ...BATTERY_SIZES].map((kwh) => {
      const x = kwh === 0 ? base : simulate(u, h, a, { panels, batteryKwh: kwh });
      return { kwh, r: x, extraBenefit: x.annualBenefit - base.annualBenefit, extraGain: x.netGain - base.netGain, current: x.batteryKwh === this.r().batteryKwh };
    });
  });

  go(n: number) { const i = Math.max(0, Math.min(3, n)); this.router.navigate([], { relativeTo: this.route, queryParams: { step: STEP_KEYS[i] }, queryParamsHandling: 'merge' }); scrollTo({ top: 0, behavior: 'instant' }); }

  setOcc(v: Occupancy) { this.s.occupancyTouched.set(true); this.s.patchHome({ occupancy: v }); }
  setOri(v: Orientation) { this.s.patchHome({ orientation: v }); }
  setShade(v: Shading) { this.s.patchHome({ shading: v }); }
  num(e: Event): number { return +(e.target as HTMLInputElement).value; }
  setAssump<K extends keyof Assumptions>(k: K, v: Assumptions[K]) { this.s.patchAssumptions({ [k]: v } as Partial<Assumptions>); }
  pct(e: Event): number { return +(e.target as HTMLInputElement).value / 100; }

  async onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.fileError.set('');
    try {
      const text = await f.text(); // read locally, never uploaded
      const usage = parseHdf(text);
      this.s.meterUsage.set(usage);
      // pre-fill from what the readings show, unless the user has already answered it themselves
      const seen = inferHousehold(usage);
      if (seen.occupancy && !this.s.occupancyTouched()) this.s.patchHome({ occupancy: seen.occupancy.value });
      if (usage.bands) this.s.patchAssumptions({ tariff: usage.bands.hasPeak ? 'smart' : 'dayNight' }); // the file's own rate bands
      this.s.mode.set('meter');
      this.fileName.set(f.name);
      this.s.chosen.set(null);
    } catch (err) {
      this.s.meterUsage.set(null);
      this.fileName.set('');
      this.fileError.set(err instanceof HdfError ? err.message : 'We could not read that file.');
    }
  }
  clearFile() { this.s.meterUsage.set(null); this.fileName.set(''); if (this.s.mode() === 'meter') this.s.mode.set('annual'); }
  setMode(m: 'meter' | 'annual' | 'bill') { this.s.mode.set(m); this.s.chosen.set(null); }
  setAnnual(e: Event) { this.s.annualKwh.set(Math.max(500, this.num(e) || 0)); this.s.chosen.set(null); }
  setBill(e: Event) { this.s.monthlyBill.set(Math.max(40, this.num(e) || 0)); this.s.chosen.set(null); }
  setRoof(e: Event) { this.s.roofTouched.set(true); this.s.patchHome({ roofAreaM2: this.num(e) }); }
  setRoofExact(e: Event) { const v = this.num(e); if (v >= 5) { this.s.roofTouched.set(true); this.s.patchHome({ roofAreaM2: Math.min(150, v) }); } }

  pickStrategy(x: Scenario) { this.s.pick({ panels: x.panels, batteryKwh: x.batteryKwh }); }
  isPicked(x: Scenario) { return x.panels === this.cfg().panels && x.batteryKwh === this.cfg().batteryKwh; }
  setPanels(e: Event) { this.s.pick({ ...this.cfg(), panels: this.num(e) }); }
  setBattery(b: number) { if (b > 0) this.lastBattery.set(b); this.s.pick({ ...this.cfg(), batteryKwh: b }); }

  print() {
    // closed disclosures would be left out of the PDF, so open them for printing and restore afterwards
    const all = [...document.querySelectorAll('details')] as HTMLDetailsElement[];
    const was = all.map((d) => d.open);
    all.forEach((d) => (d.open = true));
    addEventListener('afterprint', () => all.forEach((d, i) => (d.open = was[i])), { once: true });
    window.print();
  }
  eur(n: number): string { return '€' + Math.round(n).toLocaleString('en-IE'); }
  max0(n: number): number { return Math.max(0, n); }
  eur0(n: number): string { return this.eur(Math.round(n / 50) * 50); }
  readonly taxRates = EXPORT_TAX_RATES;
  /** Export income and tax with one person and with two on the bill, for the plan the user has chosen. */
  readonly exportView = computed(() => {
    const income = this.r().exportIncome;
    return [1, 2].map((n) => exportTaxFor(income, n, this.s.assumptions()));
  });
  readonly range = computed(() => paybackRange(this.r(), this.s.assumptions()));
  readonly loanYears = signal(7);
  readonly loanRate = signal(7);
  readonly loanTerms = [5, 7, 10];
  readonly loan = computed(() => {
    const l = loanPayment(this.r().netCost, this.loanRate(), this.loanYears());
    const monthlyBenefit = this.r().annualBenefit / 12;
    return { ...l, monthlyBenefit, net: monthlyBenefit - l.monthly };
  });
  setLoanRate(e: Event) { const v = this.num(e); if (v >= 0 && v <= 30) this.loanRate.set(v); }
  abs(n: number) { return Math.abs(n); }
  payback(y: number): string { return isFinite(y) && y <= 25 ? y.toFixed(1) + ' years' : 'Over 25 years'; }
  pc(n: number): string { return Math.round(n * 100) + '%'; }
}
