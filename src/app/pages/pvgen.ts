import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE } from '../core/site';

@Component({
  selector: 'page-pvgen',
  imports: [RouterLink],
  template: `
    <div class="narrow page">
      <h1>Considering PVGen?</h1>
      <p class="lead">If you decide on PVGen, an existing PVGen customer can introduce you through the company's own referral process.</p>

      <div class="notice"><i class="ph ph-handshake"></i><span><b>Disclosure.</b> The person behind GreenWattz is a PVGen customer and may receive a benefit from PVGen if someone they introduce becomes a customer. GreenWattz is otherwise independent and PVGen does not pay for placement or reviews.</span></div>

      <div class="card">
        <h3>How an introduction works</h3>
        <ol>
          <li>You finish your plan and decide PVGen is worth a quote.</li>
          <li>You tell us you would like an introduction below. This opens an email from you to us. Nothing is sent until you press send in your email app.</li>
          <li>We put you in touch with an existing customer, who can submit your details through PVGen's own referral channel.</li>
          <li>PVGen quotes you directly. You are under no obligation, and you should still compare other installers.</li>
        </ol>
        <p class="small muted">Referral terms are set by PVGen and can change. Check their current terms for what, if anything, either party receives. We never ask you for money, gifts or donations in exchange for an introduction, and nobody should.</p>
      </div>

      <form class="card form" (submit)="send($event)">
        <h3>Request an introduction</h3>
        <div class="field"><label for="n">Your name</label><input id="n" name="name" type="text" required autocomplete="name" /></div>
        <div class="field"><label for="c">County</label><input id="c" name="county" type="text" required autocomplete="address-level1" /></div>
        <div class="field"><label for="m">Anything you would like us to know (optional)</label><textarea id="m" name="msg"></textarea><span class="hint">For example your planned system size from the GreenWattz planner.</span></div>
        <label class="check"><input type="checkbox" name="consent" required /><span>I agree that the details I enter are put into an email to {{ site.contactEmail }} so someone can arrange an introduction. See the <a routerLink="/privacy">privacy policy</a>.</span></label>
        @if (err()) { <p class="err" role="alert">{{ err() }}</p> }
        <button class="btn primary" type="submit">Open email to request</button>
        <p class="small muted">Your email address is shared only when you send the email yourself.</p>
      </form>
    </div>
  `,
  styles: `
    .page { padding: 48px 0 0; display: grid; gap: 24px; }
    .lead { font-size: 1.15rem; color: var(--ink-2); }
    ol { padding-left: 20px; margin: 12px 0; display: grid; gap: 8px; }
    .form { display: grid; gap: 20px; }
    .err { color: var(--bad); font-weight: 600; }
  `,
})
export class PvgenPage {
  readonly site = SITE;
  readonly err = signal('');
  send(e: Event) {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    const name = String(f.get('name') || '').trim(), county = String(f.get('county') || '').trim();
    if (!name || !county || !f.get('consent')) { this.err.set('Please fill in your name and county and tick the consent box.'); return; }
    this.err.set('');
    const body = `Hi,\n\nI would like an introduction to an existing PVGen customer.\n\nName: ${name}\nCounty: ${county}\n${String(f.get('msg') || '').trim()}\n`;
    location.href = `mailto:${SITE.contactEmail}?subject=${encodeURIComponent('PVGen introduction request')}&body=${encodeURIComponent(body)}`;
  }
}
