import { describe, it, expect } from 'vitest';
import { DEFAULT_ASSUMPTIONS as A, HomeInputs, NO_OBSTACLES, Usage, estimateProfile } from './engine';
import { BENCHMARKS } from './quote-check';
import {
  MAX_QUOTES, QuoteEntry, bestIndexes, blankEntry, derive, entryFromRead, exampleEntries, flagsFor, missingFor, quotesFromFile, quotesToFile,
} from './quote-compare';

const HOME: HomeInputs = { houseType: 'semi', roofType: 'pitched', storeys: 2, taxpayers: 1, yearOccupied: 2024, occupancy: 'mixed', orientation: 'E_W', shading: 'none', roofAreaM2: 45, obstacles: { ...NO_OBSTACLES }, threePhase: false, addEv: false, addHeatPump: false };
const usage = (kwh = 4300): Usage => ({ annualKwh: kwh, profile: estimateProfile(kwh, 'mixed'), source: 'estimate' });
const ctx = (home: Partial<HomeInputs> = {}) => ({ usage: usage(), home: { ...HOME, ...home }, assumptions: A });
const entry = (p: Partial<QuoteEntry> = {}): QuoteEntry => ({ ...blankEntry('t'), panels: 16, watts: 470, batteryKwh: 6.9, price: 12345, grant: 'no', ...p });
const keys = (e: QuoteEntry, c = ctx()) => derive(e, c)!.flags.map((f) => f.key);

describe('deriving a quote', () => {
  it('needs a size and a price', () => {
    expect(derive(entry({ price: null }), ctx())).toBeNull();
    expect(derive(entry({ panels: null, watts: null, kwp: null }), ctx())).toBeNull();
  });
  it('works out the size, panels and the price after grants', () => {
    const d = derive(entry(), ctx())!;
    expect(d.kwp).toBeCloseTo(7.52, 9);
    expect(d.panels).toBe(16);
    expect(d.priceBeforeGrant).toBe(12345);
    expect(d.priceAfterGrant).toBeCloseTo(12345 - d.grants, 6);
    expect(d.netPrice).toBe(d.priceAfterGrant);
  });
  it('puts a price with the grant already off on the right footing', () => {
    const d = derive(entry({ grant: 'yes', price: 9945 }), ctx())!;
    expect(d.priceAfterGrant).toBe(9945);
    expect(d.priceBeforeGrant).toBeCloseTo(9945 + d.grants, 6);
  });
  it('takes the price as quoted when the grant status is not known', () => {
    expect(derive(entry({ grant: 'unsure' }), ctx())!.netPrice).toBe(12345);
  });
  it('works out the panels from the kWp when only that is given', () => {
    const d = derive(entry({ panels: null, watts: 470, kwp: 7.52 }), ctx())!;
    expect(d.panels).toBe(16);
  });
  it('estimates output, benefit and payback for the visitor\'s own home', () => {
    const d = derive(entry(), ctx())!;
    expect(d.our!.kwh).toBeGreaterThan(3000);
    expect(d.our!.kwhPerKwp).toBeGreaterThan(550);
    expect(d.our!.kwhPerKwp).toBeLessThan(950);
    expect(d.our!.benefit).toBeGreaterThan(0);
    expect(d.our!.payback).toBeGreaterThan(2);
    expect(d.our!.payback).toBeLessThan(30);
  });
  it('estimates less output on an east-west roof than a south roof, for the same quote', () => {
    const ew = derive(entry(), ctx({ orientation: 'E_W' }))!.our!.kwh;
    const south = derive(entry(), ctx({ orientation: 'S' }))!.our!.kwh;
    expect(ew / south).toBeCloseTo(0.82, 1);
  });
  it('pays back sooner for a cheaper quote of the same system', () => {
    const dear = derive(entry({ price: 14000 }), ctx())!.our!.payback;
    const cheap = derive(entry({ price: 9000 }), ctx())!.our!.payback;
    expect(cheap).toBeLessThan(dear);
  });
  it('compares the price per kWp with the community range', () => {
    expect(derive(entry(), ctx())!.check!.range.median).toBeGreaterThan(BENCHMARKS.overall.low * 0.8);
  });
});

