import test from 'node:test';
import assert from 'node:assert/strict';
import { score, validBarcode, lookup } from '../src/product.ts';
test('barcode checksum and length', () => {
  assert.equal(validBarcode('9300652012010'), false);
  assert.equal(validBarcode('4006381333931'), true);
  assert.equal(validBarcode('96385074'), true);
  assert.equal(validBarcode('123'), false);
});
test('score bounds, saturation and invalid data', () => {
  assert.equal(score({ sugars: 0, saturatedFat: 0, sodium: 0 })?.value, 100);
  assert.equal(score({ sugars: 100, saturatedFat: 100, sodium: 1000 })?.value, 0);
  assert.equal(score({ sugars: NaN, saturatedFat: 0, sodium: 0 }), null);
});
test('lookup preserves missing nutrients and converts sodium grams to milligrams', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ status: 1, product: { product_name: 'Example', nutriments: { sugars_100g: 2, 'saturated-fat_100g': 1, sodium_100g: 0.12 } } }));
    const p = await lookup('4006381333931'); assert.equal(p.sodium, 120); assert.ok(p.health);
    globalThis.fetch = async () => new Response(JSON.stringify({status: 1, product: {}}));
    assert.equal((await lookup('4006381333931')).health, null);
    globalThis.fetch = async () => new Response(JSON.stringify({status: 0}));
    await assert.rejects(lookup('4006381333931'), /not found/);
  } finally { globalThis.fetch = original; }
});

test('product details keep community nutrition but do not use community photos', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({status: 1, product: { product_name: 'Oats', generic_name: 'Wholegrain rolled oats', quantity: '750 g', image_front_small_url: 'https://images.openfoodfacts.org/images/example.jpg' }}));
    const p = await lookup('4006381333931');
    assert.equal(p.description, 'Wholegrain rolled oats'); assert.equal(p.quantity, '750 g'); assert.equal(p.image, null);
  } finally { globalThis.fetch = original; }
});

test('only Australian whole-item prices are shown, with shop and date', async () => {
  const { lookupPrice } = await import('../src/product.ts');
  const original = globalThis.fetch;
  const row = { product_code: '4006381333931', currency: 'AUD', price: '4.50', price_per: 'UNIT', date: '2026-01-10', price_is_discounted: true, location: { osm_address_country_code: 'AU', osm_name: 'Example Shop', osm_address_city: 'Sydney' } };
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({items: [{ ...row, currency: 'EUR' }, { ...row, price_per: 'KILOGRAM' }, { ...row, price: null }, { ...row, product_code: '96385074' }, { ...row, date: '2099-01-01' }, row]}));
    assert.deepEqual(await lookupPrice('4006381333931'), { status: 'found', amount: 4.5, store: 'Example Shop, Sydney', date: '2026-01-10', discount: true });
    globalThis.fetch = async () => new Response(JSON.stringify({items: []}));
    assert.deepEqual(await lookupPrice('4006381333931'), {status: 'missing'});
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.deepEqual(await lookupPrice('4006381333931'), {status: 'unavailable'});
    globalThis.fetch = async () => new Response('', {status: 503});
    assert.deepEqual(await lookupPrice('4006381333931'), {status: 'unavailable'});
  } finally { globalThis.fetch = original; }
});

test('official products require exact barcode match and use retailer photo and price', async () => {
  const { lookupOfficial } = await import('../src/official.ts');
  const original = globalThis.fetch;
  try {
    const product = { Barcode: '9300633394172', Stockcode: 749792, Name: 'Spring Water', Price: 4.95, LargeImageFile: 'https://cdn0.woolworths.media/content/wowproductimages/large/749792.jpg', AdditionalAttributes: { ingredients: '100% Natural Spring Water' } };
    globalThis.fetch = async () => new Response(JSON.stringify({ Products: [{ Products: [product] }] }));
    const p = await lookupOfficial('9300633394172');
    assert.equal(p?.price, 4.95); assert.ok(p?.image); assert.equal(p?.ingredients, '100% Natural Spring Water');
    assert.equal(await lookupOfficial('4006381333931'), null);
    globalThis.fetch = async () => new Response('', {status: 403});
    assert.equal(await lookupOfficial('9300633394172'), null);
  } finally { globalThis.fetch = original; }
});
test('plain water gets an explained estimate; flavoured water and missing data are not assumed healthy', async () => {
  const { classifyProduct } = await import('../src/official.ts');
  assert.equal(classifyProduct('Spring Water', '', '100% Natural Spring Water').estimate, 100);
  assert.equal(classifyProduct('Flavoured Water', '', 'Water, sugar, flavour').estimate, null);
  assert.equal(classifyProduct('Spring Water', '', '').estimate, null);
  assert.equal(classifyProduct('Shampoo', 'Hair care', '').kind, 'nonfood');
  assert.equal(classifyProduct('Shampoo', 'Hair care', '').estimate, null);
});

test('supplier barcode for single water bottle uses verified official match, not six-pack', async () => {
  const original = globalThis.fetch;
  const bottle = { Barcode: '9300633394189', Stockcode: 749793, Name: 'Woolworths Spring Water Bottle', Price: 0.95, LargeImageFile: 'https://cdn0.woolworths.media/content/wowproductimages/large/749793.jpg', AdditionalAttributes: { ingredients: '100% Natural Spring Water' } };
  try {
    globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes('woolworths.com.au') ? { Products: [{ Products: [bottle] }] } : {status: 1, product: {product_name: 'Spring Water'}}));
    const p = await lookup('9339687069767');
    assert.equal(p.officialPrice, 0.95); assert.ok(p.image?.endsWith('749793.jpg')); assert.equal(p.health?.value, 100);
    assert.equal(p.estimated, true); assert.equal(p.officialIssue, '');
  } finally { globalThis.fetch = original; }
});
test('official page fallback preserves exact match and reports blocked sources', async () => {
  const { lookupOfficial } = await import('../src/official.ts');
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => String(url).includes('/apis/') ? new Response('', {status: 403}) : new Response('<script type="application/ld+json">{"@type":"Product","gtin":"9300633394189","sku":"749793","name":"Spring Water","image":"https://cdn0.woolworths.media/content/wowproductimages/large/749793.jpg","offers":{"priceCurrency":"AUD","price":0.95}}</script><script>{"ingredients":"100% Natural Spring Water"}</script>');
    assert.equal((await lookupOfficial('9339687069767'))?.price, 0.95);
    globalThis.fetch = async () => new Response('', {status: 403});
    let issue = '';
    assert.equal(await lookupOfficial('9339687069767', message => { issue = message; }), null);
    assert.match(issue, /could not be reached/);
  } finally { globalThis.fetch = original; }
});
