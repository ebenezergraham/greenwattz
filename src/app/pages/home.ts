import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { POSTS } from '../data/posts';
import { DEFAULT_ASSUMPTIONS, HomeInputs, NO_OBSTACLES, PRICES, buildGrid, estimateProfile, pickStrategies, solarDay } from '../core/engine';
import { DayChart } from '../ui/charts';

@Component({
  selector: 'page-home',
  imports: [RouterLink, DecimalPipe, DayChart],
  template: `
    <section class="hero field-brand">
      <div class="wrap grid">
        <div class="copy">
          <h1>Work out solar for your home</h1>
          <p class="lead">Free, private and calculated in your browser. See panels, battery, cost after SEAI grants and payback.</p>
          <div class="cta">
            <a class="btn primary" routerLink="/plan">Start planning</a>
            <a class="btn" routerLink="/guide/esb-data">Get your meter data</a>
          </div>
        </div>

        <figure class="example" aria-labelledby="ex-t">
          <figcaption>
            <b id="ex-t">A June day in a typical semi-detached home</b>
            <span>Your use against what the panels make</span>
          </figcaption>
          <day-chart [usage]="june().usage" [solar]="june().solar" label="A June day: household electricity use and solar output by hour" />
          <div class="slide">
            <label for="q">Yearly electricity use</label>
            <input id="q" type="range" min="2000" max="9000" step="100" [value]="kwh()" (input)="kwh.set(+$any($event.target).value)" />
            <output for="q" class="num">{{ kwh() | number }} kWh</output>
          </div>
          <p class="sum num">
            {{ best().panels }} panels ({{ best().kwp | number: '1.1-1' }} kWp) cost about €{{ round50(best().grossCost) | number }}.
            Less the €{{ round50(best().grant) | number }} SEAI grant for homes first occupied before {{ grants.seaiSolarBuiltBefore }}, you pay <strong>€{{ round50(best().netCost) | number }}</strong>
            and it pays back in about <strong>{{ best().paybackYears | number: '1.0-0' }} years</strong>.
          </p>
          <a class="refine" routerLink="/plan">Refine this for my home</a>
        </figure>
      </div>
    </section>

    <section class="wrap rules">
      <h2>Built on Irish rules, not generic maths</h2>
      <dl>
        <div>
          <dt>SEAI grants, checked against your home</dt>
          <dd>Solar up to €{{ grants.seaiSolarMax | number }} and a €{{ grants.seaiBattery }} battery grant, applied only if your home was built and occupied before {{ grants.seaiSolarBuiltBefore }}.</dd>
        </div>
        <div>
          <dt>Night, day and peak rates</dt>
          <dd>Smart-meter tariffs, your own unit rates, and the export rate your supplier pays, including the tax-free allowance.</dd>
        </div>
        <div>
          <dt>Your data stays on your device</dt>
          <dd>Your ESB file is read in your browser and never uploaded, and we set no tracking cookies. An account is optional, and only holds what you choose to save. <a routerLink="/privacy">How we handle data</a>.</dd>
        </div>
        <div>
          <dt>Numbers you can check</dt>
          <dd>Prices are dated and sourced. They are estimates, not quotes, and we are not an installer. <a routerLink="/estimates">How we estimate</a>.</dd>
        </div>
      </dl>
    </section>

    <section class="wrap start">
      <div class="ways">
        <h2>Start with what you have</h2>
        <ol>
          <li><b>Your ESB meter file</b><span>Most accurate. It shows when you use power, not just how much.</span></li>
          <li><b>Your yearly kWh</b><span>It is on your bill as annual usage.</span></li>
          <li><b>Your monthly bill</b><span>Ten seconds, and good enough for a first look.</span></li>
        </ol>
        <a class="btn primary" routerLink="/plan">Start planning</a>
      </div>
      <div class="learn">
        <h3>New to solar?</h3>
        <ul>
          <li><a [routerLink]="['/blog', latest.slug]">{{ latest.title }}</a></li>
          <li><a routerLink="/glossary">Glossary</a><span class="muted small">kWp, MPRN, SEAI grants and more, in plain English.</span></li>
          <li><a routerLink="/check-quote">Check a solar quote</a><span class="muted small">See if the price per kWp is fair for Ireland.</span></li>
          <li><a routerLink="/compare-quotes">Compare your quotes</a><span class="muted small">Side by side, with red flags in the contract terms.</span></li>
          <li><a routerLink="/reviews">Installer ratings</a><span class="muted small">Trustpilot and Google scores side by side.</span></li>
        </ul>
      </div>
    </section>

    <section class="close field-brand">
      <div class="wrap">
        <h2>See your numbers in about ten minutes</h2>
        <a class="btn primary" routerLink="/plan">Start planning</a>
      </div>
    </section>
  `,
  styles: `
    .hero { padding: 64px 0 72px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 64px; align-items: center; }
    @media (max-width: 960px) { .grid { grid-template-columns: minmax(0, 1fr); gap: 40px; } .hero { padding: 36px 0 48px; } }
    .copy h1 { max-width: 11ch; }
    .lead { margin: 22px 0 32px; max-width: 34ch; font-size: 1.2rem; color: var(--ink-2); }
    .cta { display: flex; flex-wrap: wrap; gap: 12px; }

    .example { margin: 0; padding: 24px; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; display: grid; gap: 16px; }
    .example figcaption { display: grid; gap: 2px; b { font-weight: 650; } span { color: var(--ink-2); font-size: 0.9rem; } }
    .slide { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 14px; label { font-size: 0.92rem; color: var(--ink-2); } output { font-weight: 650; min-width: 9ch; text-align: right; } }
    @media (max-width: 560px) { .slide { grid-template-columns: 1fr auto; label { grid-column: 1 / -1; } } }
    .sum { margin: 0; font-size: 1.05rem; line-height: 1.5; strong { font-weight: 700; color: var(--sun); } }
    .refine { justify-self: start; color: var(--ink); font-weight: 650; text-underline-offset: 4px; }

    .rules { padding: 88px 0 24px; display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 64px; align-items: start; }
    .rules h2 { max-width: 12ch; }
    @media (max-width: 860px) { .rules { grid-template-columns: minmax(0, 1fr); gap: 28px; padding-top: 56px; } }
    dl { margin: 0; }
    dl div { padding: 22px 0; border-top: 1px solid var(--line); display: grid; gap: 6px; }
    dl div:last-child { border-bottom: 1px solid var(--line); }
    dt { font-weight: 650; font-size: 1.1rem; letter-spacing: -0.01em; }
    dd { margin: 0; color: var(--ink-2); max-width: 56ch; }

    .start { padding: 72px 0 80px; display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr); gap: 64px; }
    @media (max-width: 860px) { .start { grid-template-columns: minmax(0, 1fr); gap: 40px; padding: 48px 0 56px; } }
    .ways h2 { margin-bottom: 20px; }
    .ways ol { list-style: none; margin: 0 0 28px; padding: 0; counter-reset: w; }
    .ways li { counter-increment: w; display: grid; grid-template-columns: 44px 1fr; column-gap: 14px; padding: 16px 0; border-top: 1px solid var(--line); }
    .ways li::before { content: counter(w); font-family: var(--display); font-stretch: 78%; font-weight: 800; font-size: 1.9rem; line-height: 1; color: var(--sun-strong); grid-row: span 2; }
    .ways li b { font-weight: 650; }
    .ways li span { color: var(--ink-2); }
    .learn h3 { margin-bottom: 14px; }
    .learn ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
    .learn li { display: grid; gap: 2px; }
    .learn li a { font-weight: 650; }

    .close { padding: 72px 0; margin-bottom: -96px; }
    .close .wrap { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 24px; }
    .close h2 { max-width: 14ch; font-size: clamp(2rem, 5vw, 3.4rem); }
  `,
})
export class HomePage {
  readonly latest = [...POSTS].sort((a, b) => b.date.localeCompare(a.date))[0];
  readonly grants = PRICES.grants;
  readonly kwh = signal(PRICES.usage.typicalHomeKwh);
  private home: HomeInputs = {
    houseType: 'semi', roofType: 'pitched', storeys: 2, taxpayers: 1, yearOccupied: 2000, occupancy: 'mixed', orientation: 'S',
    shading: 'none', roofAreaM2: 30, obstacles: { ...NO_OBSTACLES }, threePhase: false, addEv: false, addHeatPump: false,
  };
  readonly best = computed(() => {
    const u = { annualKwh: this.kwh(), profile: estimateProfile(this.kwh(), 'mixed'), source: 'estimate' as const };
    return pickStrategies(buildGrid(u, this.home, DEFAULT_ASSUMPTIONS))[1];
  });
  readonly june = computed(() => ({
    usage: estimateProfile(this.kwh(), 'mixed')[5],
    solar: solarDay(this.home, DEFAULT_ASSUMPTIONS, this.best().panels, 5),
  }));
  round50(n: number) { return Math.round(n / 50) * 50; }
}
