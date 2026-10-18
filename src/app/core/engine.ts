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
  tariffs: { flat: number; day: number; night: number; peak: number; export: number; exportPremium: number; standingChargeMonthly: number };
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

/**
 * Battery sizes the planner tests, from the module and pack sizes the main brands sell (see BATTERY_PRODUCTS).
 * Real products are nominal capacity; ask each installer for usable kWh.
 */
export const BATTERY_SIZES = [5, 7, 8, 10, 13.5, 15, 20];

/** What each common brand sells, from manufacturer product ranges. Nominal kWh, so usable capacity is a little lower. */
export const BATTERY_PRODUCTS: { brand: string; tier: BatteryTier; sizes: string; note: string }[] = [
  { brand: 'Huawei LUNA2000', tier: 'mainstream', sizes: '5, 7, 10, 14, 15, 21 kWh', note: 'Modular packs of 5, 7 or 10 kWh stacked up to three high.' },
  { brand: 'GivEnergy', tier: 'value', sizes: '2.6, 5.2, 8.2, 9.5, 13.5 kWh', note: 'Single units and an all-in-one; larger systems stack several.' },
  { brand: 'Sungrow SBR', tier: 'mainstream', sizes: '9.6, 12.8, 16, 19.2, 22.4, 25.6 kWh', note: 'Built in 3.2 kWh modules, usually from 9.6 kWh up.' },
  { brand: 'Tesla Powerwall 3', tier: 'premium', sizes: '13.5 kWh', note: 'One size, with the inverter built in.' },
  { brand: 'Sigenergy SigenStor', tier: 'premium', sizes: '5, 8, 10, 13, 16, 20, 24, 30 kWh', note: 'Modules of 5 or 8 kWh, scalable in steps.' },
  { brand: 'SolarEdge Home Battery', tier: 'premium', sizes: '4.6, 9.2, 13.8 kWh', note: 'Built from 4.6 kWh batteries, up to three together.' },
  { brand: 'BYD Battery-Box HVS', tier: 'value', sizes: '5.1, 7.7, 10.2, 12.8 kWh', note: 'High-voltage stack in 2.56 kWh steps.' },
  { brand: 'Fox ESS', tier: 'value', sizes: '4.7, 5.8, 8.3, 11.6, 16.6 kWh', note: 'EQ4800 and ECS ranges, stacked.' },
  { brand: 'SolaX Triple Power', tier: 'value', sizes: '5.8, 11.6, 17.4 kWh', note: '5.8 kWh modules, stacked.' },
  { brand: 'Enphase IQ Battery', tier: 'premium', sizes: '5, 10, 15 kWh', note: '5 kWh units, up to several together; works with Enphase microinverters.' },
  { brand: 'myenergi Libbi', tier: 'mainstream', sizes: '5, 10, 15, 20 kWh', note: '5 kWh modules with its own inverter.' },
  { brand: 'Pylontech and Dyness', tier: 'value', sizes: '3.5, 4.8, 5.1 kWh modules', note: 'Low-voltage modules, often stacked to 10 to 20 kWh.' },
];

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
  /** VAT added to unit rates and standing charge on an Irish electricity bill. 9% on the bill we based the presets on. */
  vat: number;
  tariffInflation: number; // per year
  yieldPerKwp: number; // kWh per kWp per year, south, ~35 degrees
  panelWatts: number; // rated watts per panel, editable; 465 W is a common current panel
  panelAreaM2: number;
  panelCostBase: number; // fixed install cost
  panelCostPerKwp: number;
  batteryTier: BatteryTier;
  batteryEfficiency: number;
  seaiGrant: boolean;
  /** The household plans to sell surplus power, so the panel count may go past the connection limit up to what the roof fits. */
  exportExtra: boolean;
  /** Charge the battery from the grid in the cheapest band (night) as well as from solar. Only used with a day/night or smart tariff. */
  gridCharge: boolean;
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
  vat: 0.09,
  tariffInflation: 0.02,
  yieldPerKwp: PRICES.solar.yieldPerKwp,
  panelWatts: 465,
  panelAreaM2: 2.0,
  panelCostBase: PRICES.solar.costBase,
  panelCostPerKwp: PRICES.solar.costPerKwp,
  batteryTier: 'mainstream',
  batteryEfficiency: 0.9,
  seaiGrant: true,
  exportExtra: false,
  gridCharge: false,
  seaiBatteryGrant: PRICES.grants.seaiBatteryConfirmed,
  exportTaxFreePerPerson: PRICES.tax.exportExemptionPerPerson,
  exportTaxRate: PRICES.tax.exportTaxRate,
  co2KgPerKwh: 0.3,
};

