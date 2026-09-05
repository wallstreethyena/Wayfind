# Guard-honesty audit — 2026-09-04

Owner's question: **"why does the guard keep lying to me."** This is an honest census of
every guard in `scripts/guards.txt`, not a clean bill of health. A red guard below is a
finding, not an obstacle; nothing was weakened or deleted to force a green.

Taxonomy is CLAUDE.md's, as specified by the work order:

- **CALL** — imports real `lib/`/`app/` code (or spawns a real child process) and asserts
  on what it returns. Strongest.
- **RENDER** — actually renders/measures a real browser surface. Strongest.
- **STRUCTURAL** — regex/AST over source text only. Weak; acceptable only when it says so
  (`// STRUCTURAL-ONLY: <reason>`).
- **DECORATIVE** — has real import/render/exec capability but asserts nothing on what it
  returns, or is structured so it cannot fail regardless of the code under test.

Method: `scripts/lib/guardHonestyAnalysis.mjs`, a from-scratch static-analysis engine
(proper comment/string/regex-literal tokenizer, multi-pass derived-value tracing, absence/
positive-control detection, if-fail-idiom polarity resolution) built and iteratively
debugged against this specific repo's guard-writing conventions. It is a heuristic, not a
parser — false positives and false negatives exist and are called out below, not hidden.

## Census

