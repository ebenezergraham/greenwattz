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
      <p>The planner runs in your browser, and you do not need an account to use anything. We do not keep your quote files, their text, or your smart meter files. Here is everything we do keep:</p>
      <ul>
        <li><b>Anonymous quote details.</b> If you use the quote checker and press "Use these figures", the solar details of that quote (sizes, prices, what is included, the installer's name) are kept to build our price comparison. They are not linked to you.</li>
        <li><b>An optional account.</b> If you choose to sign in, we keep your email address, and only the plans and quote comparisons you choose to save to it. You can delete the account and everything in it yourself, at any time.</li>
        <li><b>A referral request,</b> only if you send one.</li>
      </ul>
      <p>The table below lists every place anything leaves your browser.</p>

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
            <tr><td>Referral request (name, email, county, plan summary)</td><td>Sent when you press the button, through the form service Web3Forms, which emails it to {{ site.contactEmail }}.</td><td><b>Only if you submit it</b>, to Web3Forms and then us</td></tr>
            <tr><td>A quote file you choose in the quote checker</td><td>The file is read in your browser. The file and its text are never uploaded. When you press "Use these figures", we send and store in our database (Google Cloud Firestore) only the solar specification (panels, watts, system and battery size), the price breakdown (the cost lines and amounts, and any SEAI grant), what the quote says is included, and the installer's name and website. We do not collect your name, address, email, phone number, Eircode or meter number, and we drop any line of the quote that contains one. We cannot link a stored quote to you.</td><td><b>Yes</b>, the solar details above, when you confirm what we read</td></tr>
            <tr><td>Your account: your email address and a sign-in record (only if you choose to sign in)</td><td>Kept by Google Firebase Authentication for us. We email you a one-time link, so we hold no password. Your browser keeps a sign-in token in its own storage while you are signed in.</td><td><b>Only if you sign in</b>, to Google Firebase</td></tr>
            <tr><td>Plans and quote comparisons you save to your account</td><td>Saved in our database (Google Cloud Firestore) under your account, and readable only when you are signed in to it. A save holds the answers and figures you entered. It never holds a quote file, the text of one, or meter readings.</td><td><b>Only if you press "Save to my account"</b></td></tr>
            <tr><td>Quotes you compare, and a plan you save as a file</td><td>Kept in the page while you use it. "Save as file" and "Save my plan" download a file to your device. We never receive it, and loading it later reads it in your browser. A saved plan file holds your answers but no meter readings.</td><td><b>No</b></td></tr>
            <tr><td>The "Buy me a coffee" link</td><td>A plain link. Nothing loads from Buy Me a Coffee until you click it, and then their privacy policy applies.</td><td><b>Only if you click</b></td></tr>
            <tr><td>Technical request data when a page loads: IP address, browser type, pages requested, time</td><td>Logged by our host, Google Firebase Hosting, to deliver and secure the site.</td><td><b>Yes</b>, to our host. Necessary for any website.</td></tr>
            <tr><td>Links to Trustpilot, Google Maps, SEAI, ESB Networks and installer websites</td><td>Nothing is sent when the page loads. If you click a link, that site sees your IP address and that you came from {{ site.domain }}.</td><td><b>Only if you click</b>. Their own privacy policies apply.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="small muted">Fonts and icons are served from our own site, so no font or icon provider receives your IP address. The ratings and SEAI register shown on the site were collected in advance. Your visit does not trigger a request to Trustpilot, Google or SEAI.</p>

      <h2>What we do not do</h2>
      <ul>
        <li>No advertising, analytics or tracking cookies or scripts.</li>
        <li>We do not keep your quote files, their text, or your meter files. Accounts are optional, and an account keeps only your email and what you choose to save. Quote details are kept only in anonymous form. Referral requests arrive as emails to us.</li>
        <li>We do not sell, rent or share your data.</li>
        <li>We do not send your details to installers unless you ask for a referral and agree to it in our conversation. If you want a quote, you contact them yourself.</li>
      </ul>

      <h2>Referrals</h2>
      <p>The person behind GreenWattz is a customer of PVGen and receives a reward from PVGen if someone they refer becomes a customer. This does not change your price, and we never ask you for money. If you choose to ask for a referral, you give your name, email, county and a summary of your plan, and tick a consent box. We use them only to contact you once about the referral. We pass your details to PVGen only if you say yes when we talk, and we delete your request within 30 days unless you ask us to keep it or the referral is in progress. Referral requests are not ranked or promoted differently from other installers.</p>

      <h2>Form service</h2>
      <p>Referral requests are sent through Web3Forms (web3forms.com), which receives the form and emails it to us. They act as our processor and may handle it outside the EEA. See their privacy policy for details. No other part of this site sends your answers anywhere.</p>

      <h2>Our host and database</h2>
      <p>The site is hosted by Google Firebase Hosting, and its sign-in and database are Google Firebase Authentication and Google Cloud Firestore. Google acts as our processor for the technical request data above, for accounts and for what is saved, and may process it in countries outside the EEA under its standard contractual safeguards. See Google's Firebase privacy information for details and retention.</p>

      <h2>Legal basis</h2>
      <p>For referral requests, your consent. For the anonymous solar details of quotes, our legitimate interest in building an accurate comparison of Irish solar prices. For an account and what you save to it, our contract with you to provide what you asked for. For hosting logs and keeping the site secure, our legitimate interest in running a safe website. Storing your cookie choice is strictly necessary.</p>

      <h2>Changes</h2>
      <p>If we add features that send data off your device, such as a map or address lookup, we will tell you first on the page where it happens, ask before it runs, and update this policy.</p>

      <h2>Your rights</h2>
      <p>Stored quote details are anonymous, so we cannot tell which one is yours and cannot look yours up. If you have an account, you can delete it and everything saved in it yourself on the account page, and you can download your plans and comparisons as files. Under the GDPR you can ask to access, correct or delete your data, object to processing, or withdraw consent by emailing us. You can complain to the Data Protection Commission at <a href="https://www.dataprotection.ie" target="_blank" rel="noopener">dataprotection.ie</a>.</p>

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
      <p>{{ site.name }} sets <b>no cookies</b> and runs no tracking, analytics or advertising scripts. We use your browser's local storage for your cookie choice and, only if you sign in, to keep you signed in:</p>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Purpose</th><th>Type</th><th>Kept</th></tr></thead>
          <tbody>
            <tr><td>greenwattz.consent.v1</td><td>Remembers your answer to the cookie notice.</td><td>Strictly necessary</td><td>Until you clear site data</td></tr>
            <tr><td>gw.account</td><td>A marker that this browser signed in before, so we restore your session. Not set unless you sign in.</td><td>Strictly necessary for the sign-in you asked for</td><td>Until you sign out</td></tr>
            <tr><td>gw.email</td><td>Your email address, kept for a few minutes between asking for a sign-in link and opening it.</td><td>Strictly necessary for the sign-in you asked for</td><td>Until you finish signing in</td></tr>
            <tr><td>Firebase sign-in token</td><td>Keeps you signed in. Stored by Google Firebase Authentication in your browser's storage. Not set unless you sign in.</td><td>Strictly necessary for the sign-in you asked for</td><td>Until you sign out</td></tr>
          </tbody>
        </table>
      </div>
      <p>Everything else you enter, such as roof details and electricity use, is held in the page's memory and disappears when you reload or close the tab. It is never written to cookies or local storage. If you sign in and press "Save to my account", what you save is stored in our database, not in your browser.</p>
      <p>Because each stored item is strictly necessary for something you asked for, none needs consent under the ePrivacy rules. If we add optional storage or tracking in future, we will ask first and update this page.</p>
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
