/**
 * Keeps the details of a quote that help our price comparison: the solar specification, the price breakdown and the
 * installer's name and website. It never keeps the quote text or file, or anything about the customer such as a name,
 * address, email, phone, Eircode or meter number. What is sent is built from the figures the visitor confirmed.
 * It is a create-only Firestore write (see firestore.rules), does nothing until STORE.apiKey is set, and a failure
 * here never affects the visitor.
 */
import type { LineItem, ReadFields } from './quote-check';
import { FIREBASE_CONFIG } from './firebase-config';

export const STORE = {
  projectId: 'greenwattz-eu',
  /** The Firebase web API key. It is public by design; restrict it to the Firestore API in Google Cloud. Empty keeps storage off. */
  apiKey: FIREBASE_CONFIG.apiKey,
  collection: 'quotes',
};

export type Reader = 'rules' | 'ai';

export interface QuoteRecord {
  reader: Reader;
  installer?: string;
  website?: string;
  /** JSON of { spec, prices, items, included }. */
  dataJson: string;
}

const MAX_DATA = 6000;
const clean = (s: string | undefined, max: number) => (s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) || undefined;

/** Build the record from confirmed fields. Returns null when there is nothing useful to keep. */
export function quoteRecord(f: ReadFields, reader: Reader): QuoteRecord | null {
  const spec = { panels: f.panels, watts: f.watts, kwp: f.kwp, batteryKwh: f.batteryKwh };
  const prices = { total: f.priceTotal, afterGrant: f.priceAfterGrant, grantSolar: f.grantSolar, grantBattery: f.grantBattery };
  const hasSpec = Object.values(spec).some((v) => v !== undefined);
  const hasPrice = Object.values(prices).some((v) => v !== undefined);
  if (!hasSpec && !hasPrice) return null;
  let items: LineItem[] = (f.items ?? []).map((i) => ({ label: i.label.slice(0, 80), amount: i.amount }));
  let dataJson = '';
  do {
    dataJson = JSON.stringify({ spec, prices, items, included: f.included ?? [] });
    if (dataJson.length <= MAX_DATA) break;
    items = items.slice(0, -1);
  } while (items.length);
  if (dataJson.length > MAX_DATA) return null;
  return { reader, installer: clean(f.installer, 120), website: clean(f.website, 120), dataJson };
}

export function firestoreBody(r: QuoteRecord) {
  const fields: Record<string, { stringValue: string }> = { reader: { stringValue: r.reader }, dataJson: { stringValue: r.dataJson } };
  if (r.installer) fields['installer'] = { stringValue: r.installer };
  if (r.website) fields['website'] = { stringValue: r.website };
  return { fields };
}

/** Fire and forget. Resolves to whether the record was stored. */
export async function storeQuote(f: ReadFields, reader: Reader, store = STORE): Promise<boolean> {
  if (!store.apiKey) return false;
  const rec = quoteRecord(f, reader);
  if (!rec) return false;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${store.projectId}/databases/(default)/documents/${store.collection}?key=${encodeURIComponent(store.apiKey)}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(firestoreBody(rec)), keepalive: true });
    return res.ok;
  } catch {
    return false;
  }
}
