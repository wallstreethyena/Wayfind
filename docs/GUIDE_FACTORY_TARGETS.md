# The Guide Factory — 20 ranked targets

Deliverable 1, 2026-07-30. Awaiting owner sign-off before any guide is written.

Guides are the only compounding channel: they rank, and they deliver essentially
every real visitor. `winter-park-scenic-boat-tour` is the shape to copy — one
bookable intent, real inventory behind it, top non-homepage traffic.

---

## How these were scored

Four axes, 1–5. **Total is not an average** — (a) is a gate, not a weight.

| axis | what it measures | source |
|---|---|---|
| **(a) bookable intent** | does the topic map to a monetizable terminal **that exists today** | `wf_place_products` (147 verified rows), `lib/coupons.js` (16 live), `hotelUrl()` |
| **(c) inventory depth** | do we hold enough places to write it honestly | `wf_inventory`, OPERATIONAL only |
| **(d) winnability** | can we outrank the incumbent for this shape | competitor shape, not keyword difficulty |
| **(b) search demand** | how many people want this | **see the caveat below** |

### The caveat on (b), stated up front

**I have no keyword tool.** No Search Console pull, no volume API, nothing that
measures demand directly. Every (b) score here is inferred from proxies:

- our own PostHog page traffic (the only real demand signal we own),
- Google review counts as an attention proxy — 269k reviews on Walt Disney World
  is not search volume, but it is not nothing,
- topic shape versus the four guides we already have traffic for.

So **(b) is the weakest column and should not be treated as measured.** Where a
row's rank depends on (b), I say so. If a Search Console export exists, ten
minutes against it would re-rank this list better than anything I can do.

(a), (c) and (d) are grounded in real rows and I will defend them.

### The gate

**A guide with no monetizable terminal does not make this list.** Every row below
names its primary CTA and the provider, and every one of those resolves to
something in the database *now*:

- `tour · Viator (verified)` — the anchor is one of the 24 places in
  `wf_place_products` with a real product row
- `tour · Viator (tracked search)` — no verified product yet, so
  `experienceGoUrl()` runs the honest tracked search the app already uses
- `deal · coupon registry` — a live row in `lib/coupons.js`, with a real expiry
- `hotel · Stay22` — `hotelUrl()`, rewritten at click time

---

## The exclusion worth arguing about

**Orlando and Tampa dining guides are not on this list**, despite food being our
deepest inventory (243 and 296 places). They have **no monetizable terminal
today**: the coupon registry's dining rows are half-price certificate programmes
in **Sarasota and Bradenton only**, which is exactly the gap
`docs/DEALS_REGISTRY.md` documents.

Under the owner's directive that is disqualifying, so they are excluded rather
than smuggled in on a Directions terminal. **They become the strongest targets on
the board the day Clipp seeding lands** — Columbia Restaurant is already seed #1
and appears in two existing guides. Flagging so the sequencing is deliberate: if
CJ attribution clears this week, rows 21–25 write themselves.

---

## The 20

Shape codes: **VS** = comparison · **NOT** = the-not-obvious-thing · **ONE** =
single bookable experience. All three beat generic listicles in our own traffic.

### Orlando

| # | guide | shape | primary CTA · provider | a | b | c | d |
|---|---|---|---|---|---|---|---|
| 1 | SeaWorld vs Discovery Cove: which Orlando water day is worth it | VS | tour · Viator (verified, both anchors) | 5 | 4 | 5 | 4 |
| 2 | Kennedy Space Center: is the bus tour worth the extra hours | ONE | tour · Viator (verified) | 5 | 4 | 4 | 5 |
| 3 | Universal vs Islands of Adventure: one day, one park, which | VS | tour · Viator (verified, both) | 5 | 5 | 5 | 3 |
| 4 | ICON Park without the wristband: what is actually worth paying for | NOT | tour · Viator (verified — SEA LIFE, Madame Tussauds, Orlando Eye) | 5 | 3 | 4 | 5 |
| 5 | Orlando in the rain: the indoor places that are not a theme park | NOT | tour · Viator (verified — WonderWorks, Crayola, Museum of Illusions) | 4 | 4 | 5 | 5 |
| 6 | Discovery Cove: what the all-inclusive price actually includes | ONE | tour · Viator (verified) | 5 | 3 | 3 | 5 |
| 7 | LEGOLAND vs Magic Kingdom for under-eights | VS | tour · Viator (verified, both) | 5 | 4 | 4 | 4 |
| 8 | Where to stay for Universal without paying Universal prices | NOT | hotel · Stay22 | 4 | 4 | 4 | 4 |

### Tampa / St. Pete

