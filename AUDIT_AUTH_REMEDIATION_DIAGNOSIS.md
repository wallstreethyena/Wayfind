# v5.50 audit remediation — Phase 0 diagnosis (auth flows + P0/P1 state)

Branch `audit-p0p1-2026-07`. Diagnosis only, no fixes. This spec overlaps
heavily with work already merged THIS session; each item below is marked
**OPEN**, **PARTIAL**, **DONE (this session)**, or **OWNER-ONLY** so the
real remaining work is unambiguous.

## Authenticated screens — guard state (the P0 headline)

Screens render purely on the `screen` state var in `app/home.js`
(`{screen === "saved" && <SavedScreen …>}` at 6208-6210); the bottom nav
(`setScreen(id)`) and menu actions set it with **no auth check**. So:

| Screen | Reachable signed-out? | Guard present? | Evidence |
|---|---|---|---|
| Saved (Favorites/Liked/Disliked/Shared) | **YES — renders** | none on render | `home.js:6209`; `Saved.js` shows "Sign in to save your lists across devices" AND the actual lists |
| Itinerary | **YES — renders** | none on render | `home.js:6210` |
| Coupons | **YES — renders** | none on render | `home.js:6208` |
| Account sheet | gated (only opens when `user`) | component check | opens via account button shown only when signed in |
| Lists / "+ New list" | action gated | `requireAuth` | `Saved.js:16` |

