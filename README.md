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

Open Food Facts is community supplied, with variable Australian coverage. Requests use `world.openfoodfacts.org`; allow this domain in cloud settings for live API checks. Verify nutrition against packaging. Source: https://world.openfoodfacts.org — contributors, Open Database License (ODbL); consult its attribution/share-alike requirements before distributing derived databases. Official photos and prices are fetched from Woolworths search using an exact barcode match. The website endpoint is not a guaranteed public API and may change or block requests. No local store is selected; the returned online price may differ from your checkout price. Images are loaded from cdn0.woolworths.media (or another numbered Woolworths CDN). No official match means no photo is shown. If no official price is available, fallback prices come from Open Prices (https://prices.openfoodfacts.org), a community database. The app requests recent AUD records, then only displays Australian whole-item prices with a date and shop where listed. Coverage is limited; records may be old or discounted and do not promise today’s shelf price. If no matching record is found, no price is invented. Allow prices.openfoodfacts.org for cloud API checks. Price data: Open Prices contributors, ODbL.

## Experimental score v0

Start at 100, subtract `min(40, sugars_g / 22.5 * 40)`, `min(35, saturated_fat_g / 5 * 35)`, and `min(25, sodium_mg / 600 * 25)` per 100 g (or 100 mL as supplied), then round. With missing inputs, a clearly labelled food-type estimate is used for confirmed plain water (100) and fresh fruit/vegetables (85). Plain water requires a water-only ingredient list. Other unknown foods remain unscored rather than treating missing values as zero. Detected non-food products such as shampoo show a needs-based message and no food score. These category rules are limited and are not a full product classifier. These are prototype constants, not an official or clinically validated scoring system, and not Australia's Health Star Rating. The model omits beneficial nutrients, food category and processing, and should not guide medical decisions. Review/replace this model before relying on it.

Tests cover checksums, score boundaries, missing nutrients, unit conversion, product descriptions, not-found handling and safe Australian price selection using mocked responses. Live lookup and physical-device testing are separate checks.