export type ExportPresetKey = 'typical' | 'premium';

/** Export rates in euro per kWh. Typical is the average supplier rate; premium is the best rate some suppliers pay. */
export const EXPORT_PRESETS: { key: ExportPresetKey; label: string; rate: number; hint: string }[] = [
  { key: 'typical', label: 'Typical', rate: PRICES.tariffs.export, hint: 'The average rate suppliers pay under the Clean Export Guarantee.' },
  { key: 'premium', label: 'Premium', rate: PRICES.tariffs.exportPremium, hint: 'The best rate some suppliers pay, often tied to taking their electricity too.' },
];

export type RatePresetKey = 'below' | 'typical' | 'above';

/** Unit rates before VAT and the supplier discount, read from a real Irish bill (day 38.65c, night 21.25c, peak 43.4c). */
const BILL_RATES_EX_VAT = { day: 0.3865, night: 0.2125, peak: 0.434 };
const BILL_DISCOUNT = 0.32;

export const RATE_PRESETS: { key: RatePresetKey; label: string; hint: string }[] = [
  { key: 'below', label: 'Below typical', hint: 'A supplier plan with about a 32% discount on unit rates, as on a real bill.' },
  { key: 'typical', label: 'Typical', hint: 'An average day and night plan, from published rates.' },
  { key: 'above', label: 'Above typical', hint: 'Standard list rates with no discount, as on a real bill.' },
];

/** Unit rates including VAT for a preset. The flat rate follows the day rate. */
export function ratePreset(key: RatePresetKey, vat: number): Pick<Assumptions, 'flatRate' | 'dayRate' | 'nightRate' | 'peakRate'> {
  const t = PRICES.tariffs;
  if (key === 'typical') return { flatRate: t.flat, dayRate: t.day, nightRate: t.night, peakRate: t.peak };
  const f = (1 - (key === 'below' ? BILL_DISCOUNT : 0)) * (1 + vat);
  const day = BILL_RATES_EX_VAT.day * f;
  return { flatRate: t.flat * (day / t.day), dayRate: day, nightRate: BILL_RATES_EX_VAT.night * f, peakRate: BILL_RATES_EX_VAT.peak * f };
}

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
  /** The file has export readings, so the home may already have solar. */
  hasExport?: boolean;
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

export interface BandFlow { band: Band; beforeKwh: number; beforeCost: number; afterKwh: number; afterCost: number }

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
  /** Today's price of the parts that wear out sooner than the panels, used for the replacement years in the projection. */
  inverterCost: number;
  batteryCost: number;
  /** Where each year's electricity comes from, in kWh, by time of day (night is 11pm to 8am whatever the tariff). Solar and battery cover some; the rest is bought from the grid. */
  supply: { direct: number; battery: number; batteryNight: number; gridDay: number; gridNight: number };
  /** Cost and kWh by rate band, before and after solar, over a year. */
  byBand: BandFlow[];
  /** Money in hand after 25 years once the cost, replacements and tax are counted. */
  netGain: number;
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

/** Most panels the planner will use. Normally the connection limit; with a plan to export, whatever the roof fits (up to 30). */
export function maxPanels(home: HomeInputs, a: Assumptions): number {
  const fit = roofFitPanels(home, a);
  return Math.max(2, Math.min(30, a.exportExtra ? fit : Math.min(fit, connectionLimitPanels(home, a))));
}

/** Real sunny-hour output runs about 40% above the smooth typical-day average, so the inverter limit starts to bite earlier than the average suggests. */
const SUNNY_PEAK = 1.4;

