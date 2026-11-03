# Photo batch 2026-11h: Christmas event cards

14 photos, 1280x853 JPEG, hosted at public/place-photos/batch-2026-11h/, added to CHRISTMAS_STATIC_GALLERY in lib/christmasPlacePhotos.js.

| Card | Before | After | Source |
|---|---|---|---|
| wdw-holidays-2026 (Holidays at Walt Disney World) | 0, placeholder | 7 | Walt Disney World official site |
| utc-holidays-2026 (Holidays at UTC) | 0, blank Google ref | 6 | UTC Sarasota official site |
| epcot-candlelight-2026 (Candlelight Processional) | 0, blank Google ref | 1 | Walt Disney World official site |

Why cards were blank: browse cards request `/api/photo?place=<id>&g=2&w=640` with no credited surface. For places with no vaulted photo the route answers 404 `not-google-surface` (policy, not the quota breaker), so the card shows the Santa placeholder while the caption still says "Photo from Google Maps". Static galleries already take priority over the Google ref in christmasEventCard, so no code change is needed for events.

No SQL in this batch (events only). Undo: revert this PR's commit.
