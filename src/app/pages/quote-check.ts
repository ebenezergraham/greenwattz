import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { EstimateNote } from '../ui/estimate-note';
import { SupportLink } from '../ui/support';
import { ALL, SEAI } from '../core/installers';
import { storeQuote } from '../core/quote-store';
import { readFileText } from '../core/pdf-text';
import { browserAiAvailability, readWithBrowserAi } from '../core/browser-ai';
import {
  BENCHMARKS, INCLUSIONS, QuoteInput, ReadFields, Found, acceptAiFields, benchmarksAgeDays, benchmarksAreStale, checkQuote, fieldsToInput, halfYears,
  mergeReads, readQuoteText, systemKwp,
} from '../core/quote-check';

type AiState = 'checking' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

const FIELD_LABELS: { key: keyof ReadFields; label: string; unit?: string }[] = [
  { key: 'panels', label: 'Number of panels' },
  { key: 'watts', label: 'Watts per panel', unit: 'W' },
  { key: 'kwp', label: 'System size', unit: 'kWp' },
  { key: 'batteryKwh', label: 'Battery', unit: 'kWh' },
  { key: 'priceTotal', label: 'Total price before grants', unit: '€' },
  { key: 'priceAfterGrant', label: 'Total after grants', unit: '€' },
  { key: 'grantSolar', label: 'SEAI solar grant', unit: '€' },
  { key: 'grantBattery', label: 'SEAI battery grant', unit: '€' },
];

