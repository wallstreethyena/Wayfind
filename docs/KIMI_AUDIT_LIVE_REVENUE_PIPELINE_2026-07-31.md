# Live Affiliate Revenue Pipeline Audit

**Auditor:** Kim (CPO / money-funnel lane)  
**Date:** 2026-07-31  
**Branch:** `feat/kimi-money-funnel-traceability`  
**Ground truth:** Owner manually verified a live Viator "Book" click on production reaches `https://www.viator.com/...?pid=...&mcid=42383&medium=link` and that `provider_redirect_started` lands in PostHog. All other claims below are derived from code inspection of the same deployed state.

## Executive verdict

The pipeline is **architecturally half-built**. The server-side redirect layer (`/api/commerce/go`, `/api/viator/go`, `/api/eats/go`) is correct and emits the one event that proves a handoff happened. But most high-intent clicks **never touch it**. They open a partner URL directly from the DOM, so we capture a legacy `*_out` click (or nothing) and never see `provider_redirect_started`. We cannot tell whether the click reached the partner, we cannot tie it back to a card, and on Uber Eats we are not even attempting to earn.

### Shipped on this branch (2026-07-31)

- **Client-side `click_id` + server echo.** `lib/commerce.js` now mints `click_id` on the client; `/api/commerce/go`, `/api/viator/go`, and `/api/eats/go` accept and reuse it; `scripts/check-provider-redirects.mjs` proves the echo.
- **Detail-sheet money CTAs instrumented.** `BookingCTA` (primary + tour list + fallback) and `BookItLink` now emit `commerce_impression` (viewability-gated) and `commerce_cta_clicked` with `click_id`.
- **Event ticket CTAs instrumented.** `TicketButton` and event-detail primary ticket links emit `commerce_cta_clicked`.
- **Order In / cuisine shortlist fixed.** Order In emits `commerce_cta_clicked`; the cuisine shortlist sends real `provider` and `offer_id`.
- **Funnel ratchet tightened.** `lib/funnel.js` now reports the detail path as readable; `scripts/check-money-funnel.mjs` ratchets uninstrumented surfaces down to one (`app/home.js` rails).

### Still open (config / other lanes)

1. Settle the Uber Eats affiliate program and set `NEXT_PUBLIC_UBEREATS_TEMPLATE`.
2. Apply the reviewed coupon-menu visual patch and re-verify the two expiring offers.
3. Instrument the home.js Viator rails so the ratchet can drop to zero.

---

## 1. Surface-by-surface tracking matrix

