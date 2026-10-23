/**
 * Compare several solar quotes side by side. Each quote is checked against the community price range, run through our
 * own model for the visitor's home (so the installer's yearly kWh, savings and payback claims can be sanity-checked), and
 * scanned for contract red flags. Pure functions, run in the browser. Nothing here is stored or sent anywhere.
 */
import { Assumptions, HomeInputs, PRICES, Usage, paybackFrom, project, simulate } from './engine';
import { GrantState, INCLUSIONS, QuoteCheck, ReadFields, checkQuote, fieldsToInput, grantsFor, systemKwp } from './quote-check';
import type { TermsFields } from './quote-terms';

export const MAX_QUOTES = 5;

export type Chemistry = '' | 'LFP' | 'NMC' | 'other';
export type GrantRouteField = '' | 'deducted' | 'paid-to-you';

export interface QuoteEntry {
  id: string;
  installer: string;
  panels: number | null;
  watts: number | null;
  kwp: number | null;
  panelBrand: string;
  batteryKwh: number;
  batteryBrand: string;
  chemistry: Chemistry;
  inverter: string;
  price: number | null;
  grant: GrantState;
  depositPct: number | null;
  /** The share of the price due before the works start. */
  beforeWorksPct: number | null;
  /** The quote and its terms give different payment schedules. */
  paymentMismatch: boolean;
  workmanshipYears: number | null;
  panelWarrantyYears: number | null;
  batteryYears: number | null;
  inverterYears: number | null;
  coolingOffDays: number | null;
  forfeits: boolean;
  grantRoute: GrantRouteField;
  /** The grant rule in the contract: home built before this year. */
  builtBeforeYear: number | null;
  priceMayChange: boolean;
  validDays: number | null;
  /** What the installer claims. */
  theirKwh: number | null;
  theirSavings: number | null;
  theirPayback: number | null;
  included: string[];
  notes: string;
}

export function blankEntry(id: string): QuoteEntry {
  return {
    id, installer: '', panels: null, watts: null, kwp: null, panelBrand: '', batteryKwh: 0, batteryBrand: '', chemistry: '', inverter: '',
    price: null, grant: 'unsure', depositPct: null, beforeWorksPct: null, paymentMismatch: false, workmanshipYears: null, panelWarrantyYears: null,
    batteryYears: null, inverterYears: null, coolingOffDays: null, forfeits: false, grantRoute: '', builtBeforeYear: null, priceMayChange: false,
    validDays: null, theirKwh: null, theirSavings: null, theirPayback: null, included: [], notes: '',
  };
}

/** Turn what was read from a quote file, and its terms, into a quote entry. The visitor confirms it before it is used. */
export function entryFromRead(f: ReadFields, t: TermsFields, id: string): QuoteEntry {
  const x = fieldsToInput(f);
  const e = blankEntry(id);
  return {
    ...e,
    installer: f.installer ?? '',
    panels: x.panels ?? null, watts: x.watts ?? null, kwp: x.panels && x.watts ? null : x.kwp ?? null,
    batteryKwh: x.batteryKwh ?? 0,
    price: x.price ? x.price : null,
    grant: x.grant ?? 'unsure',
    included: x.included ?? [],
    depositPct: t.depositPct ?? null, beforeWorksPct: t.beforeWorksPct ?? null,
    paymentMismatch: (t.depositPcts?.length ?? 0) > 1,
    workmanshipYears: t.workmanshipYears ?? null, panelWarrantyYears: t.panelWarrantyYears ?? null,
    batteryYears: t.batteryYears ?? null, inverterYears: t.inverterYears ?? null,
    coolingOffDays: t.coolingOffDays ?? null, forfeits: !!t.forfeits,
    grantRoute: t.grantRoute ?? '', builtBeforeYear: t.builtBeforeYear ?? null,
    priceMayChange: !!t.priceMayChange, validDays: t.validDays ?? null,
    chemistry: t.chemistry ?? '',
  };
}

export interface CompareContext { usage: Usage; home: HomeInputs; assumptions: Assumptions }

export interface Flag { level: 'red' | 'amber'; key: string; text: string }

