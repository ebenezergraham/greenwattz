/**
 * GreenWattz calculation engine. Pure functions, runs entirely in the browser.
 * All assumptions are exposed in `Assumptions` so the user can change them.
 * Figures are planning estimates for Ireland, not a quote.
 */

import prices from '../data/prices.json';

export interface PriceSource { what: string; label: string; url: string }
export interface PriceData {
  reviewedOn: string;
  reviewEveryDays: number;
  solar: { costBase: number; costPerKwp: number; yieldPerKwp: number; note: string };
  grants: { seaiSolarFirst2kwpPerKwp: number; seaiSolarNext2kwpPerKwp: number; seaiSolarMax: number; seaiBattery: number; seaiBatteryConfirmed: boolean; seaiSolarBuiltBefore: number; seaiBatteryBuiltBefore: number; seaiBatteryMinKwh: number; seaiBatteryOpened: string; seaiEnhancedMax: number };
  links: { solarGrant: string; batteryGrant: string; enhanced: string; howToApply: string; installers: string; terms: string; govEnergyUpgrades: string };
  tax: { exportExemptionPerPerson: number; exportExemptionInForcePerPerson: number; exportTaxRate: number; note: string };
  tariffs: { flat: number; day: number; night: number; peak: number; export: number; standingChargeMonthly: number };
  battery: Record<'value' | 'mainstream' | 'premium', { kwh: number; low: number; high: number }[]>;
  sources: PriceSource[];
}
/** Every price, grant and rate the estimates use lives in src/app/data/prices.json with its review date and sources. */
export const PRICES = prices as PriceData;

/** Days since the prices were last reviewed. */
export function priceAgeDays(now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(PRICES.reviewedOn + 'T00:00:00Z').getTime()) / 86400000);
}
export function pricesAreStale(now: Date = new Date()): boolean {
  return priceAgeDays(now) > PRICES.reviewEveryDays;
}

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

/** flat: one rate all day. dayNight: night 11pm-8am. smart: night 11pm-8am, peak 5pm-7pm, day the rest (CRU time-of-use bands). */
export type Tariff = 'flat' | 'dayNight' | 'smart';
export type Band = 'flat' | 'night' | 'day' | 'peak';

export type BatteryTier = 'value' | 'mainstream' | 'premium';

interface PriceAnchor { kwh: number; low: number; high: number }
export interface BatteryTierInfo {
  key: BatteryTier; label: string; blurb: string; examples: string[]; anchors: PriceAnchor[];
}

/**
 * Installed battery prices (euro, incl. fitting) from published Irish installer and price-guide estimates,
 * read in October 2026. Each tier lists price points at the capacities commonly fitted. Sizes in between
 * are interpolated, sizes beyond the last point follow the last slope. Always confirm on a written quote.
 */
export const BATTERY_TIERS: BatteryTierInfo[] = [
  {
    key: 'value', label: 'Value', blurb: 'Lowest price per kWh, modular, widely fitted as a budget choice.',
    examples: ['GivEnergy (5.2, 9.5 kWh)', 'BYD Battery-Box HVS (5.1, 10.2 kWh)', 'Pylontech'],
    anchors: PRICES.battery.value,
  },
  {
    key: 'mainstream', label: 'Mainstream', blurb: 'The most commonly installed in Ireland, good warranty and app.',
    examples: ['Huawei LUNA2000 (5, 10, 15 kWh)', 'Sungrow SBR'],
    anchors: PRICES.battery.mainstream,
  },
  {
    key: 'premium', label: 'Premium', blurb: 'Top-tier brands: strong power output, backup options and long track records.',
    examples: ['Tesla Powerwall 3 (13.5 kWh)', 'SolarEdge Home Battery (9.7 kWh)', 'Sigenergy SigenStor (5 to 30 kWh)', 'Sonnen'],
    anchors: PRICES.battery.premium,
  },
];
export const batteryTierInfo = (t: BatteryTier) => BATTERY_TIERS.find((x) => x.key === t)!;

