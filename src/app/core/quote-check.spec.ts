import { describe, it, expect } from 'vitest';
import {
  BENCHMARKS, INCLUSIONS, QuoteInput, acceptAiFields, batteryCohort, benchmarksAreStale, checkQuote, fieldsToInput, grantsFor, halfYears, mergeReads,
  readQuoteText, sizeCohort, systemKwp,
} from './quote-check';
import { compressForAi } from './browser-ai';

const quote = (p: Partial<QuoteInput> = {}): QuoteInput => ({ panels: 20, watts: 455, kwp: null, batteryKwh: 18, price: 14700, grant: 'unsure', included: [], ...p });

describe('system size', () => {
  it('multiplies panels by watts', () => expect(systemKwp({ panels: 20, watts: 455, kwp: null })).toBeCloseTo(9.1, 9));
  it('falls back to the kWp the quote gives', () => expect(systemKwp({ panels: null, watts: null, kwp: 7.52 })).toBe(7.52));
  it('is zero when nothing is known', () => expect(systemKwp({ panels: null, watts: 455, kwp: null })).toBe(0));
});

describe('benchmark groups', () => {
  it('picks the battery group by size, with none below the first step', () => {
    expect(batteryCohort(0).key).toBe('none');
    expect(batteryCohort(6.9).key).toBe('small');
    expect(batteryCohort(8).key).toBe('large');
    expect(batteryCohort(20).key).toBe('large');
  });
  it('picks the size group by kWp', () => {
    expect(sizeCohort(3.5).key).toBe('under5');
    expect(sizeCohort(5).key).toBe('5to8');
    expect(sizeCohort(7.9).key).toBe('5to8');
    expect(sizeCohort(8).key).toBe('8plus');
    expect(sizeCohort(15).key).toBe('8plus');
  });
});

describe('checking a quote', () => {
  it('needs a size and a price', () => {
    expect(checkQuote(quote({ price: 0 }))).toBeNull();
    expect(checkQuote(quote({ panels: null, watts: null, kwp: null }))).toBeNull();
  });
  it('compares the price as quoted when the grant status is not known', () => {
    const c = checkQuote(quote())!;
    expect(c.kwp).toBeCloseTo(9.1, 9);
    expect(c.perKwp).toBeCloseTo(14700 / 9.1, 6);
  });
  it('calls a price inside the range typical, one above it above, and one below it below', () => {
    const base = checkQuote(quote())!;
    const at = (perKwp: number) => checkQuote(quote({ price: perKwp * 9.1 }))!;
    expect(at(base.range.median).verdict).toBe('typical');
    expect(at(base.range.low * 0.9).verdict).toBe('below');
    expect(at(base.range.high * 1.02).verdict).toBe('above');
  });
  it('calls a price far above the median well above typical', () => {
    const base = checkQuote(quote())!;
    expect(checkQuote(quote({ price: base.range.median * 1.6 * 9.1 }))!.verdict).toBe('far-above');
  });
  it('blends the battery group and the size group', () => {
    const c = checkQuote(quote())!;
    expect(c.range.median).toBeCloseTo((c.battery.median + c.size.median) / 2, 9);
    expect(c.range.low).toBeLessThan(c.range.median);
    expect(c.range.high).toBeGreaterThan(c.range.median);
  });
  it('reports how far from the median the quote is', () => {
    const c = checkQuote(quote())!;
    expect(c.vsMedianPct).toBeCloseTo(c.perKwp / c.range.median - 1, 9);
  });
  it('compares the price after grants when the grant status is known', () => {
    const kwp = 9.1, grants = grantsFor(kwp, 18);
    const no = checkQuote(quote({ grant: 'no', price: 14700 }))!;
    expect(no.basis).toBe('after-grant');
    expect(no.perKwp).toBeCloseTo((14700 - grants) / kwp, 6);
    const yes = checkQuote(quote({ grant: 'yes', price: 12000 }))!;
    expect(yes.basis).toBe('after-grant');
    expect(yes.perKwp).toBeCloseTo(12000 / kwp, 6);
    expect(checkQuote(quote({ grant: 'unsure' }))!.basis).toBe('as-quoted');
  });
  it('puts a quote on a before and after grant footing', () => {
    const grants = grantsFor(9.1, 18);
    expect(grants).toBeGreaterThan(0);
    const taken = checkQuote(quote({ grant: 'yes', price: 12000 }))!;
    expect(taken.afterGrant).toBe(12000);
    expect(taken.beforeGrant).toBeCloseTo(12000 + grants, 6);
    const notTaken = checkQuote(quote({ grant: 'no', price: 12000 }))!;
    expect(notTaken.beforeGrant).toBe(12000);
    expect(notTaken.afterGrant).toBeCloseTo(12000 - grants, 6);
  });
  it('adds the battery grant only for a battery big enough', () => {
    expect(grantsFor(5, 10) - grantsFor(5, 0)).toBeGreaterThan(0);
    expect(grantsFor(5, 2)).toBe(grantsFor(5, 0));
  });
  it('works out what the typical range comes to for a system this size', () => {
    const c = checkQuote(quote())!;
    expect(c.typicalTotal.median).toBeCloseTo(c.range.median * c.kwp, 6);
    expect(c.typicalTotal.low).toBeLessThan(c.typicalTotal.median);
    expect(c.typicalTotal.high).toBeGreaterThan(c.typicalTotal.median);
  });
  it('flags a comparison that rests on few quotes', () => {
    expect(checkQuote(quote({ batteryKwh: 0 }))!.thin).toBe(true); // only 4 quotes without a battery
    expect(checkQuote(quote({ batteryKwh: 10, panels: 20, watts: 455 }))!.thin).toBe(false);
  });
  it('calls the comparison rough for tiny systems and for a battery that is large for the panels', () => {
    expect(checkQuote(quote({ panels: 6, watts: 450, batteryKwh: 5 }))!.rough.join(' ')).toMatch(/small/i);
    expect(checkQuote(quote({ panels: 8, watts: 450, batteryKwh: 15 }))!.rough.join(' ')).toMatch(/battery is large/i);
    expect(checkQuote(quote({ panels: 20, watts: 455, batteryKwh: 10 }))!.rough).toEqual([]);
  });
});

