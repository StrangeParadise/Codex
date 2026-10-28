# Can I have it?

Personal iPhone prototype using Expo and TypeScript. Scan EAN/UPC barcodes or enter them manually, then query Open Food Facts for nutrition. No account or backend is required. Product requests send the scanned barcode to Woolworths, Open Food Facts and, when needed, Open Prices. No scan history is stored.

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

Product identification and nutrition come from Open Food Facts, independently of retailer matches. A missing shop match is normal and does not produce a red error. Unknown products retain their barcode and store lookup options. Official photos remain official-only; no community photo is relabelled as official.

| Shop/source | Current support |
| --- | --- |
| Woolworths | Automatic official barcode search. Exact GTIN matches populate the result. Other returned listings require the user to confirm the product and pack size. |
| ALDI | On-demand search of official product pages, with official photos and AUD prices when listed. The user must confirm the item; a similar name is not proof of a barcode match. |
| Coles | Opens the official search in the browser. Automated requests returned a browser challenge during validation; no automatic price integration is claimed. |
| IGA | Opens the shopping website to choose a local store. Automated shopping requests returned HTTP 403; no automatic price integration is claimed. |
| Open Prices | Community AUD whole-item price records from Australian shops, with reported dates; fallback when no official price is available. |

There are no hard-coded product aliases or special water-price records. Barcode search results with a different primary GTIN are presented for confirmation for any product. Check brand, name and pack size before selecting. Official online prices can differ from local shelf or delivery prices. No location or store session is selected automatically. Public website formats may change. Broad automatic price coverage across all supermarkets remains unfinished; Coles and IGA require a supported data integration before that can be claimed.

Network sources: www.woolworths.com.au, cdn0.woolworths.media (and other numbered image CDNs), www.aldi.com.au, dm.apac.cms.aldi.cx, world.openfoodfacts.org and prices.openfoodfacts.org. Store browser links also use www.coles.com.au and www.igashop.com.au. The scan or product search text is sent to the selected service. No scan history is retained. Open Food Facts and Open Prices contributors supply community data under ODbL. Check packaging and shelf labels; data can be incomplete or outdated.

## Experimental score v0

Start at 100, subtract `min(40, sugars_g / 22.5 * 40)`, `min(35, saturated_fat_g / 5 * 35)`, and `min(25, sodium_mg / 600 * 25)` per 100 g (or 100 mL as supplied), then round. With missing inputs, a clearly labelled food-type estimate is used for confirmed plain water (100) and fresh fruit/vegetables (85). Plain water requires a water-only ingredient list. Other unknown foods remain unscored rather than treating missing values as zero. Detected non-food products such as shampoo show a needs-based message and no food score. These category rules are limited and are not a full product classifier. These are prototype constants, not an official or clinically validated scoring system, and not Australia's Health Star Rating. The model omits beneficial nutrients, food category and processing, and should not guide medical decisions. Review/replace this model before relying on it.

Tests cover checksums, score boundaries, missing nutrients, unit conversion, independent product results, confirmation of different retailer barcodes, official ALDI parsing and Australian price selection using mocked responses. Live lookup and physical-device testing are separate checks.
