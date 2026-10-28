import { lookupOfficial, classifyProduct } from './official.ts';
export type Nutrition = { sugars: number; saturatedFat: number; sodium: number };
export function score(n: Nutrition) {
  if (Object.values(n).some(v => !Number.isFinite(v) || v < 0)) return null;
  const parts = [
    { label: 'Sugars', penalty: Math.min(40, n.sugars / 22.5 * 40) },
    { label: 'Saturated fat', penalty: Math.min(35, n.saturatedFat / 5 * 35) },
    { label: 'Sodium', penalty: Math.min(25, n.sodium / 600 * 25) },
  ];
  return { value: Math.round(100 - parts.reduce((s, p) => s + p.penalty, 0)), parts };
}
export function validBarcode(value: string) {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop();
  return (10 - digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0) % 10) % 10 === check;
}
export async function lookup(barcode: string) {
  if (!validBarcode(barcode)) throw new Error('Enter a valid EAN or UPC barcode, including its check digit.');
  const [official, foodResponse] = await Promise.all([
    lookupOfficial(barcode),
    fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,nutriments,generic_name,quantity,categories,ingredients_text`, { signal: AbortSignal.timeout(15000) }).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  const p = foodResponse?.status === 1 ? foodResponse.product ?? {} : {};
  if (!official && foodResponse?.status !== 1) throw new Error('Product not found. Check your connection or try another barcode.');
  const n = p.nutriments ?? {};
  const numeric = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  const sugars = numeric(n.sugars_100g);
  const saturatedFat = numeric(n['saturated-fat_100g']);
  const sodiumGrams = numeric(n.sodium_100g);
  const sodium = sodiumGrams === null ? null : sodiumGrams * 1000;
  const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';
  const assessment = classifyProduct(official?.name || text(p.product_name), official?.categories || text(p.categories), official?.ingredients || text(p.ingredients_text));
  const measured = sugars !== null && saturatedFat !== null && sodium !== null ? score({ sugars, saturatedFat, sodium }) : null;
  const estimated = !measured && assessment.estimate !== null;
  const health = assessment.kind === 'nonfood' ? null : measured || (estimated ? { value: assessment.estimate!, parts: [] } : null);
  return { name: official?.name || text(p.product_name) || 'Unnamed product', brand: official?.brand || text(p.brands),
    description: official?.description || text(p.generic_name), quantity: official?.quantity || text(p.quantity),
    image: official?.image ?? null, officialUrl: official?.url ?? null,
    officialPrice: official?.price ?? null, kind: assessment.kind, estimated, explanation: assessment.explanation,
    sugars, saturatedFat, sodium, health };

}

export type PriceResult = { status: 'found'; amount: number; store: string; date: string; discount: boolean; official?: boolean; url?: string } | { status: 'missing' | 'unavailable' };

// Open Prices records are observations, never a promise of today's shelf price.
export async function lookupPrice(barcode: string): Promise<PriceResult> {
  if (!validBarcode(barcode)) return { status: 'missing' };
  try {
    const response = await fetch(`https://prices.openfoodfacts.org/api/v1/prices/?product_code=${barcode}&currency=AUD&order_by=-date&size=50`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { status: 'unavailable' };
    const data = await response.json();
    if (!Array.isArray(data.items)) return { status: 'unavailable' };
    const today = new Date().toISOString().slice(0, 10);
    for (const row of data.items) {
      if (!row || typeof row !== 'object') continue;
      // Reject unit prices, other currencies/countries, future dates and wrong products.
      if (row.product_code !== barcode || row.currency !== 'AUD' || row.price_per !== 'UNIT' || row.location?.osm_address_country_code?.toLowerCase() !== 'au') continue;
      const amount = typeof row.price === 'number' ? row.price : typeof row.price === 'string' && /^\d+(\.\d+)?$/.test(row.price) ? Number(row.price) : NaN;
      if (!Number.isFinite(amount) || amount <= 0 || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.date > today) continue;
      const parsed = new Date(`${row.date}T00:00:00Z`);
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== row.date) continue;
      const name = row.location?.osm_name;
      const city = row.location?.osm_address_city;
      return { status: 'found', amount, store: [name, city].filter(v => typeof v === 'string' && v.trim()).join(', ') || 'Australian shop (name not listed)', date: row.date, discount: row.price_is_discounted === true };
    }
    return { status: 'missing' };
  } catch { return { status: 'unavailable' }; }
}
