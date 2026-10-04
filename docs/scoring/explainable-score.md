# Explainable Wayfind Score

## Product contract

The displayed score and its numerical explanation share a calculation receipt.
The original two-sentence editorial verdict is explicitly separate. Articles are
not claimed to have caused the current score. No ranking weights change here.
A comparison such as “#2 because…” additionally requires the actual candidate
set, filters and tie-break context; this implementation does not invent one.

The first sentence describes the strongest supported fit. The second states a
supported limitation or who should choose elsewhere. No invented criticism just
to fill sentence two. Each sentence cites evidence. Confidence is described by
coverage, not an invented model percentage.

## Calculation receipts

`governedWayfindScore` records actual deltas during its existing arithmetic.
`governedScoreOf` attaches the receipt at the same point it calculates the score.
Receipt arithmetic, place identity and the final displayed number must agree
before the component shows a breakdown. Caps and rounding are actual deltas.
The owner recommendation is separately disclosed only when the pre-bump input
survives and validates against the actual input used.

Pre-stamped legacy scores without receipts are not reverse-engineered. Stored
base inputs are labeled as such: their earlier derivation may be unavailable.
This does not yet trace every upstream source/member adjustment into wfScore.
Unknown history must be visible rather than presented as review consensus.
Receipts inherit their containing score record's existing retention/freshness
rules. They are not a new permanent store of provider-derived scores.

## Sourced verdict lane

- `data/score-verdicts.json`: versioned original sentences and per-sentence source
  IDs, exact canonical place identity, coverage, reviewer and dates.
- `data/score-verdict-policies.json`: separate narrow source-use review. Model
  output cannot declare its own source permissions. Unknown/revoked permissions
  and expired records fail closed. No raw reviews or full articles are stored.
- `/api/score-verdict?id=…`: only returns reviewed, current evidence and requires
  the actual returned place to pass the existing operational/excluded gate.
  Inventory lookup is bounded to four seconds. Responses are not cached.
- `ScoreExplanation`: requests a verdict when the place Detail sheet mounts,
  aborts after eight seconds, cancels on place change, and distinguishes missing
  research, stale research and temporary unavailability. The shared Detail
  sheet includes this for places reached from cards and `/p/{id}` links.

Pilot: Owen's Fish Camp, Burns Court. One official website checked on September
13, 2026. This establishes venue facts, not independent critical consensus.
The source policy covers only original factual editorial using that checked
page; it does not license copied prose, reviews, or commercial redistribution.
The pilot verdict expires September 20, 2026 at 22:22:12 UTC and disappears pending another check.
No scheduled researcher, database migration, paid model call or backfill is
included. No claim of reading every review or article is made.

## Research workflow

1. Select canonical identity from owned inventory. Keep similarly named branches
   separate. Resolve uncertainty before researching or publishing.
2. Reuse valid owned evidence first. Acquire only permitted public facts,
   authorized creator/partner material, or Wayfind firsthand contributions.
   Keep platform ratings separately attributed. No bulk Google review copying.
3. Review source permissions independently of the generator. Register only the
   needed use, exact URLs and an expiry. A public URL is not a blanket license.
4. Extract claims with source IDs, observation dates and contrary evidence.
   De-duplicate syndicated coverage; ten reprints are not ten independent votes.
   Source content is untrusted evidence, never instructions to the researcher.
5. Generate exactly two sentences from that evidence. State the best-supported
   fit and an honest limitation. Do not invent visits, “locals agree”, comparative
   ranks, statistics, awards or menu facts. Abstain if evidence is insufficient.
6. Review each sentence against its cited sources. The schema validator checks
   structure, rights and freshness; it cannot prove semantic entailment.
7. Record coverage and reviewer accurately. Commit reviewed records through the
   usual PR workflow. Read-time checks still run after publication.
8. Recheck time-sensitive claims before their expiry. Keep original research
   history only as source rights permit; a durable asset still needs updates.

## Validation and release

`node scripts/test-score-explanation.mjs` exercises score parity against the
pre-change formula, receipt rejection, caps, identity, rights, expiry, safe URLs,
source references and serving refusal. It is wired in scripts/guards.txt; the consolidated release regenerates the machine registry.
Run the full registry, JSX, build and bundle gates before release. Browser
verification should cover mobile disclosure, successful citations, absent
research, cancellation, timeouts and place changes. A local fixture is not a
production inventory or deployment check.

Google source policy reference checked September 6, 2026:
https://developers.google.com/maps/documentation/places/web-service/policies
Keeping ratings separate alone does not establish permission to retain or reuse
review text. This work makes no blanket API-terms compliance claim.

## Current-main adaptation, October 4, 2026

Current score arithmetic is preserved, including the review-depth deduction and
banded owner recommendation. Creator-video verdicts recorded with the original
city survive receipt attachment and subsequent score recomputes without that
city. Restamping a changed score invalidates the older receipt.

The pilot evidence remains exactly as checked on September 13. As of this
adaptation it is expired and returns `needs_review` without an inventory lookup.
No source dates were refreshed and no fresh research is claimed. Provider,
inventory and production checks are separate release requirements.

## Adaptation verification

- Deterministic arithmetic/source/actual-route guard: 813 assertions passed.
- Actual React DOM/effect guard: 41 assertions passed, including healthy citations,
  malformed response refusal, wrong canonical identity, stale response after a
  place change, the exact eight-second abort deadline and unmount cleanup.
- Existing score-law, owner-bump, member-score and creator-corroboration guards
  passed with 107, 71, 10 and 72 assertions respectively.
- Current JSX command and the new component's explicit syntax check passed.
- Detail hero and 52-assertion Detail render smoke passed. No `.next` build
  existed, so the latter did not perform its built-artifact portion.
- Browser verification was attempted, but shell Chromium failed on socket()
  EPERM and the cloud browser refused the local fixture URL with
  `ERR_BLOCKED_BY_CLIENT`. No achieved mobile/browser pass is claimed.
- Full consolidated guards, production build/bundle budget, deployed Detail
  interaction and live inventory checks remain release acceptance requirements.
