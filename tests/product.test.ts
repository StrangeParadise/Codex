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

test('product details include description, quantity and a safe photo URL', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({status: 1, product: { product_name: 'Oats', generic_name: 'Wholegrain rolled oats', quantity: '750 g', image_front_small_url: 'https://images.openfoodfacts.org/images/example.jpg' }}));
    const p = await lookup('4006381333931');
    assert.equal(p.description, 'Wholegrain rolled oats'); assert.equal(p.quantity, '750 g'); assert.ok(p.image);
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