/** The inverter's output limit in kW. Panels beyond this size still generate, but output above the limit is lost. */
export function inverterLimitKw(home: HomeInputs): number {
  return home.threePhase ? CONNECTION_LIMIT_KW.three : CONNECTION_LIMIT_KW.single;
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
  const limitKw = inverterLimitKw(home);
  // Charging from the grid only pays when the cheapest band, after round-trip losses, still undercuts the band it displaces.
  const cheapRate = a.nightRate;
  const gridCharges = cap > 0 && a.gridCharge && a.tariff !== 'flat' && cheapRate / a.batteryEfficiency < a.dayRate;

  const zero = (): Record<Band, number> => ({ flat: 0, night: 0, day: 0, peak: 0 });
  const yBefore = zero(), yAfter = zero();
  let yDirect = 0, yBattery = 0, yBatteryNight = 0, yGridDay = 0, yGridNight = 0;
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
    // Pre-pass for the day: what solar leaves uncovered outside the cheap hours, and what surplus it has to charge with.
    const gHour = w.map((x) => Math.min(limitKw / SUNNY_PEAK, (x / ws) * gDay));
    let needDay = 0, surplusDay = 0;
    if (gridCharges) {
      for (let h = 0; h < 24; h++) {
        if (bandOf(h, a.tariff) === 'night') continue;
        const l = usage.profile[m][h];
        needDay += Math.max(0, l - gHour[h]);
        surplusDay += Math.max(0, gHour[h] - l);
      }
    }
    // Stored energy to bring in overnight: what the day needs beyond what solar surplus would cover.
    const gridTarget = gridCharges ? Math.min(usable, Math.max(0, needDay - Math.min(usable, surplusDay) * eff) / eff) : 0;
    let socSolar = 0, socGrid = 0;
    let dGen = 0, dSelf = 0, dExp = 0, dImp = 0, dBase = 0, dBefore = 0, dAfter = 0, dIncome = 0, dDemand = 0;
    const bBefore = zero(), bAfter = zero();
    let dDirect = 0, dBattery = 0, dBatteryNight = 0, dGridDay = 0, dGridNight = 0;
    for (let h = 0; h < 24; h++) {
      const g = gHour[h];
      const band = bandOf(h, a.tariff);
      const load = usage.profile[m][h];
      const rate = rateFor(h, a);
      const cheap = bandOf(h, a.tariff) === 'night';
      dGen += g; dDemand += load;
      dBase += load; dBefore += load * rate; bBefore[band] += load;
      const direct = Math.min(g, load);
      let surplus = g - direct;
      let deficit = load - direct;
      let fromBat = 0, fromBatSolar = 0;
      if (cap > 0) {
        const soc = socSolar + socGrid;
        const charge = Math.min(surplus, maxRate, (usable - soc) / eff);
        if (charge > 0) { socSolar += charge * eff; surplus -= charge; }
        if (gridCharges && cheap && h < 8) {
          const room = Math.min(gridTarget - (socSolar + socGrid), maxRate * eff);
          if (room > 0) {
            const drawn = room / eff;
            socGrid += room;
            dImp += drawn; dAfter += drawn * rate; bAfter[band] += drawn; dGridNight += drawn;
          }
        }
        if (!(gridCharges && cheap)) {
          const total = socSolar + socGrid;
          const dis = Math.min(deficit, maxRate, total * eff);
          if (dis > 0) {
            const solarShare = total > 0 ? socSolar / total : 0;
            socSolar -= (dis / eff) * solarShare; socGrid -= (dis / eff) * (1 - solarShare);
            deficit -= dis; fromBat = dis; fromBatSolar = dis * solarShare;
          }
        }
      }
      dSelf += direct + fromBatSolar;
      dDirect += direct; dBattery += fromBat;
      if (isNight(h)) { dBatteryNight += fromBat; dGridNight += deficit; } else dGridDay += deficit;
      bAfter[band] += deficit;
      dExp += surplus;
      dImp += deficit;
      dAfter += deficit * rate;
      dIncome += surplus * a.exportRate;
    }
    for (const b of ['flat', 'night', 'day', 'peak'] as Band[]) { yBefore[b] += bBefore[b] * days; yAfter[b] += bAfter[b] * days; }
    yDirect += dDirect * days; yBattery += dBattery * days; yBatteryNight += dBatteryNight * days; yGridDay += dGridDay * days; yGridNight += dGridNight * days;
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
  // Grants are counted only once the year the home was first occupied is known and qualifies.
  const grant = a.seaiGrant && kwp > 0 && elig.solar === 'eligible' ? seaiGrantFor(kwp) : 0;
  const batteryGrant = a.seaiBatteryGrant && cap >= PRICES.grants.seaiBatteryMinKwh && kwp > 0 && elig.battery === 'eligible' ? PRICES.grants.seaiBattery : 0;
  const net = Math.max(0, gross - grant - batteryGrant);
  const saving = billBefore - billAfter;
  const exportTaxFree = a.exportTaxFreePerPerson * home.taxpayers;
  const exportTax = Math.max(0, exportIncome - exportTaxFree) * a.exportTaxRate;
  const benefit = saving + exportIncome - exportTax;
  const inverterCost = breakdown.find((r) => r.key === 'inverter')?.mid ?? 0;
  const batteryCost = breakdown.filter((r) => r.group === 'battery').reduce((t, r) => t + r.mid, 0);
  const flow = project({ billSaving: saving, exportIncome, exportTaxFree, netCost: net, inverterCost, batteryCost }, a);
  return {
    kwp, panels: cfg.panels, batteryKwh: cap,
    generationKwh: gen, selfUseKwh: self, exportKwh: exp, importKwh: imp, baselineImportKwh: baseImp,
    selfSufficiency: baseImp ? self / baseImp : 0,
    selfConsumption: gen ? self / gen : 0,
    billBefore, billAfter, billSaving: saving, exportIncome, exportTaxFree, exportTax, annualBenefit: benefit,
    grossCost: gross, grossLow, grossHigh, breakdown,
    grant, batteryGrant, netCost: net,
    paybackYears: benefit > 0 ? paybackFrom(flow) : Infinity,
    inverterCost, batteryCost, netGain: flow[flow.length - 1].cumulative,
    supply: { direct: yDirect, battery: yBattery, batteryNight: yBatteryNight, gridDay: yGridDay, gridNight: yGridNight },
    byBand: (['flat', 'night', 'day', 'peak'] as Band[]).filter((b) => yBefore[b] > 0 || yAfter[b] > 0).map((b) => ({
      band: b, beforeKwh: yBefore[b], beforeCost: yBefore[b] * rateOfBand(b, a), afterKwh: yAfter[b], afterCost: yAfter[b] * rateOfBand(b, a),
    })),
    monthlyGen, monthlyDemand,
    co2Tonnes: (self * a.co2KgPerKwh) / 1000,
  };
}