**GAP (OPEN, P0):** the favorites-auth work (PR #63) gated every *write
action* (`requireAuth` on 12 paths) but did NOT gate *screen rendering*.
A signed-out user taps Favorites/Itinerary/Coupons in the bottom nav and
the screen renders — the exact audit finding. There is no central
`ensureAuthenticated()` before the authenticated screens render.

## Write actions — guard state

**DONE (PR #63, this session):** `requireAuth()` gates all 12 write paths
(quickSaveFavorite, toggleLike, toggleDislike, toggleHookLike, saveHookList,
onHookHeart, addShared, toggleSaveCoupon, createList, saveToList, deleteList,
renameList) + itinerary/list triggers. A signed-out tap opens the auth
dialog and does not persist. `scripts/check-favorites-auth.mjs` enforces it.
**Server (RLS):** `auth.uid() = user_id` on `saved_places`/`likes` in both
schema files. So Rule 1's *write* half is largely in place; the *render*
half (screens) and the *server 401 on every mutation endpoint* claim need
verification (there are no custom mutation API routes — writes go
client→Supabase directly, so RLS is the server enforcement).

## Anonymous persistence (OPEN, P0)

The exact legacy keys the audit named are **still present** in `home.js`:
`wf_liked`, `wf_liked_items`, `wf_disliked_items`, `wf_shared_items`,
`wf_coupons`, `wf_hook_likes`, `wayfind_lists`, `wayfind_trips` (plus
`wf_device`, `wf_signals`, `wf_reservations`, `wf_drive_votes` etc.). The
Saved screen still **reads and displays** anonymously-stored items with the
copy **"These live only on this phone. Sign in to save them."**
(`Saved.js:85`) and **"Sign in to save your lists across devices."**
(`Saved.js:21`). PR #63 stopped NEW anonymous writes but left the legacy
read/display path and the local-persistence copy — which the audit flags as
"anonymous persistence language contradicts the auth model." **Count of
copy promising local persistence: ≥2 in Saved.js**, plus any on the
`/favorites` `/itinerary` `/coupons` bridge pages and Privacy (to verify in
Phase 1/7).

## Price rendering (OPEN, P0)

`PriceMeter` (`home.js:1427`) **always renders all four `$` glyphs**,
encoding the level only in COLOR (green for `n <= level`, muted otherwise):
`[1,2,3,4].map(n => <span color={n<=level?green:muted}>$</span>)`. A
black-box reviewer (or a colorblind user) sees "$$$$" next to "Moderate."
The underlying data IS correct (`lib/google.js` maps
`PRICE_LEVEL_MODERATE → priceNum 2, price "$$"`). **Fix = render `level`
glyphs, not 4** (or the text label alone). Dining cards elsewhere already
show the correct `costForTwo().tier` (`home.js:6008/6339`); the PlaceCard
meter (`home.js:6564`) is the offender.

## Recommendation classification (OPEN, P1)

Tags/categories come from Google `types` + heuristic inference
(`lib/tags.js`, `eventCategory`, `Ranking.coarseCat`) with **no override
table, no per-category tag whitelist, and no confidence threshold**. The
audit's examples (Seasons 52 → "Vegan", Bocas Grill → "Breakfast",
Nightlife in Food) are inference misfires. Needs: a schema-validated
override file (placeId → {category, tags}), category whitelists, and a
CI test that fails on a whitelist violation.

## Search autocomplete (PARTIAL, P1)

On selection the code DOES `setSuggestions([])` (`home.js:5012/5096/5104`)
and `onBlur` clears after 150ms (`home.js:5581`), so it mostly closes — but
there is **no combobox/listbox/option ARIA** (grep finds none), no
arrow-key navigation, and the stale-results-during-refresh behavior needs a
loading-state swap. So: a11y semantics OPEN, immediate-close mostly DONE,
loading-swap to verify.

## Sign-in dialog a11y (OPEN, P1)

`Auth.js` HAS `role="dialog"` + `aria-modal` + `aria-label` + focus trap
(`useDialogFocus`, from #63/G4). MISSING: `<label>` elements (inputs use
placeholder only), `id`/`name`/`autocomplete="email"`/`autocomplete=
"current-password"`; "Create one" and "Forgot password?" are
`<span onClick>` not semantic `<button>`/`<a>`; no visible close (×) button.

## Events durable URLs (PARTIAL/DONE, P1)

**DONE (PR #67):** internal event **detail** pages
`/events/[city]/[slug]`, server-rendered, with `Event` JSON-LD + a proper
404. **OPEN:** the spec's time-windowed **list** pages
(`/events/[city]/this-weekend|tonight|this-month`) with `ItemList` schema
and SSR event lists do NOT exist; `/events` is still the thin bridge.

## Secondary — mostly DONE or OWNER-ONLY

- **CSP report-only + security headers** (HSTS/XFO/XCTO/Referrer/
  Permissions): DONE (#61). **Enforce-flip: OWNER-ONLY** (after 7 clean
  report-only days). **CSP has `unsafe-inline`** — removing it needs
  nonces/hashes on the inline layout scripts (Stay22, skip-link) = real
  work, OPEN if pursued.
- **Wordmark 657KB PNG / bundle 334KB / events DOM count / AdvancedMarker
  migration:** OPEN (perf) — bundle is gated at 141KB *route chunk* but the
  spec measures total; wordmark size to verify.
- **Sitemap events/coupons, programmatic "Best"→"near" titles, guide
  imagery, GSC reindex:** SEO — some DONE (#61 sitemap), reindex OWNER-ONLY.
- **Privacy "encrypted password" / deletion email / counsel review:**
  Phase 7 — copy edits OPEN, counsel review OWNER-ONLY.

## Diagnosis (one paragraph, before fixes)

The audit's two P0s are real and NOT closed by this session's prior work:
(1) the favorites-auth PR gated every write *action* but never gated
*screen rendering*, so a signed-out user still reaches Favorites,
Itinerary, and Coupons from the bottom nav, and the Saved screen still
*reads and displays* anonymously-stored items under copy that promises
local-device persistence — the legacy `wf_liked`/`wf_shared_items`/etc.
keys and their read paths are still live; and (2) the price meter always
paints four `$` glyphs and encodes the tier only in color, so every card
reads "$$$$" regardless of its "Inexpensive/Moderate" label even though the
underlying `priceNum` is correct. Both are small, surgical fixes: a
central render-time `requireAuth`-style gate on the three authenticated
screens (reusing the existing `requireAuth`/`setAuthOpen` source of truth,
not a new second auth system), removal of the anonymous read/display +
copy, and a one-line change to `PriceMeter` to render `level` glyphs. The
P1 items split into genuinely-open (classification override/whitelist +
CI test, sign-in input labels + semantic controls, event list pages,
autocomplete ARIA) and already-done/owner-only (events detail URLs #67,
dialog focus-trap #63, CSP headers #61, GSC reindex, counsel review,
Lighthouse/perf targets). Recommend doing the two P0s + the sign-in a11y +
the price/classification tests as the high-value first slice, and treating
perf/CSP-enforce/SEO-reindex/legal as owner-sequenced follow-ups — rather
than one 10-phase sweep, most of whose later phases are done or owner-gated.
