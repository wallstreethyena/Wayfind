# Christmas photo batch 2026 11e: real photos for the Christmas in Florida cards that had none or few

30 new verified photo files (35 card placements) (1280x853 JPEG, no overlays or added text) under `public/place-photos/batch-2026-11e/`. Every image was opened and checked by eye against the venue. Zoo Lights reuses the Palm Beach Zoo files (no duplicate files).

## Cards affected (photos before, after)
| Card | Before | After | Source |
|---|---|---|---|
| A Christmas Carol (Gulfshore Playhouse, Naples) | 0 (placeholder) | 6 | Gulfshore Playhouse official site: Baker Theatre house, stage, exterior, lobby. Credit "Photo courtesy of Gulfshore Playhouse" |
| The Nutcracker (Northwest Florida Ballet, Niceville) | 0 | 6 | Mattie Kelly Arts Center official site: lit entrance at dusk (cover), full house, orchestra, dance on stage |
| Mannheim Steamroller Christmas (Peabody) | 1 | 2 | Mannheim Steamroller official site: live concert stage (new cover) |
| Zoo Lights at Palm Beach Zoo | 2 (weak tree photo) | 5 | Palm Beach Zoo official site (tiger cover, jaguar, otters) plus 2 Wikimedia zoo photos |
| Palm Beach Zoo (place) | 2 | 8 | Same official photos plus 3 Wikimedia |
| Myakka River State Park (place) | 1 | 8 | 7 Wikimedia Commons (CC BY SA 3.0 / CC0), boat basin sunset cover |
| Universal Volcano Bay (place) | 4 | 8 | 4 Wikimedia Commons (CC BY / CC BY SA) |

## How it ships
1. Merge this PR. Code: `lib/christmasPlacePhotos.js` gets static rails for the 4 events (Mannheim keeps its old shot second).
2. After deploy, run `supabase/photo-batches/2026-11-01e/apply.sql`. It only UPDATES the 3 existing place rows (never inserts, no new cards), new photos lead with the cover first, signals.photos and photo_gallery stay in the same order, and a rerun gives the same result.

## Undo
Run `supabase/photo-batches/2026-11-01e/undo.sql` (restores the exact arrays in `before_snapshot.json`), then revert this PR to remove the files and the static rails.