export interface Derived {
  kwp: number;
  panels: number;
  /** The price after the SEAI grant when the grant status is known, else as quoted. */
  netPrice: number;
  priceAfterGrant: number;
  priceBeforeGrant: number;
  grants: number;
  check: QuoteCheck | null;
  our: { kwh: number; kwhPerKwp: number; billSaving: number; exportIncome: number; benefit: number; payback: number; gain25: number; supplied: number; bill: number } | null;
  /** Their yearly kWh per kWp, and how far above our estimate it is (0.1 is 10% above). */
  theirKwhPerKwp: number | null;
  theirVsOurs: number | null;
  flags: Flag[];
  /** Key figures this quote leaves out, worth asking for. */
  missing: string[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const eur = (n: number) => `€${Math.round(n).toLocaleString('en-IE')}`;

/** Run one quote through the checks. Null when there is no size and price to work with. */
export function derive(e: QuoteEntry, ctx: CompareContext): Derived | null {
  const kwp = systemKwp({ panels: e.panels, watts: e.watts, kwp: e.kwp });
  if (!(kwp > 0) || !e.price || e.price <= 0) return null;
  const watts = e.watts && e.watts > 0 ? e.watts : ctx.assumptions.panelWatts;
  const panels = e.panels && e.panels > 0 ? e.panels : Math.max(1, Math.round((kwp * 1000) / watts));
  const check = checkQuote({ panels: e.panels, watts: e.watts, kwp: e.kwp, batteryKwh: e.batteryKwh, price: e.price, grant: e.grant, included: e.included }, ctx.assumptions);
  const grants = grantsFor(kwp, e.batteryKwh);
  const priceAfterGrant = e.grant === 'yes' ? e.price : Math.max(0, e.price - grants);
  const priceBeforeGrant = e.grant === 'yes' ? e.price + grants : e.price;
  const netPrice = e.grant === 'unsure' ? e.price : priceAfterGrant;

  const a = { ...ctx.assumptions, panelWatts: watts };
  const r = simulate(ctx.usage, ctx.home, a, { panels, batteryKwh: e.batteryKwh });
  const simKwp = (panels * watts) / 1000;
  const flow = project({ billSaving: r.billSaving, exportIncome: r.exportIncome, exportTaxFree: r.exportTaxFree, netCost: netPrice, inverterCost: r.inverterCost, batteryCost: r.batteryCost }, a);
  const our = {
    kwh: r.generationKwh, kwhPerKwp: r.generationKwh / simKwp, billSaving: r.billSaving, exportIncome: r.exportIncome, benefit: r.annualBenefit,
    payback: paybackFrom(flow), gain25: flow[flow.length - 1].cumulative, supplied: r.selfSufficiency, bill: r.billBefore,
  };
  const theirKwhPerKwp = e.theirKwh && e.theirKwh > 0 ? e.theirKwh / kwp : null;
  const theirVsOurs = theirKwhPerKwp === null ? null : theirKwhPerKwp / our.kwhPerKwp - 1;

  const d: Derived = { kwp, panels, netPrice, priceAfterGrant, priceBeforeGrant, grants, check, our, theirKwhPerKwp, theirVsOurs, flags: [], missing: [] };
  d.flags = flagsFor(e, d, ctx);
  d.missing = missingFor(e);
  return d;
}

/** The key figures a quote should state. */
export function missingFor(e: QuoteEntry): string[] {
  const m: string[] = [];
  if (e.depositPct === null) m.push('deposit');
  if (e.workmanshipYears === null) m.push('workmanship warranty');
  if (e.coolingOffDays === null) m.push('cancellation terms');
  if (!e.grantRoute) m.push('how the grant is paid');
  if (e.batteryKwh > 0 && !e.chemistry) m.push('battery chemistry');
  if (e.batteryKwh > 0 && e.batteryYears === null) m.push('battery warranty');
  if (e.theirKwh === null) m.push('their yearly kWh estimate');
  return m;
}

/** Red and amber flags from the terms and from how the claims compare with our own estimate. */
export function flagsFor(e: QuoteEntry, d: Pick<Derived, 'kwp' | 'check' | 'our' | 'theirVsOurs' | 'grants'>, ctx: CompareContext): Flag[] {
  const out: Flag[] = [];
  const add = (level: Flag['level'], key: string, text: string) => out.push({ level, key, text });

  if (e.paymentMismatch) add('red', 'payment-mismatch', 'The quote and its terms give different payment schedules. Ask which applies and get one version in writing.');
  if (e.depositPct !== null && e.depositPct > 25) add('amber', 'deposit', `A ${e.depositPct}% deposit is large. About 10 to 25% is more usual. Ask what it covers and when it is refundable.`);
  if (e.beforeWorksPct !== null && e.beforeWorksPct >= 70) add('amber', 'before-works', `${e.beforeWorksPct}% of the price is due before the works start. Ask to pay more on completion, and check who owns the equipment until it is paid.`);
  if (e.workmanshipYears !== null && e.workmanshipYears < 5) add('amber', 'workmanship', `The workmanship warranty is only ${e.workmanshipYears} year${e.workmanshipYears === 1 ? '' : 's'}. Five or more is better, because most installation faults show up later.`);
  if (e.coolingOffDays !== null && e.coolingOffDays < 14) add('amber', 'cooling-off', `The cancellation window is ${e.coolingOffDays} days. Consumers normally have 14 days to cancel a contract signed at home or online.`);
  if (e.forfeits) add('amber', 'forfeit', 'The terms say you can lose your deposit, or pay extra, if you cancel. Ask exactly when, and how much.');
  if (e.grantRoute === 'paid-to-you') add('amber', 'grant-float', `The SEAI grant is paid to you afterwards, so you pay about ${eur(d.grants)} more up front and wait for it. Check you can carry that.`);
  if (e.builtBeforeYear !== null) {
    const y = ctx.home.yearOccupied;
    const rule = PRICES.grants.seaiSolarBuiltBefore;
    if (y !== null && y >= e.builtBeforeYear) add('red', 'grant-year', `The contract says the grant needs a home built before ${e.builtBeforeYear}, but yours was first occupied in ${y}. The grant may not apply. Ask in writing.`);
    else if (y === null && e.builtBeforeYear < rule) add('amber', 'grant-year', `The contract says the grant needs a home built before ${e.builtBeforeYear}. SEAI's rule is before ${rule}, so check which applies to your home.`);
  }
  if (e.priceMayChange) add('amber', 'price-change', 'The price is subject to a survey, so it can still change. Ask for a survey before you pay a deposit, and a refund if the roof is unsuitable.');
  if (e.validDays !== null && e.validDays <= 14) add('amber', 'short-validity', `The quote is only valid for ${e.validDays} days. Do not be rushed into signing.`);

  const c = d.check;
  if (c) {
    if (c.verdict === 'above' || c.verdict === 'far-above') add('amber', 'price-high', `The price per kWp is ${pct(c.vsMedianPct)} above the typical price. Ask for an itemised breakdown and compare it with another quote.`);
    if (c.verdict === 'below') add('amber', 'price-low', 'The price per kWp is below the typical range. Check nothing is left out, such as scaffolding, electrical work or grant paperwork.');
  }
  const o = d.our;
  if (o) {
    if (d.theirVsOurs !== null && d.theirVsOurs > 0.15) add(d.theirVsOurs > 0.3 ? 'red' : 'amber', 'kwh-claim', `Their yearly output of ${Math.round(e.theirKwh!)} kWh is ${pct(d.theirVsOurs)} above our estimate of ${Math.round(o.kwh)} kWh for your roof. Ask what orientation, shading and losses they assumed.`);
    if (e.theirSavings !== null && o.bill > 0 && e.theirSavings >= 0.9 * o.bill) add('red', 'saving-claim', `They claim ${eur(e.theirSavings)} a year, almost all of your estimated ${eur(o.bill)} electricity bill. That assumes you use or sell nearly everything. Ask for the assumptions.`);
    else if (e.theirSavings !== null && o.benefit > 0 && e.theirSavings > 1.3 * o.benefit) add('amber', 'saving-claim', `They claim ${eur(e.theirSavings)} a year. We estimate about ${eur(o.benefit)} for your home. Ask what unit rate, self-use and export rate they assumed.`);
    if (e.theirPayback !== null && isFinite(o.payback) && e.theirPayback < 0.65 * o.payback) add('amber', 'payback-claim', `They claim a ${e.theirPayback.toFixed(1)} year payback. We estimate about ${o.payback.toFixed(1)} years.`);
  }
  if (e.batteryKwh > 0 && !e.chemistry) add('amber', 'chemistry', 'The battery chemistry is not stated. LFP (lithium iron phosphate) is the safer, longer-lasting choice. Ask.');
  if (e.batteryKwh > 0 && e.chemistry === 'NMC') add('amber', 'chemistry', 'The battery is NMC. LFP is usually preferred for home batteries because it lasts longer and is safer. Ask about cycles and warranty.');
  return out;
}

/** The indexes of the best values in a row, ignoring blanks. Several can tie. */
export function bestIndexes(values: (number | null)[], mode: 'min' | 'max'): number[] {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length < 2) return [];
  const best = mode === 'min' ? Math.min(...nums) : Math.max(...nums);
  if (nums.every((v) => v === best)) return [];
  return values.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
}

// ---------- saving and loading a file ----------

const FILE_APP = 'greenwattz-quotes';
const FILE_VERSION = 1;

export function quotesToFile(entries: QuoteEntry[]): string {
  return JSON.stringify({ app: FILE_APP, version: FILE_VERSION, savedOn: new Date().toISOString().slice(0, 10), quotes: entries.slice(0, MAX_QUOTES) }, null, 1);
}

const numOr = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, max) : '');
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback);

