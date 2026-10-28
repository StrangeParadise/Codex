export function validBarcode(value: string) {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop();
  return (10 - digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0) % 10) % 10 === check;
}
export type ScanCode = { kind: 'barcode'; barcode: string } | { kind: 'costco'; item: string } | { kind: 'website'; url: string };
function checked(value: string): ScanCode {
  if (!validBarcode(value)) throw new Error('That product number failed its check. Please scan again or check the printed digits.');
  return {kind:'barcode', barcode: value.length === 14 && value.startsWith('0') ? value.slice(1) : value};
}
export function parseScan(raw: string, type?: string): ScanCode {
  const value = raw.trim();
  if (type === 'upc_e' && /^[01]\d{7}$/.test(value)) {
    const [ns,a,b,c,d,e,f,check] = value;
    const body = Number(f) <= 2 ? `${ns}${a}${b}${f}0000${c}${d}${e}` : f === '3' ? `${ns}${a}${b}${c}00000${d}${e}` : f === '4' ? `${ns}${a}${b}${c}${d}00000${e}` : `${ns}${a}${b}${c}${d}${e}0000${f}`;
    return checked(body + check);
  }
  // GS1 element strings: human-readable (01), or FNC1 with optional AIM prefix.
  const gs1 = value.match(/^\(01\)(\d{14})(?=\(|$)/) || value.match(/^(?:\](?:d2|Q3|C1))?01(\d{14})(?=\x1d|\d|$)/);
  if (gs1) return checked(gs1[1]);
  if (/^\d+$/.test(value)) return checked(value);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('This code does not contain a product number. Try the striped barcode on the pack.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('This code is not a supported product link.');
  // GS1 Digital Link stores the GTIN in application identifier 01, not an arbitrary URL number.
  const pathGtin = url.pathname.match(/(?:^|\/)01\/(\d{14})(?:\/|$)/)?.[1];
  const queryGtin = ['gtin','ean','upc'].map(key => url.searchParams.get(key)).find(Boolean);
  if (pathGtin || queryGtin) return checked(pathGtin || queryGtin!);
  if (['www.costco.com.au','costco.com.au'].includes(url.hostname.toLowerCase())) {
    const item = url.pathname.match(/\/p\/([A-Za-z0-9_-]+)\/?$/)?.[1];
    if (item) return {kind:'costco', item};
  }
  return {kind:'website', url: url.toString()};
}
