import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { BATTERY_TIERS, DEFAULT_ASSUMPTIONS as A, PRICES, priceAgeDays, pricesAreStale } from '../core/engine';
import { INSTALLER_CHECKLIST, SITE } from '../core/site';

@Component({
  selector: 'page-estimates',
  imports: [RouterLink, DecimalPipe],
  template: `
    <article class="narrow doc">
      <h1>How we estimate</h1>
      <p class="lead">GreenWattz gives planning estimates to help you decide what to ask for. They are not quotes, and your installer's price for your home will differ.</p>

      <p>Prices were last reviewed on <b>{{ reviewed }}</b>. We aim to review them at least every {{ PRICES.reviewEveryDays }} days.
        @if (stale) { <span class="stale">That is overdue, so treat the figures with extra care.</span> }
        If a price looks wrong to you, email <a [href]="'mailto:' + site.contactEmail">{{ site.contactEmail }}</a>.</p>

      <h2>What we use</h2>
      <div class="tablewrap">
        <table class="tbl">
          <thead><tr><th>Item</th><th>Value we use</th><th>Basis</th></tr></thead>
          <tbody>
            <tr><td>Solar installed cost</td><td class="num">€{{ A.panelCostBase | number }} + €{{ A.panelCostPerKwp | number }} per kWp, at 0% VAT</td><td>{{ PRICES.solar.note }}</td></tr>
            @for (t of tiers; track t.key) {
              <tr><td>{{ t.label }} battery</td><td class="num">{{ t.range }}</td><td>Installed price range at 5 to 15 kWh. Examples: {{ t.examples }}.</td></tr>
            }
            <tr><td>SEAI solar grant</td><td class="num">€{{ PRICES.grants.seaiSolarFirst2kwpPerKwp }}/kWp for the first 2 kWp, €{{ PRICES.grants.seaiSolarNext2kwpPerKwp }}/kWp up to 4 kWp, max €{{ PRICES.grants.seaiSolarMax | number }}</td><td>For homes built and occupied before {{ PRICES.grants.seaiSolarBuiltBefore }}. <a [href]="PRICES.links.solarGrant" target="_blank" rel="noopener noreferrer">SEAI rules</a>.</td></tr>
            <tr><td>SEAI battery grant</td><td class="num">€{{ PRICES.grants.seaiBattery }} for {{ PRICES.grants.seaiBatteryMinKwh }} kWh or more</td><td>For homes built and occupied before {{ PRICES.grants.seaiBatteryBuiltBefore }}. <a [href]="PRICES.links.batteryGrant" target="_blank" rel="noopener noreferrer">SEAI rules</a>.</td></tr>
            <tr><td>Tax on export income</td><td class="num">€{{ A.exportTaxFreePerPerson }} tax-free per person, then about {{ c(A.exportTaxRate) }}</td><td>{{ PRICES.tax.note }}</td></tr>
            <tr><td>Electricity rates</td><td class="num">Day {{ c(A.dayRate) }}, night {{ c(A.nightRate) }}, peak {{ c(A.peakRate) }}, export {{ c(A.exportRate) }}</td><td>Typical starting figures. You enter your own rates.</td></tr>
            <tr><td>Solar output</td><td class="num">{{ A.yieldPerKwp }} kWh per kWp a year facing south</td><td>Adjusted for roof direction, shade and month.</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Why your quote will differ</h2>
      <ul>
        <li>A survey of your roof, wiring and electricity meter changes the work and the price.</li>
        <li>Brands, battery capacity and warranties vary a lot between installers.</li>
        <li>Prices move with supply, demand and grant rules, and we review them periodically rather than live.</li>
        <li>Your savings depend on your tariff, your export rate, the weather and when you use power.</li>
      </ul>

      <h2>What to confirm with each installer</h2>
      <ul>@for (i of checklist; track i) { <li>{{ i }}</li> }</ul>

      <h2>Where the figures come from</h2>
      <p class="muted">Published installer and price-guide estimates and official sources. We do not take payment from installers to change them.</p>
      <ul>@for (s of PRICES.sources; track s.url) { <li><a [href]="s.url" target="_blank" rel="noopener noreferrer">{{ s.label }}</a> <span class="muted small">{{ s.what }}</span></li> }</ul>

      <p><a class="btn primary" routerLink="/plan">Back to the planner</a></p>
    </article>
  `,
  styles: `
    .doc { padding: 48px 0 0; display: grid; gap: 14px; }
    .lead { font-size: 1.1rem; color: var(--ink-2); }
    h2 { margin-top: 26px; font-size: 1.25rem; }
    ul { padding-left: 20px; display: grid; gap: 8px; margin: 0; }
    .stale { color: var(--warn); font-weight: 600; }
    .tablewrap { overflow-x: auto; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 0.9rem; min-width: 560px; th { text-align: left; font-weight: 500; font-size: 0.82rem; color: var(--ink-3); padding: 0 12px 8px 0; border-bottom: 1px solid var(--line); } td { padding: 12px 12px 12px 0; border-bottom: 1px solid var(--line); vertical-align: top; } }
  `,
})
export class EstimatesPage {
  readonly PRICES = PRICES;
  readonly A = A;
  readonly site = SITE;
  readonly checklist = INSTALLER_CHECKLIST;
  readonly stale = pricesAreStale();
  readonly age = priceAgeDays();
  readonly reviewed = new Date(PRICES.reviewedOn + 'T00:00:00Z').toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  readonly tiers = BATTERY_TIERS.map((t) => {
    const lo = Math.min(...t.anchors.map((a) => a.low)), hi = Math.max(...t.anchors.map((a) => a.high));
    return { key: t.key, label: t.label, range: `€${lo.toLocaleString('en-IE')} to €${hi.toLocaleString('en-IE')}`, examples: t.examples.slice(0, 2).join(', ') };
  });
  c(n: number) { return Math.round(n * 1000) / 10 + 'c'; }
}
