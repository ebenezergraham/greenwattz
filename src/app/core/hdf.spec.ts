import { describe, it, expect } from 'vitest';
import { HdfError, parseHdf } from './hdf';
import { MONTH_DAYS, annualFromProfile } from './engine';

const HEAD = 'MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time';
const p2 = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;

/** Half-hourly rows (interval END times) for each day in [from, to). value(startHour) gives kWh for that interval. */
function rows(from: Date, to: Date, value: (hourStart: number, half: number) => number, type = 'Active Import Interval (kWh)'): string[] {
  const out: string[] = [];
  for (let t = new Date(from.getTime() + 30 * 60000); t <= to; t = new Date(t.getTime() + 30 * 60000)) {
    const start = new Date(t.getTime() - 30 * 60000);
    out.push(`10000000000,123,${value(start.getHours(), start.getMinutes() / 30)},${type},${fmt(t)}`);
  }
  return out;
}
const csv = (lines: string[]) => [HEAD, ...lines].join('\n');
const year = rows(new Date(2025, 0, 1), new Date(2026, 0, 1), () => 0.1);

describe('ESB HDF parser', () => {
  it('reads a full year of kWh readings and gets the yearly total right', () => {
    const u = parseHdf(csv(year));
    // 0.1 kWh x 48 half hours x 365 days
    expect(u.annualKwh).toBe(Math.round(0.1 * 48 * 365));
    expect(annualFromProfile(u.profile)).toBeCloseTo(0.1 * 48 * 365, 4);
    expect(u.source).toBe('smart-meter');
    expect(u.coverage).toContain('all 12 months');
  });
  it('halves kW readings, because a half hour at 0.2 kW is 0.1 kWh', () => {
    const kw = rows(new Date(2025, 0, 1), new Date(2026, 0, 1), () => 0.2, 'Active Import Interval (kW)');
    expect(parseHdf(csv(kw)).annualKwh).toBe(Math.round(0.1 * 48 * 365));
  });
  it('assigns each interval to the hour it STARTS in', () => {
    // use only the interval 17:00-17:30 and 17:30-18:00 (ending 17:30 and 18:00)
    const evening = rows(new Date(2025, 0, 1), new Date(2026, 0, 1), (h) => (h === 17 ? 0.5 : 0));
    const u = parseHdf(csv(evening));
    for (let m = 0; m < 12; m++) {
      expect(u.profile[m][17]).toBeCloseTo(1, 6); // two half hours x 0.5
      expect(u.profile[m][18]).toBe(0);
      expect(u.profile[m][16]).toBe(0);
    }
  });
  it('treats a reading ending at 00:00 as the last half hour of the previous day', () => {
    const night = rows(new Date(2025, 0, 1), new Date(2026, 0, 1), (h, half) => (h === 23 && half === 1 ? 1 : 0));
    const u = parseHdf(csv(night));
    expect(u.profile[0][23]).toBeCloseTo(1, 6);
    expect(u.profile[0][0]).toBe(0);
  });
  it('ignores export readings and says so', () => {
    const exp = rows(new Date(2025, 0, 1), new Date(2025, 0, 3), () => 9, 'Active Export Interval (kWh)');
    const u = parseHdf(csv([...year, ...exp]));
    expect(u.annualKwh).toBe(Math.round(0.1 * 48 * 365));
    expect(u.coverage).toContain('Export readings found');
  });
  it('estimates missing months from the seasonal pattern', () => {
    const jan = rows(new Date(2025, 0, 1), new Date(2025, 3, 1), () => 0.1); // Jan to Mar only
    const u = parseHdf(csv(jan));
    expect(u.coverage).toContain('3 months');
    const day = (m: number) => u.profile[m].reduce((a, b) => a + b, 0);
    expect(day(6)).toBeLessThan(day(0)); // July estimated below January
    expect(day(0)).toBeCloseTo(4.8, 6); // observed months are exact
    expect(u.annualKwh).toBeLessThan(4.8 * 365); // winter data over-represents the year
  });
  it('accepts a UTF-8 BOM, quoted fields, slashes in dates and seconds', () => {
    const lines = [
      '﻿"MPRN","Meter Serial Number","Read Value","Read Type","Read Date and End Time"',
      ...rows(new Date(2025, 0, 1), new Date(2025, 0, 31), () => 0.1).map((l) => l.replace(/-/g, '/').replace(/,([^,]*)$/, ',$1:00').replace(/10000000000/, '"10000000000"')),
    ];
    const u = parseHdf(lines.join('\r\n'));
    expect(u.profile[0].reduce((a, b) => a + b, 0)).toBeCloseTo(4.8, 6);
  });
  it('rejects empty and non-HDF files with a helpful message', () => {
    expect(() => parseHdf('')).toThrow(HdfError);
    expect(() => parseHdf('a,b,c\n1,2,3')).toThrow(/ESB Networks HDF/);
  });
  it('rejects a file with too few readings', () => {
    expect(() => parseHdf(csv(rows(new Date(2025, 0, 1), new Date(2025, 0, 1, 6), () => 0.1)))).toThrow(/Not enough import readings/);
  });
  it('keeps month day counts consistent with a non-leap year', () => {
    expect(MONTH_DAYS.reduce((a, b) => a + b, 0)).toBe(365);
  });
});