| Surface | CTA(s) | Href builder | Tracking endpoint | Client events | Server events | Params preserved | Card traceable |
|---|---|---|---|---|---|---|---|
| **Detail sheet — primary action** | Book tickets / Check rates | `lib/detailCta.js` → `BookingCTA` → `lib/bookingResolve.js` | `/api/viator/go` for search fallback; direct Viator product URL for verified tours; direct Booking.com for hotels | `primary_cta_clicked`, `tickets_out` / `hotel_out`, `commerce_impression`, `commerce_cta_clicked` | `provider_redirect_started` (search fallback only) | Viator `pid`/`mcid`/`medium`; hotel plain URL (Stay22 rewrites client-side) | **Yes** for search fallback via `click_id`; direct product/hotel URLs still untraceable |
| **Detail sheet — Viator options nearby** | Tour cards | `BookingCTA variant="list"` → `Aff.viatorDirectUrl(t.url)` | Direct Viator URL | `tour_card_out`, `commerce_impression`, `commerce_cta_clicked` | None | Viator `pid`/`mcid`/`medium` | **Partial** — click event carries `click_id`; cannot join to server redirect because URL is direct |
| **Detail sheet — Book it** | Book it (Travelpayouts) | `BookItLink` → `tpDeepLink` | Direct tp.media URL | `book_it_out`, `commerce_impression`, `commerce_cta_clicked` | None | `marker=750791`, `trs=550160`, `campaign_id`, `p` | **Partial** — click event carries `click_id`; cannot join to server redirect because URL is direct |
| **Detail sheet — VRBO** | Vacation rentals | `Aff.vrboUrl` | Direct VRBO URL (plain until template set) | `vrbo_out` | None | None until template set | No |
| **Detail sheet — Tripadvisor** | Tripadvisor rating | `_ta.url` | Direct Tripadvisor URL | `ta_out` | None | None | No |
| **Detail sheet — event tickets** | Get tickets | `ticketUrl` → `Aff.ticketOutUrl` | Direct URL; TM-family wrapped by Impact | `ticket`, `commerce_cta_clicked` | None | Impact `SID`/`campaign`/`ad`/`subId1` for TM | **Partial** — click event carries `click_id`; direct URL still untraceable |
| **Homepage / home feed** | Bookable experience card, event rail, place-card "Book on Viator" | `homeExp.url`, `Aff.viatorDirectUrl`, `cardProduct.url` | Direct Viator URL | `tickets_out`, `culture_book` | None | Viator `pid`/`mcid`/`medium` | No |
| **Things-to-do / Family / Vibe tour rails** | Bookable tour cards | `ViatorRail` / `BookableExpRail` → `Aff.viatorDirectUrl` | Direct Viator URL | `tickets_out` | None | Viator `pid`/`mcid`/`medium` | No |
| **UT deals rails** | Theme-park tickets / hotels | `UTDealsRail` → `commerceHref` | `/api/commerce/go?provider=undercover_tourist` | `tickets_out` | `provider_redirect_started` | CJ PID via stored deep link | Yes, via `click_id` |
| **Cuisine shortlist** | Claim deal / Order pickup / Directions | `lib/rowCta.js` | Deal = direct coupon URL; Delivery = direct Uber Eats URL; Directions = Google Maps | `commerce_cta_clicked` (only when monetized) | `provider_redirect_started` only if deal URL is `/api/commerce/go` (Clipp) | Clipp CJ link for Clipp deals; Uber Eats plain URL | **Yes** for Clipp via `click_id`; `offer_id` now real; Uber Eats still plain until template set |
| **Food tour rail** | See dates | `FoodTourRail` → `commerceHref` | `/api/commerce/go?provider=viator` | `commerce_impression`, `commerce_cta_clicked`, `disclosure_viewed` | `provider_redirect_started` | Viator `pid`/`mcid`/`medium` | Yes |
| **Coupons / Deal Sheet** | Claim deal | `PosterCard` / `LedgerRow` | Clipp/Klook/Viator direct URLs or `/api/commerce/go` for Clipp | `coupon_out`, `commerce_cta_clicked` (poster, affiliate only), `disclosure_viewed` | `provider_redirect_started` for Clipp only | Clipp CJ link; Klook `aid`; Viator `pid` | Partial — direct URLs untraced; Viator/Klook provider names mismatch route |
| **Order In** | Order/Find on Uber Eats | `/api/eats/go` | `/api/eats/go` | `commerce_cta_clicked` | `provider_redirect_started` | Uber Eats plain URL (template unset) | **Yes**, via `click_id` |
| **Events detail** | Get tickets / Official site | `TicketButton` → `ticketOutUrl` | Direct URL; TM-family Impact wrapped | None | None | Impact params for TM family | No |

**Key observation:** Only three surfaces route every click through a server redirect (`UTDealsRail`, `FoodTourRail`, `/api/eats/go`). Everything else relies on direct partner URLs and legacy click events.

---

## 2. Revenue Risk Report

