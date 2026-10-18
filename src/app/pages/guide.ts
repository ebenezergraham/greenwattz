import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'page-guide',
  imports: [RouterLink],
  template: `
    <div class="narrow page">
      <h1>Get your ESB smart meter data</h1>
      <p class="lead">A 30-minute readings file shows exactly when you use electricity. It takes about five minutes, plus a wait the first time.</p>

      <div class="notice"><i class="ph ph-clock"></i><span>You need a smart meter and to be the registered account holder. After you register, data can take 36 to 48 hours to appear.</span></div>

      <ol class="steps">
        <li><h3>Find your MPRN</h3><p>It is the 11-digit number on your electricity bill, labelled MPRN.</p></li>
        <li><h3>Register with ESB Networks</h3><p>Go to the <a href="https://www.esbnetworks.ie/existing-connections/meters-and-readings/my-smart-data" target="_blank" rel="noopener">My Smart Data</a> page and create an online account using your MPRN and the details on your bill.</p></li>
        <li><h3>Sign in and open your usage</h3><p>Choose the option to download your data. ESB keeps up to two years of readings.</p></li>
        <li><h3>Download the 30-minute readings in kWh</h3><p>Pick the CSV labelled "30-minute readings in kWh". If only kW is offered, that also works: we convert it for you.</p></li>
        <li><h3>Upload it here</h3><p>Open the planner, choose "Upload meter data" and select the file. It is read inside your browser and never uploaded.</p></li>
      </ol>

      <div class="card">
        <h3>What the file looks like</h3>
        <p class="muted small">Each row is one half hour. We only use rows marked as import.</p>
        <pre>MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time
10000000000,000000000,0.214,Active Import Interval (kWh),01-03-2026 00:30
10000000000,000000000,0.187,Active Import Interval (kWh),01-03-2026 01:00</pre>
      </div>

      <h2>Common problems</h2>
      <dl class="faq">
        <dt>Which file should I download?</dt><dd>The "30-minute readings in kWh" file is best because it shows each hour. We also read the "daily" file with Night, Day Peak and Day Off-Peak totals. It gives accurate night, day and peak shares but not the hour-by-hour detail, so we estimate how use spreads within each band.</dd>
                <dt>Switching supplier soon?</dt><dd>Download your file first. Recent switches can make earlier data harder to get.</dd>
        <dt>No smart meter?</dt><dd>Use the "I know my kWh" or "Use my bill" options in the planner. Results are less precise about timing.</dd>
        <dt>The file has export rows?</dt><dd>You may already have solar or a microgeneration meter. We read the import rows only and assume no existing panels.</dd>
      </dl>

      <a class="btn primary" routerLink="/plan">Go to the planner</a>
    </div>
  `,
  styles: `
    .page { padding: 48px 0 0; display: grid; gap: 28px; }
    .lead { font-size: 1.15rem; color: var(--ink-2); }
    .steps { margin: 0; padding: 0; list-style: none; counter-reset: s; display: grid; gap: 0; }
    .steps li { counter-increment: s; position: relative; padding: 0 0 28px 56px; border-left: 0; }
    .steps li::before { content: counter(s); position: absolute; left: 0; top: 0; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: var(--sun); color: var(--on-sun); font-weight: 650; }
    .steps li::after { content: ''; position: absolute; left: 18px; top: 44px; bottom: 6px; width: 2px; background: var(--line); }
    .steps li:last-child::after { display: none; }
    .steps p { color: var(--ink-2); margin-top: 4px; }
    pre { overflow-x: auto; background: var(--surface-2); padding: 14px; border-radius: var(--r-ctl); font-size: 0.8rem; margin: 12px 0 0; }
    .faq dt { font-weight: 650; margin-top: 18px; } .faq dd { margin: 4px 0 0; color: var(--ink-2); }
  `,
})
export class GuidePage {}
