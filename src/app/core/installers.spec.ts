import { describe, it, expect } from 'vitest';
import { Installer, SeaiCompany, adjusted, rank, seaiMatch, PRIORITIES, DATA_CRITERIA, criterionLabel } from './installers';

const mk = (slug: string, name: string, score: number, count: number, extra: Partial<Installer> = {}): Installer => ({
  slug, name, kind: 'Solar installer', domain: `${slug}.ie`, google: null,
  trustpilot: { score, count, url: `https://ie.trustpilot.com/review/${slug}.ie`, asOf: '2026-10-17' }, ...extra,
});
const equal = { price: 1, quality: 1, warranty: 1, aftercare: 1, communication: 1 };

describe('review count adjustment', () => {
  it('does not let a few reviews beat many', () => {
    expect(adjusted(4.9, 20)).toBeLessThan(adjusted(4.7, 3000));
  });
  it('approaches the real score as reviews grow', () => {
    expect(adjusted(4.7, 100000)).toBeCloseTo(4.7, 2);
  });
  it('pulls tiny samples towards the market average', () => {
    expect(adjusted(5, 1)).toBeCloseTo(4.4, 1);
  });
});

describe('installer ranking', () => {
  const list = [mk('big', 'Big Solar', 4.7, 3000), mk('small', 'Small Solar', 4.9, 120), mk('tiny', 'Tiny Solar', 5, 10), mk('bad', 'Bad Solar', 2.2, 500)];
  it('leaves out installers with fewer than 100 reviews', () => {
    expect(rank(equal, 100, list).map((r) => r.installer.slug)).not.toContain('tiny');
  });
  it('orders by adjusted reputation and pushes a poor score to the bottom', () => {
    const order = rank(equal, 100, list).map((r) => r.installer.slug);
    expect(order[order.length - 1]).toBe('bad');
    expect(order.indexOf('big')).toBeLessThan(order.indexOf('bad'));
  });
  it('gives the same order for any priorities when no verified data exists', () => {
    const a = rank(equal, 100, list).map((r) => r.installer.slug);
    const b = rank({ price: 2, quality: 0, warranty: 2, aftercare: 0, communication: 0 }, 100, list).map((r) => r.installer.slug);
    expect(b).toEqual(a);
  });
  it('uses verified scores for the priorities the user cares about', () => {
    const l = [mk('a', 'A', 4.8, 500, { verified: { warranty: 2 } }), mk('b', 'B', 4.5, 500, { verified: { warranty: 5 } })];
    const warrantyFirst = { price: 0, quality: 0, warranty: 2, aftercare: 0, communication: 0 };
    const r = rank(warrantyFirst, 100, l);
    expect(r[0].installer.slug).toBe('b');
    expect(r[0].backed).toEqual(['warranty']);
    expect(rank({ ...warrantyFirst, warranty: 0, quality: 2 }, 100, l)[0].installer.slug).toBe('a'); // warranty no longer matters
  });
  it('has a question to ask for each priority', () => {
    for (const p of PRIORITIES) expect(p.ask.length).toBeGreaterThan(10);
  });
});

describe('weighting public review criteria', () => {
  const g = (rating: number, count: number) => ({ rating, count, url: 'https://maps.example', asOf: '2026-10-17' });
  const l = [
    mk('rated', 'Rated', 4.6, 400, { google: g(4.9, 800) }),
    mk('busy', 'Busy', 4.6, 5000, { google: g(4.5, 3000) }),
  ];
  it('puts the better Google rating first when that is what matters', () => {
    expect(rank({ google: 3 }, 100, l)[0].installer.slug).toBe('rated');
  });
  it('puts the most reviewed first when track record is what matters', () => {
    expect(rank({ experience: 3 }, 100, l)[0].installer.slug).toBe('busy');
  });
  it('lets the user flip the order by changing the weights', () => {
    expect(rank({ google: 3 }, 100, l)[0].installer.slug).not.toBe(rank({ experience: 3 }, 100, l)[0].installer.slug);
  });
  it('counts a criterion left out of the weights for nothing', () => {
    const a = rank({ trustpilot: 1 }, 100, l).map((r) => r.installer.slug);
    const b = rank({ trustpilot: 1, google: 0, experience: 0 }, 100, l).map((r) => r.installer.slug);
    expect(a).toEqual(b);
  });
  it('marks review criteria as backed by data, but not a missing Google rating', () => {
    const noGoogle = [mk('x', 'X', 4.6, 400)];
    expect(rank({ trustpilot: 1, google: 1, experience: 1 }, 100, noGoogle)[0].backed).toEqual(['trustpilot', 'experience']);
    expect(rank({ trustpilot: 1, google: 1, experience: 1 }, 100, l)[0].backed).toEqual(['trustpilot', 'google', 'experience']);
  });
  it('keeps scores on the same scale as ratings', () => {
    for (const r of rank({ trustpilot: 1, google: 1, experience: 1 }, 100, l)) { expect(r.score).toBeGreaterThanOrEqual(3); expect(r.score).toBeLessThanOrEqual(5); }
  });
  it('has labels for every criterion', () => {
    for (const c of DATA_CRITERIA) expect(criterionLabel(c.key)).toBe(c.label);
    expect(criterionLabel('price')).toBe('Price');
  });
});

describe('SEAI register matching', () => {
  const reg = (name: string, website?: string): SeaiCompany => ({ name, website });
  const companies = [reg('PV Generation Ltd.', 'https://www.pvgeneration.ie'), reg('Bord Gais Energy Ltd'), reg('Ecoplex Energy Solution LTD'), reg('AK solar')];
  it('matches by website domain', () => {
    expect(seaiMatch(mk('pvgeneration', 'PVGen', 4.7, 1000, { domain: 'pvgeneration.ie' }), companies)?.name).toBe('PV Generation Ltd.');
  });
  it('matches by exact name ignoring Ltd, accents and case', () => {
    expect(seaiMatch(mk('bg', 'Bord Gáis Energy', 4.2, 1000), companies)?.name).toBe('Bord Gais Energy Ltd');
    expect(seaiMatch(mk('ak', 'AK Solar', 4.9, 100), companies)?.name).toBe('AK solar');
  });
  it('uses a curated alias when the register name differs', () => {
    expect(seaiMatch(mk('eco', 'Ecoplex Energy', 4.3, 400, { seaiName: 'Ecoplex Energy Solution LTD' }), companies)?.name).toBe('Ecoplex Energy Solution LTD');
  });
  it('never fuzzy matches: "Solar Generation" is not "PV Generation"', () => {
    expect(seaiMatch(mk('sg', 'Solar Generation', 4.7, 209, { domain: 'solargeneration.ie' }), companies)).toBeUndefined();
  });
});
