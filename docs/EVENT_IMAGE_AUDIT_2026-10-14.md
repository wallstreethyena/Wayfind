# Event and blog image audit, 2026-10-14

Read-only. Source: production `wf_events` (hero_image, hero_image_kind, start_date), queried 2026-10-14. No rows were changed and no image was added.

## Inventory (wf_events)

| state | upcoming | past | undated |
|---|---|---|---|
| no image | 723 | 216 | 9 |
| image, kind `event` | 54 | 10 | 0 |
| image, kind `venue` | 6 | 3 | 0 |
| image, kind NULL (no recorded source type) | 164 | 65 | 12 |

Totals: 948 with no image (723 upcoming), 241 images with no recorded kind (164 upcoming). Matches the brief.

## The 241 unclassified images: provenance by origin

| origin | rows | what it is | rights status |
|---|---|---|---|
| `/api/photo` (Wayfind photo route) | 144 | A photo of the venue, served by the credited photo path (owned, Wikimedia or Google with its credit). | Rights follow the photo route, which carries credit. It is a venue photo, so the honest `hero_image_kind` is `venue`. Not a photo of the event. |
| `img.evbuc.com` (Eventbrite) | 59 | Organizer-uploaded promo image from the Eventbrite listing. | Not verified. Eventbrite API terms allow promoting the event; no licence record exists here. Treat as `event` kind, unverified. |
| `/cards-v8`, `/guides` | 7 | Wayfind-owned files. | Owned; confirm each is registered in lib/eventPhotos.js. |
| organizer sites, CDNs (scf.edu, wixstatic, squarespace, cloudfront, posh, parrishumc, orlandogermanclub, cloudinary, s3, github raw, supabase) | ~31 | Hotlinks to third-party images. | Not licensed to us, not credited. These are the real rights risk. |

Nothing here is assumed safe. The ~31 third-party hotlinks and the 59 Eventbrite images have no rights evidence on record.

## Findings

1. `hero_image_kind IS NULL` hides which images are venue photos shown on an event card. 144 rows are venue photos and should read as `venue`. Setting the label is a data change on the Florida Events lane's table, so it is proposed, not applied.
2. 723 upcoming events show the neutral tile. That is the correct honest state; no photo of an unrelated venue or invented event photo should replace it.
3. New content is now covered by the shared gate (PR #1778, `check-new-content-images`): it rejects malformed refs, unsupported hosts, missing credit and dishonest kind on NEW or CHANGED records. It does not retroactively re-judge these 241 rows.

## Proposed next steps (need Florida Events lane / owner)

- Label the 144 `/api/photo` rows `venue` (one reviewed UPDATE with a reverse SQL file).
- For the ~31 third-party hotlinks and 59 Eventbrite images: obtain permission or replace with a licensed/owned photo; until then do not extend their use.
- For the 723 upcoming imageless events: prioritize by traffic and importance; use only owned, licensed or permission-confirmed photos (the data/*-photo-provenance.json flow). Keep the neutral tile otherwise.

## Blog

The blog lives in a separate repository that this session cannot reach, so the blog audit (hero, thumbnails, article images, cropping, attribution, broken or repeated images) is NOT done. The shared gate accepts blog records (`content|data|app/blog/**`); the blog repo must run `scripts/check-new-content-images.mjs` to be covered. Open item.

## Outcome, applied 2026-10-14 (evening)

Each of the 241 unclassified rows was judged on its own evidence with the classifier from PR #1788 (`scripts/lib/eventHeroProvenance.mjs`), run against a production snapshot, then applied with a compare-and-swap update (row changed only if `hero_image` still matched and `hero_image_kind` was still null). Per-row record: `docs/data-changes/event-hero-provenance-2026-10-14.csv`. Undo: `docs/data-changes/event-hero-provenance-2026-10-14.reverse.sql`.

| class | rows | decision | evidence |
|---|---|---|---|
| venue photo route, venue proven | 120 | labelled `venue` | 101: the photo's Google place id equals the event's own `place_id`; 19: the inventory name for that place id matches the event venue (token overlap ≥ 0.6, all reviewed by hand). Not bulk-labelled. |
| venue photo route, venue not proven | 24 | cleared to the neutral tile | place id not in our inventory (cannot verify), venue "Citywide"/empty (backfill matched on the event name), or a different place name. |
| Eventbrite (`img.evbuc.com`) | 59 | cleared | no recorded permission for Wayfind reuse. |
| third-party hotlinks | 30 | cleared | no licence or credit on record. |
| Wayfind fall collection poster on a specific event | 5 | cleared | the image gate treats the collection poster as a misleading fallback for a named event. |
| Unsplash area photos on Red Bull events | 2 | cleared | licensed, but they show a different building / the waterfront, not the event or its venue. |
| Möbius Night Market owned photo | 1 | labelled `event` | registered in `lib/eventPhotos.js` with consent. |

After: 0 unclassified event images, 129 `venue`, 65 `event`. Events with no image: 1,068 (808 upcoming), up from 948 / 723 because 120 questionable images became the honest neutral tile. No image was invented and no photo of another venue was added.
