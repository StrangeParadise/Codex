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
    assert.equal((await lookup('4006381333931')).known, false);
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


test('products from any shop keep nutrition when Woolworths has no listing', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('woolworths') ? {Products: []} : { status: 1, product: { product_name: 'Coles oats', brands: 'Coles', nutriments: {sugars_100g: 1, 'saturated-fat_100g': 1, sodium_100g: 0.01} } }));
    const p = await lookup('4006381333931');
    assert.equal(p.known, true); assert.equal(p.name, 'Coles oats'); assert.ok(p.health);
    assert.equal('officialIssue' in p, false);
  } finally { globalThis.fetch = original; }
});
test('barcode-specific result with matching brand and product resolves automatically', async () => {
  const original = globalThis.fetch;
  try {
    const bottle = { Barcode: '9300633394189', Stockcode: 749793, Brand: 'Woolworths', Name: 'Woolworths Spring Water Bottle', PackageSize: '1.5L', Price: 0.95, LargeImageFile: 'https://cdn0.woolworths.media/content/wowproductimages/large/749793.jpg', AdditionalAttributes: {ingredients: '100% Natural Spring Water'} };
    globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('woolworths') ? {Products: [{Products: [bottle]}]} : {status: 1, product: {product_name: 'Spring Water', brands: 'Woolworths'}}));
    const p = await lookup('9339687069767');
    assert.equal(p.officialPrice, 0.95); assert.ok(p.image); assert.equal(p.health?.value, 100);
    assert.equal(p.known, true); assert.equal('candidates' in p, false);
  } finally { globalThis.fetch = original; }
});
test('exact retailer barcode can populate the product without confirmation', async () => {
  const { woolworthsListings } = await import('../src/retailers.ts');
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({Products: [{Products: [{Barcode: '4006381333931', Stockcode: 123, Name: 'Example', Price: 3.2}]}]}));
    const [p] = await woolworthsListings('4006381333931');
    assert.equal(p.exactBarcode, true); assert.equal(p.price, 3.2);
    globalThis.fetch = async () => new Response('', {status:403});
    assert.deepEqual(await woolworthsListings('4006381333931'), []);
  } finally { globalThis.fetch = original; }
});
test('ALDI official pages supply labelled candidates, never match on a similar name', async () => {
  const { parseAldiPage } = await import('../src/retailers.ts');
  const data = { '@type': 'Product', name: 'Soda Water 1.25L', brand: {name:'REGAL'}, image: ['https://dm.apac.cms.aldi.cx/product.jpg'], offers: {price: '1.09',priceCurrency:'AUD'} };
  const html = `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  const p = parseAldiPage(html, 'https://www.aldi.com.au/product/regal-soda-water', '4006381333931');
  assert.equal(p?.retailer, 'ALDI'); assert.equal(p?.price, 1.09); assert.ok(p?.image); assert.equal(p?.exactBarcode, false);
  assert.equal(parseAldiPage(html, 'https://unrelated.example/product', '4006381333931'), null);
  assert.equal(parseAldiPage('browser challenge', 'https://www.aldi.com.au/product/test', '4006381333931'), null);
});
test('plain water estimates and non-food guidance remain independent of the retailer', async () => {
  const { classifyProduct } = await import('../src/official.ts');
  assert.equal(classifyProduct('Water', '', '100% Natural Spring Water').estimate,100);
  assert.equal(classifyProduct('Flavoured water', '', 'Water, sugar').estimate,null);
  assert.equal(classifyProduct('Shampoo', 'Hair care', '').kind,'nonfood');
});

test('automatic matching rejects different brands, flavours, sizes and ambiguous results', async () => {
  const { selectConfidentListing, parseAldiPage } = await import('../src/retailers.ts');
  const data = { '@type': 'Product', name: 'Soda Water 1.25L', brand: {name:'REGAL'}, image: ['https://dm.apac.cms.aldi.cx/product.jpg'], offers: {price: '1.09',priceCurrency:'AUD'} };
  const listing = parseAldiPage(`<script type="application/ld+json">${JSON.stringify(data)}</script>`, 'https://www.aldi.com.au/product/soda', '4006381333931')!;
  const identity = {name:'Soda Water',brand:'Regal',quantity:'1250 ml'};
  assert.equal(selectConfidentListing([listing], identity, false)?.price, 1.09);
  assert.equal(selectConfidentListing([listing], {...identity,brand:'Other'}, false), null);
  assert.equal(selectConfidentListing([listing], {...identity,name:'Soda Water With Lime'}, false), null);
  assert.equal(selectConfidentListing([listing], {...identity,quantity:'6 x 1.25L'}, false), null);
  assert.equal(selectConfidentListing([listing], {...identity,quantity:''}, false), null);
  assert.equal(selectConfidentListing([listing, {...listing,url:listing.url+'-2'}], identity, false), null);
  assert.equal(selectConfidentListing([{...listing,quantity:'1.5L x 6 pack',name:'Water'}], {name:'Water',brand:'Regal',quantity:'9L'}, false), null);
});
test('ALDI photo and price load automatically when independent brand, name and size agree', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async url => {
      const target = String(url);
      if (target.includes('woolworths')) return new Response(JSON.stringify({Products:[]}));
      if (target.includes('openfoodfacts')) return new Response(JSON.stringify({status:1,product:{product_name:'Soda Water',brands:'Regal',quantity:'1.25L'}}));
      if (target.includes('/results?')) return new Response('<a href="/product/regal-soda-water">Soda water</a>');
      return new Response('<script type="application/ld+json">{"@type":"Product","name":"Soda Water 1.25L","brand":{"name":"REGAL"},"image":["https://dm.apac.cms.aldi.cx/product.jpg"],"offers":{"price":"1.09","priceCurrency":"AUD"}}</script>');
    };
    const p = await lookup('4006381333931');
    assert.equal(p.retailer, 'ALDI'); assert.equal(p.officialPrice, 1.09); assert.ok(p.image);
    assert.equal('candidates' in p, false);
  } finally { globalThis.fetch = original; }
});
