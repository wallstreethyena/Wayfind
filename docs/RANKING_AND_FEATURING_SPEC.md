# Ranking and featuring — the spec

Owner decision, 2026-08-06. Supersedes the ad-hoc boost constants currently
living inside `app/home.js`. Nothing here is in force until it lands under an
owner commit.

**The claim this protects.** Every user-facing surface, the App Store
description, and the review notes say the same thing: *rankings are merit-based
and open; commission never affects placement.* That sentence is the product.
This document exists so the code can be checked against it.

---

## 0. Why now — three findings in the current code

**§0.1 — a creator video is worth 45 points out of 100.**

```js
// app/home.js:1029
const VIDEO_BOOST = 45; // clears the 30-pt max distance penalty and lifts a featured place near the top
```

On the 0–100 `wfScore` scale, that is not a tie-breaker, it is an override — by
design, per its own comment. A place scoring **50** with a creator video
outranks a place scoring **92** without one. `curatedFor(p) ? 15` stacks on top.

The owner is about to add creator links at volume. Multiplying an override by
volume produces a featured shelf that is ordered by *who filmed there*, not by
what is good — which is the definition of paid placement wearing a different
name. The differentiator dies quietly, and the first person who drives 30
minutes to a mediocre "top pick" never returns.

**§0.2 — the composite score is not a module.** It is one expression inside a
~4,000-line component:

```js
// app/home.js:587
_ps: (p.wfScore || 50) + boost - distPenalty + faveTier(p) * 4
     + featuredBoost(p) + communityBoost(p) + (curatedFor(p) ? 15 : 0)
     + (hasCreatorVideo(p) ? VIDEO_BOOST : 0)
```

It cannot be unit-tested, cannot be guarded, and has already been double-counted
once — `app/home.js:3623` carries a second base (`boostBase`) written
specifically to undo that. A ranking that only exists inside a render is a
ranking nobody can prove anything about.

**§0.3 — `wayfindScore` is implemented twice.** `lib/google.js:530` calls a
shared helper; `lib/landing.js:77` re-declares the same Bayesian blend inline
(`m=60, C=3.9`). Two functions, one name, one meaning. They agree today. Nothing
makes them agree tomorrow.

---

## 1. The two questions, kept separate

Conflating these is what makes the problem feel hard.

| | Question | Machinery |
|---|---|---|
| **A** | Which card leads the deck? | A deterministic **router** over context |
| **B** | Which places rank inside a card? | A pure **scoring function** |

A is not personalization. B is not a model. Neither needs data you do not have.

---

## 2. Question A — the lead-card router

`lib/leadCard.js`, pure, no React, no network.

```
leadCard({ hourFloat, isWeekend, weather, seasonWindows, isVisitor, coverage }) -> cardId
```

First match wins:

| # | Condition | Lead card |
|---|---|---|
| 1 | severe weather / heat advisory | `culture` (indoor) |
| 2 | Fri–Sat, 17:00–23:00 | `date_night` |
| 3 | any day, 11:00–14:00 | `food` |
| 4 | Sat–Sun, 08:00–12:00, fair weather | `family` |
| 5 | an active seasonal window | `seasonal` |
| 6 | device far from its usual centre | `must_experience` (visiting) |
| 7 | repeat local device | `hidden_gems` |
| 8 | — | `must_experience` |

**The fill rule, which is what makes it right anywhere.** A card may lead only
if it can fill **3 slots that are open now and inside the mood's radius**.
Otherwise fall through to the next candidate. A Date Night card showing two
closed restaurants is worse than no Date Night card.

Reuse what exists: `lib/ranking.js` already has `weatherRegime`, `dayFit`,
`condCtxFromNow`; `lib/momentIntents.js` owns radii. The router composes them,
it does not reimplement them.

---

## 3. Question B — the scoring function

`lib/rankPlaces.js`. **One** exported entry point. Every surface calls it —
home deck, map, intent pages, guides, the native shell. Pure, deterministic,
unit-testable.

```
score = quality × contextFit × proximityDecay × availability + evidence
```

**quality** — `wayfindScore(rating, reviews)`, the Bayesian blend (m=60, C=3.9),
imported from exactly one place. A 4.9 over 11 reviews must not beat a 4.6 over
3,000.

**contextFit** — 0…1. Does the type suit the moment. A museum at 21:00 is `0`,
not "slightly lower". Delegates to `lib/ranking.js`.

**proximityDecay** — per-mood, not global. Date night tolerates 30 minutes;
lunch tolerates 12. Radii come from `momentIntents`.