describe('claims against our own estimate', () => {
  it('measures how far their yearly kWh is above ours', () => {
    const d = derive(entry({ theirKwh: 6295 }), ctx())!;
    expect(d.theirKwhPerKwp).toBeCloseTo(6295 / 7.52, 9);
    expect(d.theirVsOurs).toBeCloseTo(d.theirKwhPerKwp! / d.our!.kwhPerKwp - 1, 9);
  });
  it('flags a yearly output well above ours, in red when it is far above', () => {
    const d0 = derive(entry(), ctx())!;
    const amber = derive(entry({ theirKwh: Math.round(d0.our!.kwh * 1.2) }), ctx())!.flags.find((f) => f.key === 'kwh-claim');
    const red = derive(entry({ theirKwh: Math.round(d0.our!.kwh * 1.5) }), ctx())!.flags.find((f) => f.key === 'kwh-claim');
    expect(amber?.level).toBe('amber');
    expect(red?.level).toBe('red');
    expect(keys(entry({ theirKwh: Math.round(d0.our!.kwh * 1.02) }))).not.toContain('kwh-claim');
  });
  it('flags a claim to remove almost all of the bill', () => {
    const d0 = derive(entry(), ctx())!;
    const f = derive(entry({ theirSavings: d0.our!.bill * 0.99 }), ctx())!.flags.find((x) => x.key === 'saving-claim');
    expect(f?.level).toBe('red');
  });
  it('flags a saving claim well above ours, and a payback claim well below', () => {
    const d0 = derive(entry(), ctx())!;
    expect(keys(entry({ theirSavings: d0.our!.benefit * 1.5 }))).toContain('saving-claim');
    expect(keys(entry({ theirPayback: d0.our!.payback * 0.4 }))).toContain('payback-claim');
    expect(keys(entry({ theirPayback: d0.our!.payback }))).not.toContain('payback-claim');
  });
});

describe('contract red flags', () => {
  const k = (p: Partial<QuoteEntry>) => keys(entry(p));
  it('flags a quote and terms that disagree on payment, in red', () => {
    expect(derive(entry({ paymentMismatch: true }), ctx())!.flags.find((f) => f.key === 'payment-mismatch')?.level).toBe('red');
  });
  it('flags a large deposit, and most of the price due before the works', () => {
    expect(k({ depositPct: 40 })).toContain('deposit');
    expect(k({ depositPct: 15 })).not.toContain('deposit');
    expect(k({ beforeWorksPct: 95 })).toContain('before-works');
    expect(k({ beforeWorksPct: 50 })).not.toContain('before-works');
  });
  it('flags a short workmanship warranty and a short cancellation window', () => {
    expect(k({ workmanshipYears: 2 })).toContain('workmanship');
    expect(k({ workmanshipYears: 5 })).not.toContain('workmanship');
    expect(k({ coolingOffDays: 7 })).toContain('cooling-off');
    expect(k({ coolingOffDays: 14 })).not.toContain('cooling-off');
  });
  it('flags forfeits, a grant paid afterwards, a changeable price and a short validity', () => {
    expect(k({ forfeits: true })).toContain('forfeit');
    expect(k({ grantRoute: 'paid-to-you' })).toContain('grant-float');
    expect(k({ grantRoute: 'deducted' })).not.toContain('grant-float');
    expect(k({ priceMayChange: true })).toContain('price-change');
    expect(k({ validDays: 7 })).toContain('short-validity');
    expect(k({ validDays: 30 })).not.toContain('short-validity');
  });
  it('flags a contract grant rule that the home does not meet, in red', () => {
    const f = derive(entry({ builtBeforeYear: 2021 }), ctx({ yearOccupied: 2024 }))!.flags.find((x) => x.key === 'grant-year');
    expect(f?.level).toBe('red');
    expect(derive(entry({ builtBeforeYear: 2025 }), ctx({ yearOccupied: 2024 }))!.flags.map((x) => x.key)).not.toContain('grant-year');
  });
  it('asks the visitor to check an older grant rule when their home year is not known', () => {
    const f = derive(entry({ builtBeforeYear: 2021 }), ctx({ yearOccupied: null }))!.flags.find((x) => x.key === 'grant-year');
    expect(f?.level).toBe('amber');
  });
  it('flags an unstated or NMC battery chemistry only when there is a battery', () => {
    expect(k({ chemistry: '' })).toContain('chemistry');
    expect(k({ chemistry: 'NMC' })).toContain('chemistry');
    expect(k({ chemistry: 'LFP' })).not.toContain('chemistry');
    expect(k({ batteryKwh: 0, chemistry: '' })).not.toContain('chemistry');
  });
  it('flags a price far above and one far below the community range', () => {
    expect(k({ grant: 'unsure', price: 40000 })).toContain('price-high');
    expect(k({ grant: 'unsure', price: 6000 })).toContain('price-low');
  });
  it('lists the figures a quote leaves out', () => {
    const m = missingFor(entry());
    expect(m).toEqual(expect.arrayContaining(['deposit', 'workmanship warranty', 'cancellation terms', 'how the grant is paid', 'battery chemistry']));
    expect(missingFor(entry({ depositPct: 15, workmanshipYears: 5, coolingOffDays: 14, grantRoute: 'deducted', chemistry: 'LFP', batteryYears: 10, theirKwh: 5000 }))).toEqual([]);
  });
  it('can be called directly with a derived result', () => {
    const d = derive(entry(), ctx())!;
    expect(flagsFor(entry({ depositPct: 50 }), d, ctx()).map((f) => f.key)).toContain('deposit');
  });
});

