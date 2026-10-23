/**
 * Solar quote checker. Pure functions, run in the browser. A quote is turned into a price per kWp and compared with
 * quotes other Irish homes have shared (src/app/data/quote-benchmarks.json) and with our own cost model.
 */
import benchmarks from '../data/quote-benchmarks.json';
import { DEFAULT_ASSUMPTIONS, PRICES, seaiGrantFor, type Assumptions } from './engine';

export interface Cohort { key: string; label: string; n: number; median: number; low: number; high: number }
export interface Period { period: string; n: number; median: number; low: number; high: number; approximate?: boolean }
export interface BenchmarkData {
  reviewedOn: string; reviewEveryDays: number;
  source: { label: string; url: string; note: string };
  overall: { n: number; median: number; low: number; high: number };
  byBattery: (Cohort & { belowKwh: number })[];
  bySize: (Cohort & { belowKwp: number })[];
  quarters: Period[];
  typicalSystem: { minKwp: number; maxKwp: number; minBatteryKwh: number; maxBatteryKwh: number; price: number; n: number };
  minQuotesPerPeriod: number;
  thresholds: { farAbovePct: number; minSampleToTrust: number; maxBatteryPerKwp: number };
}
export const BENCHMARKS = benchmarks as BenchmarkData;

export type GrantState = 'yes' | 'no' | 'unsure';
export interface QuoteInput {
  panels: number | null;
  watts: number | null;
  /** System size in kWp when the quote gives it but not the panels. */
  kwp: number | null;
  batteryKwh: number;
  /** The price as written on the quote, in euro. */
  price: number;
  /** Whether the SEAI grant has already been taken off that price. */
  grant: GrantState;
  /** Things the quote says are included, from INCLUSIONS keys. */
  included: string[];
}

export const INCLUSIONS: { key: string; label: string; ask: string }[] = [
  { key: 'scaffold', label: 'Scaffolding and roof access', ask: 'Is scaffolding and roof access included, or charged extra?' },
  { key: 'electrical', label: 'Electrical work and consumer unit changes', ask: 'Does the price include any consumer unit, earthing and bonding work, or are those extra if needed?' },
  { key: 'esb', label: 'ESB Networks paperwork (NC6)', ask: 'Who submits the ESB Networks notification, and is it in the price?' },
  { key: 'seai', label: 'SEAI grant paperwork', ask: 'Who applies for the SEAI grant, and is that in the price?' },
  { key: 'ber', label: 'Post-install BER and commissioning', ask: 'Is the post-install BER and commissioning included?' },
  { key: 'monitor', label: 'Monitoring app', ask: 'Is the monitoring app included, and does it need your wifi to be on for warranty cover?' },
];

/** Panels × watts, or the kWp the quote gives. Zero when neither is known. */
export function systemKwp(q: Pick<QuoteInput, 'panels' | 'watts' | 'kwp'>): number {
  if (q.panels && q.watts && q.panels > 0 && q.watts > 0) return (q.panels * q.watts) / 1000;
  return q.kwp && q.kwp > 0 ? q.kwp : 0;
}

/** SEAI grants for this system, if the home qualifies. Used to put a quote on a before- or after-grant footing. */
export function grantsFor(kwp: number, batteryKwh: number): number {
  const g = PRICES.grants;
  return seaiGrantFor(kwp) + (batteryKwh >= g.seaiBatteryMinKwh ? g.seaiBattery : 0);
}

export function batteryCohort(batteryKwh: number, data: BenchmarkData = BENCHMARKS): Cohort {
  const list = data.byBattery;
  return list.find((c) => batteryKwh < c.belowKwh) ?? list[list.length - 1];
}
export function sizeCohort(kwp: number, data: BenchmarkData = BENCHMARKS): Cohort {
  const list = data.bySize;
  return list.find((c) => kwp < c.belowKwp) ?? list[list.length - 1];
}

export type Verdict = 'below' | 'typical' | 'above' | 'far-above';

export interface QuoteCheck {
  kwp: number;
  perKwp: number;
  /** Which price was compared: after the SEAI grant when we know the grant status, otherwise as quoted. */
  basis: 'after-grant' | 'as-quoted';
  /** The price before and after the SEAI grant, as best we can tell. */
  beforeGrant: number;
  afterGrant: number;
  grantsAssumed: number;
  battery: Cohort;
  size: Cohort;
  /** The comparison range, blended from the battery group and the size group. */
  range: { low: number; median: number; high: number };
  vsMedianPct: number;
  verdict: Verdict;
  /** How much of the comparison rests on few quotes. */
  thin: boolean;
  /** What the typical range per kWp comes to for a system this size, as quoted. */
  typicalTotal: { low: number; median: number; high: number };
  /** Reasons the comparison is only a rough guide, if any. */
  rough: string[];
  questions: string[];
}

