import { describe, it, expect } from 'vitest';
import { HdfError, parseHdf } from './hdf';
import { DEFAULT_ASSUMPTIONS, MONTH_DAYS, annualFromProfile, bandBreakdown } from './engine';

const assump = (p: Partial<typeof DEFAULT_ASSUMPTIONS> = {}) => ({ ...DEFAULT_ASSUMPTIONS, ...p });

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
  describe('median day', () => {
    it('is the median hour across days, so a few unusual days do not move it', () => {
      // 100 days at 0.1 kWh per half hour, plus 10 party days at 2 kWh per half hour
      const base = rows(new Date(2025, 0, 1), new Date(2025, 3, 11), () => 0.1); // 100 days
      const party = rows(new Date(2025, 3, 11), new Date(2025, 3, 21), () => 2); // 10 days
      const u = parseHdf(csv([...base, ...party]));
      expect(u.median).toBeDefined();
      for (const v of u.median!) expect(v).toBeCloseTo(0.2, 9); // 2 half hours x 0.1
      expect(u.medianDaily).toBeCloseTo(4.8, 9);
      expect(u.annualKwh).toBeGreaterThan(Math.round(4.8 * 365)); // the average is pulled up, the median is not
    });
    it('shows the daily pattern in the median hours', () => {
      const evening = rows(new Date(2025, 0, 1), new Date(2025, 1, 15), (h) => (h >= 17 && h < 19 ? 0.4 : 0.05));
      const u = parseHdf(csv(evening));
      expect(u.median![17]).toBeCloseTo(0.8, 9);
      expect(u.median![18]).toBeCloseTo(0.8, 9);
      expect(u.median![3]).toBeCloseTo(0.1, 9);
      expect(u.median!.indexOf(Math.max(...u.median!))).toBe(17);
    });
    it('ignores days with missing readings when finding the median', () => {
      const good = rows(new Date(2025, 0, 1), new Date(2025, 0, 21), () => 0.1);
      const partialDay = rows(new Date(2025, 0, 21), new Date(2025, 0, 21, 6), () => 5); // only 6 hours, huge values
      const u = parseHdf(csv([...good, ...partialDay]));
      expect(u.medianDaily).toBeCloseTo(4.8, 9);
    });
    it('needs at least a week of full days', () => {
      const few = rows(new Date(2025, 0, 1), new Date(2025, 0, 5), () => 0.1);
      expect(parseHdf(csv([...few, ...rows(new Date(2025, 5, 1), new Date(2025, 5, 3), () => 0.1)])).median).toBeUndefined();
    });
  });

  describe('daily register export (Daily DNP)', () => {
    const REGISTER_HEAD = 'MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time';
    const TYPES = { night: 'Night Import Register (kWh)', peak: 'Day Peak Import Register (kWh)', offpeak: 'Day Off-Peak Import Register (kWh)' };
    /** Cumulative registers read at 00:00 each day, newest first like the real export. perDay[b] is the daily use for band b. */
    function registers(days: number, perDay: { night: number; offpeak: number; peak: number }, opts: { skip?: number[]; start?: Date; noPeak?: boolean; swapAt?: number } = {}): string {
      const start = opts.start ?? new Date(2025, 9, 1);
      const out: string[] = [];
      let n = 5000, o = 6000, p = 800;
      for (let i = 0; i <= days; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        if (opts.swapAt === i) { n = 10; o = 10; p = 1; } // meter replaced: registers restart
        if (!(opts.skip ?? []).includes(i)) {
          const when = fmt(d);
          out.push(`1,2,${n.toFixed(3)},${TYPES.night},${when}`, `1,2,${o.toFixed(3)},${TYPES.offpeak},${when}`);
          if (!opts.noPeak) out.push(`1,2,${p.toFixed(3)},${TYPES.peak},${when}`);
        }
        n += perDay.night; o += perDay.offpeak; p += perDay.peak;
      }
      return [REGISTER_HEAD, ...out.reverse()].join('\n');
    }
    const use = { night: 4, offpeak: 5, peak: 1 };

    it('works out daily use from the difference between register readings, not the readings themselves', () => {
      const u = parseHdf(registers(365, use));
      expect(u.source).toBe('smart-meter-daily');
      expect(u.annualKwh).toBe(Math.round(10 * 365)); // 4 + 5 + 1 a day, not thousands of kWh of register totals
      expect(u.medianDaily).toBeCloseTo(10, 9);
      expect(u.bands!.hasPeak).toBe(true);
    });
    it('keeps the measured night, day and peak split', () => {
      const u = parseHdf(registers(365, use));
      const rows = bandBreakdown(u.profile, assump({ tariff: 'smart' }));
      expect(rows.map((r) => Math.round(r.kwhPerDay * 100) / 100)).toEqual([4, 5, 1]);
      expect(rows.map((r) => Math.round(r.usePct * 100) / 100)).toEqual([0.4, 0.5, 0.1]);
    });
    it('does not put everything in the night hour (regression)', () => {
      const u = parseHdf(registers(365, use));
      const nonNight = u.profile[0].slice(8, 23).reduce((a, b) => a + b, 0);
      expect(nonNight).toBeCloseTo(6, 6); // 5 day + 1 peak, outside the night hours
      expect(Math.max(...u.profile[0])).toBeLessThan(2);
      expect(u.median!.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 9);
    });
    it('uses only the latest 12 months and ignores older, different use', () => {
      const old = registers(300, { night: 20, offpeak: 20, peak: 20 }, { start: new Date(2023, 0, 1) });
      const recent = registers(365, use, { start: new Date(2025, 0, 1) }).split('\n').slice(1);
      // the older file is cumulative from its own baseline, so join by readings on separate dates only
      const u = parseHdf([REGISTER_HEAD, ...old.split('\n').slice(1), ...recent].join('\n'));
      expect(u.annualKwh).toBe(3650);
    });
    it('copes with a dual-rate meter that has no peak register', () => {
      const u = parseHdf(registers(365, { night: 4, offpeak: 6, peak: 0 }, { noPeak: true }));
      expect(u.bands!.hasPeak).toBe(false);
      expect(u.annualKwh).toBe(3650);
      expect(u.coverage).toContain('night and day');
    });
    it('skips days with a missing reading or a meter reset rather than inventing use', () => {
      const u = parseHdf(registers(365, use, { skip: [100, 101, 200], swapAt: 250 }));
      expect(u.annualKwh).toBe(3650);
      expect(u.bands!.medianNight).toBeCloseTo(4, 9);
    });
    it('estimates months with no data from the seasonal pattern', () => {
      const u = parseHdf(registers(90, use, { start: new Date(2026, 0, 1) })); // Jan to Mar
      expect(u.coverage).toContain('3 months');
      expect(u.bands!.night[6]).toBeLessThan(u.bands!.night[0]); // July below January
      expect(u.bands!.night[0]).toBeCloseTo(4, 9);
    });
    it('rejects a file with too few daily readings', () => {
      expect(() => parseHdf(registers(4, use))).toThrow(/Not enough daily readings/);
    });
    it('rejects totals no home could use instead of showing nonsense', () => {
      expect(() => parseHdf(registers(365, { night: 60, offpeak: 90, peak: 20 }))).toThrow(/far too high/);
    });
    it('never mistakes register readings for 30-minute intervals', () => {
      const text = registers(30, use);
      const u = parseHdf(text);
      expect(u.annualKwh).toBeLessThan(40000);
    });
  });

  it('rejects a half-hourly file whose total is impossibly high', () => {
    const huge = rows(new Date(2025, 0, 1), new Date(2026, 0, 1), () => 5);
    expect(() => parseHdf(csv(huge))).toThrow(/far too high/);
  });
});