**availability** — a **multiplier, never a bonus**. Closed → excluded from the
set. Nothing costs trust faster than a #1 pick with the lights off.

**evidence** — the bounded term, and the whole point of §0.1:

```
evidence = min(EVIDENCE_CAP, creators×w_c + editorialVerified×w_e + award×w_a)
EVIDENCE_CAP = 0.15 × quality        // 15% of the place's own quality, never absolute
```

Four rules on it, each one load-bearing:

1. **Bounded relative to quality.** A weak place gets a small boost of a small
   number. The cap can break ties between good places; it can never lift a
   mediocre one over an excellent one.
2. **Distinct creators, not mentions.** One influencer posting five times is one
   signal. Count `DISTINCT creator_id`.
3. **A quality floor gates featuring.** Evidence re-orders *within* the
   qualified set. It can never add a place to it. Proposed floor: display score
   ≥ 7.0 (`getScoreBand` ≥ `fair`) for any featured or deck slot.
4. **It is shown.** "Picked by 3 local creators" renders on the row. The user
   judges the evidence, not just the output.

**Commission is not a term.** `lib/rankPlaces.js` must not import, receive, or
read any affiliate, commission, provider-payout or partner-priority field.
Guarded in §5.

### Output constraints

- **Diversity** — at most one place per `coarseCat` in the top 3. Three seafood
  bars is not a shortlist.
- **A reason string per row**, generated from whichever term dominated:
  *"Picked by 3 local creators"* · *"★4.9 across 2,700 reviews"* ·
  *"Open till 11, 14 min away"*. A ranking that narrates itself is a ranking
  people believe.

---

## 4. Coverage — "right no matter where they are"

Not an algorithm problem. A coverage problem. Inventory is Florida metros;
someone in Denver cannot be served by any weighting.

Check coverage **before** ranking. Below threshold (`< 3` qualifying places in
radius), do not render a thin local list — offer the nearest covered metro
("worth the drive") or the guides. **Never ship a weak list to protect a
layout.** A thin list teaches someone the ranking is bad; an honest empty state
teaches them it is careful.

---

## 5. Guards — each RED-provable

`scripts/check-ranking-integrity.mjs`, run in `run-guards`:

1. **One score, one place.** `wayfindScore` is declared exactly once in the
   repo. RED: reintroduce the inline copy at `lib/landing.js:77`.
2. **Evidence is capped.** RUN `rankPlaces` over a fixture where a place with
   quality 50 carries 10 creator videos, and a place with quality 92 carries
   none. Assert the 92 still ranks first. RED: restore `VIDEO_BOOST = 45`.
3. **Closed is excluded, not demoted.** A closed place must be absent from the
   returned set, at any score.
4. **The floor gates featuring.** A place below the quality floor never appears
   in a deck or featured slot, at any evidence level.
5. **Diversity holds.** No two of the top 3 share a `coarseCat`.
6. **Commission is unreachable.** `lib/rankPlaces.js` and its transitive local
   imports contain no affiliate/commission/payout identifier. RED: add one.
7. **The router never leads with an unfillable card.** Drive `leadCard` over
   fixtures where the preferred card has 2 open places; assert fall-through.
8. **Every surface uses the one function.** No file outside `lib/rankPlaces.js`
   composes its own place ordering from `wfScore` plus boosts. RED: reinstate
   `_ps` in `app/home.js`.

Assertions are on **returned values**, not on source text, wherever the thing
can be run. Where it cannot, assert syntactic position — never a bare substring.

---

## 6. Order of work

1. Extract `wayfindScore` to a single module; delete the `landing.js` copy. (§0.3)
2. Extract the composite out of `app/home.js` into `lib/rankPlaces.js`,
   behaviour-identical, no weight changes. Guard 8 goes green here.
3. Replace `VIDEO_BOOST`/`curatedFor` with the bounded `evidence` term. Guard 2
   goes green here. **This is the one that changes what users see** — ship it
   alone and watch it.
4. Quality floor + diversity + reason strings. (§3)
5. `lib/leadCard.js` + the fill rule. (§2)
6. Coverage gate. (§4)

Steps 1 and 2 are refactors with no user-visible change and should merge
independently of everything after them.

---

## 7. What to measure

One number decides whether any of this worked: **the share of sessions under 10
seconds**, currently ~50% of single-page visits to `/`. Everything downstream —
detail opens, affiliate clicks, return rate — is gated behind someone staying
long enough to look.

Secondary, once the deck ships: featured-slot click-through, and the share of
featured places that clear the quality floor on their own merit without the
evidence term. If that second number falls, the shelf is drifting back toward
§0.1 and the guard has been weakened.
