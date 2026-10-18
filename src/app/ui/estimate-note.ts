import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PRICES, priceAgeDays, pricesAreStale } from '../core/engine';

/** Plain reminder that figures are estimates, with the date the prices were last reviewed. */
@Component({
  selector: 'estimate-note',
  imports: [RouterLink],
  template: `
    <p class="est"><b>Estimates, not quotes.</b> Prices reviewed {{ reviewed }}. Confirm everything with at least three SEAI-registered installers. <a routerLink="/estimates">How we estimate</a></p>
    @if (stale) {
      <p class="est stale">These prices were last reviewed {{ age }} days ago and may be out of date. Treat them with extra care and rely on current written quotes.</p>
    }
  `,
  styles: `
    :host { display: block; }
    .est { margin: 0 0 8px; font-size: 0.875rem; color: var(--ink-2); max-width: 70ch; }
    .est b { color: var(--ink); font-weight: 600; }
    .stale { color: var(--warn); font-weight: 600; }
  `,
})
export class EstimateNote {
  readonly reviewed = new Date(PRICES.reviewedOn + 'T00:00:00Z').toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  readonly age = priceAgeDays();
  readonly stale = pricesAreStale();
}
