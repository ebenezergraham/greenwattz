import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GLOSSARY_SORTED, Term, termById } from '../data/glossary';
import { stripInline } from '../core/rich';
import { RichText } from '../ui/rich-text';

const letterOf = (t: Term) => t.term.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase() || '#';

@Component({
  selector: 'page-glossary',
  imports: [RouterLink, RichText],
  template: `
    <div class="narrow page">
      <h1>Glossary</h1>
      <p class="sub">Solar and grant jargon in plain English. Amounts and rules are as of October 2026, so check <a href="https://www.seai.ie/" target="_blank" rel="noopener noreferrer">SEAI</a> and <a href="https://www.revenue.ie/" target="_blank" rel="noopener noreferrer">Revenue</a> for the latest.</p>

      <div class="field find">
        <label for="gq">Find a term</label>
        <input id="gq" type="text" [value]="q()" (input)="q.set($any($event.target).value)" autocomplete="off" />
      </div>
      <p class="small muted" aria-live="polite">{{ filtered().length }} of {{ total }} terms</p>

      @if (letters().length) {
        <nav class="az" aria-label="Jump to letter">
          @for (l of letters(); track l) { <a routerLink="/glossary" [fragment]="'letter-' + l">{{ l }}</a> }
        </nav>
      }

      @for (g of groups(); track g.letter) {
        <section [id]="'letter-' + g.letter" class="letter">
          <h2>{{ g.letter }}</h2>
          @for (t of g.terms; track t.id) {
            <article [id]="t.id" class="term">
              <h3>{{ t.term }}</h3>
              <p><rich-text [text]="t.short" /></p>
              @if (t.more) { <p class="more"><rich-text [text]="t.more" /></p> }
              @if (t.see?.length) {
                <p class="see">See also: @for (id of t.see; track id; let last = $last) { <a routerLink="/glossary" [fragment]="id" (click)="q.set('')">{{ name(id) }}</a>@if (!last) {, } }</p>
              }
            </article>
          }
        </section>
      } @empty {
        <p class="empty">No terms match "{{ q() }}". Try a shorter word, or <a routerLink="/plan">start the planner</a> and ask us what is unclear.</p>
      }

      <p class="cta"><a class="btn primary" routerLink="/plan">Plan your solar</a> <a class="btn" routerLink="/blog">Guides</a></p>
    </div>
  `,
  styles: `
    .page { padding: 40px 0 0; }
    h1 { font-size: 1.9rem; letter-spacing: -0.02em; }
    .sub { margin: 8px 0 24px; color: var(--ink-2); max-width: 62ch; }
    .find { max-width: 360px; }
    .az { display: flex; flex-wrap: wrap; gap: 4px 6px; margin: 16px 0 8px; position: sticky; top: 68px; z-index: 5; background: var(--bg); padding: 8px 0; }
    .az a { min-width: 32px; height: 32px; display: grid; place-items: center; border-radius: 6px; font-weight: 600; font-size: 0.9rem; text-decoration: none; color: var(--ink-2); }
    .az a:hover { background: var(--surface-2); color: var(--ink); }
    .letter { margin-top: 28px; scroll-margin-top: 130px; }
    .letter h2 { font-size: 1.1rem; color: var(--ink-3); padding-bottom: 6px; border-bottom: 1px solid var(--line); margin-bottom: 4px; }
    .term { padding: 18px 0; border-bottom: 1px solid var(--line); scroll-margin-top: 130px; }
    .term h3 { font-size: 1.1rem; margin-bottom: 4px; }
    .term p { margin: 6px 0 0; max-width: 66ch; }
    .term .more { color: var(--ink-2); font-size: 0.95rem; }
    .term .see { font-size: 0.875rem; color: var(--ink-3); }
    .term .see a { color: var(--accent); }
    .term:target h3 { text-decoration: underline; text-decoration-color: var(--accent); text-underline-offset: 6px; }
    .empty { margin-top: 32px; color: var(--ink-2); }
    .cta { margin-top: 40px; display: flex; gap: 12px; flex-wrap: wrap; }
  `,
})
export class GlossaryPage {
  readonly q = signal('');
  readonly total = GLOSSARY_SORTED.length;
  readonly filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    if (!q) return GLOSSARY_SORTED;
    return GLOSSARY_SORTED.filter((t) => [t.term, t.short, t.more ?? ''].map(stripInline).join(' ').toLowerCase().includes(q));
  });
  readonly groups = computed(() => {
    const m = new Map<string, Term[]>();
    for (const t of this.filtered()) { const l = letterOf(t); m.set(l, [...(m.get(l) ?? []), t]); }
    return [...m].map(([letter, terms]) => ({ letter, terms }));
  });
  readonly letters = computed(() => this.groups().map((g) => g.letter));
  name(id: string) { return termById(id)?.term ?? id; }

  constructor() {
    // The list renders after the router's own anchor scroll runs, so scroll to the entry once it exists.
    inject(ActivatedRoute).fragment.pipe(takeUntilDestroyed()).subscribe((f) => {
      if (f) setTimeout(() => document.getElementById(f)?.scrollIntoView({ block: 'start', behavior: 'instant' }), 80);
    });
  }
}
