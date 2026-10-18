import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { SearchBox } from '../ui/search-box';
import { SEAI, SeaiCompany, dateFmt, installerFor } from '../core/installers';

const PAGE = 40;

@Component({
  selector: 'page-seai',
  imports: [RouterLink, DecimalPipe, SearchBox],
  template: `
    <div class="wrap page">
      <h1>SEAI registered solar companies</h1>
      <p class="lead">Only SEAI-registered companies qualify you for the solar grant. Search the register here, then check ratings before you ask for a quote.</p>

      @if (all.length) {
        <div class="notice info"><i class="ph ph-info"></i><span>{{ all.length | number }} companies from SEAI's public register, imported {{ asOf }}. SEAI updates the register often, so confirm a company on <a [href]="source" target="_blank" rel="noopener noreferrer">SEAI's own page</a> before you sign. Registration is not an endorsement of their work.</span></div>

        <div class="controls card">
          <search-box label="Search by company name" [items]="names" [(value)]="q" (valueChange)="shown.set(40)" />
          <div class="field"><label for="c">County covered</label>
            <select id="c" aria-label="County covered" [value]="county()" (change)="county.set($any($event.target).value); shown.set(40)">
              <option value="">All counties</option>
              @for (c of counties; track c) { <option [value]="c">{{ c }}</option> }
            </select>
          </div>
          <label class="check rated"><input type="checkbox" [checked]="ratedOnly()" (change)="ratedOnly.set($any($event.target).checked); shown.set(40)" /><span>Only show companies with Trustpilot ratings on GreenWattz</span></label>
        </div>
        <p class="small muted" aria-live="polite">{{ list().length | number }} match{{ list().length === 1 ? '' : 'es' }}</p>

        <ul class="rows">
          @for (c of visible(); track c.name) {
            <li class="card row">
              <div class="info">
                <h2>{{ c.name }}</h2>
                <p class="small muted">{{ place(c) }}@if (c.registration) { <span class="num"> · SEAI no. {{ c.registration }}</span> }</p>
                <p class="small">
                  @if (c.website) { <a [href]="c.website" target="_blank" rel="noopener noreferrer">Website</a> }
                </p>
              </div>
              @if (rated(c); as inst) { <a class="btn sm" [routerLink]="['/reviews', inst.slug]"><i class="ph-fill ph-star"></i> {{ inst.trustpilot?.score | number: '1.1-1' }} on Trustpilot</a> }
            </li>
          }
        </ul>
        @if (list().length > shown()) { <button class="btn" type="button" (click)="shown.set(shown() + 40)">Show more</button> }
      } @else {
        <div class="card empty">
          <i class="ph ph-download-simple"></i>
          <h2>The SEAI list has not been imported yet</h2>
          <p class="muted">SEAI blocks automated downloads, so the list is imported from a file you download yourself. Open <a [href]="source" target="_blank" rel="noopener noreferrer">SEAI's solar PV companies page</a>, download the results as CSV, then run <code>npm run import:seai -- path/to/file.csv</code> and redeploy.</p>
        </div>
      }
    </div>
  `,
  styles: `
    .page { padding: 48px 0 0; display: grid; gap: 20px; }
    .lead { font-size: 1.15rem; color: var(--ink-2); max-width: 62ch; }
    .controls { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; }
    .rated { grid-column: 1 / -1; }
    @media (max-width: 700px) { .controls { grid-template-columns: 1fr; } }
    .rows { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; padding: 18px 22px; }
    .row h2 { font-size: 1.1rem; letter-spacing: -0.01em; }
    .info { display: grid; gap: 2px; .small a { margin-left: 10px; } }
    .empty { display: grid; gap: 10px; justify-items: start; i { font-size: 2rem; color: var(--accent); } code { background: var(--surface-2); padding: 2px 6px; border-radius: 6px; font-size: 0.85em; } }
  `,
})
export class SeaiPage {
  readonly all = SEAI.companies;
  readonly source = SEAI.source;
  readonly asOf = SEAI.asOf ? dateFmt(SEAI.asOf) : '';
  readonly counties = [...new Set(this.all.flatMap((c) => c.counties ?? []))].sort();
  readonly q = signal('');
  readonly names = this.all.map((c) => c.name);
  readonly county = signal('');
  readonly ratedOnly = signal(false);
  readonly shown = signal(PAGE);

  readonly list = computed(() => {
    const q = this.q().trim().toLowerCase(), c = this.county(), r = this.ratedOnly();
    return this.all.filter((x) => (!q || x.name.toLowerCase().includes(q)) && (!c || (x.counties ?? []).includes(c)) && (!r || !!installerFor(x)));
  });
  readonly visible = computed(() => this.list().slice(0, this.shown()));
  rated = (c: SeaiCompany) => installerFor(c);
  place(c: SeaiCompany) {
    const n = c.counties?.length ?? 0;
    if (!n) return 'Coverage not listed';
    return n >= 24 ? 'Covers all of Ireland' : 'Covers ' + c.counties!.join(', ');
  }
}
