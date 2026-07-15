# Work order + session handoff — deals engine & per-tab discovery share cards
_Branch: `deals-sharecards` · v6.17 · Written by Claude (Cowork cloud session) for any Claude Code terminal session picking this up. Gabe wants the two Claudes coordinating through this doc + the branch commits: read this first, append your findings under "Terminal session log" at the bottom, keep commits on this branch._

## What this track ships (Gabe's ask, July 14–15)
1. **Deals placed in the app with a badge.** 8 verified local offers now live in `lib/coupons.js` (first real coupon load): each tagged with `intents` (which "right place, right moment" tabs surface it) and `match` (place names for the card pill). Discover Sarasota Tours (code LOCAL, exp 7/31) is under `outdoors` + `familyfun` per Gabe. The 🏷️ chips are placeholder badge mounts — Gabe delivers the deal-badge logo next build.
2. **Self-cleaning expiry.** Expired coupons already auto-hide (`couponIsLive`, same rule the Coupons tab used). Off-repo: 5 scheduled "expiry robot" tasks (one per dated deal) + a weekly Monday deals audit already exist in Gabe's Claude scheduled tasks; the registry of deals ↔ reminders is the project doc `wayfind-deals-registry.md` (Claude project, not this repo).
3. **Per-tab share cards.** Sharing a moment tab's list now unfurls with that tab's artwork + copy: `lib/shareCards.js` (datenight, nightout, eatnow, hiddengems, outdoors, familyfun) → `/l/[key]` metadata passes `&card=` → `/api/og` composites the LIVE copy over `public/cards/<slug>.jpg`. Nothing is baked into images (master card spec). Missing art = automatic fallback to the standard pin-and-road OG.

## Files changed on this branch
- `lib/coupons.js` — 8 deals + helpers (`couponIsLive`, `couponsForIntent`, `couponForPlaceName`, `couponEndsLabel`) + `normalizeOfferRow` (see bug fix below)
- `lib/shareCards.js` — NEW: per-tab card config (art path, eyebrow/title/desc/CTA/shareLine; copy limits enforced by hand: eyebrow 12–20 chars, title 2–5 words, desc 55–90 chars, CTA 2–5 words)
- `app/api/og/route.js` — `?card=` branch: category art background + right-side gradient + card copy; default path byte-identical behavior
- `app/l/[key]/page.js` — card-aware metadata in the non-snapshot branch
- `app/components/screens/Experience.js` — deals strip (live coupons for the active tab, taps → Coupons screen) + share text from the card's shareLine
- `app/home.js` — BUILD_ID v6.17; coupon pill on PlaceCard (only when no Supabase offer pill); `loadOffers` + coupons-tab loader now normalize Supabase rows via `normalizeOfferRow`
- `VERSION` 6.17, `CHANGELOG.md` entry

## Root-cause fix riding along (verify it!)
Supabase `offers` rows could never render: `offers.sql` columns are `offer_title/coupon_code/affiliate_url/direct_url/expiration_date/city` but `offerRedeemable` + both loaders in `home.js` read `title/code/url/expires/area`. `normalizeOfferRow` (lib/coupons.js) is now the single adapter at both call sites. To verify: insert a test row per offers.sql's comment block into Supabase → it should badge the matching place card and appear on the Coupons tab without a deploy. (Nothing was inserted yet; the 8 launch deals ship in code, on purpose, so they're versioned.)

## BLOCKING ITEM — the 6 card images
`public/cards/` must contain (~1.9:1, ideally ≤400KB each, jpg):
`date-night.jpg · night-out.jpg · where-to-eat.jpg · hidden-gems.jpg · outdoors.jpg · family-fun.jpg`
Gabe has the 6 finals (sent in the Cowork chat 7/15). He's dropping them into `~/Projects/wayfind/public/cards/`; if you see raw drops with other names, rename to the slugs above, `sips`/`squoosh` them under ~400KB, and commit. Until they land, card shares fall back to the standard OG art (by design, nothing breaks).

## Verification checklist (run in terminal)
1. `npm run check:version && npm run check:jsx && npm run check:dupes && node scripts/check-cards.mjs && node scripts/check-copy.mjs`
2. `npm run build` (full prebuild gate)
3. Manual: `/l/datenight?n=12&loc=Parrish` metadata → og:image contains `card=datenight`; `curl "localhost:3000/api/og?kind=list&card=datenight&n=12"` renders art + copy (after images land)
4. Moment tab (e.g. Family Fun): deals strip shows ZooTampa/Ringling/Mote entries, soonest-ending first; The Ringling place card shows the 🏷️ Deal pill; Coupons tab lists all 8 with correct "Ends" dates
5. Temporarily set one coupon's `expires` to yesterday → it vanishes from strip, pill, and tab; revert
6. WORK_ORDER.md's other tracks (scroll/ranking) are UNTOUCHED by this branch — keep it that way

## Terminal session log
_(append findings/decisions here)_
