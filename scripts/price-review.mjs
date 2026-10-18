// Prints a GitHub issue body when the prices in src/app/data/prices.json are due for review. Exit codes: 0 due, 10 not due yet.
// The workflow runs monthly and opens one issue, so prices cannot quietly go stale.
import { readFileSync } from 'node:fs';

const p = JSON.parse(readFileSync(new URL('../src/app/data/prices.json', import.meta.url), 'utf8'));
const age = Math.floor((Date.now() - new Date(p.reviewedOn + 'T00:00:00Z').getTime()) / 86400000);
const warnAt = p.reviewEveryDays - 10; // remind ten days before the site starts warning visitors
if (age < warnAt) { console.error(`Prices reviewed ${age} days ago. Not due until ${warnAt} days.`); process.exit(10); }

const sources = p.sources.map((s) => `- [${s.label}](${s.url}) (${s.what})`).join('\n');
console.log(`Prices were last reviewed on **${p.reviewedOn}** (${age} days ago). The site starts warning visitors that they may be out of date after ${p.reviewEveryDays} days.

## Do this
1. Open each source below and compare it with \`src/app/data/prices.json\`: installed solar cost, battery prices by tier and size, grant amounts, typical rates.
2. Check the SEAI solar and battery grant pages for changes to amounts, cut-off years or eligibility. If so, set \`grants.seaiBatteryConfirmed\` to true and decide whether to default it on.
3. Update the values, then set \`reviewedOn\` to today's date.
4. Run \`npm test\` (it checks the numbers stay sensible), then push to main to deploy.

## Sources
${sources}

## Also check
- New battery brands or sizes that installers now fit (update \`src/app/data/battery-products.json\` and \`batterySpec.sizes\`).
- Whether any installer's published prices have moved by more than 10 percent.
`);
