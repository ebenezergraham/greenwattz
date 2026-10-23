import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PlanStore } from '../core/store';
import { PRICES } from '../core/engine';
import { EstimateNote } from '../ui/estimate-note';
import { SupportLink } from '../ui/support';
import { ALL, SEAI } from '../core/installers';
import { readFileText } from '../core/pdf-text';
import { browserAiAvailability, readWithBrowserAi } from '../core/browser-ai';
import { INCLUSIONS, acceptAiFields, mergeReads, readQuoteText, type Found, type ReadFields } from '../core/quote-check';
import { readTerms, type TermsFields } from '../core/quote-terms';
import { Account } from '../core/account';
import { QuotesState } from '../core/quotes-state';
import { defaultName } from '../core/saves';
import { Derived, MAX_QUOTES, QuoteEntry, bestIndexes, blankEntry, derive, entryFromRead, exampleEntries, quotesFromFile, quotesToFile } from '../core/quote-compare';

type Key = keyof QuoteEntry;
type Row =
  | { kind: 'section'; label: string; note?: string }
  | { kind: 'text' | 'number'; key: Key; label: string; unit?: string; hint?: string; step?: string; best?: 'min' | 'max' }
  | { kind: 'bool'; key: Key; label: string }
  | { kind: 'select'; key: Key; label: string; options: { v: string; l: string }[] }
  | { kind: 'included' }
  | { kind: 'derived'; label: string; get: (d: Derived | null, e: QuoteEntry) => string | number | null; best?: 'min' | 'max'; hint?: string; fmt?: 'eur' | 'pct' | 'years' }
  | { kind: 'flags' }
  | { kind: 'missing' };

const eur = (n: number) => '€' + Math.round(n).toLocaleString('en-IE');
const VERDICT: Record<string, string> = { below: 'Below typical', typical: 'Typical', above: 'Above typical', 'far-above': 'Well above typical' };

