import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PlanStore } from '../core/store';
import { Assumptions, PRICES, BATTERY_GUIDE, BATTERY_OPTIONS, BATTERY_TIERS, BatteryTier, batteryPrice, HOUSE_TYPES, HouseType, OBSTACLES, ObstacleKey, ROOF_TYPES, RoofType, Storeys, Orientation, Occupancy, Shading, Scenario, Tariff, bandsOfDay, simulate, solarDay } from '../core/engine';
import { HdfError, parseHdf } from '../core/hdf';
import { CashChart, DayChart, Legend, MonthChart } from '../ui/charts';
import { EstimateNote } from '../ui/estimate-note';
import { INSTALLER_CHECKLIST } from '../core/site';

const STEPS = ['Home', 'Usage', 'Strategy', 'Cost'];

@Component({
  selector: 'page-plan',
  imports: [RouterLink, DecimalPipe, DayChart, MonthChart, CashChart, EstimateNote],
  templateUrl: './plan.html',
  styleUrl: './plan.scss',
})
export class PlanPage {
  readonly s = inject(PlanStore);
  readonly steps = STEPS;
  readonly step = signal(0);
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
    S: 'Best output.',
    SE_SW: 'About 5% less than south.',
    E_W: 'About 18% less, but spread across the day.',
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
    return `${plan}, export ${c(a.exportRate)}`;
  });
  readonly tierLine = computed(() => {
    const t = BATTERY_TIERS.find((x) => x.key === this.s.assumptions().batteryTier)!;
    const kwh = this.cfg().batteryKwh || 10;
    const p = batteryPrice(t.key, kwh);
    return `${t.blurb} ${kwh} kWh costs about ${this.eur(p.low)} to ${this.eur(p.high)} installed. Examples: ${t.examples.slice(0, 2).join(', ')}.`;
  });
  readonly isMedian = computed(() => !!this.s.usage().median);
  /** True for the daily night/day/peak file: band totals are measured, hours inside a band are estimated. */
  readonly bandsOnly = computed(() => this.s.usage().source === 'smart-meter-daily');
  readonly avgDaily = computed(() => this.s.usage().annualKwh / 365);
  band(b: 'night' | 'day' | 'peak' | 'flat') { return this.s.bands().find((x) => x.band === b); }
  readonly medianDaily = computed(() => this.s.usage().medianDaily ?? this.s.usage().annualKwh / 365);
  readonly chartBands = computed(() => bandsOfDay(this.s.assumptions().tariff));
  readonly legend = computed<Legend[]>(() => this.s.bands().map((b) => ({ cls: b.band, text: `${b.label}, ${b.window}: ${this.round1(b.rate * 100)}c` })));
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

  go(n: number) { this.step.set(Math.max(0, Math.min(3, n))); scrollTo({ top: 0, behavior: 'smooth' }); }

  setOcc(v: Occupancy) { this.s.patchHome({ occupancy: v }); }
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
  setBattery(b: number) { this.s.pick({ ...this.cfg(), batteryKwh: b }); }

  print() { window.print(); }
  eur(n: number): string { return '€' + Math.round(n).toLocaleString('en-IE'); }
  max0(n: number): number { return Math.max(0, n); }
  eur0(n: number): string { return this.eur(Math.round(n / 50) * 50); }
  payback(y: number): string { return isFinite(y) && y < 40 ? y.toFixed(1) + ' years' : 'Over 40 years'; }
  pc(n: number): string { return Math.round(n * 100) + '%'; }
}
