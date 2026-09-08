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
- `ScoreExplanation`: lazily requests a verdict when the disclosure opens,
  aborts after eight seconds, cancels on place change, and distinguishes missing
  research, stale research and temporary unavailability. The shared Detail
  sheet includes this for places reached from cards and `/p/{id}` links.

Pilot: Owen's Fish Camp, Burns Court. One official website checked on September
6, 2026. This establishes venue facts, not independent critical consensus.
The source policy covers only original factual editorial using that checked
page; it does not license copied prose, reviews, or commercial redistribution.
The pilot verdict expires September 13 and disappears pending another check.
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
source references and serving refusal. It is in the normal guard registry.
Run the full registry, JSX, build and bundle gates before release. Browser
verification should cover mobile disclosure, successful citations, absent
research, cancellation, timeouts and place changes. A local fixture is not a
production inventory or deployment check.

Google source policy reference checked September 6, 2026:
https://developers.google.com/maps/documentation/places/web-service/policies
Keeping ratings separate alone does not establish permission to retain or reuse
review text. This work makes no blanket API-terms compliance claim.

## Implementation validation record

- Rebased onto main `3ed1343b` (Next.js 14.2.35). The current branch passed
  the complete runner: 549/549 guards plus one credentialed rerun in 253.7s.
  Browser/live-data checks reported as skipped are not passes.
- New guard: 585 assertions, including real React server renders, passed.
- Existing score law: 105 assertions passed. Owner bump: 55 passed.
- On the initial base `f90f5e43`, all 545 manifest commands were covered across the interrupted full run
  (through command 536) and the remaining nine commands; the additional
  credentialed rerun passed. The new guard's missing machine-registry entry was
  caught and regenerated with the repository's registry builder.
- On that initial base, JSX checks and the production build with documented placeholder configuration
  passed. Bundle: 489.5 KB gzip against the unchanged 492 KB budget.
- On the current base, compilation and type checks succeeded, but the production
  build failed twice with `ENOTEMPTY` while removing `.next/export`, including
  after clearing that generated directory and waiting for guards to finish.
  The current-base build and bundle gate therefore remain unverified.
- Browser portions of existing guards skipped because the environment had no
  working Chromium. Agent-browser failed to start; a separate Chromium runtime
  crashed. No mobile visual or browser interaction pass is claimed.
- Local HTTP smoke attempts could not complete: separate calls could not reach
  the server; the combined attempt ended with network approval cancelled before
  a decision. Injected service tests passed, but these are not live inventory or
  production evidence.
- No push, PR, merge, deployment, database write, paid research job, or bulk
  research backfill has been performed. Source verdict coverage is one pilot.

## Follow-up validation

- Rebased onto main `9a7b76be`; the only intervening main change was the
  Foursquare guard. That updated guard passed 106 assertions, and the score
  explanation guard again passed 585 assertions.
- A clean temporary checkout passed compilation/type checks and advanced beyond
  the previous `.next/export` failure. It produced BUILD_ID and the prerender
  manifest. The tool session ended with network approval cancelled before a
  decision, so a successful build exit was not captured and is not claimed.
- The generated bundle passed the unchanged 492 KB limit at 490.4 KB gzip.
  Headroom is only 1.6 KB; the existing guard warns below 2 KB. CI must verify
  its own output before merge.
- Automatic approval review rejected the branch push: it required explicit
  permission to push/open the draft PR under AGENTS.md section 11, beyond the
  user's instruction to proceed with the feature. No workaround was attempted.
  The changes remain local; no PR, merge or production release was performed.