const round = (n: number) => Math.round(n);

export function checkQuote(q: QuoteInput, a: Assumptions = DEFAULT_ASSUMPTIONS, data: BenchmarkData = BENCHMARKS): QuoteCheck | null {
  const kwp = systemKwp(q);
  if (!(kwp > 0) || !(q.price > 0)) return null;
  const grants = grantsFor(kwp, q.batteryKwh);
  const beforeGrant = q.grant === 'yes' ? q.price + grants : q.price;
  const afterGrant = q.grant === 'yes' ? q.price : Math.max(0, q.price - grants);
  // The index uses the after-grant price where a quote shows the grant taken off, so when we know the grant status we compare after grants.
  const basis = q.grant === 'unsure' ? 'as-quoted' : 'after-grant';
  const perKwp = (basis === 'after-grant' ? afterGrant : q.price) / kwp;
  const battery = batteryCohort(q.batteryKwh, data), size = sizeCohort(kwp, data);
  const range = {
    low: (battery.low + size.low) / 2,
    median: (battery.median + size.median) / 2,
    high: (battery.high + size.high) / 2,
  };
  const vsMedianPct = perKwp / range.median - 1;
  const verdict: Verdict = perKwp < range.low ? 'below' : perKwp <= range.high ? 'typical' : vsMedianPct > data.thresholds.farAbovePct ? 'far-above' : 'above';
  const thin = Math.min(battery.n, size.n) < data.thresholds.minSampleToTrust;
  const ratio = q.batteryKwh / kwp;
  const rough: string[] = [];
  if (thin) rough.push('Few quotes sit in one of the comparison groups.');
  if (kwp < 3) rough.push('Very small systems cost more per kWp, and few quotes are this small.');
  if (q.batteryKwh > 0 && ratio > data.thresholds.maxBatteryPerKwp) rough.push('Your battery is large for the solar size. A big battery raises the price per kWp, so this can look dearer than it is.');
  if (q.batteryKwh === 0 && kwp >= 5) rough.push('Quotes without a battery are rare in the data, so the comparison for them is thin.');
  const check: QuoteCheck = {
    kwp, perKwp, basis, beforeGrant, afterGrant, grantsAssumed: grants, battery, size, range, vsMedianPct, verdict, thin,
    typicalTotal: { low: range.low * kwp, median: range.median * kwp, high: range.high * kwp }, rough, questions: [],
  };
  check.questions = questionsFor(q, check);
  return check;
}

/** What to ask the installer, from the quote and how it compares. Kept short and specific. */
export function questionsFor(q: QuoteInput, c: Omit<QuoteCheck, 'questions'> | QuoteCheck): string[] {
  const out: string[] = [];
  if (c.verdict === 'above' || c.verdict === 'far-above') out.push(`Your quote is about ${Math.round(c.vsMedianPct * 100)}% above the typical price per kWp. Ask the installer to itemise it and say what is driving the cost, then get at least one more quote to compare.`);
  if (c.verdict === 'below') out.push('This price is below the typical range. Check nothing is left out, such as scaffolding, electrical work or grant paperwork, and that the installer is on the SEAI register and insured.');
  if (q.grant === 'unsure') out.push(`Is the SEAI grant (about €${Math.round(c.grantsAssumed)} for this system) already taken off the price, or paid to you afterwards? When do you pay, and when does the grant arrive?`);
  if (q.grant === 'no') out.push(`The grant is not taken off yet. Ask who applies for it, how long it takes, and whether you must pay the full price first (about €${Math.round(c.grantsAssumed)} comes back).`);
  for (const i of INCLUSIONS) if (!q.included.includes(i.key)) out.push(i.ask);
  if (q.batteryKwh > 0) out.push(`Ask for the exact battery model, its usable kWh (not nominal), its charge and discharge power in kW, and the warranty years and guaranteed cycles. Most home inverters charge at 3.6 to 5 kW, so a ${q.batteryKwh} kWh battery takes ${Math.ceil(q.batteryKwh / 4)} or more hours to fill from the grid.`);
  else out.push('Ask whether the inverter is hybrid, so a battery can be added later without replacing it.');
  if (c.kwp > 6) out.push(`${c.kwp.toFixed(1)} kWp is above the usual 6 kW single-phase inverter limit. Ask what size the inverter is, how the panels are split across it, and whether your connection allows it.`);
  out.push('Ask for the panel, inverter and battery models and datasheets, and the workmanship and product warranty lengths in writing.');
  out.push('Ask for the payment schedule and the cancellation and refund terms in writing, and for a site survey before you pay a deposit.');
  return out;
}

