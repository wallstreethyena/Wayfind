# Money Path Audit — Gowoyfind Live Site

**Auditor:** Kim (CPO)  
**Date:** 2026-07-30  
**Status:** Pending deploy confirmation + browser access  
**Scope:** Can a real first-time visitor discover, decide, and take a monetized action? And do we capture it?

## Methodology

Walk five journeys as an incognito-minded stranger. For each screen, record:

1. **Primary action:** the ONE thing the screen wants you to do, and whether it is visible above the fold on the test viewport.
2. **Dead UI:** any click that navigates nowhere, errors out, or silently no-ops. Cite the exact URL.
3. **Instrumentation:** which PostHog event should fire, and whether it appears for the audit session in PostHog read-only.

Defect severity:
- **P0:** broken money path, dead monetized CTA, fake/illegal disclosure, crash/error
- **P1:** conversion loss (CTA below fold, wrong primary action, missing instrumentation)
- **P2:** polish / trust erosion (copy issues, layout, minor disclosure gaps)

Out-of-scope: SEO, deep accessibility, performance unless it blocks conversion.

---

## Journey 1: Google arrival → winter-park-scenic-boat-tour → bookable tour

**Path:** External Google search → `/guides/winter-park-scenic-boat-tour` → guide CTA → affiliate booking page

### 7-part audit

1. **Problem:** Does the guide turn a one-shot Google reader into a paid click?
2. **Why users behave this way:** They searched for a specific experience; intent is high; friction tolerance is low.
3. **Evidence:** 35 real arrivals to this guide in last 14 days (PostHog).
4. **Recommendation:** One primary guide CTA, clear affiliate link, FTC disclosure adjacent, and a secondary save/plan action.
5. **Expected impact:** Baseline monetized click rate from this guide.
6. **Priority:** High
7. **How to measure success:**
   - `$pageview` on `/guides/winter-park-scenic-boat-tour`
   - `guide_primary_cta_clicked`
   - Outbound affiliate event (`tickets_out`, `ttd_book`, `ta_out`, `tour_card_out`)
   - `disclosure_viewed`

### Screen-by-screen findings

| Screen | Primary action | Above fold? | Dead UI | Expected event | Event verified? |
|---|---|---|---|---|---|
| Google SERP → guide | (external) | — | — | `$pageview` | TBD |
| Guide page | TBD | TBD | TBD | `guide_primary_cta_clicked` | TBD |
| Affiliate landing | (external) | — | — | outbound event | TBD |

### Findings

*TBD after live walk.*

---

## Journey 2: Homepage → dinner → cuisine sheet → ranked list → detail sheet → monetized action

**Path:** `/` → hero/tiles → `/eat/orlando` → cuisine chip tap → ranked list → place detail sheet → primary CTA → affiliate redirect with pid/marker

### 7-part audit

1. **Problem:** Does the food discovery funnel produce a paid action?
2. **Why users behave this way:** Homepage browsers are lower intent than guide arrivals; they need guidance, not a directory.
3. **Evidence:** Homepage gets 211 real views; cuisine sheet is new from DEEPSEEK.
4. **Recommendation:** Clear cuisine selection, ranked list with honest scores, detail sheet with category-appropriate CTA.
5. **Expected impact:** Monetized click rate per homepage session.
6. **Priority:** High
7. **How to measure success:**
   - `$pageview` on `/`, `/eat/orlando`, ranked list, detail sheet
   - `cuisine_chip_tapped` (or equivalent)
   - `detail_open`
   - `primary_cta_clicked`
   - Outbound event with `pid`/`marker` in URL (`coupon_out`, `eats_out`, `bestmove_go`, etc.)

### Screen-by-screen findings

| Screen | Primary action | Above fold? | Dead UI | Expected event | Event verified? |
|---|---|---|---|---|---|
| Homepage | TBD | TBD | TBD | `$pageview`, hero click | TBD |
| `/eat/orlando` | TBD | TBD | TBD | `$pageview`, cuisine selection | TBD |
| Ranked list | TBD | TBD | TBD | `detail_open` | TBD |
| Detail sheet | TBD | TBD | TBD | `primary_cta_clicked`, outbound event | TBD |

### Findings

*TBD after live walk.*

---

## Journey 3: /coupons → honest cards, working Clipp redirects