export interface ExportTaxLine { people: number; allowance: number; taxable: number; tax: number; kept: number }

/** What a year of export income leaves after tax, for a given number of people on the bill. */
export function exportTaxFor(income: number, people: number, a: Assumptions): ExportTaxLine {
  const allowance = a.exportTaxFreePerPerson * people;
  const taxable = Math.max(0, income - allowance);
  const tax = taxable * a.exportTaxRate;
  return { people, allowance, taxable, tax, kept: income - tax };
}

/** Standard and higher rate income tax with USC and PRSI, as a rough guide to the tax on export income above the allowance. */
export const EXPORT_TAX_RATES = [
  { rate: 0.28, label: 'Standard rate', hint: 'About 28% with USC and PRSI' },
  { rate: 0.48, label: 'Higher rate', hint: 'About 48% with USC and PRSI' },
];

export interface Scenario extends Result { label: string; blurb: string; key: string; meetsGoals?: boolean }

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

/** What the household wants from the system: the share of its own use covered, and the export income it hopes for. */
export type Lean = 'solar' | 'balanced' | 'battery';
export type BatteryMode = 'any' | 'none' | 'required';
export interface Goals { cover: number; exportIncome: number; /** Which way to tip the mix when several meet the goals. Balanced picks the cheapest. */ lean?: Lean; /** Whether the mix may, may not, or must include a battery. */ battery?: BatteryMode }
export const DEFAULT_GOALS: Goals = { cover: 0.6, exportIncome: 0, lean: 'balanced' };

