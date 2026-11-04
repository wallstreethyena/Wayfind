# Batch 11m: Wayfind hosted photos for the This week in Florida events

**Photos:** 32 new 1280x853 JPEGs under `public/place-photos/batch-2026-11m/`, across **6 event cards**. The Florida Seafood Festival gallery and its five files were removed before this PR because the photo rights are not cleared yet. No SQL, so no apply.sql.

## What changes
* `lib/christmasPlacePhotos.js`: adds 6 galleries to `CHRISTMAS_STATIC_GALLERY` (keyed by slug, with wf_events id aliases) and a new `eventStaticCover(row)` helper. Event pages already read this gallery by slug, so each event page gets its full swipe gallery.
* `lib/thisWeekEvents.js` (homepage This week in Florida rail) and `app/florida-events/page.js` (See all events): the card cover is now the Wayfind hosted cover first, then hero_image, then the venue photo.
* `app/components/CardPhoto.js`: the linked card credit ("Google Maps · Photo credit") is no longer drawn on the photo. When a Google photo still shows on a linked card, a small muted "Google Maps" link sits just under the image, right aligned, and still opens the full credit viewer.

## Cards affected
* key-west-offshore-world-championship-2026
* north-florida-fair-2026
* edc-orlando-2026
* sarasota-medieval-fair-2026
* sweetfields-farm-corn-maze-2026
* hillsborough-county-fair-2026

### key-west-offshore-world-championship-2026 (7)

1. `/place-photos/batch-2026-11m/key-west-offshore-world-championship-2026/ev_258fdeec3ebbb5ed.jpg` (cover), Race World Offshore official website, https://raceworldoffshore.com/key-west/
2. `/place-photos/batch-2026-11m/key-west-offshore-world-championship-2026/ev_0ef0d0a85372e2b0.jpg`, Race World Offshore official website, https://raceworldoffshore.com/key-west/
3. `/place-photos/batch-2026-11m/key-west-offshore-world-championship-2026/ev_2d7c7db2360e19ec.jpg`, Race World Offshore official website, https://raceworldoffshore.com/key-west/
4. `/place-photos/batch-2026-11m/key-west-offshore-world-championship-2026/ev_c210ad79847e95f9.jpg`, Race World Offshore official website, https://raceworldoffshore.com/key-west/
5. `/place-photos/batch-2026-11m/key-west-offshore-world-championship-2026/ev_38dabc82c9f93638.jpg`, Race World Offshore official website, https://raceworldoffshore.com/key-west/
6. `/place-photos/batch-2026-11m/key-west-offshore-world-championship-2026/ev_78bdac2a40d3c91b.jpg`, Race World Offshore official website, https://raceworldoffshore.com/key-west/
7. `/place-photos/batch-2026-11m/key-west-offshore-world-championship-2026/ev_319b435cf7f1b0d9.jpg`, Race World Offshore official website, https://raceworldoffshore.com/key-west/

### north-florida-fair-2026 (7)

1. `/place-photos/batch-2026-11m/north-florida-fair-2026/ev_f5c14f98f9adc398.jpg` (cover), Wikimedia Commons, Michael Rivera, CC BY SA 4.0, https://commons.wikimedia.org/wiki/File:North_Florida_Fair_2022_rides_10.jpg
2. `/place-photos/batch-2026-11m/north-florida-fair-2026/ev_7355ef13b82bc6b3.jpg`, Wikimedia Commons, Michael Rivera, CC BY SA 4.0, https://commons.wikimedia.org/wiki/File:North_Florida_Fair_2022_rides_1.jpg
3. `/place-photos/batch-2026-11m/north-florida-fair-2026/ev_d3b2efd7aadd967c.jpg`, Wikimedia Commons, Michael Rivera, CC BY SA 4.0, https://commons.wikimedia.org/wiki/File:North_Florida_Fair_2022_rides_5.jpg
4. `/place-photos/batch-2026-11m/north-florida-fair-2026/ev_9eb89ae076271c03.jpg`, Wikimedia Commons, Michael Rivera, CC BY SA 4.0, https://commons.wikimedia.org/wiki/File:North_Florida_Fair_2022_rides_2.jpg
5. `/place-photos/batch-2026-11m/north-florida-fair-2026/ev_86030820c0066451.jpg`, Wikimedia Commons, Michael Rivera, CC BY SA 3.0, https://commons.wikimedia.org/wiki/File:North_Florida_Fair_2013_27.JPG
6. `/place-photos/batch-2026-11m/north-florida-fair-2026/ev_d17a8eb36f53da38.jpg`, Wikimedia Commons, Michael Rivera, CC BY SA 3.0, https://commons.wikimedia.org/wiki/File:North_Florida_Fair_2013_05.JPG
7. `/place-photos/batch-2026-11m/north-florida-fair-2026/ev_485959d709235d4c.jpg`, Wikimedia Commons, Michael Rivera, CC BY SA 3.0, https://commons.wikimedia.org/wiki/File:North_Florida_Fair_2013_31.JPG