**Path:** `/coupons` → scroll cards → tap claim → verify redirect with CJ marker → verify expiry and terms are real

### 7-part audit

1. **Problem:** Does the deals surface feel trustworthy and actually convert?
2. **Why users behave this way:** Deal hunters are skeptical of fake expiry and broken links.
3. **Evidence:** /coupons gets traffic but is a thin shell; Clipp wiring is new from GWEN.
4. **Recommendation:** Every card shows real expiry, real merchant, working redirect, and honest discount. Images load. No fake urgency.
5. **Expected impact:** `coupon_out` rate per /coupons visitor.
6. **Priority:** High
7. **How to measure success:**
   - `$pageview` on `/coupons`
   - `coupon_out` (or equivalent)
   - URL contains CJ/Clipp marker
   - `disclosure_viewed`

### Screen-by-screen findings

| Screen | Primary action | Above fold? | Dead UI | Expected event | Event verified? |
|---|---|---|---|---|---|
| /coupons | TBD | TBD | TBD | `$pageview` | TBD |
| Coupon card tap | TBD | TBD | TBD | `coupon_out` | TBD |
| Clipp landing | (external) | — | — | redirect with marker | TBD |

### Findings

*TBD after live walk.*

---

## Journey 4: Cafe with no deal and no booking

**Path:** Find or search for a cafe/bakery detail sheet → evaluate CTA fallback → verify no null/dead UI

### 7-part audit

1. **Problem:** Does the detail sheet gracefully handle places that cannot be monetized directly?
2. **Why users behave this way:** Most real detail opens are cafes/bakeries/kid spots (108 opens / ~16 users, Sarasota). A broken or missing CTA here is a mass conversion loss.
3. **Evidence:** 108 detail opens on non-bookable categories in last 14 days.
4. **Recommendation:** Sensible fallback to Directions / menu / call. No null CTA. No dead UI.
5. **Expected impact:** Real-world action rate on non-monetizable place types.
6. **Priority:** High
7. **How to measure success:**
   - `detail_open` for place type `cafe`/`bakery`
   - `primary_cta_clicked` with `cta_type = directions` or `menu`
   - `directions` or `bestmove_go` event
   - No `primary_cta_null` events

### Screen-by-screen findings

| Screen | Primary action | Above fold? | Dead UI | Expected event | Event verified? |
|---|---|---|---|---|---|
| Cafe detail sheet | TBD | TBD | TBD | `detail_open`, `primary_cta_clicked` | TBD |
| Directions/map | (external) | — | — | `directions` | TBD |

### Findings

*TBD after live walk.*

---

## Journey 5: Trust pass

**Path:** Revisit every monetized surface from Journeys 1–4 and check honesty, disclosure, and urgency.

### 7-part audit

1. **Problem:** Does the product earn trust or erode it?
2. **Why users behave this way:** First-time visitors have zero brand equity. One fake count or hidden disclosure loses them permanently.
3. **Evidence:** Wayfind's brand promise is "no ads, no paid placement, honest curation."
4. **Recommendation:** FTC disclosure adjacent to every monetized CTA; real prices/counts; no fake scarcity; distinguish empty state from failure.
5. **Expected impact:** NPS and return visits.
6. **Priority:** High
7. **How to measure success:**
   - `disclosure_viewed` adjacent to `commerce_cta_clicked`
   - No invented counts/prices
   - No fake urgency labels

### Screen-by-screen findings

| Surface | Disclosure present? | Disclosure readable? | Real prices/counts? | Fake urgency? | Finding |
|---|---|---|---|---|---|
| Guide CTA | TBD | TBD | TBD | TBD | TBD |
| Detail sheet CTA | TBD | TBD | TBD | TBD | TBD |
| Coupon cards | TBD | TBD | TBD | TBD | TBD |
| PriceBadge | TBD | TBD | TBD | TBD | TBD |

### Findings

*TBD after live walk.*

---

## Defect list

| # | Severity | Defect | Journey | Owning lane | Evidence | Recommended fix |
|---|---|---|---|---|---|---|
| TBD | TBD | TBD | TBD | TBD | TBD | TBD |

## Verdict

*TBD after live walk.*

## Tooling note

This audit requires a real browser to judge above-the-fold layout, click-through behavior, and redirect URLs. FetchURL/curl cannot fully replicate a user session. PostHog verification requires either a read-only API key or query results pasted from the UI.