describe('questions to ask', () => {
  it('always asks for models, warranties, payment and cancellation terms and a survey', () => {
    const qs = checkQuote(quote({ included: INCLUSIONS.map((i) => i.key) }))!.questions.join(' ');
    expect(qs).toMatch(/models and datasheets/);
    expect(qs).toMatch(/payment schedule/);
    expect(qs).toMatch(/survey/);
  });
  it('asks about each thing the quote does not say is included', () => {
    const none = checkQuote(quote({ included: [] }))!.questions;
    const all = checkQuote(quote({ included: INCLUSIONS.map((i) => i.key) }))!.questions;
    expect(none.length).toBeGreaterThan(all.length);
    expect(none.join(' ')).toMatch(/scaffolding/i);
    expect(all.join(' ')).not.toMatch(/scaffolding/i);
  });
  it('asks about the grant when it is unsure or not taken off', () => {
    expect(checkQuote(quote({ grant: 'unsure' }))!.questions.join(' ')).toMatch(/SEAI grant/);
    expect(checkQuote(quote({ grant: 'no' }))!.questions.join(' ')).toMatch(/who applies/i);
    expect(checkQuote(quote({ grant: 'yes' }))!.questions.join(' ')).not.toMatch(/already taken off the price, or paid/);
  });
  it('asks for a breakdown when the price is high and checks the scope when it is low', () => {
    const base = checkQuote(quote())!;
    expect(checkQuote(quote({ price: base.range.high * 1.4 * 9.1 }))!.questions[0]).toMatch(/above the typical price/);
    expect(checkQuote(quote({ price: base.range.low * 0.7 * 9.1 }))!.questions[0]).toMatch(/below the typical range/);
  });
  it('asks about battery power and usable capacity when there is a battery, and hybrid readiness when there is not', () => {
    expect(checkQuote(quote({ batteryKwh: 10 }))!.questions.join(' ')).toMatch(/usable kWh/);
    expect(checkQuote(quote({ batteryKwh: 0 }))!.questions.join(' ')).toMatch(/hybrid/);
  });
  it('warns when the system is above the single-phase limit', () => {
    expect(checkQuote(quote({ panels: 16, watts: 470 }))!.questions.join(' ')).toMatch(/6 kW single-phase/);
    expect(checkQuote(quote({ panels: 10, watts: 450 }))!.questions.join(' ')).not.toMatch(/6 kW single-phase/);
  });
});

