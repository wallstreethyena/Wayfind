# Wayfind Card Standard

The owner-authored editorial format for a place card. Eleven sections, in this
order. This document is the source of truth for the heading names — the ingest
parser (`scripts/ingest-atlas-editorial.mjs`) and the Detail-sheet renderer
(`app/components/sheets/Detail.js`, `WayfindTakeRail`) both key off them.

## Voice

What makes a Wayfind card different from a review-site listing:

- **Specificity is the trust signal.** Real names, real dates, real dish names,
  real counts. "56-room Ca' d'Zan mansion", not "a grand historic home".
- **Honest tradeoffs, stated plainly.** "Less ideal if you only have 90 minutes"
  is a feature. Surfacing friction up front is what makes the recommendation
  trustworthy — never hide it to make a place sound better.
- **Second person, and Wayfind is invisible.** The place is the subject. No "we".
- **No hype adjectives.** Banned by default: stunning, must-visit, hidden gem,
  incredible, amazing, iconic.

## Sourcing gate

Every number, date, proper name, price, opening hour, and superlative must be
verifiable before the card publishes. Superlatives ("largest in the world",
"oldest in Florida") need a source recorded alongside the claim. A confident
sentence that turns out to be wrong costs more trust than a missing section.

Time-sensitive claims (hours, prices, "free on Mondays") go stale. `wf_editorial`
has no expiry mechanism today — see "Known gaps".

## The eleven sections

| # | Heading | Purpose | Length |
|---|---------|---------|--------|
| 1 | **Why Go** | The single strongest reason this place earns a trip | 1–2 sentences |
| 2 | **Known For** | The specific signature items or features | 1–2 sentences |
| 3 | **Insider Move** | One practical thing a regular knows | 1–2 sentences |
| 4 | **Why It Stands Out** | Differentiation vs. the obvious alternative | 1–2 sentences |
| 5 | **Good to Know** | Hours, pricing, reservations, parking, access | 2–4 short items |
| 6 | **Heads Up** | The honest caveat — real friction, stated plainly | 2–3 sentences |
| 7 | **Best For** | Who this suits, and who should skip it | 2–3 sentences |
| 8 | **Pro Move** | The highest-satisfaction specific order or timing play | 1–2 sentences |
| 9 | **The Story** | Origin narrative, real names and dates, factual only | 2–3 sentences |
| 10 | **Vibe Check** | Atmosphere in concrete sensory terms | 1–2 sentences |
| 11 | **Fun Fact** | One memorable, verifiable detail | 1 sentence |

Notes on the sections that get confused with each other:

- **Insider Move vs. Pro Move.** Insider Move is the thing a regular knows
  ("ask for the signature drink"). Pro Move is an optimization with a specific
  day, time, or sequence ("Go Thursday — the museum is open to 8 p.m. and the
  Art After 5 ticket is cheaper"). Pro Move is the most conversion-adjacent
  sentence on the card; it is not a second Insider Move.
- **Good to Know vs. Heads Up.** Good to Know is neutral logistics. Heads Up is
  a caveat that might change someone's mind.
- **Why It Stands Out** must say *how* it is better, never just that it is.

## Where each section is stored

`data/atlas/editorial-cards.json` (the Atlas card file) carries all eleven.
The `wf_editorial` Supabase table does **not** — it has five text columns:

| Section | Storage |
|---|---|
| Why Go | `wf_editorial.why_here` |
| Known For | `wf_editorial.hook` |
| Insider Move | `wf_editorial.local_tip` |
| Good to Know | `wf_editorial.know_before` |
| Pro Move | `wf_editorial.best_time` (timing content belongs here) |
| Why It Stands Out | `wf_editorial.facts[].claim` (needs a source URL) |
| Best For, The Story, Vibe Check, Fun Fact | **no column — Atlas cards only** |

## Known gaps

These are open, not solved. Do not assume a card written today renders in full.

1. **Four sections have no `wf_editorial` column** (Best For, The Story, Vibe
   Check, Fun Fact). `mapWfEditorial` in `lib/editorialRule.js` holds them
   `null` rather than borrowing an unrelated column. Populating them from
   `wf_editorial` needs a schema migration.
2. **List surfaces render only `hook`.** `lib/todaysBest.js`,
   `app/components/IntentPageClient.js`, and `lib/landing.js` select a subset.
   The full card appears only in the Detail sheet.
3. **The atlas-build cron cannot update an existing row.** It upserts with
   `resolution=ignore-duplicates` (`ON CONFLICT DO NOTHING`) to protect the
   rows already written, so re-running it will not refresh a stale card.
4. **No freshness mechanism.** `wf_editorial` has `written_at` but no
   `expires_at` and nothing re-verifies. A "free on Mondays" claim is asserted
   indefinitely.
5. **`standard_version` has two casings** in production — `atlas-590-v1` and
   `Atlas-590 v1`. Filter case-insensitively until normalized.
