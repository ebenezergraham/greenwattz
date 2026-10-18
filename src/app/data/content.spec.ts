import { describe, it, expect } from 'vitest';
import { POSTS, postBySlug, Block } from './posts';
import { GLOSSARY, GLOSSARY_SORTED, termById } from './glossary';
import { parseInline, stripInline } from '../core/rich';
import { readingMinutes } from '../pages/blog';
import { PRICES } from '../core/engine';

const eur = (n: number) => '€' + n.toLocaleString('en-IE');

const NO_EM_DASH = /[—–]/;
const blockText = (b: Block): string[] =>
  b.t === 'ul' || b.t === 'ol' ? b.items : b.t === 'callout' ? [b.title, b.text] : b.t === 'table' ? [b.caption, ...b.head, ...b.rows.flat()] : [b.text];
const postText = (p: (typeof POSTS)[number]) => [p.title, p.description, ...p.takeaways, ...p.blocks.flatMap(blockText), ...p.sources.map((s) => s.label)];

describe('inline markup', () => {
  it('splits text, bold and links', () => {
    expect(parseInline('a **b** [c](https://x.ie/y) d')).toEqual([
      { kind: 'text', text: 'a ' }, { kind: 'bold', text: 'b' }, { kind: 'text', text: ' ' },
      { kind: 'link', text: 'c', href: 'https://x.ie/y', external: true, fragment: undefined }, { kind: 'text', text: ' d' },
    ]);
  });
  it('treats paths as internal links and keeps the fragment', () => {
    expect(parseInline('[g](/glossary#mprn)')).toEqual([{ kind: 'link', text: 'g', href: '/glossary', external: false, fragment: 'mprn' }]);
  });
  it('never produces HTML: markup characters stay as text', () => {
    const segs = parseInline('<img src=x onerror=alert(1)> **b**');
    expect(segs.every((s) => s.kind !== 'link')).toBe(true);
    expect(segs[0]).toEqual({ kind: 'text', text: '<img src=x onerror=alert(1)> ' });
  });
  it('strips markup for word counts and search', () => {
    expect(stripInline('Go [here](/plan) for **more**.')).toBe('Go here for more.');
  });
  it('leaves plain text untouched', () => {
    expect(parseInline('no markup')).toEqual([{ kind: 'text', text: 'no markup' }]);
  });
});

