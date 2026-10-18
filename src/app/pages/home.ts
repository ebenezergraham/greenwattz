import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { DEFAULT_ASSUMPTIONS, HomeInputs, buildGrid, estimateProfile, pickStrategies } from '../core/engine';

@Component({
  selector: 'page-home',
  imports: [RouterLink, DecimalPipe],
  template: `
    <section class="hero wrap">
      <div class="copy">
        <h1>Find the right solar setup for your home</h1>
        <p class="sub">Free and private. See how many panels you need, whether a battery pays off, and what it costs.</p>
        <div class="cta">
          <a class="btn primary" routerLink="/plan">Start planning</a>
          <a class="btn" routerLink="/guide/esb-data">Get your meter data</a>
        </div>
      </div>

      <div class="card raised live" aria-label="Quick estimate">
        <label for="q" class="lbl">Roughly how much electricity do you use?</label>
        <div class="val num">{{ kwh() | number }} <span>kWh a year</span></div>
        <input id="q" type="range" min="2000" max="9000" step="100" [value]="kwh()" (input)="kwh.set(+$any($event.target).value)" />
        <div class="out">
          <div><span class="small muted">Suggested system</span><b class="num">{{ best().panels }} panels, {{ best().kwp | number: '1.1-1' }} kWp</b></div>
          <div><span class="small muted">Battery</span><b>{{ best().batteryKwh ? best().batteryKwh + ' kWh' : 'Not needed yet' }}</b></div>
          <div><span class="small muted">Cost after SEAI grant</span><b class="num">€{{ round50(best().netCost) | number }}</b></div>
          <div><span class="small muted">Pays back in</span><b class="num">{{ best().paybackYears | number: '1.0-0' }} years</b></div>
        </div>
        <a class="btn primary full" routerLink="/plan">Refine for my home</a>
        <p class="small muted">Typical semi-detached home. A full plan uses your roof and your day.</p>
      </div>
    </section>

    <section class="wrap how">
      <h2>From bill to buying decision</h2>
      <ol>
        <li><i class="ph ph-house-line"></i><h3>Describe</h3><p>Roof direction, shade, and who is home during the day.</p></li>
        <li><i class="ph ph-chart-bar"></i><h3>Measure</h3><p>Upload your ESB smart meter file or type in your yearly usage.</p></li>
        <li><i class="ph ph-sliders-horizontal"></i><h3>Compare</h3><p>Three strategies, from lowest outlay to most independent.</p></li>
        <li><i class="ph ph-coins"></i><h3>Decide</h3><p>See cost after grant, payback, and 25 years of cash flow.</p></li>
      </ol>
    </section>

    <section class="wrap bento">
      <article class="b privacy">
        <i class="ph ph-lock-key"></i>
        <h2>Your plan stays on your device</h2>
        <p>Your smart meter file is read in your browser. We have no server that receives it, and we set no tracking cookies.</p>
        <a routerLink="/privacy">How we handle data</a>
      </article>
      <article class="b ie">
        <h3>Built on Irish numbers</h3>
        <p>Night rate hours, 0% VAT on solar, the SEAI grant, and Clean Export Guarantee payments are all in the model.</p>
      </article>
      <article class="b reviews">
        <h3>Check the installer too</h3>
        <p>Compare Trustpilot and Google ratings for Irish installers before you sign.</p>
        <a class="btn sm" routerLink="/reviews">See reviews</a>
      </article>
    </section>

    <section class="wrap honest">
      <h2>What we do not do</h2>
      <p>We are not an installer and we do not sell your details. Results are estimates from a typical day in each month, so use them to ask better questions, then get written quotes.</p>
    </section>
  `,
  styles: `
    .hero { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 56px; align-items: center; padding: 56px 0 72px; }
    @media (max-width: 920px) { .hero { grid-template-columns: 1fr; gap: 36px; padding-top: 32px; } }
    .sub { margin: 22px 0 30px; font-size: 1.2rem; color: var(--ink-2); max-width: 36ch; }
    .cta { display: flex; flex-wrap: wrap; gap: 12px; }
    .live { display: grid; gap: 14px; padding: 28px; }
    .val { font-size: 2.4rem; font-weight: 650; letter-spacing: -0.04em; line-height: 1; span { font-size: 1rem; font-weight: 500; color: var(--ink-2); letter-spacing: 0; } }
    .out { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 12px; padding: 18px 0; border-block: 1px solid var(--line); div { display: grid; gap: 2px; } b { font-size: 1.1rem; } }
    .full { width: 100%; }
    .how { padding: 40px 0 72px; }
    .how ol { list-style: none; padding: 0; margin: 32px 0 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border-top: 1px solid var(--line); }
    .how li { padding: 28px 24px 0 0; display: grid; gap: 8px; align-content: start; i { font-size: 2rem; color: var(--accent); } p { color: var(--ink-2); } }
    @media (max-width: 860px) { .how ol { grid-template-columns: 1fr 1fr; gap: 24px 0; } }
    @media (max-width: 520px) { .how ol { grid-template-columns: 1fr; } }
    .bento { display: grid; grid-template-columns: 1.4fr 1fr; grid-template-rows: auto auto; gap: 16px; padding-bottom: 72px; }
    @media (max-width: 860px) { .bento { grid-template-columns: 1fr; } }
    .b { border-radius: var(--r-surf); padding: 32px; display: grid; gap: 12px; align-content: start; }
    .b p { color: inherit; opacity: 0.88; max-width: 52ch; }
    .privacy { grid-row: span 2; background: var(--accent); color: var(--accent-ink); align-content: end; min-height: 340px;
      background-image: radial-gradient(circle at 85% 12%, color-mix(in srgb, var(--accent-ink) 22%, transparent) 0, transparent 38%), repeating-linear-gradient(135deg, transparent 0 22px, color-mix(in srgb, var(--accent-ink) 7%, transparent) 22px 23px);
      i { font-size: 2.6rem; } a { color: inherit; font-weight: 600; } }
    .ie { background: var(--surface); border: 1px solid var(--line); }
    .reviews { background: var(--surface-2); justify-items: start; }
    .honest { padding-bottom: 24px; display: grid; gap: 14px; p { max-width: 62ch; color: var(--ink-2); font-size: 1.1rem; } }
  `,
})
export class HomePage {
  readonly kwh = signal(4200);
  private home: HomeInputs = { occupancy: 'mixed', orientation: 'S', shading: 'none', roofAreaM2: 30, obstacles: { chimney: 0, skylight: 0, vent: 0, dish: 0, dormer: 0, thermal: 0 }, threePhase: false, addEv: false, addHeatPump: false };
  readonly best = computed(() => {
    const u = { annualKwh: this.kwh(), profile: estimateProfile(this.kwh(), 'mixed'), source: 'estimate' as const };
    return pickStrategies(buildGrid(u, this.home, DEFAULT_ASSUMPTIONS))[1];
  });
  round50(n: number) { return Math.round(n / 50) * 50; }
}
