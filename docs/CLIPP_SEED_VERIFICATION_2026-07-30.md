# Clipp per-merchant seeding — inventory read, 2026-07-30

The queued task was to seed two merchants: **Columbia Restaurant** (two-guide
seed) and **Orange Blossom Coffee** (Bradenton — the detail-sheet proof case).
`lib/coupons.js` deliberately deferred per-merchant matching because it "needs an
inventory read clipp.com blocks to every non-browser fetcher". This is that read.

Done in a real browser, because it is the only way: Akamai 403s every automated
fetcher — pages, `robots.txt` and `sitemap.xml` alike — and returns the *same* 403
for a real page and an invented one, so no CI job, cron or health probe can ever
tell them apart. See `wayfind-clipp-browser-only-verification`.

**Outcome: one merchant can be seeded, one cannot.** The second result is the more
valuable one — it stops a false claim shipping.

---

## 1. Columbia Restaurant — NOT IN CLIPP INVENTORY. Do not seed.

Searched the two markets we would actually link to, both pages of each:

| market page | offers seen | Columbia present |
|---|---|---|
| `/states/fl/cities/sarasota` p1 | 36 | no |
| `/states/fl/cities/sarasota?pageNumber=2` | 28 | no |
| `/states/fl/cities/bradenton` p1 | 36 | no |

**64 distinct Sarasota-market offers, 36 Bradenton, zero Columbia.** Clipp's own
keyword search for "Columbia Restaurant" returned only unrelated merchants
(Coast to Coast Wellness, McDonald's – Lake County, QDOBA, Pokemoto…).

Seeding it would put a "there's a deal here" claim on a page where no deal exists,
and send the click to a market page that does not contain the merchant. That is
the false-statement-under-a-link failure, and it is worse than showing nothing:
the user learns the deal rail lies, and the next ten impressions pay for it.

### A check-is-wrong trap worth recording

The first automated check said Columbia **was** present. It was matching
`/columbia/i` against `document.body.innerText` — and the results page echoes the
query back as "Results for: Columbia Restaurant". The check was reading its own
input. Re-run against *result merchant names only*, it returns
`anyColumbiaInResults: false`.

A search page containing your search term proves nothing. Parse the results, not
the page — and note the search was geo-scoped to `radius=35` near **Orlando**
(Clipp's session default), so even a negative there would not have been evidence
about Sarasota. The market-page enumeration above is what actually decides it.

---

## 2. Orange Blossom Coffee — LIVE, and better than expected

Position **1** on the Bradenton market page, and it has a **per-merchant deep
link**, which the existing city-page-only registry did not assume existed:

```
https://www.clipp.com/all-offers/20-coffee-more-bradenton-fl-deal-12824076
```

Loaded in-browser 2026-07-30:

- title — `$10 For $20 Worth Of Coffee & More at Orange Blossom Coffee - Bradenton, FL`
- offer — **$10 for $20** (50% off, the structural Clipp ratio)
- live commerce — "Buy Now" and "Add to Cart" both present
- real business detail — hours (Sun 9–2, Mon–Sat 7–2), roastery in Palmetto FL
- also appears on both Sarasota market pages, so it is in both feeds

### The merchant URL earns — verified on the CJ chain, not assumed

Same CJ deep link shape as the city page, both followed with a browser UA:

| destination | redirects | attribution on final URL |
|---|---|---|
| `/states/fl/cities/bradenton` | 3 | `?source=aff|local|cj&cjevent=613432908c5b11f1…` |
| `/all-offers/…-deal-12824076` | 3 | `?source=aff|local|cj&cjevent=62193f378c5b11f1…` |

**Identical shape, identical hop count, `cjevent` set in both.** The terminal 403
is Akamai refusing *curl*, not a broken chain — the same URL renders normally in a
browser. A per-merchant Clipp link is therefore attributable.

---

## 3. What is NOT being shipped here, and why

Nothing in this document changes code. Two blockers, both deliberate:

1. **`isClippDest` only accepts `/states/<st>/cities/<slug>`** (`lib/deals.js:81`).
   A merchant URL returns `null` today — correctly, by the registry's own design
   rule that a *shape* must never be widened into a template that can mint links
   to pages nobody has loaded. Widening it to `/all-offers/<slug>-deal-<digits>`
   is defensible **only** with a per-row browser record like the one above, and it
   is a money-path predicate, so it wants its own PR and its own RED proofs.

2. **KIMI's lane has blocked Clipp expansion to restaurant detail sheets** pending
   proof of geo-relevance — and the detail sheet is exactly where a per-merchant
   seed is worth anything. The geo-relevance proof now exists in **#504**
   (`dealScope` / `dealLocalityRank` / `nearestMetro`, with the Orlando mirror case
   asserted in `scripts/check-deal-sheet.mjs`). **That block is KIMI's to lift, not
   this lane's to route around.**

So the seed is *staged, not shipped*: the moment the block lifts, the Orange
Blossom row is a registry addition backed by the evidence above rather than a
fresh investigation. And Columbia is now on record as verified-absent, so it does
not get seeded by someone reading the original queue item at face value.

---

## 4. One thing found that nobody asked about

**The "Sarasota" market page is not a Sarasota feed.** Page 2 carries Zellwood
Station Golf Club, Altitude – Coral Springs, Maaco Longwood, Marineland and
Cinnaholic St. Petersburg. Page 1 already reaches Venice, Englewood and Pinellas.

Our Sarasota card promises "half-price dining certificates **in Sarasota**". A
user who taps it and lands on a page whose second half is Coral Springs and
Zellwood has been mildly misled — by Clipp's radius, not by our copy, but the
disappointment attaches to Wayfind because ours was the recommendation.

This is the same class of problem #504's locality sort fixes *inside* our own
rail, and it is worth deciding on separately: either the copy stops claiming the
city, or the card links to a narrower Clipp surface (the per-merchant pages above
being the obvious candidate — one merchant, one verified offer, no radius).
Flagged, not fixed — it is a copy/product call, not a bug.
