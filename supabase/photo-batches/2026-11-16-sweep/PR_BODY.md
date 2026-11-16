# Photo sweep 2026-11-16: 4 verified photos (2 guide picks, 2 place cards)

Daily picture intent sweep for Mon Nov 16 2026. Every photo was viewed by eye for the exact subject, season and city. All are 1280x853 JPEG, horizontal, no overlays, no added badges, sourced from Wikimedia Commons with a free license. Credits ride in the existing tiny credit line, nothing is drawn on the images.

## 1. Trending in Florida This Week (Nov 16 2026): 2 empty pick slots filled

Guide: /guides/trending-in-florida-this-week-nov-16-2026 (published today, every story slot was empty).
Files: `public/guides/picks/trending-in-florida-this-week-nov-16-2026/` and `data/guide-pick-photos/trending-in-florida-this-week-nov-16-2026.json` (2 entries moved from gaps to picks; manifest rebuilt with `node scripts/build-guide-pick-photos.mjs`; licence ledger rebuilt with `node scripts/build-guide-photo-license-evidence.mjs`).

| Pick | Photo | Source and license |
|---|---|---|
| Gene Simmons Band with Lita Ford | Gene Simmons on stage, Masters of Rock 2018 | File:VSpectrum-Gene Simmons-0204.jpg, V-spectrum, CC BY SA 4.0 |
| Symphony in Lights | The Symphony in Lights tree at The Shops at Wiregrass | File:The Shops at Wiregrass (Christmas 2008).jpg, Christopher Hollis, public domain |

Captions say plainly that each is an earlier year or show. The other 15 story slots stay empty on purpose: no exact, licensed, good quality photo was found (Lightning photos were away games full of sponsor boards, the Morgan Wallen frames were portrait or blurry, the Florida Strawberry Festival midway photo has no author recorded on Commons so it fails the licence ledger check, and the rest had no Commons coverage).

## 2. Place cards: 2 photos (signals.photos and signals.photo_gallery)

| Card | place_id | Photos before | Photos after | New photo |
|---|---|---|---|---|
| Florida Railroad Museum | `ChIJ______8sw4gRMudh58gsGMU` | 6 | 7 | Seaboard locomotive on the museum grounds, File:Parrish FL Florida Railroad Museum04.jpg, Ebyabe, CC BY SA 3.0 |
| Cascades Park | `ChIJFfcS4GT17IgRqFA1iDnCdzs` | 6 | 7 | Smokey Hollow Pond fountain, File:Cascades Park (Tallahassee), looking North at Smokey Hollow Pond.JPG, Michael Rivera, CC BY SA 3.0 |

Both are seasonal cards (Santa trains and the Cascades Park winter festival). The new photo is added last, so each cover stays the same. Perceptual hash distance to every existing photo on the card is 26 or more, so there are no near duplicates. Files: `public/place-photos/batch-2026-11-16-sweep/<place_id>/`. No card here is in the pending 12f, 12g or 2026-11-16-top batches. No new cards are created.

## How to apply

1. Merge and deploy so the files are live at www.gowayfind.com.
2. Run `supabase/photo-batches/2026-11-16-sweep/apply.sql`. It runs in one transaction, and each card only changes if it still has exactly 6 photos, 6 gallery items and the same first photo it had at audit time.

## How to undo

Run `supabase/photo-batches/2026-11-16-sweep/undo.sql`. It puts back the exact earlier lists saved in `before_snapshot.json` and only touches a card whose 7th photo is still this batch's photo. Then revert this PR to remove the files and the 2 guide picks (the guide slots go back to empty).