/** Installed price range for a battery of this tier and capacity. */
export function batteryPrice(tier: BatteryTier, kwh: number): { low: number; mid: number; high: number } {
  if (kwh <= 0) return { low: 0, mid: 0, high: 0 };
  const a = batteryTierInfo(tier).anchors;
  const at = (k: 'low' | 'high') => {
    let i = a.findIndex((p) => kwh <= p.kwh);
    if (i < 0) i = a.length - 1; // beyond the last point: follow the last slope
    if (i === 0) i = 1; // below the first point: follow the first slope
    const p0 = a[i - 1], p1 = a[i];
    const slope = (p1[k] - p0[k]) / (p1.kwh - p0.kwh);
    return Math.max(a[0][k] * 0.6, p0[k] + slope * (kwh - p0.kwh));
  };
  const low = Math.round(at('low') / 10) * 10, high = Math.round(at('high') / 10) * 10;
  return { low, high, mid: Math.round((low + high) / 20) * 10 };
}

/** Battery sizes installers commonly fit: 5 and 10 kWh are the mainstay, 13.5 kWh is the Tesla size, 15 kWh the largest Huawei stack. */
export const BATTERY_SIZES = [5, 10, 13.5, 15];

/** Rough guide to what size suits whom, drawn from installer sizing advice. */
export const BATTERY_GUIDE: { kwh: string; who: string }[] = [
  { kwh: '5 kWh', who: 'One or two people, or a small home with modest evening use' },
  { kwh: '10 kWh', who: 'A family home, or someone who works from home' },
  { kwh: '13.5 to 15 kWh', who: 'A home with an electric car or a heat pump' },
];

export interface Assumptions {
  tariff: Tariff;
  flatRate: number; // EUR/kWh incl. VAT, used when tariff is flat
  dayRate: number; // EUR/kWh incl. VAT
  nightRate: number; // EUR/kWh, 23:00-08:00
  peakRate: number; // EUR/kWh, 17:00-19:00, smart tariff only
  standingChargeMonthly: number; // EUR per month for standing charge and levies, used to turn a bill into kWh
  exportRate: number; // EUR/kWh
  tariffInflation: number; // per year
  yieldPerKwp: number; // kWh per kWp per year, south, ~35 degrees
  panelWatts: number;
  panelAreaM2: number;
  panelCostBase: number; // fixed install cost
  panelCostPerKwp: number;
  batteryTier: BatteryTier;
  batteryEfficiency: number;
  seaiGrant: boolean;
  /** Count the SEAI battery grant (600 euro for 5 kWh or more) when the home is eligible. */
  seaiBatteryGrant: boolean;
  /** Export income that is tax-free for each person on the bill (euro a year). 600 is announced; 400 is the limit in force. */
  exportTaxFreePerPerson: number;
  /** Tax on export income above the allowance: about 0.28 at the standard rate incl. USC and PRSI, about 0.48 at the higher rate. */
  exportTaxRate: number;
  co2KgPerKwh: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  tariff: 'dayNight',
  flatRate: PRICES.tariffs.flat,
  dayRate: PRICES.tariffs.day,
  nightRate: PRICES.tariffs.night,
  peakRate: PRICES.tariffs.peak,
  standingChargeMonthly: PRICES.tariffs.standingChargeMonthly,
  exportRate: PRICES.tariffs.export,
  tariffInflation: 0.02,
  yieldPerKwp: PRICES.solar.yieldPerKwp,
  panelWatts: 440,
  panelAreaM2: 2.0,
  panelCostBase: PRICES.solar.costBase,
  panelCostPerKwp: PRICES.solar.costPerKwp,
  batteryTier: 'mainstream',
  batteryEfficiency: 0.9,
  seaiGrant: true,
  seaiBatteryGrant: PRICES.grants.seaiBatteryConfirmed,
  exportTaxFreePerPerson: PRICES.tax.exportExemptionPerPerson,
  exportTaxRate: PRICES.tax.exportTaxRate,
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
  return Math.max(6, (h.roofAreaM2 - obstacleArea(h)) * roofTypeInfo(h.roofType).area);
}

