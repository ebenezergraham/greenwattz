/**
 * Reads the contract terms out of a quote or its terms and conditions: deposit, what is paid before works start,
 * warranties, cancellation, how the grant is handled and who qualifies for it. Plain rules, run in the browser. The result
 * is only ever a suggestion that the visitor confirms. It keeps numbers and short labels, never any text about the person.
 */

export type GrantRoute = 'deducted' | 'paid-to-you';

export interface PaymentStep { pct: number; when: 'start' | 'before' | 'end' | 'other' }

export interface TermsFields {
  /** The deposit asked on signing, as a percentage of the price. */
  depositPct?: number;
  /** Every different deposit percentage found. More than one means the quote and its terms disagree. */
  depositPcts?: number[];
  /** The share of the price due before the works start: the deposit plus any stage paid ahead of the install. */
  beforeWorksPct?: number;
  workmanshipYears?: number;
  panelWarrantyYears?: number;
  performanceYears?: number;
  inverterYears?: number;
  batteryYears?: number;
  /** Days you can cancel for a full refund. */
  coolingOffDays?: number;
  /** The terms say money is lost or deducted on cancelling, or the deposit is not refundable. */
  forfeits?: boolean;
  grantRoute?: GrantRoute;
  /** The grant rule in the contract: the home must have been built before this year. */
  builtBeforeYear?: number;
  validDays?: number;
  /** The price is subject to a survey, so it can still change. */
  priceMayChange?: boolean;
  chemistry?: 'LFP' | 'NMC';
}

const flat = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ');
const first = (re: RegExp, s: string): number | undefined => {
  const m = s.match(re);
  if (!m) return undefined;
  const g = m.slice(1).find((x) => x !== undefined);
  const v = g === undefined ? NaN : parseFloat(g);
  return Number.isFinite(v) ? v : undefined;
};

/** The percentages on payment lines, in order, each with when it falls due. Lines about VAT or other rates are ignored. */
export function paymentSteps(text: string): PaymentStep[] {
  const out: PaymentStep[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = flat(raw);
    if (!line || /\bvat\b|yearly|a year|per year|degrad|efficien|rate of/i.test(line)) continue;
    const m = line.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
    if (!m) continue;
    const pct = parseFloat(m[1]);
    if (!(pct > 0 && pct <= 100)) continue;
    const l = line.toLowerCase();
    if (!/deposit|payable|balance|payment|installation|install|signing|order|booking|stage|complet|milestone|due/.test(l)) continue;
    const when: PaymentStep['when'] = /complet|final|balance|handover|after install/.test(l) ? 'end' : /deposit|signing|booking|stage one|acceptance|on order|receipt of the order/.test(l) ? 'start' : /confirm|date|appointment|schedul|before|commence|start of/.test(l) ? 'before' : 'other';
    // A sentence that states the deposit just before the schedule repeats it; count it once.
    const prev = out[out.length - 1];
    if (prev && prev.pct === pct && prev.when === when && when === 'start') continue;
    out.push({ pct, when });
  }
  return out;
}

/** Split the steps into complete schedules that each add up to about 100%. A quote and its terms give two. */
export function paymentSchedules(steps: PaymentStep[]): PaymentStep[][] {
  const sets: PaymentStep[][] = [];
  let cur: PaymentStep[] = [];
  let sum = 0;
  for (const s of steps) {
    cur.push(s); sum += s.pct;
    if (sum >= 99) { sets.push(cur); cur = []; sum = 0; }
  }
  return sets;
}

export function readTerms(text: string): TermsFields {
  const t = flat(text);
  const out: TermsFields = {};

  const sets = paymentSchedules(paymentSteps(text));
  if (sets.length) {
    const deposits = sets.map((s) => s.find((x) => x.when === 'start')?.pct).filter((x): x is number => x !== undefined);
    // The same schedule can be written out twice; only different values count as a mismatch.
    const distinct = [...new Set(deposits)];
    if (distinct.length) { out.depositPct = deposits[0]; out.depositPcts = distinct; }
    out.beforeWorksPct = sets[0].filter((x) => x.when !== 'end').reduce((a, x) => a + x.pct, 0);
  } else {
    const dep = [...t.matchAll(/(\d{1,2}(?:\.\d+)?)\s*%\s*(?:\w+\s+){0,3}deposit|deposit\b[^.]{0,60}?(\d{1,2}(?:\.\d+)?)\s*%/gi)].map((m) => parseFloat(m[1] ?? m[2])).filter((n) => n > 0 && n <= 100);
    if (dep.length) { out.depositPct = dep[0]; out.depositPcts = [...new Set(dep)]; }
  }

  out.workmanshipYears = first(/(\d{1,2})[\s-]*(?:year|yr)s?\s+(?:workmanship|labou?r|installation)(?:\s+and\s+\w+)?\s+warranty|(?:workmanship|labou?r)(?:\s+and\s+\w+)?\s+warranty[^.]{0,40}?(\d{1,2})\s*(?:year|yr)|all works carry an? (\d{1,2})[\s-]*year/i, t);
  out.panelWarrantyYears = first(/(\d{2})\s*years?\s*product/i, t);
  out.performanceYears = first(/(\d{2})\s*years?\s*performance/i, t);
  out.inverterYears = first(/inverter\s+(\d{1,2})\s*years?/i, t);
  out.batteryYears = first(/batter(?:y|ies)\s+(\d{1,2})\s*years?/i, t);
  out.coolingOffDays = first(/(\d{1,2})[\s-]*days?\s*cooling[- ]off|cooling[- ]off[^.]{0,40}?(\d{1,2})\s*days|cancel[^.]{0,80}?within\s*(\d{1,2})\s*days|(\d{1,2})\s*days[^.]{0,20}?to cancel/i, t);
  if (/forfeit|non[- ]refundable|will not be refunded|deduct[^.]{0,100}?(?:cost|loss of profit)|charge[^.]{0,40}?%\s+of the total price/i.test(t)) out.forfeits = true;

  if (/paid\s+(?:directly\s+)?to\s+(?:the\s+)?(?:client|customer|homeowner|you)\b/i.test(t) && /grant/i.test(t)) out.grantRoute = 'paid-to-you';
  else if (/taken off the invoice|deducted (?:at source|from (?:the|your) (?:invoice|price))|receive the grant payment|grant[^.]{0,60}(?:assign|waiver)/i.test(t)) out.grantRoute = 'deducted';

  out.builtBeforeYear = first(/built(?:[^.]{0,40}?)before\s+(?:\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+)?(\d{4})/i, t);
  out.validDays = first(/(?:valid|validity)[^.]{0,40}?(\d{1,3})\s*days|(\d{1,3})\s*days[^.]{0,20}?valid/i, t);
  if (/subject to (?:a |an )?(?:full |detailed )?(?:on[- ]?site )?survey|price (?:may|can|could) (?:change|vary)|final (?:written )?quotation/i.test(t)) out.priceMayChange = true;
  if (/\bLFP\b|LiFePO4|lithium iron phosphate/i.test(t)) out.chemistry = 'LFP';
  else if (/\bNMC\b/.test(t)) out.chemistry = 'NMC';

  for (const k of Object.keys(out) as (keyof TermsFields)[]) if (out[k] === undefined) delete out[k];
  return out;
}
