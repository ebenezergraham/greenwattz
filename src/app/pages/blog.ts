import { Component, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta } from '@angular/platform-browser';
import { Block, POSTS, Post, postBySlug } from '../data/posts';
import { stripInline } from '../core/rich';
import { RichText } from '../ui/rich-text';

const fmt = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function readingMinutes(p: Post): number {
  const text = (b: Block): string => {
    switch (b.t) {
      case 'ul': case 'ol': return b.items.map(stripInline).join(' ');
      case 'callout': return b.title + ' ' + stripInline(b.text);
      case 'table': return [...b.head, ...b.rows.flat()].join(' ');
      default: return stripInline(b.text);
    }
  };
  const words = [p.title, ...p.takeaways.map(stripInline), ...p.blocks.map(text)].join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

@Component({
  selector: 'page-blog',
  imports: [RouterLink],
  template: `
    <div class="narrow page">
      <h1>Guides and news</h1>
      <p class="sub">Plain-English explainers on going solar in Ireland and the SEAI grants. New terms? See the <a routerLink="/glossary">glossary</a>.</p>
      <ul class="posts">
        @for (p of posts; track p.slug) {
          <li>
            <h2><a [routerLink]="['/blog', p.slug]">{{ p.title }}</a></h2>
            <p class="meta">{{ date(p.date) }}, {{ mins(p) }} min read</p>
            <p>{{ p.description }}</p>
            <p class="tags">@for (t of p.tags; track t) { <span>{{ t }}</span> }</p>
          </li>
        }
      </ul>
    </div>
  `,
  styles: `
    .page { padding: 40px 0 0; }
    h1 { font-size: 1.9rem; letter-spacing: -0.02em; }
    .sub { margin: 8px 0 32px; color: var(--ink-2); }
    .posts { list-style: none; margin: 0; padding: 0; }
    .posts li { padding: 26px 0; border-top: 1px solid var(--line); display: grid; gap: 6px; }
    .posts h2 { font-size: 1.35rem; letter-spacing: -0.02em; line-height: 1.25; }
    .posts h2 a { color: var(--ink); text-decoration: none; }
    .posts h2 a:hover { text-decoration: underline; text-underline-offset: 4px; }
    .meta, .tags { margin: 0; font-size: 0.875rem; color: var(--ink-3); }
    .tags { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 4px; }
  `,
})
export class BlogPage {
  readonly posts = [...POSTS].sort((a, b) => b.date.localeCompare(a.date));
  date = fmt;
  mins = readingMinutes;
}

@Component({
  selector: 'page-post',
  imports: [RouterLink, RichText],
  template: `
    @if (post; as p) {
      <article class="narrow post">
        <p class="back"><a routerLink="/blog">All guides</a></p>
        <h1>{{ p.title }}</h1>
        <p class="meta">{{ date(p.date) }}, {{ mins(p) }} min read</p>

        <section class="short" aria-labelledby="short">
          <h2 id="short">In short</h2>
          <ul>@for (t of p.takeaways; track t) { <li><rich-text [text]="t" /></li> }</ul>
        </section>

        @for (b of p.blocks; track $index) {
          @switch (b.t) {
            @case ('h2') { <h2>{{ b.text }}</h2> }
            @case ('h3') { <h3>{{ b.text }}</h3> }
            @case ('p') { <p><rich-text [text]="b.text" /></p> }
            @case ('ul') { <ul class="list">@for (i of b.items; track i) { <li><rich-text [text]="i" /></li> }</ul> }
            @case ('ol') { <ol class="list">@for (i of b.items; track i) { <li><rich-text [text]="i" /></li> }</ol> }
            @case ('callout') { <aside class="callout"><b>{{ b.title }}</b><p><rich-text [text]="b.text" /></p></aside> }
            @case ('table') {
              <div class="tablewrap" role="region" [attr.aria-label]="b.caption" tabindex="0">
                <table>
                  <caption>{{ b.caption }}</caption>
                  <thead><tr>@for (h of b.head; track h) { <th scope="col">{{ h }}</th> }</tr></thead>
                  <tbody>@for (r of b.rows; track $index) { <tr>@for (c of r; track $index; let i = $index) { @if (i === 0) { <th scope="row">{{ c }}</th> } @else { <td>{{ c }}</td> } }</tr> }</tbody>
                </table>
              </div>
            }
          }
        }

        <section class="sources" aria-labelledby="src">
          <h2 id="src">Sources</h2>
          <ul>@for (s of p.sources; track s.url) { <li><a [href]="s.url" target="_blank" rel="noopener noreferrer">{{ s.label }}</a></li> }</ul>
          <p class="small muted">Written on {{ date(p.date) }}. Grant rules and prices change, so check the official pages before you act.</p>
        </section>

        <p class="cta"><a class="btn primary" routerLink="/plan">Plan your solar</a> <a class="btn" routerLink="/glossary">Glossary</a></p>
      </article>
    } @else {
      <div class="narrow post"><h1>Article not found</h1><p><a class="btn" routerLink="/blog">All guides</a></p></div>
    }
  `,
  styles: `
    .post { padding: 40px 0 0; font-size: 1.05rem; line-height: 1.65; }
    .back { margin: 0 0 14px; font-size: 0.9rem; }
    h1 { font-size: clamp(1.7rem, 4vw, 2.3rem); line-height: 1.15; letter-spacing: -0.025em; }
    .meta { margin: 10px 0 28px; font-size: 0.9rem; color: var(--ink-3); }
    h2 { font-size: 1.45rem; letter-spacing: -0.02em; margin: 44px 0 10px; }
    h3 { font-size: 1.1rem; margin: 26px 0 6px; }
    p { margin: 0 0 16px; max-width: 66ch; }
    .short { padding: 18px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); margin-bottom: 8px; }
    .short h2 { margin: 0 0 8px; font-size: 1rem; }
    .short ul, .list { padding-left: 20px; margin: 0 0 16px; display: grid; gap: 8px; max-width: 66ch; }
    .list { padding-left: 22px; }
    .callout { margin: 24px 0; padding: 16px 18px; background: var(--surface-2); border-radius: var(--r-ctl); max-width: 66ch; p { margin: 6px 0 0; font-size: 0.98rem; } }
    .tablewrap { overflow-x: auto; margin: 22px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; line-height: 1.45; min-width: 560px; }
    caption { text-align: left; font-size: 0.85rem; color: var(--ink-3); padding-bottom: 8px; }
    th, td { text-align: left; vertical-align: top; padding: 10px 12px 10px 0; border-bottom: 1px solid var(--line); }
    thead th { font-weight: 500; font-size: 0.82rem; color: var(--ink-3); }
    tbody th { font-weight: 600; min-width: 150px; }
    .sources ul { padding-left: 20px; margin: 0 0 12px; display: grid; gap: 6px; font-size: 0.95rem; }
    .cta { margin-top: 36px; display: flex; gap: 12px; flex-wrap: wrap; }
  `,
})
export class PostPage implements OnDestroy {
  private meta = inject(Meta);
  readonly post = postBySlug(inject(ActivatedRoute).snapshot.paramMap.get('slug'));
  date = fmt;
  mins = readingMinutes;
  private previous = this.meta.getTag('name="description"')?.content;

  constructor() {
    if (this.post) this.meta.updateTag({ name: 'description', content: this.post.description });
  }
  ngOnDestroy() {
    if (this.previous) this.meta.updateTag({ name: 'description', content: this.previous });
  }
}