const ROWS: Row[] = [
  { kind: 'section', label: 'The quote' },
  { kind: 'text', key: 'installer', label: 'Installer' },
  { kind: 'number', key: 'panels', label: 'Number of panels', step: '1' },
  { kind: 'number', key: 'watts', label: 'Watts per panel', unit: 'W', step: '5' },
  { kind: 'number', key: 'kwp', label: 'Or system size', unit: 'kWp', hint: 'if there are no panels and watts', step: '0.01' },
  { kind: 'text', key: 'panelBrand', label: 'Panel brand and model' },
  { kind: 'number', key: 'batteryKwh', label: 'Battery', unit: 'kWh', hint: '0 for none', step: '0.1' },
  { kind: 'text', key: 'batteryBrand', label: 'Battery brand and model' },
  { kind: 'select', key: 'chemistry', label: 'Battery chemistry', options: [{ v: '', l: '?' }, { v: 'LFP', l: 'LFP' }, { v: 'NMC', l: 'NMC' }, { v: 'other', l: 'Other' }] },
  { kind: 'text', key: 'inverter', label: 'Inverter' },
  { kind: 'number', key: 'price', label: 'Price on the quote', unit: '€', step: '50' },
  { kind: 'select', key: 'grant', label: 'SEAI grant already taken off?', options: [{ v: 'unsure', l: 'Not sure' }, { v: 'yes', l: 'Yes, taken off' }, { v: 'no', l: 'No, not yet' }] },

  { kind: 'section', label: 'Payment and contract terms' },
  { kind: 'number', key: 'depositPct', label: 'Deposit', unit: '%', best: 'min', step: '1' },
  { kind: 'number', key: 'beforeWorksPct', label: 'Paid before works start', unit: '%', best: 'min', step: '1' },
  { kind: 'bool', key: 'paymentMismatch', label: 'Quote and terms give different payments' },
  { kind: 'number', key: 'workmanshipYears', label: 'Workmanship warranty', unit: 'years', best: 'max', step: '1' },
  { kind: 'number', key: 'panelWarrantyYears', label: 'Panel product warranty', unit: 'years', best: 'max', step: '1' },
  { kind: 'number', key: 'batteryYears', label: 'Battery warranty', unit: 'years', best: 'max', step: '1' },
  { kind: 'number', key: 'inverterYears', label: 'Inverter warranty', unit: 'years', best: 'max', step: '1' },
  { kind: 'number', key: 'coolingOffDays', label: 'Days you can cancel', unit: 'days', best: 'max', step: '1' },
  { kind: 'bool', key: 'forfeits', label: 'You lose money if you cancel' },
  { kind: 'select', key: 'grantRoute', label: 'How the grant is paid', options: [{ v: '', l: '?' }, { v: 'deducted', l: 'Taken off the price' }, { v: 'paid-to-you', l: 'Paid to you afterwards' }] },
  { kind: 'number', key: 'builtBeforeYear', label: 'Contract grant rule: home built before', step: '1' },
  { kind: 'bool', key: 'priceMayChange', label: 'Price can change after a survey' },
  { kind: 'number', key: 'validDays', label: 'Quote valid for', unit: 'days', step: '1' },
  { kind: 'included' },

  { kind: 'section', label: 'What they claim' },
  { kind: 'number', key: 'theirKwh', label: 'Yearly output', unit: 'kWh', step: '10' },
  { kind: 'number', key: 'theirSavings', label: 'Yearly saving', unit: '€', step: '10' },
  { kind: 'number', key: 'theirPayback', label: 'Payback', unit: 'years', step: '0.1' },

  { kind: 'section', label: 'Our check', note: 'Worked out for your home from the planner, not from the installer.' },
  { kind: 'derived', label: 'Price after grants', best: 'min', hint: 'If the grant is not sure, the price as quoted.', get: (d) => (d ? eur(d.netPrice) : null) },
  { kind: 'derived', label: 'Price per kWp', best: 'min', fmt: 'eur', get: (d) => (d?.check ? Math.round(d.check.perKwp) : null) },
  { kind: 'derived', label: 'Against the community range', get: (d) => (d?.check ? `${VERDICT[d.check.verdict]} (${eur(d.check.range.low)} to ${eur(d.check.range.high)})` : null) },
  { kind: 'derived', label: 'Our yearly output estimate', best: 'max', get: (d) => (d?.our ? Math.round(d.our.kwh).toLocaleString('en-IE') + ' kWh' : null) },
  { kind: 'derived', label: 'Our kWh per kWp', get: (d) => (d?.our ? Math.round(d.our.kwhPerKwp) : null) },
  { kind: 'derived', label: 'Their output against ours', get: (d) => (d && d.theirVsOurs !== null ? `${d.theirVsOurs >= 0 ? '+' : ''}${Math.round(d.theirVsOurs * 100)}%` : null) },
  { kind: 'derived', label: 'Our yearly benefit', best: 'max', get: (d) => (d?.our ? eur(d.our.benefit) : null) },
  { kind: 'derived', label: 'Our payback', best: 'min', fmt: 'years', get: (d) => (d?.our ? (isFinite(d.our.payback) ? +d.our.payback.toFixed(1) : 'Over 25 years') : null) },
  { kind: 'derived', label: 'Our 25 year gain', best: 'max', fmt: 'eur', get: (d) => (d?.our ? Math.round(d.our.gain25) : null) },
  { kind: 'derived', label: 'Share of your use supplied', best: 'max', fmt: 'pct', get: (d) => (d?.our ? Math.round(d.our.supplied * 100) : null) },
  { kind: 'flags' },
  { kind: 'missing' },
  { kind: 'text', key: 'notes', label: 'Notes' },
];

