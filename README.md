# GreenWattz

Angular 22 solar planner for Irish homes. 100% client-side: no backend, no data sent anywhere.

- `src/app/core/engine.ts` calculation engine (usage split, sizing, battery, cost, SEAI grant, payback). All prices are editable assumptions.
- `src/app/core/hdf.ts` ESB Networks HDF CSV parser (runs in the browser).
- `src/app/core/site.ts` operator details, contact email, installer seed list. **Edit before launch.**

## Run
    npm install && npx ng serve

## Deploy to Firebase Hosting
    firebase login
    firebase projects:create <your-project-id>   # then update .firebaserc
    npx ng build && firebase deploy --only hosting

Buy the domain (greenwattz.eu was unregistered when checked on 17 Oct 2026), then connect it in Firebase Console > Hosting > Add custom domain.

## SEAI register of solar PV companies
SEAI blocks automated requests, so the list is imported from a file you download in a browser:

1. Open https://www.seai.ie/grants/find-a-registered-professional/solar-pv-companies and download the results as CSV.
2. `npm run import:seai -- path/to/file.csv` writes `src/app/data/seai-registered.json`.
3. Commit and push. The `/seai-installers` page, the "SEAI" badges on ratings and quotes, and the "SEAI registered" chip update automatically.

Matching to rated installers is by website domain or exact company name only, so a missing badge means "not matched", not "not registered". Re-import every few weeks, as the register changes.

## Refreshing ratings
`npm run sync:ratings` updates Trustpilot and Google ratings from their APIs (needs `TRUSTPILOT_API_KEY` and/or `GOOGLE_PLACES_API_KEY`).

## Automatic SEAI refresh and backup
`.github/workflows/seai-refresh.yml` runs every Monday and tries SEAI's CSV export once. On success it validates the data (it refuses a file that is much smaller than the current one), commits a sanitised backup (`data/seai/register-backup.csv`, no emails or phone numbers) plus the JSON, and triggers a deploy. Git history is the backup. If SEAI blocks the request, the site keeps serving the last good data and nothing else happens. A GitHub issue opens only if there has been no successful refresh for 90 days.
SEAI currently serves a bot-check page to scripts, so the first successful run needs SEAI to allow it (see below) or a one-off local import with `npm run import:seai -- file.csv`. The raw download (`data/seai/latest.csv`) is git-ignored because it contains contact details.

## Tests
`npm test` runs the unit tests (Vitest) for the calculation engine, the ESB meter file parser, installer ranking and SEAI matching. They check energy balance (solar used + imported = demand), cost breakdown totals, SEAI grant rules, the connection-size limit, and strategy selection. The deploy workflow runs them first, so a failing calculation blocks a release.

How sizing works: the recommendation never exceeds what your roof fits or what a standard home connection allows (about 6 kW single-phase, 11 kW three-phase), and "best value" will not generate more than about 125% of your yearly use, because exported power is worth less and less certain than power you use.

## Keeping prices current
Every price, grant and rate behind the estimates lives in `src/app/data/prices.json`, with a `reviewedOn` date and a list of sources. The engine reads it, the planner shows the review date next to the figures ("Estimates, not quotes"), and the `/estimates` page ("How we estimate") is generated from it.

- **Update:** compare the sources in the file with current figures, edit the values, set `reviewedOn` to today, run `npm test`, push to `main`.
- **No numbers in the code.** Anything that changes over time is in the data files, not `engine.ts`:

  | What | Where in `prices.json` |
  |---|---|
  | Installed solar cost, yield, panel watts and size, the cost line items | `solar` (and `solar.costBreakdown`) |
  | SEAI grant amounts, cut-off years, minimum battery size | `grants` |
  | Unit rates, export rates, standing charge, VAT, yearly price rise, the example bill behind the rate presets | `tariffs` |
  | Export tax allowance and tax rates | `tax` |
  | Home connection limits (single and three phase) | `connection` |
  | Battery prices by tier and size | `battery` |
  | Battery sizes tested, efficiency, reserve, unit share of the price | `batterySpec` |
  | Panel ageing, inverter and battery replacement years and costs, projection length | `lifetime` |
  | Typical home use, EV and heat pump kWh | `usage` |
  | Grid carbon intensity | `emissions` |

  Brand and size lists are in `src/app/data/battery-products.json`. Fixed physical facts (Irish daylight and monthly sun shape) stay in code.
- **Tests keep it honest.** `src/app/core/data.spec.ts` holds a realistic range for every value, plus ordering checks (night below day, premium export above typical, battery sizes ascending, line items adding up to the cost per kWp). A typo such as a price ten times too high fails, but a real market move does not. If a genuine change falls outside a range, widen it in `BOUNDS` on purpose.
- **Reminder:** `.github/workflows/price-review.yml` runs monthly and opens a GitHub issue (with the checklist and source links) once a review is within 10 days of due.
- **Stale warning:** if the file is more than `reviewEveryDays` (60) old, the site tells visitors the prices may be out of date.

