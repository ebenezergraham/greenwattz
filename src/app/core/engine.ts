/**
 * GreenWattz calculation engine. Pure functions, runs entirely in the browser.
 * All assumptions are exposed in `Assumptions` so the user can change them.
 * Figures are planning estimates for Ireland, not a quote.
 */

export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Share of annual PV output per month for Ireland (normalised at use). */
const GEN_SHARE = [3, 5, 8.5, 11, 13, 14, 13.5, 11.5, 8.5, 6, 3.5, 2.5];
/** Household demand seasonality (winter higher). */
export const DEMAND_SEASON = [1.2, 1.12, 1.05, 0.97, 0.9, 0.84, 0.82, 0.84, 0.92, 1.02, 1.12, 1.2];
/** Approximate daylight hours, Irish latitude. */
const DAYLIGHT = [8.2, 10, 12, 14.2, 16.2, 17.3, 16.7, 14.8, 12.7, 10.5, 8.7, 7.7];

export type Occupancy = 'away' | 'mixed' | 'home';
export type Orientation = 'S' | 'SE_SW' | 'E_W' | 'N';
export type Shading = 'none' | 'some' | 'heavy';

export interface Assumptions {
  dayRate: number; // EUR/kWh 08:00-23:00 incl. VAT
  nightRate: number; // EUR/kWh 23:00-08:00
  exportRate: number; // EUR/kWh
  tariffInflation: number; // per year
  yieldPerKwp: number; // kWh per kWp per year, south, ~35 degrees
  panelWatts: number;
  panelAreaM2: number;
  panelCostBase: number; // fixed install cost
  panelCostPerKwp: number;
  batteryCostBase: number;
  batteryCostPerKwh: number;
  batteryEfficiency: number;
  seaiGrant: boolean;
  co2KgPerKwh: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  dayRate: 0.35,
  nightRate: 0.23,
  exportRate: 0.19,
  tariffInflation: 0.02,
  yieldPerKwp: 920,
  panelWatts: 440,
  panelAreaM2: 2.0,
  panelCostBase: 2200,
  panelCostPerKwp: 1250,
  batteryCostBase: 800,
  batteryCostPerKwh: 500,
  batteryEfficiency: 0.9,
  seaiGrant: true,
  co2KgPerKwh: 0.3,
};

export type ObstacleKey = 'chimney' | 'skylight' | 'vent' | 'dish' | 'dormer' | 'thermal';
export type Obstacles = Record<ObstacleKey, number>;
export const NO_OBSTACLES: Obstacles = { chimney: 0, skylight: 0, vent: 0, dish: 0, dormer: 0, thermal: 0 };

/** Typical area each obstacle takes out of a roof slope, including the clearance panels need around it. */
export const OBSTACLES: { key: ObstacleKey; label: string; m2: number; max: number }[] = [
  { key: 'chimney', label: 'Chimney stack', m2: 3, max: 3 },
  { key: 'skylight', label: 'Skylight or roof window', m2: 2, max: 8 },
  { key: 'vent', label: 'Vent pipe, flue or extractor', m2: 0.7, max: 8 },
  { key: 'dish', label: 'Satellite dish or aerial', m2: 0.5, max: 3 },
  { key: 'dormer', label: 'Dormer window', m2: 5, max: 3 },
  { key: 'thermal', label: 'Existing solar water heating panel', m2: 4.5, max: 2 },
];

export function obstacleArea(h: HomeInputs): number {
  return OBSTACLES.reduce((t, o) => t + o.m2 * (h.obstacles[o.key] ?? 0), 0);
}
export function usableArea(h: HomeInputs): number {
  return Math.max(6, h.roofAreaM2 - obstacleArea(h));
}

export interface HomeInputs {
  occupancy: Occupancy;
  orientation: Orientation;
  shading: Shading;
  roofAreaM2: number; // roof area on the chosen side, before taking off obstacles
  obstacles: Obstacles;
  addEv: boolean;
  addHeatPump: boolean;
}

/** kWh per hour-of-day, per month: typical day. */
export type Profile = number[][]; // [12][24]

export interface Usage {
  annualKwh: number;
  profile: Profile;
  source: 'estimate' | 'smart-meter';
  coverage?: string;
}

export interface Split {
  night: number; // 23-08
  daytime: number; // 08-17
  evening: number; // 17-23
  nightPct: number;
  daytimePct: number;
  eveningPct: number;
}

