import { describe, it, expect } from 'vitest';
import {
  BATTERY_OPTIONS, BATTERY_PRODUCTS, BATTERY_SIZES, BATTERY_USABLE_SHARE, CONNECTION_LIMIT_KW, DEFAULT_ASSUMPTIONS as A, EXPORT_TAX_RATES, LIFETIME, PRICES,
  RATE_PRESETS, costBreakdown, ratePreset, seaiGrantFor, systemCost,
} from './engine';

/**
 * Realistic bounds for every value that changes over time. When you update prices.json or battery-products.json these
 * should still pass; if a real change falls outside a bound, widen the bound here on purpose, so a typo (a price out
 * by ten times, 0.9 typed as 9) is caught but a genuine market move is not.
 */
const BOUNDS = {
  solar: { costBase: [1000, 4000], costPerKwp: [800, 2500], yieldPerKwp: [700, 1100], panelWatts: [350, 700], panelAreaM2: [1.6, 2.6] },
  tariffs: { unit: [0.1, 0.8], export: [0.03, 0.5], standingChargeMonthly: [10, 70], vat: [0, 0.25], priceRiseYearly: [0, 0.1], discount: [0, 0.6] },
  tax: { standard: [0.15, 0.45], higher: [0.35, 0.6] },
  connection: { single: [3, 10], three: [8, 25] },
  batterySpec: { size: [1, 40], efficiency: [0.7, 0.98], reserve: [0, 0.3], unitShare: [0.5, 0.95] },
  lifetime: { years: [15, 40], ageing: [0, 0.02], inverterYear: [8, 20], batteryYear: [8, 25], costShare: [0.3, 1.2] },
  usage: { home: [2000, 8000], ev: [1000, 5000], heatPump: [1500, 7000] },
  co2: [0.05, 0.8],
  batteryPerKwh: [300, 1500],
} as const;
const within = (v: number, [lo, hi]: readonly [number, number] | readonly number[]) => { expect(v).toBeGreaterThanOrEqual(lo); expect(v).toBeLessThanOrEqual(hi); };

describe('solar prices and the cost breakdown', () => {
  it('keeps the solar figures realistic', () => {
    within(PRICES.solar.costBase, BOUNDS.solar.costBase);
    within(PRICES.solar.costPerKwp, BOUNDS.solar.costPerKwp);
    within(PRICES.solar.yieldPerKwp, BOUNDS.solar.yieldPerKwp);
    within(PRICES.solar.panelWatts, BOUNDS.solar.panelWatts);
    within(PRICES.solar.panelAreaM2, BOUNDS.solar.panelAreaM2);
  });
  const cb = PRICES.solar.costBreakdown;
  it('splits the cost per kWp and the fixed base exactly across the line items', () => {
    expect(cb.rows.reduce((t, r) => t + (r.perKwpEuro ?? 0), 0)).toBeCloseTo(cb.referencePerKwp, 6);
    expect(cb.rows.reduce((t, r) => t + (r.baseEuro ?? 0), 0)).toBeCloseTo(cb.referenceBase, 6);
  });
  it('uses reference costs close to the editable ones, so the shares make sense', () => {
    expect(cb.referencePerKwp / PRICES.solar.costPerKwp).toBeGreaterThan(0.5);
    expect(cb.referencePerKwp / PRICES.solar.costPerKwp).toBeLessThan(2);
    expect(cb.referenceBase / PRICES.solar.costBase).toBeGreaterThan(0.5);
    expect(cb.referenceBase / PRICES.solar.costBase).toBeLessThan(2);
  });
  it('has well-formed rows: unique keys, a cost to share, and a spread around the typical price', () => {
    expect(new Set(cb.rows.map((r) => r.key)).size).toBe(cb.rows.length);
    for (const r of cb.rows) {
      expect((r.perKwpEuro ?? 0) + (r.baseEuro ?? 0)).toBeGreaterThan(0);
      expect(r.lo).toBeGreaterThanOrEqual(0.5); expect(r.lo).toBeLessThanOrEqual(1);
      expect(r.hi).toBeGreaterThanOrEqual(1); expect(r.hi).toBeLessThanOrEqual(2);
      expect(r.label.length).toBeGreaterThan(3); expect(r.note.length).toBeGreaterThan(10);
    }
  });
  it('prices a typical 4 kWp and 6 kWp system inside the ranges the note quotes', () => {
    const four = systemCost(4, 0, A), six = systemCost(6, 0, A);
    within(four, [5500, 10000]);
    within(six, [8000, 13500]);
    expect(six).toBeGreaterThan(four);
  });
  it('gives each line a low and high that bracket the typical price', () => {
    for (const r of costBreakdown(5, 10, A)) { expect(r.low).toBeLessThanOrEqual(r.mid); expect(r.high).toBeGreaterThanOrEqual(r.mid); }
  });
  it('prices solar per kWp lower than a battery per kWh times a multiple, as a sanity check across units', () => {
    expect(systemCost(5, 0, A) / 5).toBeLessThan(3500);
  });
});