@Component({
  selector: 'page-quote-compare',
  imports: [RouterLink, DecimalPipe, EstimateNote, SupportLink],
  template: `
    <div class="wrap page">
      <h1>Compare your solar quotes</h1>
      <p class="lead">Put up to five quotes side by side. We check each price against what other Irish homes were quoted, estimate the output and payback for your home, and flag contract terms to question before you sign.</p>
      <estimate-note />

      <fieldset class="home">
        <legend>Your home <span class="muted small">Used for our estimates. These are shared with the planner.</span></legend>
        <div class="field"><label for="uk">Yearly electricity use, kWh</label><input id="uk" type="number" min="500" max="40000" step="100" [value]="roundedUse()" [disabled]="meterMode()" (change)="setUse($event)" /><span class="hint small">{{ meterMode() ? 'From your meter file in the planner.' : 'The Irish average is about ' + (typical | number) + '.' }}</span></div>
        <div class="field"><label for="rf2">Roof faces</label>
          <select id="rf2" (change)="setRoof($any($event.target).value)">
            @for (o of roofOptions; track o.v) { <option [value]="o.v" [selected]="store.home().orientation === o.v">{{ o.l }}</option> }
          </select>
        </div>
        <div class="field"><label for="yo">Home first occupied</label><input id="yo" type="number" min="1700" max="2100" step="1" placeholder="for example 1998" [value]="store.home().yearOccupied ?? ''" (change)="setYear($event)" /><span class="hint small">Decides if the SEAI grant applies.</span></div>
      </fieldset>

      <div class="bar" role="toolbar" aria-label="Quotes">
        <button class="btn primary" type="button" (click)="add()" [disabled]="entries().length >= max">Add a quote</button>
        <label for="rf" class="btn" [class.off]="entries().length >= max || reading()"><i class="ph ph-upload-simple"></i> Read a quote file</label>
        <input id="rf" class="sr" type="file" accept=".pdf,.txt,.csv,application/pdf,text/plain" (change)="onRead($event)" [disabled]="entries().length >= max || reading()" />
        <button class="btn ghost" type="button" (click)="example()">Try an example</button>
        <span class="grow"></span>
        <button class="btn" type="button" (click)="save()" [disabled]="!entries().length">Save as file</button>
        @if (account.enabled) { @if (account.user()) { <button class="btn" type="button" (click)="saveToAccount()" [disabled]="!entries().length || account.busy()">Save to my account</button> } @else if (account.ready()) { <a class="btn" routerLink="/account">Sign in to save</a> } }
        <label for="lf" class="btn">Load a file</label>
        <input id="lf" class="sr" type="file" accept=".json,application/json" (change)="onLoad($event)" />
        <button class="btn ghost" type="button" (click)="clear()" [disabled]="!entries().length">Clear all</button>
      </div>
      <p class="hint">Nothing is saved or sent. Quote files are read on your device. To keep your quotes, save them as a file and load it next time.@if (reading()) { <b role="status"> {{ readingText() }}</b> }</p>
      @if (saved()) { <p class="hint" role="status">{{ saved() }}</p> }
      @if (message()) { <p class="err" role="alert"><i class="ph ph-warning-circle" aria-hidden="true"></i><span>{{ message() }}</span></p> }

      @if (proposal(); as p) {
        <section class="confirm" aria-labelledby="cf-h">
          <h2 id="cf-h">Check what we found</h2>
          <p class="hint">{{ p.count ? 'This is what we read from your file. Add it, then correct anything in the table. Only figures that appear in your quote are filled in.' : 'We could not find the figures in that file. You can still add a blank quote and type them in.' }}</p>
          @if (p.count) {
            <ul class="found">
              @for (s of p.summary; track s.label) { <li><span>{{ s.label }}</span><b class="num">{{ s.value }}</b><span class="muted small">{{ s.source }}</span></li> }
            </ul>
          }
          <div class="acts">
            <button class="btn primary" type="button" (click)="accept()">{{ p.count ? 'Add as a quote' : 'Add a blank quote' }}</button>
            <button class="btn ghost" type="button" (click)="proposal.set(null)">Discard</button>
          </div>
        </section>
      }

      @if (entries().length) {
        <div class="scroll" tabindex="0" role="region" aria-label="Quotes side by side">
          <table class="cmp">
            <caption class="sr">Your quotes side by side</caption>
            <thead>
              <tr>
                <th scope="col"><span class="sr">Item</span></th>
                @for (e of entries(); track e.id; let i = $index) {
                  <th scope="col">
                    <span class="qh">Quote {{ i + 1 }}</span>
                    <button class="x" type="button" (click)="remove(i)" [attr.aria-label]="'Remove quote ' + (i + 1)">Remove</button>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of rows; track $index; let ri = $index) {
                @if (row.kind === 'section') {
                  <tr class="sec"><th scope="colgroup" [attr.colspan]="entries().length + 1">{{ $any(row).label }}@if ($any(row).note) { <span class="muted small"> {{ $any(row).note }}</span> }</th></tr>
                } @else if (row.kind === 'included') {
                  <tr>
                    <th scope="row">Included in the price</th>
                    @for (e of entries(); track e.id; let i = $index) {
                      <td class="incl">
                        @for (inc of inclusions; track inc.key) {
                          <label class="check"><input type="checkbox" [checked]="e.included.includes(inc.key)" (change)="toggleIncluded(i, inc.key)" [attr.aria-label]="inc.label + ', quote ' + (i + 1)" /><span>{{ inc.label }}</span></label>
                        }
                      </td>
                    }
                  </tr>
                } @else if (row.kind === 'flags') {
                  <tr class="flagrow">
                    <th scope="row">Red flags and things to question</th>
                    @for (d of derived(); track $index) {
                      <td>
                        @if (!d) { <span class="muted">Add a size and a price</span> }
                        @else if (!d.flags.length) { <span class="ok">None found from what you entered</span> }
                        @else {
                          <ul class="flags">@for (f of d.flags; track f.key + $index) { <li [class]="f.level"><span class="dot" aria-hidden="true"></span><span><span class="sr">{{ f.level === 'red' ? 'Red flag: ' : 'Question: ' }}</span>{{ f.text }}</span></li> }</ul>
                        }
                      </td>
                    }
                  </tr>
                } @else if (row.kind === 'missing') {
                  <tr>
                    <th scope="row">Ask them for</th>
                    @for (d of derived(); track $index) {
                      <td>@if (d && d.missing.length) { <span class="small">{{ d.missing.join(', ') }}</span> } @else { <span class="muted">-</span> }</td>
                    }
                  </tr>
                } @else if (row.kind === 'derived') {
                  <tr class="der">
                    <th scope="row">{{ $any(row).label }}@if ($any(row).hint) { <span class="muted small"> {{ $any(row).hint }}</span> }</th>
                    @for (d of derived(); track $index; let i = $index) {
                      <td class="num" [class.b]="isBest(row, i)">{{ shown(row, d, i) }}</td>
                    }
                  </tr>
                } @else {
                  <tr>
                    <th scope="row"><label [for]="'c-' + ri + '-0'">{{ $any(row).label }}</label>@if ($any(row).unit) { <span class="muted small"> {{ $any(row).unit }}</span> }@if ($any(row).hint) { <span class="muted small"> {{ $any(row).hint }}</span> }</th>
                    @for (e of entries(); track e.id; let i = $index) {
                      <td [class.b]="isBestInput(row, i)">
                        @switch (row.kind) {
                          @case ('text') { <input type="text" [id]="'c-' + ri + '-' + i" [value]="str(e, $any(row).key)" (input)="set(i, $any(row).key, $any($event.target).value)" /> }
                          @case ('number') { <input type="number" min="0" [step]="$any(row).step || 'any'" [id]="'c-' + ri + '-' + i" [value]="numVal(e, $any(row).key)" (input)="setNum(i, $any(row).key, $event)" /> }
                          @case ('bool') { <input type="checkbox" [id]="'c-' + ri + '-' + i" [checked]="on(e, $any(row).key)" (change)="set(i, $any(row).key, $any($event.target).checked)" /> }
                          @case ('select') { <select [id]="'c-' + ri + '-' + i" (change)="set(i, $any(row).key, $any($event.target).value)">@for (o of $any(row).options; track o.v) { <option [value]="o.v" [selected]="str(e, $any(row).key) === o.v">{{ o.l }}</option> }</select> }
                        }
                      </td>
                    }
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        <p class="hint">Green cells are the best value in that row. Check any figure the file reader filled in against your quote. These are estimates and flags to ask about, not legal advice.</p>
        <div class="acts">
          <a class="btn" routerLink="/check-quote">Check one quote in more detail</a>
          <a class="btn" routerLink="/plan">Work out the right size for you</a>
        </div>
      } @else {
        <p class="empty">Add a quote, read a quote file, or try an example to start.</p>
      }

      <support-link />
    </div>
  `,
  styles: `
    .page { padding: 48px 0 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
    .lead { font-size: 1.15rem; color: var(--ink-2); max-width: 64ch; }
    .home { border: 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); margin: 0; padding: 12px 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 16px; max-width: 760px; legend { font-weight: 650; padding: 0 0 6px; } .field { display: grid; gap: 4px; align-content: start; } }
    @media (max-width: 680px) { .home { grid-template-columns: minmax(0, 1fr); } }
    .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .grow { flex: 1; }
    .btn.off { opacity: 0.5; pointer-events: none; }
    .err { display: flex; gap: 8px; color: var(--bad); font-weight: 600; }
    .confirm { display: grid; gap: 8px; padding: 14px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
    .confirm h2 { font-size: 1.15rem; margin: 0; }
    .found { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; max-width: 520px; li { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--line); } }
    .acts { display: flex; flex-wrap: wrap; gap: 10px; }
    .scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--r-surf); }
    .scroll:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    table.cmp { border-collapse: separate; border-spacing: 0; min-width: 760px; width: 100%; font-size: 0.9rem; }
    .cmp th, .cmp td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid var(--line); min-width: 170px; background: var(--surface); }
    .cmp tbody th[scope='row'], .cmp thead th:first-child { position: sticky; left: 0; z-index: 1; min-width: 150px; max-width: 190px; font-weight: 600; color: var(--ink-2); background: var(--surface); border-right: 1px solid var(--line); }
    .cmp thead th { position: sticky; top: 0; z-index: 2; background: var(--surface-2); }
    .cmp thead th:first-child { z-index: 3; }
    .qh { font-weight: 700; margin-right: 8px; }
    .x { background: none; border: 0; color: var(--bad); font: inherit; font-size: 0.82rem; cursor: pointer; text-decoration: underline; padding: 0; }
    .cmp tr.sec th { background: var(--surface-2); position: static; font-size: 0.95rem; color: var(--ink); border-right: 0; max-width: none; }
    .cmp input[type='text'], .cmp input[type='number'], .cmp select { width: 100%; min-width: 0; }
    .cmp input[type='checkbox'] { width: 20px; height: 20px; }
    .cmp td.b { background: color-mix(in srgb, var(--sun) 22%, var(--surface)); font-weight: 650; }
    .cmp td.incl { display: grid; gap: 4px; }
    .cmp td.incl .check span { font-size: 0.86rem; }
    .flags { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; li { display: flex; gap: 8px; align-items: flex-start; } }
    .flags .dot { flex: none; width: 10px; height: 10px; border-radius: 50%; margin-top: 5px; background: var(--sun-strong); }
    .flags li.red .dot { background: var(--bad); }
    .flags li.red { font-weight: 600; }
    .ok { color: var(--link); font-weight: 600; }
    .empty { color: var(--ink-2); padding: 24px 0; }
  `,
})
export class QuoteComparePage {
  readonly store = inject(PlanStore);
  readonly typical = PRICES.usage.typicalHomeKwh;
  readonly roofOptions = [{ v: 'S', l: 'South' }, { v: 'SE_SW', l: 'South-east or south-west' }, { v: 'E_W', l: 'East and west' }, { v: 'N', l: 'North' }];
  readonly rows = ROWS;
  readonly max = MAX_QUOTES;
  readonly inclusions = INCLUSIONS;
  readonly entries = inject(QuotesState).entries;
  readonly account = inject(Account);
  readonly saved = signal('');
  readonly message = signal('');
  readonly reading = signal(false);
  readonly readingText = signal('');
  readonly proposal = signal<{ entry: QuoteEntry; count: number; summary: { label: string; value: string; source: string }[] } | null>(null);
  private ai = signal<'checking' | 'unavailable' | 'downloadable' | 'downloading' | 'available'>('checking');
  private installerNames = [...new Set([...ALL.map((i) => i.name), ...SEAI.companies.map((c) => c.name)])];
  private seq = 0;

