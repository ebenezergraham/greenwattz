import { describe, it, expect } from 'vitest';
import { paymentSchedules, paymentSteps, readTerms } from './quote-terms';

// Synthetic text shaped like a real installer quote followed by its terms (no real names or details).
const QUOTE = [
  'ACCEPTANCE',
  'A 15% (€1,851.75) deposit is required to initiate the process.',
  '15% Deposit on signing contract €1,851.75',
  '55% Confirmed Date of Installation €6,789.75',
  '30% Installation Completion €3,703.50',
  'A Vat Rate of 0% applies from the 1st May 2023',
  'SEAI solar grant paid directly to client for houses built before 2025 -€1,800.00',
  'A 5 year workmanship warranty applies to this solar system installation.',
  'Quotations are valid for 30 days',
  'Price is subject to a full on-site survey',
  'Solar panel 25 years product,',
  '30 years',
  'performance',
  'Huawei SUN200-5K-LB0 5500W Inverter 10 years Warranty file',
  'Huawei LUNA2000-7-S1 6.9kWh Battery 15 years Warranty file',
].join('\n');
const TERMS = [
  '4. FEES AND PAYMENT',
  'c. A 25% deposit is payable on receipt of the Order (the Deposit)',
  'd. 55% of the Price shall be payable on confirmation of the Installation Date and before Works are commenced.',
  'e. The balance 20% of the Price shall be payable immediately on completion of the Works.',
].join('\n');

describe('payment steps and schedules', () => {
  it('finds each percentage with when it is due, and ignores VAT', () => {
    const steps = paymentSteps(QUOTE);
    expect(steps.map((s) => s.pct)).toEqual([15, 55, 30]);
    expect(steps.some((s) => s.pct === 0)).toBe(false);
  });
  it('splits two written-out schedules', () => {
    const sets = paymentSchedules(paymentSteps(TERMS));
    expect(sets).toHaveLength(1);
    expect(sets[0].map((s) => s.pct)).toEqual([25, 55, 20]);
  });
  it('classifies deposit, before-works and completion steps', () => {
    const steps = paymentSteps(TERMS);
    expect(steps.map((s) => s.when)).toEqual(['start', 'before', 'end']);
  });
});

describe('reading terms', () => {
  const q = readTerms(QUOTE);
  it('finds the deposit and what is paid before the works', () => {
    expect(q.depositPct).toBe(15);
    expect(q.beforeWorksPct).toBe(70);
  });
  it('finds warranties', () => {
    expect(q.workmanshipYears).toBe(5);
    expect(q.panelWarrantyYears).toBe(25);
    expect(q.performanceYears).toBe(30);
    expect(q.inverterYears).toBe(10);
    expect(q.batteryYears).toBe(15);
  });
  it('finds that the grant is paid to the customer, the grant year rule, validity and a survey caveat', () => {
    expect(q.grantRoute).toBe('paid-to-you');
    expect(q.builtBeforeYear).toBe(2025);
    expect(q.validDays).toBe(30);
    expect(q.priceMayChange).toBe(true);
  });
  it('spots a quote and terms that disagree on the deposit', () => {
    const both = readTerms(QUOTE + '\n' + TERMS);
    expect(both.depositPcts?.slice().sort((a, b) => a - b)).toEqual([15, 25]);
  });
  it('does not call one repeated schedule a mismatch', () => {
    const twice = readTerms(TERMS + '\n' + TERMS);
    expect(twice.depositPcts).toEqual([25]);
  });
  it('finds a deposit written in words when there is no schedule', () => {
    expect(readTerms('A 20% deposit is due on booking').depositPct).toBe(20);
  });
  it('reads a stage-one style schedule where nearly everything is paid before the works', () => {
    const t = readTerms('Stage One Payment 5% on order confirmation\nStage Two Payment 95% balance in full on appointment confirmation for works');
    expect(t.depositPct).toBe(5);
    expect(t.beforeWorksPct).toBeGreaterThanOrEqual(5);
  });
  it('finds cancellation windows and forfeits', () => {
    const t = readTerms('You may cancel within 14 days of paying the deposit. If you cancel within 10 days of installation you forfeit the full payment.');
    expect(t.coolingOffDays).toBe(14);
    expect(t.forfeits).toBe(true);
  });
  it('finds a grant deducted at source, and a short workmanship warranty', () => {
    const t = readTerms('The grant amount will be taken off the invoice. A 2-year workmanship and labour warranty is provided.');
    expect(t.grantRoute).toBe('deducted');
    expect(t.workmanshipYears).toBe(2);
  });
  it('finds a grant rule that is older than the current one', () => {
    expect(readTerms('Grant applies to a home built and occupied before 1 Jan 2021.').builtBeforeYear).toBe(2021);
  });
  it('finds battery chemistry', () => {
    expect(readTerms('Battery: LiFePO4 6.9kWh').chemistry).toBe('LFP');
    expect(readTerms('Battery chemistry NMC').chemistry).toBe('NMC');
  });
  it('finds nothing in unrelated text and never returns undefined values', () => {
    expect(readTerms('Hello, how are you?')).toEqual({});
    for (const v of Object.values(q)) expect(v).not.toBeUndefined();
  });
});
