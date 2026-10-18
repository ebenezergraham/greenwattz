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
`.github/workflows/seai-refresh.yml` runs every Monday and tries SEAI's CSV export once. On success it validates the data (it refuses a file that is much smaller than the current one), commits `data/seai/latest.csv` plus the JSON, and triggers a deploy. Git history is the backup. If SEAI blocks the request, the site keeps serving the last good data and nothing else happens. A GitHub issue opens only if there has been no successful refresh for 90 days.
SEAI currently serves a bot-check page to scripts, so the first successful run needs SEAI to allow it (see below) or a one-off CSV in `data/seai/latest.csv`.