  readonly ctx = computed(() => ({ usage: this.store.usage(), home: this.store.home(), assumptions: this.store.assumptions() }));
  readonly derived = computed(() => this.entries().map((e) => derive(e, this.ctx())));
  readonly meterMode = computed(() => this.store.mode() === 'meter' && !!this.store.meterUsage());
  readonly roundedUse = computed(() => Math.round(this.store.usage().annualKwh));

  constructor() {
    this.account.restore();
    browserAiAvailability().then((a) => this.ai.set(a));
  }

  private id() { return `q${Date.now().toString(36)}${this.seq++}`; }

  setUse(ev: Event) {
    const v = +(ev.target as HTMLInputElement).value;
    if (Number.isFinite(v) && v >= 500 && v <= 40000) { this.store.mode.set('annual'); this.store.annualKwh.set(Math.round(v)); }
  }
  setRoof(v: string) { this.store.patchHome({ orientation: v as 'S' | 'SE_SW' | 'E_W' | 'N' }); }
  setYear(ev: Event) {
    const raw = (ev.target as HTMLInputElement).value.trim();
    const v = raw === '' ? null : Math.round(+raw);
    this.store.patchHome({ yearOccupied: v !== null && Number.isFinite(v) && v >= 1700 && v <= 2100 ? v : null });
  }
  add() { if (this.entries().length < MAX_QUOTES) this.entries.update((l) => [...l, blankEntry(this.id())]); }
  remove(i: number) { this.entries.update((l) => l.filter((_, j) => j !== i)); }
  clear() { this.entries.set([]); this.message.set(''); this.proposal.set(null); }
  example() { this.message.set(''); this.entries.set(exampleEntries().map((e) => ({ ...e, id: this.id() }))); }

