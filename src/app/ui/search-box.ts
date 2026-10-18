import { Component, computed, input, model, signal } from '@angular/core';

/** Text search with as-you-type name suggestions. Accessible combobox: arrows, Enter, Escape. */
@Component({
  selector: 'search-box',
  template: `
    <div class="field">
      <label [attr.for]="id">{{ label() }}</label>
      <div class="wrap">
        <input
          [id]="id" type="text" autocomplete="off" role="combobox" aria-autocomplete="list"
          [attr.aria-expanded]="open()" [attr.aria-controls]="id + '-list'"
          [attr.aria-activedescendant]="active() >= 0 ? id + '-opt-' + active() : null"
          [value]="value()" (input)="onInput($event)" (focus)="focused.set(true)" (blur)="close()" (keydown)="key($event)" />
        @if (open()) {
          <ul class="list" role="listbox" [id]="id + '-list'">
            @for (s of matches(); track s; let i = $index) {
              <li role="option" [id]="id + '-opt-' + i" [class.on]="i === active()" [attr.aria-selected]="i === active()" (mousedown)="choose(s, $event)">
                <span>{{ s.slice(0, start(s)) }}<b>{{ s.slice(start(s), start(s) + value().trim().length) }}</b>{{ s.slice(start(s) + value().trim().length) }}</span>
              </li>
            }
          </ul>
        }
      </div>
    </div>
  `,
  styles: `
    .wrap { position: relative; }
    .list { position: absolute; z-index: 15; left: 0; right: 0; top: calc(100% + 4px); margin: 0; padding: 6px; list-style: none; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-ctl); box-shadow: var(--shadow); max-height: 320px; overflow-y: auto; }
    li { padding: 10px 12px; border-radius: 7px; cursor: pointer; }
    li.on, li:hover { background: var(--surface-2); }
    b { font-weight: 700; }
  `,
})
export class SearchBox {
  static n = 0;
  readonly id = 'sb-' + SearchBox.n++;
  readonly label = input('Search installers');
  readonly items = input.required<string[]>();
  readonly value = model('');
  readonly focused = signal(false);
  readonly active = signal(-1);
  private dismissed = signal(false);

  readonly matches = computed(() => {
    const q = this.value().trim().toLowerCase();
    if (!q) return [];
    const starts: string[] = [], inside: string[] = [];
    for (const s of this.items()) {
      const i = s.toLowerCase().indexOf(q);
      if (i === 0) starts.push(s); else if (i > 0) inside.push(s);
    }
    return [...starts, ...inside].slice(0, 8);
  });
  readonly open = computed(() => this.focused() && !this.dismissed() && this.matches().length > 0 && !this.exact());
  private exact = computed(() => this.matches().length === 1 && this.matches()[0].toLowerCase() === this.value().trim().toLowerCase());

  start(s: string) { return Math.max(0, s.toLowerCase().indexOf(this.value().trim().toLowerCase())); }
  onInput(e: Event) { this.value.set((e.target as HTMLInputElement).value); this.active.set(-1); this.dismissed.set(false); }
  close() { this.focused.set(false); this.active.set(-1); }
  choose(s: string, e?: Event) { e?.preventDefault(); this.value.set(s); this.active.set(-1); this.dismissed.set(true); }
  key(e: KeyboardEvent) {
    const n = this.matches().length;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); this.dismissed.set(false); this.active.set((this.active() + 1) % n); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); this.active.set((this.active() - 1 + n) % n); }
    else if (e.key === 'Enter' && this.active() >= 0) { e.preventDefault(); this.choose(this.matches()[this.active()]); }
    else if (e.key === 'Escape') { this.dismissed.set(true); this.active.set(-1); }
  }
}
