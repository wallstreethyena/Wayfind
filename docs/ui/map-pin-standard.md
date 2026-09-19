# Shared map category pins

Owner direction, 2026-09-19: use the supplied glossy teardrop reference throughout maps and category legends. A selected or top-ranked place must keep its category symbol and color.

`lib/mapPinStandard.js` owns vector geometry, category colors, white pictograms, Apple image options, and the canvas painter. `MapCategoryPin` displays the exact SVG used by Apple annotations in category legends. No emoji font is involved.

Consumers: EventVenueMap / appleMapsRuntime; CreatorMapPanel / creatorAppleMap; MapView (main explorer, home MapPreview and any embedded MapView). MapLibre retains its native clustered symbol layer. Event markers, device location and search center use distinct symbols within the same teardrop standard. A cluster remains a count of multiple places, not a category claim.

Classification uses the place's primary type before its category fallback. Explicit stay rows retain hotel identity. Unknown places use the neutral More pin. Spa and gym have separate wellness and fitness symbols. Category legends and markers share this resolver.

New maps, including the pending Apple explorer change (#1268), must reuse `applePinOptions` or `paintMapPin` and `MapCategoryPin` rather than introduce native default markers or a second icon table.

Verification: `node scripts/test-map-pin-standard.mjs` renders the real event legend, verifies its exact marker URLs, checks canvas tip geometry, and checks legend scrolling at 390/768/1400px. Setting `WF_PIN_SCREENSHOT` to an absolute output path saves the visual fixture. The fixture is labeled as a local design check, not a live map. Removing the tip path was tested and makes this check fail. Apple routing/selection/streamed-update and creator selection/teardown are covered by their existing runtime tests.

Local production build and JSX checks pass. The full guard run stops at check-place-card-standard: 12 share-label clipping failures at 320px reproduce identically on unchanged origin/main (28a50596). Live Apple SDK rendering, preview deployment and production deployment are not verified by the fixture. Nothing has been pushed or deployed as part of this local implementation.