export type HouseType = 'detached' | 'semi' | 'endTerrace' | 'midTerrace' | 'apartment';
export type RoofType = 'pitched' | 'slate' | 'hipped' | 'flat' | 'metal';
export type Storeys = 1 | 2 | 3;

/** Starting roof area (m2 on the best-facing side) we suggest for each house type. The user can change it. */
export const HOUSE_TYPES: { key: HouseType; label: string; hint: string; roofM2: number }[] = [
  { key: 'detached', label: 'Detached', hint: 'Own roof on all sides', roofM2: 35 },
  { key: 'semi', label: 'Semi-detached', hint: 'Shares one wall', roofM2: 25 },
  { key: 'endTerrace', label: 'End of terrace', hint: 'Shares one wall', roofM2: 22 },
  { key: 'midTerrace', label: 'Mid terrace', hint: 'Shares both side walls', roofM2: 18 },
  { key: 'apartment', label: 'Apartment or duplex', hint: 'Roof may be shared', roofM2: 15 },
];

/**
 * Roof types. mounting and labour scale those cost lines. yield and area apply to flat roofs, where panels sit
 * on tilted frames: a tilted south-facing array yields a little less than an ideal pitched one, and rows need
 * spacing so only part of the area holds panels.
 */
export const ROOF_TYPES: { key: RoofType; label: string; hint: string; mounting: number; labour: number; yield: number; area: number }[] = [
  { key: 'pitched', label: 'Pitched, tiles', hint: 'The most common roof', mounting: 1, labour: 1, yield: 1, area: 1 },
  { key: 'slate', label: 'Pitched, slate', hint: 'Takes more care to fit', mounting: 1.15, labour: 1.1, yield: 1, area: 1 },
  { key: 'hipped', label: 'Hipped', hint: 'Slopes on all four sides', mounting: 1.05, labour: 1.05, yield: 1, area: 1 },
  { key: 'flat', label: 'Flat', hint: 'Panels sit on tilted frames', mounting: 1.2, labour: 1.05, yield: 0.95, area: 0.6 },
  { key: 'metal', label: 'Metal or sheet', hint: 'Corrugated metal or fibre cement', mounting: 0.95, labour: 0.95, yield: 1, area: 1 },
];

/** Scaffolding and roof access cost relative to a standard two-storey house. */
export const STOREY_ACCESS: Record<Storeys, number> = { 1: 0.6, 2: 1, 3: 1.5 };

export const roofTypeInfo = (t: RoofType) => ROOF_TYPES.find((r) => r.key === t)!;

export interface HomeInputs {
  houseType: HouseType;
  roofType: RoofType;
  storeys: Storeys;
  /** People named on the electricity bill who would each get the tax-free export allowance. */
  taxpayers: 1 | 2;
  /** Year the home was first occupied. SEAI grants need a home built and occupied before a cut-off year. Null until the user says. */
  yearOccupied: number | null;
  occupancy: Occupancy;
  orientation: Orientation;
  shading: Shading;
  roofAreaM2: number; // roof area on the chosen side, before taking off obstacles
  obstacles: Obstacles;
  threePhase: boolean; // three-phase supply allows a larger connection
  addEv: boolean;
  addHeatPump: boolean;
}

/** kWh per hour-of-day, per month: typical day. */
export type Profile = number[][]; // [12][24]

export interface Usage {
  annualKwh: number;
  profile: Profile;
  source: 'estimate' | 'smart-meter' | 'smart-meter-daily';
  coverage?: string;
  /** Median kWh for each hour of the day across the days measured (smart meter data only). */
  median?: number[];
  /** Median kWh used per day (smart meter data only). */
  medianDaily?: number;
  /** Measured daily kWh per rate band, when the file holds daily night/day/peak totals instead of hourly readings. */
  bands?: BandMonthly;
}

