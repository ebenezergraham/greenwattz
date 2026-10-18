import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE } from '../core/site';

@Component({
  selector: 'page-privacy',
  imports: [RouterLink],
  template: `
    <article class="narrow doc">
      <h1>Privacy policy</h1>
      <p class="muted">Last updated {{ site.lastUpdated }}. This is a plain-language draft; have it reviewed before launch.</p>

      <h2>The short version</h2>
      <p>The planner runs in your browser. What you enter, and any smart meter file you choose, is worked out on your device. We have no database and no server that receives it. The only things that leave your browser are listed in the table below.</p>

      <h2>Who we are</h2>
      <p>{{ site.name }} ({{ site.domain }}) is operated by {{ site.operator }}. Contact: <a [href]="'mailto:' + site.contactEmail">{{ site.contactEmail }}</a>.</p>

      <h2>What stays on your device and what leaves it</h2>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Information</th><th>Where it lives</th><th>Leaves your browser?</th></tr></thead>
          <tbody>
            <tr><td>Home details: roof direction, shade, roof area, who is home, planned EV or heat pump</td><td>In the page's memory while you use it. Cleared when you reload or close the tab.</td><td><b>No</b></td></tr>
            <tr><td>Your electricity use: yearly kWh, bill, or smart meter file</td><td>The file is read by your browser. Only summary figures are kept in memory. The file itself is never uploaded or stored.</td><td><b>No</b></td></tr>
            <tr><td>Your results, chosen system, assumptions and installer shortlist</td><td>In the page's memory. Cleared on reload.</td><td><b>No</b></td></tr>
            <tr><td>Your cookie notice choice</td><td>Your browser's local storage on this device.</td><td><b>No</b></td></tr>
            <tr><td>"Copy plan summary" and "Save as PDF"</td><td>Your clipboard or a file you save. We do not see them.</td><td><b>No</b>, unless you paste or send it somewhere</td></tr>
            <tr><td>Introduction request (name, county, plan summary)</td><td>Opens a draft email in your own email app. Nothing is sent until you press send.</td><td><b>Only if you send it</b>, to {{ site.contactEmail }}</td></tr>
            <tr><td>Technical request data when a page loads: IP address, browser type, pages requested, time</td><td>Logged by our host, Google Firebase Hosting, to deliver and secure the site.</td><td><b>Yes</b>, to our host. Necessary for any website.</td></tr>
            <tr><td>Links to Trustpilot, Google Maps, SEAI, ESB Networks and installer websites</td><td>Nothing is sent when the page loads. If you click a link, that site sees your IP address and that you came from {{ site.domain }}.</td><td><b>Only if you click</b>. Their own privacy policies apply.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="small muted">Fonts and icons are served from our own site, so no font or icon provider receives your IP address. The ratings and SEAI register shown on the site were collected in advance. Your visit does not trigger a request to Trustpilot, Google or SEAI.</p>

      <h2>What we do not do</h2>
      <ul>
        <li>No advertising, analytics or tracking cookies or scripts.</li>
        <li>No accounts, and no database of visitors or their plans.</li>
        <li>We do not sell, rent or share your data.</li>
        <li>We do not send your details to installers. If you want a quote, you contact them yourself.</li>
      </ul>

      <h2>Introductions to existing customers</h2>
      <p>If you ask for an introduction to an existing customer of an installer, you choose to send us an email with your name, county and plan summary. We use it only to arrange that introduction, pass your name and county to that customer, and delete the email afterwards unless you ask us to keep it. The installer will receive your details if you go ahead. We rely on your consent, which you can withdraw at any time by emailing us.</p>

      <h2>Our host</h2>
      <p>The site is hosted by Google Firebase Hosting. Google acts as our processor for the technical request data above and may process it in countries outside the EEA under its standard contractual safeguards. See Google's Firebase privacy information for details and retention.</p>

      <h2>Legal basis</h2>
      <p>For introduction requests, your consent. For hosting logs and keeping the site secure, our legitimate interest in running a safe website. Storing your cookie choice is strictly necessary.</p>

      <h2>Changes</h2>
      <p>If we add features that send data off your device, such as a map or address lookup, we will tell you first on the page where it happens, ask before it runs, and update this policy.</p>

      <h2>Your rights</h2>
      <p>Under the GDPR you can ask to access, correct or delete your data, object to processing, or withdraw consent by emailing us. You can complain to the Data Protection Commission at <a href="https://www.dataprotection.ie" target="_blank" rel="noopener">dataprotection.ie</a>.</p>

      <h2>Cookies</h2>
      <p>See our <a routerLink="/cookies">cookie policy</a>.</p>
    </article>
  `,
  styles: `
    .doc { padding: 48px 0 0; display: grid; gap: 14px; }
    h2 { margin-top: 24px; font-size: 1.4rem; }
    ul { padding-left: 20px; display: grid; gap: 10px; margin: 0; }
    .tablewrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--r-ctl); }
    table { width: 100%; min-width: 640px; border-collapse: collapse; font-size: 0.92rem; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
    tr:last-child td { border-bottom: 0; }
    th { background: var(--surface-2); }
  `,
})
export class PrivacyPage { readonly site = SITE; }

@Component({
  selector: 'page-cookies',
  imports: [RouterLink],
  template: `
    <article class="narrow doc">
      <h1>Cookie policy</h1>
      <p class="muted">Last updated {{ site.lastUpdated }}.</p>
      <p>{{ site.name }} sets <b>no cookies</b> and runs no tracking, analytics or advertising scripts. We use your browser's local storage for one small thing only:</p>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Purpose</th><th>Type</th><th>Kept</th></tr></thead>
          <tbody>
            <tr><td>greenwattz.consent.v1</td><td>Remembers your answer to the cookie notice.</td><td>Strictly necessary</td><td>Until you clear site data</td></tr>
          </tbody>
        </table>
      </div>
      <p>Everything else you enter, such as roof details and electricity use, is held in the page's memory and disappears when you reload or close the tab. It is never written to cookies or local storage.</p>
      <p>Because the one stored item is strictly necessary, it does not need consent under the ePrivacy rules. If we add optional storage or tracking in future, we will ask first and update this page.</p>
      <p>You can remove stored items any time in your browser settings, or change your notice choice with "Cookie settings" in the footer. Sites you reach through our links, such as Trustpilot or Google Maps, set their own cookies under their own policies once you open them.</p>
      <p>See also the <a routerLink="/privacy">privacy policy</a>, which lists exactly what leaves your browser.</p>
    </article>
  `,
  styles: `
    .doc { padding: 48px 0 0; display: grid; gap: 16px; }
    .tablewrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--r-ctl); }
    table { width: 100%; min-width: 560px; border-collapse: collapse; font-size: 0.92rem; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
    tr:last-child td { border-bottom: 0; }
    th { background: var(--surface-2); }
  `,
})
export class CookiesPage { readonly site = SITE; }
