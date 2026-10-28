export type OfficialProduct = {
  name: string; brand: string; description: string; quantity: string;
  image: string | null; price: number | null; url: string; ingredients: string; categories: string;
};
export async function lookupOfficial(barcode: string): Promise<OfficialProduct | null> {
  try {
    const r = await fetch(`https://www.woolworths.com.au/apis/ui/Search/products?searchTerm=${encodeURIComponent(barcode)}&pageSize=5&pageNumber=1`, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data.Products)) return null;
    for (const group of data.Products) {
      if (!Array.isArray(group?.Products)) continue;
      for (const p of group.Products) {
        if (typeof p.Barcode !== 'string' || p.Barcode.padStart(14, '0') !== barcode.padStart(14, '0') || !Number.isInteger(p.Stockcode) || p.Stockcode <= 0) continue;
        const text = (v: unknown) => typeof v === 'string' ? v.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').trim() : '';
        const a = p.AdditionalAttributes ?? {};
        const image = text(p.LargeImageFile);
        const imageAllowed = /^https:\/\/cdn\d+\.woolworths\.media\//.test(image);
        return { name: text(p.Name), brand: text(p.Brand), description: text(p.RichDescription || p.Description), quantity: text(p.PackageSize), image: imageAllowed ? image : null,
          price: typeof p.Price === 'number' && Number.isFinite(p.Price) && p.Price > 0 ? p.Price : null,
          url: `https://www.woolworths.com.au/shop/productdetails/${p.Stockcode}`,
          ingredients: text(a.ingredients), categories: [a.sapcategoryname, a.piessubcategorynamesjson, a.piesdepartmentnamesjson].map(text).join(' ') };
      }
    }
    return null;
  } catch { return null; }
}
export function classifyProduct(name: string, categories: string, ingredients: string) {
  const description = `${name} ${categories}`.toLowerCase();
  if (/\b(shampoo|conditioner|body wash|laundry|dishwashing|toothpaste|deodorant|cleaning|hair care|skin care)\b/.test(description)) {
    return { kind: 'nonfood' as const, estimate: null, explanation: 'You can have it if you need it. Use it as directed on the label. This is not food or drink.' };
  }
  const plainWater = /^(100%\s*)?(natural\s*)?(spring|mineral|purified|filtered|drinking)?\s*water\.?$/i.test(ingredients.trim());
  if (plainWater && /water/i.test(name)) return { kind: 'food' as const, estimate: 100, explanation: 'Estimated 100/100 for plain water, based on the listed ingredients. This is a food-type guide, not a lab result.' };
  if (/\b(fresh fruit|fresh vegetables)\b/.test(categories.toLowerCase())) return { kind: 'food' as const, estimate: 85, explanation: 'Estimated 85/100 for fresh fruit or vegetables. Based on food type because nutrition details are incomplete.' };
  return { kind: 'food' as const, estimate: null, explanation: 'There is not enough information for a useful score yet. Missing nutrition values do not mean zero.' };
}
