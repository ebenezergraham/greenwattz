import { Component, computed, input } from '@angular/core';
import { Band, MONTH_NAMES } from '../core/engine';

/** Small dependency-free SVG charts. Colours come from CSS variables so dark mode just works. */

export interface Legend { cls: string; text: string }

@Component({
  selector: 'day-chart',
  template: `
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" [attr.aria-label]="label()">
      @for (t of ticks(); track t.y) {
        <line [attr.x1]="L" [attr.x2]="W - 4" [attr.y1]="t.y" [attr.y2]="t.y" class="grid" />
        <text [attr.x]="L - 6" [attr.y]="t.y + 4" class="axis" text-anchor="end">{{ t.v }}</text>
      }
      @for (b of bars(); track b.h) {
        <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.hgt" rx="2" [attr.class]="'bar ' + b.cls">
          <title>{{ b.tip }}</title>
        </rect>
      }
      @if (solarPath()) { <path [attr.d]="solarPath()" class="sun" /> }
      @for (h of [0, 3, 6, 9, 12, 15, 18, 21]; track h) {
        <text [attr.x]="x(h) + 2" [attr.y]="H - 8" class="axis">{{ hourLabel(h) }}</text>
      }
    </svg>
    <p class="legend small muted">
      @for (l of legendItems(); track l.text) { <span><i [attr.class]="'sw ' + l.cls"></i>{{ l.text }}</span> }
    </p>
  `,
  styles: `
    :host { display: block; }
    svg { width: 100%; height: auto; display: block; }
    .grid { stroke: var(--line); stroke-width: 1; }
    .axis { fill: var(--ink-3); font-size: 11px; font-family: var(--font); }
    .bar.use, .sw.use { fill: var(--chart-use); background: var(--chart-use); }
    .bar.night, .sw.night { fill: var(--chart-night); background: var(--chart-night); }
    .bar.day, .sw.day { fill: var(--chart-day); background: var(--chart-day); }
    .bar.flat, .sw.flat { fill: var(--chart-day); background: var(--chart-day); }
    .bar.peak, .sw.peak { fill: var(--chart-peak); background: var(--chart-peak); }
    path.sun { fill: color-mix(in srgb, var(--sun) 45%, transparent); stroke: var(--sun-strong); stroke-width: 2.5; stroke-linejoin: round; }
    .legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 8px; }
    .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
    .sw.sun { background: var(--sun); }
  `,
})
export class DayChart {
  readonly usage = input.required<number[]>();
  readonly solar = input<number[] | null>(null);
  readonly label = input('Average hourly electricity use across the day');
  /** Colours each bar by rate band when given. */
  readonly bands = input<Band[] | null>(null);
  readonly legend = input<Legend[] | null>(null);
  readonly unit = input('kWh');
  readonly W = 640; readonly H = 230; readonly L = 34; readonly T = 10; readonly B = 26;
  x = (h: number) => this.L + ((this.W - this.L - 4) * h) / 24;
  hourLabel(h: number) { return h === 0 ? '12am' : h < 12 ? h + 'am' : h === 12 ? '12pm' : h - 12 + 'pm'; }
  private max = computed(() => Math.max(0.2, ...this.usage(), ...(this.solar() ?? [0])) * 1.1);
  private yy = (v: number) => this.T + (this.H - this.T - this.B) * (1 - v / this.max());
  ticks = computed(() => {
    const m = this.max();
    const step = m > 3 ? 1 : m > 1.2 ? 0.5 : 0.25;
    const out: { y: number; v: string }[] = [];
    for (let v = 0; v <= m; v += step) out.push({ y: this.yy(v), v: v.toFixed(step < 1 ? 2 : 0).replace(/\.?0+$/, '') || '0' });
    return out;
  });
  bars = computed(() =>
    this.usage().map((v, h) => ({
      h, x: this.x(h) + 2, w: (this.W - this.L - 4) / 24 - 4, y: this.yy(v), hgt: this.H - this.B - this.yy(v),
      cls: this.bands()?.[h] ?? 'use', tip: `${this.hourLabel(h)} to ${this.hourLabel((h + 1) % 24)}: ${v.toFixed(2)} ${this.unit()}`,
    })),
  );
  legendItems = computed<Legend[]>(() => [
    ...(this.legend() ?? [{ cls: 'use', text: 'Your usage (kWh per hour)' }]),
    ...(this.solar() ? [{ cls: 'sun', text: 'Typical sunny day output' }] : []),
  ]);
  solarPath = computed(() => {
    const s = this.solar();
    if (!s) return '';
    const pts = s.map((v, h) => `${this.x(h + 0.5)},${this.yy(v)}`);
    return `M${this.x(0.5)},${this.yy(0)} L${pts.join(' L')} L${this.x(23.5)},${this.yy(0)} Z`;
  });
}