@Component({
  selector: 'page-quote-check',
  imports: [RouterLink, DecimalPipe, EstimateNote, SupportLink],
  template: `
    <div class="wrap page">
      <h1>Is your solar quote a fair price?</h1>
      <p class="lead">Type in the numbers from your quote, or read them from a quote file on your device. We compare the price per kWp with quotes other Irish homes have shared and with our own cost model, then tell you what to ask before you sign.</p>
      <estimate-note />

      <section class="block" aria-labelledby="read-h">
        <h2 id="read-h">Read your quote file</h2>
        <p class="hint">Optional. Upload a PDF or text file and we read the figures in your browser, then ask you to check them. The file and its text are never uploaded. When you confirm, we keep the solar specification, the price breakdown and the installer's name and website to improve our price comparison. We never keep your name, address or contact details. See the <a routerLink="/privacy">privacy policy</a>.</p>
        <div class="drop">
          <label for="qfile" class="btn"><i class="ph ph-upload-simple"></i> Choose a quote file</label>
          <input id="qfile" class="sr" type="file" accept=".pdf,.txt,.csv,application/pdf,text/plain" (change)="onFile($event)" [disabled]="reading()" />
          @if (reading()) { <span class="small" role="status">{{ readingText() }}</span> }
        </div>
        <p class="hint ai" [class.ok]="ai() === 'available'">{{ aiLine() }}</p>
        @if (readError()) { <p class="err" role="alert"><i class="ph ph-warning-circle" aria-hidden="true"></i><span>{{ readError() }}</span></p> }

        @if (proposal(); as p) {
          <div class="confirm" role="group" aria-labelledby="confirm-h">
            <h3 id="confirm-h">Check what we found</h3>
            <p class="hint">{{ p.count ? 'Fix anything that looks wrong. Only values that appear in your quote are filled in.' : 'We could not find the figures in that file. Type them in below instead.' }}</p>
            @if (p.count) {
              <dl class="found">
                @for (f of fieldLabels; track f.key) {
                  <div [class.missing]="p.fields[f.key] === undefined">
                    <dt><label [for]="'f-' + f.key">{{ f.label }}</label></dt>
                    <dd>
                      <input [id]="'f-' + f.key" type="number" step="any" [value]="p.fields[f.key] ?? ''" (change)="editFound(f.key, $event)" />
                      @if (f.unit) { <span class="unit">{{ f.unit }}</span> }
                      <span class="src small muted">{{ p.fields[f.key] === undefined ? 'Not found' : p.found[f.key] === 'ai' ? 'Read by your browser\\'s AI' : 'Read from the text' }}</span>
                    </dd>
                  </div>
                }
                <div [class.missing]="!p.fields.installer">
                  <dt><label for="f-installer">Installer</label></dt>
                  <dd>
                    <input id="f-installer" type="text" [value]="p.fields.installer ?? ''" (change)="editInstaller($event)" />
                    <span class="src small muted">{{ p.fields.installer ? (p.found.installer === 'ai' ? 'Read by your browser\\'s AI' : 'Read from the text') : 'Not found' }}</span>
                  </dd>
                </div>
              </dl>
              @if (p.fields.priceTotal !== undefined && p.fields.priceAfterGrant !== undefined) {
                <div class="seg" role="group" aria-label="Which price to check">
                  <button type="button" [attr.aria-pressed]="priceBasis() === 'before'" (click)="priceBasis.set('before')">Price before grants</button>
                  <button type="button" [attr.aria-pressed]="priceBasis() === 'after'" (click)="priceBasis.set('after')">Price after grants</button>
                </div>
              }
              <div class="acts">
                <button class="btn primary" type="button" (click)="useFound()">Use these figures</button>
                <button class="btn ghost" type="button" (click)="proposal.set(null)">Start again</button>
              </div>
            }
          </div>
        }
      </section>

      <section class="block" aria-labelledby="form-h">
        <h2 id="form-h">Your quote</h2>
        <div class="form">
          <div class="field"><label for="installer">Installer <span class="muted small">optional</span></label><input id="installer" list="installers" type="text" [value]="installer()" (input)="installer.set($any($event.target).value)" /><datalist id="installers">@for (n of installerNames; track n) { <option [value]="n"></option> }</datalist></div>
          <div class="row2">
            <div class="field"><label for="panels">Number of panels</label><input id="panels" type="number" min="0" max="80" step="1" [value]="panels() ?? ''" (input)="panels.set(numOrNull($event))" /></div>
            <div class="field"><label for="watts">Watts per panel</label><input id="watts" type="number" min="250" max="700" step="5" [value]="watts() ?? ''" (input)="watts.set(numOrNull($event))" /></div>
          </div>
          <div class="field"><label for="kwp">Or system size in kWp <span class="muted small">if the quote gives it instead</span></label><input id="kwp" type="number" min="0" max="40" step="0.01" [value]="kwpIn() ?? ''" (input)="kwpIn.set(numOrNull($event))" /></div>
          <p class="hint num sys">{{ kwp() ? 'System: ' + (panels() && watts() ? panels() + ' × ' + watts() + ' W = ' : '') + (kwp() | number: '1.2-2') + ' kWp' : 'Enter the panels and watts, or the kWp.' }}</p>
          <div class="field"><label for="battery">Battery, kWh <span class="muted small">0 for none</span></label><input id="battery" type="number" min="0" max="60" step="0.1" [value]="battery()" (input)="battery.set(numOrNull($event) ?? 0)" /></div>
          <div class="field"><label for="price">Price on the quote (€)</label><input id="price" type="number" min="0" step="50" [value]="price() ?? ''" (input)="price.set(numOrNull($event))" /></div>
          <div class="q">
            <span class="ql" id="gr">Is the SEAI grant already taken off that price?</span>
            <div class="seg" role="group" aria-labelledby="gr">
              <button type="button" [attr.aria-pressed]="grant() === 'yes'" (click)="grant.set('yes')">Yes, taken off</button>
              <button type="button" [attr.aria-pressed]="grant() === 'no'" (click)="grant.set('no')">No, not yet</button>
              <button type="button" [attr.aria-pressed]="grant() === 'unsure'" (click)="grant.set('unsure')">Not sure</button>
            </div>
          </div>
          <fieldset class="incl">
            <legend class="ql">What does the quote say is included?</legend>
            @for (i of inclusions; track i.key) {
              <label class="check"><input type="checkbox" [checked]="included().includes(i.key)" (change)="toggleIncluded(i.key)" /><span>{{ i.label }}</span></label>
            }
          </fieldset>
          <p><button class="btn ghost sm" type="button" (click)="example()">Try an example</button></p>
        </div>
      </section>

      @if (result(); as r) {
        <section class="block verdict" [attr.data-v]="r.verdict" aria-labelledby="v-h" aria-live="polite">
          <h2 id="v-h" class="sr">Verdict</h2>
          <p class="vword display">{{ verdictWord(r.verdict) }}</p>
          <p class="vline">Your quote works out at <b class="num">€{{ r.perKwp | number: '1.0-0' }} per kWp</b> {{ r.basis === 'after-grant' ? 'after SEAI grants' : 'as quoted' }} for {{ r.kwp | number: '1.1-2' }} kWp{{ battery() ? ' with a ' + battery() + ' kWh battery' : ' and no battery' }}. That is <b class="num">{{ pctText(r.vsMedianPct) }}</b> the typical price.</p>
          @if (r.basis === 'after-grant') { <p class="hint basis">Most quotes in the data show the price after the SEAI grant, so we compare yours after grants too, assuming your home qualifies.</p> }
          @else { <p class="hint basis">We compared the price as written. Say whether the grant is taken off to compare it like for like.</p> }

          <div class="rangebar" role="img" [attr.aria-label]="'Typical range €' + (r.range.low | number: '1.0-0') + ' to €' + (r.range.high | number: '1.0-0') + ', median €' + (r.range.median | number: '1.0-0') + ', your quote €' + (r.perKwp | number: '1.0-0') + ' per kWp'">
            <div class="track"></div>
            <div class="band" [style.left.%]="pos(r.range.low)" [style.width.%]="pos(r.range.high) - pos(r.range.low)"></div>
            <div class="tick med" [style.left.%]="pos(r.range.median)"></div>
            <div class="you" [style.left.%]="pos(r.perKwp)"><span>You</span></div>
          </div>
          <dl class="legend num">
            <div><dt>Typical range</dt><dd>€{{ r.range.low | number: '1.0-0' }} to €{{ r.range.high | number: '1.0-0' }}</dd></div>
            <div><dt>Median</dt><dd>€{{ r.range.median | number: '1.0-0' }}</dd></div>
            <div><dt>Yours</dt><dd>€{{ r.perKwp | number: '1.0-0' }}</dd></div>
          </dl>
          <p class="hint">Compared with {{ r.battery.n }} quotes with a similar battery ({{ r.battery.label.toLowerCase() }}) and {{ r.size.n }} of a similar size ({{ r.size.label.toLowerCase() }}). We blend the two groups because there are not enough quotes to match both at once.@if (r.thin) { <b> Some groups are small, so treat this as a rough guide.</b> }</p>

          @if (r.rough.length) { <p class="rough" role="note"><b>Rough guide only.</b> {{ r.rough.join(' ') }}</p> }

          <h3>In euros</h3>
          <p>At the typical price per kWp, a {{ r.kwp | number: '1.1-2' }} kWp system{{ battery() ? ' with a ' + battery() + ' kWh battery' : '' }} comes to about <b class="num">€{{ r.typicalTotal.low | number: '1.0-0' }} to €{{ r.typicalTotal.high | number: '1.0-0' }}</b>{{ r.basis === 'after-grant' ? ' after grants' : '' }}, with a median near €{{ r.typicalTotal.median | number: '1.0-0' }}. Your quote is <b class="num">€{{ price() | number: '1.0-0' }}</b>.
            @if (grant() === 'yes') { Your price already has the SEAI grant taken off, so before grants it is about <b class="num">€{{ r.beforeGrant | number: '1.0-0' }}</b>. }
            @else { If your home qualifies, SEAI grants of about €{{ r.grantsAssumed | number: '1.0-0' }} come off the price, bringing it to about <b class="num">€{{ r.afterGrant | number: '1.0-0' }}</b>. }</p>

          <h3>Questions to ask the installer</h3>
          <ol class="qs">@for (x of r.questions; track x) { <li>{{ x }}</li> }</ol>
          <div class="acts">
            <a class="btn primary" routerLink="/plan">See what solar would save you</a>
            <a class="btn" routerLink="/quote">Compare installers</a>
          </div>
        </section>
      } @else {
        <p class="hint">Enter the system size and the price to see the verdict.</p>
      }

      <section class="block" aria-labelledby="idx-h">
        <h2 id="idx-h">What Irish homes are being quoted</h2>
        <p class="hint">Price per kWp from {{ bench.overall.n }} quotes shared since 2025. The typical range is the middle half of quotes. Prices are as quoted and not checked, and extras such as ground mounts or EV chargers are not adjusted for.</p>
        <dl class="legend num top">
          <div><dt>Median</dt><dd>€{{ bench.overall.median | number: '1.0-0' }}</dd></div>
          <div><dt>Typical range</dt><dd>€{{ bench.overall.low | number: '1.0-0' }} to €{{ bench.overall.high | number: '1.0-0' }}</dd></div>
          <div><dt>Typical {{ bench.typicalSystem.minKwp }} to {{ bench.typicalSystem.maxKwp }} kWp system with a {{ bench.typicalSystem.minBatteryKwh }} to {{ bench.typicalSystem.maxBatteryKwh }} kWh battery</dt><dd>€{{ bench.typicalSystem.price | number: '1.0-0' }}</dd></div>
        </dl>

        <h3>By half of the year</h3>
        <div class="halves" role="table" aria-label="Price per kWp by half year">
          <div class="hrow head" role="row"><span role="columnheader">Period</span><span role="columnheader" class="r">Quotes</span><span role="columnheader" class="r">Median</span><span role="columnheader">Typical range per kWp</span></div>
          @for (h of halves; track h.period) {
            <div class="hrow" role="row">
              <span role="cell"><b>{{ h.period }}</b>@if (h.approximate) { <span class="small muted"> approx.</span> }</span>
              <span role="cell" class="r num">{{ h.n }}</span>
              <span role="cell" class="r num">€{{ h.median | number: '1.0-0' }}</span>
              <span role="cell" class="hbar" [attr.aria-label]="'€' + h.low + ' to €' + h.high">
                <span class="hband" [style.left.%]="hpos(h.low)" [style.width.%]="hpos(h.high) - hpos(h.low)"></span>
                <span class="hmed" [style.left.%]="hpos(h.median)"></span>
                @if (result(); as r) { <span class="hyou" [style.left.%]="hpos(r.perKwp)" title="Your quote"></span> }
                <span class="hlbl small num">€{{ h.low | number: '1.0-0' }} to €{{ h.high | number: '1.0-0' }}</span>
              </span>
            </div>
          }
        </div>
        <p class="hint">Half-years combine the published quarters, weighted by how many quotes each had, so they are approximate. Quarters with fewer than {{ bench.minQuotesPerPeriod }} quotes are left out, and older periods rest on few quotes.</p>

        <div class="two">
          <div>
            <h3>By battery size</h3>
            <table class="tbl small"><thead><tr><th>Group</th><th class="r">Quotes</th><th class="r">Median</th><th class="r">Typical range</th></tr></thead>
              <tbody>@for (c of bench.byBattery; track c.key) { <tr [class.cur]="result()?.battery?.key === c.key"><td>{{ c.label }}</td><td class="r num">{{ c.n }}</td><td class="r num">€{{ c.median | number: '1.0-0' }}</td><td class="r num">€{{ c.low | number: '1.0-0' }} to €{{ c.high | number: '1.0-0' }}</td></tr> }</tbody></table>
          </div>
          <div>
            <h3>By system size</h3>
            <table class="tbl small"><thead><tr><th>Group</th><th class="r">Quotes</th><th class="r">Median</th><th class="r">Typical range</th></tr></thead>
              <tbody>@for (c of bench.bySize; track c.key) { <tr [class.cur]="result()?.size?.key === c.key"><td>{{ c.label }}</td><td class="r num">{{ c.n }}</td><td class="r num">€{{ c.median | number: '1.0-0' }}</td><td class="r num">€{{ c.low | number: '1.0-0' }} to €{{ c.high | number: '1.0-0' }}</td></tr> }</tbody></table>
          </div>
        </div>
        @if (stale) { <p class="hint"><b>These figures are {{ age }} days old, so they may be out of date.</b></p> }
      </section>

      <support-link />
    </div>
  `,
  styles: `
    .page { padding: 48px 0 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; max-width: 900px; }
    .block { min-width: 0; }
    .lead { font-size: 1.15rem; color: var(--ink-2); max-width: 62ch; }
    .block { display: grid; gap: 10px; padding-top: 18px; border-top: 1px solid var(--line); }
    .block h2 { font-size: 1.4rem; margin: 0; }
    .block h3 { font-size: 1.05rem; margin: 14px 0 4px; font-weight: 650; }
    .drop { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .ai { margin: 0; }
    .ai.ok { color: var(--link); }
    .err { display: flex; gap: 8px; color: var(--bad); font-weight: 600; }
    .confirm { display: grid; gap: 10px; padding: 16px 0; border-top: 1px dashed var(--line); }
    .found { margin: 0; display: grid; gap: 4px; max-width: 560px; }
    .found div { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--line); }
    .found dt { margin: 0; } .found dd { margin: 0; display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
    .found input { width: 8.5em; }
    .found .missing input { opacity: 0.7; }
    .acts { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
    .form { display: grid; gap: 14px; max-width: 560px; }
    .row2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .field { display: grid; gap: 4px; }
    .sys { margin: -6px 0 0; }
    .ql { font-weight: 600; font-size: 0.95rem; display: block; margin-bottom: 6px; }
    .incl { border: 0; padding: 0; margin: 0; display: grid; gap: 6px; }
    .incl legend { padding: 0; }
    .verdict { gap: 8px; }
    .vword { font-size: clamp(2.2rem, 6vw, 3.2rem); margin: 0; line-height: 1; }
    .verdict[data-v='below'] .vword, .verdict[data-v='typical'] .vword { color: var(--link); }
    .verdict[data-v='above'] .vword, .verdict[data-v='far-above'] .vword { color: var(--bad); }
    .basis { margin: -4px 0 0; }
    .rough { margin: 0; padding: 10px 14px; background: var(--surface-2); border-radius: var(--r-ctl); max-width: 64ch; }
    .vline { margin: 0; font-size: 1.1rem; max-width: 62ch; }
    .rangebar { position: relative; height: 44px; margin: 14px 0 4px; max-width: 640px; }
    .rangebar .track { position: absolute; left: 0; right: 0; top: 20px; height: 4px; border-radius: 2px; background: var(--line); }
    .rangebar .band { position: absolute; top: 14px; height: 16px; border-radius: 4px; background: color-mix(in srgb, var(--sun) 55%, var(--surface)); border: 1px solid var(--sun-strong); }
    .rangebar .tick { position: absolute; top: 10px; width: 2px; height: 24px; background: var(--ink); transform: translateX(-1px); }
    .rangebar .you { position: absolute; top: 4px; width: 0; height: 36px; border-left: 3px solid var(--ink); span { position: absolute; top: -2px; left: 6px; font-size: 0.78rem; font-weight: 700; background: var(--ink); color: var(--bg); padding: 1px 6px; border-radius: 4px; } }
    .legend { margin: 0; display: flex; flex-wrap: wrap; gap: 6px 28px; div { display: grid; gap: 1px; } dt { color: var(--ink-3); font-size: 0.8rem; } dd { margin: 0; font-weight: 650; } }
    .legend.top { margin: 4px 0 8px; }
    .qs { margin: 0; padding-left: 22px; display: grid; gap: 8px; max-width: 70ch; }
    .halves { display: grid; max-width: 760px; }
    .hrow { display: grid; grid-template-columns: 9em 4em 6em minmax(0, 1fr); gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }
    .hrow.head { font-size: 0.8rem; color: var(--ink-3); padding: 6px 0; }
    .hrow .r { text-align: right; }
    .hbar { position: relative; height: 26px; }
    .hbar .hband { position: absolute; top: 4px; height: 12px; border-radius: 3px; background: color-mix(in srgb, var(--sun) 55%, var(--surface)); border: 1px solid var(--sun-strong); }
    .hbar .hmed { position: absolute; top: 1px; width: 2px; height: 18px; background: var(--ink); }
    .hbar .hyou { position: absolute; top: 0; width: 0; height: 20px; border-left: 3px dashed var(--bad); }
    .hbar .hlbl { position: absolute; top: 18px; left: 0; color: var(--ink-3); }
    .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
    tr.cur td { background: color-mix(in srgb, var(--sun) 16%, var(--surface)); font-weight: 600; }
    @media (max-width: 760px) {
      .row2, .two { grid-template-columns: minmax(0, 1fr); }
      .hrow { grid-template-columns: 6em 3em 5em minmax(0, 1fr); gap: 8px; }
      .found div { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class QuoteCheckPage {
  readonly bench = BENCHMARKS;
  readonly halves = halfYears();
  readonly inclusions = INCLUSIONS;
  readonly fieldLabels = FIELD_LABELS;
  readonly installerNames = [...new Set([...ALL.map((i) => i.name), ...SEAI.companies.map((c) => c.name)])].sort((a, b) => a.localeCompare(b));
  readonly age = benchmarksAgeDays();
  readonly stale = benchmarksAreStale();

  readonly installer = signal('');
  readonly panels = signal<number | null>(null);
  readonly watts = signal<number | null>(null);
  readonly kwpIn = signal<number | null>(null);
  readonly battery = signal(0);
  readonly price = signal<number | null>(null);
  readonly grant = signal<QuoteInput['grant']>('unsure');
  readonly included = signal<string[]>([]);

  readonly ai = signal<AiState>('checking');
  readonly reading = signal(false);
  readonly readingText = signal('');
  readonly readError = signal('');
  readonly proposal = signal<{ fields: ReadFields; found: Found; count: number } | null>(null);
  readonly priceBasis = signal<'before' | 'after'>('before');

  readonly input = computed<QuoteInput>(() => ({ panels: this.panels(), watts: this.watts(), kwp: this.kwpIn(), batteryKwh: this.battery(), price: this.price() ?? 0, grant: this.grant(), included: this.included() }));
  readonly kwp = computed(() => systemKwp(this.input()));
  readonly result = computed(() => checkQuote(this.input()));

  constructor() {
    browserAiAvailability().then((a) => this.ai.set(a));
  }

  aiLine(): string {
    switch (this.ai()) {
      case 'available': return 'Your browser has a built-in AI model. We use it on your device to read the quote, and we still ask you to confirm every figure.';
      case 'downloadable': return 'Your browser can download a small on-device AI model to read quotes. It stays on your device. Without it, we read the quote with simple rules and ask you to confirm.';
      case 'downloading': return 'Your browser is downloading its on-device AI model. Until it is ready we read quotes with simple rules.';
      case 'checking': return '';
      default: return 'This browser has no built-in AI, so we read the quote with simple rules and ask you to confirm. Chrome on a recent computer can use its on-device AI.';
    }
  }

  numOrNull(e: Event): number | null {
    const raw = (e.target as HTMLInputElement).value.trim();
    const v = raw === '' ? NaN : +raw;
    return Number.isFinite(v) && v >= 0 ? v : null;
  }
  toggleIncluded(k: string) { this.included.update((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k])); }

  example() {
    this.installer.set(''); this.panels.set(14); this.watts.set(450); this.kwpIn.set(null); this.battery.set(10); this.price.set(12000); this.grant.set('no'); this.included.set(['esb', 'seai']);
  }

  async onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    this.readError.set(''); this.proposal.set(null);
    if (/^image\//.test(f.type) || /\.(png|jpe?g|heic|webp)$/i.test(f.name)) {
      this.readError.set('Photos and scans cannot be read yet. Upload the quote as a PDF, or type the figures in below.');
      input.value = '';
      return;
    }
    this.reading.set(true); this.readingText.set('Reading the file on your device');
    try {
      const text = await readFileText(f);
      if (text.trim().length < 20) throw new Error('empty');
      const rules = readQuoteText(text, this.installerNames);
      let ai: ReadFields = {};
      if (this.ai() === 'available' || this.ai() === 'downloadable') {
        this.readingText.set('Reading with your browser’s on-device AI');
        const raw = await readWithBrowserAi(text, (share) => this.readingText.set(`Downloading the on-device AI model, ${Math.round(share * 100)}%`));
        if (raw) ai = acceptAiFields(raw, text);
        browserAiAvailability().then((a) => this.ai.set(a));
      }
      const { fields, found } = mergeReads(rules, ai);
      const count = FIELD_LABELS.filter((x) => fields[x.key] !== undefined).length + (fields.installer ? 1 : 0);
      this.priceBasis.set(fields.priceTotal !== undefined ? 'before' : 'after');
      this.proposal.set({ fields, found, count });
    } catch {
      this.readError.set('We could not read that file. It may be a scan or a photo inside a PDF. Type the figures in below instead.');
    } finally {
      this.reading.set(false);
      input.value = '';
    }
  }

  editFound(key: keyof ReadFields, e: Event) {
    const raw = (e.target as HTMLInputElement).value.trim();
    const p = this.proposal();
    if (!p) return;
    const fields = { ...p.fields } as Record<string, unknown>;
    if (raw === '' || !Number.isFinite(+raw)) delete fields[key]; else fields[key] = +raw;
    const found = { ...p.found, [key]: 'rules' as const };
    this.proposal.set({ fields: fields as ReadFields, found, count: FIELD_LABELS.filter((x) => fields[x.key] !== undefined).length });
  }

  editInstaller(e: Event) {
    const raw = (e.target as HTMLInputElement).value.trim();
    const p = this.proposal();
    if (!p) return;
    const fields = { ...p.fields };
    if (raw) fields.installer = raw; else delete fields.installer;
    this.proposal.set({ ...p, fields, found: { ...p.found, installer: 'rules' }, count: FIELD_LABELS.filter((x) => fields[x.key] !== undefined).length + (fields.installer ? 1 : 0) });
  }

  /** Move what the user confirmed into the form. */
  useFound() {
    const p = this.proposal();
    if (!p) return;
    const f = p.fields;
    void storeQuote(f, Object.keys(p.found).some((k) => p.found[k as keyof ReadFields] === 'ai') ? 'ai' : 'rules');
    const x = fieldsToInput(this.priceBasis() === 'after' && f.priceAfterGrant !== undefined ? { ...f, priceTotal: undefined } : f);
    this.panels.set(x.panels ?? null); this.watts.set(x.watts ?? null); this.kwpIn.set(x.panels && x.watts ? null : x.kwp ?? null);
    this.battery.set(x.batteryKwh ?? 0);
    this.price.set(x.price ? x.price : null);
    this.grant.set(x.grant ?? 'unsure');
    this.included.set(x.included ?? []);
    if (f.installer) this.installer.set(f.installer);
    this.proposal.set(null);
    setTimeout(() => document.getElementById('form-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  verdictWord(v: string): string {
    return ({ below: 'Below typical', typical: 'Typical', above: 'Above typical', 'far-above': 'Well above typical' } as Record<string, string>)[v];
  }
  pctText(p: number): string {
    const n = Math.round(Math.abs(p) * 100);
    return n === 0 ? 'in line with' : `${n}% ${p > 0 ? 'over' : 'under'}`;
  }

  /** Where a price sits on the range bar, as a percentage, on a scale that fits the range and the quote. */
  pos(v: number): number {
    const r = this.result();
    if (!r) return 0;
    const lo = Math.min(r.range.low * 0.8, r.perKwp * 0.92), hi = Math.max(r.range.high * 1.15, r.perKwp * 1.08);
    return Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  }
  /** The same for the half-year bars, on a fixed scale from the data. */
  hpos(v: number): number {
    const r = this.result();
    const lows = this.halves.map((h) => h.low), highs = this.halves.map((h) => h.high);
    const lo = Math.min(...lows, r?.perKwp ?? Infinity) * 0.92, hi = Math.max(...highs, r?.perKwp ?? 0) * 1.05;
    return Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  }
}
