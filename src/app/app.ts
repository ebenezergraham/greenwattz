import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { SITE } from './core/site';

const KEY = 'greenwattz.consent.v1';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a class="skip" href="#main">Skip to content</a>
    <header class="nav field-brand">
      <div class="wrap bar">
        <a routerLink="/" class="brand" aria-label="GreenWattz home">
          <svg class="mark" viewBox="0 0 44 28" width="34" height="22" aria-hidden="true" focusable="false">
            <path d="M8 21a14 14 0 0 1 28 0Z" fill="var(--sun)" />
            <rect x="1" y="21" width="42" height="4" rx="2" fill="currentColor" />
          </svg>
          <span>GreenWattz</span>
        </a>
        <nav aria-label="Main">
          <a routerLink="/plan" routerLinkActive="on">Plan</a>
          <a routerLink="/reviews" routerLinkActive="on">Reviews</a>
          <a routerLink="/quote" routerLinkActive="on">Get quotes</a>
          <a routerLink="/check-quote" routerLinkActive="on">Check a quote</a>
          <a routerLink="/blog" routerLinkActive="on">Guides</a>
          <a routerLink="/glossary" routerLinkActive="on">Glossary</a>
        </nav>
        <div class="right">
          @if (!onPlan()) { <a routerLink="/plan" class="btn primary sm">Start planning</a> }
          <details class="menu" #m>
            <summary aria-label="Open menu">Menu</summary>
            <nav aria-label="Mobile" (click)="m.open = false">
              <a routerLink="/plan">Plan</a>
              <a routerLink="/reviews">Reviews</a>
              <a routerLink="/quote">Get quotes</a>
              <a routerLink="/check-quote">Check a quote</a>
              <a routerLink="/blog">Guides</a>
              <a routerLink="/glossary">Glossary</a>
              <a routerLink="/guide/esb-data">Meter data</a>
            </nav>
          </details>
        </div>
      </div>
    </header>
    <main id="main"><router-outlet /></main>
    <footer class="field-brand">
      <div class="wrap foot">
        <div class="about">
          <span class="display word">GreenWattz</span>
          <p>Independent solar planning for Irish homes. Everything is calculated in your browser, and your answers are not sent to us unless you ask for a referral.</p>
        </div>
        <div class="cols">
          <div class="links">
            <b>Learn</b>
            <a routerLink="/blog">Guides</a>
            <a routerLink="/check-quote">Check a solar quote</a>
            <a routerLink="/glossary">Glossary</a>
            <a routerLink="/estimates">How we estimate</a>
            <a routerLink="/guide/esb-data">Get your ESB data</a>
          </div>
          <div class="links">
            <b>Trust</b>
            <a routerLink="/seai-installers">SEAI registered installers</a>
            <a routerLink="/privacy">Privacy policy</a>
            <a routerLink="/cookies">Cookie policy</a>
            <button class="linklike" type="button" (click)="reopen()">Cookie settings</button>
            @if (site.supportUrl) { <a [href]="site.supportUrl" target="_blank" rel="noopener noreferrer">Buy me a coffee</a> }
          </div>
        </div>
      </div>
      <div class="wrap small legal">
        Estimates only, not a quotation or financial advice. Grant and tariff figures change, so check
        <a href="https://www.seai.ie/grants/home-energy-grants/individual-grants/solar-electricity-grant" target="_blank" rel="noopener noreferrer">SEAI</a> and your supplier before you decide.
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
    .skip { position: absolute; left: -999px; top: 8px; background: var(--sun); color: var(--on-sun); padding: 10px 16px; border-radius: var(--r-pill); font-weight: 650; z-index: 60; }
    .skip:focus { left: 8px; }
    .nav { position: sticky; top: 0; z-index: var(--z-nav); border-bottom: 1px solid var(--line); }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 68px; }
    .brand { display: flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; }
    .brand span { font-family: var(--display); font-weight: 800; font-stretch: 78%; font-size: 1.65rem; letter-spacing: -0.005em; line-height: 1; }
    nav { display: flex; gap: 2px; }
    nav a { color: var(--ink-2); text-decoration: none; padding: 8px 14px; border-radius: var(--r-pill); font-weight: 600; font-size: 0.95rem; }
    nav a:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 10%, transparent); }
    nav a.on { color: var(--ink); box-shadow: inset 0 -2px 0 var(--sun); border-radius: 0; padding-bottom: 6px; }
    .right { display: flex; align-items: center; gap: 10px; }
    .menu { display: none; position: relative; }
    .menu summary { list-style: none; cursor: pointer; min-height: 40px; padding: 0 16px; display: inline-flex; align-items: center; border: 1.5px solid var(--ink-3); border-radius: var(--r-pill); font-weight: 650; font-size: 0.9rem; }
    .menu summary::-webkit-details-marker { display: none; }
    .menu nav { display: grid; position: absolute; right: 0; top: calc(100% + 8px); min-width: 210px; padding: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-surf); box-shadow: var(--shadow); z-index: var(--z-nav); }
    .menu nav a { padding: 12px 14px; border-radius: 10px; }
    .menu nav a:hover { background: var(--surface-2); }
    @media (max-width: 760px) { header nav[aria-label='Main'] { display: none; } .menu { display: block; } .right .btn { display: none; } }
    main { min-height: 70dvh; padding-bottom: 96px; }
    footer { padding: 56px 0 32px; }
    .foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 40px; }
    .about { max-width: 44ch; }
    .word { font-size: 2.4rem; display: block; }
    .about p { margin-top: 12px; color: var(--ink-2); }
    .cols { display: flex; gap: 56px; flex-wrap: wrap; }
    .links { display: grid; gap: 10px; justify-items: start; align-content: start; }
    .links b { font-size: 0.82rem; font-weight: 650; color: var(--ink-3); letter-spacing: 0.02em; }
    .links a, .linklike { color: var(--ink); text-underline-offset: 3px; }
    .linklike { background: none; border: 0; padding: 0; font: inherit; text-decoration: underline; cursor: pointer; }
    .legal { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--line); max-width: 90ch; color: var(--ink-2); }
    .cookie-banner { position: fixed; z-index: var(--z-banner); left: 16px; right: 16px; bottom: 16px; max-width: 760px; margin-inline: auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 20px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-surf); box-shadow: var(--shadow); }
    .cookie-banner p { margin-top: 4px; color: var(--ink-2); max-width: 54ch; }
    .acts { display: flex; gap: 8px; }
  `,
})
export class App {
  private router = inject(Router);
  readonly onPlan = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url.startsWith('/plan')), startWith(this.router.url.startsWith('/plan'))),
    { initialValue: false },
  );
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
