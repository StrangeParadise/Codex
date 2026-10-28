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
