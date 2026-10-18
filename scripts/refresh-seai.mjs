// Tries to download SEAI's public CSV export and import it. Exit codes:
//   0 imported (or unchanged)   2 blocked by SEAI's bot check, manual download needed   3 data failed safety checks
// We identify ourselves honestly and make a single request. If SEAI serves a challenge page we stop:
// we do not try to get around it. In that case the workflow opens an issue asking for a manual download.
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const URL_ = 'https://www.seai.ie/export-solar?county=All&domestic_nondomestic=domestic&page&_format=csv';
const OUT = new URL('../data/seai/latest.csv', import.meta.url);

const res = await fetch(URL_, { headers: { 'User-Agent': 'GreenWattz-data-refresh (weekly, 1 request; https://github.com/ebenezergraham/greenwattz)', Accept: 'text/csv' } }).catch((e) => ({ ok: false, status: 0, error: e }));
const type = res.headers?.get?.('content-type') ?? '';
if (!res.ok || !/csv|text\/plain|octet-stream/i.test(type)) {
  console.error(`SEAI did not return a CSV (status ${res.status}, type "${type}"). Manual download needed.`);
  process.exit(2);
}
const text = await res.text();
if (text.trimStart().startsWith('<') || text.split('\n').length < 20) {
  console.error('Response is not a usable CSV. Manual download needed.');
  process.exit(2);
}
await mkdir(new URL('../data/seai/', import.meta.url), { recursive: true });
await writeFile(OUT, text);
const r = spawnSync('node', ['scripts/import-seai.mjs', 'data/seai/latest.csv'], { stdio: 'inherit' });
process.exit(r.status ?? 3);