export function pickStrategies(grid: Result[], exportExtra = false, goals: Goals = DEFAULT_GOALS): Scenario[] {
  const value = (r: Result) => r.netGain;
  const viable = grid.filter((r) => isFinite(r.paybackYears));
  const pool = viable.length ? viable : grid;
  // Selling surplus power is worth less and less certain than using it, so cap how much we oversize.
  const within = (ratio: number) => {
    if (exportExtra) ratio = Infinity; // the household plans to sell surplus, so size on return alone
    const ok = pool.filter((r) => r.generationKwh <= ratio * r.baselineImportKwh);
    return ok.length ? ok : [[...pool].sort((x, y) => x.generationKwh - y.generationKwh)[0]];
  };
  const lean = [...pool].sort((x, y) => x.netCost - y.netCost)[0];

  // Size from the goals, not from the roof: the cheapest panel and battery pair that covers the share of use asked
  // for and earns the export income asked for. An export goal lifts the oversizing cap, since it asks for surplus.
  const meets = (r: Result) => r.selfSufficiency >= goals.cover - 1e-9 && r.exportIncome >= goals.exportIncome - 1e-9;
  const allowed = (r: Result) => goals.battery === 'none' ? r.batteryKwh === 0 : goals.battery === 'required' ? r.batteryKwh > 0 : true;
  const base = goals.exportIncome > 0 ? pool : within(BEST_MAX_GEN_RATIO);
  const candidates = base.filter(allowed).length ? base.filter(allowed) : base;
  const hits = candidates.filter(meets);
  const progress = (r: Result) => Math.min(1, r.selfSufficiency / Math.max(goals.cover, 1e-9)) + (goals.exportIncome > 0 ? Math.min(1, r.exportIncome / goals.exportIncome) : 0);
  // Among the systems that meet the goals: balanced is the cheapest, "more solar" uses the least battery, and
  // "more battery" uses the fewest panels, with cost breaking ties.
  const order = (x: Result, y: Result) => goals.lean === 'solar'
    ? x.batteryKwh - y.batteryKwh || x.netCost - y.netCost
    : goals.lean === 'battery'
      ? x.panels - y.panels || x.netCost - y.netCost
      : x.netCost - y.netCost || value(y) - value(x);
  const best = hits.length
    ? [...hits].sort(order)[0]
    : [...candidates].sort((x, y) => progress(y) - progress(x) || x.netCost - y.netCost)[0];
  const bold = [...within(BOLD_MAX_GEN_RATIO)].sort((x, y) => y.selfSufficiency - x.selfSufficiency || value(y) - value(x))
    .filter((r) => value(r) > -0.2 * r.netCost)[0] ?? best;
  const mk = (r: Result, key: string, label: string, blurb: string, meetsGoals?: boolean): Scenario => ({ ...r, key, label, blurb, meetsGoals });
  return [
    mk(lean, 'lean', 'Lowest outlay', 'Smallest spend that still pays its way.'),
    mk(best, 'best', 'Right size', hits.length ? 'Smallest system that meets your coverage and export goals.' : 'Gets closest to your goals within your roof and connection.', hits.length > 0),
    mk(bold, 'bold', 'Most independent', 'Covers as much of your usage as sensible.'),
  ];
}

export interface MixNote { kind: 'battery-unused' | 'mostly-exported'; text: string }

/**
 * Plain-English warnings when panels and battery are badly matched. A battery is judged by how much of its usable
 * capacity a typical day actually uses; panels by how much of their output is exported rather than used.
 */
