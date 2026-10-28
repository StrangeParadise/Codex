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
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,nutriments`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Product service returned ${response.status}. Try again later.`);
  const data = await response.json();
  if (data.status !== 1 || !data.product) throw new Error('Product not found. Australian coverage varies.');
  const p = data.product;
  const n = p.nutriments ?? {};
  const numeric = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  const sugars = numeric(n.sugars_100g);
  const saturatedFat = numeric(n['saturated-fat_100g']);
  const sodiumGrams = numeric(n.sodium_100g);
  const sodium = sodiumGrams === null ? null : sodiumGrams * 1000;
  return { name: p.product_name || 'Unnamed product', brand: p.brands || '', sugars, saturatedFat, sodium,
    health: sugars !== null && saturatedFat !== null && sodium !== null ? score({ sugars, saturatedFat, sodium }) : null };
}
