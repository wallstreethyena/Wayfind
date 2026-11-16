# Photo batch 2026-11-15-audit

Full photo audit of www.gowayfind.com and blog.gowayfind.com. This PR is the first batch of verified fixes. Nothing has been run against the database and nothing is deployed. Every SQL file must be reviewed and run by Gabe.

## What is in this PR

* **42 new photos** for **12 place cards**, all 1280x853 JPEG, no overlays, no watermarks, at `public/place-photos/batch-2026-11-15-audit/<place_id>/`.
* **10 blog covers** (`wf_place_photo` rows). These are what blog.gowayfind.com reads, so they fix "Photo unavailable" slots on the blog.
* Every photo was checked by eye for the exact place, season and quality. Source and license for each one are in `manifest.json`.

Sources: Wikimedia Commons (27), Flickr CC BY or CC BY SA (12, Busch Gardens Christmas Town, Scenic Boat Tour, UTC Christmas lights, one St. Pete Marina photo), and the official Alessi Bakeries website for its own place (3). Busch Gardens also keeps 4 of its existing photos.

## Place cards (signals.photos and signals.photo_gallery)

| Card | place_id | Photos before | Photos after | Sources |
|---|---|---|---|---|
| Busch Gardens Tampa Bay | `ChIJhRo4DU_GwogRUgjhMAj-pag` | 12 | 7 | flickr, official_site, wikimedia |
| Central Florida Zoo & Botanical Gardens | `ChIJ9TyG2GkS54gRvw6kLzIkFBw` | 0 | 4 | wikimedia |
| Downtown Winter Garden | `ChIJ_5y7TySD54gR7m1y1b24hNM` | 0 | 5 | wikimedia |
| Huggins-Stengel Field | `ChIJEwK1CbLhwogRpFPaNA1EqiY` | 0 | 3 | wikimedia |
| Pier 60 Park | `ChIJG_fsz9b2wogRiW9DrnVgZ8Q` | 0 | 5 | wikimedia |
| Mahaffey Theater, Duke Energy Center for the Arts | `ChIJSWCg1pvhwogR-rDr1SAB-vY` | 0 | 4 | wikimedia |
| St. Petersburg Municipal Marina | `ChIJD9QnqZ7hwogRmJCV8f0fWBA` | 0 | 3 | flickr, wikimedia |
| Water Street | `ChIJy66Xe53FwogRcpjZQHX4cCI` | 0 | 3 | wikimedia |
| Scenic Boat Tour | `ChIJ4XkjoBtw54gRGiqFxtWvbM8` | 0 | 5 | flickr |
| The Mall at University Town Center | `ChIJ9_YnI8k_w4gRRiuNIcvA5y8` | 0 | 3 | flickr |
| Sunset Park | `ChIJresjyGKi54gRq3lL2HIBC90` | 0 | 1 | wikimedia |
| Alessi Bakeries Food Market | `ChIJJ1tmaHbDwogRxB86-j_tUjw` | 0 | 3 | official_site |

Busch Gardens had 12 photos, which is over the 7 cap, and 8 of them were Howl O Scream Halloween shots. The new list puts 3 Christmas Town photos first, then keeps the 3 Commons photos and 1 official photo. The Halloween photos come back if you run undo.

## Blog covers (wf_place_photo)

Only Commons photos go here, because `wf_place_photo.source` only allows wikimedia, owner or creator and `lib/photoLicense.js` only vaults wikimedia photos that carry a free license. Each row is written as status active with storage_path null, so the existing place photo backfill cron copies it into the place-photos bucket. After that the blog shows it. The blog is ISR, so give it about an hour.

| Place | Credit |
|---|---|
| Central Florida Zoo & Botanical Gardens | Alan Levi, Public domain, via Wikimedia Commons |
| Downtown Winter Garden | Freeholdman12, CC BY 4.0, via Wikimedia Commons |
| Huggins-Stengel Field | Ebyabe, CC BY SA 4.0, via Wikimedia Commons |
| Pier 60 Park | Jana Taylor, CC BY SA 3.0, via Wikimedia Commons |
| Mahaffey Theater, Duke Energy Center for the Arts | Taylor Bennett Jordan, CC BY SA 4.0, via Wikimedia Commons |
| St. Petersburg Municipal Marina | John O'Neill, CC BY SA 3.0, via Wikimedia Commons |
| Water Street | Chiefmiz, CC0, via Wikimedia Commons |
| Sunset Park | Whoisjohngalt, CC BY SA 4.0, via Wikimedia Commons |
| Steinmetz Hall | Farragutful, CC BY SA 4.0, via Wikimedia Commons |
| North Straub Park | Roman Eugeniusz, CC BY SA 3.0, via Wikimedia Commons |

Steinmetz Hall and North Straub Park only get a cover row that points at the 12g files, which are already live. Their signals are left alone so nothing here clashes with the pending 12g SQL.

## Optional, needs a separate OK

`optional_flickr_covers.sql` sets Flickr CC covers for the blog. It will fail on the source check constraint unless `flickr` is first added to that constraint and to `mayStorePermanently`. Do not run it until you decide on that.

| Place | Credit |
|---|---|
| Busch Gardens Tampa Bay | Jared, CC BY 2.0, via Flickr |
| Scenic Boat Tour | Mike Whaling, CC BY SA 2.0, via Flickr |
| The Mall at University Town Center | Carol VanHook, CC BY SA 2.0, via Flickr |

## How to apply

1. Merge, so the photo files are live at www.gowayfind.com/place-photos/batch-2026-11-15-audit/.
2. Check that one file loads, then run `apply.sql`. Each statement is guarded. A card only changes if it still has the photo count it had at audit time (0 photos, or 12 with the same first photo for Busch Gardens). A cover row only changes if the current row is rejected (or missing for Huggins Stengel Field).

## How to undo

Run `undo.sql`. It puts back the exact earlier values, which are saved in `before_snapshot.json`, and it only touches rows that still hold this batch's values. For Huggins Stengel Field it deletes the new cover row, because there was no row before. Then revert this PR to remove the files.

## Conflicts

This PR does not touch any place in PR #2349 (12f) or in the 12g SQL. The 12g photo files are reused by URL only.
