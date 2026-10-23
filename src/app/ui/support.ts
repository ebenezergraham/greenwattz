import { Component, input } from '@angular/core';
import { SITE } from '../core/site';

/** A "Buy me a coffee" link. Shows nothing until SITE.supportUrl is set. A plain link: nothing loads from the service until clicked. */
@Component({
  selector: 'support-link',
  template: `
    @if (url) {
      <p class="support">
        <span>{{ text() }}</span>
        <a class="btn sm" [href]="url" target="_blank" rel="noopener noreferrer">Buy me a coffee</a>
      </p>
    }
  `,
  styles: `
    .support { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin: 0; padding: 14px 0; color: var(--ink-2); }
    .support span { max-width: 60ch; }
  `,
})
export class SupportLink {
  readonly text = input("Found this useful? GreenWattz is free, with no ads or commissions. If you'd like to support it, you can buy me a coffee.");
  readonly url = SITE.supportUrl;
}