/** The index by half-year, built from its quarters. Medians and quartiles are weighted by quote count, so they are approximate. */
export function halfYears(quarters: Period[] = BENCHMARKS.quarters, minQuotes = BENCHMARKS.minQuotesPerPeriod): Period[] {
  const groups = new Map<string, Period[]>();
  for (const q of quarters) {
    const m = q.period.match(/^Q([1-4]) (\d{4})$/);
    if (!m) continue;
    const key = `${+m[1] <= 2 ? 'H1' : 'H2'} ${m[2]}`;
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  const out: Period[] = [];
  for (const [period, qs] of groups) {
    const n = qs.reduce((t, x) => t + x.n, 0);
    if (n < minQuotes) continue;
    const w = (f: (x: Period) => number) => qs.reduce((t, x) => t + f(x) * x.n, 0) / n;
    out.push({ period, n, median: round(w((x) => x.median)), low: round(w((x) => x.low)), high: round(w((x) => x.high)), approximate: qs.length > 1 });
  }
  const order = (p: string) => { const [h, y] = p.split(' '); return +y * 2 + (h === 'H2' ? 1 : 0); };
  return out.sort((a, b) => order(a.period) - order(b.period));
}

export function benchmarksAgeDays(now: Date = new Date(), data: BenchmarkData = BENCHMARKS): number {
  return Math.floor((now.getTime() - new Date(data.reviewedOn + 'T00:00:00Z').getTime()) / 86400000);
}
export const benchmarksAreStale = (now: Date = new Date(), data: BenchmarkData = BENCHMARKS) => benchmarksAgeDays(now, data) > data.reviewEveryDays;

// ---------- reading a quote ----------

export interface ReadFields {
  panels?: number;
  watts?: number;
  kwp?: number;
  batteryKwh?: number;
  /** Candidate prices found, by what the line says. */
  priceTotal?: number;
  priceAfterGrant?: number;
  grantSolar?: number;
  grantBattery?: number;
  installer?: string;
  /** Which things the text says are included, matched from INCLUSIONS. */
  included?: string[];
}
export type Found = Partial<Record<keyof ReadFields, 'rules' | 'ai'>>;

const num = (s: string) => parseFloat(s.replace(/,/g, ''));

/** Pull the figures we need out of quote text with plain rules. Always shown to the user to confirm. */
export function readQuoteText(text: string, knownInstallers: string[] = []): ReadFields {
  // PDFs often split a capital from its word ("T otal") and split a line in two, so close those gaps before reading.
  const t = text
    .replace(/\u00a0/g, ' ')
    .replace(/\bT\s+otal\b/g, 'Total')
    .replace(/\b(total after|after)\s*\r?\n\s*(grant)/gi, '$1 $2');
  const out: ReadFields = {};
  const pw = t.match(/(\d{1,3})\s*(?:x|×|\*)\s*(\d{3})\s*(?:w|wp|watt)\b/i);
  if (pw && +pw[2] >= 250 && +pw[2] <= 700) { out.panels = +pw[1]; out.watts = +pw[2]; }
  if (!out.watts) {
    const w = t.match(/\b(\d{3})\s*(?:w|wp)\b/i);
    if (w && +w[1] >= 250 && +w[1] <= 700) out.watts = +w[1];
  }
  if (!out.panels) {
    const p = t.match(/(\d{1,3})\s*(?:x\s*)?(?:solar\s+)?(?:panels|modules)\b/i);
    if (p && +p[1] >= 2 && +p[1] <= 60) out.panels = +p[1];
  }
  const kw = t.match(/(\d{1,2}(?:\.\d{1,2})?)\s*kWp?\b(?!h)/i);
  if (kw && num(kw[1]) >= 1 && num(kw[1]) <= 30) out.kwp = num(kw[1]);
  // Battery: a kWh figure near the word battery, else the first plausible kWh figure.
  const kwhRe = /(\d{1,2}(?:\.\d{1,2})?)\s*kWh/gi;
  let best: number | undefined;
  for (let m = kwhRe.exec(t); m; m = kwhRe.exec(t)) {
    const v = num(m[1]);
    if (v < 2 || v > 40) continue;
    const around = t.slice(Math.max(0, m.index - 80), m.index + 80).toLowerCase();
    if (/batter|storage|luna|powerwall|sigen|givenergy/.test(around)) { best = v; break; }
    best ??= v;
  }
  if (best !== undefined) out.batteryKwh = best;
  // Money, by the words on the same line.
  const lines = t.split(/\r?\n/);
  const euros = (line: string) => [...line.matchAll(/€\s?([\d,]+(?:\.\d{1,2})?)/g)].map((m) => num(m[1])).filter((n) => n > 0);
  for (const raw of lines) {
    const line = raw.toLowerCase();
    const vals = euros(raw);
    if (!vals.length) continue;
    if (/up to/.test(line) && /grant/.test(line)) continue; // a general note such as "includes a grant deduction of up to €2,400"
    if (/after\s+(?:the\s+)?grant|total\s+after|net\s+(?:of\s+)?grant/.test(line)) out.priceAfterGrant ??= vals[vals.length - 1];
    else if (/seai.*battery|battery.*grant/.test(line)) out.grantBattery ??= vals[vals.length - 1];
    else if (/seai.*(?:solar|grant)|solar.*grant/.test(line)) out.grantSolar ??= vals[vals.length - 1];
    else if (/\btotal\b|subtotal|\bprice\b|payable/.test(line)) { const v = Math.max(...vals); if (out.priceTotal === undefined || v > out.priceTotal) out.priceTotal = v; }
  }
  const lower = t.toLowerCase();
  const inc: string[] = [];
  const has = (re: RegExp) => re.test(lower);
  if (has(/scaffold/)) inc.push('scaffold');
  if (has(/nc6|esb networks/)) inc.push('esb');
  if (has(/seai.*(?:paperwork|application|portal)|grant application/)) inc.push('seai');
  if (has(/\bber\b|commission/)) inc.push('ber');
  if (has(/monitor/)) inc.push('monitor');
  if (has(/consumer unit|fuse\s*board|earth|bonding/)) inc.push('electrical');
  if (inc.length) out.included = inc;
  const named = knownInstallers.filter((n) => n.length > 4 && lower.includes(n.toLowerCase())).sort((a, b) => b.length - a.length)[0];
  if (named) out.installer = named;
  return out;
}

/** Keep only AI-suggested numbers that really appear in the quote text, so a made-up figure can never reach the form. */
export function acceptAiFields(ai: Partial<ReadFields>, text: string): ReadFields {
  const digits = text.replace(/,/g, '');
  const appears = (v: number | undefined) => v !== undefined && Number.isFinite(v) && (digits.includes(String(v)) || digits.includes(v.toFixed(2)) || digits.includes(v.toFixed(1)));
  const out: ReadFields = {};
  for (const k of ['panels', 'watts', 'kwp', 'batteryKwh', 'priceTotal', 'priceAfterGrant', 'grantSolar', 'grantBattery'] as const) {
    const v = ai[k];
    if (typeof v === 'number' && appears(v)) out[k] = v;
  }
  if (typeof ai.installer === 'string' && ai.installer.length > 2 && text.toLowerCase().includes(ai.installer.toLowerCase())) out.installer = ai.installer;
  return out;
}

/** Combine the AI's reading with the rules' reading. The AI wins where both have a value, since it reads layout better. */
export function mergeReads(rules: ReadFields, ai: ReadFields): { fields: ReadFields; found: Found } {
  const fields: ReadFields = { ...rules };
  const found: Found = {};
  for (const k of Object.keys(rules) as (keyof ReadFields)[]) found[k] = 'rules';
  for (const k of Object.keys(ai) as (keyof ReadFields)[]) {
    const v = ai[k];
    if (v === undefined) continue;
    (fields as Record<string, unknown>)[k] = v;
    found[k] = 'ai';
  }
  return { fields, found };
}

/** Turn what was read into form values. The price is the before-grant total unless only an after-grant figure was found. */
export function fieldsToInput(f: ReadFields): Partial<QuoteInput> & { priceBasis: 'before' | 'after' | null } {
  const price = f.priceTotal ?? f.priceAfterGrant;
  const basis = f.priceTotal !== undefined ? 'before' : f.priceAfterGrant !== undefined ? 'after' : null;
  const grantSeen = f.priceAfterGrant !== undefined && f.priceTotal !== undefined || f.grantSolar !== undefined || f.grantBattery !== undefined;
  return {
    panels: f.panels ?? null, watts: f.watts ?? null, kwp: f.kwp ?? null,
    batteryKwh: f.batteryKwh ?? 0,
    price: price ?? 0,
    grant: basis === 'after' ? 'yes' : grantSeen ? 'no' : 'unsure',
    included: f.included ?? [],
    priceBasis: basis,
  };
}
