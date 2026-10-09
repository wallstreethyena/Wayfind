# Google Places content posture (reviewed 2026-10-08)

This replaces the July posture note, which said "No server-side database of Google
content exists". That is no longer true, and this page says what is actually stored,
what Google's terms allow, where the two differ, and the permitted direction. It is a
review for the owner's decision, not a change: nothing here was switched off, expanded,
or given a longer retention.

## What Google's terms say (read live 2026-10-08)

| Source | Rule (verbatim) |
|---|---|
| Places API policies, *Summary* (page "Last updated 2026-10-07 UTC") | "You must not pre-fetch, cache, or store Places API content beyond the allowed exceptions" |
| Places API policies, *Exceptions from caching restrictions* | "You can therefore store place ID values indefinitely." |
| Maps Service Specific Terms, §14.3 *Places API (Legacy and New), Caching* | "Customer may temporarily cache latitude and longitude values from the Places API for up to 30 consecutive calendar days, after which Customer must delete the cached latitude and longitude values." |
| Place Photos (New) docs | "You cannot cache a photo name. Also, the name can expire." |
| Places API policies, *Attribute all content to the content author* | "You must always credit the author when displaying photos or reviews." The credit is "clearly associated with the author's photo". In limited space (galleries, thumbnails) "the author attribution can be omitted, provided that the user is able to access a larger version of the image". |
| Place Photos (New) docs | "you must include the additional attribution in your application wherever you display the image." "Google recommends loading photos on demand." |
| Pricing page | `photos` in Place Details bills as **Place Details Essentials (IDs Only)**, free with no cap. Photo media bills as **Place Details Photos**: 1,000 free per month, then $7.00 per 1,000. |

**The 30-day allowance covers latitude/longitude only.** Several code comments call 30
days "the Google ToS maximum for cached place content" (`app/api/photo/route.js`,
`app/api/places/search/route.js`, `lib/placeDetails.js`); that reading is wrong for anything but coordinates.

## What Wayfind does now (owner decision 2026-10-08, implemented)

The owner chose the compliant direction: licensed and permitted photos first, Google
photos only live, credited and within the existing budget.

**Photo order** (`lib/placePhotoServe.js`, `app/api/photo/route.js`):
1. Wayfind's own photo (inventory, never a Google-hosted URL).
2. A photo the business or a creator gave permission to use (`wf_place_photo`,
   non-licensed sources rank first, `lib/freePhoto.js preferPermittedRow`).
3. A properly licensed photo of the same place (`wf_place_photo`, e.g. Wikimedia).
4. A live Google photo, ONLY on the place detail hero and its photo viewer
   (`/api/photo?place=<id>&s=detail&fmt=json`), shown with the author's linked name and
   a "Google Maps" link (`app/components/PhotoCredit.js`).
5. Otherwise a clean placeholder. Never another venue's photo, never a photo taken
   from a website or Instagram without permission.

**Google request per detail view:** Place Details `fields=photos` (Essentials IDs Only,
free, metered by our `details_ids_only` ledger) with `cache: "no-store"`, then one
Place Photos media request (`photos` ledger, cap 3,000/month), answered
`private, no-store`. Bots, monitors and `nospend=1` never buy; the quota breaker,
singleflight, fail-closed ledger and refund rules are unchanged
(`scripts/test-google-photo-compliance.mjs`).

**Nothing Google-photo-derived is stored:** no `photo|`/`photoneg|` cache rows, no
`wf_photo_credit` rows, no real photo names anywhere. Stored refs are the place-only
pseudo-ref `places/<placeId>/photos/wfplacediscovery` (only the place ID, which the
terms allow indefinitely). `photo-warm` and `credited-photos` are permanently off.
The stored data was removed by a scoped migration (see the PR).

## Known remaining gaps (not photos)

- `wf_places_cache` `pd1|`, `v1|`, `v1p|`, `wfl1|`/`wfl2p|` and `wf_inventory` keep other
  Places fields (name, address, rating, hours) for up to 30 days or longer. Section 14.3
  allows only latitude/longitude for 30 days and place IDs indefinitely. Removing that
  cache would raise paid Places calls substantially, so it needs its own owner decision.
- Cards and rails that show a licensed (Wikimedia) photo through `/api/photo` show its
  credit on the detail sheet, not on the card itself.