  str(e: QuoteEntry, k: Key): string { const v = e[k]; return typeof v === 'string' ? v : ''; }
  on(e: QuoteEntry, k: Key): boolean { return !!e[k]; }
  numVal(e: QuoteEntry, k: Key): string | number { const v = e[k]; return typeof v === 'number' ? v : ''; }
  set(i: number, k: Key, v: unknown) { this.entries.update((l) => l.map((e, j) => (j === i ? { ...e, [k]: v } : e))); }
  setNum(i: number, k: Key, ev: Event) {
    const raw = (ev.target as HTMLInputElement).value.trim();
    const n = raw === '' ? NaN : +raw;
    const v = Number.isFinite(n) && n >= 0 ? n : null;
    this.set(i, k, k === 'batteryKwh' ? v ?? 0 : v);
  }
  toggleIncluded(i: number, key: string) {
    this.entries.update((l) => l.map((e, j) => (j === i ? { ...e, included: e.included.includes(key) ? e.included.filter((x) => x !== key) : [...e.included, key] } : e)));
  }

  /** The value shown in a derived cell. */
  shown(row: Row, d: Derived | null, i: number): string {
    if (row.kind !== 'derived') return '';
    const v = row.get(d, this.entries()[i]);
    if (v === null || v === undefined) return d ? '?' : '-';
    if (typeof v === 'string') return v;
    return row.fmt === 'eur' ? eur(v) : row.fmt === 'pct' ? `${v}%` : row.fmt === 'years' ? `${v} years` : String(v);
  }
  private numeric(row: Row): (number | null)[] {
    const d = this.derived();
    if (row.kind === 'derived') return d.map((x, i) => { const v = row.get(x, this.entries()[i]); return typeof v === 'number' ? v : null; });
    if (row.kind === 'number') return this.entries().map((e) => { const v = e[row.key]; return typeof v === 'number' ? v : null; });
    return [];
  }
  isBest(row: Row, i: number): boolean { return row.kind === 'derived' && !!row.best && bestIndexes(this.numeric(row), row.best).includes(i); }
  isBestInput(row: Row, i: number): boolean { return row.kind === 'number' && !!row.best && bestIndexes(this.numeric(row), row.best).includes(i); }

