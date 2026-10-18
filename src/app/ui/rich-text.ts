import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { parseInline } from '../core/rich';

@Component({
  selector: 'rich-text',
  imports: [RouterLink],
  template: `@for (s of segs(); track $index) {
    @if (s.kind === 'bold') { <strong>{{ s.text }}</strong> }
    @else if (s.kind === 'link') {
      @if (s.external) { <a [href]="s.href" target="_blank" rel="noopener noreferrer">{{ s.text }}</a> }
      @else { <a [routerLink]="s.href" [fragment]="s.fragment">{{ s.text }}</a> }
    }
    @else { <ng-container>{{ s.text }}</ng-container> }
  }`,
  styles: `:host { display: contents; } a { color: var(--link); text-underline-offset: 3px; } strong { font-weight: 650; }`,
})
export class RichText {
  readonly text = input.required<string>();
  readonly segs = computed(() => parseInline(this.text()));
}