/** Read a saved file back in. Anything unexpected is dropped or clamped, so a bad file can never break the page. */
export function quotesFromFile(text: string): QuoteEntry[] {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('That is not a GreenWattz quotes file.'); }
  const o = data as { app?: unknown; quotes?: unknown };
  if (!o || o.app !== FILE_APP || !Array.isArray(o.quotes)) throw new Error('That is not a GreenWattz quotes file.');
  const validIncluded = new Set(INCLUSIONS.map((i) => i.key));
  return o.quotes.slice(0, MAX_QUOTES).map((raw, i) => {
    const q = (raw ?? {}) as Record<string, unknown>;
    const e = blankEntry(`q${i + 1}-${Date.now().toString(36)}`);
    return {
      ...e,
      installer: str(q['installer'], 80), panelBrand: str(q['panelBrand'], 80), batteryBrand: str(q['batteryBrand'], 80), inverter: str(q['inverter'], 80), notes: str(q['notes'], 500),
      panels: numOr(q['panels'], 1, 200), watts: numOr(q['watts'], 100, 1000), kwp: numOr(q['kwp'], 0.5, 100),
      batteryKwh: numOr(q['batteryKwh'], 0, 100) ?? 0, chemistry: oneOf(q['chemistry'], ['', 'LFP', 'NMC', 'other'] as const, ''),
      price: numOr(q['price'], 1, 1_000_000), grant: oneOf(q['grant'], ['yes', 'no', 'unsure'] as const, 'unsure'),
      depositPct: numOr(q['depositPct'], 0, 100), beforeWorksPct: numOr(q['beforeWorksPct'], 0, 100), paymentMismatch: q['paymentMismatch'] === true,
      workmanshipYears: numOr(q['workmanshipYears'], 0, 50), panelWarrantyYears: numOr(q['panelWarrantyYears'], 0, 50), batteryYears: numOr(q['batteryYears'], 0, 50), inverterYears: numOr(q['inverterYears'], 0, 50),
      coolingOffDays: numOr(q['coolingOffDays'], 0, 365), forfeits: q['forfeits'] === true, grantRoute: oneOf(q['grantRoute'], ['', 'deducted', 'paid-to-you'] as const, ''),
      builtBeforeYear: numOr(q['builtBeforeYear'], 1900, 2100), priceMayChange: q['priceMayChange'] === true, validDays: numOr(q['validDays'], 0, 365),
      theirKwh: numOr(q['theirKwh'], 0, 100_000), theirSavings: numOr(q['theirSavings'], 0, 100_000), theirPayback: numOr(q['theirPayback'], 0, 100),
      included: Array.isArray(q['included']) ? (q['included'] as unknown[]).filter((k): k is string => typeof k === 'string' && validIncluded.has(k)) : [],
    };
  });
}

/** Two made-up quotes to try the page with. */
export function exampleEntries(): QuoteEntry[] {
  const a: QuoteEntry = { ...blankEntry('ex-a'), installer: 'Example Solar A', panels: 16, watts: 470, batteryKwh: 6.9, chemistry: 'LFP', price: 12345, grant: 'no', depositPct: 15, beforeWorksPct: 70, workmanshipYears: 5, coolingOffDays: 14, grantRoute: 'paid-to-you', priceMayChange: true, validDays: 30, theirKwh: 6295, theirSavings: 1798, included: ['esb', 'ber', 'monitor'], batteryYears: 15 };
  const b: QuoteEntry = { ...blankEntry('ex-b'), installer: 'Example Solar B', panels: 12, watts: 465, batteryKwh: 0, price: 12400, grant: 'yes', depositPct: 5, beforeWorksPct: 100, workmanshipYears: 2, coolingOffDays: 14, forfeits: true, grantRoute: 'deducted', included: ['esb', 'seai'] };
  return [a, b];
}
