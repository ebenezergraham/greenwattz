import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PlanStore } from '../core/store';
import { EstimateNote } from '../ui/estimate-note';
import { HOUSE_TYPES, OBSTACLES, roofTypeInfo } from '../core/engine';

const HOUSE_LABEL = Object.fromEntries(HOUSE_TYPES.map((t) => [t.key, t.label.toLowerCase()])) as Record<string, string>;
import { INTRODUCTION_INSTALLERS, SITE } from '../core/site';
import { Installer, PRIORITIES, Priority, rank, siteUrl, mapsUrl, seaiMatch } from '../core/installers';

const LEVELS = [
  { v: 0, label: 'Skip' },
  { v: 1, label: 'Important' },
  { v: 2, label: 'Top priority' },
];

@Component({
  selector: 'page-quote',
  imports: [RouterLink, DecimalPipe, EstimateNote],
  template: `
    <div class="wrap page">
      <h1>Find installers to quote</h1>
      <p class="lead">Tell us what matters to you and we will shortlist five SEAI-registered installers worth asking for a quote.</p>
      <estimate-note />

      <div class="grid">
        <section class="main">
          <h2>What matters most?</h2>
          <div class="card prefs">
            @for (p of priorities; track p.key) {
              <div class="pref">
                <span class="lbl" [id]="'p-' + p.key">{{ p.label }}</span>
                <div class="seg" role="group" [attr.aria-labelledby]="'p-' + p.key">
                  @for (l of levels; track l.v) { <button type="button" [attr.aria-pressed]="weights()[p.key] === l.v" (click)="set(p.key, l.v)">{{ l.label }}</button> }
                </div>
              </div>
            }
          </div>

          <div class="notice"><i class="ph ph-warning"></i><span>Today we rank on Trustpilot reputation, adjusted for how many reviews each installer has. We do not yet hold verified data on {{ unbacked() }}, so those priorities do not change the order. Use the questions under each installer to compare them yourself.</span></div>

          <h2>{{ showAll() ? 'All installers with 100+ reviews' : 'Your top five' }}</h2>
          <ol class="list">
            @for (r of top(); track r.installer.slug; let n = $index) {
              <li class="card item" [class.sel]="picked().has(r.installer.slug)">
                <div class="rank num">{{ n + 1 }}</div>
                <div class="body">
                  <div class="head">
                    <h3>{{ r.installer.name }}</h3>
                    <span class="chip">{{ r.installer.kind }}</span>
                    @if (seai(r.installer)) { <span class="chip"><i class="ph-fill ph-seal-check"></i> SEAI registered</span> }
                  </div>
                  <p class="small muted"><i class="ph-fill ph-star"></i> Trustpilot <b class="num">{{ r.installer.trustpilot!.score | number: '1.1-1' }}</b> from <span class="num">{{ r.installer.trustpilot!.count | number }}</span> reviews.
                    @if (r.installer.google) { Google <b class="num">{{ r.installer.google.rating | number: '1.1-1' }}</b> from <span class="num">{{ r.installer.google.count | number }}</span>. }
                    @if (r.backed.length) { Verified on: {{ names(r.backed) }}. }</p>
                  @if (asks(); as qs) {
                    <details>
                      <summary>Questions to ask {{ r.installer.name }}</summary>
                      <ul>@for (q of qs; track q) { <li>{{ q }}</li> }</ul>
                    </details>
                  }
                  <div class="acts">
                    <label class="check"><input type="checkbox" [checked]="picked().has(r.installer.slug)" (change)="toggle(r.installer.slug)" /><span><b>Include in my quote list</b></span></label>
                    <a class="small" [href]="r.installer.trustpilot!.url" target="_blank" rel="noopener noreferrer">Trustpilot</a>
                    <a class="small" [href]="maps(r.installer)" target="_blank" rel="noopener noreferrer">Google Maps</a>
                    <a class="small" routerLink="/reviews/{{ r.installer.slug }}">Details</a>
                  </div>
                </div>
              </li>
            }
          </ol>

          @if (ranked().length > 5) {
            <button class="btn top" type="button" (click)="showAll.set(!showAll())">{{ showAll() ? 'Show only my top five' : 'Show more installers (' + (ranked().length - 5) + ')' }}</button>
          }

          @if (introFor().length) {
            <div class="card intro">
              <h3>Would you like an introduction to an existing customer?</h3>
              <p class="muted">You picked {{ introNames() }}. Some of their existing customers can introduce friends through the installer's own referral process.</p>
              <div class="notice info"><i class="ph ph-handshake"></i><span><b>Disclosure.</b> The person behind GreenWattz is a customer of {{ introNames() }} and may receive a benefit from them if someone they introduce becomes a customer. We never ask you for money, gifts or donations for an introduction, and an introduction does not change how installers are ranked.</span></div>
              <div class="seg two" role="group" aria-label="Introduction choice">
                <button type="button" [attr.aria-pressed]="wantsIntro() === true" (click)="wantsIntro.set(true)">Yes, introduce me</button>
                <button type="button" [attr.aria-pressed]="wantsIntro() === false" (click)="wantsIntro.set(false)">No thanks</button>
              </div>
              @if (wantsIntro()) {
                <form class="form" (submit)="sendIntro($event)">
                  <div class="field"><label for="n">Your name</label><input id="n" name="name" type="text" required autocomplete="name" /></div>
                  <div class="field"><label for="c">County</label><input id="c" name="county" type="text" required autocomplete="address-level1" /></div>
                  <label class="check"><input type="checkbox" name="consent" required /><span>I agree that these details, and my plan summary, are put into an email to {{ site.contactEmail }} so someone can arrange an introduction. See the <a routerLink="/privacy">privacy policy</a>.</span></label>
                  @if (err()) { <p class="err" role="alert">{{ err() }}</p> }
                  <button class="btn primary" type="submit">Open email to request</button>
                  <p class="small muted">Nothing is sent until you press send in your email app.</p>
                </form>
              }
            </div>
          }
        </section>

        <aside class="side">
          <div class="card raised">
            <h3>Your plan</h3>
            <dl class="rows">
              <div><dt>Panels</dt><dd class="num">{{ r().panels }} ({{ r().kwp | number: '1.1-1' }} kWp)</dd></div>
              <div><dt>Battery</dt><dd class="num">{{ r().batteryKwh ? r().batteryKwh + ' kWh' : 'None' }}</dd></div>
              <div><dt>Est. net cost</dt><dd class="num">€{{ round50(r().netCost) | number }}</dd></div>
            </dl>
            <p class="small muted top">Share this with each installer so they quote against the same setup.</p>
            <button class="btn full" type="button" (click)="copy()">{{ copied() ? 'Copied' : 'Copy plan summary' }}</button>
            @if (chosen().length) {
              <h4 class="top">Contact your picks</h4>
              <ul class="picks">
                @for (i of chosen(); track i.slug) { <li><a [href]="siteOf(i)" target="_blank" rel="noopener noreferrer">{{ i.name }} website</a></li> }
              </ul>
            } @else { <p class="small muted top">Tick installers to build your list.</p> }
            <p class="small muted top"><i class="ph ph-lock-key"></i> We do not send your details to installers. You contact them yourself, so your plan is not sent to them by us.</p>
          </div>
        </aside>
      </div>
    </div>
  `,
  styles: `
    .page { padding: 48px 0 0; display: grid; gap: 20px; }
    .lead { font-size: 1.15rem; color: var(--ink-2); max-width: 60ch; }
    h2 { font-size: 1.5rem; margin: 28px 0 14px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 40px; align-items: start; }
    @media (max-width: 960px) { .grid { grid-template-columns: 1fr; } }
    .side { position: sticky; top: 92px; }
    @media (max-width: 960px) { .side { position: static; } }
    .prefs { display: grid; gap: 18px; }
    .pref { display: grid; grid-template-columns: 150px 1fr; gap: 12px; align-items: center; }
    @media (max-width: 560px) { .pref { grid-template-columns: 1fr; } }
    .notice { margin-top: 18px; }
    .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
    .item { display: grid; grid-template-columns: 44px 1fr; gap: 16px; border-width: 1.5px; }
    .item.sel { border-color: var(--accent); background: color-mix(in srgb, var(--accent-soft) 40%, var(--surface)); }
    .rank { width: 40px; height: 40px; border-radius: var(--r-ctl); background: var(--surface-2); display: grid; place-items: center; font-weight: 650; font-size: 1.1rem; }
    .body { display: grid; gap: 10px; min-width: 0; }
    .head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .head h3 { font-size: 1.25rem; }
    .small i { color: var(--accent); }
    details { color: var(--ink-2); font-size: 0.92rem; summary { cursor: pointer; font-weight: 600; color: var(--ink); } ul { margin: 8px 0 0; padding-left: 20px; display: grid; gap: 6px; } }
    .acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; }
    .intro { margin-top: 24px; display: grid; gap: 16px; }
    .seg.two { max-width: 420px; }
    .form { display: grid; gap: 18px; margin-top: 4px; }
    .err { color: var(--bad); font-weight: 600; }
    .rows { margin: 12px 0 0; display: grid; div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; } dt { color: var(--ink-2); } dd { margin: 0; font-weight: 600; } }
    .full { width: 100%; }
    .top { margin-top: 16px; }
    .picks { padding-left: 18px; margin: 8px 0 0; display: grid; gap: 6px; }
  `,
})
export class QuotePage {
  private store = inject(PlanStore);
  readonly r = this.store.result;
  readonly site = SITE;
  readonly priorities = PRIORITIES;
  readonly levels = LEVELS;
  readonly weights = signal<Record<Priority, number>>({ price: 1, quality: 1, warranty: 1, aftercare: 1, communication: 1 });
  readonly picked = signal<Set<string>>(new Set());
  readonly wantsIntro = signal<boolean | null>(null);
  readonly err = signal('');
  readonly copied = signal(false);

