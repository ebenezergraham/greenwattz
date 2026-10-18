import { describe, it, expect } from 'vitest';
import { STEP_KEYS, stepIndex } from './plan';

describe('plan steps', () => {
  it('has three steps: usage, home and plan', () => expect(STEP_KEYS).toEqual(['usage', 'home', 'plan']));
  it('maps each step key to its position', () => {
    expect(stepIndex('usage')).toBe(0);
    expect(stepIndex('home')).toBe(1);
    expect(stepIndex('plan')).toBe(2);
  });
  it('opens the merged plan for the old strategy and cost links', () => {
    expect(stepIndex('strategy')).toBe(2);
    expect(stepIndex('cost')).toBe(2);
  });
  it('starts at usage for a missing or unknown step', () => {
    expect(stepIndex(null)).toBe(0);
    expect(stepIndex('nonsense')).toBe(0);
  });
});
