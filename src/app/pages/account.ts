import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Account } from '../core/account';
import { PlanStore } from '../core/store';
import { QuotesState } from '../core/quotes-state';
import { planFromFile } from '../core/plan-file';
import { applyPlan } from '../core/plan-apply';
import { quotesFromFile } from '../core/quote-compare';
import { kindLabel } from '../core/saves';
import type { RemoteSave } from '../core/firebase-sdk';

@Component({
  selector: 'page-account',
  imports: [RouterLink, DatePipe],
  template: `
    <div class="wrap page">
      <h1>Your account</h1>
      <p class="lead">An account is optional. Sign in to save your plans and quote comparisons and open them on any device. Everything works without one.</p>

      @if (!a.enabled) {
        <p class="hint">Accounts are not switched on yet.</p>
      } @else if (!a.ready()) {
        <p class="hint" role="status">Checking your sign-in.</p>
      } @else if (a.user(); as u) {
        <section class="block" aria-labelledby="saved-h">
          <p class="who">Signed in as <b>{{ u.email }}</b> <button class="linklike" type="button" (click)="a.signOut()">Sign out</button></p>
          <h2 id="saved-h">Saved items</h2>
          @if (a.saves().length) {
            <ul class="saves">
              @for (s of a.saves(); track s.id) {
                <li>
                  <div class="nm"><b>{{ s.name }}</b><span class="muted small">{{ label(s.kind) }}{{ s.updated ? ', saved ' + (s.updated | date: 'd MMM y') : '' }}</span></div>
                  <div class="acts">
                    <button class="btn sm" type="button" (click)="open(s)">Open</button>
                    <button class="btn ghost sm" type="button" (click)="a.remove(s.id)" [disabled]="a.busy()" [attr.aria-label]="'Delete ' + s.name">Delete</button>
                  </div>
                </li>
              }
            </ul>
          } @else {
            <p class="hint">Nothing saved yet. Use "Save to my account" on the <a routerLink="/plan?step=plan">planner</a> or the <a routerLink="/compare-quotes">quote comparison</a>.</p>
          }
          @if (opened()) { <p class="hint" role="status">{{ opened() }}</p> }
          @if (a.error()) { <p class="err" role="alert"><i class="ph ph-warning-circle" aria-hidden="true"></i><span>{{ a.error() }}</span></p> }

          <h2>What we keep</h2>
          <p>Your email address, and the plans and quote comparisons you choose to save. A save holds your answers and figures only. We never keep your quote files, their text, or your meter readings.</p>

          <h2>Delete your account</h2>
          @if (!confirming()) {
            <button class="btn" type="button" (click)="confirming.set(true)">Delete my account and saved items</button>
          } @else {
            <p class="warn" role="alert">This permanently deletes your sign-in and every saved item. It cannot be undone.</p>
            <div class="acts">
              <button class="btn primary" type="button" (click)="deleteAll()" [disabled]="a.busy()">Yes, delete everything</button>
              <button class="btn ghost" type="button" (click)="confirming.set(false)">Keep my account</button>
            </div>
          }
        </section>
      } @else {
        <section class="block" aria-labelledby="in-h">
          <h2 id="in-h">Sign in with your email</h2>
          @if (a.needEmail()) {
            <p>Enter the email address you used, to finish signing in.</p>
            <form class="row" (submit)="confirm($event)">
              <label for="ce" class="sr">Email address</label>
              <input id="ce" type="email" autocomplete="email" required [value]="email()" (input)="email.set($any($event.target).value)" />
              <button class="btn primary" type="submit" [disabled]="a.busy()">Finish signing in</button>
            </form>
          } @else if (a.linkSentTo()) {
            <p class="ok" role="status"><i class="ph-fill ph-check-circle"></i> We emailed a sign-in link to <b>{{ a.linkSentTo() }}</b>. Open it on this device to finish. It can take a minute, and check your spam folder.</p>
            <button class="linklike" type="button" (click)="a.linkSentTo.set('')">Use a different email</button>
          } @else {
            <p>We email you a one-time link, so there is no password to remember or lose. We use your address only to sign you in.</p>
            <form class="row" (submit)="send($event)">
              <label for="em" class="sr">Email address</label>
              <input id="em" type="email" autocomplete="email" required placeholder="you@example.com" [value]="email()" (input)="email.set($any($event.target).value)" />
              <button class="btn primary" type="submit" [disabled]="a.busy()">{{ a.busy() ? 'Sending' : 'Email me a sign-in link' }}</button>
            </form>
          }
          @if (a.error()) { <p class="err" role="alert"><i class="ph ph-warning-circle" aria-hidden="true"></i><span>{{ a.error() }}</span></p> }
          <h2>What we keep</h2>
          <p>If you sign in, your email address and the plans and quote comparisons you choose to save. We never keep your quote files or meter readings, and the anonymous details of a quote you check help our price comparison but are not linked to you. You can delete your account and everything in it at any time. <a routerLink="/privacy">Privacy policy</a>.</p>
        </section>
      }
    </div>
  `,
  styles: `
    .page { padding: 48px 0 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; max-width: 760px; }
    .lead { font-size: 1.1rem; color: var(--ink-2); max-width: 62ch; }
    .block { display: grid; gap: 12px; }
    .block h2 { font-size: 1.25rem; margin: 14px 0 0; }
    .who { margin: 0; }
    .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; input { flex: 1; min-width: 240px; } }
    .saves { list-style: none; margin: 0; padding: 0; display: grid; }
    .saves li { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; padding: 12px 0; border-top: 1px solid var(--line); }
    .saves li:last-child { border-bottom: 1px solid var(--line); }
    .nm { display: grid; gap: 2px; min-width: 0; b { overflow-wrap: anywhere; } }
    .acts { display: flex; gap: 8px; flex-wrap: wrap; }
    .err { display: flex; gap: 8px; color: var(--bad); font-weight: 600; }
    .ok { color: var(--ink); font-weight: 600; i { color: var(--link); } }
    .warn { color: var(--bad); font-weight: 600; }
    .linklike { background: none; border: 0; padding: 0; font: inherit; color: var(--link); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  `,
})
export class AccountPage {
  readonly a = inject(Account);
  private store = inject(PlanStore);
  private quotes = inject(QuotesState);
  private router = inject(Router);
  readonly email = signal('');
  readonly confirming = signal(false);
  readonly opened = signal('');
  readonly label = kindLabel;

  constructor() {
    void this.a.handleReturn();
  }

  send(ev: Event) { ev.preventDefault(); void this.a.sendLink(this.email()); }
  confirm(ev: Event) { ev.preventDefault(); void this.a.confirmEmail(this.email()); }

  async deleteAll() {
    await this.a.deleteAccount();
    if (!this.a.user()) { this.confirming.set(false); this.opened.set('Your account and saved items were deleted.'); }
  }

  /** Put a saved plan into the planner, or a saved comparison into the quote comparison, and go there. */
  open(s: RemoteSave) {
    this.a.error.set('');
    try {
      if (s.kind === 'plan') {
        applyPlan(this.store, planFromFile(s.dataJson));
        void this.router.navigate(['/plan'], { queryParams: { step: 'plan' } });
      } else {
        const list = quotesFromFile(s.dataJson);
        this.quotes.entries.set(list.map((e, i) => ({ ...e, id: `s${Date.now().toString(36)}${i}` })));
        void this.router.navigate(['/compare-quotes']);
      }
    } catch (e) {
      this.a.error.set(e instanceof Error ? e.message : 'We could not open that.');
    }
  }
}
