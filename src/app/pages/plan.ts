import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PlanStore } from '../core/store';
import { Assumptions, BATTERY_OPTIONS, OBSTACLES, ObstacleKey, Orientation, Occupancy, Shading, Scenario, averageDay, simulate, solarDay, splitUsage } from '../core/engine';
import { HdfError, parseHdf } from '../core/hdf';
import { CashChart, DayChart, MonthChart } from '../ui/charts';

const STEPS = ['Your home', 'Your usage', 'Your strategy', 'Your cost'];

@Component({
  selector: 'page-plan',
  imports: [RouterLink, DecimalPipe, DayChart, MonthChart, CashChart],
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
  readonly batteryOptions = BATTERY_OPTIONS;
  readonly obstacles = OBSTACLES;
  count(k: ObstacleKey) { return this.s.home().obstacles[k] ?? 0; }
  bump(k: ObstacleKey, d: number, max: number) { this.s.setObstacle(k, Math.min(max, this.count(k) + d)); }

  readonly split = computed(() => splitUsage(this.s.usage().profile));
  readonly dayAvg = computed(() => averageDay(this.s.usage().profile));
  readonly dailyKwh = computed(() => this.s.usage().annualKwh / 365);
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
      this.s.meterUsage.set(parseHdf(text));
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
  setRoof(e: Event) { this.s.patchHome({ roofAreaM2: this.num(e) }); }
  setRoofExact(e: Event) { const v = this.num(e); if (v >= 5) this.s.patchHome({ roofAreaM2: Math.min(150, v) }); }

  pickStrategy(x: Scenario) { this.s.pick({ panels: x.panels, batteryKwh: x.batteryKwh }); }
  isPicked(x: Scenario) { return x.panels === this.cfg().panels && x.batteryKwh === this.cfg().batteryKwh; }
  setPanels(e: Event) { this.s.pick({ ...this.cfg(), panels: this.num(e) }); }
  setBattery(b: number) { this.s.pick({ ...this.cfg(), batteryKwh: b }); }

  print() { window.print(); }
  eur(n: number): string { return '€' + Math.round(n).toLocaleString('en-IE'); }
  eur0(n: number): string { return this.eur(Math.round(n / 50) * 50); }
  payback(y: number): string { return isFinite(y) && y < 40 ? y.toFixed(1) + ' years' : 'Over 40 years'; }
  pc(n: number): string { return Math.round(n * 100) + '%'; }
}