describe('prices by half of the year', () => {
  const halves = halfYears();
  it('groups the quarters into halves in date order', () => {
    expect(halves.map((h) => h.period)).toEqual(['H2 2025', 'H1 2026', 'H2 2026']);
  });
  it('adds up the quote counts', () => {
    expect(halves.find((h) => h.period === 'H1 2026')!.n).toBe(8 + 11);
    expect(halves.find((h) => h.period === 'H2 2026')!.n).toBe(7 + 66);
  });
  it('weights the median by quote count, so a quarter with far more quotes dominates', () => {
    const h2 = halves.find((h) => h.period === 'H2 2026')!;
    expect(Math.abs(h2.median - 1384)).toBeLessThan(Math.abs(h2.median - 1429));
    expect(h2.approximate).toBe(true);
  });
  it('keeps a single quarter exact', () => {
    const h = halves.find((x) => x.period === 'H2 2025')!;
    expect(h.median).toBe(1265);
    expect(h.approximate).toBe(false);
  });
  it('keeps each range ordered and drops periods with too few quotes', () => {
    for (const h of halves) { expect(h.low).toBeLessThanOrEqual(h.median); expect(h.median).toBeLessThanOrEqual(h.high); }
    expect(halfYears([{ period: 'Q1 2026', n: 2, median: 1000, low: 900, high: 1100 }], 3)).toEqual([]);
  });
});

describe('reading quote text', () => {
  const text = [
    '7.52kW Solar system with 6.9kWh battery storage €8,350.00 €8,350.00',
    'Solar Panel DMEGC Solar Infinity RT DM470G12RT-B48HBB (470W) 16 (incl.)',
    'Huawei LUNA2000-7-S1 (6.9kWh / 6.9kWh usable) 1 (incl.)',
    'Scaffolding and roof access included',
    'T otal €12,345.00',
    'SEAI solar grant paid directly to client for houses built before 2025 -€1,800.00',
    'SEAI battery grant (for houses built before 2025) -€600.00',
    'Total after grant €9,945.00',
    'Post Install BER Certification and commissioning',
    'Online Monitoring Smart Phone App',
  ].join('\n');
  const r = readQuoteText(text, ['Renewables Ireland']);
  it('finds the size, panel watts and battery', () => {
    expect(r.kwp).toBe(7.52);
    expect(r.watts).toBe(470);
    expect(r.batteryKwh).toBe(6.9);
  });
  it('finds the totals before and after grants, and the grants', () => {
    expect(r.priceTotal).toBe(12345);
    expect(r.priceAfterGrant).toBe(9945);
    expect(r.grantSolar).toBe(1800);
    expect(r.grantBattery).toBe(600);
  });
  it('finds panel count from "16 x 470W"', () => {
    const p = readQuoteText('16 × 470W DMEGC panels, 1 x Huawei inverter');
    expect(p.panels).toBe(16);
    expect(p.watts).toBe(470);
  });
  it('notes what is included', () => {
    expect(r.included).toEqual(expect.arrayContaining(['scaffold', 'ber', 'monitor']));
  });
  it('matches a known installer name', () => {
    expect(readQuoteText('Quote from Renewables Ireland Ltd', ['Renewables Ireland']).installer).toBe('Renewables Ireland');
  });
  it('finds nothing in text that is not a quote', () => expect(Object.keys(readQuoteText('Hello, this is a letter about the weather.'))).toEqual([]));
  it('turns what was read into form values, with the before-grant total by default', () => {
    const f = fieldsToInput(r);
    expect(f.price).toBe(12345);
    expect(f.priceBasis).toBe('before');
    expect(f.grant).toBe('no');
    expect(f.batteryKwh).toBe(6.9);
  });
  it('uses the after-grant total, and marks the grant as taken off, when that is all there is', () => {
    const f = fieldsToInput({ priceAfterGrant: 9945 });
    expect(f.price).toBe(9945);
    expect(f.grant).toBe('yes');
    expect(f.priceBasis).toBe('after');
  });
  it('leaves the grant as not sure when the text never mentions it', () => expect(fieldsToInput({ priceTotal: 9000, kwp: 5 }).grant).toBe('unsure'));
});

