export type Retailer = 'Woolworths' | 'ALDI' | 'Coles' | 'IGA';
export type Listing = {
  retailer: Retailer; name: string; brand: string; description: string; quantity: string;
  image: string | null; price: number | null; url: string; ingredients: string; categories: string;
  exactBarcode: boolean;
};
const text = (v: unknown): string => typeof v === 'string' ? v.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').trim() : '';
const amount = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
const gtin = (v: string) => v.padStart(14, '0');

export function storeLinks(query: string) {
  const q = encodeURIComponent(query);
  return [
    { name: 'Woolworths', url: `https://www.woolworths.com.au/shop/search/products?searchTerm=${q}`, label: 'Search Woolworths' },
    { name: 'Coles', url: `https://www.coles.com.au/search?q=${q}`, label: 'Search Coles' },
    { name: 'ALDI', url: `https://www.aldi.com.au/results?q=${q}`, label: 'Search ALDI' },
    { name: 'IGA', url: 'https://www.igashop.com.au/', label: 'Choose your IGA store' },
  ];
}

export async function woolworthsListings(barcode: string): Promise<Listing[]> {
  try {
    const r = await fetch(`https://www.woolworths.com.au/apis/ui/Search/products?searchTerm=${encodeURIComponent(barcode)}&pageSize=5&pageNumber=1`, { signal: AbortSignal.timeout(10000) });
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