| # | Risk | Severity | Owner | Evidence | Fix | How to measure |
|---|---|---|---|---|---|---|
| 1 | **Uber Eats is completely untracked.** `NEXT_PUBLIC_UBEREATS_TEMPLATE` is unset. Detail-sheet delivery, cuisine-shortlist delivery, and every Order In card open plain `ubereats.com` URLs. | P0 | Owner + GWEN | `lib/affiliates.js` lines 183–190; `app/order-in/OrderInClient.js` line 168; `lib/rowCta.js` line 74 | Confirm an Uber Eats affiliate program exists (Impact/Sovrn/Other), set the template, or suppress the CTA until it does. | `provider_redirect_started` with `provider = "uber_eats"`; `eats_out` if a client event is added |
| 2 | **No click event on event tickets.** `TicketButton` opens the ticket URL directly and emits nothing to PostHog. Event pages are a monetized surface with zero instrumentation. | P0 | claude.exe | `app/events/[city]/[slug]/TicketButton.js` lines 16–27 | Add `tickets_out` or `commerce_cta_clicked` on ticket tap; consider routing TM-family through `/api/commerce/go` with a new `ticketmaster` provider. | `tickets_out` with `src = "event_detail"` or `commerce_cta_clicked` with `provider = "ticketmaster"` |
| 3 | **Client click and server redirect cannot be joined.** `click_id` is minted server-side, so `commerce_cta_clicked` has no `click_id` and cannot be deterministically tied to `provider_redirect_started`. | P0 | Kim lane + claude.exe | `lib/commerce.js` lines 141–146; `app/api/commerce/go/route.js` lines 53–58 | Generate `click_id` client-side, pass it in the redirect URL, emit it with `commerce_cta_clicked`, and have the server accept/use it. | % of `provider_redirect_started` events with a matching `commerce_cta_clicked` by `click_id` |
| 4 | **High-intent Viator product clicks bypass the server redirect.** Verified product URLs on the detail sheet and home rails open Viator directly. We see `tickets_out` but never `provider_redirect_started`. | P1 | claude.exe | `lib/bookingResolve.js` line 52; `app/components/BookingCTA.js` lines 44–61; `app/home.js` lines 7793, 8577, 8648, 8751 | Route verified Viator product URLs through `/api/commerce/go` (extend `PROVIDERS.viator` to accept product URLs from `wf_experiences`) or append a client `click_id` to the outbound URL. | `provider_redirect_started` count vs. `tickets_out` count for Viator surfaces |
| 5 | **Hotel "Check rates" relies on Stay22 script rewrite.** The href is a plain `booking.com` URL. If the script is blocked or fails, the click earns nothing. | P1 | claude.exe + GWEN | `lib/affiliates.js` `hotelUrl` lines 163–173; `BookingCTA` primary variant | Keep Stay22 as optimizer, but add a server redirect wrapper that records the click and preserves a baseline CJ/Stay22 attribution parameter. | `hotel_out` + `provider_redirect_started` for hotel CTAs |
| 6 | **Coupon direct URLs mismatch the commerce provider name.** The Viator special-offer card and Klook card set `provider = "viator"` / `"klook"` in `commerce_cta_clicked`, but the href is direct. `provider_redirect_started` never fires for these providers, so dashboards will show clicks with no matching redirects. | P1 | GWEN | `app/components/screens/Coupons.js` lines 75–84; `lib/coupons.js` Klook/Viator rows | Either route these clicks through `/api/commerce/go` (add `klook` and `viator-coupon` providers) or stop emitting `commerce_cta_clicked` for direct URLs and use a legacy `coupon_out`-only model until they are routed. | Funnel drop between `commerce_cta_clicked` and `provider_redirect_started` by provider |
| 7 | **Cuisine-shortlist `offer_id` is useless.** `parts.js` sends `offer_id: cta.type` (e.g., `"deal"` or `"delivery"`) instead of the actual coupon or provider offer id. | P1 | DEEPSEEK | `app/eat/[metro]/[cuisine]/parts.js` lines 119, 129–134 | Pass the real offer id (`coupon.id` for deals, `"uber_eats"` for delivery) in `offer_id`. | `commerce_cta_clicked` `offer_id` cardinality matches live offer set |
| 8 | **Detail-sheet legacy events duplicate commerce events.** A single ticket click fires `primary_cta_clicked`, `tickets_out`, and `commerce_cta_clicked`. Analysts can double-count if they sum "all click events." | P1 | Kim lane + claude.exe | `app/components/sheets/Detail.js` lines 314–318; `app/components/BookingCTA.js` lines 48–53 | Document the hierarchy in the money-funnel dashboard: `commerce_cta_clicked` is the canonical click event; legacy `*_out` events are provider labels, not additive. | Dashboard definitions |
| 9 | **Coupon-menu visual patch unapplied.** The reviewed redesign has not shipped, so the highest-intent deal surface still renders the pre-patch card design. | P1 | claude.exe | Deals registry 2026-07-30 note; owner live session | Apply `wayfind-coupon-menu-2026-07-29.patch` or the reviewed `coupons-premium-mock.html`. | `coupon_out` rate on `/coupons` |
| 10 | **Expiring offers need re-verification.** `cpn-discover-sarasota-local-20` expires 2026-07-31; `cpn-klook-us-attractions-5` expires 2026-08-02. | P2 | GWEN | `lib/coupons.js` lines 161–164, 126–129 | Run the scheduled audit robots and update or purge before expiry. | Offer still live after expiry date; no `provider_redirect_failed` spike from expired links |
| 11 | **VRBO template unset and no disclosure.** The detail-sheet VRBO link is plain and unmonetized; it also lacks the FTC line. | P2 | claude.exe + GWEN | `lib/affiliates.js` lines 196–202; `app/components/sheets/Detail.js` lines 624–629 | Set `NEXT_PUBLIC_VRBO_TEMPLATE` or remove the link until a program is live; add disclosure if it becomes monetized. | `vrbo_out` with tracked redirect URL |
| 12 | **Order In has no client click event.** `/api/eats/go` emits `provider_redirect_started`, but the page itself fires no `eats_out` or `commerce_cta_clicked`, so the old command-center "Partner clicks" chart will show zero food clicks even after the template is fixed. | P2 | DEEPSEEK | `app/order-in/OrderInClient.js` lines 168–175 | Add `commerce_cta_clicked` (or `eats_out`) on card tap, carrying `surface = "order_in"`. | `eats_out` / `commerce_cta_clicked` count matches `provider_redirect_started` for Uber Eats |
| 13 | **Most legacy money surfaces have no `commerce_impression`.** The detail sheet, home rails, and event page do not emit impression events, so click-through rate is unreadable. | P2 | claude.exe + DEEPSEEK | `lib/funnel.js` `UNINSTRUMENTED_MONEY_SURFACES` lines 67–76 | Add `commerce_impression` to each monetized CTA as it is migrated to the commerce schema. | `commerce_impression` count per surface |

