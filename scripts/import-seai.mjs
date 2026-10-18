// Converts the SEAI "Solar PV companies" CSV export into src/app/data/seai-registered.json.
//
// Note: contact details (email, phone) are deliberately dropped. Only business name, registration number,
// website, scope and counties are kept, in the JSON and in the committed backup.
// SEAI's site blocks automated requests, so download the file yourself in a browser:
//   1. Open https://www.seai.ie/grants/find-a-registered-professional/solar-pv-companies
//   2. Use the download / export option on the results (all counties, domestic).
//   3. Run: npm run import:seai -- path/to/downloaded.csv
//
// Column names are detected by keyword, so small changes to SEAI's headers are tolerated.
import { readFile, writeFile } from 'node:fs/promises';

const force = process.argv.includes('--force');

const src = process.argv.slice(2).find((a) => !a.startsWith('--'));
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
  reg: col('registration'),
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
  let website = get(r, idx.website);
  if (website.includes('@')) website = ''; // some entries hold an email address in the website field
  companies.push({
    name,
    registration: get(r, idx.reg) || undefined,
    counties: get(r, idx.county).split(',').map((c) => c.trim()).filter(Boolean),
    website: website ? (/^https?:/i.test(website) ? website : 'https://' + website) : undefined,
    scope: get(r, idx.scope) || undefined,
  });
}
companies.sort((a, b) => a.name.localeCompare(b.name));

// Safety: refuse an import that looks truncated or broken, so a bad download never replaces good data.
const OUT = new URL('../src/app/data/seai-registered.json', import.meta.url);
const prev = JSON.parse(await readFile(OUT, 'utf8')).companies.length;
if (!force && prev > 0 && companies.length < prev * 0.7) {
  console.error(`Refusing to import: ${companies.length} companies is far fewer than the current ${prev}. Re-download, or pass --force.`);
  process.exit(3);
}
const out = {
  asOf: new Date().toISOString().slice(0, 10),
  source: 'https://www.seai.ie/grants/find-a-registered-professional/solar-pv-companies',
  companies,
};
const prevFile = await readFile(OUT, 'utf8');
const prevNames = new Set(JSON.parse(prevFile).companies.map((c) => c.name));
const same = prev === companies.length && companies.every((c) => prevNames.has(c.name));
// Keep the old "asOf" date when nothing changed so the file (and git) stays quiet.
if (same) out.asOf = JSON.parse(prevFile).asOf ?? out.asOf;
await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');

// Sanitised backup that is safe to commit to a public repo: no emails or phone numbers.
const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const backup = ['Company,Registration number,Website,Scope,Counties', ...companies.map((c) => [c.name, c.registration, c.website, c.scope, (c.counties ?? []).join(', ')].map(q).join(','))].join('\n') + '\n';
await writeFile(new URL('../data/seai/register-backup.csv', import.meta.url), backup);
console.log(same ? 'No change in the register.' : `Register changed: ${prev} -> ${companies.length} companies.`);
console.log(`Imported ${companies.length} companies. Columns used:`, Object.fromEntries(Object.entries(idx).map(([k, v]) => [k, head[v] ?? null])));
