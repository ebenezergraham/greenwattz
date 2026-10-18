import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { ALL, Installer, adjusted, dateFmt, mapsUrl, AS_OF, seaiMatch } from '../core/installers';

type Sort = 'adjusted' | 'score' | 'count' | 'name';

@Component({
  selector: 'page-reviews',
  imports: [RouterLink, DecimalPipe],
  template: `
    <div class="wrap page">
      <h1>Solar installer reviews</h1>
      <p class="lead">Existing customer ratings from Trustpilot and Google Maps, side by side, so you can compare Irish installers before you ask for a quote.</p>
      <div class="notice info"><i class="ph ph-info"></i><span>We show each platform's overall score and review count, and link to the reviews themselves. Scores were read from public Trustpilot pages on {{ asOf }}. They change, so check the live page. We do not edit or host the reviews.</span></div>

      <div class="controls card">
        <div class="field"><label for="q">Search installers</label><input id="q" type="text" [value]="q()" (input)="q.set($any($event.target).value)" /></div>
        <div class="field"><label for="s">Sort by</label>
          <select id="s" [value]="sort()" (change)="sort.set($any($event.target).value)">
            <option value="adjusted">Best overall (adjusted for review count)</option>
            <option value="score">Highest Trustpilot score</option>
            <option value="count">Most reviews</option>
            <option value="name">Name</option>
          </select>
        </div>
        <div class="field"><label for="m">Minimum Trustpilot reviews</label>
          <select id="m" [value]="min()" (change)="min.set(+$any($event.target).value)">
            <option value="0">Any</option><option value="50">50 or more</option><option value="150">150 or more</option><option value="500">500 or more</option>
          </select>
        </div>
      </div>
      <p class="small muted">"Adjusted" pulls small samples towards the average, so a 4.9 from 20 reviews does not beat a 4.7 from 3,000.</p>

      @if (list().length) {
        <div class="providers">
          @for (i of list(); track i.slug) {
            <article class="card prov">
              <div class="head"><div><h2><a [routerLink]="['/reviews', i.slug]">{{ i.name }}</a></h2><span class="small muted">{{ i.kind }}</span></div>@if (seai(i)) { <span class="chip" title="Found on the SEAI register of solar PV companies"><i class="ph-fill ph-seal-check"></i> SEAI</span> }</div>
              <div class="src">
                <div class="where"><i class="ph-fill ph-star"></i><span>Trustpilot</span></div>
                @if (i.trustpilot; as t) {
                  <div class="val"><b class="num">{{ t.score | number: '1.1-1' }}</b><span class="small muted num">{{ t.count | number }} reviews</span></div>
                  @if (t.count < 100) { <span class="small warn">Few reviews, treat with care</span> }
                }
              </div>
              <div class="src">
                <div class="where"><i class="ph ph-map-pin"></i><span>Google Maps</span></div>
                @if (i.google; as g) {
                  <div class="val"><b class="num">{{ g.rating | number: '1.1-1' }}</b><span class="small muted num">{{ g.count | number }} reviews</span></div>
                } @else {
                  <a class="small" [href]="mapsUrl(i)" target="_blank" rel="noopener noreferrer">Check on Google Maps</a>
                }
              </div>
              <div class="row">
                <a class="btn sm" [routerLink]="['/reviews', i.slug]">Details</a>
                @if (i.trustpilot; as t) { <a class="btn sm ghost" [href]="t.url" target="_blank" rel="noopener noreferrer">Read on Trustpilot</a> }
              </div>
            </article>
          }
        </div>
      } @else {
        <div class="card empty"><i class="ph ph-magnifying-glass"></i><p>No installers match those filters. Clear the search or lower the minimum.</p></div>
      }
    </div>
  `,
  styles: `
    .page { padding: 48px 0 0; display: grid; gap: 20px; }
    .lead { font-size: 1.15rem; color: var(--ink-2); max-width: 62ch; }
    .controls { display: grid; grid-template-columns: 1.2fr 1.4fr 1fr; gap: 16px; }
    @media (max-width: 760px) { .controls { grid-template-columns: 1fr; } }
    .providers { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
    .prov { display: grid; gap: 14px; align-content: start; }
    .prov h2 { font-size: 1.25rem; letter-spacing: -0.02em; }
    .prov h2 a { color: var(--ink); text-decoration: none; }
    .prov h2 a:hover { text-decoration: underline; }
    .src { display: grid; gap: 4px; padding-top: 12px; border-top: 1px solid var(--line); }
    .where { display: flex; align-items: center; gap: 8px; color: var(--ink-2); font-weight: 600; font-size: 0.9rem; i { color: var(--accent); } }
    .val { display: flex; align-items: baseline; gap: 10px; b { font-size: 1.7rem; letter-spacing: -0.03em; } }
    .warn { color: var(--warn); font-weight: 600; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    .empty { display: grid; justify-items: start; gap: 8px; i { font-size: 2rem; color: var(--accent); } }
  `,
})
export class ReviewsPage {
  readonly asOf = dateFmt(AS_OF);
  readonly q = signal('');
  readonly sort = signal<Sort>('adjusted');
  readonly min = signal(0);
  mapsUrl = mapsUrl;
  seai = (i: Installer) => !!seaiMatch(i);
  readonly list = computed(() => {
    const q = this.q().trim().toLowerCase(), min = this.min(), s = this.sort();
    const t = (i: Installer) => i.trustpilot;
    return ALL.filter((i) => (!q || i.name.toLowerCase().includes(q)) && (t(i)?.count ?? 0) >= min).sort((a, b) => {
      const ta = t(a), tb = t(b);
      if (s === 'name') return a.name.localeCompare(b.name);
      if (s === 'count') return (tb?.count ?? 0) - (ta?.count ?? 0);
      if (s === 'score') return (tb?.score ?? 0) - (ta?.score ?? 0);
      return adjusted(tb?.score ?? 0, tb?.count ?? 0) - adjusted(ta?.score ?? 0, ta?.count ?? 0);
    });
  });
}