---

## 3. Missing Tracking Report

These are gaps where a monetized or potentially monetized surface either emits no event or emits the wrong event.

| Surface | Status | Missing / wrong | Why it matters | Fix owner |
|---|---|---|---|---|
| Event detail — ticket button | **Shipped** | Now emits `commerce_cta_clicked` | — | claude.exe |
| Order In cards | **Shipped** | Now emits `commerce_cta_clicked` | — | DEEPSEEK |
| Homepage / home feed rails | **Open** | No `commerce_impression` or `commerce_cta_clicked` | Cannot compute CTR; legacy `tickets_out` is all we have | claude.exe |
| Detail sheet Viator product / tour list | **Shipped** | Now emits `commerce_impression`, `commerce_cta_clicked` with `click_id`; still direct URL | Click event exists but cannot join to server redirect because URL is direct | claude.exe |
| Detail sheet BookItLink | **Shipped** | Now emits `commerce_impression`, `commerce_cta_clicked` with `click_id`; still direct URL | Click event exists but cannot join to server redirect because URL is direct | claude.exe |
| Detail sheet VRBO | **Open** | No `commerce_*` event; plain URL | No attribution or measurement | claude.exe / GWEN |
| Detail sheet Tripadvisor | **Open** | No `commerce_*` event | `ta_out` only; not in money funnel | claude.exe |
| Culture "What locals know" book links | **Open** | No `commerce_*` event | `culture_book` only; not in money funnel | claude.exe |
| Cuisine shortlist delivery | **Shipped** | `offer_id` and `provider` now correct | — | DEEPSEEK |
| Coupons Viator/Klook direct cards | **Open** | `commerce_cta_clicked` names provider but redirect never fires | Funnel appears to have clicks without redirects | GWEN |
| All server-routed providers | **Shipped** | `click_id` now generated client-side and echoed server-side | — | claude.exe + Kim lane |

---

## 4. Broken Affiliate Report

"Broken" here means the link either does not earn, does not record, or is visually broken.

| # | Issue | Status | Owner | Evidence | Fix |
|---|---|---|---|---|---|
| 1 | `NEXT_PUBLIC_UBEREATS_TEMPLATE` unset | Live revenue leak | Owner / GWEN | `lib/affiliates.js:183`; `eats_out` = 0 non-owner | Set template or suppress CTA |
| 2 | `NEXT_PUBLIC_VRBO_TEMPLATE` unset | Dark but plain link renders | Owner / GWEN | `lib/affiliates.js:196` | Set template or remove link |
| 3 | Coupon-menu visual patch unapplied | Conversion loss | claude.exe | Deals registry 2026-07-30; owner live session | Apply patch / mock |
| 4 | Clipp geo-gating was broken (Orlando saw Sarasota/Bradenton) | **Fixed** in #520 | claude.exe | Verified in registry | Monitor with `coupon_out` by metro |
| 5 | `cpn-discover-sarasota-local-20` expires 2026-07-31 | Monitor | GWEN | `lib/coupons.js:163` | Re-verify or purge by Aug 1 robot |
| 6 | `cpn-klook-us-attractions-5` expires 2026-08-02 | Monitor | GWEN | `lib/coupons.js:128` | Re-verify or purge by Aug 3 robot |
| 7 | Event ticket URLs not validated after build | Potential dead links | LLAMA / claude.exe | `app/events/[city]/[slug]/page.js:179` | Add periodic health check or user-report fallback |
| 8 | CJ `NEXT_PUBLIC_CJ_PID` set but `hotelUrl` does not use it | Hotel attribution depends entirely on Stay22 | GWEN | `lib/affiliates.js:108–173` | Decide CJ vs. Stay22 ownership; do not leave both passive |

