import { describe, it, expect } from 'vitest';
import { SAVE_LIMITS, buildSave, defaultName, isEmail, kindLabel } from './saves';

describe('building a save', () => {
  it('accepts a plan with a name and JSON', () => {
    const s = buildSave('plan', '  My plan  ', '{"a":1}');
    expect(s).toEqual({ kind: 'plan', name: 'My plan', dataJson: '{"a":1}' });
  });
  it('trims, flattens whitespace and limits the name', () => {
    expect(buildSave('quotes', 'a\n\tb   c', '{}').name).toBe('a b c');
    expect(buildSave('quotes', 'x'.repeat(500), '{}').name).toHaveLength(SAVE_LIMITS.name);
  });
  it('rejects an empty name, empty data, oversize data, bad JSON and an unknown kind', () => {
    expect(() => buildSave('plan', '   ', '{}')).toThrow(/name/i);
    expect(() => buildSave('plan', 'n', '')).toThrow(/nothing/i);
    expect(() => buildSave('plan', 'n', '{"x":"' + 'a'.repeat(SAVE_LIMITS.dataJson) + '"}')).toThrow(/big/i);
    expect(() => buildSave('plan', 'n', 'not json')).toThrow();
    expect(() => buildSave('other' as never, 'n', '{}')).toThrow();
  });
});

describe('names and emails', () => {
  it('makes a readable default name with the date', () => {
    const n = defaultName('plan', '12 panels, 5 kWh battery', new Date('2026-10-23T12:00:00Z'));
    expect(n).toMatch(/^Plan: 12 panels, 5 kWh battery, /);
    expect(n).toMatch(/2026/);
    expect(defaultName('quotes', '', new Date('2026-10-23T12:00:00Z'))).toMatch(/^Quotes, /);
  });
  it('keeps the default name within the limit', () => {
    expect(defaultName('quotes', 'x'.repeat(400))).toHaveLength(SAVE_LIMITS.name);
  });
  it('checks the shape of an email address', () => {
    expect(isEmail('a@b.ie')).toBe(true);
    expect(isEmail('  person@example.com ')).toBe(true);
    for (const bad of ['', 'a', 'a@b', 'a b@c.ie', '@c.ie', 'a@.ie', 'x'.repeat(260) + '@a.ie']) expect(isEmail(bad)).toBe(false);
  });
  it('labels each kind', () => {
    expect(kindLabel('plan')).toBe('Plan');
    expect(kindLabel('quotes')).toBe('Quote comparison');
  });
});
