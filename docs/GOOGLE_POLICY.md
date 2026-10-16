# Google Places content posture (updated 2026-10-15)

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

## Current photo behavior (owner direction, 2026-10-15)

The owner explicitly changed the earlier live-only decision: retain each acquired
Google photo until the owner removes it, and reuse it across visitors. This is a
product retention instruction, not evidence of a Google license exception. The
standard terms above do not establish permission for indefinite photo storage.

The shared photo route now uses `wf_google_photo_store` and the private
`google-place-photos` bucket. They are separate from the independently licensed
`wf_place_photo` library. A saved Google photo stays labelled `source: google`,
with the author information from the exact photo acquired. Image bytes are saved,
not an expiring Google redirect. Stored copies have no refresh or expiry clock.

On a miss, a real visitor on a credited surface may acquire a photo after a
cross-server database lease and the existing monthly budget grant. The Google
request sequence is bounded to 30 seconds inside the 90-second lease. Bots,
monitors, read-only guide rendering and `nospend=1` can reuse saved images but do
not buy new ones. The separate 80-photo per-visitor daily cutoff was removed.
The global photo budget and Google quota protections remain in place.

Saved images and metadata are served through revocable, no-store responses.
Card, event and guide consumers retain the same-photo credit; linked cards have
a separate accessible credit viewer. The private object URL and credentials are
never sent to the browser. Existing owned, licensed and partner imagery remains
available through its existing source paths.

To remove an image, use `node scripts/remove-google-photo.mjs PLACE_ID` to inspect
and add `--apply` to remove it using the configured server credentials. Removal
first writes a permanent tombstone, preventing automatic reacquisition and
in-flight resurrection, then deletes its bytes. Failed deletion can be retried.
A previously downloaded image already visible in a browser cannot be recalled;
new server reads stop serving it.

Verification: `test-google-photo-store.mjs` executes the actual SQL lease and
removal functions locally; `test-shared-google-photo-serving.mjs` executes the
resolver and route contracts; existing photo credit and browser viewer tests
cover presentation. The older `test-google-photo-compliance.mjs` still protects
live upstream attribution, spend controls and retired expiring-name caches. It
is not proof that this new retention policy is permitted by Google's terms.

## Known remaining gaps (not photos)

- `wf_places_cache` `pd1|`, `v1|`, `v1p|`, `wfl1|`/`wfl2p|` and `wf_inventory` keep other
  Places fields (name, address, rating, hours) for up to 30 days or longer. Section 14.3
  allows only latitude/longitude for 30 days and place IDs indefinitely. Removing that
  cache would raise paid Places calls substantially, so it needs its own owner decision.
- Cards and rails that show a licensed (Wikimedia) photo through `/api/photo` show its
  credit on the detail sheet, not on the card itself.
