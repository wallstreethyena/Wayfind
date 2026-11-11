# Daily picture intent sweep, Monday Nov 9 2026

Photo count: 54 photos in total. 12 guide pick photos are replaced and 42 photos are added to 9 existing place cards. No new place cards are created.

## Guide picks replaced (12)

Every new photo shows the exact holiday event or place at the right season, replacing daytime venue shots, a wrong aerial forest photo and an illustrative fallback.

* /guides/free-christmas-lights-florida-2026: St. Augustine Nights of Lights (Flickr, Eric Friedebach, CC BY 2.0, Dec 2021), Holiday Lights in Largo Central Park (Commons, MatthewHoobin, CC BY SA 4.0, Dec 2020)
* /guides/florida-holiday-nights-out-2026: Holiday Lights in Largo Central Park (Commons, MatthewHoobin, CC BY SA 4.0), Disney Springs Christmas Tree Stroll (Flickr, AngryJulieMonday, CC BY 2.0), gap entry removed
* /guides/florida-theme-park-christmas-2026: Disney Springs Christmas Tree Stroll and Santa (Flickr, David Aughinbaugh II, CC BY 2.0), EPCOT International Festival of the Holidays (Flickr, cheddar, CC BY SA 2.0), SeaWorld Orlando Christmas Celebration (Flickr, simon17964, CC BY 2.0), Christmas Town at Busch Gardens Tampa Bay (Flickr, zannaland, CC BY SA 2.0), ICE! at Christmas at Gaylord Palms (Commons, Michelle Maria, CC BY 3.0), five gap entries removed
* /guides/florida-snow-and-ice-2026: ICE! featuring The Polar Express (Commons, Michelle Maria, CC BY 3.0), Now Snowing Nightly in Celebration (Commons, Brian Hart, CC BY SA 2.0)
* /guides/florida-thanksgiving-weekend-2026: Christmas in the Wild at ZooTampa (Commons, Ssriram mt, CC BY SA 3.0), replacing an orangutan photo

Seasonal event photos use placeId null so they are never reused on non holiday guides through guidePhotoForPlace. Largo Central Park and Gaylord Palms keep their placeId because only holiday guides reference them.

Files: public/guides/picks/<slug>/*.jpg (1280x853, each under 200 KB), data/guide-pick-photos/*.json, regenerated lib/guidePickPhotoManifest.js, lib/guideCardPhotoIndex.js and data/guide-pick-photos/_reports/license-evidence.json (all 12 rows verified).

## Place cards (42 photos added)

Files are hosted on Wayfind at public/place-photos/batch-2026-11-09s/<place_id>/. signals.photos and signals.photo_gallery hold the same ordered list.

* Gaylord Palms Resort & Convention Center (ChIJl0CYCGZ_3YgRL05pG5wZSsE): 2 to 7, existing cover kept, ICE! and holiday atrium photos appended
* Daytona International Speedway (ChIJk4XLpEnZ5ogRl8zItcDGhxM): 0 to 5
* Cascades Park, Tallahassee (ChIJFfcS4GT17IgRqFA1iDnCdzs): 0 to 6
* MOSI, Tampa (ChIJq6E9W8_HwogRUggO5759Ook): 0 to 5
* Goodwood Museum & Gardens, Tallahassee (ChIJn2JUR3Bf7IgRDoeGio3YFuE): 0 to 6
* Seminole Gulf Railway (ChIJEyrKF49q24gRi1npcziO2eE): 0 to 4
* Riverwalk Fort Lauderdale (ChIJEfuXNVcA2YgRtSS3Jo9Jsw0): 0 to 6
* Pinecrest Gardens (ChIJuyCMUy3G2YgRyrGn93iiGoM): 5 to 7, appended
* Plaza de la Constitución, St. Augustine (ChIJ-X6wLJQn5IgRvYMgcGVzY80): 0 to 3

Sources: Wikimedia Commons (CC BY, CC BY SA, CC0, public domain) and Flickr (CC BY 2.0). Every photo was reviewed by eye, checked for near duplicates by perceptual hash against siblings and existing card photos, and carries no added text or overlays. Full list in supabase/photo-batches/2026-11-09s/manifest.csv.

## Database step

After this deploy is live, supabase/photo-batches/2026-11-09s/apply.sql is run once through the Supabase connector. Each update only runs if the card still has its Nov 9 photo count.

## How to undo

1. Database: run supabase/photo-batches/2026-11-09s/undo.sql through the Supabase connector. It restores the earlier photo arrays (Gaylord 2, Pinecrest 5, others empty) only on cards that still have the batch count.
2. Code: revert this PR. The guide picks go back to their previous photos and gap entries.
