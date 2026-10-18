import { Occupancy, Usage, averageDay, MONTH_DAYS } from './engine';

/**
 * Reads what a household's meter data says about the home, so we can pre-fill answers and warn about double counting.
 * Everything here is a suggestion from patterns, never a certainty, and the user can change every answer.
 * Hourly readings are averaged over all days (weekends included), so this describes a typical day.
 */
export interface Noticed {
  occupancy?: { value: Occupancy; why: string };
  /** Heavy steady overnight use: often an electric car, or night-time heating. */
  nightLoad?: { why: string };
  /** Much more use in winter than summer: often electric heating or a heat pump. */
  winterHeavy?: { why: string };
  existingSolar?: boolean;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const NIGHT = [23, 0, 1, 2, 3, 4, 5, 6];

/** Share of daytime use above the always-on baseline, relative to the evening peak period. */
export function daytimeRatio(day: number[]): number {
  const base = Math.min(...day);
  const daytime = sum(day.slice(9, 17)) / 8 - base;
  const evening = sum(day.slice(18, 22)) / 4 - base;
  return evening <= 0.01 ? 1 : Math.max(0, daytime) / evening;
}

export function occupancyFromRatio(r: number): Occupancy {
  return r < 0.35 ? 'away' : r < 0.67 ? 'mixed' : 'home';
}

export function inferHousehold(u: Usage): Noticed {
  const out: Noticed = {};
  if (u.hasExport) out.existingSolar = true;
  if (u.source === 'estimate') return out;

  if (u.source === 'smart-meter') {
    const day = averageDay(u.profile);
    const r = daytimeRatio(day);
    const value = occupancyFromRatio(r);
    out.occupancy = {
      value,
      why: value === 'away'
        ? 'Your use is low through the working day and rises in the evening, so we set "Out all day".'
        : value === 'home'
          ? 'Your use stays steady through the day, so we set "Most days". That suits solar well.'
          : 'Your use is part-way between those two patterns, so we set "Part of the day".',
    };
    // In most homes the small hours are the quietest of the day, around 40% to 55% of the average hour.
    // Three or more night hours at 75% of the average or more means something big runs overnight.
    const mean = sum(day) / 24;
    const busy = NIGHT.filter((h) => mean > 0 && day[h] / mean >= 0.75);
    if (busy.length >= 3) {
      const night = sum(busy.map((h) => day[h])) / busy.length;
      out.nightLoad = { why: `Overnight you use about ${night.toFixed(1)} kWh an hour, against an average of ${mean.toFixed(1)} kWh across the whole day. In most homes the small hours are the quietest.` };
    }
  }

  if (u.source === 'smart-meter-daily' && u.bands) {
    const n = sum(u.bands.night.map((v, m) => v * MONTH_DAYS[m]));
    const total = sum(u.bands.night.map((v, m) => (v + u.bands!.offpeak[m] + u.bands!.peak[m]) * MONTH_DAYS[m]));
    if (total > 0 && n / total >= 0.45) out.nightLoad = { why: `${Math.round((n / total) * 100)}% of your electricity is used between 11pm and 8am.` };
  }

  // seasonal swing from the monthly profile, for any real data
  const monthly = u.profile.map((row) => sum(row));
  const winter = (monthly[11] + monthly[0] + monthly[1]) / 3, summer = (monthly[5] + monthly[6] + monthly[7]) / 3;
  if (summer > 0 && winter / summer >= 1.5) out.winterHeavy = { why: `You use about ${(winter / summer).toFixed(1)} times as much in winter as in summer.` };
  return out;
}