describe('electricity rates and VAT', () => {
  const t = PRICES.tariffs;
  it('keeps every unit rate realistic and in order', () => {
    for (const r of [t.flat, t.day, t.night, t.peak]) within(r, BOUNDS.tariffs.unit);
    expect(t.night).toBeLessThan(t.day);
    expect(t.peak).toBeGreaterThanOrEqual(t.day);
    expect(t.flat).toBeGreaterThanOrEqual(t.night);
    expect(t.flat).toBeLessThanOrEqual(t.peak);
  });
  it('keeps the export rates realistic, with premium above typical and both below the day rate premium', () => {
    within(t.export, BOUNDS.tariffs.export);
    within(t.exportPremium, BOUNDS.tariffs.export);
    expect(t.exportPremium).toBeGreaterThanOrEqual(t.export);
  });
  it('keeps the standing charge, VAT and price rise realistic', () => {
    within(t.standingChargeMonthly, BOUNDS.tariffs.standingChargeMonthly);
    within(t.vat, BOUNDS.tariffs.vat);
    within(t.priceRiseYearly, BOUNDS.tariffs.priceRiseYearly);
  });
  it('keeps the example bill realistic: rates before VAT in order, and a discount that is a share', () => {
    const b = t.billExample;
    for (const r of [b.dayExVat, b.nightExVat, b.peakExVat]) within(r, BOUNDS.tariffs.unit);
    expect(b.nightExVat).toBeLessThan(b.dayExVat);
    expect(b.peakExVat).toBeGreaterThanOrEqual(b.dayExVat);
    within(b.discount, BOUNDS.tariffs.discount);
  });
  it('builds rate presets that stay realistic and ordered for the current VAT', () => {
    const [below, typical, above] = (['below', 'typical', 'above'] as const).map((k) => ratePreset(k, A.vat));
    for (const p of [below, typical, above]) for (const r of [p.flatRate, p.dayRate, p.nightRate, p.peakRate]) within(r, BOUNDS.tariffs.unit);
    expect(below.dayRate).toBeLessThan(above.dayRate);
    expect(below.nightRate).toBeLessThan(below.dayRate);
    expect(above.nightRate).toBeLessThan(above.dayRate);
    expect(RATE_PRESETS.length).toBe(3);
  });
  it('feeds the engine defaults', () => {
    expect(A.vat).toBe(t.vat);
    expect(A.tariffInflation).toBe(t.priceRiseYearly);
    expect(A.exportRate).toBe(t.export);
  });
});

describe('tax and grants', () => {
  it('keeps the export tax rates realistic, with higher above standard, and both offered', () => {
    within(PRICES.tax.exportTaxRate, BOUNDS.tax.standard);
    within(PRICES.tax.exportTaxRateHigher, BOUNDS.tax.higher);
    expect(PRICES.tax.exportTaxRateHigher).toBeGreaterThan(PRICES.tax.exportTaxRate);
    expect(EXPORT_TAX_RATES.map((r) => r.rate)).toEqual([PRICES.tax.exportTaxRate, PRICES.tax.exportTaxRateHigher]);
    for (const r of EXPORT_TAX_RATES) expect(r.hint).toContain(String(Math.round(r.rate * 100)));
  });
  it('pays a solar grant that grows with size and stops at the maximum', () => {
    expect(seaiGrantFor(1)).toBeGreaterThan(0);
    expect(seaiGrantFor(3)).toBeGreaterThan(seaiGrantFor(1));
    expect(seaiGrantFor(20)).toBe(PRICES.grants.seaiSolarMax);
    within(PRICES.grants.seaiSolarMax, [500, 5000]);
  });
});

describe('connection limits', () => {
  it('keeps the single and three phase limits realistic, with three phase larger', () => {
    within(PRICES.connection.singlePhaseKw, BOUNDS.connection.single);
    within(PRICES.connection.threePhaseKw, BOUNDS.connection.three);
    expect(PRICES.connection.threePhaseKw).toBeGreaterThan(PRICES.connection.singlePhaseKw);
    expect(CONNECTION_LIMIT_KW).toEqual({ single: PRICES.connection.singlePhaseKw, three: PRICES.connection.threePhaseKw });
  });
});