  save() {
    const blob = new Blob([quotesToFile(this.entries())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'greenwattz-quotes.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href));
  }
  async saveToAccount() {
    const names = this.entries().map((e) => e.installer.trim()).filter(Boolean).join(', ');
    try {
      const name = await this.account.save('quotes', defaultName('quotes', names || `${this.entries().length} quotes`), quotesToFile(this.entries()));
      this.saved.set(`Saved to your account as "${name}".`);
    } catch (e) {
      this.saved.set(e instanceof Error ? e.message : 'We could not save that.');
    }
  }
  async onLoad(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    try {
      const list = quotesFromFile(await f.text());
      this.entries.set(list.map((e) => ({ ...e, id: this.id() })));
      this.message.set('');
    } catch (e) {
      this.message.set(e instanceof Error ? e.message : 'We could not read that file.');
    }
    input.value = '';
  }

  async onRead(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    this.message.set(''); this.proposal.set(null);
    if (/^image\//.test(f.type) || /\.(png|jpe?g|heic|webp)$/i.test(f.name)) {
      this.message.set('Photos and scans cannot be read yet. Upload the quote as a PDF, or add a quote and type the figures in.');
      input.value = '';
      return;
    }
    this.reading.set(true); this.readingText.set('Reading the file on your device.');
    try {
      const text = await readFileText(f);
      if (text.trim().length < 20) throw new Error('empty');
      const rules = readQuoteText(text, this.installerNames);
      let ai: ReadFields = {};
      if (this.ai() === 'available' || this.ai() === 'downloadable') {
        this.readingText.set('Reading with your browser’s on-device AI.');
        const raw = await readWithBrowserAi(text, (s) => this.readingText.set(`Downloading the on-device AI model, ${Math.round(s * 100)}%.`));
        if (raw) ai = acceptAiFields(raw, text);
      }
      const { fields, found } = mergeReads(rules, ai);
      const terms = readTerms(text);
      this.proposal.set(this.summarise(fields, found, terms));
    } catch {
      this.message.set('We could not read that file. It may be a scan or a photo inside a PDF. Add a quote and type the figures in instead.');
    } finally {
      this.reading.set(false);
      input.value = '';
    }
  }

  private summarise(f: ReadFields, found: Found, t: TermsFields) {
    const src = (k: keyof ReadFields) => (found[k] === 'ai' ? 'Read by your browser’s AI' : 'Read from the text');
    const rows: { label: string; value: string; source: string }[] = [];
    const add = (label: string, value: string | number | undefined, source: string) => { if (value !== undefined && value !== '') rows.push({ label, value: String(value), source }); };
    add('Installer', f.installer, src('installer'));
    add('Panels', f.panels, src('panels'));
    add('Watts per panel', f.watts, src('watts'));
    add('System size', f.kwp !== undefined ? `${f.kwp} kWp` : undefined, src('kwp'));
    add('Battery', f.batteryKwh !== undefined ? `${f.batteryKwh} kWh` : undefined, src('batteryKwh'));
    add('Total price', f.priceTotal !== undefined ? eur(f.priceTotal) : undefined, src('priceTotal'));
    add('Total after grants', f.priceAfterGrant !== undefined ? eur(f.priceAfterGrant) : undefined, src('priceAfterGrant'));
    add('Deposit', t.depositPct !== undefined ? `${t.depositPct}%` : undefined, 'Read from the text');
    add('Paid before works start', t.beforeWorksPct !== undefined ? `${t.beforeWorksPct}%` : undefined, 'Read from the text');
    add('Workmanship warranty', t.workmanshipYears !== undefined ? `${t.workmanshipYears} years` : undefined, 'Read from the text');
    add('Cancellation', t.coolingOffDays !== undefined ? `${t.coolingOffDays} days` : undefined, 'Read from the text');
    add('Grant', t.grantRoute === 'paid-to-you' ? 'Paid to you afterwards' : t.grantRoute === 'deducted' ? 'Taken off the price' : undefined, 'Read from the text');
    if ((t.depositPcts?.length ?? 0) > 1) add('Payment terms', `Two different deposits found: ${t.depositPcts!.join('% and ')}%`, 'Read from the text');
    const entry = entryFromRead(f, t, this.id());
    return { entry, count: rows.length, summary: rows };
  }

  accept() {
    const p = this.proposal();
    if (!p) return;
    this.entries.update((l) => (l.length < MAX_QUOTES ? [...l, p.entry] : l));
    this.proposal.set(null);
  }
}

