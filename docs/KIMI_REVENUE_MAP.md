# Wayfind Revenue Map

**Version:** 1.1  
**Owner:** Kim (CPO)  
**Date:** 2026-07-31  
**Purpose:** Every surface, feature, and user moment is either earning, capable of earning, or deliberately free-with-a-reason. Nothing is accidentally unmonetized.

---

## Executive summary

Wayfind's revenue problem is not a lack of monetization ideas. It is that **most monetization layers were dark or misapplied** while the highest-intent surfaces (detail sheets and guides) were under-monetized. In the last 48 hours the five highest-leverage code fixes shipped: Travelpayouts marker + four approved programs (#419), server-side redirect capture (#519), Clipp geo-gating (#520), and the detail-sheet CTA ladder (#522). `NEXT_PUBLIC_BOOK_IT` is now deployed (production 84e3c77). The remaining fast money is almost entirely config and partner approvals: the Uber Eats affiliate program, the Travelpayouts payout method, and the Viator PID.

With current traffic (~1,300 visitors/month) and current conversion (roughly 6 real-world actions/month), the business still cannot reach seven figures without either a large traffic multiplier or high-AOV conversion streams. The code fixes change the *measurement* and *action quality*; they do not change the denominator overnight.

**One-line constitution:** Wayfind earns only when we help a user take a real-world action we can attribute; every earning surface must be honest, disclosed, and structurally firewalled from ranking.

---

## Hard gates and hard truths

**Hard gate #1: Travelpayouts payout method must be set.** Nothing below is collectible until this setting exists. Every commission number is theoretical until the payout method is configured.

**Hard gate #2: Uber Eats requires an approved affiliate account.** `NEXT_PUBLIC_UBEREATS_TEMPLATE` cannot be "set" because no template exists in the repo. A US affiliate program exists, but approval is required (see §7). Until then, every food-order click leaves as a plain `ubereats.com` URL and earns nothing.

**Hard truth #1: the $1M model requires 10× conversion, and nobody owns conversion yet.** 105 paid visitors produced 0 signups. Not a low rate — zero. The 5,000-guide denominator assumes a conversion rate Wayfind has never once observed. That is a hypothesis, not arithmetic.

**Hard truth #2: leak count is three and climbing, all in `lib/affiliates.js`.** VRBO is dark until template, Uber Eats is live-but-unattributed, Viator is dark until PID — and claude.exe's DOM audit covers seven more providers. Budget for a fourth leak in any model.

**Hard truth #3: the rocketship is not the guides.** The five P0s take Wayfind from ~$20/month to low-four-figures in days, from code already written. That 50–100× multiple funds the year-long content build. They are not competing priorities; one funds the other.

---

## 1. Surface-by-surface ledger

For each surface: what it earns today, what it could earn with existing partners, the single change that unlocks it, and the owning lane.