describe('blog posts', () => {
  it('has unique slugs that are URL-safe, and each can be looked up', () => {
    const slugs = POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) { expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/); expect(postBySlug(s)?.slug).toBe(s); }
    expect(postBySlug('nope')).toBeUndefined();
  });
  it.each(POSTS.map((p) => [p.slug, p] as const))('%s has complete metadata', (_, p) => {
    expect(p.title.length).toBeGreaterThan(10);
    expect(p.description.length).toBeGreaterThan(50);
    expect(p.description.length).toBeLessThanOrEqual(200); // search snippets cut off beyond this
    expect(Number.isNaN(new Date(p.date).getTime())).toBe(false);
    expect(p.tags.length).toBeGreaterThan(0);
    expect(p.takeaways.length).toBeGreaterThanOrEqual(3);
    expect(p.blocks.length).toBeGreaterThan(5);
  });
  it.each(POSTS.map((p) => [p.slug, p] as const))('%s cites https sources and has no dead-looking links', (_, p) => {
    expect(p.sources.length).toBeGreaterThanOrEqual(3);
    for (const s of p.sources) { expect(s.url).toMatch(/^https:\/\//); expect(s.label.length).toBeGreaterThan(3); }
    const seen = new Set(p.sources.map((s) => s.url));
    for (const t of postText(p)) for (const seg of parseInline(t)) {
      if (seg.kind === 'link' && seg.external) expect(seg.href).toMatch(/^https:\/\//);
      if (seg.kind === 'link' && !seg.external) expect(['/plan', '/glossary', '/blog', '/seai-installers', '/estimates', '/quote', '/guide/esb-data']).toContain(seg.href);
    }
    expect(seen.size).toBe(p.sources.length); // no duplicate sources
  });
  it.each(POSTS.map((p) => [p.slug, p] as const))('%s has well-formed tables and no empty blocks', (_, p) => {
    for (const b of p.blocks) {
      for (const t of blockText(b)) expect(t.trim().length).toBeGreaterThan(0);
      if (b.t === 'table') for (const r of b.rows) expect(r.length).toBe(b.head.length);
      if (b.t === 'ul' || b.t === 'ol') expect(b.items.length).toBeGreaterThan(0);
    }
  });
  it.each(POSTS.map((p) => [p.slug, p] as const))('%s uses no long dashes (house style)', (_, p) => {
    for (const t of postText(p)) expect(t).not.toMatch(NO_EM_DASH);
  });
  it('reads in a sensible time', () => {
    for (const p of POSTS) { const m = readingMinutes(p); expect(m).toBeGreaterThanOrEqual(1); expect(m).toBeLessThan(30); }
  });
});

describe('Budget 2027 post facts match the project data', () => {
  const post = postBySlug('budget-2027-solar-grants')!;
  const all = postText(post).join(' ');
  it('states the grant figures the planner uses', () => {
    const g = PRICES.grants;
    expect(all).toContain(eur(g.seaiSolarMax));
    expect(all).toContain(`${eur(g.seaiSolarFirst2kwpPerKwp)} per kWp`);
    expect(all).toContain(`${eur(g.seaiSolarNext2kwpPerKwp)} per kWp`);
    expect(all).toContain(eur(g.seaiBattery));
    expect(all).toContain(eur(g.seaiEnhancedMax));
    expect(all).toContain(`before ${g.seaiSolarBuiltBefore}`);
    expect(all).toContain(eur(PRICES.tax.exportExemptionPerPerson));
    expect(all).toContain(eur(PRICES.tax.exportExemptionInForcePerPerson));
  });
  it('keeps the unconfirmed start date clearly labelled as unconfirmed', () => {
    expect(all).toMatch(/not confirmed/i);
    expect(all).toContain('Finance Bill');
  });
  it('tells readers it is not tax advice', () => {
    expect(all).toMatch(/not financial or tax advice/i);
  });
});

describe('glossary', () => {
  it('has unique ids and unique terms', () => {
    expect(new Set(GLOSSARY.map((t) => t.id)).size).toBe(GLOSSARY.length);
    expect(new Set(GLOSSARY.map((t) => t.term)).size).toBe(GLOSSARY.length);
  });
  it('covers the jargon the planner uses', () => {
    for (const id of ['kwp', 'kwh', 'kw', 'mprn', 'seai', 'inverter', 'battery', 'time-of-use', 'standing-charge', 'smart-meter', 'ceg', 'solar-grant', 'battery-grant', 'export-allowance', 'grant-offer', 'ber', 'payback', 'self-consumption', 'hdf']) {
      expect(termById(id), id).toBeDefined();
    }
  });
  it('gives every term a real plain-language definition', () => {
    for (const t of GLOSSARY) {
      expect(t.short.length, t.id).toBeGreaterThan(30);
      expect(t.short.length, t.id).toBeLessThan(260);
      expect(['Solar basics', 'Your electricity', 'Grants and tax', 'Money and results']).toContain(t.group);
    }
  });
  it('only links to terms and pages that exist', () => {
    for (const t of GLOSSARY) {
      for (const id of t.see ?? []) { expect(termById(id), `${t.id} -> ${id}`).toBeDefined(); expect(id).not.toBe(t.id); }
      for (const text of [t.short, t.more ?? '']) for (const seg of parseInline(text)) {
        if (seg.kind === 'link' && seg.external) expect(seg.href).toMatch(/^https:\/\//);
        if (seg.kind === 'link' && !seg.external) {
          expect(['/plan', '/blog', '/blog/budget-2027-solar-grants', '/seai-installers', '/guide/esb-data', '/estimates', '/glossary']).toContain(seg.href);
          if (seg.href === '/glossary' && seg.fragment) expect(termById(seg.fragment), seg.fragment).toBeDefined();
        }
      }
    }
  });
  it('links blog posts that exist', () => {
    for (const t of GLOSSARY) for (const seg of parseInline(t.more ?? '')) if (seg.kind === 'link' && seg.href.startsWith('/blog/')) expect(postBySlug(seg.href.split('/')[2])).toBeDefined();
  });
  it('is sorted alphabetically and uses no long dashes', () => {
    const names = GLOSSARY_SORTED.map((t) => t.term.toLowerCase());
    expect([...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))).toEqual(names);
    for (const t of GLOSSARY) expect(JSON.stringify(t)).not.toMatch(NO_EM_DASH);
  });
  it('agrees with the price file on grant figures, so a rule change flags the text to update', () => {
    const g = PRICES.grants, solar = termById('solar-grant')!.short, battery = termById('battery-grant')!.short;
    expect(solar).toContain(eur(g.seaiSolarFirst2kwpPerKwp));
    expect(solar).toContain(eur(g.seaiSolarNext2kwpPerKwp));
    expect(solar).toContain(eur(g.seaiSolarMax));
    expect(battery).toContain(eur(g.seaiBattery));
    expect(battery).toContain(`${g.seaiBatteryMinKwh} kWh`);
    expect(termById('built-before-2025')!.short).toContain(String(g.seaiSolarBuiltBefore));
    expect(termById('enhanced-grants')!.short).toContain(eur(g.seaiEnhancedMax));
  });
});
