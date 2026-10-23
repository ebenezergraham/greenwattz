/**
 * Save and load a planner session as a file. The file holds the answers the visitor gave: usage, home, rates and goals.
 * It never holds meter readings, and nothing is stored or sent anywhere: the visitor keeps the file. Loading checks every
 * value and clamps or drops anything unexpected, so a hand-edited file cannot break the planner.
 */
import { Assumptions, BATTERY_TIERS, Goals, HOUSE_TYPES, HomeInputs, NO_OBSTACLES, ROOF_TYPES } from './engine';
import type { UsageMode } from './store';

export interface PlanState {
  mode: UsageMode;
  annualKwh: number;
  monthlyBill: number;
  home: HomeInputs;
  assumptions: Assumptions;
  goals: Goals;
  chosen: { panels: number; batteryKwh: number } | null;
}

const APP = 'greenwattz-plan';
const VERSION = 1;

const NUMERIC: Record<string, [number, number]> = {
  flatRate: [0.02, 1.5], dayRate: [0.02, 1.5], nightRate: [0.02, 1.5], peakRate: [0.02, 1.5], exportRate: [0, 1], standingChargeMonthly: [0, 200],
  vat: [0, 0.3], tariffInflation: [0, 0.2], panelWatts: [250, 700], panelCostBase: [0, 20000], panelCostPerKwp: [0, 10000],
  exportTaxFreePerPerson: [0, 5000], exportTaxRate: [0, 0.7], yieldPerKwp: [300, 1500], panelAreaM2: [1, 4],
};
const FLAGS = ['exportExtra', 'gridCharge', 'seaiGrant', 'seaiBatteryGrant'] as const;

/** The file text for the planner's current answers, with no meter data in it. */
export function planToFile(s: PlanState): string {
  // Only the settings a visitor can change are kept, so a saved file never carries anything else.
  const a = s.assumptions as unknown as Record<string, unknown>;
  const assumptions: Record<string, unknown> = { tariff: s.assumptions.tariff, batteryTier: s.assumptions.batteryTier };
  for (const k of Object.keys(NUMERIC)) assumptions[k] = a[k];
  for (const k of FLAGS) assumptions[k] = a[k];
  return JSON.stringify({ app: APP, version: VERSION, savedOn: new Date().toISOString().slice(0, 10), mode: s.mode === 'meter' ? 'annual' : s.mode, annualKwh: s.annualKwh, monthlyBill: s.monthlyBill, home: s.home, assumptions, goals: s.goals, chosen: s.chosen }, null, 1);
}

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null);

/** Read a saved plan back. Anything wrong is left out, so the caller keeps its own value there. */
export function planFromFile(text: string): Partial<PlanState> {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('That is not a GreenWattz plan file.'); }
  const o = data as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || o['app'] !== APP) throw new Error('That is not a GreenWattz plan file.');
  const out: Partial<PlanState> = {};

  const mode = oneOf(o['mode'], ['annual', 'bill'] as const);
  if (mode) out.mode = mode;
  const kwh = num(o['annualKwh'], 500, 40000); if (kwh !== null) out.annualKwh = Math.round(kwh);
  const bill = num(o['monthlyBill'], 10, 2000); if (bill !== null) out.monthlyBill = Math.round(bill);

  const h = (o['home'] ?? {}) as Record<string, unknown>;
  const home: Partial<HomeInputs> = {};
  const ht = oneOf(h['houseType'], HOUSE_TYPES.map((t) => t.key)); if (ht) home.houseType = ht;
  const rt = oneOf(h['roofType'], ROOF_TYPES.map((t) => t.key)); if (rt) home.roofType = rt;
  const st = h['storeys'] === 1 || h['storeys'] === 2 || h['storeys'] === 3 ? h['storeys'] : null; if (st) home.storeys = st;
  const tp = h['taxpayers'] === 1 || h['taxpayers'] === 2 ? h['taxpayers'] : null; if (tp) home.taxpayers = tp;
  if (h['yearOccupied'] === null) home.yearOccupied = null; else { const y = num(h['yearOccupied'], 1700, 2100); if (y !== null) home.yearOccupied = Math.round(y); }
  const oc = oneOf(h['occupancy'], ['away', 'mixed', 'home'] as const); if (oc) home.occupancy = oc;
  const or = oneOf(h['orientation'], ['S', 'SE_SW', 'E_W', 'N'] as const); if (or) home.orientation = or;
  const sh = oneOf(h['shading'], ['none', 'some', 'heavy'] as const); if (sh) home.shading = sh;
  const ra = num(h['roofAreaM2'], 5, 150); if (ra !== null) home.roofAreaM2 = ra;
  for (const k of ['threePhase', 'addEv', 'addHeatPump'] as const) if (typeof h[k] === 'boolean') home[k] = h[k] as boolean;
  if (h['obstacles'] && typeof h['obstacles'] === 'object') {
    const ob = h['obstacles'] as Record<string, unknown>;
    const obstacles = { ...NO_OBSTACLES };
    for (const k of Object.keys(NO_OBSTACLES) as (keyof typeof NO_OBSTACLES)[]) { const n = num(ob[k], 0, 20); if (n !== null) obstacles[k] = Math.round(n); }
    home.obstacles = obstacles;
  }
  if (Object.keys(home).length) out.home = home as HomeInputs;

  const a = (o['assumptions'] ?? {}) as Record<string, unknown>;
  const asm: Partial<Assumptions> = {};
  const tariff = oneOf(a['tariff'], ['flat', 'dayNight', 'smart'] as const); if (tariff) asm.tariff = tariff;
  const tier = oneOf(a['batteryTier'], BATTERY_TIERS.map((t) => t.key)); if (tier) asm.batteryTier = tier;
  for (const [k, [lo, hi]] of Object.entries(NUMERIC)) { const n = num(a[k], lo, hi); if (n !== null) (asm as Record<string, number>)[k] = n; }
  for (const k of FLAGS) if (typeof a[k] === 'boolean') asm[k] = a[k] as boolean;
  if (Object.keys(asm).length) out.assumptions = asm as Assumptions;

  const g = (o['goals'] ?? {}) as Record<string, unknown>;
  const goals: Partial<Goals> = {};
  const cover = num(g['cover'], 0.2, 0.95); if (cover !== null) goals.cover = cover;
  const exp = num(g['exportIncome'], 0, 5000); if (exp !== null) goals.exportIncome = exp;
  const lean = oneOf(g['lean'], ['solar', 'balanced', 'battery'] as const); if (lean) goals.lean = lean;
  const bat = oneOf(g['battery'], ['any', 'none', 'required'] as const); if (bat) goals.battery = bat;
  const maxNet = num(g['maxNetCost'], 0, 100000); if (maxNet !== null) goals.maxNetCost = maxNet;
  const gen = num(g['generate'], 0, 2); if (gen !== null) goals.generate = gen;
  if (Object.keys(goals).length) out.goals = goals as Goals;

  const c = o['chosen'] as Record<string, unknown> | null | undefined;
  if (c && typeof c === 'object') {
    const panels = num(c['panels'], 1, 60), kwh2 = num(c['batteryKwh'], 0, 40);
    if (panels !== null && kwh2 !== null) out.chosen = { panels: Math.round(panels), batteryKwh: kwh2 };
  } else if (c === null) out.chosen = null;
  return out;
}