| Surface | Earns today | Could earn with existing partners | Single unlock | Lane |
|---|---|---|---|---|
| **Homepage / home feed** | Viator experience rail (dark until PID set); Undercover Tourist deals rail; coupon strip; bookable place cards. | Full Viator PID, Travelpayouts "Book it" rail, Klook/Tiqets, more deal categories, Stay22 hotel rates. | Set `NEXT_PUBLIC_VIATOR_PID`, populate `wf_experiences` cron, light Travelpayouts. | `claude.exe` + `GWEN` |
| **Detail sheet** | BookingCTA (Viator/Stay22, dark until PIDs); Uber Eats plain untracked URLs; VRBO for lodging (dark); Ticketmaster for events; BookItLink (Travelpayouts, **deployed** 84e3c77); CTA ladder chooses place-type-aware primary action (#522). | Tiqets/Klook/WeGoTrip/ TicketNetwork via BookItLink; per-merchant Clipp deals; reservation links. | Set Viator PID; approve Uber Eats affiliate; implement per-merchant Clipp matching; add reservation partner. | `claude.exe` + `GWEN` |
| **Cuisine chooser + shortlist / Order In** | Uber Eats rails (plain untracked URLs; `eats_out` = 0 non-owner). | Coupon matching, Viator food tours, per-merchant Clipp deals, reservation links. | Set `NEXT_PUBLIC_UBEREATS_TEMPLATE`; add Clipp deal rail to shortlist (after location gating fixed). | `DEEPSEEK` + `GWEN` |
| **Guides (`/guides/*`, `/things-to-do/*`)** | Viator search links; exact products if `viatorUrl` set; Booking.com hotel search; ExploreBridge cross-sell. | More exact products per pick, Tiqets/Klook, hotel deep links, event tickets, CJ deals. | Add `viatorUrl`/`bookQuery` to every guide pick; enable CJ/Clipp. | `LLAMA` + `GWEN` |
| **Deal Sheet / `/coupons`** | Clipp city cards live (PR #474) with geo-gating (#520); hardcoded coupons (Klook, Viator); Supabase `offers` table; Undercover Tourist if `wf_deals` populated. | CJ local deals, event-ticket coupons, per-merchant Clipp matching on restaurant sheets. | Ship the unapplied coupon-menu visual patch; per-merchant Clipp matching; CityPASS/TicketSmarter CJ wiring. | `GWEN` + `claude.exe` |
| **Events page** | Ticketmaster Impact redirect on event detail/list pages. | TicketNetwork fallback, SeatGeek/AXS if added. | Add TicketNetwork Travelpayouts IDs; surface events on detail sheets/guides. | `claude.exe` + `GWEN` |
| **Map** | None observed. | Geo-targeted experience/deal overlays, hotel rates by viewport. | Add monetized place-type layers (deals, bookable tours, hotels). | `claude.exe` + `GWEN` |
| **Search results** | "Book on Viator" if `wf_place_products` has verified product. | Hotels, tours, deals, restaurants by query intent. | Populate `wf_place_products` via cron for all bookable categories. | `claude.exe` + `GWEN` |
| **Favorites / Saved / Itinerary** | Saved experiences & deals list with outbound links. | Re-engagement coupons, price-drop alerts, "book now" reminders, share-to-plan monetization. | Add proactive re-engagement and "complete your plan" CTAs. | `claude.exe` + `GWEN` |
| **Share pages (`/p/*`, `/l/*`, `/s/*`)** | None observed. | Shared lists/plans carry affiliate deep links; viral + monetized. | Append partner tracking to every shared-place URL. | `DEEPSEEK` + `GWEN` |
| **Community Takes** | None. | UGC tips with affiliate links (if clearly labeled). | Build UGC scale + monetization policy first. | `LLAMA` (hold) |
| **Landing pages (`/go/[city]`, `/[cat]/[city]`)** | `TourStrip` for things-to-do/beaches; Uber Eats for restaurants. | Hotel rates, event tickets, city passes, CJ deals. | Enable Stay22/CJ/Travelpayouts on category landing pages. | `claude.exe` + `GWEN` |
| **Culture pages (`/culture/[metro]`)** | Viator/GYG experience search links from `do:` items. | More curated experience links, hotel search, local deals. | Already wired; needs PID and expanded `do:` items. | `LLAMA` + `GWEN` |

### Detail-sheet CTA ladder (the highest-leverage surface)

| Place type | Primary CTA today (post-#522) | Partner / event |
|---|---|---|
| Attraction / tour / experience | Book tickets | Viator / Travelpayouts |
| Restaurant with deal | Claim deal | Clipp / CJ |
| Restaurant without deal | Order delivery / See menu | Uber Eats / Google Maps |
| Cafe / bakery | Order pickup / See menu | Uber Eats / Google Maps |
| Beach | Check conditions | best_nearby_go |
| Bar / nightlife | See deals / Directions | Clipp / Google Maps |
| Hotel / lodging | Check rates | Stay22 / Booking.com |
| Shopping / retail | See deals / Directions | Clipp / Google Maps |
| Closed right now | Add to plan | `save` |

The single biggest unlock is now **shipped**: category-aware primary CTA + adjacent FTC disclosure. The next unlock is per-merchant Clipp matching so "Restaurant with deal" actually fires for local spots.

---

## 2. Missing revenue streams — ranked by effort-to-dollars

Effort scored 1–5. Dollar potential scored 1–5 (5 = can carry meaningful share of $1M/yr). Rank = dollar / effort, adjusted by speed.

### Tier 1: flip the switch (low effort, immediate money)

#### 1. ~~Travelpayouts "Book It" layer~~ SHIPPED
- **Status:** Code merged in #519; env deployed to production 84e3c77 on 2026-07-31 12:35.
- **Why:** Already built. Only needed `NEXT_PUBLIC_BOOK_IT=on` and program IDs pasted for Tiqets, TicketNetwork, WeGoTrip, Klook.
- **Mechanism:** Detail-sheet BookItLink surfaces bookable products for attractions, tours, events, and hotels from Travelpayouts inventory.
- **Lane:** `Kim` + `GWEN`.
- **Metric:** `provider_redirect_started` (BookItLink routes through `/api/commerce/go`), `commerce_cta_clicked`.

#### 2. Viator PID activation
- **Effort:** 1
- **Dollar potential:** 4
- **Why:** Viator is the primary tour/experience partner. Commission is 8%. The rail and detail CTAs are already wired.
- **Mechanism:** Set `NEXT_PUBLIC_VIATOR_PID`; populate `wf_experiences` cron.
- **Lane:** `GWEN`.
- **Metric:** `tickets_out`, `ta_out`, `tour_card_out`.

#### 3. ~~Detail-sheet CTA ladder by place type~~ SHIPPED
- **Status:** Merged #522 2026-07-31. One place-type-aware primary action per sheet; closed places get "Add to plan"; FTC disclosure adjacent.
- **Effort:** 2
- **Dollar potential:** 5
- **Why:** 108 detail opens in non-bookable categories alone. A null or wrong CTA is a direct revenue miss.
- **Lane:** `Kim` + `claude.exe`.
- **Metric:** `primary_cta_clicked`, outbound event rate per `detail_open`, `provider_redirect_started`.

### Tier 2: build the obvious verticals (medium effort, durable money)

#### 4. Restaurant deals (Clipp / CJ)
- **Effort:** 3
- **Dollar potential:** 5
- **Why:** Restaurant guides drive traffic. Dining is frequent, recurring, high-intent. Restaurant detail sheets currently have no native monetization.
- **Mechanism:** Per-merchant Clipp dining deals as primary CTA on restaurant detail sheets; CJ local deals on Coupons page; deal alert subscription.
- **Dependency:** ~~Location gating must be fixed first.~~ **Fixed (#520).** Clipp city cards now filter to the visitor's resolved metro.
- **Lane:** `GWEN` (Clipp matching) + `claude.exe` (detail-sheet layout) + `DEEPSEEK` (cuisine shortlist).
- **Metric:** `coupon_out`, `deal_claimed`, `restaurant_deal_return_visit_14d`.

#### 5. Hotel / overnight expansion (Stay22 + Booking.com)
- **Effort:** 2
- **Dollar potential:** 5
- **Why:** Hotels are high-AOV. "Worth the drive" and trip planning are natural surfaces. Stay22 already rewrites Booking.com links to the highest payer.
- **Mechanism:** "Check rates" CTA on lodging detail sheets; hotel search links in guides; trip-plan hotel suggestions.
- **Lane:** `GWEN` + `claude.exe`.
- **Metric:** `hotel_out`, lodging detail-sheet conversion rate.

#### 6. Events ticketing depth (TicketNetwork + more sources)
- **Effort:** 2
- **Dollar potential:** 4
- **Why:** Events page exists and gets views but is thin. Ticketmaster is live; TicketNetwork adds inventory and redundancy.
- **Mechanism:** Add TicketNetwork TP IDs; surface events on detail sheets and guides; event alert subscriptions.
- **Lane:** `GWEN` + `claude.exe`.
- **Metric:** `tickets_out`, events page CTR.

#### 7. Reservation affiliate (OpenTable / Resy / Tock)
- **Effort:** 3
- **Dollar potential:** 4
- **Why:** Restaurant detail sheets without a deal should default to reservation. Reservations are high-intent and pay per seated diner.
- **Mechanism:** Partner API or deep-link integration; fallback to Google Reserve.
- **Lane:** `GWEN` + `claude.exe`.
- **Metric:** `reservation_out` (new), reservation conversion rate.

### Tier 3: compounding assets (higher effort, long-term money)

#### 8. Email / newsletter — "This weekend, ranked"
- **Effort:** 3
- **Dollar potential:** 5
- **Why:** Owned channel bypasses Google. Saved/planned users are the list. Weekly curated picks with affiliate links compound.
- **Mechanism:** "Text/email me tonight's picks" signup; weekly send with local events, deals, weather-aware swaps.
- **Lane:** `claude.exe` (signup + send) + `LLAMA` (copy) + `GWEN` (affiliate links).
- **Metric:** `picks_subscription_started`, `picks_message_clicked`, revenue per send.

#### 9. Guide Factory — editorial scaling
- **Effort:** 5
- **Dollar potential:** 5
- **Why:** Traffic is the denominator. One guide (`winter-park-scenic-boat-tour`) drove 35 real arrivals in 14 days. 1,000 similar guides change the math.
- **Mechanism:** Systematize LLAMA's Atlas card production into repeatable guide creation with affiliate `bookQuery`/`viatorUrl` fields.
- **Lane:** `LLAMA` + `claude.exe` (guide templates).
- **Metric:** `$pageview` per guide, guide-to-affiliate-click rate, total guide traffic.

#### 10. Shared list / plan monetization
- **Effort:** 2
- **Dollar potential:** 3
- **Why:** Share pages are free viral distribution. Every shared place should carry affiliate tracking.
- **Mechanism:** Append partner markers to shared URLs; open-graph cards show deal/book CTA.
- **Lane:** `DEEPSEEK` + `GWEN`.
- **Metric:** `share`, outbound events from `/p/*` and `/l/*`.

#### 11. Saved-item re-engagement
- **Effort:** 3
- **Dollar potential:** 4
- **Why:** Users save places but don't return. A "book now" or "price dropped" nudge recovers intent.
- **Mechanism:** Email/push when a saved place gets a deal, event, or favorable weather window.
- **Lane:** `claude.exe` + `GWEN`.
- **Metric:** `saved_reengagement_sent`, `saved_reengagement_clicked`, conversion from saved users.

### Tier 4: hold until structural separation is proven

#### 12. B2B enhanced presence
- **Effort:** 5
- **Dollar potential:** 4
- **Why:** Local businesses will pay for better photos, verified notes, or featured placement.
- **Constraint:** Must be structurally separated from ranking and clearly labeled "Sponsored" / "Enhanced by owner." It cannot influence Wayfind Score or list order. If it can't be firewalled in code and visually, it doesn't ship.
- **Mechanism:** Paid enhanced profiles on detail sheets; separate from organic results.
- **Lane:** `LLAMA` + `claude.exe` + legal/compliance review.
- **Metric:** `enhanced_profile_view`, `enhanced_profile_click`.
- **Status:** Hold until a design proves the firewall.

#### 13. Community Takes monetization
- **Effort:** 5
- **Dollar potential:** 2
- **Why:** UGC creates engagement, but scale and moderation costs are high before monetization works.
- **Status:** Hold until Community Takes has organic traction.

---

## 3. The constraint set

These are non-negotiable. Every revenue idea is evaluated against them.

1. **Wayfind Score and rankings are never for sale.** No paid placement in any ranked list. A business cannot buy its way up.
2. **One provider per card.** A single place/detail/guide pick gets one primary earning CTA. No affiliate link stuffing.
3. **FTC disclosure always.** Commission disclosure renders adjacent to every earning CTA. Copy: "Wayfind may earn a commission when you book through this link, at no extra cost to you. It never changes our scores or rankings."
4. **No fake urgency.** No invented scarcity, countdowns, or fake "only 2 left." Real deadlines only.
5. **Honest empty states.** A missing partner, missing deal, or unsupported place type must look different from "nothing found." Absence of config is an error state.
6. **Commerce/ranker firewall.** Affiliate status must not feed the displayed Wayfind Score. The `lib/monetize.js` bounded nudge (cap 8) is the only allowed interaction and must be labeled.
7. **Beach and natural-feature exclusion.** `isTicketyPlace()` excludes beaches/natural features from ticket affiliate logic. Do not weaken it.
8. **No Disney scraping/polling.** Google Places is the only source of Disney identifiers.
9. **Google Places ToS.** Place IDs cached indefinitely; other place content ≤ 30 days.
10. **Trust is the compounding asset.** Every revenue decision is judged by: "Does this make the millionth visitor more or less likely to click our link?"
11. **Geographic relevance and CTA correctness are trust.** A wrong-city result is worse than no result; a mismatched CTA is worse than no CTA.

---

## 4. Sequenced 30-day plan

| # | Initiative | Sequence | Lane | Dependency | Revenue mechanism | PostHog metric |
|---|---|---|---|---|---|---|
| 1 | ~~Deploy `NEXT_PUBLIC_BOOK_IT=on` + paste TP IDs~~ | **SHIPPED** 2026-07-31 | `Kim` + `GWEN` | #519 merged; production 84e3c77 | Travelpayouts affiliate commissions | `provider_redirect_started` on `/api/commerce/go` |
| 2 | Set `NEXT_PUBLIC_VIATOR_PID` + populate `wf_experiences` | Ship this week | `GWEN` | Viator partner approval | 8% on Viator bookings | `tickets_out`, `ta_out`, `tour_card_out` |
| 3 | ~~Detail-sheet CTA ladder by place type~~ | **SHIPPED** 2026-07-31 | `Kim` + `claude.exe` | #522 merged | Converts detail opens to the right action | `primary_cta_clicked`, outbound event rate |
| 3a | Ship the unapplied coupon-menu visual patch | Ship this week | `claude.exe` | Patch already reviewed | Restores intended coupon-page conversion | `coupon_out` rate on `/coupons` |
| 3b | ~~Fix Clipp location gating~~ | **SHIPPED** 2026-07-31 | `Kim` + `claude.exe` | #520 merged | Stops serving wrong-metro deals | `coupon_out` rate by metro |
| 3c | Approve Uber Eats affiliate + set template | Ship this week | `GWEN` / owner | Impact or Sovrn approval | Fixes Uber Eats attribution | `eats_out`, `provider_redirect_started` |
| 3d | Wire CityPASS and TicketSmarter CJ offers | Ship this week | `GWEN` + `LLAMA` | CJ codes available | Attraction/event ticket commissions | `tickets_out`, `coupon_out` |
| 4 | Per-merchant Clipp matching + restaurant deal-first layout | Test first | `GWEN` + `claude.exe` | Location gating fixed | Dining deals commission | `coupon_out`, `deal_claimed` |
| 5 | Hotel "Check rates" on lodging sheets/guides | Test first | `GWEN` + `claude.exe` | Stay22 active | Hotel booking commission | `hotel_out` |
| 6 | TicketNetwork fallback on events | Test first | `GWEN` + `claude.exe` | TicketNetwork TP IDs | Event ticket commission | `tickets_out` from events |
| 7 | Uber Eats tracked wrapper | Test first | `GWEN` + `claude.exe` | `NEXT_PUBLIC_UBEREATS_TEMPLATE` | Delivery commission | `eats_out` |
| 8 | Email "This weekend, ranked" signup | Test first | `claude.exe` + `LLAMA` | Email/SMS infra | Recurring affiliate revenue per send | `picks_subscription_started`, `picks_message_clicked` |
| 9 | Shared list / plan monetization | Test first | `DEEPSEEK` + `GWEN` | Share pages stable | Viral affiliate distribution | outbound events from `/p/*`, `/l/*` |
| 10 | Reservation affiliate (OpenTable/Resy) | Hold | `GWEN` + `claude.exe` | Partner API/deep-link approval | Reservation commission | `reservation_out` (new) |
| 11 | B2B enhanced presence | Hold | `LLAMA` + `claude.exe` | Firewall design approved | Sponsored enhancements | `enhanced_profile_view` |
| 12 | Guide Factory scale | Hold / parallel track | `LLAMA` + `claude.exe` | Editorial workflow + templates | Traffic denominator multiplier | `$pageview` per guide, guide traffic |

**Week 1 focus:** Recs 1–3. Light every already-built layer and fix the detail-sheet ladder. This is the only way to get a clean post-BOOK_IT baseline.

**Weeks 2–4 focus:** Recs 4–9. Test vertical expansions with A/B cohorts. Do not launch all at once; measure each stream's incrementality.

**Parallel track:** Rec 12 (Guide Factory) continues in background. It is the only initiative that can change the denominator enough to make $1M/yr realistic.

### Ship order for the five P0s (by money-per-hour-of-work) — status

1. **~~Deploy the BOOK_IT env change.~~ DONE** — production 84e3c77, 2026-07-31 12:35.
2. **~~Clipp geo-gating.~~ DONE** — #520 merged 2026-07-31.
3. **~~Detail-sheet CTA ladder.~~ DONE** — #522 merged 2026-07-31.
4. **Apply the coupon-menu visual patch.** Written, unapplied, free.
5. **Approve Uber Eats affiliate + set template.** Not config-only; requires partner approval (see §7).

### The one thing above all five: server-side PostHog capture for provider redirects

**Shipped.** Server-side capture now implemented for `/api/commerce/go`, `/api/viator/go`, and `/api/eats/go` (#519), with a guard in `scripts/check-provider-redirects.mjs`.

**Not yet verified end-to-end.** A bot `curl` from outside the browser hits Vercel's challenge (HTTP 429) and cannot trigger a real redirect. The code path is correct: each route calls `captureServer("provider_redirect_started"|"provider_redirect_failed", ...)` with `provider`, `surface`, `offer_id`, `content_id`, `click_id`, and `rank_bucket` via `commercePayload`. But no one has confirmed a real click lands in PostHog yet.

**Verification protocol:**
1. From a signed-in browser with PostHog cookies, click a bookable detail-sheet CTA that routes through `/api/commerce/go` or `/api/viator/go`.
2. Within 60 seconds, query PostHog SQL:
   ```sql
   SELECT event, timestamp, properties.provider, properties.surface, properties.offer_id, properties.failure_reason
   FROM events
   WHERE timestamp >= now() - INTERVAL 5 MINUTE
     AND event IN ('provider_redirect_started', 'provider_redirect_failed')
     AND person_id != '688c2392-cba4-5693-9453-0294627a05e3'
   ORDER BY timestamp DESC
   LIMIT 50;
   ```
3. Expected: one `provider_redirect_started` row with `provider`, `surface`, and `offer_id` populated.
4. To test failure, hit `/api/commerce/go?provider=unknown&offer=test` from the same browser; expect `provider_redirect_failed` with `failure_reason: "unknown-provider"`.

Postback-based revenue attribution is still future work. Verify the capture funnel before declaring any revenue change a success.

---

## 5. The math

### Current state (post-#519/#522/#520, BOOK_IT deployed 2026-07-31)

| Metric | Value | Source |
|---|---|---|
| Visitors / 14 days | ~447 | PostHog, owner excluded |
| Visitors / month (approx.) | ~960 | 447 × 30/14 |
| Sessions / 14 days | ~648 | PostHog |
| Real-world actions / 14 days | 3 | PostHog SQL, corrected event set (pre-BOOK_IT baseline) |
| Actions / month | ~6 | 3 × 30/14 |
| Current affiliate clicks / 30 days | 0 | `lib/activation.js` (pre-BOOK_IT baseline) |

At an average commission of **$3 per action**, current revenue is roughly **$18/month**. The next 7–14 days produce the first honest post-BOOK_IT, post-CTA-ladder baseline. Do not blend pre-deploy and post-deploy numbers.

To reach **$1M/year ($83,333/month)**, revenue must still grow ~4,600× from current traffic/conversion. The code fixes improve action quality and measurement; they do not 4,600× the denominator.

### What $1M/yr requires per stream

Assume no traffic growth first:

| Stream | Avg commission | Monthly actions needed | Current monthly actions | Gap |
|---|---|---|---|---|
| Detail-sheet tours (Viator/TP) | $3–5 | 16,667–27,778 | ~2–3 | 6,000–10,000× |
| Restaurant deals (Clipp/CJ) | $1–2 | 41,667–83,333 | 0 | Infinite |
| Hotels (Stay22/Booking) | $20–50 | 1,667–4,167 | ~0 | Infinite |
| Events tickets | $5–10 | 8,333–16,667 | ~0 | Infinite |
| Email newsletter | $0.50–1 per send/click | 83,333–166,667 clicks | 0 | Infinite |

**Conclusion at current traffic:** No single stream reaches $1M/yr. The only path is traffic multiplication + conversion improvement together.

### The Guide Factory denominator effect

If Guide Factory scales high-intent guide traffic:

| Guides like `winter-park-scenic-boat-tour` | Real arrivals / 14 days | Monthly guide traffic | 5% convert at $5 | Annual revenue |
|---|---|---|---|---|
| 1 | 35 | 75 | $11 | $135 |
| 100 | 3,500 | 7,500 | $1,125 | $13,500 |
| 1,000 | 35,000 | 75,000 | $11,250 | $135,000 |
| 5,000 | 175,000 | 375,000 | $56,250 | $675,000 |
| 10,000 | 350,000 | 750,000 | $112,500 | $1,350,000 |

At **10,000 high-intent guides** with **5% conversion** and **$5 average commission**, Wayfind crosses $1M/yr from guide-driven affiliate revenue alone. This is why Guide Factory is the denominator-mover.

### Combined scenario to $1M/yr

A more realistic mix:

| Stream | Monthly revenue | Assumption |
|---|---|---|
| Guide traffic (5,000 guides) | $40,000 | 75,000 monthly guide visits, 4% convert, $13 avg commission |
| Hotel bookings | $20,000 | 1,000 bookings/month at $20 |
| Restaurant deals | $10,000 | 10,000 deals claimed/month at $1 |
| Events tickets | $5,000 | 1,000 ticket clicks/month at $5 |
| Email newsletter | $5,000 | 5,000 subscribers, 20% open, 5% click, $1/click |
| Detail-sheet direct bookings | $3,333 | 1,000 bookings/month at $3.33 |
| **Total** | **$83,333/month = $1M/yr** | |

This scenario requires roughly **5,000 high-quality guides**, **10× current conversion**, and **active hotel/restaurant/event verticals**.

**Wave 1 calibration sample:** LLAMA's Guide Factory is at **20 targets**. That is a calibration sample, not a down payment. Wave 1's Search Console data tells us whether the per-guide traffic and conversion assumptions survive contact with reality. The $1M figure must never be quoted without the 5,000-guide denominator attached.

### Honest assessment

**Without Guide Factory:** $1M/yr is not achievable at current traffic. The business could reach low-five-figures with detail-sheet conversion and high-AOV streams.

**With Guide Factory but poor conversion:** Traffic grows but revenue lags. The detail-sheet CTA ladder, disclosure, and category-aware CTAs are prerequisites. **The 5,000-guide path assumes a conversion rate we have never observed.** Wave 1's 20-target sample is a calibration exercise to validate that assumption, not a revenue down payment.

**With Guide Factory + strong conversion + hotel/deals/events:** $1M/yr is realistic within 12–18 months — but only if Wave 1 proves the conversion hypothesis.

---

## 6. Uber Eats affiliate research — the real blocker

You cannot set `NEXT_PUBLIC_UBEREATS_TEMPLATE` without a program to generate the template. Here is what exists as of 2026-07-31.

### Uber Eats US program — yes, it exists

**Option A: Impact (direct with Uber)**
- **Network:** Impact (impact.com).
- **Commission:** 5–10% of the referred user's first order, negotiated per partner.
- **Cookie:** 30 days (some sources cite 15 days for regional variants).
- **Constraint:** Commission fires only on first-time Uber/Uber Eats users. An existing account — even inactive — pays nothing.
- **Approval:** Required. Apply through Impact's Uber program page; Uber's performance marketing team reviews for brand safety, audience alignment, and traffic quality. Approval is not guaranteed. Timeline: a few business days reported by affiliates.
- **Action for Gabe:**
  1. Sign up / log in at https://app.impact.com.
  2. Search the marketplace for "Uber" or "Uber Eats" and apply to the US program.
  3. Once approved, create a tracking link for `ubereats.com`. The template shape will be something like `https://uber.com/go/...?u={url}` or a direct Impact wrapper with a `{url}` placeholder.
  4. Paste that template into Vercel as `NEXT_PUBLIC_UBEREATS_TEMPLATE` and redeploy.

**Option B: Sovrn Commerce (sub-network)**
- **Network:** Sovrn Commerce (`sovrn.com/commerce`), merchant ID 98635.
- **Commission:** 6.95% observed on the merchant page (updated 2025-05-16).
- **Cookie:** Sovrn's standard window (typically 30 days).
- **Approval:** Sovrn publisher account + merchant application; generally less selective than direct brand approval.
- **Action for Gabe:**
  1. Sign up at Sovrn Commerce.
  2. Apply to merchant 98635 (Uber Eats).
  3. Use the generated tracking URL as the template.

### Alternatives if Uber rejects Wayfind

**DoorDash (preferred fallback)**
- **Network:** Impact (primary) and FlexOffers.
- **Commission:** $3 per new customer first order, OR $50 per new Dasher activation.
- **Cookie:** 30 days.
- **Approval:** Required through Impact; 2–5 business days reported.
- **Why it may be better:** DoorDash holds ~67% US food-delivery market share. The $3 first-order CPA is comparable to Uber Eats' lower band, and the $50 Dasher track is a high-value secondary angle.

**Grubhub**
- **Status:** No public US affiliate program found. No merchant page on Sovrn; no Impact marketplace page found; CJ/Partnerize search returned nothing authoritative.
- **Verdict:** Do not route traffic to Grubhub unless a program surfaces.

### Recommendation

1. **Apply to Uber Eats direct via Impact first.** It is the brand users already associate with the "Order delivery" CTA, and the 5–10% rate beats Sovrn's 6.95% if you land in the upper band.
2. **Parallel-apply to Sovrn Commerce as a hedge.** If Impact rejects or stalls, Sovrn keeps the traffic monetized.
3. **If both reject, switch the CTA to DoorDash.** Do not leave a plain `ubereats.com` link live — it trains users to click and teaches Wayfind nothing about whether the click earned.
4. **If none are approved within two weeks, suppress the Uber Eats CTA** and fall back to "See menu" (Google Maps / website) until an affiliate relationship exists. A free referral to Uber Eats is worse than no CTA, because it burns user intent without attribution.

---

## 7. PostHog instrumentation notes

Funnel instrumentation (#502) is landing today. Server-side PostHog capture is now implemented for `/api/commerce/go`, `/api/viator/go`, and `/api/eats/go`. Each emits `provider_redirect_started` on success and `provider_redirect_failed` with a reason on failure. See `docs/KIMI_MONEY_FUNNEL_DASHBOARD.md` for the dashboard spec.

**Still future infra:** postback-based revenue attribution (`provider_postback_received`, `booking_confirmed`). Without it, the dashboard measures handoffs, not dollars.

The following queries will firm up estimates once #502 flows:

1. **Detail-sheet conversion funnel:**
   ```sql
   SELECT 
     count(DISTINCT if(event = 'detail_open', person_id, NULL)) as detail_users,
     count(DISTINCT if(event = 'commerce_cta_clicked', person_id, NULL)) as cta_users,
     count(DISTINCT if(event IN ('tickets_out','ttd_book','coupon_out','eats_out','hotel_out','ta_out','tour_card_out','best_nearby_go','bestmove_go','book_it_out'), person_id, NULL)) as action_users
   FROM events
   WHERE timestamp >= now() - INTERVAL 14 DAY
     AND person_id != '688c2392-cba4-5693-9453-0294627a05e3'
   ```

2. **Revenue per surface (post-deploy):**
   - Outbound events by referrer page (`$current_url` at time of event).
   - `commerce_cta_clicked` by `cta_type` and place type.

3. **Guide monetization rate:**
   - `$pageview` on `/guides/*` → outbound event within same session.

4. **Saved-user re-engagement potential:**
   - Count of users with `save` or `add_to_plan` events in last 30 days.

---

## 8. Appendix: partner commission cheat sheet

| Partner | Rate | Status | Unlock |
|---|---|---|---|
| Viator | 8% | Dark until PID | `NEXT_PUBLIC_VIATOR_PID` |
| GetYourGuide | 8% | Dark | PID |
| Travelpayouts (Tiqets) | 3.5–8% | Live (#419 + #519 + env) | `NEXT_PUBLIC_BOOK_IT=on` deployed |
| Travelpayouts (TicketNetwork) | 6–12.5% | Live (#419) | Program IDs applied |
| Travelpayouts (WeGoTrip) | 6.6–41.5% | Live (#419) | Program IDs applied |
| Travelpayouts (Klook) | 2–5% | Live (#419) | Program IDs applied |
| CJ / Undercover Tourist | CJ rate | Live if `wf_deals` populated | PID `101643573` + deal feed |
| CJ / Clipp | 12% | **Live in prod** (PR #474 + #520 geo-gating) | Expansion requires per-merchant matching |
| CJ / CityPASS | 4–6% | Active advertiser, unwired | CJ code + guide integration |
| CJ / TicketSmarter | 3% | Active advertiser, unwired | CJ code + events integration |
| Stay22 | LinkSwap rewrite | Live implicitly | Already active on Booking.com links |
| Uber Eats (Impact direct) | 5–10% of first order, 30-day cookie | Requires approval | Apply at `impact.com` → Uber program; approval ~few business days |
| Uber Eats (Sovrn Commerce) | 6.95% (observed 2025-05-16) | Sub-network, no approval guess | Sign up at `sovrn.com/commerce` and apply to merchant 98635 |
| DoorDash (Impact) | $3/first order OR $50/Dasher, 30-day cookie | Requires approval | Apply at `impact.com` → DoorDash program |
| Grubhub | No public program found | — | Route to DoorDash or suppress link |
| VRBO | Template-based | Dark | `NEXT_PUBLIC_VRBO_TEMPLATE` |
| Ticketmaster Impact | SID 7475855 | Live | Already active |

---

## 8. One-paragraph verdict

The five code P0s are now shipped: BOOK_IT is deployed, Travelpayouts programs are applied, Clipp is geo-gated, and the detail-sheet CTA ladder shows the right action per place type. That moves Wayfind from a site with invisible or misapplied monetization to one where the highest-intent surface finally has a coherent money path. The remaining fast money is config and approvals: set the Travelpayouts payout method, get the Viator PID live, and approve an Uber Eats affiliate account (Impact direct or Sovrn Commerce; DoorDash is the honest fallback). The unapplied coupon-menu patch is still free money sitting on disk. Low-four-figures/month is achievable in days once those gates clear. But $1M/yr still requires the Guide Factory denominator — roughly 5,000 high-intent guides with real affiliate links, plus working hotel, restaurant-deal, and event-ticket verticals. Wave 1's 20-target sample is a calibration exercise, not a down payment. And before declaring any of this a success, verify the server-side provider-redirect capture funnel actually produces events in PostHog — a readable funnel is the difference between knowing what worked and guessing. Every earning surface must be honest, disclosed, and firewalled from ranking, because trust is the only asset that compounds at that scale.