describe('best in a row', () => {
  it('picks the lowest or the highest, and all that tie', () => {
    expect(bestIndexes([5, 3, 9], 'min')).toEqual([1]);
    expect(bestIndexes([5, 3, 9], 'max')).toEqual([2]);
    expect(bestIndexes([3, 3, 9], 'min')).toEqual([0, 1]);
  });
  it('skips blanks and does not crown a lone or tied row', () => {
    expect(bestIndexes([null, 4, 2], 'min')).toEqual([2]);
    expect(bestIndexes([null, 4], 'min')).toEqual([]);
    expect(bestIndexes([4, 4, 4], 'max')).toEqual([]);
  });
});

describe('building an entry from a quote file', () => {
  it('maps what was read, and its terms, into an entry', () => {
    const e = entryFromRead({ panels: 16, watts: 470, kwp: 7.52, batteryKwh: 6.9, priceTotal: 12345, priceAfterGrant: 9945, included: ['esb'] }, { depositPct: 15, depositPcts: [15, 25], workmanshipYears: 5, grantRoute: 'paid-to-you', chemistry: 'LFP' }, 'x');
    expect(e.panels).toBe(16);
    expect(e.kwp).toBeNull();
    expect(e.price).toBe(12345);
    expect(e.grant).toBe('no');
    expect(e.paymentMismatch).toBe(true);
    expect(e.workmanshipYears).toBe(5);
    expect(e.grantRoute).toBe('paid-to-you');
    expect(e.chemistry).toBe('LFP');
    expect(e.included).toEqual(['esb']);
  });
  it('keeps the kWp when there are no panels and watts', () => {
    expect(entryFromRead({ kwp: 7.52, priceTotal: 9000 }, {}, 'x').kwp).toBe(7.52);
  });
});

describe('saving and loading a file', () => {
  it('round-trips the quotes', () => {
    const list = exampleEntries();
    const back = quotesFromFile(quotesToFile(list));
    expect(back).toHaveLength(2);
    expect(back[0].installer).toBe('Example Solar A');
    expect(back[0].price).toBe(12345);
    expect(back[0].included).toEqual(list[0].included);
    expect(back[1].forfeits).toBe(true);
  });
  it('keeps at most five quotes', () => {
    const many = Array.from({ length: 9 }, (_, i) => blankEntry(String(i)));
    expect(quotesFromFile(quotesToFile(many))).toHaveLength(MAX_QUOTES);
  });
  it('rejects something that is not a quotes file', () => {
    expect(() => quotesFromFile('nope')).toThrow();
    expect(() => quotesFromFile(JSON.stringify({ hello: 1 }))).toThrow();
    expect(() => quotesFromFile(JSON.stringify({ app: 'other', quotes: [] }))).toThrow();
  });
  it('clamps and drops anything unexpected, so a hand-edited file cannot break the page', () => {
    const text = JSON.stringify({ app: 'greenwattz-quotes', quotes: [{ installer: 'X'.repeat(500), price: -5, panels: 99999, chemistry: 'weird', grant: 'maybe', included: ['esb', 'evil', 7], batteryKwh: 'lots', notes: 'a\u0000b', depositPct: 400 }] });
    const [e] = quotesFromFile(text);
    expect(e.installer).toHaveLength(80);
    expect(e.price).toBeNull();
    expect(e.panels).toBeNull();
    expect(e.chemistry).toBe('');
    expect(e.grant).toBe('unsure');
    expect(e.included).toEqual(['esb']);
    expect(e.batteryKwh).toBe(0);
    expect(e.notes).toBe('a b');
    expect(e.depositPct).toBeNull();
  });
  it('does not save anything about the visitor beyond the figures they entered', () => {
    expect(Object.keys(JSON.parse(quotesToFile(exampleEntries())).quotes[0])).not.toEqual(expect.arrayContaining(['address', 'name', 'email', 'phone']));
  });
});

describe('the example quotes', () => {
  it('derive and raise red flags a visitor can learn from', () => {
    const [a, b] = exampleEntries();
    expect(derive(a, ctx())!.flags.length).toBeGreaterThan(1);
    expect(keys(b)).toEqual(expect.arrayContaining(['workmanship', 'before-works']));
  });
});