@Component({
  selector: 'month-chart',
  template: `
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" aria-label="Monthly solar generation compared with your electricity use">
      @for (b of bars(); track b.m) {
        <rect [attr.x]="b.x" [attr.y]="b.dy" [attr.width]="b.w" [attr.height]="b.dh" rx="2" class="d" />
        <rect [attr.x]="b.x + b.w + 2" [attr.y]="b.gy" [attr.width]="b.w" [attr.height]="b.gh" rx="2" class="g" />
        <text [attr.x]="b.x + b.w" [attr.y]="H - 6" text-anchor="middle" class="axis">{{ b.m }}</text>
      }
      <line [attr.x1]="0" [attr.x2]="W" [attr.y1]="H - 24" [attr.y2]="H - 24" class="base" />
    </svg>
    <p class="legend small muted"><span><i class="sw d"></i>You use (kWh)</span><span><i class="sw g"></i>Panels produce (kWh)</span></p>
  `,
  styles: `
    :host { display: block; }
    svg { width: 100%; height: auto; display: block; }
    .axis { fill: var(--ink-3); font-size: 11px; font-family: var(--font); }
    .base { stroke: var(--line); }
    .d { fill: var(--chart-use); } .g { fill: var(--sun); }
    .legend { display: flex; gap: 18px; margin-top: 8px; }
    .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
    .sw.d { background: var(--chart-use); } .sw.g { background: var(--sun); }
  `,
})
export class MonthChart {
  readonly gen = input.required<number[]>();
  readonly demand = input.required<number[]>();
  readonly W = 640; readonly H = 200;
  bars = computed(() => {
    const max = Math.max(...this.gen(), ...this.demand(), 1);
    const slot = this.W / 12, w = slot / 2 - 5, hh = this.H - 30;
    return MONTH_NAMES.map((m, i) => {
      const dh = (this.demand()[i] / max) * hh, gh = (this.gen()[i] / max) * hh;
      return { m, x: i * slot + 4, w, dy: this.H - 24 - dh, dh, gy: this.H - 24 - gh, gh };
    });
  });
}

@Component({
  selector: 'cash-chart',
  template: `
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" [attr.aria-label]="'Cumulative savings over ' + horizon() + ' years. Break-even around year ' + breakEven()">
      <line [attr.x1]="L" [attr.x2]="W" [attr.y1]="zero()" [attr.y2]="zero()" class="zero" />
      <path [attr.d]="area()" class="area" />
      <path [attr.d]="line()" class="line" />
      @for (t of yTicks(); track t.v) { <text [attr.x]="L - 6" [attr.y]="t.y + 4" text-anchor="end" class="axis">{{ t.label }}</text> }
      @for (y of xTicks(); track y) { <text [attr.x]="xx(y)" [attr.y]="H - 4" text-anchor="middle" class="axis">{{ y === 0 ? 'Now' : 'Yr ' + y }}</text> }
    </svg>
  `,
  styles: `
    :host { display: block; } svg { width: 100%; height: auto; display: block; }
    .axis { fill: var(--ink-3); font-size: 11px; font-family: var(--font); }
    .zero { stroke: var(--ink-3); stroke-dasharray: 4 4; }
    .line { fill: none; stroke: var(--sun-strong); stroke-width: 3.5; stroke-linejoin: round; }
    .area { fill: color-mix(in srgb, var(--sun) 35%, transparent); }
  `,
})
export class CashChart {
  readonly points = input.required<{ year: number; cumulative: number }[]>();
  readonly W = 640; readonly H = 220; readonly L = 56; readonly B = 22; readonly T = 10;
  private min = computed(() => Math.min(0, ...this.points().map((p) => p.cumulative)));
  private max = computed(() => Math.max(1, ...this.points().map((p) => p.cumulative)));
  /** The last year on the chart, taken from the data so the axis follows the projection length. */
  horizon = computed(() => Math.max(1, ...this.points().map((p) => p.year)));
  xTicks = computed(() => { const h = this.horizon(), step = h > 20 ? 5 : h > 10 ? 2 : 1; const t: number[] = []; for (let y = 0; y <= h; y += step) t.push(y); return t; });
  xx = (y: number) => this.L + ((this.W - this.L - 6) * y) / this.horizon();
  yv = (v: number) => this.T + (this.H - this.T - this.B) * (1 - (v - this.min()) / (this.max() - this.min()));
  zero = computed(() => this.yv(0));
  line = computed(() => 'M' + this.points().map((p) => `${this.xx(p.year)},${this.yv(p.cumulative)}`).join(' L'));
  area = computed(() => `${this.line()} L${this.xx(this.horizon())},${this.zero()} L${this.xx(0)},${this.zero()} Z`);
  breakEven = computed(() => this.points().find((p) => p.cumulative >= 0)?.year ?? 'beyond ' + this.horizon());
  yTicks = computed(() => {
    const lo = this.min(), hi = this.max();
    const step = Math.pow(10, Math.floor(Math.log10((hi - lo) / 3)));
    const s = [1, 2, 5, 10].map((k) => k * step).find((k) => (hi - lo) / k <= 5) ?? step * 10;
    const out: { v: number; y: number; label: string }[] = [];
    for (let v = Math.ceil(lo / s) * s; v <= hi; v += s) out.push({ v, y: this.yv(v), label: (v < 0 ? '-' : '') + '€' + Math.abs(Math.round(v / 100) / 10) + 'k' });
    return out;
  });
}