| | count |
|---|---|
| **Total guard lines in `scripts/guards.txt`** | 507 (508 raw lines, 1 exact duplicate) |
| Resolved to an analyzable `.mjs` file | 507 (506 pre-existing + this audit's own new meta-guard) |
| Not analyzable (an `npm run check:jsx` → `tsc --noEmit` wrapper, no single script file) | 1 |
| **CALL** | 322 |
| **RENDER** | 39 |
| **STRUCTURAL** | 143 |
| **DECORATIVE** | 2 (before this audit's fixes; see below) |
| Guards with ≥1 honesty violation (any class) | 189 — all now ledgered in `scripts/lib/guard-honesty-known-weak.json` |

A guard-honesty violation and a guard's CALL/RENDER/STRUCTURAL/DECORATIVE class are
different axes: a CALL guard can still be flagged (e.g. for an unproven absence check), and
most STRUCTURAL guards are simply undeclared rather than dishonest. 143 STRUCTURAL guards
is not automatically 143 problems — see the top-20 below for which ones actually matter.

**Named failure modes found** (CLAUDE.md's taxonomy, file:line, one instance of each unless
noted — the top-20 table has the full list with fix sizing):

| mode | instance |
|---|---|
| (a) Scoped-by-name | `scripts/test-rail-score-order.mjs` (fixed, was a 2-file hardcoded list); `scripts/check-spend-guard.mjs:31,52` (open, see #2 below) |
| (b) Substring-not-role | `scripts/test-coverage-waitlist.mjs` (fixed); `scripts/check-hydration-style.mjs:12` (open) |
| (c) Green-on-move | same underlying shape as (a) — `check-spend-guard.mjs`'s hardcoded file arrays go green, not red, the moment a new API route is added outside them |
| (d) Absence with no positive control | 189-file ledger's dominant shape; sharpest instance `scripts/test-booking-integrity.mjs:61` (open, protects the wrong-geo-redirect regression lock named in CLAUDE.md) |
| (e) Status/shape over behavior | `scripts/check-doc-ownership.mjs` reads as this to the analyzer (flagged DECORATIVE) but is a genuine false positive — see "Analyzer limitation" below |
| (f) Pure-function proof of a mechanism that may not run | `scripts/check-cache-refresh.mjs` (fixed — was 100% `readFileSync`+regex proof of a route handler nothing ever called) |
| (g) Unproven red | `scripts/check-direct-affiliate-urls.mjs` (open — well-scoped recursive walk, never proven capable of catching a real bad URL) |
| (h) Count-blind | `scripts/test-sheet-booking.mjs:33` (open — `.length >= 2` where the actual invariant is "both variants," not "at least two of something") |

## Top-20 most dangerous

Ranked by real exposure (revenue/safety invariant × how easily the guard could currently be
walked around), not by violation count. `FIXED` rows were fixed as part of this audit
(see next section for the red-prove evidence); the other 17 are open findings, reported
only, per the work order's "fix only 3" scope.

| # | file:line | mode | why it isn't protecting its claim | smallest real fix |
|---|---|---|---|---|
| 1 | `scripts/check-env.mjs:32` | DECORATIVE | `process.exit(0)` is unconditional — every `ENV WARNING` line it prints (including the one CLAUDE.md names by number: `NEXT_PUBLIC_VIATOR_PID` unset silently zeroes all Viator revenue) is invisible unless a human reads the build log. The guard cannot fail regardless of what it finds. | exit 1 when `warned > 0` for the revenue-critical vars (keep it non-fatal only for the merely-degraded ones, or split into two lists) |
| 2 | `scripts/check-spend-guard.mjs:31,52` | STRUCTURAL (undeclared) | `MASK_FILES`/`GATED_FILES` are hardcoded arrays. Confirmed by grep: `app/api/places/details/route.js`, `app/api/places/autocomplete/route.js`, and `app/api/sources/compare/route.js` all call Google Places APIs directly and are in **none** of the arrays — the exact shape of the real $1,878.92 August 2026 overspend, still open today. | replace both arrays with a recursive walk of `app/api/**/route.js` for `/places\.googleapis\.com/`, require `spendGate`/field-mask discipline in every file the walk finds |
| — | `scripts/test-rail-score-order.mjs` | was STRUCTURAL, scoped to 2 files | **FIXED this audit** — see below | — |
| — | `scripts/check-cache-refresh.mjs` + `scripts/test-cache-refresh.mjs` | was STRUCTURAL, pure regex proof of an unexecuted route | **FIXED this audit** — see below | — |
| — | `scripts/test-coverage-waitlist.mjs` | was STRUCTURAL, substring-not-role | **FIXED this audit** — see below | — |
| 3 | `scripts/test-booking-integrity.mjs:61` | CALL, one unproven absence | `ok(!/verifiedOffers\|bookingResolver\|.../.test(src), ...)` — the exact regression lock CLAUDE.md names for the Dalí→Barcelona wrong-geo bug — has no fixture proving the regex can still catch a real violation; a future refactor could silently rename an identifier out of the alternation and this would go permanently green. | add one throwaway string containing e.g. `"bookingResolver"` and assert the same regex flags it, before asserting it doesn't on the real files |
| 4 | `scripts/check-hydration-style.mjs:12` | STRUCTURAL (undeclared) | bare `<style>{` substring match, zero tolerance for an attribute (`<style jsx>{`) or whitespace; no same-file positive control proving the probe fires on anything | `/<style[\s>]/` + a literal-fixture control |
| 5 | `scripts/check-unified-commerce-rail.mjs:5,20` | STRUCTURAL (undeclared) | the 3 checked surfaces (`IntentPageClient.js`, `IntentPartnerPick.js`, `home.js`) are `process.argv` **defaults**, not a discovered set — a 4th sheet/browse surface mounting `<IntentPartnerPick>` is invisible to this guard | glob `app/**/*.js` for `<IntentPartnerPick\b` mounts instead of 3 hardcoded defaults |
| 6 | `scripts/check-direct-affiliate-urls.mjs` | STRUCTURAL (undeclared) | recursive walk is well-scoped, but the guard has never been proven capable of turning red — no fixture with a known-bad raw affiliate URL | add + delete a throwaway fixture file with a raw URL, assert the walk flags it |
| 7 | `scripts/check-promote-spend-gate.mjs:52` | CALL, 2 unproven absences | `ok(/\bspendAllow(Capped)?\s*\(/.test(src), ...)` on the metered-call gate has no fixture proving the regex can catch an ungated call | same pattern as #6 |
| 8 | `scripts/check-commerce-redirect.mjs:86` | CALL, 2 unproven absences | `ok(!/\[/.test(FALLBACK), ...)` — guards against a literal `[bracket]` placeholder leaking into the fallback redirect path, never proven to fire on one | same pattern as #6 |
| 9 | `scripts/test-card-booking.mjs` | STRUCTURAL (undeclared) | locks the booking-integrity "verified product or no button" rule (the same lane CLAUDE.md calls out by name) via `readFileSync` + scoped regex only — real invariant, no declared STRUCTURAL-ONLY tag, no proof the extracted `PlaceCard` block still exists after a refactor beyond `findIndex` succeeding | add `// STRUCTURAL-ONLY:` declaring why (no executable seam for a client component's booking-button branch without a full render harness) so the debt is visible, or port to the RENDER pattern `test-detail-render-smoke` already uses |
| 10 | `scripts/test-sheet-booking.mjs:33` | STRUCTURAL (undeclared), count-blind | `.length >= 2` — passes at 2, 3, or 200 occurrences; the real invariant ("primary AND list variant both call it, exactly once each") isn't what's asserted | assert the exact expected count, or assert once per named call site |
| 11 | `scripts/check-guide-cta-honesty.mjs:221` | CALL, 1 unproven absence | protects the exact "promised tickets, got a search page" bug CLAUDE.md documents (0/20 click-through), but the em-dash/colon absence probe has no positive-control fixture | same pattern as #6 |
| 12 | `scripts/check-cost-gate.mjs` | STRUCTURAL (undeclared) | 27-line regex-only check on a cost-sensitive gate, no declared reason it can't execute the real gate function | either declare `STRUCTURAL-ONLY` or import `lib/spendGate.js` and assert on a real call (pattern already proven by `check-spend-effective-cap.mjs`) |
| 13 | `scripts/test-city-gate.mjs` | STRUCTURAL (undeclared) | regex-only, undeclared | declare or convert to a CALL guard against the real gate function |
| 14 | `scripts/check-geo-gated-boosts.mjs` | STRUCTURAL (undeclared) | regex-only, undeclared | declare or convert |
| 15 | `scripts/check-price-badge.mjs` | STRUCTURAL (undeclared) | regex-only, undeclared | declare or convert |
| 16 | `scripts/check-spend-effective-cap.mjs` | CALL, 3 unproven absences | otherwise a strong guard (dynamic-imports `lib/spendGate.js`, asserts on real `effectiveCap()` return values) — the only gap is 3 error-message-string absence checks with no fixture | same pattern as #6, lowest severity of this list |
| 17 | `scripts/test-booking-resolve-extraction.mjs` | CALL, 4 unproven absences | 4 absence checks (e.g. no bare `react` import) with no positive control | same pattern as #6 |
| 18 | `scripts/check-doc-ownership.mjs` | flagged DECORATIVE by the analyzer | **judged a false positive on manual read** — real guard, 18 `execFileSync("git", …)` calls, branches on stdout/exit throughout via an `if (!result.ok) fail(...)` idiom. The analyzer's derived-value tracer only follows single-line `const x = call(...)` assignments; every call here goes through a local multi-line `git(...args)` wrapper, so the tracer never connects `inside.ok`/`.out` back to the `execFileSync` call inside it. Left un-"fixed" — the guard doesn't need it — and ledgered honestly as an analyzer limitation, not guard debt. | improve `derivedReturnedValueNames` to see through single-hop wrapper-function definitions (future analyzer work, not a guard fix) |
| 19 | `scripts/check-guide-share.mjs` | CALL, 3 unproven absences | 3 absence checks, no fixture | same pattern as #6 |
| 20 | `scripts/check-editorial-everywhere.mjs` | CALL, 5 unproven absences | the most absence checks of any single CALL guard in the ledger (5), none with a positive control | same pattern as #6, batched across 5 probes |

## The 3 fixed (red-proved)

Per the work order, only these 3 were fixed — smallest, highest-confidence, prefer CALL/
RENDER. Every mutation below was applied with a Python script that `assert`ed its target
text existed before replacing it (never `sed`, which silently no-ops on a non-match), and
printed the diff. Full `node scripts/run-guards.mjs; echo rc=$?` was re-verified green after
each restore.

### Fix 1 — `scripts/test-rail-score-order.mjs` (disease a: scoped-by-name)

**Was:** hardcoded to check exactly `["app/home.js", "app/components/IntentPartnerPick.js"]`
for the banned pre-sort formula.

**Now:** dynamically walks all of `app/`, finds every file whose comment-stripped source
calls `experienceWayfindScore(` or `rankExperiences(` (`callers.length >= 5` discovery
floor), and runs the banned-formula check across every discovered file. Discovers 9 real
call sites today (`BookingCTA.js`, `FoodTourRail.js`, `HomeAffiliateActivityRail.js`,
`IntentPartnerPick.js`, `SummerPicksRails.js`, `TourStrip.js`, `ViatorRail.js`,
`screens/Events.js`, `app/home.js`), 16 assertions, green.

**Red-prove:** mutated `app/components/ViatorRail.js` to re-sort with the exact banned
formula. New guard failed correctly (`rc=1`) — the old 2-file guard would have missed this
entirely, since `ViatorRail.js` was never in its list. File restored; guard re-verified
green (`rc=0`).

### Fix 2 — `scripts/check-cache-refresh.mjs` (disease f: pure-function proof of a mechanism that may not run)

**Was:** 100% `readFileSync` + regex over `lib/serverCache.js` and the refresh route —
proved the pure helper functions were internally consistent, never proved the route handler
that wires them together actually runs or gates on `WAYFIND_GATE`.

**Now:** loads and calls the real `app/api/places/refresh/route.js` `GET` handler (via
`scripts/lib/jsxLoad.mjs`'s `loadComponent`, extended with a real `next/server` polyfill
built on Node's native `Response`/`Request`) with `WAYFIND_GATE` set to `shut`, `free`, and
unset, plus bad-params and key-mismatch cases — asserting on the actual returned JSON body
each time. 11 live-call assertions + source checks, green.

**Red-prove:** mutated the route's `if (gateShut() || gateFree())` short-circuit to
`if (false && (...))`. Guard failed correctly (`rc=1`) with the exact message about the gate
no longer returning its `skipped` shape. Restored; re-verified green (`rc=0`).

### Fix 3 — `scripts/test-coverage-waitlist.mjs` (disease b: substring-not-role)

**Was:** whole-file substring checks (`includes(...)`) for waitlist copy that could pass
even with the real `CoverageWaitlist` component deleted, as long as a matching phrase
existed anywhere else in `app/home.js`.

**Now:** extracts the actual `function CoverageWaitlist(...)` body via a brace-balanced
walk, and scopes every assertion to inside that extracted body (plus a
`// STRUCTURAL-ONLY:` tag noting it's an unexported local function with no import seam).

**Red-prove (double):** first against the ORIGINAL guard — deleted the real copy and left
an unrelated "won" substring elsewhere in the file; the old guard passed 6/6 anyway,
proving the vulnerability. Then the same mutation against the FIXED guard: correctly failed
(`rc=1`). File restored; guard re-verified green (`rc=0`).

## The meta-guard — `scripts/check-guard-honesty.mjs`

Added to `scripts/guards.txt` (last position) so it runs on every prebuild going forward.
Fails the build on any guard **not already in the ledger** that:

1. has no `lib/`/`app/` import, no render harness, no child-process exec, **and** no
   `// STRUCTURAL-ONLY: <reason>` in its first 20 lines;
2. asserts an absence with no same-file positive control;
3. has real import/render/exec capability but zero assertions on a value code actually
   returned.

Pre-existing offenders are grandfathered in `scripts/lib/guard-honesty-known-weak.json` —
**189 entries**, each with a one-line reason (including `check-doc-ownership.mjs`, ledgered
honestly as an analyzer limitation rather than mislabeled guard debt). The ledger is a debt
tracker, not a to-do list: it may only shrink (a real fix, or a corrected false positive) or
grow via a reviewed diff adding a dated, reasoned entry — never via bulk regeneration. The
KNOWN_WEAK count prints on every run, both success and failure.

**Red-proved:** added a scratch guard (`x !== "always true"` — no import, no render, no
exec, cannot fail) to `scripts/guards.txt`; the meta-guard correctly failed (`rc=1`,
naming the file and the exact violated rule). Removed the scratch guard and its line;
meta-guard returned to green (`rc=0`, `507 guard(s) analyzed`, `189 grandfathered, 189 still
match their reason`).

## Known pre-existing failure (not touched)

`scripts/check-rail-card-fits-its-content.mjs` is recorded, per the work order, as a known
pre-existing red guard on `origin/main` with a fix already in an open PR — out of scope for
this audit, not modified.

## Limitations of this audit

- The analysis engine is a heuristic over source text, not a real parser — it has a known
  false positive (`check-doc-ownership.mjs`, explained above and in the ledger) and likely
  has others not caught by manual spot-checking.
- 189 ledgered guards were *not* individually verified as true positives by a human for
  every entry — the ledger reasons are the analyzer's own violation text, machine-generated
  per file. The 20 guards above (17 open + 3 fixed) were the ones read in full and verified
  by hand.
- STRUCTURAL is not inherently a defect — most of the 143 are reasonable regex checks that
  simply haven't been asked to declare themselves; the meta-guard now makes that declaration
  mandatory going forward for anything new.