describe('the browser AI reading', () => {
  const text = 'System 7.52 kWp, battery 6.9 kWh, total €12,345.00 and after grant €9,945.00 from Renewables Ireland';
  it('keeps only numbers that appear in the quote, so an invented figure never gets in', () => {
    const kept = acceptAiFields({ kwp: 7.52, batteryKwh: 6.9, priceTotal: 12345, priceAfterGrant: 9999, panels: 55 }, text);
    expect(kept.kwp).toBe(7.52);
    expect(kept.batteryKwh).toBe(6.9);
    expect(kept.priceTotal).toBe(12345);
    expect(kept.priceAfterGrant).toBeUndefined();
    expect(kept.panels).toBeUndefined();
  });
  it('keeps an installer name only if it is in the text', () => {
    expect(acceptAiFields({ installer: 'Renewables Ireland' }, text).installer).toBe('Renewables Ireland');
    expect(acceptAiFields({ installer: 'Acme Solar' }, text).installer).toBeUndefined();
  });
  it('ignores values of the wrong kind', () => expect(acceptAiFields({ kwp: 'big' as unknown as number }, text).kwp).toBeUndefined());
  it('lets the AI win where both readings have a value, and keeps the rules where only they do', () => {
    const { fields, found } = mergeReads({ kwp: 7.5, panels: 16 }, { kwp: 7.52 });
    expect(fields.kwp).toBe(7.52);
    expect(found.kwp).toBe('ai');
    expect(fields.panels).toBe(16);
    expect(found.panels).toBe('rules');
  });
  it('shortens long text to the lines that matter and the model can hold', () => {
    const long = ['Dear customer', ...Array.from({ length: 400 }, (_, i) => `Terms line ${i} with a number ${i}`), 'Total €12,345.00 battery 6.9 kWh'].join('\n');
    const c = compressForAi(long, 500);
    expect(c.length).toBeLessThanOrEqual(520);
    expect(compressForAi('Hello there\nTotal €12,345.00\nthanks')).toBe('Total €12,345.00');
  });
});

describe('benchmark data', () => {
  const b = BENCHMARKS;
  it('credits the source with a link', () => {
    expect(b.source.url).toMatch(/^https:\/\//);
    expect(b.source.label).toMatch(/FairWatt/);
  });
  it('keeps every range realistic and ordered', () => {
    for (const c of [b.overall, ...b.byBattery, ...b.bySize, ...b.quarters]) {
      expect(c.n).toBeGreaterThan(0);
      expect(c.low).toBeLessThan(c.median);
      expect(c.median).toBeLessThan(c.high);
      expect(c.low).toBeGreaterThan(600);
      expect(c.high).toBeLessThan(3500);
    }
  });
  it('has groups that add up to the overall count', () => {
    expect(b.byBattery.reduce((t, c) => t + c.n, 0)).toBe(b.overall.n);
    expect(b.bySize.reduce((t, c) => t + c.n, 0)).toBe(b.overall.n);
  });
  it('has group boundaries in ascending order', () => {
    for (let i = 1; i < b.byBattery.length; i++) expect(b.byBattery[i].belowKwh).toBeGreaterThan(b.byBattery[i - 1].belowKwh);
    for (let i = 1; i < b.bySize.length; i++) expect(b.bySize[i].belowKwp).toBeGreaterThan(b.bySize[i - 1].belowKwp);
  });
  it('has a typical system price that matches the per kWp figures', () => {
    const mid = (b.typicalSystem.minKwp + b.typicalSystem.maxKwp) / 2;
    const perKwp = b.typicalSystem.price / mid;
    expect(perKwp).toBeGreaterThan(b.overall.low * 0.8);
    expect(perKwp).toBeLessThan(b.overall.high * 1.2);
  });
  it('warns when the figures are overdue for review', () => {
    const reviewed = new Date(b.reviewedOn + 'T00:00:00Z').getTime();
    expect(benchmarksAreStale(new Date(reviewed + b.reviewEveryDays * 86400000))).toBe(false);
    expect(benchmarksAreStale(new Date(reviewed + (b.reviewEveryDays + 1) * 86400000))).toBe(true);
  });
});
