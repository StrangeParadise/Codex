import type { Listing } from './retailers.ts';
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g,' ').trim() : '';
export function parseCostcoProduct(value: unknown, barcode: string): Listing | null {
  const p = object(value);
  const name = text(p.name);
  const path = text(p.url);
  if (!name || !/^\/(?!\/)[^?#]*\/p\/[A-Za-z0-9_-]+$/.test(path)) return null;
  const classifications = Array.isArray(p.classifications) ? p.classifications : [];
  const features = classifications.flatMap(c => Array.isArray(object(c).features) ? object(c).features as unknown[] : []).map(object);
  const feature = (key: string) => {
    const f = features.find(f => text(f.name).toLowerCase() === key);
    return text(object(Array.isArray(f?.featureValues) ? f.featureValues[0] : null).value);
  };
  const codes = [p.ean,p.gtin,feature('ean'),feature('gtin'),feature('upc')].filter((v): v is string => typeof v === 'string' && /^\d{8,14}$/.test(v));
  const images = Array.isArray(p.images) ? p.images.map(object) : [];
  const imagePath = text((images.find(i => i.format === 'product' && i.imageType === 'PRIMARY') || images.find(i => i.format === 'product' && i.galleryIndex === 0) || images.find(i => i.imageType === 'PRIMARY') || images.find(i => i.galleryIndex === 0))?.url);
  const image = imagePath.startsWith('/medias/') ? `https://www.costco.com.au${imagePath}` : imagePath.startsWith('https://www.costco.com.au/medias/') ? imagePath : null;
  const price = object(p.price);
  const amount = p.randomWeight !== true && p.hidePriceValue !== true && p.membershipRestrictionApplied !== true && price.currencyIso === 'AUD' && typeof price.value === 'number' && Number.isFinite(price.value) && price.value > 0 ? price.value : null;
  return {retailer:'Costco AU', name, brand: feature('brand') || text(p.brand), description: text(p.summary) || text(p.description), quantity: '', image, price: amount,
    url: `https://www.costco.com.au${path}`, ingredients: typeof p.ingredients === 'string' ? text(p.ingredients) : '',
    categories: Array.isArray(p.categories) ? p.categories.map(c=>text(object(c).name)).join(' ') : '',
    exactBarcode: !!barcode && codes.some(code=>code.padStart(14,'0') === barcode.padStart(14,'0'))};
}
export async function costcoItem(item: string, barcode = ''): Promise<Listing | null> {
  if (!/^[A-Za-z0-9_-]{1,50}$/.test(item)) return null;
  try {
    const r = await fetch(`https://www.costco.com.au/rest/v2/australia/products/${encodeURIComponent(item)}?fields=FULL`, {signal:AbortSignal.timeout(8000)});
    if (!r.ok) return null;
    const data = await r.json();
    if (data.code !== item) return null;
    return parseCostcoProduct(data,barcode);
  } catch { return null; }
}
export async function costcoListings(barcode: string, query: string): Promise<Listing[]> {
  try {
    const r = await fetch(`https://www.costco.com.au/rest/v2/australia/products/search?query=${encodeURIComponent(query || barcode)}&pageSize=5&fields=FULL`, {signal:AbortSignal.timeout(10000)});
    if (!r.ok) return [];
    const data = await r.json();
    if (!Array.isArray(data.products)) return [];
    const results = await Promise.all(data.products.slice(0,5).map((p: RecordValue) => costcoItem(text(p.code),barcode)));
    return results.filter((p): p is Listing => p !== null);
  } catch { return []; }
}
