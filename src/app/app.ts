import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SITE } from './core/site';

const KEY = 'greenwattz.consent.v1';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a class="skip" href="#main">Skip to content</a>
    <header class="nav">
      <div class="wrap bar">
        <a routerLink="/" class="brand" aria-label="GreenWattz home">
          <img src="favicon.svg" alt="" width="30" height="30" />
          <span>GreenWattz</span>
        </a>
        <nav aria-label="Main">
          <a routerLink="/plan" routerLinkActive="on">Plan</a>
          <a routerLink="/guide/esb-data" routerLinkActive="on">Meter data</a>
          <a routerLink="/reviews" routerLinkActive="on">Reviews</a>
          <a routerLink="/quote" routerLinkActive="on">Get quotes</a>
        </nav>
        <a routerLink="/plan" class="btn primary sm">Start planning</a>
      </div>
    </header>
    <main id="main"><router-outlet /></main>
    <footer>
      <div class="wrap foot">
        <div>
          <b>GreenWattz</b>
          <p class="muted small">Independent solar planning for Irish homes. Everything is calculated in your browser. Your data never leaves your device.</p>
        </div>
        <div class="links">
          <a routerLink="/privacy">Privacy policy</a>
          <a routerLink="/cookies">Cookie policy</a>
          <a routerLink="/guide/esb-data">How to get your ESB data</a>
          <a routerLink="/seai-installers">SEAI registered installers</a>
          <button class="linklike" type="button" (click)="reopen()">Cookie settings</button>
        </div>
      </div>
      <div class="wrap small muted legal">
        Estimates only, not a quotation or financial advice. Grant and tariff figures change, so check
        <a href="https://www.seai.ie/grants/home-energy-grants/individual-grants/solar-electricity-grant" target="_blank" rel="noopener">SEAI</a> and your supplier before you decide.
      </div>
    </footer>

    @if (bannerOpen()) {
      <div class="cookie-banner" role="dialog" aria-labelledby="cb-t" aria-modal="false">
        <div>
          <b id="cb-t">Cookies and storage</b>
          <p class="small">
            GreenWattz sets no tracking or advertising cookies. We only remember this choice
            on this device. <a routerLink="/cookies">Read the cookie policy</a>.
          </p>
        </div>
        <div class="acts">
          <button class="btn primary sm" type="button" (click)="save(true)">Okay</button>
          <button class="btn sm" type="button" (click)="save(false)">Essential only</button>
        </div>
      </div>
    }
  `,
  styles: `
    .skip { position: absolute; left: -999px; top: 8px; background: var(--accent); color: var(--accent-ink); padding: 10px 14px; border-radius: var(--r-ctl); z-index: 60; }
    .skip:focus { left: 8px; }
    .nav { position: sticky; top: 0; z-index: var(--z-nav); background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(14px); border-bottom: 1px solid var(--line); }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 68px; }
    .brand { display: flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; font-weight: 700; font-size: 1.15rem; letter-spacing: -0.03em; }
    .brand img { border-radius: 8px; }
    nav { display: flex; gap: 4px; }
    nav a { color: var(--ink-2); text-decoration: none; padding: 8px 14px; border-radius: var(--r-ctl); font-weight: 550; }
    nav a:hover, nav a.on { color: var(--ink); background: var(--surface-2); }
    @media (max-width: 760px) { nav { display: none; } }
    main { min-height: 70dvh; }
    footer { margin-top: 96px; border-top: 1px solid var(--line); padding: 40px 0 32px; }
    .foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 32px; }
    .foot p { max-width: 46ch; margin-top: 8px; }
    .links { display: grid; gap: 8px; justify-items: start; }
    .links a { color: var(--ink-2); }
    .linklike { background: none; border: 0; padding: 0; font: inherit; color: var(--ink-2); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
    .legal { margin-top: 28px; max-width: 80ch; }
    .cookie-banner { position: fixed; z-index: var(--z-banner); left: 16px; right: 16px; bottom: 16px; max-width: 760px; margin-inline: auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 20px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-surf); box-shadow: var(--shadow); }
    .cookie-banner p { margin-top: 4px; color: var(--ink-2); max-width: 54ch; }
    .acts { display: flex; gap: 8px; }
  `,
})
export class App {
  readonly bannerOpen = signal(!this.read());
  private read(): string | null {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }
  save(all: boolean) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, choice: all ? 'ok' : 'essential', at: new Date().toISOString() })); } catch { /* storage blocked */ }
    this.bannerOpen.set(false);
  }
  reopen() { this.bannerOpen.set(true); }
  readonly site = SITE;
}