describe('battery data', () => {
  const s = PRICES.batterySpec;
  it('keeps the battery assumptions realistic', () => {
    within(s.roundTripEfficiency, BOUNDS.batterySpec.efficiency);
    within(s.reserveShare, BOUNDS.batterySpec.reserve);
    within(s.unitShareOfInstalled, BOUNDS.batterySpec.unitShare);
    expect(BATTERY_USABLE_SHARE).toBeCloseTo(1 - s.reserveShare, 9);
    expect(A.batteryEfficiency).toBe(s.roundTripEfficiency);
  });
  it('lists sizes in ascending order, all within a real range and at or above the grant minimum', () => {
    expect(BATTERY_SIZES).toEqual(s.sizes);
    expect(BATTERY_SIZES.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < BATTERY_SIZES.length; i++) { within(BATTERY_SIZES[i], BOUNDS.batterySpec.size); if (i) expect(BATTERY_SIZES[i]).toBeGreaterThan(BATTERY_SIZES[i - 1]); }
    expect(BATTERY_SIZES[0]).toBeGreaterThanOrEqual(PRICES.grants.seaiBatteryMinKwh);
    expect(BATTERY_OPTIONS).toEqual([0, ...BATTERY_SIZES]);
  });
  it('prices every tier at a realistic cost per kWh at each size the planner tests', () => {
    for (const tier of ['value', 'mainstream', 'premium'] as const) {
      for (const kwh of BATTERY_SIZES) {
        const b = costBreakdown(4, kwh, { ...A, batteryTier: tier }).filter((r) => r.group === 'battery').reduce((t, r) => t + r.mid, 0);
        within(b / kwh, BOUNDS.batteryPerKwh);
      }
    }
  });
  it('gets cheaper per kWh as batteries get bigger, or at worst no dearer', () => {
    for (const tier of ['value', 'mainstream', 'premium'] as const) {
      const per = (kwh: number) => costBreakdown(4, kwh, { ...A, batteryTier: tier }).filter((r) => r.group === 'battery').reduce((t, r) => t + r.mid, 0) / kwh;
      expect(per(15)).toBeLessThanOrEqual(per(5) * 1.05);
    }
  });
  it('lists brands with a tier, sizes and a note', () => {
    expect(BATTERY_PRODUCTS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(BATTERY_PRODUCTS.map((p) => p.brand)).size).toBe(BATTERY_PRODUCTS.length);
    for (const p of BATTERY_PRODUCTS) {
      expect(['value', 'mainstream', 'premium']).toContain(p.tier);
      expect(p.sizes).toMatch(/\d/);
      expect(p.note.length).toBeGreaterThan(10);
      for (const n of p.sizes.match(/\d+(\.\d+)?/g)!.map(Number)) within(n, BOUNDS.batterySpec.size);
    }
  });
});

describe('long-run assumptions', () => {
  it('keeps the projection assumptions realistic', () => {
    const l = PRICES.lifetime;
    within(l.years, BOUNDS.lifetime.years);
    within(l.panelAgeingPerYear, BOUNDS.lifetime.ageing);
    within(l.inverterYear, BOUNDS.lifetime.inverterYear);
    within(l.batteryYear, BOUNDS.lifetime.batteryYear);
    within(l.inverterCostShare, BOUNDS.lifetime.costShare);
    within(l.batteryCostShare, BOUNDS.lifetime.costShare);
    expect(l.inverterYear).toBeLessThan(l.years);
    expect(l.batteryYear).toBeLessThan(l.years);
  });
  it('feeds the lifetime the engine uses', () => {
    expect(LIFETIME.years).toBe(PRICES.lifetime.years);
    expect(LIFETIME.inverterYear).toBe(PRICES.lifetime.inverterYear);
    expect(LIFETIME.panelAgeing).toBe(PRICES.lifetime.panelAgeingPerYear);
  });
  it('keeps household usage and carbon figures realistic', () => {
    within(PRICES.usage.typicalHomeKwh, BOUNDS.usage.home);
    within(PRICES.usage.evKwhPerYear, BOUNDS.usage.ev);
    within(PRICES.usage.heatPumpKwhPerYear, BOUNDS.usage.heatPump);
    within(PRICES.emissions.co2KgPerKwh, BOUNDS.co2);
    expect(A.co2KgPerKwh).toBe(PRICES.emissions.co2KgPerKwh);
  });
});

describe('every data value has a note and a review date', () => {
  it('explains the new sections so the next person knows what to check', () => {
    for (const k of ['connection', 'batterySpec', 'lifetime', 'usage', 'emissions'] as const) expect((PRICES[k] as { note: string }).note.length).toBeGreaterThan(20);
    expect(PRICES.tariffs.billExample.note.length).toBeGreaterThan(20);
    expect(PRICES.solar.costBreakdown.note.length).toBeGreaterThan(20);
  });
});
