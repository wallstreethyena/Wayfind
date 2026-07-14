# Inventory + classifier audit — 2026-07-14

**Read-only.** No code changed, no data changed, **zero Google API calls** (Supabase read + local
re-classification only). Reproduce: `node scripts/atlas-extract.mjs && node scripts/atlas-audit.mjs`.

---

## 0. The 590 Atlas cards

Extracted **programmatically from the session transcript** — the paste is a spreadsheet copy (fields `\t`,
rows `\r`), so every field was recovered byte-exact. **Nothing retyped.** Raw source preserved at
`data/atlas/atlas-590.raw.txt`.

| check | result |
|---|---|
| records parsed | **590 / 590** ✅ |
| Place IDs well-formed | **590 / 590**, all exactly 27 chars ✅ |
| malformed | **0** — the single 78-char ID was a **parsing artifact** (trailing prompt text glued to the last row), fixed at the parser, not by editing data |
| duplicate Place IDs | 0 (590 unique) |
| same name+address, different Place ID | 10 groups → `review-same-place.tsv` |
| rows with no address | 38 |

**The cards are not new inventory.** All **590/590 join to `wf_inventory` by `place_id`** — a labelled
*subset* of the 1,027 rows you already have. Value = **evaluation set**, not an import.

**And the cards are the noisier source.** Per-row comparison (not shape-matching):

| | rows |
|---|---|
| card **and** v6.15 both disagree with the stored category **and agree with each other** | **25** |
| card disagrees, but v6.15 **agrees with stored** → the **card is likely wrong** | **70** |
| v6.15 disagrees, card agrees with stored | 12 |

The cards label `DICK'S Sporting Goods` ×3, `Five Below` and `Bowlero` as **attractions**. Use them as a
second opinion; never as an authority.

---

## 1. `wf_inventory` (1,027 rows)

food 266 · attractions 240 · shopping 212 · hotels 191 · **beach 100** · **nightlife 18**
All `manatee-sarasota`, all `source=google_type`. **anchors 0** · needs_review 0 · locked 0 · missing
category/coords/types 0 · non-operational 0.

---

## 2. 🔴 The `beach` bucket is **79% not a beach**

`lib/placeTaxonomy.js` maps the Google type `marina` → **`beach`**.

| `beach` (100 rows) | count |
|---|---|
| an actual beach | **21** |
| marina / yacht club / **boat dealership** | **79** |

Live in Beaches today: **MarineMax Venice** (a boat *dealership*), **Venice Yacht Club**, **Freedom Boat
Club**, **Royal Palm Marina**, **Island Discount Tackle**.

---

## 3. 🔴 Both read paths are broken — in *different* ways

| path | gate | result |
|---|---|---|
| **live search** (`lib/placeFilter.js` → `placeAllowed()`) | runs, but **admits the junk** | **44 of 48** service-typed rows and **18 of 18** residential rows are **ADMITTED** into their stored category |
| **429 fallback** (`lib/inventoryServe.js`) | **no gate at all** — `wf_inventory?category=eq.{cat}`, never calls `placeAllowed` | serves the **stored category raw**, unfiltered, straight to users |

**Why the live gate admits junk:** `placeAllowed()` early-returns `true` when `CAT_ALLOW` matches the types —
**before** `SERVICE_TYPES_RX` is ever consulted. `home_goods_store` contains the substring `store`, so a
`general_contractor` matches the Shopping allowlist and is admitted.

Verified by executing the real gate against the real rows:

```
❌ ADMITTED  Park Store Go          (parking_lot) → hotels
❌ ADMITTED  Ideal Classic Cars     (car_dealer)  → attractions
❌ ADMITTED  MarineMax Venice       (boat dealer) → beach
❌ ADMITTED  Cabinetree             (general_contractor) → shopping
❌ ADMITTED  Bay Indies             (mobile_home_park)   → hotels
```

This is the v6.15 service veto's blind spot: it closed the **generic** `store` hole and left the
**specific** one (`home_goods_store`, `furniture_store`, `hardware_store`) open.

---

## 4. 🔴 Hotels: **35% junk** (66 of 191) — Stay Tonight is revenue-critical

Measured by **type signature**, not name (a name regex wrongly flagged *Island Sun Inn & Suites* and
*A Beach Retreat On Casey Key*, which are real hotels — negative-control checked):

| | count |
|---|---|
| real hotel / motel / resort / B&B type | **125** |
| **generic `lodging` only** — scraped short-term rentals + condos | **50** |
| residential (mobile-home park, **parking lot**) | **16** |

**39 of the 50** generic-lodging rows have **zero reviews**. Sample now rendering in Stay Tonight:
`BEAUTIFUL HOUSE NEAR BEACH w/ Private Heated Pool, Wi-Fi+MORE` (×2, duplicated), `Beautiful 3-bedroom house
in Florida` (×2), `Private Waterfront Cottage with pool on 5 Acres`, `Pelican Cove Condominium`.

*(My earlier "13%" was wrong — it counted anything with a lodging type as genuine. The ~35% in my notes was
right.)*

---

## 5. The two classifiers disagree on 66 of 1,027

| stored → v6.15 | rows | what it is |
|---|---|---|
| Food → **Nightlife** | 22 | sports bars/pubs buried in Food |
| Shopping → **Food** | 13 | Detwiler's, Whole Foods, Dakin Dairy |
| Hotels → **Activities** | 15 | mobile-home / RV communities |
| Food → Activities | 12 | Bowlero, PopStroke, golf clubs |
| others | 4 | |

