import { Injectable, signal } from '@angular/core';
import type { QuoteEntry } from './quote-compare';

/** The quotes being compared, shared so a saved comparison can be opened from the account page. Held in memory only. */
@Injectable({ providedIn: 'root' })
export class QuotesState {
  readonly entries = signal<QuoteEntry[]>([]);
}