export function mixWarnings(r: Result, a: Assumptions, exportGoal = 0): MixNote[] {
  const notes: MixNote[] = [];
  if (r.kwp <= 0) return notes;
  if (r.batteryKwh > 0) {
    const usable = r.batteryKwh * 0.9;
    const use = r.supply.battery / (usable * 365);
    if (use < 0.5) notes.push({ kind: 'battery-unused', text: `A typical day uses only about ${Math.round(use * 100)}% of this ${r.batteryKwh} kWh battery, so it rarely fills. A smaller battery or more panels would use it better.` });
  }
  const exportShare = r.generationKwh > 0 ? r.exportKwh / r.generationKwh : 0;
  if (exportShare > 0.6 && exportGoal <= 0) notes.push({ kind: 'mostly-exported', text: `About ${Math.round(exportShare * 100)}% of what these panels make is exported at ${Math.round(a.exportRate * 100)}c instead of used at home. Fewer panels, or a battery to hold the surplus, would use more of it yourself.` });
  return notes;
}

export type ZoneKey = 'night' | 'peak' | 'day';

export const ZONES: { key: ZoneKey; label: string; when: string; hours: number[] }[] = [
  { key: 'night', label: 'Night', when: '11pm to 8am', hours: [23, 0, 1, 2, 3, 4, 5, 6, 7] },
  { key: 'peak', label: 'Peak', when: '5pm to 7pm', hours: [17, 18] },
  { key: 'day', label: 'Day', when: '8am to 5pm and 7pm to 11pm', hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 22] },
];

export interface ZoneNeed { key: ZoneKey; label: string; when: string; average: number; winter: number; summer: number }
export interface BatteryZones {
  zones: ZoneNeed[];
  /** Solar left after the house has used what it needs, per day, that could charge a battery. */
  surplusAverage: number;
  surplusWinter: number;
}

/**
 * What a battery would have to supply in each time of day, in kWh a day: the household's use in those hours less
 * what the panels cover directly at the same time. Averaged over the year, with December and June for the extremes.
 */
export function batteryZones(usage: Usage, home: HomeInputs, a: Assumptions, panels: number): BatteryZones {
  const gen = Array.from({ length: 12 }, (_, m) => (panels > 0 ? solarDay(home, a, panels, m) : new Array(24).fill(0)));
  const total = MONTH_DAYS.reduce((s, d) => s + d, 0);
  const need = (m: number, hours: number[]) => hours.reduce((s, h) => s + Math.max(0, usage.profile[m][h] - gen[m][h]), 0);
  const zones = ZONES.map((z) => ({
    key: z.key, label: z.label, when: z.when,
    average: MONTH_DAYS.reduce((s, d, m) => s + need(m, z.hours) * d, 0) / total,
    winter: need(11, z.hours), summer: need(5, z.hours),
  }));
  const surplus = (m: number) => gen[m].reduce((s, g, h) => s + Math.max(0, g - usage.profile[m][h]), 0);
  return { zones, surplusAverage: MONTH_DAYS.reduce((s, d, m) => s + surplus(m) * d, 0) / total, surplusWinter: surplus(11) };
}

export interface ZoneSize {
  /** Usable kWh the chosen times need on an average day. */
  needKwh: number;
  /** Nominal kWh to buy, after the 10% reserve. */
  nominalKwh: number;
  /** The smallest standard size that covers it, or the largest standard size when none is big enough. */
  size: number;
  tooBig: boolean;
  /** Share of the need a day of solar surplus could charge on average, and in December. */
  chargedAverage: number;
  chargedWinter: number;
}

/** Recommends a battery size for the times of day the household wants covered. */
export function sizeForZones(z: BatteryZones, selected: ZoneKey[]): ZoneSize {
  const chosen = z.zones.filter((x) => selected.includes(x.key));
  const needKwh = chosen.reduce((s, x) => s + x.average, 0);
  const nominalKwh = needKwh / 0.9; // 10% is kept in reserve
  const fit = BATTERY_SIZES.find((s) => s >= nominalKwh);
  const winterNeed = chosen.reduce((s, x) => s + x.winter, 0);
  return {
    needKwh, nominalKwh,
    size: needKwh <= 0 ? 0 : fit ?? BATTERY_SIZES[BATTERY_SIZES.length - 1],
    tooBig: needKwh > 0 && fit === undefined,
    chargedAverage: needKwh > 0 ? Math.min(1, (z.surplusAverage * 0.9) / needKwh) : 1,
    chargedWinter: winterNeed > 0 ? Math.min(1, (z.surplusWinter * 0.9) / winterNeed) : 1,
  };
}