---

## 5. Highest ROI improvements

Ranked by money-per-hour-of-work, given the current traffic base.

| Rank | Fix | Owner | Effort | Expected revenue impact | Proof metric |
|---|---|---|---|---|---|
| 1 | Settle Uber Eats affiliate + set `NEXT_PUBLIC_UBEREATS_TEMPLATE` | Owner / GWEN | Hours | Largest immediate lift; food is the biggest inventory category and every click is currently free | `provider_redirect_started` `provider = "uber_eats"` |
| 2 | Apply coupon-menu visual patch | claude.exe | Minutes | Restores intended conversion on a surface that already has live deals | `coupon_out` rate on `/coupons` |
| 3 | Instrument home.js Viator rails with `commerce_cta_clicked` + impression | claude.exe | Hours | The homepage/home feed are real traffic surfaces and currently only emit legacy clicks | `commerce_cta_clicked` from home surfaces |
| 4 | Route verified Viator product clicks through `/api/commerce/go` | claude.exe + GWEN | 1–2 days | Closes the biggest direct-URL bypass; Viator is the primary earner today | `provider_redirect_started` vs. `tickets_out` gap closes |
| 5 | Add hotel redirect wrapper instead of plain Booking.com | claude.exe + GWEN | 1–2 days | Protects hotel attribution if Stay22 script fails | `hotel_out` + `provider_redirect_started` |
| 6 | Coupon Viator/Klook direct cards — route or stop emitting `commerce_cta_clicked` | GWEN | Hours | Prevents a funnel that shows clicks without redirects | `provider_redirect_started` matches `commerce_cta_clicked` by provider |
| 7 | Add `commerce_impression` to remaining legacy rails | claude.exe | 1–2 days | Enables CTR measurement and exposes dead CTAs | `commerce_impression` per surface |

---

## 6. Estimated revenue impact of each fix

