// Refreshes src/app/data/installer-ratings.json from the official APIs.
// Run locally or in CI. Keys come from the environment and are never shipped to the browser.
//   GOOGLE_PLACES_API_KEY  Google Places API (New) key
//   TRUSTPILOT_API_KEY     Trustpilot Business API key (optional; if unset, Trustpilot values are left as they are)
// Usage: node scripts/sync-ratings.mjs
import { readFile, writeFile } from 'node:fs/promises';

const FILE = new URL('../src/app/data/installer-ratings.json', import.meta.url);
const data = JSON.parse(await readFile(FILE, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const gKey = process.env.GOOGLE_PLACES_API_KEY;
const tKey = process.env.TRUSTPILOT_API_KEY;

async function google(i) {
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': gKey, 'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.googleMapsUri' },
    body: JSON.stringify({ textQuery: `${i.name} solar Ireland`, regionCode: 'IE', maxResultCount: 1 }),
  });
  if (!r.ok) throw new Error(`Google ${r.status}`);
  const p = (await r.json()).places?.[0];
  if (!p?.rating) return null;
  return { rating: p.rating, count: p.userRatingCount, url: p.googleMapsUri, placeName: p.displayName?.text, asOf: today };
}

async function trustpilot(i) {
  const find = await fetch(`https://api.trustpilot.com/v1/business-units/find?name=${encodeURIComponent(i.domain)}&apikey=${tKey}`);
  if (!find.ok) throw new Error(`Trustpilot find ${find.status}`);
  const id = (await find.json()).id;
  const r = await fetch(`https://api.trustpilot.com/v1/business-units/${id}?apikey=${tKey}`);
  if (!r.ok) throw new Error(`Trustpilot ${r.status}`);
  const b = await r.json();
  return { score: b.score.trustScore, count: b.numberOfReviews.total, url: i.trustpilot.url, asOf: today };
}

for (const i of data.installers) {
  try {
    if (gKey) i.google = (await google(i)) ?? i.google;
    if (tKey) i.trustpilot = await trustpilot(i);
    console.log('ok  ', i.name);
  } catch (e) { console.warn('skip', i.name, e.message); }
}
data.asOf = today;
await writeFile(FILE, JSON.stringify(data, null, 2) + '\n');