const SHAPES: Record<Occupancy, number[]> = {
  // 24 relative weights, index = hour starting
  away: [2, 1.6, 1.5, 1.5, 1.6, 2, 3.5, 5.5, 4.5, 2.5, 2.2, 2.2, 2.4, 2.2, 2.2, 2.6, 4, 6.5, 7.5, 7, 6, 5, 3.5, 2.6],
  mixed: [2, 1.6, 1.5, 1.5, 1.6, 2, 3.2, 5, 4.6, 3.8, 3.4, 3.6, 4, 3.6, 3.4, 3.6, 4.6, 6.2, 6.8, 6.4, 5.6, 4.6, 3.4, 2.6],
  home: [2, 1.6, 1.5, 1.5, 1.6, 2, 3, 4.5, 4.8, 4.6, 4.4, 4.8, 5.2, 4.6, 4.2, 4.2, 4.8, 6, 6.2, 5.8, 5, 4.2, 3.2, 2.4],
};

const EV_SHAPE = [6, 6, 6, 6, 6, 5, 2, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 1, 2, 3, 4, 5, 6];
const HP_SHAPE = [3, 3, 3, 3, 3.5, 4.5, 6, 6, 5, 4, 3.5, 3.5, 3.5, 3.5, 3.5, 4, 5, 6, 6, 5.5, 5, 4, 3.5, 3];

function normalise(a: number[]): number[] {
  const s = a.reduce((x, y) => x + y, 0);
  return a.map((v) => v / s);
}

/** Build a typical-day profile per month from annual kWh and lifestyle. */
export function estimateProfile(annualKwh: number, occupancy: Occupancy): Profile {
  const shape = normalise(SHAPES[occupancy]);
  const seasonSum = MONTH_DAYS.reduce((t, d, m) => t + d * DEMAND_SEASON[m], 0);
  const base = annualKwh / seasonSum; // kWh/day at season factor 1
  return MONTH_DAYS.map((_, m) => shape.map((w) => w * base * DEMAND_SEASON[m]));
}

/** Add planned EV (~2,600 kWh/yr) and heat pump (~3,500 kWh/yr) loads. */
export function withExtras(u: Usage, home: HomeInputs): Usage {
  let profile = u.profile.map((r) => [...r]);
  let annual = u.annualKwh;
  const add = (kwh: number, shape: number[], seasonal: boolean) => {
    const sh = normalise(shape);
    const sSum = MONTH_DAYS.reduce((t, d, m) => t + d * (seasonal ? DEMAND_SEASON[m] ** 2 : 1), 0);
    const base = kwh / sSum;
    profile = profile.map((row, m) => row.map((v, h) => v + sh[h] * base * (seasonal ? DEMAND_SEASON[m] ** 2 : 1)));
    annual += kwh;
  };
  if (home.addEv) add(2600, EV_SHAPE, false);
  if (home.addHeatPump) add(3500, HP_SHAPE, true);
  return { ...u, profile, annualKwh: annual };
}

export function annualFromProfile(p: Profile): number {
  return p.reduce((t, row, m) => t + row.reduce((a, b) => a + b, 0) * MONTH_DAYS[m], 0);
}

export function averageDay(p: Profile): number[] {
  const out = new Array(24).fill(0);
  const total = MONTH_DAYS.reduce((a, b) => a + b, 0);
  p.forEach((row, m) => row.forEach((v, h) => (out[h] += (v * MONTH_DAYS[m]) / total)));
  return out;
}

const isNight = (h: number) => h >= 23 || h < 8;

export function splitUsage(p: Profile): Split {
  const day = averageDay(p);
  let night = 0, daytime = 0, evening = 0;
  day.forEach((v, h) => {
    if (isNight(h)) night += v;
    else if (h < 17) daytime += v;
    else evening += v;
  });
  const t = night + daytime + evening || 1;
  return { night, daytime, evening, nightPct: night / t, daytimePct: daytime / t, eveningPct: evening / t };
}

export function orientationFactor(o: Orientation): number {
  return { S: 1, SE_SW: 0.95, E_W: 0.82, N: 0.62 }[o];
}
export function shadingFactor(s: Shading): number {
  return { none: 1, some: 0.9, heavy: 0.75 }[s];
}

export interface Config {
  panels: number;
  batteryKwh: number;
}

