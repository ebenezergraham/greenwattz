import { DEMAND_SEASON, MONTH_DAYS, MONTH_NAMES, Profile, Usage } from './engine';

/**
 * Parses an ESB Networks Harmonised Downloadable File (HDF) CSV in the browser.
 * Columns: MPRN, Meter Serial Number, Read Value, Read Type, Read Date and End Time.
 * Nothing is uploaded. The raw rows are discarded after aggregation.
 */

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseDate(s: string): Date | null {
  // dd-mm-yyyy hh:mm (ESB) or dd/mm/yyyy hh:mm[:ss] or ISO
  let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})[ T](\d{1,2}):(\d{2})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return null;
}

export class HdfError extends Error {}

export function parseHdf(text: string): Usage {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new HdfError('That file looks empty.');
  const head = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const iVal = head.findIndex((h) => h.includes('read value'));
  const iType = head.findIndex((h) => h.includes('read type'));
  const iDate = head.findIndex((h) => h.includes('date'));
  if (iVal < 0 || iType < 0 || iDate < 0)
    throw new HdfError('This does not look like an ESB Networks HDF file. Expected columns: Read Value, Read Type, Read Date and End Time.');

  // sums[month][hour], and distinct day keys per month
  const sums: number[][] = MONTH_DAYS.map(() => new Array(24).fill(0));
  const days: Set<string>[] = MONTH_DAYS.map(() => new Set());
  let rows = 0, first: Date | null = null, last: Date | null = null, hasExport = false;

  for (let i = 1; i < lines.length; i++) {
    const c = splitCsv(lines[i]);
    const type = (c[iType] || '').toLowerCase();
    if (type.includes('export')) { hasExport = true; continue; }
    if (!type.includes('import')) continue;
    let v = parseFloat(c[iVal]);
    if (!isFinite(v)) continue;
    if (/\(kw\)/.test(type) && !/kwh/.test(type)) v *= 0.5; // kW over 30 minutes
    const end = parseDate(c[iDate] || '');
    if (!end) continue;
    const start = new Date(end.getTime() - 30 * 60000); // interval start decides the hour
    sums[start.getMonth()][start.getHours()] += v;
    days[start.getMonth()].add(`${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`);
    if (!first || start < first) first = start;
    if (!last || end > last) last = end;
    rows++;
  }
  if (rows < 48) throw new HdfError('Not enough import readings found. Download the "30-minute readings in kWh" file from your ESB Networks account.');

  const observed = MONTH_DAYS.map((_, m) => days[m].size >= 3);
  const obsIdx = observed.map((o, m) => (o ? m : -1)).filter((m) => m >= 0);
  const perDay: number[][] = sums.map((row, m) => row.map((v) => (days[m].size ? v / days[m].size : 0)));
  const totals = perDay.map((r) => r.reduce((a, b) => a + b, 0));

  // Fill unobserved months from the average shape, scaled by seasonality.
  const avgShape = new Array(24).fill(0);
  let avgDaily = 0, seasonObs = 0;
  obsIdx.forEach((m) => { perDay[m].forEach((v, h) => (avgShape[h] += v / totals[m] / obsIdx.length)); avgDaily += totals[m]; seasonObs += DEMAND_SEASON[m]; });
  const dailyAtUnit = avgDaily / seasonObs;
  const profile: Profile = MONTH_DAYS.map((_, m) =>
    observed[m] ? perDay[m] : avgShape.map((w) => w * dailyAtUnit * DEMAND_SEASON[m]),
  );
  const annual = profile.reduce((t, r, m) => t + r.reduce((a, b) => a + b, 0) * MONTH_DAYS[m], 0);
  const spanDays = first && last ? Math.round((last.getTime() - first.getTime()) / 86400000) : 0;
  const cover = obsIdx.length === 12 ? 'all 12 months' : `${obsIdx.length} months (${obsIdx.map((m) => MONTH_NAMES[m]).join(', ')}), the rest estimated`;
  return {
    annualKwh: Math.round(annual),
    profile,
    source: 'smart-meter',
    coverage: `${spanDays} days of readings covering ${cover}.${hasExport ? ' Export readings found, so you may already have solar. Results assume no existing panels.' : ''}`,
  };
}