export interface StrategyTemplate {
  key: string; label: string; blurb: string;
  goals: (h: Pick<HomeInputs, 'taxpayers'>) => Goals;
  exportExtra: boolean;
  gridCharge: boolean;
  /** Needs a day and night or smart tariff; a flat tariff is switched to day and night. */
  needsTimeOfUse?: boolean;
}

/** The strategies Irish households most often choose between, from solar for the day through to near independence. */
export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  { key: 'lowest', label: 'Lowest cost', blurb: 'Panels only, sized small. The quickest payback and the least money at risk.', goals: () => ({ cover: 0.25, exportIncome: 0, lean: 'balanced', battery: 'none' }), exportExtra: false, gridCharge: false },
  { key: 'daytime', label: 'Solar for the daytime', blurb: 'Panels only, no battery. Use the sun while it shines and sell the rest. Suits homes busy in the day.', goals: () => ({ cover: 0.35, exportIncome: 0, lean: 'balanced', battery: 'none' }), exportExtra: false, gridCharge: false },
  { key: 'evening', label: 'Solar and a battery for the evening', blurb: 'The battery stores daytime solar and runs the evening and night. The most common pairing.', goals: () => ({ cover: 0.6, exportIncome: 0, lean: 'balanced', battery: 'required' }), exportExtra: false, gridCharge: false },
  { key: 'night-rate', label: 'Battery charged at the night rate', blurb: 'Solar in the day, and the battery tops up overnight on cheap power to cover the expensive hours.', goals: () => ({ cover: 0.65, exportIncome: 0, lean: 'balanced', battery: 'required' }), exportExtra: false, gridCharge: true, needsTimeOfUse: true },
  { key: 'export', label: 'Solar for export income', blurb: 'More panels than you use, to sell the surplus. Aims at the tax-free export allowance.', goals: (h) => ({ cover: 0.4, exportIncome: 600 * h.taxpayers, lean: 'solar', battery: 'none' }), exportExtra: true, gridCharge: false },
  { key: 'independent', label: 'Near independence', blurb: 'Big battery and enough panels to cover most of your use, with export on top. Still connected to the grid.', goals: () => ({ cover: 0.85, exportIncome: 0, lean: 'balanced', battery: 'required' }), exportExtra: true, gridCharge: false },
];

/** What a template would recommend for this home and usage, with its own export and charging settings. */
export function templateResult(t: StrategyTemplate, usage: Usage, home: HomeInputs, a: Assumptions): Scenario {
  const aa: Assumptions = { ...a, exportExtra: t.exportExtra, gridCharge: t.gridCharge, tariff: t.needsTimeOfUse && a.tariff === 'flat' ? 'dayNight' : a.tariff };
  return pickStrategies(buildGrid(usage, home, aa), aa.exportExtra, t.goals(home))[1];
}

export interface Cashflow {
  year: number;
  cumulative: number;
  /** Bill saving plus export income less export tax in this year. */
  benefit: number;
  /** Cost of replacing the inverter or battery in this year, if any. */
  replacement: number;
}

/** Assumptions for the long view. Inverters and batteries wear out before panels, and replacements cost less than today's price. */
export const LIFETIME = {
  years: 25,
  panelAgeing: 0.005, // output lost a year
  inverterYear: 13,
  inverterCostShare: 0.8,
  batteryYear: 15,
  batteryCostShare: 0.6,
};

export interface ProjectionInput {
  billSaving: number; // year-one bill saving
  exportIncome: number; // year-one export income
  exportTaxFree: number; // allowance for everyone on the bill
  netCost: number; // after grants
  inverterCost: number;
  batteryCost: number;
}

