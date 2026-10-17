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
      <p>The solar planner runs entirely in your browser. What you type, and any smart meter file you choose, is processed on your device and is not sent to us or anyone else.</p>

      <h2>Who we are</h2>
      <p>{{ site.name }} ({{ site.domain }}) is operated by {{ site.operator }}. Contact: <a [href]="'mailto:' + site.contactEmail">{{ site.contactEmail }}</a>.</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Planner inputs and meter files:</b> processed in memory in your browser only. Closing or reloading the page clears them. We do not receive them.</li>
        <li><b>Installer ratings:</b> the ratings pages show scores from Trustpilot and Google that we collected in advance. Your browser does not contact Trustpilot or Google until you click a link to them, and their own privacy policies apply from then on.</li>
        <li><b>Introduction requests:</b> if you choose to request an introduction to an existing customer of an installer, the form opens an email in your own email app containing the details you entered. We receive it only if you send it. We use it to arrange the introduction and delete it afterwards unless you ask us to keep it.</li>
        <li><b>Hosting logs:</b> our host, Google Firebase Hosting, processes technical data such as IP address and user agent to deliver and secure the site. See Google's Firebase privacy information.</li>
      </ul>

      <h2>Legal basis</h2>
      <p>For introduction requests we rely on your consent, which you give by ticking the box and sending the email. For hosting security we rely on our legitimate interest in running a secure website.</p>

      <h2>Sharing</h2>
      <p>We do not sell personal data and do not use advertising or analytics trackers. If you ask for an introduction to an existing customer of an installer, we pass your name and county to that customer for that purpose only, and the installer will receive your details if you proceed.</p>

      <h2>Your rights</h2>
      <p>Under the GDPR you can ask to access, correct or delete your data, object to processing, or withdraw consent at any time by emailing us. You can complain to the Data Protection Commission at <a href="https://www.dataprotection.ie" target="_blank" rel="noopener">dataprotection.ie</a>.</p>

      <h2>Cookies</h2>
      <p>See our <a routerLink="/cookies">cookie policy</a>.</p>
    </article>
  `,
  styles: `.doc { padding: 48px 0 0; display: grid; gap: 14px; } h2 { margin-top: 24px; font-size: 1.4rem; } ul { padding-left: 20px; display: grid; gap: 10px; }`,
})
export class PrivacyPage { readonly site = SITE; }

@Component({
  selector: 'page-cookies',
  imports: [RouterLink],
  template: `
    <article class="narrow doc">
      <h1>Cookie policy</h1>
      <p class="muted">Last updated {{ site.lastUpdated }}.</p>
      <p>GreenWattz sets <b>no tracking, analytics or advertising cookies</b>. We use your browser's local storage for one small thing only:</p>
      <table>
        <thead><tr><th>Name</th><th>Purpose</th><th>Type</th><th>Kept</th></tr></thead>
        <tbody>
          <tr><td>greenwattz.consent.v1</td><td>Remembers your answer to the cookie notice.</td><td>Strictly necessary</td><td>Until you clear site data</td></tr>
        </tbody>
      </table>
      <p>Because these are strictly necessary or requested by you, they do not need consent under the ePrivacy rules. If we add analytics or other optional storage in future, we will ask first and update this page.</p>
      <p>You can remove stored items any time through your browser settings, or change your notice choice with "Cookie settings" in the footer. Fonts and icons are served from our own site, so no third party receives your IP address when you load a page, apart from our hosting provider.</p>
      <p>See also the <a routerLink="/privacy">privacy policy</a>.</p>
    </article>
  `,
  styles: `
    .doc { padding: 48px 0 0; display: grid; gap: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.92rem; display: block; overflow-x: auto; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  `,
})
export class CookiesPage { readonly site = SITE; }
