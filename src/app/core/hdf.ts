import { BandMonthly, DEMAND_SEASON, MONTH_DAYS, MONTH_NAMES, Profile, Usage, medianFromBands, profileFromBands } from './engine';

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

/** No Irish home uses this much, so a bigger total means we have misread the file. */
const MAX_PLAUSIBLE_KWH = 40000;

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
type BandName = 'night' | 'offpeak' | 'peak';

function bandOfRegister(type: string): BandName | null {
  if (type.includes('night')) return 'night';
  if (type.includes('peak') && type.includes('off')) return 'offpeak'; // "Day Off-Peak"
  if (type.includes('peak')) return 'peak'; // "Day Peak"
  if (type.includes('day')) return 'offpeak'; // a dual-rate meter's single "Day" register
  return null;
}

/**
 * The "Daily DNP" export: one cumulative meter register reading per day for Night, Day Peak and Day Off-Peak.
 * The value is the total on the meter, not the day's use, so a day's use is the next reading minus this one.
 */
function parseRegisters(lines: string[], iVal: number, iType: number, iDate: number): Usage {
  const reads = new Map<string, { date: Date; v: Partial<Record<BandName, number>> }>();
  let hasExport = false;
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsv(lines[i]);
    const type = (c[iType] || '').toLowerCase();
    if (type.includes('export')) { hasExport = true; continue; }
    if (!type.includes('import') || !type.includes('register')) continue;
    const band = bandOfRegister(type), v = parseFloat(c[iVal]), d = parseDate(c[iDate] || '');
    if (!band || !isFinite(v) || !d) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const e = reads.get(key) ?? { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), v: {} };
    e.v[band] = v;
    reads.set(key, e);
  }
  const sorted = [...reads.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  const hasPeak = sorted.some((r) => r.v.peak != null);
  const need: BandName[] = hasPeak ? ['night', 'offpeak', 'peak'] : ['night', 'offpeak'];

  // use on a day = the next day's reading minus this day's, only across consecutive days with every register present
  const days: { date: Date; night: number; offpeak: number; peak: number }[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (Math.round((b.date.getTime() - a.date.getTime()) / 86400000) !== 1) continue;
    if (need.some((k) => a.v[k] == null || b.v[k] == null)) continue;
    const d = { date: a.date, night: b.v.night! - a.v.night!, offpeak: b.v.offpeak! - a.v.offpeak!, peak: hasPeak ? b.v.peak! - a.v.peak! : 0 };
    const total = d.night + d.offpeak + d.peak;
    if (d.night < 0 || d.offpeak < 0 || d.peak < 0 || total > 300) continue; // meter swap or a gap in readings
    days.push(d);
  }
  if (days.length < 7) throw new HdfError('Not enough daily readings found. Download the "daily" or "30-minute readings in kWh" file from your ESB Networks account.');

  // use the latest 12 months so one year is not averaged with an older, different one
  const latest = days[days.length - 1].date.getTime();
  const recent = days.filter((d) => latest - d.date.getTime() < 365 * 86400000);
  const byMonth: typeof days[] = MONTH_DAYS.map(() => []);
  for (const d of recent) byMonth[d.date.getMonth()].push(d);
  const observed = byMonth.map((x) => x.length >= 3);
  const obsIdx = observed.map((o, m) => (o ? m : -1)).filter((m) => m >= 0);

  const monthly = (k: BandName): number[] => {
    const means = byMonth.map((x) => (x.length ? mean(x.map((d) => d[k])) : 0));
    const unit = obsIdx.reduce((t, m) => t + means[m], 0) / obsIdx.reduce((t, m) => t + DEMAND_SEASON[m], 0);
    return means.map((v, m) => (observed[m] ? v : unit * DEMAND_SEASON[m])); // missing months follow the usual seasonal pattern
  };
  const bands: BandMonthly = {
    night: monthly('night'), offpeak: monthly('offpeak'), peak: monthly('peak'), hasPeak,
    medianNight: median(recent.map((d) => d.night)), medianOffpeak: median(recent.map((d) => d.offpeak)), medianPeak: median(recent.map((d) => d.peak)),
  };
  const profile: Profile = profileFromBands(bands, 'mixed');
  const annual = MONTH_DAYS.reduce((t, n, m) => t + n * (bands.night[m] + bands.offpeak[m] + bands.peak[m]), 0);
  if (annual > MAX_PLAUSIBLE_KWH) throw new HdfError('The yearly total in this file looks far too high for a home, so we may have misread it. Try the "30-minute readings in kWh" file instead.');
  const cover = obsIdx.length === 12 ? 'all 12 months' : `${obsIdx.length} months (${obsIdx.map((m) => MONTH_NAMES[m]).join(', ')}), the rest estimated`;
  return {
    annualKwh: Math.round(annual), profile, source: 'smart-meter-daily', bands,
    median: medianFromBands(bands, 'mixed'), medianDaily: median(recent.map((d) => d.night + d.offpeak + d.peak)),
    coverage: `${recent.length} days of daily ${hasPeak ? 'night, day and peak' : 'night and day'} totals covering ${cover}. This file has totals for each rate band, not hourly readings, so how use spreads within a band is estimated from your answers.${hasExport ? ' Export readings found, so you may already have solar. Results assume no existing panels.' : ''}`,
  };
}

export function parseHdf(text: string): Usage {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new HdfError('That file looks empty.');
  const head = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const iVal = head.findIndex((h) => h.includes('read value'));
  const iType = head.findIndex((h) => h.includes('read type'));
  const iDate = head.findIndex((h) => h.includes('date'));
  if (iVal < 0 || iType < 0 || iDate < 0)
    throw new HdfError('This does not look like an ESB Networks HDF file. Expected columns: Read Value, Read Type, Read Date and End Time.');

  if (lines.slice(1, 400).some((l) => /register/i.test(splitCsv(l)[iType] ?? ''))) return parseRegisters(lines, iVal, iType, iDate);

  // sums[month][hour], and distinct day keys per month
  const sums: number[][] = MONTH_DAYS.map(() => new Array(24).fill(0));
  const days: Set<string>[] = MONTH_DAYS.map(() => new Set());
  const dayRows = new Map<string, { hours: number[]; n: number }>();
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
    const dayKey = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
    days[start.getMonth()].add(dayKey);
    const d = dayRows.get(dayKey) ?? { hours: new Array(24).fill(0), n: 0 };
    d.hours[start.getHours()] += v;
    d.n++;
    dayRows.set(dayKey, d);
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
  // Median per hour and per day, from days with (nearly) all 48 readings so partial days do not drag it down.
  const full = [...dayRows.values()].filter((d) => d.n >= 46);
  const medianHours = full.length >= 7 ? Array.from({ length: 24 }, (_, h) => median(full.map((d) => d.hours[h]))) : undefined;
  const medianDaily = full.length >= 7 ? median(full.map((d) => d.hours.reduce((a, b) => a + b, 0))) : undefined;
  if (annual > MAX_PLAUSIBLE_KWH) throw new HdfError('The yearly total in this file looks far too high for a home, so we may have misread it. Check it is the "30-minute readings in kWh" file.');
  return {
    median: medianHours,
    medianDaily,
    annualKwh: Math.round(annual),
    profile,
    source: 'smart-meter',
    coverage: `${spanDays} days of readings covering ${cover}.${hasExport ? ' Export readings found, so you may already have solar. Results assume no existing panels.' : ''}`,
  };
}