/**
 * Year-by-year money. Panels age, the bill saving rises with electricity prices, export income stays at today's rate
 * (the rate is not guaranteed to rise), export tax is worked out each year, and the inverter and battery are replaced.
 */
export function project(p: ProjectionInput, a: Assumptions, years = LIFETIME.years): Cashflow[] {
  const out: Cashflow[] = [{ year: 0, cumulative: -p.netCost, benefit: 0, replacement: 0 }];
  let cum = -p.netCost;
  for (let y = 1; y <= years; y++) {
    const degr = Math.pow(1 - LIFETIME.panelAgeing, y - 1);
    const saving = p.billSaving * degr * Math.pow(1 + a.tariffInflation, y - 1);
    const income = p.exportIncome * degr;
    const tax = Math.max(0, income - p.exportTaxFree) * a.exportTaxRate;
    const benefit = saving + income - tax;
    const replacement =
      (y === LIFETIME.inverterYear ? p.inverterCost * LIFETIME.inverterCostShare : 0) +
      (y === LIFETIME.batteryYear ? p.batteryCost * LIFETIME.batteryCostShare : 0);
    cum += benefit - replacement;
    out.push({ year: y, cumulative: cum, benefit, replacement });
  }
  return out;
}

/** Years until the running total first reaches zero, with the fraction of the final year. Infinity when it never does. */
export function paybackFrom(flow: Cashflow[]): number {
  for (let i = 1; i < flow.length; i++) {
    if (flow[i].cumulative >= 0) {
      const prev = flow[i - 1].cumulative;
      return i - 1 + -prev / (flow[i].cumulative - prev);
    }
  }
  return Infinity;
}

export function cashflow(r: Result, a: Assumptions, years = LIFETIME.years): Cashflow[] {
  return project({ billSaving: r.billSaving, exportIncome: r.exportIncome, exportTaxFree: r.exportTaxFree, netCost: r.netCost, inverterCost: r.inverterCost, batteryCost: r.batteryCost }, a, years);
}

export interface RangeCase { key: 'cautious' | 'expected' | 'optimistic'; label: string; note: string; netCost: number; yearly: number; payback: number; netGain: number }

/**
 * The same plan under a cautious, an expected and an optimistic outlook. Cautious: dearer install, 10% less output,
 * no electricity price rises. Optimistic: cheaper install, 5% more output, 4% price rises a year.
 */
export function paybackRange(r: Result, a: Assumptions): RangeCase[] {
  const grants = r.grant + r.batteryGrant;
  const run = (key: RangeCase['key'], label: string, note: string, gross: number, output: number, inflation: number): RangeCase => {
    const netCost = Math.max(0, gross - grants);
    const flow = project({
      billSaving: r.billSaving * output, exportIncome: r.exportIncome * output, exportTaxFree: r.exportTaxFree,
      netCost, inverterCost: r.inverterCost, batteryCost: r.batteryCost,
    }, { ...a, tariffInflation: inflation });
    return { key, label, note, netCost, yearly: flow[1].benefit, payback: paybackFrom(flow), netGain: flow[flow.length - 1].cumulative };
  };
  return [
    run('cautious', 'Cautious', 'Dearer quote, 10% less output, no price rises', r.grossHigh, 0.9, 0),
    run('expected', 'Expected', 'Typical quote and output, your price rise assumption', r.grossCost, 1, a.tariffInflation),
    run('optimistic', 'Optimistic', 'Cheaper quote, 5% more output, 4% price rises', r.grossLow, 1.05, 0.04),
  ];
}

export interface Loan { monthly: number; total: number; interest: number }

/** Monthly repayment on a standard amortising loan. A zero rate just spreads the amount evenly. */
export function loanPayment(principal: number, annualRatePct: number, years: number): Loan {
  const n = Math.max(1, Math.round(years * 12));
  const i = annualRatePct / 100 / 12;
  const monthly = principal <= 0 ? 0 : i === 0 ? principal / n : (principal * i) / (1 - Math.pow(1 + i, -n));
  const total = monthly * n;
  return { monthly, total, interest: Math.max(0, total - Math.max(0, principal)) };
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