**Nightlife is starved: 18 stored vs 40 the classifier finds.** "Night Out" runs on <half the bars.

**Array-order bug:** `primaryCategory` promises priority `Hotels → Food → Nightlife → Activities → Shopping`
but resolves by **the order Google lists the types**. `EVEN Hotel Sarasota-Lakewood Ranch by IHG`
(`wellness_center, fitness_center, spa, gym, hotel, lodging`) classifies as **Activities** — a real hotel lost
because Google listed its spa first. Latent for any hotel with a spa or gym.

---

## 6. Duplicates — the same place in **two different lists**

All **10/10** card-surfaced pairs exist in `wf_inventory`, and the two IDs often carry **different
categories**:

| place | ids | stored as |
|---|---|---|
| Turtle Beach | 3 | attractions / beach / beach |
| Coquina Beach Cafe | 2 | attractions / **food** |
| Marina Jack | 2 | beach / **food** |
| Coquina Beach | 2 | attractions / attractions |

*(My name+coords metric found only 4 groups — it under-counts, because the duplicate rows have slightly
different coordinates. The card pairs are the better instrument.)*

---

## 7. Vocabulary contract — **do not change the stored strings**

`wf_inventory.category` is lowercase `food|nightlife|attractions|beach|hotels|shopping`.
`placeCategory.primaryCategory()` returns `Food|Nightlife|Activities|Hotels|Shopping` and **has no `beach`**.

Readers of `wf_inventory.category`: **`lib/inventoryServe.js`** (queries `category=eq.{cat}`),
`lib/hotels.js`, `lib/google.js`, `scripts/seed-places.mjs`, `scripts/test-inventory-serve.mjs`.

→ **Unify the LOGIC, keep the STORED vocabulary.** Rewriting `beach` → `activities` in the column would
silently break every `category=eq.beach` reader. Section→stored mapping happens *in the repair script*.

---

## 8. Separate workstream: anchors + Mote (does **not** block the above)

- **`anchor = 0` on all 1,027 rows** — the coverage guarantee was never populated.
- **Mote is not in `wf_inventory` at all.** Not misclassified — **absent**.
- Google types Mote `research_institute` → `null` in **both** classifiers. **Unification cannot fix Mote.**
- 9 other institution-typed places sit in the same blind spot.

**Proposed anchor path** (own PR, after the classifier work):
1. `data/anchors.json` — marquee places with a **declared** category: Mote, Selby, Ringling, Bishop, Van Wezel.
2. Seeder + repair honour it: category is declared, never inferred; sets `anchor=true, locked=true` so
   re-classification can never overwrite it.
3. `scripts/check-anchors.mjs` in prebuild: **fail the build** if an anchor is missing from `wf_inventory` or
   absent from its category's top 10 — that is what makes "Mote is missing" unshippable.
4. Mote needs its Place ID resolved once (one Place Details call, ~$0.02).

---

## 9. WHAT SHIPPED (v6.16) — result

One classifier (`lib/placeCategory.js`); `lib/placeTaxonomy.js` is now a thin tags/`via` adapter over it.
**`primaryType` decides** — Google's own answer to "what is this place" — which is the rule the old taxonomy
had and v6.15 dropped.

| | before | after |
|---|---|---|
| `beach` | 100 (**79% marinas**) | **46** — beaches only |
| `nightlife` | **18** | **37** — bars recovered from Food |
| `hotels` | 191 (**35% junk**) | **133** + 40 campgrounds via `secondary_categories` |
| excluded (never deleted) | 0 | **75** (38 zero-review rentals · 23 trades · 14 residences) |
| flagged for a human | 0 | **7** ambiguous rentals — kept visible |

**Two near-misses caught by testing against real data, not assumptions:**
1. A name-based rental rule flagged **Island Sun Inn & Suites** and **A Beach Retreat On Casey Key** — real hotels.
2. A secondary-type trade veto excluded **Hudson's Furniture** (994 reviews), **DICK'S** (291), **Staples** (223)
   and **Casa Del Mar Beach Resort** (465) — because Google tags big-box retailers `manufacturer`/`supplier`
   and condo-resorts `condominium_complex`. `Hudson's` type signature is *indistinguishable* from the
   contractor it was meant to catch; **only `primaryType` separates them.** Both rules were rewritten.

Verified by executing the real gate against the real rows: all 7 junk probes now **BLOCKED**, all 5 negative
controls still **pass**. `npm run build` exit 0 (reproduces Vercel; `next build` alone would skip the gates).

---

## 10. Original proposal (kept for the record)

Make `lib/placeCategory.js` the one classifier; re-express `lib/placeTaxonomy.js` as a thin **tags/sub-filter**
layer over it.

**Carry over** (exists only in the old classifier): the tags vocabulary (`museums`, `outdoors`, `markets`,
`bars`…) that the read path matches by equality; and **`via` provenance** — a category recovered from the
*name* is flagged `needs_review`, never silently trusted.

**Fix while unifying:**
- `marina` → not `beach` (§2)
- **service veto before the allow-admit**, in `placeFilter` too (§3)
- **residential / parking veto** (§3)
- **generic-`lodging`-only ⇒ not a hotel** (§4)
- resolve by **declared priority**, not Google's array order (§5)
- keep `beach` as a **tag** under Activities so the Beaches surface still works — and contains only beaches

Then: idempotent repair (`--dry-run` default, `--apply` explicit), full before-row backup to
`wf_inventory_backup_2026_07_14` for rollback, ambiguous rows → `needs_review=true`, **never deleted**.
