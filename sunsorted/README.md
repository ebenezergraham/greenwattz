# SunSorted

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

Buy the domain (sunsorted.eu was unregistered when checked on 17 Oct 2026), then connect it in Firebase Console > Hosting > Add custom domain.