export interface Result {
  kwp: number;
  panels: number;
  batteryKwh: number;
  generationKwh: number;
  selfUseKwh: number; // solar used directly + via battery
  exportKwh: number;
  importKwh: number;
  baselineImportKwh: number;
  selfSufficiency: number; // share of demand met by solar
  selfConsumption: number; // share of generation used at home
  billBefore: number;
  billAfter: number;
  billSaving: number;
  exportIncome: number;
  annualBenefit: number;
  grossCost: number;
  grossLow: number;
  grossHigh: number;
  grant: number;
  netCost: number;
  paybackYears: number;
  monthlyGen: number[];
  monthlyDemand: number[];
  co2Tonnes: number;
}

export function seaiGrantFor(kwp: number): number {
  const first = Math.min(kwp, 2) * 700;
  const second = Math.max(0, Math.min(kwp, 4) - 2) * 200;
  return Math.min(1800, Math.round(first + second));
}

export function systemCost(kwp: number, battery: number, a: Assumptions): number {
  if (kwp <= 0) return 0;
  const pv = a.panelCostBase + a.panelCostPerKwp * kwp;
  const bat = battery > 0 ? a.batteryCostBase + a.batteryCostPerKwh * battery : 0;
  return Math.round(pv + bat);
}

export function maxPanels(home: HomeInputs, a: Assumptions): number {
  return Math.max(2, Math.min(30, Math.floor(usableArea(home) / a.panelAreaM2)));
}

/** Simulate a typical day per month at hourly steps. */
export function simulate(usage: Usage, home: HomeInputs, a: Assumptions, cfg: Config): Result {
  const kwp = (cfg.panels * a.panelWatts) / 1000;
  const genAnnual = kwp * a.yieldPerKwp * orientationFactor(home.orientation) * shadingFactor(home.shading);
  const shareSum = GEN_SHARE.reduce((x, y) => x + y, 0);
  const cap = cfg.batteryKwh;
  const usable = cap * 0.9; // keep 10% reserve
  const maxRate = Math.max(0.1, cap / 2); // kW charge/discharge, ~0.5C
  const eff = Math.sqrt(a.batteryEfficiency);

  let gen = 0, self = 0, exp = 0, imp = 0, baseImp = 0;
  let billBefore = 0, billAfter = 0, exportIncome = 0;
  const monthlyGen: number[] = [];
  const monthlyDemand: number[] = [];

  for (let m = 0; m < 12; m++) {
    const days = MONTH_DAYS[m];
    const gMonth = (genAnnual * GEN_SHARE[m]) / shareSum;
    const gDay = gMonth / days;
    const len = DAYLIGHT[m];
    const start = 12.9 - len / 2;
    const w = Array.from({ length: 24 }, (_, h) => {
      const t = h + 0.5;
      return t > start && t < start + len ? Math.sin((Math.PI * (t - start)) / len) ** 1.3 : 0;
    });
    const ws = w.reduce((x, y) => x + y, 0) || 1;
    let soc = 0;
    let dGen = 0, dSelf = 0, dExp = 0, dImp = 0, dBase = 0, dBefore = 0, dAfter = 0, dIncome = 0, dDemand = 0;
    for (let h = 0; h < 24; h++) {
      const g = (w[h] / ws) * gDay;
      const load = usage.profile[m][h];
      const rate = isNight(h) ? a.nightRate : a.dayRate;
      dGen += g; dDemand += load;
      dBase += load; dBefore += load * rate;
      let direct = Math.min(g, load);
      let surplus = g - direct;
      let deficit = load - direct;
      let fromBat = 0;
      if (cap > 0) {
        const charge = Math.min(surplus, maxRate, (usable - soc) / eff);
        if (charge > 0) { soc += charge * eff; surplus -= charge; }
        const dis = Math.min(deficit, maxRate, soc * eff);
        if (dis > 0) { soc -= dis / eff; deficit -= dis; fromBat = dis; }
      }
      dSelf += direct + fromBat;
      dExp += surplus;
      dImp += deficit;
      dAfter += deficit * rate;
      dIncome += surplus * a.exportRate;
    }
    gen += dGen * days; self += dSelf * days; exp += dExp * days; imp += dImp * days; baseImp += dBase * days;
    billBefore += dBefore * days; billAfter += dAfter * days; exportIncome += dIncome * days;
    monthlyGen.push(dGen * days);
    monthlyDemand.push(dDemand * days);
  }

  const gross = systemCost(kwp, cap, a);
  const grant = a.seaiGrant && kwp > 0 ? seaiGrantFor(kwp) : 0;
  const net = Math.max(0, gross - grant);
  const saving = billBefore - billAfter;
  const benefit = saving + exportIncome;
  return {
    kwp, panels: cfg.panels, batteryKwh: cap,
    generationKwh: gen, selfUseKwh: self, exportKwh: exp, importKwh: imp, baselineImportKwh: baseImp,
    selfSufficiency: baseImp ? self / baseImp : 0,
    selfConsumption: gen ? self / gen : 0,
    billBefore, billAfter, billSaving: saving, exportIncome, annualBenefit: benefit,
    grossCost: gross, grossLow: Math.round(gross * 0.88), grossHigh: Math.round(gross * 1.15),
    grant, netCost: net,
    paybackYears: benefit > 0 ? net / benefit : Infinity,
    monthlyGen, monthlyDemand,
    co2Tonnes: (self * a.co2KgPerKwh) / 1000,
  };
}