Assumptions (update from PostHog once #502 funnel instrumentation is live):

- ~447 real visitors / 14 days = ~32 visitors/day.
- Real monetizable sessions concentrate on guides and detail sheets.
- Viator commission ~8%, average booked experience ~$65.
- Uber Eats / Clipp dining commission ~12%, average order ~$35.
- Hotel/stay22 commission variable, average booking ~$150.

| Fix | Conservative CTR lift | Commission basis | Est. incremental annual revenue | Confidence |
|---|---|---|---|---|
| Uber Eats template + routing | +5–10 food clicks/day | 12% × $35 | $2,300–$4,600 | Low until program confirmed |
| Event ticket instrumentation + TicketNetwork fallback | +1–2 ticket clicks/day | 9% × $95 | $1,200–$2,400 | Medium |
| Route Viator product clicks via server redirect | Better attribution only; no new clicks unless it enables retargeting | — | Measurement gain, not direct revenue | High (measurement) |
| Coupon-menu patch + Clipp Orlando/Tampa | +2–5 coupon clicks/day | 12% × $25 certificate | $1,100–$2,700 | Medium |
| Hotel wrapper fallback | +0–1 booking/day if Stay22 ever fails | 8% × $150 | $0–$4,380 | Low |
| Detail-sheet / home-rail impression instrumentation | None directly; exposes broken CTAs | — | Prevents false negatives | High |

**Note:** These are order-of-magnitude estimates. The honest next step is to run the fixes and read the actual event counts from PostHog for 7 days.

---

## 7. Prioritized leak list

### P0 — fix before any other revenue work

1. **Uber Eats is untracked.** Every food-delivery CTA is a free referral. Owner/GWEN must confirm a program exists and set `NEXT_PUBLIC_UBEREATS_TEMPLATE`, or claude.exe/DEEPSEEK must suppress the CTA until then.
2. **Coupon-menu visual patch unapplied.** The reviewed redesign has not shipped; conversion loss on a live deal surface.
3. **No `commerce_cta_clicked` on home.js Viator rails.** The homepage and home feed still emit only legacy `tickets_out`.

### P1 — high conversion loss

4. Viator product URLs bypass server redirect (detail sheet, home rails, tour list). Click events now exist; routing through `/api/commerce/go` is the next step.
5. Hotel "Check rates" is a plain Booking.com URL; CJ/Stay22 ownership is passive.
6. Coupon Viator/Klook direct URLs emit `commerce_cta_clicked` but no matching `provider_redirect_started`.
7. Legacy + commerce events duplicate each click; dashboard definitions must be documented.

### P2 — polish / trust / measurement depth

8. Re-verify `cpn-discover-sarasota-local-20` and `cpn-klook-us-attractions-5` before expiry.
9. VRBO template unset and undisclosed.
10. Most legacy money surfaces lack `commerce_impression`.
11. Detail-sheet direct URLs (Viator product, Travelpayouts) cannot join to `provider_redirect_started`; consider routing through the server layer.

---

## 8. PostHog queries to run this week

Run these excluding owner person id `688c2392-cba4-5693-9453-0294627a05e3`.

### 8.1 Verify the Viator redirect end-to-end

```sql
SELECT
  event,
  count(*) as n,
  count(DISTINCT distinct_id) as users,
  count(DISTINCT click_id) as clicks
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND event IN ('commerce_cta_clicked', 'provider_redirect_started', 'provider_redirect_failed')
  AND (properties.provider = 'viator' OR properties.provider = 'booking')
GROUP BY event
ORDER BY event;
```

### 8.2 Verify Uber Eats is now tracked

```sql
SELECT
  event,
  count(*) as n,
  count(DISTINCT distinct_id) as users
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND event IN ('eats_out', 'commerce_cta_clicked', 'provider_redirect_started', 'provider_redirect_failed')
  AND properties.provider = 'uber_eats'
GROUP BY event;
```

### 8.3 Verify coupon / Clipp clicks

```sql
SELECT
  event,
  properties.provider,
  count(*) as n
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND event IN ('coupon_out', 'commerce_cta_clicked', 'provider_redirect_started', 'provider_redirect_failed')
  AND properties.surface = 'coupons'
GROUP BY event, properties.provider;
```

### 8.4 Detail-sheet CTA outcomes

```sql
SELECT
  properties.cta_type,
  count(*) as clicks
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND event = 'primary_cta_clicked'
GROUP BY properties.cta_type;
```

### 8.5 Event ticket clicks

```sql
SELECT
  event,
  count(*) as n
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND event IN ('ticket', 'tickets_out', 'commerce_cta_clicked')
  AND (properties.src = 'detail_primary' OR properties.src = 'event_detail')
GROUP BY event;
```

### 8.6 Click-to-redirect joinability

```sql
WITH clicks AS (
  SELECT distinct_id, timestamp, click_id, provider, offer_id, surface
  FROM events
  WHERE event = 'commerce_cta_clicked' AND timestamp >= now() - INTERVAL 7 DAY
),
redirects AS (
  SELECT distinct_id, timestamp, click_id, provider, offer_id, surface
  FROM events
  WHERE event = 'provider_redirect_started' AND timestamp >= now() - INTERVAL 7 DAY
)
SELECT
  count(*) as clicks,
  countIF(click_id IS NOT NULL) as clicks_with_click_id,
  countIF(click_id IN (SELECT click_id FROM redirects)) as matched_to_redirect
FROM clicks;
```

---

## 9. One-paragraph verdict

The live pipeline has a working heart — the server redirect layer records the handoff when it is used — but most of the body's circulation bypasses it. The immediate money is in the bypasses: Uber Eats is entirely untracked, event tickets emit no events, and direct Viator/Travelpayouts/Klook URLs mean we cannot tie a booking back to the card that produced it. Fix the join (`click_id`), fix the two fully dark categories (food and events), and route the highest-intent direct URLs through the server layer. Do that before adding new inventory, or every new partner will inherit the same blind spots.
