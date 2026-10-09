# Atlas editorial writer: decision package (2026-10-09)

Status: LOCAL PREPARATION ONLY. Nothing here is pushed, deployed, applied to the
database, or paid for. Branch `lane/atlas-spend-controls` (local), base origin/main 95e322f.

## 1. Writer configuration (source vs deployed vs runtime)
- Source: lane model default `claude-sonnet-5-5` (lib/atlasPaidLane.js); old path default
  `claude-haiku-4-5` (lib/envAudit.js). `ATLAS_MODEL`, if set to ANY value, overrides both;
  an unknown/malformed value is sent to Anthropic anyway (one console.error, no hard fail).
- Deployed (Vercel production env names, values not decrypted, read 2026-10-08): `WAYFIND_GATE`
  present; `ATLAS_MODEL`, `ATLAS_PAID_ENABLED`, `ATLAS_MONTH_PLACE_CAP` absent.
- Runtime evidence: wf_job_pulse shows every atlas-build/retry/refresh run skipping with
  "intentional skip: gate=free; paid Atlas re-buy disabled" from 2026-09-16 to 2026-10-08.
  The web lane has never executed. Model capability lookups (GET /v1/models, free) show
  web_search supported for sonnet-5-5 / haiku-5-5 / haiku-4-5; that is NOT a workflow test.
- Defect found: Sonnet 5.5 and Haiku 5.5 official pages state any non-default temperature
  returns 400. The deployed lane sends `temperature: 0.4`, so per the docs every lane call
  would fail. Fixed locally (SAMPLING_PARAMS_REJECTED). Not verified against the live API.
- Also: no prompt caching on 5.5 models (CACHE_MIN_TOKENS lacks them; docs say 512 minimum);
  no pause_turn handling; usage tokens never recorded; `dry=1` still spends; no dollar cap.

## 2. What "paid switch off" blocks
With `WAYFIND_GATE=free` and no lane flags: scheduled build, retry and refresh all return
before any spend. Manual calls to the same route (CRON_SECRET) hit the same gate. It does
NOT block other Anthropic callers (/api/insight, hooks, blurbs…) on the shared request cap,
and it does not cover scripts/atlas-batch.mjs (operator run, calls Anthropic directly).

## 3. Measured facts
- Demand (event `detail_open`, logged only by the in-app place sheet `openDetail`, app/home.js;
  server-rendered /places pages are NOT counted). Rolling UTC windows ending 2026-10-09 00:00Z:
  last 30d 367 places / 1,515 opens / 703 devices; prior 30d 319 / 563 / 110; before that 381 / 825 / 151.
  Only 46 of the last window's 367 places were also opened in the prior window.
  Places first seen in the window and lacking an eligible write up: 249 (last), 217 (prior).
  Internal/automated traffic cannot be separated with the data we have; the top 5 devices
  account for 189 opens.
- Backlog: 302 places opened in the last 30d lack an eligible write up; 188 of them are in the
  lane's three metros. Only 97 were opened by 2+ devices.
- Inventory (common snapshot 2026-10-09): 20,971 operational places; 2,981 wf_editorial rows =
  723 eligible (verified, why_here, sourced facts, all servable) + 104 written-unverified +
  2,154 empty (962 PENDING SOURCE, 915 FAILED VERIFICATION, 206 empty-published, 56 ride-level).
  18,028 operational places have no row at all.
- Acceptance: old Atlas path (Google Details + official page + haiku-4-5), 2026-07-29..08-25:
  first attempts 315/1,914 = 16.5%; retries 207/1,413 = 14.6%. Web lane: no data. Unknown.
- Research reuse: the 2,154 empty rows have 0 facts (query proven on the 723 eligible rows,
  all of which have facts). wf_inventory.editorial is Google's summary text, not reusable
  research. Brand siblings are not reused for a different location.

## 4. Cost model
See cost-model.mjs (prices: lib/atlasBudget.js, version anthropic-std-2026-10-08). Token
anatomy is ASSUMED; the pilot replaces it with measured usage. Per attempt:
| model | typical, single pass | typical, cumulative loop | high, cumulative | reserved bound |
|---|---|---|---|---|
| haiku-5-5 | $0.0244 | $0.0293 | $0.2391 (tier B) | $0.415 |
| sonnet-5-5 | $0.1080 | $0.2060 | $0.8662 | $1.570 |
| haiku-4-5 | $0.0640 | $0.1130 | $0.4481 | $0.800 |

## 5. Pilot
manifest.json (20 places, frozen), rubric.md, scripts/atlas-pilot.mjs, budget ledger.
Question answered: complete research+writing workflow, each model researching independently.
Not answered: writing quality on identical evidence (separate, later stage if needed).

## 6. Runner behavior on failure
- One unresolved attempt (timeout, network error, missing or ambiguous usage, non-validation HTTP error) halts the run. Its full reserved bound stays counted against the ceiling.
- The operator lifts it with `reconcileAttempt(attemptKey, {settledMicroUsd})`, using the provider usage for that request id or the Console figure. A rerun then continues with the remaining attempts.
- Reruns look every attempt up before reserving: settled or released attempts are skipped (stored results in `raw/` are reused); an attempt still reserved, dispatched or unresolved stops the run with `unresolved_prior_attempt` naming the key.
- The runner cannot raise the ceiling. `FileLedger.setBudget` refuses a raise unless the operator passes `--raise-ceiling <microUsd>` (printing old and new value). A new ledger file next to an existing `summary.json` for this pilot is refused unless `--new-ledger` is passed.
- Validation errors (HTTP 400, 413 or 422 with an `invalid_request_error` body) settle at $0. That is an ASSUMPTION (Anthropic does not bill invalid requests); check the Console after the run.
- Per-call timeout is 120s (server-side tool loop); a timeout is unresolved, never retried.
