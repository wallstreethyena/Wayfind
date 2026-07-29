# Census storage and refresh — Phase 3

Written against a saturated Orlando census (2,905 place_ids, 785 calls, $27.48).

## 1. No new store

The census is **not** a new table. `wf_place_ids` already is the permanent ID
index — `place_id, name, lat, lng, category, signals, seen_at` — created for
exactly this purpose and described in `lib/serverCache.js` as *"Permanent
place-ID index. Google's ToS lets us keep Place IDs INDEFINITELY, so this table
has no expiry."*

The census is that table at **full metro coverage** instead of at
whatever-we-happened-to-ask-for coverage. Two columns are added:

| column | type | why |
|---|---|---|
| `metro` | text | which metro's census this row belongs to. Today the table has no metro key, so "is Orlando saturated" is unanswerable from storage. |
| `classified_at` | timestamptz | when `category` was last derived. Null = never classified — Rule 2's countable state, not a silent gap. |

Everything else is already there. `signals` (jsonb) carries the sweep provenance
— which strategy and which district found the row — so a future completeness
audit can ask "what did landmark seeding uniquely contribute" without a re-sweep.

## 2. The two lifetimes — this is the ToS boundary

These are different data with different rules, and conflating them is the failure
this section exists to prevent.

**Indefinite — ours or explicitly permitted:**
- `place_id` — Google's terms permit indefinite storage of place IDs.
- `category` — **our derived label**, not Google content. This distinction is
  load-bearing: `category` is computed *from* Google `types[]`, but the label we
  write is our own and persists. The `types[]` it came from does not.
- `signals` — our sweep provenance and derived ranking inputs.
- `metro`, `seen_at`, `classified_at` — ours.

**30-day cap — Google place content:**
- name, rating, userRatingCount, priceLevel, regularOpeningHours, `types[]`
- Lives in `wf_places_cache` under key `pd1|{id}`, which already enforces
  `FRESH_MS = 30 * DAY` and `STALE_MAX_MS = 30 * DAY` (`lib/placeDetails.js`).

**Known exception, pre-existing and deliberate:** `wf_place_ids` retains
`name/lat/lng` as a minimal skeleton so feeds can show known places when detail
caches are cold. `lib/serverCache.js` already flags this: *"if strict Google ToS
is required these should be refreshed <=30d."* The census does not widen that
exception — it stores no additional content fields on the permanent table.

## 3. Refresh cadence

**The id set is re-swept rarely.** New venues appear slowly; a saturated metro
does not need re-saturating monthly. Cadence: **quarterly per metro**, or on
demand when a golden-set landmark goes missing (Phase 5). At Orlando's measured
$27.48, 21 metros quarterly is ~$916/year.

**Content is refreshed lazily, on serve — NOT on a cadence.** This is the
single most important cost decision in this document.

Refreshing all census content on a schedule would cost, at ~30,000 place_ids
across 21 metros and the existing 20–27d jittered refresh-ahead
(`lib/serverCache.refreshAgeFor`), roughly 39,000 Place Details calls/month at
Enterprise $20/1k = **~$780/month**.

Refreshing only what is actually served costs, at ~1,260 distinct places rendered
across 84 landing pages plus detail-page traffic, roughly 1,640 calls/month =
**~$33/month**.

The census exists so that *retrieval* is complete, not so that every row is kept
hot. A row nobody renders needs no fresh content — it needs its `place_id`, which
never expires. `lib/serverCache` already implements refresh-on-read; the census
must not add a scheduled refresher alongside it.

## 4. Classification and content refresh are ONE job

If they decouple, `category` keeps referring to `types[]` that expired and were
replaced — the label stays green while its basis is gone. Same shape as an
assertion outliving the condition it was written for.

So: whenever a row's content is refreshed, its classification is recomputed in
the same job, and `classified_at` is stamped in the same write. A classification
pass that runs independently of content refresh is a bug, not an optimisation.

Classification itself is **free** — pure computation over stored data, no API
calls — so it can re-run freely when a predicate changes, and gets its own golden
sets (Phase 5).

## 5. Priced summary

| item | basis | cost |
|---|---|---|
| One-time census, 21 metros | Orlando measured 785 calls; 3 large ≈785, 10 mid ≈300, 8 small ≈150 → ~6,555 calls @ $0.035 | **~$229** |
| Re-sweep cadence | quarterly, all metros | **~$229/quarter** (~$916/yr) |
| Content refresh — on serve | ~1,260 distinct rendered places, 20–27d jitter, Details Enterprise $20/1k | **~$33/month** |
| Content refresh — if scheduled over the whole census | ~30,000 ids × ~1.3/mo | **~$780/month — do not do this** |
| Classification | pure computation | **$0** |

Orlando's $27.48 is measured. Every other figure is extrapolated from it and is
an estimate, not a measurement — the per-metro numbers for the other twenty are
derived from market size, not observed, and should be replaced with measured
values as each metro is swept.
