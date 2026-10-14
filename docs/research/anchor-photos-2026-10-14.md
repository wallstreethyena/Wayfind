# Anchor event photos, 2026-10-14

Scope: 15 Wayfind Florida events with no hero_image (DB read 2026-10-14, all 15 have hero_image, image_alt, hero_image_kind NULL; coconut-grove's "unrelated stock" is a render-time fallback, not a stored value). Output: scripts/anchor-events/fixes/2026-10-14-photos.json (3 fixes, 12 placeholders stay).

Convention found: no existing wf_events row has a Wikimedia hero. Heroes with a credit carry it inside image_alt (e.g. "photograph by Sasha Craft"); `hero_image_kind` ('event' | 'venue') says what it depicts; there is no credit or license column. The 3 fixes follow that: direct upload.wikimedia.org URL, kind venue, license and author in image_alt.

Limit: commons.wikimedia.org file/category/search pages were NOT fetchable from this environment (every WebFetch failed, no workaround attempted). So no new Commons file could be license-checked. Only assets already verified in wf_place_photo (status active, license, author and size on the row) were used.

## Resolved (venue photo)
- mainsail-art-festival-2027: Vinoy Park.jpg, CC BY 2.0, Calmuziclover, 3497x2023. The festival's own venue.
- thunder-beach-spring-rally-2027: Frank Brown Park (4218041932).jpg, CC BY 2.0, cambo5, 2048x1536. Venue is one of several rally sites; alt says so.
- winter-park-sidewalk-art-festival-2027: Winter_Park_FL_Downtown_HD01.jpg, CC BY-SA 3.0, Ebyabe, 3264x2448. Downtown Winter Park, venue area (Central Park and Park Ave); labeled as area, not Central Park itself.

## Placeholder stays
- 30a-songwriters-festival-2027: no verified WaterColor asset; nothing searched surfaced one.
- sandestin-wine-festival-2027: no verified Baytowne Wharf asset.
- fl26-pensacola-interstate-fair-2026: only "Historic Pensacola Village" exists, a different place. Rejected.
- mount-dora-arts-festival-2027: verified assets are a church and the history museum in the historic district, not the festival grounds. Judged too indirect.
- kumquat-festival-2027: Commons search returns only fruit photos.
- naples-winter-wine-festival-2027: no Ritz-Carlton Tiburon asset (Naples Botanical Garden is a different place).
- edison-and-ford-holiday-nights-2026: lead files on Commons (e.g. Winter Home of Thomas Edison in Fort Myers, Florida.jpg, Edisonwinterhome2006.jpg) but license unverifiable here; the DB wikimedia row for Edison & Ford is rejected.
- delray-affair-2027: Commons leads are bridge/map files, nothing of Atlantic Avenue festival or street verified.
- rolling-loud-florida-2027: only a Travis Scott portrait (a person, wrong event/venue); no Camping World Stadium asset.
- miami-beach-pride-festival-2027: the wf_place_photo "Lummus Park Historic District" asset is Miami (downtown), not Lummus Park, Miami Beach. Rejected. Commons leads to verify later by a session that can reach Commons: File:Miami Beach Pride.jpg, File:Lummus Park Florida banner.jpg (unverified).
- key-west-lobsterfest-2027: only Aquarium and Shipwreck Museum assets, wrong places.
- coconut-grove-arts-festival-2027: no verified asset; keeps the branded placeholder (the stock fallback is render-side).

## Fields the apply tool needs
`hero_image_kind` is missing from ALLOWED_FIELDS. All 3 entries set it to "venue", so they are refused until it is added. No credit/license column exists, so none is needed (credit is in image_alt).
