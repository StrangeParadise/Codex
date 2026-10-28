export type Retailer = 'Woolworths' | 'ALDI' | 'Coles' | 'IGA' | 'Costco AU';
export type Listing = {
  retailer: Retailer; name: string; brand: string; description: string; quantity: string;
  image: string | null; price: number | null; url: string; ingredients: string; categories: string;
  exactBarcode: boolean;
};
const text = (v: unknown): string => typeof v === 'string' ? v.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').trim() : '';
const amount = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
const gtin = (v: string) => v.padStart(14, '0');

export async function woolworthsListings(barcode: string, searchTerm = barcode): Promise<Listing[]> {
  try {
    const r = await fetch(`https://www.woolworths.com.au/apis/ui/Search/products?searchTerm=${encodeURIComponent(searchTerm)}&pageSize=5&pageNumber=1`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const data = await r.json();
    if (!Array.isArray(data.Products)) return [];
    const listings: Listing[] = [];
    for (const group of data.Products) {
      if (!Array.isArray(group?.Products)) continue;
      for (const p of group.Products) {
        if (!Number.isInteger(p.Stockcode) || p.Stockcode <= 0 || !text(p.Name)) continue;
        const a = p.AdditionalAttributes ?? {};
        const image = text(p.LargeImageFile);
        listings.push({ retailer: 'Woolworths', name: text(p.Name), brand: text(p.Brand), description: text(p.RichDescription || p.Description), quantity: text(p.PackageSize),
          image: /^https:\/\/cdn\d+\.woolworths\.media\//.test(image) ? image : null,
          price: amount(p.Price), url: `https://www.woolworths.com.au/shop/productdetails/${p.Stockcode}`,
          ingredients: text(a.ingredients), categories: [a.sapcategoryname, a.piessubcategorynamesjson, a.piesdepartmentnamesjson].map(text).join(' '),
          exactBarcode: typeof p.Barcode === 'string' && gtin(p.Barcode) === gtin(barcode) });
      }
    }
    return listings;
  } catch { return []; }
}

export function parseAldiPage(html: string, url: string, barcode: string): Listing | null {
  if (!url.startsWith('https://www.aldi.com.au/product/')) return null;
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let p;
    try { p = JSON.parse(match[1]); } catch { continue; }
    if (p?.['@type'] !== 'Product' || !text(p.name)) continue;
    const image = Array.isArray(p.image) ? p.image[0] : p.image;
    const price = p.offers?.priceCurrency === 'AUD' ? amount(typeof p.offers.price === 'string' && /^\d+(\.\d+)?$/.test(p.offers.price) ? Number(p.offers.price) : p.offers.price) : null;
    const code = p.gtin13 || p.gtin || p.gtin14 || p.gtin8 || p.gtin12;
    return { retailer: 'ALDI', name: text(p.name), brand: text(p.brand?.name), description: text(p.description), quantity: '',
      image: typeof image === 'string' && image.startsWith('https://dm.apac.cms.aldi.cx/') ? image : null,
      price, url, ingredients: '', categories: '', exactBarcode: typeof code === 'string' && gtin(code) === gtin(barcode) };
  }
  return null;
}
export async function aldiListings(barcode: string, query: string): Promise<Listing[]> {
  try {
    const response = await fetch(`https://www.aldi.com.au/results?q=${encodeURIComponent(query || barcode)}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return [];
    const html = await response.text();
    const paths = [...new Set([...html.matchAll(/href="(\/product\/[^"?#]+)"/g)].map(m => m[1]))].slice(0, 3);
    const results = await Promise.all(paths.map(async path => {
      try {
        const url = `https://www.aldi.com.au${path}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        return r.ok ? parseAldiPage(await r.text(), url, barcode) : null;
      } catch { return null; }
    }));
    return results.filter((r): r is Listing => r !== null);
  } catch { return []; }
}

export type ProductIdentity = { name: string; brand: string; quantity: string };
const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sizePattern = /(\d+(?:\.\d+)?)\s*(ml|kg|litres?|liters?|grams?|l|g)\b/i;
function packSize(value: string): string | null {
  const m = value.match(sizePattern);
  if (!m) {
    const count = value.match(/\b(\d+)\s*(?:pack|pk|count|ct)\b/i);
    return count ? `${count[1]}count` : null;
  }
  const unit = m[2].toLowerCase();
  const volume = /^(ml|l|lit)/.test(unit);
  const amount = Number(m[1]) * (unit === 'kg' || (volume && unit !== 'ml') ? 1000 : 1);
  const before = value.slice(0, m.index);
  const after = value.slice((m.index ?? 0) + m[0].length);
  const count = before.match(/(\d+)\s*[x×]\s*$/i)?.[1] || after.match(/^\s*[x×]\s*(\d+)/i)?.[1] || value.match(/\b(\d+)\s*(?:pack|pk|count|ct)\b/i)?.[1] || '1';
  return `${count}x${amount}${volume ? 'ml' : 'g'}`;
}
function productName(name: string, brand: string) {
  const cleaned = name.replace(new RegExp(sizePattern.source, 'gi'), ' ').replace(/\b\d+\s*(?:pack|pk|count|ct)\b/gi, ' ').replace(/\b\d+\s*[x×]|[x×]\s*\d+\b/gi, ' ');
  const brandWords = new Set(normalize(brand).split(' '));
  return normalize(cleaned).split(' ').filter(word => word && !brandWords.has(word) && !['bottle', 'bottles', 'pack', 'pk', 'count', 'ct', 'x'].includes(word)).sort().join(' ');
}

/** Accept an exact GTIN, or corroborated identity. Never take the first fuzzy result. */
export function selectConfidentListing(listings: Listing[], identity: ProductIdentity, barcodeSearch: boolean): Listing | null {
  const unique = [...new Map(listings.map(p => [p.url, p])).values()];
  const exact = unique.filter(p => p.exactBarcode);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const brands = identity.brand.split(',').map(normalize).filter(Boolean);
  if (!identity.name || !brands.length) return null;
  const size = packSize(identity.quantity) ?? packSize(identity.name);
  const matches = unique.filter(p => {
    if (!brands.includes(normalize(p.brand))) return false;
    const wanted = productName(identity.name, p.brand);
    if (!wanted || wanted !== productName(p.name, p.brand)) return false;
    const candidateSize = packSize(p.quantity) ?? packSize(p.name);
    // Name search needs matching brand, variant AND pack size. A single result
    // from a barcode-specific search may omit a size in the independent record.
    if (size && candidateSize) return size === candidateSize;
    return barcodeSearch && unique.length === 1 && size === null;
  });
  return matches.length === 1 ? matches[0] : null;
}
