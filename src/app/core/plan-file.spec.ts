import { describe, it, expect } from 'vitest';
import { DEFAULT_ASSUMPTIONS as A, DEFAULT_GOALS, NO_OBSTACLES } from './engine';
import { PlanState, planFromFile, planToFile } from './plan-file';

const state = (p: Partial<PlanState> = {}): PlanState => ({
  mode: 'annual', annualKwh: 5200, monthlyBill: 150,
  home: { houseType: 'semi', roofType: 'pitched', storeys: 2, taxpayers: 2, yearOccupied: 2024, occupancy: 'mixed', orientation: 'E_W', shading: 'some', roofAreaM2: 40, obstacles: { ...NO_OBSTACLES, chimney: 1 }, threePhase: false, addEv: true, addHeatPump: false },
  assumptions: { ...A, dayRate: 0.31, exportRate: 0.31, gridCharge: true, tariff: 'smart' },
  goals: { ...DEFAULT_GOALS, cover: 0.7, exportIncome: 600, maxNetCost: 10000 },
  chosen: { panels: 12, batteryKwh: 10 }, ...p,
});

describe('plan file', () => {
  it('round-trips the answers', () => {
    const back = planFromFile(planToFile(state()));
    expect(back.annualKwh).toBe(5200);
    expect(back.home?.orientation).toBe('E_W');
    expect(back.home?.yearOccupied).toBe(2024);
    expect(back.home?.taxpayers).toBe(2);
    expect(back.home?.obstacles?.chimney).toBe(1);
    expect(back.assumptions?.dayRate).toBe(0.31);
    expect(back.assumptions?.gridCharge).toBe(true);
    expect(back.assumptions?.tariff).toBe('smart');
    expect(back.goals?.cover).toBe(0.7);
    expect(back.goals?.maxNetCost).toBe(10000);
    expect(back.chosen).toEqual({ panels: 12, batteryKwh: 10 });
  });
  it('saves a meter session as a yearly figure, and never writes readings', () => {
    const text = planToFile(state({ mode: 'meter' }));
    expect(JSON.parse(text).mode).toBe('annual');
    expect(text).not.toMatch(/profile|median|meterUsage|readings/i);
  });
  it('keeps no personal details, only the figures', () => {
    expect(Object.keys(JSON.parse(planToFile(state())))).toEqual(['app', 'version', 'savedOn', 'mode', 'annualKwh', 'monthlyBill', 'home', 'assumptions', 'goals', 'chosen']);
  });
  it('remembers that nothing was chosen', () => {
    expect(planFromFile(planToFile(state({ chosen: null }))).chosen).toBeNull();
  });
  it('rejects a file that is not a plan', () => {
    expect(() => planFromFile('nope')).toThrow();
    expect(() => planFromFile(JSON.stringify({ app: 'other' }))).toThrow();
    expect(() => planFromFile('null')).toThrow();
  });
  it('clamps and drops anything unexpected', () => {
    const text = JSON.stringify({ app: 'greenwattz-plan', mode: 'hack', annualKwh: 9e9, monthlyBill: -1, home: { orientation: 'up', roofAreaM2: 5000, houseType: 'castle', storeys: 9, threePhase: 'yes', obstacles: { chimney: 500, ufo: 3 } }, assumptions: { dayRate: 99, tariff: 'x', gridCharge: 'no', evil: 1 }, goals: { cover: 5, lean: 'x', maxNetCost: -4 }, chosen: { panels: 999, batteryKwh: 3 } });
    const p = planFromFile(text);
    expect(p.mode).toBeUndefined();
    expect(p.annualKwh).toBeUndefined();
    expect(p.monthlyBill).toBeUndefined();
    expect(p.home?.orientation).toBeUndefined();
    expect(p.home?.roofAreaM2).toBeUndefined();
    expect(p.home?.houseType).toBeUndefined();
    expect(p.home?.storeys).toBeUndefined();
    expect(p.home?.threePhase).toBeUndefined();
    expect(p.home?.obstacles?.chimney).toBe(NO_OBSTACLES.chimney);
    expect((p.home?.obstacles as unknown as Record<string, unknown>)['ufo']).toBeUndefined();
    expect(p.assumptions).toBeUndefined();
    expect(p.goals).toBeUndefined();
    expect(p.chosen).toBeUndefined();
  });
  it('accepts a minimal file with only some answers', () => {
    const p = planFromFile(JSON.stringify({ app: 'greenwattz-plan', annualKwh: 4000, home: { orientation: 'S' } }));
    expect(p.annualKwh).toBe(4000);
    expect(p.home?.orientation).toBe('S');
    expect(p.goals).toBeUndefined();
  });
});
