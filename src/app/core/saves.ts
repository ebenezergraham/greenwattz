/**
 * What a signed-in visitor can save: their planner answers and their quote comparisons. A save is the same JSON the
 * "Save as file" buttons produce, so it never holds a quote file, its text, or meter readings.
 */

export type SaveKind = 'plan' | 'quotes';

export const SAVE_LIMITS = { name: 80, dataJson: 60000, perAccount: 30 } as const;

export interface SavePayload { kind: SaveKind; name: string; dataJson: string }

const clean = (s: string) => s.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();

/** Check a save before it is sent. Throws a message a visitor can read. */
export function buildSave(kind: SaveKind, name: string, dataJson: string): SavePayload {
  if (kind !== 'plan' && kind !== 'quotes') throw new Error('Unknown kind of save.');
  const n = clean(name).slice(0, SAVE_LIMITS.name);
  if (!n) throw new Error('Give it a name.');
  if (typeof dataJson !== 'string' || dataJson.length < 2) throw new Error('There is nothing to save yet.');
  if (dataJson.length > SAVE_LIMITS.dataJson) throw new Error('That is too big to save.');
  try { JSON.parse(dataJson); } catch { throw new Error('That could not be saved.'); }
  return { kind, name: n, dataJson };
}

const when = (d: Date) => d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });

/** A readable default name, so saving takes one click. */
export function defaultName(kind: SaveKind, detail: string, now: Date = new Date()): string {
  const base = kind === 'plan' ? 'Plan' : 'Quotes';
  return clean(`${base}${detail ? ': ' + detail : ''}, ${when(now)}`).slice(0, SAVE_LIMITS.name);
}

/** A simple shape check. The sign-in link itself proves the address is real. */
export function isEmail(s: string): boolean {
  const t = s.trim();
  return t.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t);
}

export const kindLabel = (k: SaveKind) => (k === 'plan' ? 'Plan' : 'Quote comparison');
