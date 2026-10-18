// Converts the SEAI "Solar PV companies" CSV export into src/app/data/seai-registered.json.
//
// SEAI's site blocks automated requests, so download the file yourself in a browser:
//   1. Open https://www.seai.ie/grants/find-a-registered-professional/solar-pv-companies
//   2. Use the download / export option on the results (all counties, domestic).
//   3. Run: npm run import:seai -- path/to/downloaded.csv
//
// Column names are detected by keyword, so small changes to SEAI's headers are tolerated.
import { readFile, writeFile } from 'node:fs/promises';

const src = process.argv[2];
if (!src) { console.error('Usage: npm run import:seai -- path/to/seai.csv'); process.exit(1); }

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); if (row.some((x) => x.trim())) rows.push(row); }
  return rows;
}

const rows = parseCsv(await readFile(src, 'utf8'));
const head = rows.shift().map((h) => h.trim().toLowerCase());
const col = (...keys) => head.findIndex((h) => keys.some((k) => h.includes(k)));
const idx = {
  name: col('company', 'name', 'contractor'),
  county: col('county'),
  address: col('address'),
  phone: col('phone', 'tel'),
  website: col('website', 'web', 'url'),
  scope: col('domestic', 'type', 'category', 'scheme'),
};
if (idx.name < 0) { console.error('Could not find a company name column. Headers seen:', head.join(' | ')); process.exit(1); }
const get = (r, i) => (i >= 0 ? (r[i] ?? '').trim() : '');

const seen = new Set();
const companies = [];
for (const r of rows) {
  const name = get(r, idx.name);
  if (!name) continue;
  const key = name.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  const website = get(r, idx.website);
  companies.push({
    name,
    county: get(r, idx.county) || undefined,
    address: get(r, idx.address) || undefined,
    phone: get(r, idx.phone) || undefined,
    website: website ? (/^https?:/i.test(website) ? website : 'https://' + website) : undefined,
    scope: get(r, idx.scope) || undefined,
  });
}
companies.sort((a, b) => a.name.localeCompare(b.name));
const out = {
  asOf: new Date().toISOString().slice(0, 10),
  source: 'https://www.seai.ie/grants/find-a-registered-professional/solar-pv-companies',
  companies,
};
await writeFile(new URL('../src/app/data/seai-registered.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`Imported ${companies.length} companies. Columns used:`, Object.fromEntries(Object.entries(idx).map(([k, v]) => [k, head[v] ?? null])));
