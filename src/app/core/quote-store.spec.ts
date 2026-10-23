import { firestoreBody, quoteRecord, storeQuote } from './quote-store';
import { readQuoteText } from './quote-check';

const QUOTE = `Sunrise Energy Ltd
www.sunrise-energy.ie
info@sunrise-energy.ie
Prepared for: Mary Murphy
14 Oak Road, Cork, T12 AB34
Tel 087 123 4567  MPRN 10012345678
16 x 470W solar panels   €6,400.00
Hybrid inverter and 6.9 kWh battery   €5,200
Scaffold   €400
Total price   €12,345.00
SEAI solar grant   €1,800
Total after grants   €10,545.00`;

describe('what we keep from a quote', () => {
  const f = readQuoteText(QUOTE);
  const rec = quoteRecord(f, 'rules')!;
  const body = JSON.stringify(firestoreBody(rec));

  it('keeps the specification, the breakdown, and the installer name and website', () => {
    expect(rec.installer).toBe('Sunrise Energy Ltd');
    expect(rec.website).toBe('sunrise-energy.ie');
    const data = JSON.parse(rec.dataJson);
    expect(data.spec.panels).toBe(16);
    expect(data.prices.total).toBe(12345);
    expect(data.items.map((i: { label: string }) => i.label)).toEqual(expect.arrayContaining(['16 x 470W solar panels', 'Scaffold']));
  });
  it('never carries a name, address, phone, meter number or email', () => {
    for (const secret of ['Murphy', 'Oak Road', 'Cork', 'T12', '087', '10012345678', 'info@', 'Prepared']) expect(body).not.toContain(secret);
  });
  it('has no raw text field', () => {
    expect(Object.keys(firestoreBody(rec).fields).sort()).toEqual(['dataJson', 'installer', 'reader', 'website']);
  });
  it('returns nothing when no figures were read', () => expect(quoteRecord({}, 'rules')).toBeNull());
  it('does nothing until a key is set', async () => {
    expect(await storeQuote(f, 'rules', { projectId: 'p', apiKey: '', collection: 'c' })).toBe(false);
  });
});
