import { describe, it, expect } from 'vitest';
import { PlanStore } from './store';
import { applyPlan } from './plan-apply';
import { planFromFile, planToFile } from './plan-file';

const state = (s: PlanStore) => ({ mode: s.mode(), annualKwh: s.annualKwh(), monthlyBill: s.monthlyBill(), home: s.home(), assumptions: s.assumptions(), goals: s.goals(), chosen: s.chosen() });

describe('applying a plan to the planner', () => {
  it('copies the answers across, and leaves what the file does not mention', () => {
    const a = new PlanStore();
    a.annualKwh.set(6100); a.home.update((h) => ({ ...h, orientation: 'E_W', yearOccupied: 2024 })); a.goals.update((g) => ({ ...g, maxNetCost: 10000 })); a.chosen.set({ panels: 10, batteryKwh: 5 });
    const b = new PlanStore();
    const before = b.home().roofAreaM2;
    applyPlan(b, planFromFile(planToFile(state(a))));
    expect(b.annualKwh()).toBe(6100);
    expect(b.home().orientation).toBe('E_W');
    expect(b.home().yearOccupied).toBe(2024);
    expect(b.goals().maxNetCost).toBe(10000);
    expect(b.chosen()).toEqual({ panels: 10, batteryKwh: 5 });
    expect(b.home().roofAreaM2).toBe(a.home().roofAreaM2);
    expect(before).toBeGreaterThan(0);
  });
  it('keeps current values for anything missing', () => {
    const b = new PlanStore();
    b.annualKwh.set(3000);
    applyPlan(b, planFromFile(JSON.stringify({ app: 'greenwattz-plan', home: { orientation: 'N' } })));
    expect(b.annualKwh()).toBe(3000);
    expect(b.home().orientation).toBe('N');
  });
});