### edc-orlando-2026 (7)

1. `/place-photos/batch-2026-11m/edc-orlando-2026/ev_181923a476541579.jpg` (cover), Insomniac EDC Orlando official photos, https://www.insomniac.com/photos/2025-11-07-08-09-edc-orlando/
2. `/place-photos/batch-2026-11m/edc-orlando-2026/ev_8ab32064e59a8299.jpg`, Insomniac EDC Orlando official photos, https://www.insomniac.com/photos/2025-11-07-08-09-edc-orlando/
3. `/place-photos/batch-2026-11m/edc-orlando-2026/ev_fb12040c16a5d4a9.jpg`, Insomniac EDC Orlando official photos, https://www.insomniac.com/photos/2025-11-07-08-09-edc-orlando/
4. `/place-photos/batch-2026-11m/edc-orlando-2026/ev_0c7caa912ef0dec4.jpg`, Insomniac EDC Orlando official photos, https://www.insomniac.com/photos/2025-11-07-08-09-edc-orlando/
5. `/place-photos/batch-2026-11m/edc-orlando-2026/ev_232e7ddac5048e47.jpg`, Insomniac EDC Orlando official photos, https://www.insomniac.com/photos/2025-11-07-08-09-edc-orlando/
6. `/place-photos/batch-2026-11m/edc-orlando-2026/ev_d6df2997fa80a5b7.jpg`, Insomniac EDC Orlando official photos, https://www.insomniac.com/photos/2025-11-07-08-09-edc-orlando/
7. `/place-photos/batch-2026-11m/edc-orlando-2026/ev_800ae4c4da68fcd3.jpg`, Insomniac EDC Orlando official photos, https://www.insomniac.com/photos/2025-11-07-08-09-edc-orlando/

### sarasota-medieval-fair-2026 (7)

1. `/place-photos/batch-2026-11m/sarasota-medieval-fair-2026/ev_a582290b70a0f2ab.jpg` (cover), Sarasota Medieval Fair official website, https://www.sarasotamedievalfair.com/
2. `/place-photos/batch-2026-11m/sarasota-medieval-fair-2026/ev_7aac6c6f44db254c.jpg`, Sarasota Medieval Fair official website, https://www.sarasotamedievalfair.com/
3. `/place-photos/batch-2026-11m/sarasota-medieval-fair-2026/ev_0dcd49e103419200.jpg`, Sarasota Medieval Fair official website, https://www.sarasotamedievalfair.com/
4. `/place-photos/batch-2026-11m/sarasota-medieval-fair-2026/ev_480a06a491cd6bed.jpg`, Sarasota Medieval Fair official website, https://www.sarasotamedievalfair.com/
5. `/place-photos/batch-2026-11m/sarasota-medieval-fair-2026/ev_db68929f0915e67a.jpg`, Sarasota Medieval Fair official website, https://www.sarasotamedievalfair.com/
6. `/place-photos/batch-2026-11m/sarasota-medieval-fair-2026/ev_59abc87f4f75b977.jpg`, Sarasota Medieval Fair official website, https://www.sarasotamedievalfair.com/
7. `/place-photos/batch-2026-11m/sarasota-medieval-fair-2026/ev_4fcf5fecc4734190.jpg`, Sarasota Medieval Fair official website, https://www.sarasotamedievalfair.com/

### sweetfields-farm-corn-maze-2026 (2)

1. `/place-photos/batch-2026-11m/sweetfields-farm-corn-maze-2026/ev_34db15f2d1e6bf49.jpg` (cover), Sweetfields Farm official website, https://www.sweetfieldsfarm.com/
2. `/place-photos/batch-2026-11m/sweetfields-farm-corn-maze-2026/ev_76299c1dddf21ad5.jpg`, Sweetfields Farm official website, https://www.sweetfieldsfarm.com/

### hillsborough-county-fair-2026 (2)

1. `/place-photos/batch-2026-11m/hillsborough-county-fair-2026/ev_327926c9355bb0f5.jpg` (cover), Hillsborough County Fair official website, https://www.hillsboroughcountyfair.com/
2. `/place-photos/batch-2026-11m/hillsborough-county-fair-2026/ev_31b1357a84001d89.jpg`, Hillsborough County Fair official website, https://www.hillsboroughcountyfair.com/

## Still needing photos (not in this batch)
* st-pete-night-market-2026-11: no verified, text free photo of the market found (official sources only have the flyer). The card keeps its current photo lane, now with no credit on the photo.
* casselberrys-16th-annual-food-and-wine-festival-2026 and lightspill-foo-foo-festival-pensacola-2026: no usable verified photo found yet.

## Checks run
check-this-week-events, test-photo-credit-new-tab, check-card-photo-error-fallback, test-card-photo-viewer, test-card-photo-fallback, check-christmas-card-photo-slot, test-christmas-tickets, check-christmas-venue-matches: all pass.

## Undo
`git revert <merge sha>` removes the photo files, the gallery entries, the cover order change and the credit move. Nothing in Supabase changes.