  readonly ranked = computed(() => rank(this.weights()));
  readonly showAll = signal(false);
  readonly top = computed(() => (this.showAll() ? this.ranked() : this.ranked().slice(0, 5)));
  readonly chosen = computed(() => this.top().map((r) => r.installer).filter((i) => this.picked().has(i.slug)));
  readonly introFor = computed(() => this.chosen().filter((i) => INTRODUCTION_INSTALLERS.includes(i.slug)));
  readonly introNames = computed(() => this.introFor().map((i) => i.name).join(' and '));

  /** Question prompts for the priorities the user marked, so they can compare installers themselves. */
  readonly asks = computed(() => {
    const w = this.weights();
    const qs = PRIORITIES.filter((p) => w[p.key] > 0).sort((a, b) => w[b.key] - w[a.key]).map((p) => p.ask);
    return qs.length ? qs : null;
  });
  readonly unbacked = computed(() => {
    const have = new Set(this.ranked().flatMap((r) => r.backed));
    const w = this.weights();
    const miss = PRIORITIES.filter((p) => w[p.key] > 0 && !have.has(p.key)).map((p) => p.label.toLowerCase());
    return miss.length ? miss.join(', ') : 'none of your priorities';
  });

  set(k: Priority, v: number) { this.weights.update((w) => ({ ...w, [k]: v })); }
  toggle(slug: string) { this.picked.update((s) => { const n = new Set(s); n.has(slug) ? n.delete(slug) : n.add(slug); return n; }); if (!this.introFor().length) this.wantsIntro.set(null); }
  names(keys: Priority[]) { return keys.map((k) => PRIORITIES.find((p) => p.key === k)!.label.toLowerCase()).join(', '); }
  maps(i: Installer) { return mapsUrl(i); }
  seai(i: Installer) { return !!seaiMatch(i); }
  siteOf(i: Installer) { return siteUrl(i); }
  round50(n: number) { return Math.round(n / 50) * 50; }