const TOPICS = [
  { term: 'aftercare', label: 'Aftercare' },
  { term: 'quality', label: 'Install quality' },
  { term: 'price', label: 'Cost and value' },
  { term: 'communication', label: 'Communication' },
  { term: 'battery', label: 'Batteries' },
  { term: 'grant', label: 'SEAI grant paperwork' },
];

@Component({
  selector: 'page-provider',
  imports: [RouterLink, DecimalPipe],
  template: `
    @if (i(); as inst) {
      <div class="narrow page">
        <a routerLink="/reviews" class="small">All installers</a>
        <h1>{{ inst.name }}</h1>
        <p class="muted">{{ inst.kind }}</p>
        @if (seai()) { <p><span class="chip"><i class="ph-fill ph-seal-check"></i> Found on the SEAI register of solar PV companies</span></p> }

        <div class="srcs">
          <div class="card">
            <div class="where"><i class="ph-fill ph-star"></i> Trustpilot</div>
            @if (inst.trustpilot; as t) {
              <div class="val"><b class="num">{{ t.score | number: '1.1-1' }}</b><span class="muted num">out of 5 from {{ t.count | number }} reviews</span></div>
              <p class="small muted">Read on {{ date(t.asOf) }}</p>
              <a class="btn sm" [href]="t.url" target="_blank" rel="noopener noreferrer">Read all on Trustpilot</a>
            }
          </div>
          <div class="card">
            <div class="where"><i class="ph ph-map-pin"></i> Google Maps</div>
            @if (inst.google; as g) {
              <div class="val"><b class="num">{{ g.rating | number: '1.1-1' }}</b><span class="muted num">out of 5 from {{ g.count | number }} reviews</span></div>
              <p class="small muted">Read on {{ date(g.asOf) }}</p>
            } @else {
              <p class="muted">Not yet added to GreenWattz. Check the current rating directly.</p>
            }
            <a class="btn sm" [href]="maps()" target="_blank" rel="noopener noreferrer">Open Google Maps</a>
          </div>
        </div>

        @if (inst.trustpilot; as t) {
          <h2>Look for what matters to you</h2>
          <p class="muted">Open the Trustpilot reviews already filtered to a topic. Also read the one and two star reviews to see how problems were handled.</p>
          <div class="topics">
            @for (x of topics; track x.term) { <a class="btn sm" [href]="t.url + '?search=' + x.term" target="_blank" rel="noopener noreferrer">{{ x.label }}</a> }
          </div>
        }

        <h2>Before you sign</h2>
        <ul class="tips">
          <li>Check the installer is on the <a href="https://www.seai.ie/grants/find-a-registered-professional/solar-pv-companies" target="_blank" rel="noopener">SEAI registered installer list</a> if you want the grant.</li>
          <li>Look at how recent the reviews are and whether the company replies to negative ones.</li>
          <li>Ask what happens when an inverter or battery fails, and who you call.</li>
          <li>Get at least three written quotes and compare the savings each one promises with the figures from your GreenWattz plan.</li>
        </ul>
        <div class="row"><a class="btn primary" routerLink="/plan">Plan my solar</a></div>
        <p class="small muted">Ratings belong to Trustpilot and Google and are shown for information. GreenWattz is not affiliated with Trustpilot or Google.</p>
      </div>
    } @else {
      <div class="narrow page"><h1>Installer not found</h1><a class="btn" routerLink="/reviews">Back to reviews</a></div>
    }
  `,
  styles: `
    .page { padding: 48px 0 0; display: grid; gap: 18px; }
    .srcs { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; .card { display: grid; gap: 10px; align-content: start; justify-items: start; } }
    @media (max-width: 640px) { .srcs { grid-template-columns: 1fr; } }
    .where { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--ink-2); i { color: var(--accent); } }
    .val { display: grid; gap: 2px; b { font-size: 2.6rem; letter-spacing: -0.04em; line-height: 1; } }
    .topics, .row { display: flex; flex-wrap: wrap; gap: 8px; }
    .tips { padding-left: 20px; display: grid; gap: 10px; margin: 0; }
    h2 { margin-top: 18px; font-size: 1.5rem; }
  `,
})
export class ProviderPage {
  private slug = inject(ActivatedRoute).snapshot.paramMap.get('slug') ?? '';
  readonly i = signal(ALL.find((x) => x.slug === this.slug));
  readonly topics = TOPICS;
  date = dateFmt;
  seai = () => { const x = this.i(); return !!x && !!seaiMatch(x); };
  maps() { const x = this.i(); return x ? mapsUrl(x) : '#'; }
}
