import { describe, it, expect } from 'vitest';
import { BandMonthly, HomeInputs, NO_OBSTACLES, Occupancy, Usage, averageDay, estimateProfile, withExtras } from './engine';
import { daytimeRatio, inferHousehold, occupancyFromRatio } from './infer';

const HOME: HomeInputs = { houseType: 'semi', roofType: 'pitched', storeys: 2, taxpayers: 1, yearOccupied: null, occupancy: 'mixed', orientation: 'S', shading: 'none', roofAreaM2: 30, obstacles: { ...NO_OBSTACLES }, threePhase: false, addEv: false, addHeatPump: false };
const meter = (kwh: number, occ: Occupancy, extras: Partial<HomeInputs> = {}, over: Partial<Usage> = {}): Usage => {
  const base: Usage = { annualKwh: kwh, profile: estimateProfile(kwh, occ), source: 'smart-meter' };
  return { ...withExtras(base, { ...HOME, ...extras }), source: 'smart-meter', ...over };
};
const flat = (v: number) => new Array(12).fill(v);

describe('who is home, from the shape of the day', () => {
  it.each(['away', 'mixed', 'home'] as Occupancy[])('recognises the model\'s own "%s" household', (occ) => {
    for (const kwh of [2500, 4200, 8000]) expect(inferHousehold(meter(kwh, occ)).occupancy?.value).toBe(occ);
  });
  it('orders the daytime ratio away < mixed < home', () => {
    const r = (o: Occupancy) => daytimeRatio(averageDay(estimateProfile(4200, o)));
    expect(r('away')).toBeLessThan(r('mixed'));
    expect(r('mixed')).toBeLessThan(r('home'));
  });
  it('maps ratios to answers at the thresholds', () => {
    expect(occupancyFromRatio(0.1)).toBe('away');
    expect(occupancyFromRatio(0.34)).toBe('away');
    expect(occupancyFromRatio(0.35)).toBe('mixed');
    expect(occupancyFromRatio(0.66)).toBe('mixed');
    expect(occupancyFromRatio(0.67)).toBe('home');
    expect(occupancyFromRatio(1.4)).toBe('home');
  });
  it('is not fooled by a high always-on load, which is removed before comparing', () => {
    const day = averageDay(estimateProfile(4200, 'away')).map((v) => v + 0.3); // a big constant load added to every hour
    expect(occupancyFromRatio(daytimeRatio(day))).toBe('away');
  });
  it('copes with a perfectly flat or empty day', () => {
    expect(daytimeRatio(new Array(24).fill(0.3))).toBe(1);
    expect(daytimeRatio(new Array(24).fill(0))).toBe(1);
  });
  it('gives a plain-language reason for every answer', () => {
    for (const occ of ['away', 'mixed', 'home'] as Occupancy[]) expect(inferHousehold(meter(4200, occ)).occupancy!.why.length).toBeGreaterThan(30);
  });
  it('reads the same profile the same way every time', () => {
    expect(inferHousehold(meter(4200, 'mixed'))).toEqual(inferHousehold(meter(4200, 'mixed')));
  });
});

describe('spotting an electric car or night heating', () => {
  it('does not flag an ordinary home', () => {
    for (const occ of ['away', 'mixed', 'home'] as Occupancy[]) expect(inferHousehold(meter(4200, occ)).nightLoad).toBeUndefined();
  });
  it('flags steady heavy overnight use, as an EV charging at night produces', () => {
    const n = inferHousehold(meter(4200, 'mixed', { addEv: true }));
    expect(n.nightLoad).toBeDefined();
    expect(n.nightLoad!.why).toContain('Overnight');
  });
  it('flags it for small and large homes alike, since the test compares against the home\'s own average', () => {
    for (const kwh of [2500, 4200, 8000]) expect(inferHousehold(meter(kwh, 'mixed', { addEv: true })).nightLoad, String(kwh)).toBeDefined();
    for (const kwh of [2500, 4200, 8000]) expect(inferHousehold(meter(kwh, 'mixed')).nightLoad, String(kwh)).toBeUndefined();
  });
  it('does not mistake a heat pump alone for night charging', () => {
    expect(inferHousehold(meter(4200, 'mixed', { addHeatPump: true })).nightLoad).toBeUndefined();
  });
  it('does not call a short blip a pattern', () => {
    const profile = estimateProfile(4200, 'mixed').map((row) => row.map((v, h) => (h === 2 ? v + 2 : v))); // one hour only
    expect(inferHousehold({ annualKwh: 4200, profile, source: 'smart-meter' }).nightLoad).toBeUndefined();
  });
  it('flags a daily-band file where half the use is at night', () => {
    const bands = (night: number): BandMonthly => ({ night: flat(night), offpeak: flat(5), peak: flat(1), hasPeak: true, medianNight: night, medianOffpeak: 5, medianPeak: 1 });
    const u = (n: number): Usage => ({ annualKwh: 1, profile: estimateProfile(4200, 'mixed'), source: 'smart-meter-daily', bands: bands(n) });
    expect(inferHousehold(u(7)).nightLoad?.why).toContain('11pm and 8am'); // 7 of 13 = 54%
    expect(inferHousehold(u(3)).nightLoad).toBeUndefined(); // 3 of 9 = 33%
  });
});

describe('spotting electric heating', () => {
  it('does not flag a normal winter-summer swing', () => {
    expect(inferHousehold(meter(4200, 'mixed')).winterHeavy).toBeUndefined();
  });
  it('flags a heat pump sized load that is mostly winter, at any home size', () => {
    for (const kwh of [2500, 8000]) expect(inferHousehold(meter(kwh, 'mixed', { addHeatPump: true })).winterHeavy, String(kwh)).toBeDefined();
    const n = inferHousehold(meter(4200, 'mixed', { addHeatPump: true }));
    expect(n.winterHeavy).toBeDefined();
    expect(n.winterHeavy!.why).toMatch(/times as much in winter/);
  });
  it('works for daily-band files too, using their monthly figures', () => {
    const swing = [3, 2.8, 2.2, 1.6, 1.2, 1, 1, 1, 1.3, 1.9, 2.5, 3];
    const bands: BandMonthly = { night: swing.map((v) => v * 4), offpeak: swing.map((v) => v * 4), peak: swing, hasPeak: true, medianNight: 4, medianOffpeak: 4, medianPeak: 1 };
    const profile = swing.map((v) => new Array(24).fill((v * 9) / 24));
    expect(inferHousehold({ annualKwh: 1, profile, source: 'smart-meter-daily', bands }).winterHeavy).toBeDefined();
  });
});

describe('what is never inferred', () => {
  it('makes no claims from an estimate', () => {
    expect(inferHousehold({ annualKwh: 4200, profile: estimateProfile(4200, 'mixed'), source: 'estimate' })).toEqual({});
  });
  it('does not guess who is home from a daily-band file, which has no hourly detail', () => {
    const bands: BandMonthly = { night: flat(4), offpeak: flat(5), peak: flat(1), hasPeak: true, medianNight: 4, medianOffpeak: 5, medianPeak: 1 };
    expect(inferHousehold({ annualKwh: 1, profile: estimateProfile(4200, 'mixed'), source: 'smart-meter-daily', bands }).occupancy).toBeUndefined();
  });
  it('flags existing solar when the file has export readings', () => {
    expect(inferHousehold(meter(4200, 'mixed', {}, { hasExport: true })).existingSolar).toBe(true);
    expect(inferHousehold(meter(4200, 'mixed')).existingSolar).toBeUndefined();
  });
});
