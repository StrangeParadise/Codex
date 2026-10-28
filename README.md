# Can I have it?

Personal iPhone prototype using Expo and TypeScript. Scan EAN/UPC barcodes, QR codes or Data Matrix codes (including GS1 Digital Links), or paste a code/link manually, then query Open Food Facts for nutrition. No account or backend is required. Product requests send the scanned barcode to Woolworths, Open Food Facts and, when needed, ALDI, Costco AU and Open Prices. No scan history is stored.

## Development

Use Node 24 and npm. From `/workspace/Codex`:

```
npm ci
npm run typecheck
npm test
npx expo start --offline --localhost
```

Each cloud task is isolated: use this checkout; do not create a worktree unless requested. A cloud-local Metro server cannot be reached directly from your iPhone. For device testing, copy/clone the project onto your computer, run `npm ci` and `npx expo start`, and scan its QR code with a compatible Expo Go on the same Wi-Fi. If this SDK is newer than your installed Expo Go, use a matching development build. Building/signing native iOS locally requires macOS and Xcode. Cloud validation does not validate camera behavior or iOS signing.

## Data and limitations

Product identification and nutrition come from Open Food Facts, independently of retailer matches. A missing shop match is normal and does not produce a red error. Unknown products retain their barcode with a simple unavailable state. There is no shop-finder or customer confirmation flow. Official photos remain official-only; no community photo is relabelled as official.

| Shop/source | Current support |
| --- | --- |
| Woolworths | Automatic official barcode search. Exact GTIN matches populate the result. Otherwise the single retailer barcode-search result can be accepted when its brand and product name agree with the independent barcode record, and sizes agree when supplied. |
| ALDI | Automatic fallback search of official product pages. A photo and price are accepted only for an exact GTIN or a unique match of brand, product variant and pack size against the independent barcode record. |
| Costco AU | Automatic search of the public official catalogue and product details. Exact GTIN or matching independent brand, variant and size required. Official Costco product QR links can load that item directly. Member-hidden, missing and variable-weight prices are not shown as a fixed public price. Online and warehouse prices may differ. |
| Coles | Not integrated. Automated requests returned a browser challenge during validation. |
| IGA | Not integrated. Automated shopping requests returned HTTP 403 during validation. |
| Open Prices | Community AUD whole-item price records from Australian shops, with reported dates; fallback when no official price is available. |

There are no hard-coded product aliases or special water-price records. Matches are selected automatically. Ambiguous listings, conflicting brands/variants and conflicting pack sizes are rejected. Name searches require a known matching pack size; a unique barcode-search result can use corroborating brand/name when the independent record omits size. Official online prices can differ from local shelf or delivery prices. No location or store session is selected automatically. Public website formats may change. Broad automatic price coverage across all supermarkets remains unfinished; Coles and IGA require a supported data integration before that can be claimed.

Network sources: www.woolworths.com.au, cdn0.woolworths.media (and other numbered image CDNs), www.aldi.com.au, dm.apac.cms.aldi.cx, www.costco.com.au, world.openfoodfacts.org and prices.openfoodfacts.org. The scan or product search text is sent to the selected service. No scan history is retained. Open Food Facts and Open Prices contributors supply community data under ODbL. Check packaging and shelf labels; data can be incomplete or outdated.

## Experimental score v0

Start at 100, subtract `min(40, sugars_g / 22.5 * 40)`, `min(35, saturated_fat_g / 5 * 35)`, and `min(25, sodium_mg / 600 * 25)` per 100 g (or 100 mL as supplied), then round. With missing inputs, a clearly labelled food-type estimate is used for confirmed plain water (100) and fresh fruit/vegetables (85). Plain water requires a water-only ingredient list. Other unknown foods remain unscored rather than treating missing values as zero. Detected non-food products such as shampoo show a needs-based message and no food score. These category rules are limited and are not a full product classifier. These are prototype constants, not an official or clinically validated scoring system, and not Australia's Health Star Rating. The model omits beneficial nutrients, food category and processing, and should not guide medical decisions. Review/replace this model before relying on it.

Tests cover checksums, score boundaries, missing nutrients, unit conversion, independent product results, automatic matching and rejection of ambiguous retailer listings, official ALDI parsing and Australian price selection using mocked responses. Live lookup and physical-device testing are separate checks.

## Square codes

The camera recognises QR, Data Matrix, Aztec and PDF417 in addition to retail barcodes. The square guide is optional; both guide shapes recognise all enabled formats. GS1 `(01)` element strings and `/01/{GTIN}` links are checksum-validated, then use the same product lookup. UPC-E scans are expanded to UPC-A. Generic website QR codes are not guessed into product numbers: the app offers an explicit open-link action and suggests the pack barcode. Unknown schemes, invalid checksums and credential-bearing links are rejected. No arbitrary QR URL is fetched automatically. Official Costco product links are parsed to an item ID and fetched only from Costco's fixed API host. Camera behaviour still needs validation on a physical iPhone.

Coles still responds with a browser challenge to this cloud's automated requests. The supplied egg code `93310645367484` also fails the GTIN checksum. These are unresolved prerequisites for verifying that specific product; no guessed correction is applied.
