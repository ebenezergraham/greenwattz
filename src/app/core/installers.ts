import ratings from '../data/installer-ratings.json';
import seai from '../data/seai-registered.json';

export interface Source { score?: number; rating?: number; count: number; url: string; asOf: string }

/** Optional 1 to 5 scores from our own verified research. Absent means we have no verified data yet. */
export interface Verified { price?: number; quality?: number; warranty?: number; aftercare?: number; communication?: number }

export interface Installer {
  slug: string; name: string; kind: string; domain: string;
  trustpilot: Source | null; google: Source | null; verified?: Verified;
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

export interface Ranked { installer: Installer; score: number; reputation: number; backed: Priority[] }

/**
 * Ranks installers. The reputation baseline is the review-count-adjusted Trustpilot score. For each
 * priority the user cares about, a verified score replaces the baseline when we have one.
 * Installers with fewer than `minReviews` Trustpilot reviews are left out.
 */
export function rank(weights: Record<Priority, number>, minReviews = 100): Ranked[] {
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  return ALL
    .filter((i) => (i.trustpilot?.count ?? 0) >= minReviews)
    .map((i) => {
      const reputation = adjusted(i.trustpilot!.score!, i.trustpilot!.count);
      const backed: Priority[] = [];
      let score = 0;
      for (const p of PRIORITIES) {
        const w = weights[p.key] ?? 0;
        const v = i.verified?.[p.key];
        if (v != null && w > 0) backed.push(p.key);
        score += (w / total) * (v ?? reputation);
      }
      return { installer: i, score, reputation, backed };
    })
    .sort((a, b) => b.score - a.score || b.installer.trustpilot!.count - a.installer.trustpilot!.count);
}

export interface SeaiCompany { name: string; county?: string; address?: string; phone?: string; website?: string; scope?: string }
export const SEAI = seai as { asOf: string | null; source: string; companies: SeaiCompany[] };

const norm = (s: string) =>
  s.toLowerCase().replace(/&/g, 'and').replace(/\b(ltd|limited|plc|dac|solar|energies|energy|ireland|the|and)\b/g, '').replace(/[^a-z0-9]/g, '');
function domainOf(u?: string): string {
  if (!u) return '';
  try { return new URL(/^https?:/i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** Finds the SEAI register entry by website domain, then by exact normalised name. Never fuzzy, to avoid false badges. */
export function seaiMatch(i: Installer): SeaiCompany | undefined {
  const dom = i.domain.replace(/^www\./, '');
  const byDomain = SEAI.companies.find((c) => domainOf(c.website) === dom);
  if (byDomain) return byDomain;
  const n = norm(i.name);
  if (n.length < 5) return undefined;
  return SEAI.companies.find((c) => { const m = norm(c.name); return m.length >= 5 && m === n; });
}

/** Reverse lookup: the rated installer (if any) for an SEAI company. */
export function installerFor(c: SeaiCompany): Installer | undefined {
  return ALL.find((i) => seaiMatch(i) === c);
}
