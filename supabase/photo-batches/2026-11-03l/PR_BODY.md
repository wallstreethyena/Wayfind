## Photo batch 2026 11l: Tampa and first page Christmas cards, plus caption fix

**Photo count:** 87 official photos, 1280x853 JPEG, no overlays, no duplicates (pHash checked), best horizontal shot first as the cover.

**Cards affected (16):**
- Place cards, via `supabase/photo-batches/2026-11-03l/apply.sql`: Strandhill Public (Tampa Heights) 6, Joy Bar 7
- Event cards, via `lib/christmasPlacePhotos.js` static gallery: Miracle at Strandhill Public 6, Tampa Santa Brunch Cruise 7, Holiday Lighted Boat Parade Dinner Cruise 5, Tampa Christmas Eve Dinner Cruise 5, Winter Wonder Wharf 7, Season Spectacular at Water Street 7, Holiday Harbour Tree Lighting 2, Lost Pearl Boat Parade Cruise 4, OE Holiday Gift Bazaar 6, Christmas with Chris Tomlin (Saenger) 5, Wonderland of Lights 4, Holiday Pops Jacksonville 7, NFSO Holiday Pops 5, A Christmas Carol at Titusville Playhouse 4

**Code fix:** `ChristmasTicketCard` drops any photo that fails to load (showing the placeholder tile when all fail), and the "Photo from Google Maps" caption and other credits only show for photos that actually loaded. `GuidePhoto` gains an optional `onLoaded` callback.

**Undo:** revert this PR, then run `supabase/photo-batches/2026-11-03l/undo.sql` (removes photos only where they still point at batch-2026-11l; both place cards were empty before).
