# Photo batch 2026 12g: 27 verified photos on 7 seasonal place cards

Adds 27 photos (1280x853 JPEG, horizontal, no text or overlays) of the exact place, all from Wikimedia Commons under CC BY, CC BY SA or public domain, each credited in photo_gallery (attribution_text and attribution_url). Every photo was looked at before it was picked. Files live in public/place-photos/batch-2026-12g. SQL lives in supabase/photo-batches/2026-11-10-12g (apply.sql, undo.sql, manifest.json, before_snapshot.json).

signals.photos is written as a list of URL strings and signals.photo_gallery as the same ordered list of objects, the same shape as batches 11r to 12d. No new cards are created. Cover first.

| place_id | card | before | added | after | season page |
|---|---|---|---|---|---|
| ChIJjZq3rbFB6IgRb6e1zyAKbg4 | Three Sisters Springs | 0 | 5 | 5 | Florida Manatee Season 2026 |
| ChIJyYEUav8P54gRatuv_zQzm20 | Blue Spring State Park | 0 | 6 | 6 | Florida Manatee Season 2026 |
| ChIJpUJtM-_ZwogROGyfAWFNelo | Manatee Viewing Center (Apollo Beach) | 0 | 3 | 3 | Florida Manatee Season 2026 |
| ChIJ5eLMVXE9w4gR15l0tMZGkMY | Coquina Beach | 0 | 5 | 5 | Florida Winter Beaches 2026 |
| ChIJ001Ra3p754gRq1bFeHUUxXY | Steinmetz Hall (Dr. Phillips Center, includes Seneff Arts Plaza at Christmas) | 0 | 4 | 4 | Florida Nutcracker and Holiday Shows 2026 |
| ChIJEfuXNVcA2YgRtSS3Jo9Jsw0 | Riverwalk Fort Lauderdale | 6 | 1 | 7 | Florida Christmas Boat Parades 2026 |
| ChIJj7-A7nXhwogRGvQ_vcrP7uU | North Straub Park (St. Petersburg, Christmas tree and nativity in the park) | 0 | 3 | 3 | Florida Santa and Christmas Trains 2026 |

Total: 27 photos across 7 cards.

## Guards

apply.sql runs in one transaction. Each UPDATE only fires when the card is unchanged: for the 6 empty cards, signals has no photos and no photo_gallery key; for Riverwalk Fort Lauderdale, signals.photos equals the exact current 6 photo list and photo_gallery has 6 entries. The new Riverwalk photo is appended, so its cover stays.

## How to undo

Run supabase/photo-batches/2026-11-10-12g/undo.sql. It removes photos and photo_gallery from the 6 cards that had none, and restores the previous 6 photo list on Riverwalk Fort Lauderdale, only where the batch value is still in place. Then revert this PR to remove the image files.
