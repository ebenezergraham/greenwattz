import ratings from '../data/installer-ratings.json';
import seai from '../data/seai-registered.json';

export interface Source { score?: number; rating?: number; count: number; url: string; asOf: string }

/** Optional 1 to 5 scores from our own verified research. Absent means we have no verified data yet. */
export interface Verified { price?: number; quality?: number; warranty?: number; aftercare?: number; communication?: number }

export interface Installer {
  slug: string; name: string; kind: string; domain: string;
  trustpilot: Source | null; google: Source | null; verified?: Verified;
  /** Exact company name on the SEAI register when it differs from the trading name. */
  seaiName?: string;
}

export const ALL: Installer[] = (ratings as { installers: Installer[] }).installers;
export const AS_OF: string = (ratings as { asOf: string }).asOf;

/** Pulls small samples toward the market average so 4.9 from 20 reviews does not outrank 4.7 from 3,000. */
const PRIOR_N = 100, PRIOR_MEAN = 4.4;
export function adjusted(score: number, count: number): number {
  return (count * score + PRIOR_N * PRIOR_MEAN) / (count + PRIOR_N);
}
export const mapsUrl = (i: Installer) => i.google?.url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.name + ' Ireland')}`;
export const siteUrl = (i: Installer) => `https://${i.domain.startsWith('www.') ? '' : 'www.'}${i.domain}`;
export const dateFmt = (iso: string) => new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });

export type Priority = keyof Verified;
export const PRIORITIES: { key: Priority; label: string; ask: string }[] = [
  { key: 'price', label: 'Price', ask: 'Ask for a fully itemised price and what is not included.' },
  { key: 'quality', label: 'Install quality', ask: 'Ask who installs (own staff or subcontractors) and for the panel and inverter brands.' },
  { key: 'warranty', label: 'Warranty', ask: 'Ask for panel, inverter, battery and workmanship warranty lengths in writing.' },
  { key: 'aftercare', label: 'Aftercare', ask: 'Ask who you call if something fails and how fast they respond.' },
  { key: 'communication', label: 'Communication', ask: 'Ask who your single point of contact is and how long the process takes.' },
];

/** Things we can rank on today because they come from public reviews. */
export type DataCriterion = 'trustpilot' | 'google' | 'experience';
export type Criterion = Priority | DataCriterion;

export const DATA_CRITERIA: { key: DataCriterion; label: string; hint: string }[] = [
  { key: 'trustpilot', label: 'Trustpilot rating', hint: 'Score on Trustpilot, adjusted for how many reviews it rests on.' },
  { key: 'google', label: 'Google Maps rating', hint: 'Score on Google Maps, adjusted the same way.' },
  { key: 'experience', label: 'Track record', hint: 'How many customers have reviewed them, a sign of how long and how much they install.' },
];
export const criterionLabel = (k: Criterion) => DATA_CRITERIA.find((c) => c.key === k)?.label ?? PRIORITIES.find((p) => p.key === k)!.label;

export interface Ranked { installer: Installer; score: number; reputation: number; backed: Criterion[] }

/** Review volume on a 3 to 5 scale, so it blends with ratings: the most reviewed installer gets 5, a 100-review one gets 3. */
function experienceScores(list: Installer[]): Map<string, number> {
  const n = (i: Installer) => (i.trustpilot?.count ?? 0) + (i.google?.count ?? 0);
  const top = Math.max(...list.map(n), 101);
  return new Map(list.map((i) => [i.slug, 3 + 2 * Math.min(1, Math.log(Math.max(n(i), 100) / 100) / Math.log(top / 100))]));
}

/**
 * Ranks installers. Public review criteria (Trustpilot, Google, track record) always use real data. The five
 * "ask the installer" priorities use a verified score when we have one, and otherwise fall back to the
 * reputation baseline. A criterion missing from `weights` counts for nothing.
 * Installers with fewer than `minReviews` Trustpilot reviews are left out.
 */
export function rank(weights: Partial<Record<Criterion, number>>, minReviews = 100, list: Installer[] = ALL): Ranked[] {
  const total = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0) || 1;
  const eligible = list.filter((i) => (i.trustpilot?.count ?? 0) >= minReviews);
  const exp = experienceScores(eligible);
  return eligible
    .map((i) => {
      const reputation = adjusted(i.trustpilot!.score!, i.trustpilot!.count);
      const googleScore = i.google?.rating != null ? adjusted(i.google.rating, i.google.count) : null;
      const backed: Criterion[] = [];
      let score = 0;
      const add = (key: Criterion, value: number, real: boolean) => {
        const w = weights[key] ?? 0;
        if (w <= 0) return;
        if (real) backed.push(key);
        score += (w / total) * value;
      };
      add('trustpilot', reputation, true);
      add('google', googleScore ?? reputation, googleScore != null);
      add('experience', exp.get(i.slug)!, true);
      for (const p of PRIORITIES) {
        const v = i.verified?.[p.key];
        add(p.key, v ?? reputation, v != null);
      }
      return { installer: i, score, reputation, backed };
    })
    .sort((a, b) => b.score - a.score || b.installer.trustpilot!.count - a.installer.trustpilot!.count);
}

export interface SeaiCompany { name: string; registration?: string; counties?: string[]; website?: string; scope?: string }
export const SEAI = seai as { asOf: string | null; source: string; companies: SeaiCompany[] };

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/\b(ltd|limited|plc|dac|solar|energies|energy|ireland|the|and)\b/g, '').replace(/[^a-z0-9]/g, '');
function domainOf(u?: string): string {
  if (!u) return '';
  try { return new URL(/^https?:/i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** Finds the SEAI register entry by website domain, then by exact normalised name. Never fuzzy, to avoid false badges. */
export function seaiMatch(i: Installer, companies: SeaiCompany[] = SEAI.companies): SeaiCompany | undefined {
  const dom = i.domain.replace(/^www\./, '');
  const byDomain = companies.find((c) => domainOf(c.website) === dom);
  if (byDomain) return byDomain;
  const n = norm(i.seaiName ?? i.name);
  if (n.length < 2) return undefined;
  return companies.find((c) => { const m = norm(c.name); return m.length >= 2 && m === n; });
}

/** Reverse lookup: the rated installer (if any) for an SEAI company. */
export function installerFor(c: SeaiCompany): Installer | undefined {
  return ALL.find((i) => seaiMatch(i) === c);
}