/**
 * Daily use per rate band for each month, from a daily night/day/peak register file. The band totals are
 * measured. How use spreads between the hours inside a band is not in the file, so it is estimated.
 */
export interface BandMonthly {
  night: number[]; // kWh per day, by month
  offpeak: number[]; // the day band (8am to 11pm) without peak
  peak: number[]; // 5pm to 7pm
  hasPeak: boolean;
  medianNight: number;
  medianOffpeak: number;
  medianPeak: number;
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
  const out: Usage = { ...u, profile, annualKwh: annual };
  if (u.median) {
    // shift the median by the average extra load in each hour, so it still describes the new total
    const before = averageDay(u.profile), after = averageDay(profile);
    out.median = u.median.map((v, h) => v + (after[h] - before[h]));
    if (u.medianDaily != null) out.medianDaily = u.medianDaily + (annual - u.annualKwh) / 365;
  }
  return out;
}

/** Hours of the day in each rate band. Without a peak register, the whole non-night day is one band. */
export function bandHours(hasPeak: boolean): { night: number[]; peak: number[]; offpeak: number[] } {
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const night = hours.filter((h) => h >= 23 || h < 8);
  const peak = hasPeak ? [17, 18] : [];
  return { night, peak, offpeak: hours.filter((h) => !night.includes(h) && !peak.includes(h)) };
}

function spread(kwh: number, hours: number[], weights: number[]): number[] {
  const out = new Array(24).fill(0);
  const total = hours.reduce((t, h) => t + weights[h], 0) || 1;
  for (const h of hours) out[h] = (kwh * weights[h]) / total;
  return out;
}
function shapeFor(occupancy: Occupancy): number[] { return SHAPES[occupancy]; }

/** Builds an hourly profile whose night, day and peak totals match the measured ones. */
export function profileFromBands(b: BandMonthly, occupancy: Occupancy): Profile {
  const hrs = bandHours(b.hasPeak), w = shapeFor(occupancy);
  return MONTH_DAYS.map((_, m) => {
    const n = spread(b.night[m], hrs.night, w), o = spread(b.offpeak[m], hrs.offpeak, w), p = spread(b.peak[m], hrs.peak, w);
    return n.map((v, h) => v + o[h] + p[h]);
  });
}