| # | guide | shape | primary CTA · provider | a | b | c | d |
|---|---|---|---|---|---|---|---|
| 9 | Busch Gardens vs SeaWorld: which ticket buys more day | VS | tour · Viator (verified, both) | 5 | 4 | 5 | 4 |
| 10 | ZooTampa vs Busch Gardens if you came for the animals | VS | tour · Viator (verified, both) | 5 | 3 | 4 | 5 |
| 11 | The Dalí Museum: worth the drive from Tampa | ONE | tour · Viator (tracked search) | 3 | 4 | 3 | 5 |
| 12 | St. Pete Pier: what to actually do once you are there | ONE | tour · Viator (verified, 2 products) | 5 | 3 | 4 | 5 |
| 13 | Adventure Island vs Busch Gardens water rides | VS | tour · Viator (verified — Busch Gardens) | 4 | 3 | 3 | 5 |
| 14 | A night out in Ybor vs downtown St. Pete | VS | deal · coupon registry (*20% off any city tour*) | 3 | 3 | 5 | 4 |
| 15 | Tampa with kids and no theme park budget | NOT | tour · Viator (verified — ZooTampa) | 4 | 4 | 5 | 4 |

### Sarasota / Bradenton

| # | guide | shape | primary CTA · provider | a | b | c | d |
|---|---|---|---|---|---|---|---|
| 16 | Fort De Soto vs Siesta Key: which beach day wins | VS | tour · Viator (verified — Fort De Soto) | 4 | 4 | 5 | 5 |
| 17 | The Ringling on a free Monday vs paid admission: what you miss | NOT | deal · coupon registry (*free admission every Monday*) | 5 | 3 | 4 | 5 |
| 18 | Sarasota dinner at half price: where the certificates actually work | ONE | deal · coupon registry (*half-price dining, Sarasota*) | 5 | 3 | 5 | 5 |
| 19 | Bradenton in a day: Riverwalk, ballpark, half-price dinner | NOT | deal · coupon registry (*Bradenton certs* + *Thirsty Thursday, LECOM*) | 5 | 2 | 4 | 5 |
| 20 | Siesta Key Watersports: which rental is worth the money | ONE | tour · Viator (tracked search) | 4 | 3 | 3 | 5 |

---

## Suggested build order

Not the score order. Order by *evidence value first*, so a weak assumption is
caught after two guides rather than twenty.

**Wave 1 — prove the shape (rows 2, 17, 1).** One ONE, one NOT, one VS; all three
have verified terminals and the highest (d). If VS beats ONE here the way it does
in the existing traffic, the rest of the list re-sorts on real data instead of my
inference.

**Wave 2 — the Sarasota deal cluster (18, 19, 16).** These are the only rows where
the terminal is a **coupon with a real expiry**, so they exercise §4's deadline
path end-to-end, which nothing in production does today.

**Wave 3 — the volume anchors (3, 9, 7, 5).** Highest traffic, hardest to win.
Worth attempting only once waves 1–2 show the template converts.

**Wave 4 — the rest.**

At 2–3/day that is roughly a nine-day run.

---

## Two cannibalisation risks against our OWN guides

Slug-collision check: **none** of the 20 collides with the existing 17. But a
topical near-miss sweep (shared tokens) flagged six pairs, and two of those are
real — we would be competing with ourselves for the same query, which costs more
than the second guide earns.

**Row 16 (Fort De Soto vs Siesta Key) vs the existing `siesta-key-vs-lido-key`.**
Same shape, same anchor beach, adjacent query space. Two options: cut row 16, or
narrow it to the axis the existing guide does not cover — Fort De Soto is a
ferry/fort/park day and Siesta is a sand day, which is a genuinely different
question from Siesta-vs-Lido. **My recommendation: narrow it, do not cut it**, and
have the two guides link to each other so the cluster reads as depth rather than
duplication.

**Row 5 (Orlando in the rain) vs the existing
`things-to-do-orlando-not-theme-parks`.** Both are "Orlando, but not the parks"
angles and the existing one is our #3 traffic page — the one thing on this list I
would least like to cannibalise. **My recommendation: cut row 5** unless the rain
framing can carry it alone (indoor-only, weather-triggered, no outdoor picks), in
which case it is a genuinely different intent. Owner's call; I would not risk the
#3 page on my own judgement.

The other four near-misses are fine: drum-circle is an event not a beach,
half-price dinner is not a things-to-do list, the Universal hotel guide is a
different park from the Magic Kingdom one, and Bradenton-in-a-day is an itinerary
that would *link to* the De Soto guide rather than replace it.

If both recommendations are taken the list is 19, and I would backfill with a
Tampa rooftop or Winter Park follow-on rather than reach for a weaker terminal.

## Two things I will need

**Row 3 and row 7 touch Disney and Universal.** AGENTS.md §7 forbids automated
requests to Disney hosts, so those guides cannot source editorial from
`disneyworld.disney.go.com`. They are still writable — Google Places is the
permitted source and the Viator product is a partner feed, not editorial
sourcing — but their bodies will be thinner than a guide whose venue has an open
official site. Flagging before writing rather than after.

**Row 11 and row 20 use the tracked-search fallback**, not a verified product.
That is monetized and honest, but it converts worse than a verified product. If
either underperforms in wave 3, the fix is a product resolution pass on those two
anchors, not a rewrite.
