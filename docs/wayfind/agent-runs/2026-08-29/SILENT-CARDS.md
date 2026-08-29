# Silent place cards — audit (2026-08-29)

**Status:** report only. No app code, no CSS, no `guards.txt`, no editorial writes, no production reads or writes.

**Base:** `origin/main` at `973eaa5a541cbbd9072eca91527db03746bf9e97` (v8.89-90, #1016). Later than the requested floor `b3c202319`.

**Owner locks honored:** do not click Book; do not fire `/go`; do not invent editorial; do not merge; do not change appearance.

---

## Recommendation

Treat **empty as correct** until a sourced two-beat can be written. Do not generate thousands of hooks. Do not treat the v8.89 `wf_inventory.editorial` rung as “unsilenced.”

What to do next, in order:

1. **Keep the empty-slot law.** A card with no sourced distinction + physical why-sit stays blank. Address, hours, deals, name restatement, blog-theme, and menu laundry lists are not a hook (`docs/wayfind/PRODUCT_TRUTH.md`, locked 2026-08-20).
2. **Do not count v8.89’s +1,824 as house-bar coverage.** That number is “a Google/inventory descriptive line exists and is ≥24 characters.” Those lines are often plate dumps (“grouper, jumbo shrimp, lobsters…”). The house bar says that is not a hook. Painting them hides silence; it does not clear the bar.
3. **Write the next batch by hand / Llama against a short owner-visible list**, not the whole inventory. Start with Bradenton / inland Manatee residuals that already sit in Atlas-590 and have no publish-ready card (sample of 20 below). Each row must prove the publish bar *and* `isUsableCardHook` before ingest.
4. **Re-measure live `wf_inventory` OPERATIONAL vs `wf_editorial` only when a production read is explicitly allowed.** This run did not query production. The old 19.4% coverage figure is **not** reused. The v8.89 ship-day table in `#1016` is cited as historical only.

Do not ship a build-failing “Parrish/Tampa card is silent” guard until a named allowlist exists that can actually go green. A guard over all 349 Atlas-590 residuals would fail `main` today.

---

## Evidence

### What was measured (this run)

Offline, against repo files only. Command shape: Node import of `lib/editorialHook.js` (`isUsableCardHook`, `toHookLine`) and `lib/knownFor.js` (`knownForLine`) over `data/atlas/atlas-590.tsv` + `data/atlas/editorial-cards.json`. No Supabase, no live site, no `/go`.

| Set | Count | Source |
|---|---:|---|
| Atlas-590 owner evaluation places | **590** | `data/atlas/atlas-590.tsv` (parser: `lib/atlasCards.parseAtlas590`). Same 590/590 join to `wf_inventory` recorded in `data/atlas/AUDIT.md` (2026-07-14). |
| Publish-ready Atlas cards on disk | **255** | `data/atlas/editorial-cards.json` (`JSON.parse` length) |
| Atlas-590 with **no** card (empty `knownFor` and empty `whyGo`) | **349** | `missingAtlasEditorial(atlas590, cards)` — 349 of 590 |
| Of those 255 cards: both fields empty | **0** | every publish-ready card has text in at least one of the two fields |
| Filler (address / hours / unit / clock) that `isUsableCardHook` blanks on **both** `knownFor` and `whyGo` | **5** of 255 cards; **4** of those sit on Atlas-590 | executed `isUsableCardHook` (same gate `toHookLine` uses) |
| Atlas-590 painted empty after the compressor | **353** | 349 missing + 4 filler that the house card would render as nothing |
| Conservative keyword two-beat (award/craft/year **and** patio/dock/sand/…) | **35** of 255 cards; **35** of 590 | heuristic only — see caveats |
| Copy that is neither empty, nor filler, nor keyword-two-beat | **202** of 590 | plate lists, single-beat, named-plate+why-sit the keyword list missed |

Atlas-590 category mix (TSV `category` column, `parseAtlas590`):

| Category (TSV) | Atlas-590 | Missing card (silent) | Keyword two-beat | Filler blanked |
|---|---:|---:|---:|---:|
| food | 192 | 108 | 15 | 2 |
| attractions | 129 | 60 | (8 in attractions+beaches combined under card file) | 0 |
| beaches | 17 | 5 | (included in attractions card bucket in the run) | 0 |
| nightlife | 40 | 14 | 5 | 0 |
| shopping | 105 | 88 | 3 | 0 |
| hotels (stays) | 79 | 54 | 4 | 2 |
| other | 28 | 25 | 0 | 0 |
| **total** | **590** | **349** | **35** | **4** |

Beaches in the card file: 12 of 17 Atlas-590 beach rows have a publish-ready card (Siesta, Lido, Coquina, Brohard, Palma Sola, Service Club, Manatee Public Beach / Holmes alias, plus others). Residual beaches stay listed, not invented (`scripts/test-atlas-card-hooks.mjs`).

**Metro (Bradenton / Parrish / Tampa Bay).** Atlas-590 *is* the Manatee–Sarasota evaluation set (`data/atlas/AUDIT.md`: historically `metro=manatee-sarasota`). Street-only addresses mean city tokens are incomplete: 496/590 rows have no city word in `name`+`address`.

Name/address token hits (this run):

| Token in name or address | In Atlas-590 | Silent (no card) |
|---|---:|---:|
| Bradenton / Anna Maria / Holmes / Longboat | 27 | 20 |
| Ellenton | 4 | 4 |
| Palmetto | 3 | 1 (2 have cards: Detwiler's, Palmetto Riverside B&B) |
| Lakewood Ranch | (inside the 30-token set) | 5 silent (ABC, Beef 'O' Brady's, Publix, two hotels) |
| Tampa | 1 | 0 |
| **Parrish** as a name/address token | **0** | — |

Parrish is **not absent from editorial**. Nine publish-ready cards *mention* Parrish in the card JSON (Oar & Iron, Ed’s Tavern, Woody’s River Roo, Fort Hamer Park, Florida Railroad Museum, Good Liquid, Bunker Hill, Riviera, Ed’s LWR). Those are **not silent**. They are later Atlas writes that are not all rows in the 590 TSV. No Atlas-590 row is literally named “Parrish …”.

Hand-written curated hooks in repo: **75 / 75** in `lib/curated.js` carry a `hook`. That path can still paint a name-matched card even when Atlas-590 is silent. Not re-joined in this run.

### Filler that should be treated as silent

Executed `isUsableCardHook` on both fields. These five publish-ready cards would paint **nothing** on the house card (empty slot). That is the correct render. They are not two-beats.

| Name | placeId | Why the gate blanks |
|---|---|---|
| Anna Maria Island Beach Cafe | `ChIJqdXkLDEQw4gRY9A4zDFkRMA` | street + clock hours (`4000 Gulf Drive` / `8 a.m.`) |
| Plaza Mexico | `ChIJA-Xqeqxbw4gRwhQv_J0vk-c` | `Friday–Saturday` + `11pm` / `Sunday` hours |
| Beachcomber In Venice | `ChIJT-zI8upbw4gRMmQKdV_HLLs` | `Unit 20` |
| Island Breeze | `ChIJHQkhLrpbw4gR8JHggY55khQ` | `1950` year + room-amenity list (gate: clock/hours family — confirm on rewrite) |
| Winter Park Village | `ChIJXaxcZ2xw54gRNoUCptQFnF4` | `510 Orlando Ave` — **not** in Atlas-590 (Orlando pad) |

Do not rewrite those strings in this PR.

### Historical live counts — **not re-queried**

Owner override: no production data this run. These numbers are **ship-day comments**, not a 2026-08-29 re-measure.

From `app/api/known-for/route.js` / `scripts/check-known-for-tiers.mjs` (v8.89, same calendar day as this audit, #1016):

| Live table (ship day) | Count |
|---|---:|
| `wf_inventory` rows | 12,790 |
| `wf_editorial` verified **with a hook** | 548 |
| `wf_inventory.editorial` non-null | 2,510 |
| Inventory line and no verified hook | 2,253 |
| Rail-qualifying (≥100 reviews, ≥4.3) | 9,201 |
| Of those, researched line already spoke | 441 (4.8%) |
| Of those, inventory line “would speak” | +1,824 |
| Still silent after that rung | 6,936 of 9,201 |

That 4.8% is **not** 19.4%. Do not revive 19.4%. Also do not treat 441+1,824 as two-beat coverage.

Older snapshot, also not this run: `data/atlas/AUDIT.md` (2026-07-14) had **1,027** `wf_inventory` rows, all `manatee-sarasota`, **0 non-operational**. Inventory has grown a lot since; OPERATIONAL share today is unknown without a read.

`scripts/report-editorial-coverage.mjs` is the existing offline-unsafe instrument (`wf_inventory` + `wf_editorial` per metro). It counts “published row, no `issues`”, **not** two-beat and **not** filler. It was not run (needs production credentials).

### Two-beat heuristic caveat

The 35 count requires both (a) award / winner / festival / “since 19xx” / wood-fired / house-made and (b) patio / dock / pond / sand / terrace / overlook / …. It **undercounts** named-plate + why-sit lines the house bar already accepts. Examples already on disk (Parrish-mentioning cards; **not invented**):

- Ed’s Tavern — “Big Ed's smashburger, on an open-air patio”
- Woody’s River Roo — “Coconut shrimp, with open-air seating on the Manatee River”
- Good Liquid — “Coconut Key Lime Sour, on a patio over the water”

Those sat in the 202 “has copy, not keyword-two-beat” bucket. A writer pass would move some of the 202 up. It would not move the 349 empties.

Cracked Pepper gold line is **not** in `editorial-cards.json` or Atlas-590. It lives on the live fleet / card take. Not verified this run.

---

## Paint path (what the house card actually shows)

No files changed. This is a read of current `main`.

**Field the list card shows.** One take slot. Precedence:

1. **IconicPlaceCard** (`app/components/IconicPlaceCard.js`): `toHookLine(editorial, place.name)`. If that is empty, a validated `{ card_line_1, card_line_2 }` `aiSummary` (pool CARD_SUMMARY). If neither, **nothing** — comment in file: “If NEITHER exists, nothing renders… no template fallback.”
2. **home `PlaceCard`** (`app/home.js`): `curatedFor(p).hook` first (`lib/curated.js`), else `editorialLine(line, p.name)` when `line` is a string from `/api/known-for` / blurbs, else object CARD_SUMMARY, else **nothing**. Rank-reason / Google-stars sentence was removed (v6.87).
3. **Detail sheet** (`app/components/sheets/Detail.js` → `WayfindTakeRail`): `/api/editorial` mapped sections. Why Go ← Atlas `whyGo` / `wf_editorial.why_here`. Known For ← Atlas `knownFor` / `wf_editorial.hook`. Empty sections are omitted (`filter((x) => x.body)`). No invented body.

**Resolver for the list take** (`app/api/known-for/route.js` + `app/components/useEditorialHooks.js`):

1. Atlas publish-ready line (`atlasLinesFor` → `knownForLine` on `knownFor` then usable `whyGo`).
2. `wf_editorial` where `verified=is.true` (`hook` then `why_here`, then optional `local_tip` if it still fits).
3. **v8.89 third rung:** `wf_inventory.editorial` if still empty and length ≥ 24. Labeled `tiers[id] = "known"` (quieter CSS, no orange accent). This is the silence-hiding fallback.

**When it renders empty.** `toHookLine` / `isUsableCardHook` return `""` for: empty string, pending-research placeholders, address/unit/highway/ZIP, official hours, day ranges, clock times, phone, “now open”, host-theme / birthday / Bundtlet / popcorn, pickReason, rail titles, name restatement. `editorialUsable` also drops `verified: false`, `FAILED VERIFICATION`, and unverified-placeholder prose.

**Fallbacks that hide silence (still on `main`):**

| Fallback | Hides empty? | House-bar legal? |
|---|---|---|
| Atlas / verified `hook`+`why_here` | no — those *are* the slot | yes, if two-beat and sourced |
| `lib/curated.js` hook (home PlaceCard only) | yes, by name | only if that hook is a two-beat |
| `/api/blurbs` cacheOnly CARD_SUMMARY | yes | only if the pool line is a two-beat (validator is generic/fragment, not two-beat) |
| **`wf_inventory.editorial` (v8.89)** | **yes — this is the 1,824** | **usually no** — descriptive / menu dump |
| Google types / “An easy meal out.” | **no** on house cards today | banned; still present as dead strings in `app/home.js` theme helpers, not the take slot |
| Rank reason / “Our #1 pick — 4.9★” | **no** — removed from both cards | banned |

`mapWfEditorial` (`lib/editorialRule.js`) maps `why_here` → `why`, `hook` → `knownFor`, and returns `null` unless `verified === true`.

---

## Unsilence plan (write path only — not executed)

**Do not run these in this PR.**

### Real write path

| Step | What it does |
|---|---|
| Owner / Llama card in Atlas markdown | Eleven Wayfind Card Standard headings. Quality Level must be `PUBLISH-READY CANDIDATE`. |
| `scripts/ingest-atlas-editorial.mjs` | Parses markdown → `data/atlas/editorial-cards.json`. Dry-run by default. `--commit` PATCHes `wf_inventory.editorial_card` (jsonb), **not** `wf_editorial` hook/why. Refuses commit if validation problems. |
| Llama / editorial Writer batches | Agent writes to the standard; does not invent on the render path. |
| `app/api/cron/atlas-build/route.js` | Places Details + model → `editorialRow()` → `wf_editorial` upsert **`ON CONFLICT DO NOTHING`**. Cannot refresh a stale row. `verified` is derived (`lib/atlasEditorial.js`), never hardcoded. |
| `editorialRow` / `contentIssues` | Publish iff hook ≥ 20 chars, `why_here` ≥ 120 chars, ≥1 `facts[].source` with `http(s)`. Else stored unverified (`thin-hook` / `insufficient-why-here` / `no-sourced-facts`). |

Readers that still gate on `verified=is.true` are locked by `scripts/check-editorial-publish.mjs`. Weakening that gate publishes flagged rows. Wrong.

### What a batch must prove before publish

All four from `docs/editorial-standard.md`, plus the 2026-08-20 house bar:

1. Could this exact line be written about a different place? If yes, rewrite or leave empty.
2. Two-beat: one sourced distinction (award / named plate / craft) **plus** one physical why-sit. Gold: *Winner of the 2023 Cuban Sandwich Festival's World's Best award, with a patio that overlooks a pond.*
3. Every number, date, proper name, and superlative has a source URL in `facts[]` / `sourceUrls`.
4. `isUsableCardHook(knownFor, name)` and `isUsableCardHook(whyGo, name)` are **true**. Address, hours, deal, birthday/Bundtlet, name restatement, “you come for” → empty, do not publish as a hook.
5. `contentIssues` is `[]` so `verified` can be true (fleet path).
6. Geo: the place is the Parrish / Bradenton / Tampa Bay venue, not a same-name room in Naples / Orlando (Oar & Iron lesson).

Plate-list-only without a why-sit may still pass `isUsableCardHook` (intentional: #861–#874). It is **not** the house bar. Tightening is Editorial’s job, not a gate.

### Guard that *should* exist later (not added)

A **new** `scripts/check-*.mjs` + `guards.txt` line, CHECK-only, no product copy:

- Load Atlas cards (and, if a production read is allowed, verified `wf_editorial` for a **named** owner-visible place_id list).
- Fail if any listed Parrish / Tampa Bay owner-visible id has filler (`isUsableCardHook` false on the painted fields).
- Fail if a listed id that **already had** a publish-ready two-beat loses it (regression), not if it was never written.
- **Do not** fail the build on the 349 never-written residuals — that reds `main` and blocks unrelated work.
- Red-prove by mutating a fixture hook to the pre-#861 Oar & Iron address/hours string and watching the check go red; restore.

This PR does **not** add that file.

---

## Impact

- **User trust:** 349/590 Atlas-590 places have no why-go/known-for in the publish-ready file. On the live app, some of those still speak via curated hooks, fleet rows, blurbs, or v8.89 inventory lines. This run cannot say how many. What we can say: the house bar and the v8.89 “would speak” metric are different questions.
- **Owner-visible Bradenton / inland Manatee:** of 30 name/address metro hits, **22 are silent at the Atlas layer**. Shopping and hotels dominate the hole (88/105 shopping, 54/79 hotels). Food is 108/192 silent.
- **Parrish:** the places Gabe already educated (Oar & Iron, Ed’s, Woody’s, Good Liquid) **have cards**. The Atlas-590 TSV does not encode “Parrish” as a city column, so a “Parrish silent %” from the TSV alone would be a wrong metric.
- **Revenue:** empty take is not a booking bug. Filling with menu dumps or deals *is* a trust bug (August birthday/AMC leak). Unsilence only with sourced two-beats.

---

## Risks / unknowns

1. **Live OPERATIONAL inventory was not counted.** 12,790 / 548 / 1,824 are ship-day comments. They may already be stale. 19.4% is retired.
2. **v8.89 is already on `main`.** Inventory descriptive lines paint today. This audit does not revert them. Reverting would change appearance (owner-forbidden here) and would re-silence those cards.
3. **City parse is incomplete.** Most Atlas-590 addresses are street-only. Metro tables above that use tokens undercount Tampa and Parrish.
4. **Keyword two-beat is a lower bound.** Named-plate + patio lines are real two-beats and were not all counted as 35.
5. **`wf_inventory.editorial` vs `editorial_card`.** Ingest `--commit` writes `editorial_card` jsonb. The known-for third rung reads `editorial` (string). Those are not the same column. Not verified against production.
6. **Atlas-build still `ON CONFLICT DO NOTHING`.** A filler card already in `wf_editorial` will not be repaired by re-running the cron.
7. **Some Atlas-590 “places” should stay silent** (voting precinct, hotel pool pin, chain liquor, hardware). Empty is correct; a coverage % that treats those as a deficit will point at the wrong repair.

---

## Next three actions

1. **Owner decision** on the v8.89 descriptive rung vs the 2026-08-20 empty-slot law (see below). No code until that is explicit.
2. **When a production read is allowed:** run a *new* read-only classifier (not `report-editorial-coverage.mjs` as-is) that buckets OPERATIONAL rows into two-beat / silent / filler / descriptive-rung, by metro and category. Persist the query output in the next agent-run folder.
3. **One Llama/Atlas batch of ≤40 owner-visible residuals** from the sample below (food + attractions first). Prove the six publish checks. Ingest dry-run only until the owner says `--commit`. Do not batch-write 349 hooks.

---

## Decision required

**A. What is “speaking” on a house card?**

| Option | Meaning |
|---|---|
| **A1 — House bar only (recommended)** | Painted take must be a sourced two-beat. Empty otherwise. v8.89 descriptive lines are still silence. |
| **A2 — Keep v8.89 descriptive rung** | Menu/Google summary may fill the slot without the accent bar. Coverage looks like 441+1,824. Conflicts with the 2026-08-20 lock. |
| **A3 — Hybrid** | Descriptive rung stays for now; Editorial rewrites Atlas/fleet to two-beat and the descriptive rung loses as those land. No appearance change in this PR. |

**B. Next write set:** the 20 silent cards below, or a different owner list (Parrish names not in Atlas-590, Tampa beyond the 1 token hit, etc.)?

**C. Production read:** allow a later agent to query `wf_inventory` + `wf_editorial` read-only so the 12,790 / 548 / 1,824 table can be replaced with a dated measure?

This PR answers none of those. It must stay **draft** and **unmerged**.

---

## Sample — 20 silent owner-visible cards

Silent **at the Atlas layer**: no publish-ready card in `data/atlas/editorial-cards.json` (`missingAtlasEditorial`). That is empty `hook` and empty `why_here` for this source. A live curated / fleet / inventory line was **not** checked.

| # | Name | placeId | City (from name/address token) | Category |
|---:|---|---|---|---|
| 1 | ArtSLAM at Bradenton Riverwalk | `ChIJY3qV_tYXw4gRoy-jOe1OAo4` | Bradenton | attractions |
| 2 | Bradenton Yacht Club | `ChIJEdWsSXEXw4gRpgNdaDgckZs` | Bradenton | attractions |
| 3 | ellenton gardens | `ChIJY9wgTUwjw4gRN99NsZ4jw7Q` | Ellenton | attractions |
| 4 | Anna Maria Oyster Bar | `ChIJN3Cny9Y8w4gRolf8PlS1tuU` | Bradenton | food |
| 5 | Anna Maria Oyster Bar | `ChIJV0e-x5MVw4gRM1jn5H1xnYE` | Bradenton | food |
| 6 | RJ Gator's of Bradenton | `ChIJJ0wq4pYWw4gRUIz19snZRCY` | Bradenton | food |
| 7 | Mattison's Riverwalk Grille Bradenton | `ChIJ2SjpRNYXw4gR5JpR_vrc0As` | Bradenton | nightlife |
| 8 | CMX CinéBistro Siesta Key | `ChIJ3-wcgLJBw4gR9UGr_yLsHJY` | Sarasota | food |
| 9 | Cannons Marina Boats | `ChIJiS5Iw5UTw4gRfEiuwR8G20k` | (Gulf of Mexico Dr / Longboat) | attractions |
| 10 | Lido Beach Resort | `ChIJg-jF3Ihqw4gRNJ0QhK4Ywsg` | Sarasota | hotels |
| 11 | Perry Ellis - Ellenton Premium Outlets | `ChIJKYwJVy0jw4gRkXnEq-Or48M` | Ellenton | shopping |
| 12 | Palmetto Marriott Resort & Spa | `ChIJPdQY5BA9w4gRH7V0a3JvRh4` | Palmetto | hotels |
| 13 | Red Roof Inn Ellenton | `ChIJX6QIx9Y8w4gReQx67QrCz24` | Ellenton | hotels |
| 14 | ABC Fine Wine & Spirits Lakewood Ranch | `ChIJl0-NCxU7w4gRHhGBEDumh5A` | Lakewood Ranch | food |
| 15 | Beef 'O' Brady's | `ChIJu8Q3S1U6w4gRMXBtKTlZb34` | Lakewood Ranch | food |
| 16 | Detwilers Farm Market | `ChIJtXqbvWtHw4gROfKsKwXeMJQ` | (6000 Palmer Blvd) | food |
| 17 | Courtyard by Marriott Bradenton Sarasota/Riverfront | `ChIJmRgc9NYXw4gRQlAxbX-KlVU` | Bradenton | hotels |
| 18 | Hyatt Place Sarasota/Bradenton Airport | `ChIJCdzhRds_w4gRgtt02DP25nA` | Bradenton | hotels |
| 19 | Compass Hotel Anna Maria Sound | `ChIJRc3ulAERw4gRR-XKZC-_SQM` | Bradenton | hotels |
| 20 | SpringHill Suites by Marriott Bradenton Downtown/Riverfront | `ChIJq4KWDc4Xw4gRJ_ZVutHZh3I` | Bradenton | hotels |

Rows 14–15 and several hotels may be places that should **stay** empty (chain / amenity pin). They are in the owner evaluation set; they are not a write order.

---

## What this PR is / is not

- **Is:** this file.
- **Is not:** app/components, `app/home.js`, CSS, `guards.txt`, homepage JS, editorial upserts, a merge.
