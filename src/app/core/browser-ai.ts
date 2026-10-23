/**
 * Optional help from the browser's own on-device AI (Chrome's built-in Gemini Nano, through the Prompt API).
 * It runs on the user's device and nothing is sent anywhere. Where the browser has none, the quote is read with
 * plain rules instead. Whatever it finds is always shown to the user to confirm, and any number that is not literally
 * in the quote text is thrown away (see acceptAiFields).
 */
import type { ReadFields } from './quote-check';

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
interface LanguageModelLike {
  availability(options?: unknown): Promise<Availability>;
  create(options?: unknown): Promise<{ prompt(input: string, options?: unknown): Promise<string>; destroy(): void }>;
}

const api = (): LanguageModelLike | null => {
  const g = globalThis as unknown as { LanguageModel?: LanguageModelLike };
  return g.LanguageModel && typeof g.LanguageModel.availability === 'function' ? g.LanguageModel : null;
};

const OPTIONS = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };

export async function browserAiAvailability(): Promise<Availability> {
  const lm = api();
  if (!lm) return 'unavailable';
  try { return await lm.availability(OPTIONS); } catch { return 'unavailable'; }
}

/** The lines that matter, so the quote fits the small on-device model. */
export function compressForAi(text: string, max = 3500): string {
  const keep = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && (/\d/.test(l) || /battery|panel|inverter|total|grant|seai|scaffold|install/i.test(l)));
  const out: string[] = [];
  let used = 0;
  for (const l of keep) { if (used + l.length > max) break; out.push(l); used += l.length + 1; }
  return out.join('\n');
}

const SCHEMA = {
  type: 'object',
  properties: {
    panels: { type: 'integer' }, watts: { type: 'integer' }, kwp: { type: 'number' }, batteryKwh: { type: 'number' },
    priceTotal: { type: 'number' }, priceAfterGrant: { type: 'number' }, grantSolar: { type: 'number' }, grantBattery: { type: 'number' },
    installer: { type: 'string' },
  },
  additionalProperties: false,
};

export const AI_PROMPT = `You read a quote for a home solar installation in Ireland. Return JSON with only these fields, using only values that appear in the text. Leave out any field you cannot find. Prices are euro numbers with no symbol.
panels: number of solar panels. watts: watts per panel. kwp: total system size in kWp. batteryKwh: battery size in kWh (usable if given).
priceTotal: the total price before any SEAI grant. priceAfterGrant: the total after SEAI grants. grantSolar and grantBattery: the SEAI grant amounts. installer: the installer's company name.

Quote text:
`;

/** Ask the on-device model to read the quote. Returns null when it is not available or fails. */
export async function readWithBrowserAi(text: string, onProgress?: (share: number) => void, signal?: AbortSignal): Promise<Partial<ReadFields> | null> {
  const lm = api();
  if (!lm) return null;
  let session: Awaited<ReturnType<LanguageModelLike['create']>> | null = null;
  try {
    if ((await lm.availability(OPTIONS)) === 'unavailable') return null;
    session = await lm.create({
      ...OPTIONS,
      signal,
      monitor(m: { addEventListener(type: string, cb: (e: { loaded: number }) => void): void }) { m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded)); },
    });
    const raw = await session.prompt(AI_PROMPT + compressForAi(text), { responseConstraint: SCHEMA, signal });
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Partial<ReadFields>) : null;
  } catch {
    return null;
  } finally {
    session?.destroy();
  }
}
