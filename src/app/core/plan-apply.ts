import type { PlanStore } from './store';
import type { PlanState } from './plan-file';

/** Put a loaded plan into the planner. Anything the file left out keeps its current value. */
export function applyPlan(s: PlanStore, p: Partial<PlanState>): void {
  if (p.mode) s.mode.set(p.mode);
  if (p.annualKwh !== undefined) s.annualKwh.set(p.annualKwh);
  if (p.monthlyBill !== undefined) s.monthlyBill.set(p.monthlyBill);
  if (p.home) s.home.update((h) => ({ ...h, ...p.home }));
  if (p.assumptions) s.assumptions.update((a) => ({ ...a, ...p.assumptions }));
  if (p.goals) s.goals.update((g) => ({ ...g, ...p.goals }));
  if (p.chosen !== undefined) s.chosen.set(p.chosen);
}
