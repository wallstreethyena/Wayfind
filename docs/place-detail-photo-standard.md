# Place detail photo standard

Owner direction, 2026-10-22: place detail images must fill a large frame above the title as the default across Wayfind.

`lib/placeDetailPhotoStandard.js` owns the shared sizing: full container width, a 16:9 frame with a 220px minimum and 420px maximum height, centered cover rendering. Portrait and landscape photos fill the frame without stretching or letterboxing. Tapping opens the full original with contain sizing.

The place title stays below the photo. Source credit sits below the headline and stays paired with the image that is actually visible. Pending acquisition reserves the photo frame; a genuine missing photo collapses it so the page does not retain a large empty box. No generic stock image may stand in for a named venue photo.

The shared detail sheet covers home results, maps, favorites, itineraries, shared places and creator place links. Durable `/places/[id]` pages and selected-place dialogs on `/go/[city]` also use the shared sizing. Their extra photo lookups are free-only and use retained or licensed sources. Feed cards keep their existing shared 9:16 standard. Event detail media keeps its separate event contract.

Regression checks: `scripts/test-detail-hero.mjs`, `scripts/test-detail-photo-acquisition.mjs`, and `scripts/test-place-detail-photo-surfaces.mjs`. Browser verification checks achieved phone, tablet and desktop widths, late photos, portrait and landscape fills, truthful misses, attribution, and full-photo controls.
