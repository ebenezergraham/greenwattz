import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PlanStore } from '../core/store';
import { EstimateNote } from '../ui/estimate-note';
import { HOUSE_TYPES, OBSTACLES, roofTypeInfo } from '../core/engine';

const HOUSE_LABEL = Object.fromEntries(HOUSE_TYPES.map((t) => [t.key, t.label.toLowerCase()])) as Record<string, string>;
import { INTRODUCTION_INSTALLERS, SITE } from '../core/site';
import { Criterion, DATA_CRITERIA, Installer, PRIORITIES, rank, siteUrl, mapsUrl, seaiMatch, criterionLabel } from '../core/installers';

/** How much a criterion counts. Skip leaves it out; the weights give a clear step between each level. */
const LEVELS = [{ n: 0, label: 'Skip', w: 0 }, { n: 1, label: 'Some', w: 1 }, { n: 2, label: 'Important', w: 2.5 }, { n: 3, label: 'Top', w: 4 }];
const DEFAULT_LEVELS: Record<Criterion, number> = { trustpilot: 2, google: 1, experience: 1, price: 0, quality: 0, warranty: 0, aftercare: 0, communication: 0 };

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
          <h2 class="qh">What matters to you?</h2>
          <p class="hint">Set how much each thing counts. The list below re-orders as you change it.</p>
          <div class="weights">
            <h3 class="wg">From public reviews <span class="muted small">Used to rank installers</span></h3>
            @for (c of dataCriteria; track c.key) {
              <div class="wrow">
                <div class="wl"><b id="w-{{ c.key }}">{{ c.label }}</b><span class="small muted">{{ c.hint }}</span></div>
                <div class="seg lv" role="group" [attr.aria-labelledby]="'w-' + c.key">
                  @for (l of levelOptions; track l.n) { <button type="button" [attr.aria-pressed]="levels()[c.key] === l.n" (click)="setLevel(c.key, l.n)">{{ l.label }}</button> }
                </div>
              </div>
            }
            <h3 class="wg">Ask the installer <span class="muted small">No verified data yet, so these shape your questions list</span></h3>
            @for (p of priorities; track p.key) {
              <div class="wrow">
                <div class="wl"><b id="w-{{ p.key }}">{{ p.label }}</b></div>
                <div class="seg lv" role="group" [attr.aria-labelledby]="'w-' + p.key">
                  @for (l of levelOptions; track l.n) { <button type="button" [attr.aria-pressed]="levels()[p.key] === l.n" (click)="setLevel(p.key, l.n)">{{ l.label }}</button> }
                </div>
              </div>
            }
            <button class="linklike reset" type="button" (click)="reset()">Reset to the default</button>
          </div>

          <div class="notice"><i class="ph ph-warning"></i><span>We rank on what we have data for: Trustpilot, Google Maps and track record. @if (unbacked()) { We do not yet hold verified data on {{ unbacked() }}, so those do not change the order. Use the questions under each installer to compare them yourself. } @else { Ratings are adjusted so a few reviews cannot outrank thousands. }</span></div>

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
                    </p>
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
              <h3>Would you like a referral to {{ introNames() }}?</h3>
              <div class="notice info"><i class="ph ph-handshake"></i><span><b>Disclosure.</b> The person behind GreenWattz is a customer of {{ introNames() }} and gets a reward from them if you become a customer through their referral. It does not change your price. We never ask you for money, and a referral does not change how installers are ranked.</span></div>
              <div class="seg two" role="group" aria-label="Referral choice">
                <button type="button" [attr.aria-pressed]="wantsIntro() === true" (click)="wantsIntro.set(true)">Yes, refer me</button>
                <button type="button" [attr.aria-pressed]="wantsIntro() === false" (click)="wantsIntro.set(false)">No thanks</button>
              </div>
              @if (sent()) {
                <p class="ok" role="status"><i class="ph-fill ph-check-circle"></i> Thanks. We have your request and will email you from {{ site.contactEmail }} to talk it through. You are not committed to anything.</p>
              } @else if (wantsIntro()) {
                <form class="form" (submit)="sendIntro($event)">
                  <div class="field"><label for="n">Your name</label><input id="n" name="name" type="text" required autocomplete="name" /></div>
                  <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" required autocomplete="email" /></div>
                  <div class="field"><label for="c">County</label><input id="c" name="county" type="text" required autocomplete="address-level1" /></div>
                  <input type="checkbox" name="botcheck" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
                  <label class="check"><input type="checkbox" name="consent" required /><span>I agree that my name, email, county and plan summary are sent to the person behind GreenWattz, through the form service Web3Forms, so they can contact me once about a referral. My details go to {{ introNames() }} only if I say yes in that conversation. See the <a routerLink="/privacy">privacy policy</a>.</span></label>
                  @if (err()) { <p class="err" role="alert">{{ err() }}</p> }
                  <button class="btn primary" type="submit" [disabled]="sending()">{{ sending() ? 'Sending' : 'Request a referral' }}</button>
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
              @if (r().grant) { <div><dt>SEAI solar grant</dt><dd class="num">-€{{ round50(r().grant) | number }}</dd></div> }
              @if (r().batteryGrant) { <div><dt>SEAI battery grant</dt><dd class="num">-€{{ round50(r().batteryGrant) | number }}</dd></div> }
              <div><dt>Est. net cost</dt><dd class="num">€{{ round50(r().netCost) | number }}</dd></div>
              <div><dt>Export income a year</dt><dd class="num">€{{ round50(r().exportIncome) | number }}</dd></div>
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
    .qh { font-family: var(--font); font-stretch: 100%; font-weight: 650; letter-spacing: -0.01em; font-size: 1.15rem; margin: 28px 0 10px; }
    .weights { display: grid; gap: 4px; margin-top: 12px; }
    .wg { font-size: 0.95rem; margin: 16px 0 4px; font-weight: 650; }
    .wrow { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 20px; align-items: center; padding: 10px 0; border-top: 1px solid var(--line); }
    .wl { display: grid; gap: 2px; }
    .seg.lv button { padding: 6px 12px; font-size: 0.88rem; }
    @media (max-width: 680px) { .wrow { grid-template-columns: minmax(0, 1fr); } }
    .reset { justify-self: start; margin-top: 10px; }
    .picks { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 10px; legend { padding: 0; margin-bottom: 10px; width: 100%; } }
    .pick { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 18px; border: 1.5px solid var(--ink-3); border-radius: var(--r-pill); cursor: pointer; font-weight: 600; background: var(--surface); input { width: 18px; height: 18px; accent-color: var(--ink); margin: 0; } }
    .pick.on { background: var(--ink); color: var(--bg); border-color: var(--ink); input { accent-color: var(--sun); } }
    .pick:has(input:disabled) { opacity: 0.45; cursor: not-allowed; }
    .pick:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: 3px; }
    .notice { margin-top: 18px; }
    .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
    .item { display: grid; grid-template-columns: 44px 1fr; gap: 16px; border-width: 1.5px; }
    .item.sel { border-color: var(--ink); background: var(--surface-2); }
    .rank { width: 40px; height: 40px; border-radius: var(--r-ctl); background: var(--surface-2); display: grid; place-items: center; font-weight: 650; font-size: 1.1rem; }
    .body { display: grid; gap: 10px; min-width: 0; }
    .head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .head h3 { font-size: 1.25rem; }
    .small i { color: var(--sun-strong); }
    details { color: var(--ink-2); font-size: 0.92rem; summary { cursor: pointer; font-weight: 600; color: var(--ink); } ul { margin: 8px 0 0; padding-left: 20px; display: grid; gap: 6px; } }
    .acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; }
    .intro { margin-top: 24px; display: grid; gap: 16px; }
    .seg.two { max-width: 420px; }
    .form { display: grid; gap: 18px; margin-top: 4px; }
    .err { color: var(--bad); font-weight: 600; }
    .ok { color: var(--ink); font-weight: 600; i { color: var(--link); } }
    .hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
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
  readonly dataCriteria = DATA_CRITERIA;
  readonly levelOptions = LEVELS;
  /** How much each criterion matters to the user, from 0 (skip) to 3 (top). */
  readonly levels = signal<Record<Criterion, number>>({ ...DEFAULT_LEVELS });
  readonly weights = computed<Record<Criterion, number>>(() => {
    const l = this.levels();
    return Object.fromEntries((Object.keys(l) as Criterion[]).map((k) => [k, LEVELS[l[k]].w])) as Record<Criterion, number>;
  });
  readonly picked = signal<Set<string>>(new Set());
  readonly wantsIntro = signal<boolean | null>(null);
  readonly err = signal('');
  readonly sending = signal(false);
  readonly sent = signal(false);
  readonly copied = signal(false);

  readonly ranked = computed(() => rank(this.weights()));
  readonly showAll = signal(false);
  readonly top = computed(() => (this.showAll() ? this.ranked() : this.ranked().slice(0, 5)));
  readonly chosen = computed(() => this.top().map((r) => r.installer).filter((i) => this.picked().has(i.slug)));
  readonly introFor = computed(() => this.chosen().filter((i) => INTRODUCTION_INSTALLERS.includes(i.slug)));
  readonly introNames = computed(() => this.introFor().map((i) => i.name).join(' and '));

  /** Ask-the-installer priorities the user cares about, strongest first. With none set, all of them. */
  private marked() {
    const l = this.levels();
    const set = PRIORITIES.filter((p) => l[p.key] > 0).sort((a, b) => l[b.key] - l[a.key]);
    return set.length ? set : PRIORITIES;
  }
  /** Question prompts for the priorities the user marked, so they can compare installers themselves. */
  readonly asks = computed(() => this.marked().map((p) => p.ask));
  /** Priorities the user cares about that we hold no verified data for, so they cannot change the order. */
  readonly unbacked = computed(() => {
    const have = new Set(this.ranked().flatMap((r) => r.backed));
    const l = this.levels();
    return PRIORITIES.filter((p) => l[p.key] > 0 && !have.has(p.key)).map((p) => p.label.toLowerCase()).join(', ');
  });

  setLevel(k: Criterion, n: number) { this.levels.update((l) => ({ ...l, [k]: n })); }
  reset() { this.levels.set({ ...DEFAULT_LEVELS }); }
  toggle(slug: string) { this.picked.update((s) => { const n = new Set(s); n.has(slug) ? n.delete(slug) : n.add(slug); return n; }); if (!this.introFor().length) this.wantsIntro.set(null); }
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
    const l = this.levels();
    const top = (Object.keys(l) as Criterion[]).filter((k) => l[k] >= 2).map((k) => criterionLabel(k).toLowerCase());
    return [
      'Solar quote request (planned with GreenWattz)',
      `Yearly electricity use: about ${Math.round(u.annualKwh)} kWh`,
      `Estimated cost: ${Math.round(r.grossCost / 50) * 50} euro installed, less ${Math.round((r.grant + r.batteryGrant) / 50) * 50} euro SEAI grants, about ${Math.round(r.netCost / 50) * 50} euro after grants (planning estimate)`,
      `Suggested system: ${r.panels} panels (${r.kwp.toFixed(1)} kWp)${r.batteryKwh ? ' with a ' + r.batteryKwh + ' kWh battery' : ', no battery'}`,
      `People on the bill: ${h.taxpayers}`,
      `Home first occupied: ${h.yearOccupied ?? 'not given'}`,
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

  async sendIntro(e: Event) {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    const name = String(f.get('name') || '').trim(), county = String(f.get('county') || '').trim(), email = String(f.get('email') || '').trim();
    if (!name || !county || !email || !f.get('consent')) { this.err.set('Please fill in your name, email and county and tick the consent box.'); return; }
    if (f.get('botcheck')) return;
    this.err.set('');
    const message = `Referral request for ${this.introNames()}.\n\nName: ${name}\nEmail: ${email}\nCounty: ${county}\nConsent given on the site to be contacted once about a referral.\n\n${this.summary()}\n`;
    if (!SITE.formAccessKey) {
      location.href = `mailto:${SITE.contactEmail}?subject=${encodeURIComponent('Referral request')}&body=${encodeURIComponent(message)}`;
      return;
    }
    this.sending.set(true);
    try {
      const res = await fetch(SITE.formEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ access_key: SITE.formAccessKey, subject: `Referral request: ${this.introNames()}`, from_name: 'GreenWattz', name, email, message }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) throw new Error('rejected');
      this.sent.set(true);
    } catch {
      this.err.set(`Something went wrong and nothing was sent. Please try again, or email ${SITE.contactEmail}.`);
    } finally {
      this.sending.set(false);
    }
  }
}
