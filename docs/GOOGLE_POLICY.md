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

## What Wayfind stores and prefetches today

| Store / job | Google content held | Retention | Within the terms? |
|---|---|---|---|
| `wf_places_cache` `photo\|<photo name>\|640` rows | photo **names** (as keys) and the served image **URI** | 30 days | No: photo names "cannot" be cached; no exception covers image URIs |
| `wf_photo_credit` | photo names + author name/profile URI | 30 days | No: same photo-name rule |
| `wf_inventory.photo_ref` / `photo_url` | photo names, sometimes direct `googleusercontent` URIs | until refreshed | No for the names/URIs; place IDs and coordinates are allowed |
| `wf_inventory` other columns | place ID, lat/lng, name, types, status | until refreshed | Place ID yes; lat/lng only for 30 days; other fields not covered |
| `/api/cron/photo-warm` (every 15 min) | fetches Google photos for listed surfaces ahead of any viewer | n/a | No: "must not pre-fetch" |
| `/api/cron/credited-photos` (#1649/#1663, paid, owner-approved) | prefetches photo + credit for blog/guide venues | 30 days | Same pattern as photo-warm |
| `wf_place_photo` (Wikimedia Commons, licence-checked) | not Google content | permanent | Yes, under each file's licence |

## Attribution (fixed for city cards 2026-10-08)

Google requires the author credit wherever a Places photo is shown. City cards
(`lib/landingPage.js`) now show a Google photo only with that exact photo's credit,
printed visibly on the photo and linked to the author's profile. Otherwise they use a
licensed photo with its licence credit, or the "No verified photo yet" placeholder
(`lib/cardPhotoCredit.js`, `scripts/test-city-card-photo-credit.mjs`). Guides already
did this since 2026-09-30 (`app/guides/layout.js`).

**Still uncredited:** home rails (`RailCard`), the place detail sheet, map pins,
explore bridge and other surfaces outside guides and city pages still render Google
photos without a per-photo credit. Wrapping a route in `PhotoPolicyProvider
requireGoogleCredit` drops those photos today. Showing them credited needs the same
server-side pairing the city cards use.

## Permitted direction (owner decision)

1. **Prefer images Wayfind may keep.** Licensed Commons photos (`wf_place_photo`),
   the owner's own photography, and venue or creator photos supplied with written
   permission. These can be stored, so coverage built on them does not decay or
   breach the terms.
2. **Google photos on demand only.** At display time: Place Details with
   `fields=photos` (IDs Only, free) for the current photo name and its
   `authorAttributions`, then one media request. Do not store the name, URI or
   credit beyond the request, and show the credit with the image. The cost is real:
   each display is a Place Details Photos event (1,000 free per month, then $7 per
   1,000). Wayfind's monthly cap (3,000) and Google's own daily quota both bound it.
3. **Stop prefetching.** `photo-warm` and `credited-photos` exist to fill a store the
   terms do not allow. Turning them off reduces coverage until (1) and (2) carry it.
   That trade is the owner's call; this review does not make it.

Until the owner decides, nothing above is expanded: no new cache, no longer
retention, no new prefetch.