## Quote checker
`/check-quote` compares a quote's price per kWp with quotes other Irish homes have shared. The comparison figures are in `src/app/data/quote-benchmarks.json` (overall, by battery size, by system size, by quarter), credited to the FairWatt solar price index with its link and date. Refresh them when you review prices; the page warns visitors when they are more than 60 days old, and `src/app/core/quote-check.spec.ts` checks the ranges stay realistic. Their page asks that anything beyond the headline figures be agreed with them first (hello@fairwatt.ie).

- **Reading a quote:** a PDF or text file is read in the browser (`core/pdf-text.ts`, using pdf.js, loaded only on upload). Plain rules (`readQuoteText`) pull out panels, watts, kWp, battery, totals and grants. If the browser has built-in AI (Chrome's Prompt API, `core/browser-ai.ts`), it reads the quote too, on the device. Any number the AI returns that is not literally in the quote text is dropped (`acceptAiFields`), and every figure is shown to the user to confirm before it is used. Photos and scans are not supported.
- **Support link:** set `supportUrl` in `core/site.ts` to your Buy Me a Coffee page. While it is empty, every support link is hidden.

## Compare your quotes
`/compare-quotes` puts up to five quotes side by side (`pages/quote-compare.ts`, logic in `core/quote-compare.ts`). Each is checked against the community price range, run through our own model for the visitor's home (roof direction, usage and home year, shared with the planner) so the installer's yearly kWh, saving and payback claims can be sanity-checked, and scanned for contract red flags: a large deposit, nearly everything paid before the works, a short workmanship warranty, a short cancellation window, forfeits, a grant paid afterwards, a quote and terms that disagree on payment, a contract grant rule the home does not meet, and claims well above our estimate.

- **Reading a file:** the same reader as the quote checker, plus `core/quote-terms.ts`, which pulls deposit, payment schedule, warranties, cancellation, grant route and grant-year rule out of the quote and its terms. Whatever it finds is shown for confirmation before it becomes a column, and every cell can be edited.
- **Nothing is stored.** Quotes live in the page. "Save as file" and "Load a file" keep them as a JSON file the visitor holds; loading validates and clamps every value.

## Save and load a plan
The planner has "Save my plan" and "Load a plan" (`core/plan-file.ts`). The file holds the answers (usage figure, home, rates, goals, chosen system) and never meter readings. It is a download, not storage, so the privacy promise holds.

## Accounts and saved items
Accounts are optional. `/account` signs a visitor in with a one-time email link (no password), and "Save to my account" on the planner and the quote comparison keeps what they choose to save, so they can open it on any device.

- **What is kept:** the email address, and saves: the same JSON the "Save as file" buttons produce (answers and figures only; `core/saves.ts` checks name and size). A quote file, its text and meter readings are never kept. Anonymous quote details (`core/quote-store.ts`) are kept separately and are not linked to anyone.
- **Where it lives:** `core/account.ts` (service), `core/firebase-sdk.ts` (the only file that imports the Firebase SDK, loaded on demand so visitors who never sign in download none of it), `core/firebase-config.ts` (the public web settings), `pages/account.ts`. Saves are in Firestore at `users/{uid}/saves/{id}`; `firestore.rules` lets only that user read, write or delete them. Visitors can delete their account and every save on the account page.
- **Browser storage:** only if someone signs in: `gw.account` (a marker so the session is restored), `gw.email` (until the link is opened) and Firebase's sign-in token. The cookie policy lists them.

One-time setup in the Firebase console (project `greenwattz-eu`):
1. **Build, Firestore Database:** create the database (a European location such as `eur3`). This also enables the Firestore API that anonymous quote details need.
2. **Build, Authentication, Sign-in method:** turn on **Email/Password**, then switch on **Email link (passwordless sign-in)**.
3. **Authentication, Settings, Authorized domains:** add `greenwattz.eu` (and `www.greenwattz.eu`) next to the default `greenwattz-eu.web.app`.
4. **Authentication, Templates:** set the sign-in email's sender name and subject to GreenWattz.
5. **Rules:** `firebase deploy --only firestore:rules`.
6. **Google Cloud, APIs and Services, Credentials:** restrict the browser API key to your website addresses (HTTP referrers) and to the Identity Toolkit, Token Service and Cloud Firestore APIs.

## Blog and glossary
- **Posts** are plain data in `src/app/data/posts.ts`. Add an object with a slug, title, description, date, takeaways, blocks and sources, and it appears at `/blog` and `/blog/<slug>`. Text supports `**bold**` and `[label](url)`; internal links are checked by tests.
- **Glossary** terms live in `src/app/data/glossary.ts`. Link to a term from anywhere with `[MPRN](/glossary#mprn)`.
- Tests (`src/app/data/content.spec.ts`) check sources are https, links resolve, no long dashes, and that grant figures in the text match `prices.json`, so a rule change flags what needs updating. Posts describe the rules as of their date, so write a new post instead of silently editing an old one.