  private obstacleText(): string {
    const o = this.store.home().obstacles;
    const parts = OBSTACLES.filter((x) => o[x.key] > 0).map((x) => `${o[x.key]} x ${x.label.toLowerCase()}`);
    return parts.length ? ` (on the roof: ${parts.join(', ')})` : '';
  }

  private summary(): string {
    const r = this.r(), h = this.store.home(), u = this.store.usage();
    const ori = { S: 'south', SE_SW: 'south-east or south-west', E_W: 'east or west', N: 'north' }[h.orientation];
    const top = PRIORITIES.filter((p) => this.weights()[p.key] === 2).map((p) => p.label.toLowerCase());
    return [
      'Solar quote request (planned with GreenWattz)',
      `Yearly electricity use: about ${Math.round(u.annualKwh)} kWh`,
      `Suggested system: ${r.panels} panels (${r.kwp.toFixed(1)} kWp)${r.batteryKwh ? ' with a ' + r.batteryKwh + ' kWh battery' : ', no battery'}`,
      `Home: ${HOUSE_LABEL[h.houseType]}, ${h.storeys === 3 ? '3 or more storeys' : h.storeys + ' storey' + (h.storeys > 1 ? 's' : '')}, ${roofTypeInfo(h.roofType).label.toLowerCase()} roof`,
      `Roof: faces ${ori}, shade ${h.shading}, about ${Math.round(this.store.usableArea())} m2 usable after obstacles${this.obstacleText()}`,
      `Supply: ${h.threePhase ? 'three-phase' : 'single-phase'}`,
      `Planning to add: ${[h.addEv && 'EV', h.addHeatPump && 'heat pump'].filter(Boolean).join(' and ') || 'nothing yet'}`,
      `Most important to me: ${top.length ? top.join(', ') : 'a balanced quote'}`,
      'These figures are planning estimates, not a quotation. Please quote against your own survey, itemise it, list panel, inverter and battery brands, and give warranty lengths in writing.',
    ].join('\n');
  }
  async copy() {
    try { await navigator.clipboard.writeText(this.summary()); this.copied.set(true); setTimeout(() => this.copied.set(false), 2000); } catch { /* clipboard blocked */ }
  }

  sendIntro(e: Event) {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    const name = String(f.get('name') || '').trim(), county = String(f.get('county') || '').trim();
    if (!name || !county || !f.get('consent')) { this.err.set('Please fill in your name and county and tick the consent box.'); return; }
    this.err.set('');
    const body = `Hi,\n\nI would like an introduction to an existing customer of ${this.introNames()}.\n\nName: ${name}\nCounty: ${county}\n\n${this.summary()}\n`;
    location.href = `mailto:${SITE.contactEmail}?subject=${encodeURIComponent('Installer introduction request')}&body=${encodeURIComponent(body)}`;
  }
}
