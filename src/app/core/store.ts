import { Injectable, computed, signal } from '@angular/core';
import {
  Assumptions, Config, DEFAULT_ASSUMPTIONS, averageDay, medianFromBands, profileFromBands, bandBreakdown, dayStats, HOUSE_TYPES, HomeInputs, HouseType, NO_OBSTACLES, ObstacleKey, usableArea, obstacleArea, Usage, annualFromBill, buildGrid, cashflow,
  estimateProfile, maxPanels, roofFitPanels, connectionLimitPanels, pickStrategies, simulate, withExtras,
} from './engine';

export type UsageMode = 'meter' | 'annual' | 'bill';

/** Journey state lives in memory only. Nothing here is stored or sent to us. */
@Injectable({ providedIn: 'root' })
export class PlanStore {
  readonly home = signal<HomeInputs>({
    houseType: 'semi', roofType: 'pitched', storeys: 2, taxpayers: 1, yearOccupied: null,
    occupancy: 'mixed', orientation: 'S', shading: 'none', roofAreaM2: 25, obstacles: { ...NO_OBSTACLES }, threePhase: false, addEv: false, addHeatPump: false,
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
    if (m === 'meter' && meter) {
      // a daily band file fixes the night, day and peak totals; the hours inside each band follow who is home
      return meter.bands ? { ...meter, profile: profileFromBands(meter.bands, h.occupancy), median: medianFromBands(meter.bands, h.occupancy) } : meter;
    }
    const kwh = m === 'bill' ? annualFromBill(this.monthlyBill(), a) : this.annualKwh();
    return { annualKwh: kwh, profile: estimateProfile(kwh, h.occupancy), source: 'estimate' };
  });
  readonly usage = computed(() => withExtras(this.baseUsage(), this.home()));
  /** The day we describe to the user: the median day from meter data, else the average day. */
  readonly dayShape = computed(() => this.usage().median ?? averageDay(this.usage().profile));
  readonly bands = computed(() => bandBreakdown(this.usage().profile, this.assumptions(), this.dayShape()));
  readonly dayStats = computed(() => dayStats(this.dayShape()));
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

  readonly roofFit = computed(() => roofFitPanels(this.home(), this.assumptions()));
  readonly connectionCap = computed(() => connectionLimitPanels(this.home(), this.assumptions()));
  readonly usableArea = computed(() => usableArea(this.home()));
  readonly obstacleArea = computed(() => obstacleArea(this.home()));
  setObstacle(k: ObstacleKey, n: number) { this.patchHome({ obstacles: { ...this.home().obstacles, [k]: Math.max(0, n) } }); }
  /** True once the user has set the roof area themselves, so choosing a house type no longer overwrites it. */
  readonly roofTouched = signal(false);
  setHouseType(t: HouseType) {
    const size = HOUSE_TYPES.find((h) => h.key === t)!.roofM2;
    this.patchHome(this.roofTouched() ? { houseType: t } : { houseType: t, roofAreaM2: size });
  }
  patchHome(p: Partial<HomeInputs>) { this.home.update((h) => ({ ...h, ...p })); this.chosen.set(null); }
  patchAssumptions(p: Partial<Assumptions>) { this.assumptions.update((a) => ({ ...a, ...p })); }
  pick(c: Config) { this.chosen.set(c); }
}
