import { Injectable, computed, signal } from '@angular/core';
import {
  Assumptions, Config, DEFAULT_ASSUMPTIONS, HomeInputs, Usage, annualFromBill, buildGrid, cashflow,
  estimateProfile, maxPanels, pickStrategies, simulate, withExtras,
} from './engine';

export type UsageMode = 'meter' | 'annual' | 'bill';

/** Journey state lives in memory only. Nothing is stored or sent anywhere. */
@Injectable({ providedIn: 'root' })
export class PlanStore {
  readonly home = signal<HomeInputs>({
    occupancy: 'mixed', orientation: 'S', shading: 'none', roofAreaM2: 30, addEv: false, addHeatPump: false,
  });
  readonly assumptions = signal<Assumptions>({ ...DEFAULT_ASSUMPTIONS });
  readonly mode = signal<UsageMode>('annual');
  readonly annualKwh = signal(4200);
  readonly monthlyBill = signal(140);
  readonly meterUsage = signal<Usage | null>(null);
  readonly chosen = signal<Config | null>(null);

  readonly baseUsage = computed<Usage>(() => {
    const m = this.mode(), h = this.home(), a = this.assumptions();
    const meter = this.meterUsage();
    if (m === 'meter' && meter) return meter;
    const kwh = m === 'bill' ? annualFromBill(this.monthlyBill(), a) : this.annualKwh();
    return { annualKwh: kwh, profile: estimateProfile(kwh, h.occupancy), source: 'estimate' };
  });
  readonly usage = computed(() => withExtras(this.baseUsage(), this.home()));
  readonly maxPanels = computed(() => maxPanels(this.home(), this.assumptions()));
  readonly grid = computed(() => buildGrid(this.usage(), this.home(), this.assumptions()));
  readonly strategies = computed(() => pickStrategies(this.grid()));
  readonly best = computed(() => this.strategies()[1]);
  readonly config = computed<Config>(() => {
    const c = this.chosen();
    const b = this.best();
    return c ?? { panels: b.panels, batteryKwh: b.batteryKwh };
  });
  readonly result = computed(() =>
    simulate(this.usage(), this.home(), this.assumptions(), { ...this.config(), panels: Math.min(this.config().panels, this.maxPanels()) }),
  );
  readonly flow = computed(() => cashflow(this.result(), this.assumptions()));

  patchHome(p: Partial<HomeInputs>) { this.home.update((h) => ({ ...h, ...p })); this.chosen.set(null); }
  patchAssumptions(p: Partial<Assumptions>) { this.assumptions.update((a) => ({ ...a, ...p })); }
  pick(c: Config) { this.chosen.set(c); }
}
