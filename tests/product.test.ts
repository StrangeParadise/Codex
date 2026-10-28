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