export interface Scenario extends Result { label: string; blurb: string; key: string; }

export const BATTERY_OPTIONS = [0, 5, 10, 15];

/** Evaluate a grid of panels x battery and return the three headline strategies. */
export function buildGrid(usage: Usage, home: HomeInputs, a: Assumptions): Result[] {
  const max = maxPanels(home, a);
  const out: Result[] = [];
  for (let p = 4; p <= max; p += 2) for (const b of BATTERY_OPTIONS) out.push(simulate(usage, home, a, { panels: p, batteryKwh: b }));
  if (!out.length) out.push(simulate(usage, home, a, { panels: Math.min(4, max), batteryKwh: 0 }));
  return out;
}

export function pickStrategies(grid: Result[], years = 20): Scenario[] {
  const value = (r: Result) => r.annualBenefit * years * 0.92 - r.netCost; // 8% allowance for degradation
  const viable = grid.filter((r) => isFinite(r.paybackYears));
  const pool = viable.length ? viable : grid;
  const lean = [...pool].sort((x, y) => x.netCost - y.netCost)[0];
  const best = [...pool].sort((x, y) => value(y) - value(x))[0];
  const bold = [...pool].sort((x, y) => y.selfSufficiency - x.selfSufficiency || value(y) - value(x))
    .filter((r) => value(r) > -0.2 * r.netCost)[0] ?? best;
  const mk = (r: Result, key: string, label: string, blurb: string): Scenario => ({ ...r, key, label, blurb });
  return [
    mk(lean, 'lean', 'Lowest outlay', 'Smallest spend that still pays its way.'),
    mk(best, 'best', 'Best value', 'Highest return over 20 years.'),
    mk(bold, 'bold', 'Most independent', 'Covers as much of your usage as sensible.'),
  ];
}

export interface Cashflow { year: number; cumulative: number; }

export function cashflow(r: Result, a: Assumptions, years = 25): Cashflow[] {
  const out: Cashflow[] = [];
  let cum = -r.netCost;
  out.push({ year: 0, cumulative: cum });
  for (let y = 1; y <= years; y++) {
    const degr = Math.pow(0.995, y - 1);
    const infl = Math.pow(1 + a.tariffInflation, y - 1);
    const batteryFade = r.batteryKwh > 0 && y > 12 ? 0.9 : 1;
    cum += r.annualBenefit * degr * infl * batteryFade;
    out.push({ year: y, cumulative: cum });
  }
  return out;
}

export function annualFromBill(monthlyBill: number, a: Assumptions, nightShare = 0.25): number {
  const blended = a.dayRate * (1 - nightShare) + a.nightRate * nightShare;
  // Remove approx. standing charge and PSO levy (~EUR 35/month) from the bill.
  return Math.max(500, Math.round(((monthlyBill - 35) * 12) / blended));
}

/** Typical sunny-ish day of solar output (kWh per hour) for a month index, for charts. */
export function solarDay(home: HomeInputs, a: Assumptions, panels: number, month: number): number[] {
  const kwp = (panels * a.panelWatts) / 1000;
  const annual = kwp * a.yieldPerKwp * orientationFactor(home.orientation) * shadingFactor(home.shading);
  const shareSum = GEN_SHARE.reduce((x, y) => x + y, 0);
  const gDay = (annual * GEN_SHARE[month]) / shareSum / MONTH_DAYS[month];
  const len = DAYLIGHT[month];
  const start = 12.9 - len / 2;
  const w = Array.from({ length: 24 }, (_, h) => {
    const t = h + 0.5;
    return t > start && t < start + len ? Math.sin((Math.PI * (t - start)) / len) ** 1.3 : 0;
  });
  const ws = w.reduce((x, y) => x + y, 0) || 1;
  return w.map((v) => (v / ws) * gDay);
}