/** The median day, spread across hours the same way. */
export function medianFromBands(b: BandMonthly, occupancy: Occupancy): number[] {
  const hrs = bandHours(b.hasPeak), w = shapeFor(occupancy);
  const n = spread(b.medianNight, hrs.night, w), o = spread(b.medianOffpeak, hrs.offpeak, w), p = spread(b.medianPeak, hrs.peak, w);
  return n.map((v, h) => v + o[h] + p[h]);
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

/** Which rate band an hour of the day falls in under each Irish tariff structure. */
export function bandOf(h: number, tariff: Tariff): Band {
  if (tariff === 'flat') return 'flat';
  if (isNight(h)) return 'night';
  if (tariff === 'smart' && (h === 17 || h === 18)) return 'peak';
  return 'day';
}
export function bandsOfDay(tariff: Tariff): Band[] {
  return Array.from({ length: 24 }, (_, h) => bandOf(h, tariff));
}
export function rateOfBand(b: Band, a: Assumptions): number {
  return { flat: a.flatRate, night: a.nightRate, day: a.dayRate, peak: a.peakRate }[b];
}
export function rateFor(h: number, a: Assumptions): number {
  return rateOfBand(bandOf(h, a.tariff), a);
}

const BAND_INFO: Record<Band, { label: string }> = {
  flat: { label: 'All day' }, night: { label: 'Night' }, day: { label: 'Day' }, peak: { label: 'Peak' },
};
function windowText(b: Band, tariff: Tariff): string {
  if (b === 'flat') return 'All day, every day';
  if (b === 'night') return '11pm to 8am';
  if (b === 'peak') return '5pm to 7pm';
  return tariff === 'smart' ? '8am to 5pm and 7pm to 11pm' : '8am to 11pm';
}

export interface BandRow {
  band: Band; label: string; window: string; rate: number; hours: number;
  kwhPerDay: number; usePct: number; yearlyCost: number; costPct: number;
}

/**
 * Splits a household's use by rate band. kwhPerDay comes from `dayShape` (the median day when we have
 * meter data, else the average day). Share of use and yearly cost use the full-year profile, so they
 * describe the real total even when the median day is skewed by a few heavy winter days.
 */
export function bandBreakdown(profile: Profile, a: Assumptions, dayShape: number[] = averageDay(profile)): BandRow[] {
  const bands = bandsOfDay(a.tariff);
  const order: Band[] = a.tariff === 'flat' ? ['flat'] : a.tariff === 'dayNight' ? ['night', 'day'] : ['night', 'day', 'peak'];
  const cost: Record<string, number> = {}, yearKwh: Record<string, number> = {};
  profile.forEach((row, m) => row.forEach((kwh, h) => {
    cost[bands[h]] = (cost[bands[h]] ?? 0) + kwh * MONTH_DAYS[m] * rateFor(h, a);
    yearKwh[bands[h]] = (yearKwh[bands[h]] ?? 0) + kwh * MONTH_DAYS[m];
  }));
  const totalYear = Object.values(yearKwh).reduce((x, y) => x + y, 0) || 1;
  const totalCost = Object.values(cost).reduce((x, y) => x + y, 0) || 1;
  return order.map((b) => {
    const kwh = dayShape.reduce((t, v, h) => (bands[h] === b ? t + v : t), 0);
    return {
      band: b, label: BAND_INFO[b].label, window: windowText(b, a.tariff), rate: rateOfBand(b, a),
      hours: bands.filter((x) => x === b).length, kwhPerDay: kwh, usePct: (yearKwh[b] ?? 0) / totalYear,
      yearlyCost: cost[b] ?? 0, costPct: (cost[b] ?? 0) / totalCost,
    };
  });
}

export interface DayStats {
  busiestHour: number; busiestKwh: number;
  baseloadWatts: number; // the lowest hour of the day: what runs all the time
  sunnyHoursPct: number; // share of use between 9am and 5pm, when panels produce most
  totalKwh: number;
}
export function dayStats(shape: number[]): DayStats {
  const total = shape.reduce((a, b) => a + b, 0) || 1;
  let hi = 0;
  shape.forEach((v, h) => { if (v > shape[hi]) hi = h; });
  const sunny = shape.reduce((t, v, h) => (h >= 9 && h < 17 ? t + v : t), 0);
  return { busiestHour: hi, busiestKwh: shape[hi], baseloadWatts: Math.min(...shape) * 1000, sunnyHoursPct: sunny / total, totalKwh: total };
}

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

/** Flat roofs use tilted frames facing south, so the roof direction does not matter. */
export function siteOrientationFactor(h: HomeInputs): number {
  return h.roofType === 'flat' ? roofTypeInfo('flat').yield : orientationFactor(h.orientation);
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
  exportTaxFree: number; // allowance available across the people on the bill
  exportTax: number; // tax paid on export income above the allowance
  annualBenefit: number;
  grossCost: number;
  grossLow: number;
  grossHigh: number;
  breakdown: CostRow[];
  grant: number;
  batteryGrant: number;
  netCost: number;
  paybackYears: number;
  monthlyGen: number[];
  monthlyDemand: number[];
  co2Tonnes: number;
}

export type Eligibility = 'eligible' | 'ineligible' | 'unknown';
export interface GrantEligibility { solar: Eligibility; battery: Eligibility; yearValid: boolean }

/** SEAI solar and battery grants both need a home built and occupied before a cut-off year (2025 at the time of writing). */
export function grantEligibility(h: Pick<HomeInputs, 'yearOccupied'>, now: Date = new Date()): GrantEligibility {
  const y = h.yearOccupied;
  if (y == null || !Number.isFinite(y) || y < 1700 || y > now.getFullYear() + 1) return { solar: 'unknown', battery: 'unknown', yearValid: false };
  const g = PRICES.grants;
  return { solar: y < g.seaiSolarBuiltBefore ? 'eligible' : 'ineligible', battery: y < g.seaiBatteryBuiltBefore ? 'eligible' : 'ineligible', yearValid: true };
}

export function seaiGrantFor(kwp: number): number {
  const g = PRICES.grants;
  const first = Math.min(kwp, 2) * g.seaiSolarFirst2kwpPerKwp;
  const second = Math.max(0, Math.min(kwp, 4) - 2) * g.seaiSolarNext2kwpPerKwp;
  return Math.min(g.seaiSolarMax, Math.round(first + second));
}

export interface CostRow { key: string; label: string; note: string; group: 'solar' | 'battery'; mid: number; low: number; high: number }

interface RowSpec { key: string; label: string; note: string; group: 'solar' | 'battery'; perKwp?: number; base?: number; perKwh?: number; baseBattery?: number; lo: number; hi: number }

/**
 * Shares of the editable cost assumptions. perKwp shares sum to 1 across the solar rows, base shares sum to 1,
 * so changing "cost per kWp" or "cost base" in the assumptions scales the whole breakdown. lo and hi give each
 * line its own typical spread between cheap and expensive installers.
 */
const ROWS: RowSpec[] = [
  { key: 'panels', label: 'Solar panels', note: 'The panels themselves. Brand and efficiency change the price.', group: 'solar', perKwp: 260 / 1250, lo: 0.9, hi: 1.2 },
  { key: 'inverter', label: 'Inverter', note: 'Turns panel output into household power. Hybrid models cost more.', group: 'solar', perKwp: 250 / 1250, lo: 0.9, hi: 1.2 },
  { key: 'mounting', label: 'Mounting and fixings', note: 'Rails, roof hooks and weatherproofing for your roof type.', group: 'solar', perKwp: 160 / 1250, lo: 0.9, hi: 1.15 },
  { key: 'labour', label: 'Installation labour', note: 'Roof and electrical crew time. Grows with system size.', group: 'solar', perKwp: 450 / 1250, lo: 0.85, hi: 1.2 },
  { key: 'electrical', label: 'Electrical work and cabling', note: 'Cabling, protection devices, and consumer unit changes.', group: 'solar', perKwp: 130 / 1250, base: 600 / 2200, lo: 0.85, hi: 1.2 },
  { key: 'access', label: 'Scaffolding and roof access', note: 'Usually a fixed charge. Higher for tall or awkward roofs.', group: 'solar', base: 800 / 2200, lo: 0.8, hi: 1.3 },
  { key: 'admin', label: 'Design, grid application, commissioning', note: 'Survey, ESB Networks notification, testing and handover.', group: 'solar', base: 450 / 2200, lo: 0.9, hi: 1.2 },
  { key: 'cover', label: 'Insurance, warranty and contingency', note: 'Cover on the work and an allowance for surprises.', group: 'solar', base: 350 / 2200, lo: 0.9, hi: 1.25 },
];

/** Itemised installed cost with a typical low to high range for each line. Empty when there are no panels. */
export function costBreakdown(kwp: number, battery: number, a: Assumptions, site?: Pick<HomeInputs, 'roofType' | 'storeys'>): CostRow[] {
  if (kwp <= 0) return [];
  const out: CostRow[] = [];
  for (const r of ROWS) {
    const roof = site ? roofTypeInfo(site.roofType) : null;
    const factor = !site || !roof ? 1 : r.key === 'mounting' ? roof.mounting : r.key === 'labour' ? roof.labour : r.key === 'access' ? STOREY_ACCESS[site.storeys] : 1;
    const raw = (r.base ?? 0) * a.panelCostBase + (r.perKwp ?? 0) * a.panelCostPerKwp * kwp;
    const mid = Math.round(raw * factor);
    out.push({ key: r.key, label: r.label, note: r.note, group: r.group, mid, low: Math.round(mid * r.lo), high: Math.round(mid * r.hi) });
  }
  if (battery > 0) {
    // the installed price covers the unit and its fitting; show roughly three quarters as the unit
    const p = batteryPrice(a.batteryTier, battery), t = batteryTierInfo(a.batteryTier);
    const unit = (v: number) => Math.round(v * 0.75);
    out.push({ key: 'battery', label: `${t.label} battery, ${battery} kWh`, note: `Examples: ${t.examples.slice(0, 2).join(', ')}.`, group: 'battery', mid: unit(p.mid), low: unit(p.low), high: unit(p.high) });
    out.push({ key: 'battery-install', label: 'Battery installation and gateway', note: 'Wiring, mounting, controls and commissioning.', group: 'battery', mid: p.mid - unit(p.mid), low: p.low - unit(p.low), high: p.high - unit(p.high) });
  }
  return out;
}

export function systemCost(kwp: number, battery: number, a: Assumptions, site?: Pick<HomeInputs, 'roofType' | 'storeys'>): number {
  return costBreakdown(kwp, battery, a, site).reduce((t, r) => t + r.mid, 0);
}

/** ESB Networks limits a home connection by inverter size: about 6 kVA single-phase, 11 kVA three-phase. */
export const CONNECTION_LIMIT_KW = { single: 6, three: 11 };

export function connectionLimitPanels(home: HomeInputs, a: Assumptions): number {
  const kw = home.threePhase ? CONNECTION_LIMIT_KW.three : CONNECTION_LIMIT_KW.single;
  return Math.floor((kw * 1000) / a.panelWatts);
}

export function roofFitPanels(home: HomeInputs, a: Assumptions): number {
  return Math.floor(usableArea(home) / a.panelAreaM2);
}

export function maxPanels(home: HomeInputs, a: Assumptions): number {
  return Math.max(2, Math.min(30, roofFitPanels(home, a), connectionLimitPanels(home, a)));
}

/** Simulate a typical day per month at hourly steps. */
export function simulate(usage: Usage, home: HomeInputs, a: Assumptions, cfg: Config): Result {
  const kwp = (cfg.panels * a.panelWatts) / 1000;
  const genAnnual = kwp * a.yieldPerKwp * siteOrientationFactor(home) * shadingFactor(home.shading);
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
      const rate = rateFor(h, a);
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

  const breakdown = costBreakdown(kwp, cap, a, home);
  const gross = breakdown.reduce((t, r) => t + r.mid, 0);
  const grossLow = breakdown.reduce((t, r) => t + r.low, 0);
  const grossHigh = breakdown.reduce((t, r) => t + r.high, 0);
  const elig = grantEligibility(home);
  const grant = a.seaiGrant && kwp > 0 && elig.solar !== 'ineligible' ? seaiGrantFor(kwp) : 0;
  const batteryGrant = a.seaiBatteryGrant && cap >= PRICES.grants.seaiBatteryMinKwh && kwp > 0 && elig.battery !== 'ineligible' ? PRICES.grants.seaiBattery : 0;
  const net = Math.max(0, gross - grant - batteryGrant);
  const saving = billBefore - billAfter;
  const exportTaxFree = a.exportTaxFreePerPerson * home.taxpayers;
  const exportTax = Math.max(0, exportIncome - exportTaxFree) * a.exportTaxRate;
  const benefit = saving + exportIncome - exportTax;
  return {
    kwp, panels: cfg.panels, batteryKwh: cap,
    generationKwh: gen, selfUseKwh: self, exportKwh: exp, importKwh: imp, baselineImportKwh: baseImp,
    selfSufficiency: baseImp ? self / baseImp : 0,
    selfConsumption: gen ? self / gen : 0,
    billBefore, billAfter, billSaving: saving, exportIncome, exportTaxFree, exportTax, annualBenefit: benefit,
    grossCost: gross, grossLow, grossHigh, breakdown,
    grant, batteryGrant, netCost: net,
    paybackYears: benefit > 0 ? net / benefit : Infinity,
    monthlyGen, monthlyDemand,
    co2Tonnes: (self * a.co2KgPerKwh) / 1000,
  };
}

export interface Scenario extends Result { label: string; blurb: string; key: string; }

export const BATTERY_OPTIONS = [0, ...BATTERY_SIZES];

/** Evaluate a grid of panels x battery and return the three headline strategies. */
export function buildGrid(usage: Usage, home: HomeInputs, a: Assumptions): Result[] {
  const max = maxPanels(home, a);
  const out: Result[] = [];
  const sizes: number[] = [];
  for (let p = Math.min(4, max); p <= max; p += 2) sizes.push(p);
  if (sizes[sizes.length - 1] !== max) sizes.push(max);
  for (const p of sizes) for (const b of BATTERY_OPTIONS) out.push(simulate(usage, home, a, { panels: p, batteryKwh: b }));
  return out;
}

/** How far above a home's own yearly use the generation may go before we stop recommending more panels. */
export const BEST_MAX_GEN_RATIO = 1.25;
export const BOLD_MAX_GEN_RATIO = 1.5;

export function pickStrategies(grid: Result[], years = 20): Scenario[] {
  const value = (r: Result) => r.annualBenefit * years * 0.92 - r.netCost; // 8% allowance for degradation
  const viable = grid.filter((r) => isFinite(r.paybackYears));
  const pool = viable.length ? viable : grid;
  // Selling surplus power is worth less and less certain than using it, so cap how much we oversize.
  const within = (ratio: number) => {
    const ok = pool.filter((r) => r.generationKwh <= ratio * r.baselineImportKwh);
    return ok.length ? ok : [[...pool].sort((x, y) => x.generationKwh - y.generationKwh)[0]];
  };
  const lean = [...pool].sort((x, y) => x.netCost - y.netCost)[0];
  const best = [...within(BEST_MAX_GEN_RATIO)].sort((x, y) => value(y) - value(x))[0];
  const bold = [...within(BOLD_MAX_GEN_RATIO)].sort((x, y) => y.selfSufficiency - x.selfSufficiency || value(y) - value(x))
    .filter((r) => value(r) > -0.2 * r.netCost)[0] ?? best;
  const mk = (r: Result, key: string, label: string, blurb: string): Scenario => ({ ...r, key, label, blurb });
  return [
    mk(lean, 'lean', 'Lowest outlay', 'Smallest spend that still pays its way.'),
    mk(best, 'best', 'Best value', 'Highest return without oversizing for exports.'),
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

/** Average unit rate across a typical home's use, weighted by when the power is used. */
export function blendedRate(a: Assumptions, nightShare = 0.25): number {
  if (a.tariff === 'flat') return a.flatRate;
  if (a.tariff === 'dayNight') return a.dayRate * (1 - nightShare) + a.nightRate * nightShare;
  return a.nightRate * nightShare + a.peakRate * 0.12 + a.dayRate * (1 - nightShare - 0.12);
}

export function annualFromBill(monthlyBill: number, a: Assumptions, nightShare = 0.25): number {
  // Take off the standing charge and levies first, then divide by the average unit rate.
  return Math.max(500, Math.round(((monthlyBill - a.standingChargeMonthly) * 12) / blendedRate(a, nightShare)));
}

/** Typical sunny-ish day of solar output (kWh per hour) for a month index, for charts. */
export function solarDay(home: HomeInputs, a: Assumptions, panels: number, month: number): number[] {
  const kwp = (panels * a.panelWatts) / 1000;
  const annual = kwp * a.yieldPerKwp * siteOrientationFactor(home) * shadingFactor(home.shading);
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
