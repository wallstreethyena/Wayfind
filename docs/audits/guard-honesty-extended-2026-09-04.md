# Guard-honesty audit, extended — 2026-09-04

Owner's mandate: extend the same-day `docs/audits/guard-honesty-2026-09-04.md`
audit (three failure classes, on branch `ship/audit-trio-2026-09-04`, still
unmerged) across **nine** classes, repo-wide. This is an audit: the
deliverable is a truthful census plus three fixes proven by red-prove, not a
rewrite of the guard suite. Nothing existing was weakened to go green — a red
finding below is reported red where it stayed red.

**Method.** `scripts/lib/guardHonestyAnalysis.mjs` — the prior audit's
static-analysis engine — is copied into this branch (the branch that built it
is unmerged, so it does not exist on `main`) and reused directly for classes
3, 4 and 5, exactly as instructed. It is a heuristic over source text, not a
parser: it has a known desync bug on **nested template literals**
(`` `${…`nested`…}` ``), found and characterized during this audit (see class
1). New, narrower scanners were written only where the existing engine's
questions didn't match the work order's — they live in `scripts/audit/` as
census tools, **not wired into prebuild**. Every number below states its
false-positive/false-negative surface; several were spot-checked by hand and
that check's yield is reported honestly, including where most automated hits
did not survive review.

---

## Class-by-class census

### 1. Guards that CANNOT FAIL

**Method:** `scripts/audit/class1-cannot-fail-scan.mjs` — comment/string-
stripped source, flags (a) a file with no reachable path to a non-zero exit
anywhere (`process.exit(<positive literal, variable, or ternary>)`,
`process.exitCode = <positive>`, `throw`, or `assert(...)`/`assert.*(...)`
all absent), (b) a tautological `ok(true, …)` / `ok(x || true, …)` argument,
(c) an empty `catch {}` block.

**Raw hits:** 27 of 523 guard files (4 NO-FAIL-PATH, 23 EMPTY-CATCH, 1 file
in both buckets).

**Manual review — and this is where most of the automated signal died:**

- **4/4 NO-FAIL-PATH reviewed by hand → 1 real, 3 false positives.** The 3
  false positives (`scripts/test-beach-water.mjs`, `scripts/check-skeleton-
  has-a-voice.mjs`, `scripts/check-provider-redirects.mjs`) all use `ok(`
  bound to a real failure path (`import { ok } from "node:assert"`, or a
  local `ok()` that increments a counter checked by a later
  `process.exit(1)`/`if (fails) …`) — but the tokenizer desyncs on a nested
  template literal earlier in each file (`` `<table>${rows.map(...=> `<tr>…`)
  .join("")}</table>` `` in `test-beach-water.mjs` is the exact shape) and
  everything after reads as inside one giant misclassified string, hiding
  the real `process.exit(1)` from the scan. **This is a genuine, reproducible
  limitation of the shared analyzer** (it treats backtick strings as simple
  quote-delimited spans with no `${…}` awareness), not a limitation specific
  to this audit's new scanner. Filed as a backlog item, not fixed here — it
  is upstream, shared infrastructure.
- **16/23 EMPTY-CATCH spot-checked by hand → 0 real, 100% false positive.**
  Every one reviewed (`check-card-action-parity.mjs`,
  `check-commerce-redirect.mjs`, `check-copy-no-empty-hype.mjs`,
  `check-vendor-tag-cannot-throw.mjs`, `check-rail-rank-law.mjs`,
  `check-headers.mjs`, `check-experiences-link-health.mjs`,
  `check-datenight-rail-uncropped.mjs`, `test-card-action-row.mjs`,
  `check-home-answer-first.mjs`, `check-rail-card-fits-its-content.mjs`,
  `check-rail-card-width-is-global.mjs`, `check-intent-partner-picks.mjs`,
  `check-guide-product-resolution.mjs`, `check-share-card.mjs`,
  `check-viator-redirect-layer.mjs`) is a legitimate non-assertion side
  effect wrapped in `try/catch{}` — temp-file cleanup
  (`rmSync`/`unlinkSync`), an optional-file read with a fallback default, a
  browser-executable probe that returns `null` on failure (handled by the
  caller), or a sentinel-default pattern (`let out = "THREW"; try { out =
  await fn(); } catch {}` — the exception IS captured, as the unchanged
  sentinel). **This heuristic's false-positive rate in this codebase is
  effectively 100%** — engineers here systematically separate
  cleanup/fallback try/catch from the actual `ok()`/`fail()` assertions, so
  "empty catch exists" is not a useful signal on its own here. Reported for
  completeness, not counted as a finding.
- The existing `scripts/check-guards-can-fail.mjs` (already wired, already
  green) independently covers the tautological-`ok()` sub-case with a
  same-file positive/negative-shape check; it found 0 live tautologies,
  consistent with this scan.

**Confirmed count: 1.** `scripts/check-env.mjs:32` — `process.exit(0)` ran
unconditionally regardless of what the env checks found, including
`NEXT_PUBLIC_VIATOR_PID` (CLAUDE.md's own named revenue-critical var: unset
means every Viator CTA silently loses attribution, green build). **FIXED —
see Fix 2 below.**

---

### 2. Guards that EXIST BUT ARE NOT WIRED

**Method:** `scripts/check-guard-manifest.mjs` (already exists, already
wired first in `scripts/guards.txt`) enumerates every `scripts/{check,test}-
*.mjs` on disk and asserts it is either reachable from `scripts/guards.txt`
(directly, or via an `npm run <script>` line) or declared in a small,
reasoned `EXCLUDED` map. Reused rather than rebuilt, per the work order.

**On this run: 525 guard-shaped files, 519 wired, 6 excluded with reasons, 0
orphans, 0 ghosts.** Structurally clean — this specific failure mode (a file
that exists and is simply never listed anywhere) does not currently occur.

**The real gap was one level deeper: are the 6 EXCLUDED reasons TRUE?** Each
one claims an alternate place the guard runs — manually verified all 6
against actual CI (`.github/workflows/*.yml`) and `package.json`:

| excluded guard | claimed alternate | verified? |
|---|---|---|
| `check-bundle.mjs` | `npm run audit:regression`, also `postbuild` + `guards.yml`'s explicit "Homepage bundle ratchet" step | **TRUE** — postbuild + guards.yml both call it for real |
| `check-headers.mjs` | `npm run audit:regression` | **FALSE.** Nothing invokes `audit:regression` automatically — no workflow, no cron, no other script references it. This production security-header gate (CSP, HSTS, X-Frame-Options, nosniff) has never run except by someone typing the command by hand. **Not fixed — backlog #1.** |
| `check-moment.mjs`, `check-ux.mjs` | none claimed — explicitly marked STALE, deliberately unwired pending triage | honest, not a finding |
| `check-inventory-integrity.mjs` | "runs in the scheduled canary workflow… `.github/workflows/canary.yml`" | **FALSE at the time of this audit.** `.github/workflows/canary.yml` did not exist. The file lived at `ops/canary.workflow.yml`, "parked" there per `ops/README-canary.md` because the available credential lacked the `workflow` OAuth scope GitHub requires to push a new file under `.github/workflows/`. GitHub Actions only runs workflow files at that exact path — this three-job workflow (production route contract, inventory integrity, promote-metros drift, on a 30-minute clock) **never ran once**, on any push or any tick, for however long it sat parked. **FIXED — Fix 1 below.** |
| `check-promote-metros-live-drift.mjs` | same canary-workflow claim | same finding, same fix |

**2 of 6 EXCLUDED reasons (33%) pointed at a wiring path that did not exist.**
Small n, high value: the canary-workflow gap is the single largest finding
in this entire audit — it is simultaneously a class-2 finding (unwired) and
a class-9 finding (cron liveness + production render/data verification had
**zero** live coverage). See Fix 1.

---

### 3. Guards that ONLY GREP THEIR OWN SOURCE (STRUCTURAL)

**Method:** reused `guardHonestyAnalysis.mjs`'s capability detector
(`detectCapabilities`) via `scripts/audit/census.mjs` — a guard is STRUCTURAL
if it contains no `lib/`/`app/` import (static or dynamic), no render
harness (jsxLoad, ReactDOMServer, Playwright/Puppeteer/JSDOM), and no
child-process exec.

**145 of 517 analyzed guards (28%) are STRUCTURAL, all 145 currently
undeclared** (no `// STRUCTURAL-ONLY: <reason>` tag — that convention exists
only on the unmerged `ship/audit-trio-2026-09-04` branch, not yet adopted on
`main`).

**False-positive surface:** the capability detector can miss a guard that
executes code through an unusual seam (the original audit's own example:
copying a `lib/` file to a temp dir, then `await import()`-ing the copy —
`READS_LIBAPP_SOURCE_RX` handles that one known shape, but not novel ones).
Spot-checked 5 STRUCTURAL hits by hand (`check-hydration-style.mjs`,
`check-copy.mjs`, `check-anchors.mjs`, `check-radius.mjs`,
`check-lodging.mjs`) — all 5 are genuinely regex-over-source with no
execution path, confirming the classification on that small sample. **STRUCTURAL is not inherently a defect** (per the prior audit's own framing)
— it is undeclared debt, not automatically 145 bugs. The highest-value
STRUCTURAL findings are named in the class-8/9 sections below where they
overlap a real invariant.

---

### 4. Guards whose POSITIVE CASE is never tested

**Method:** `scripts/audit/class4-only-negative-scan.mjs` — scoped
deliberately to the same `.test(...)`/`.includes(...)` idiom class 5 already
parses: a file is flagged if every such occurrence in it is negated
(`!X.test(...)`) and none is a bare presence check.

**Automated result: 0 of 517.** Every guard using this idiom demonstrates at
least one acceptance case in the same idiom. **This is a narrow, honest null
result, not a clean bill of health** — the scan is blind to a guard whose
positive case is proven via `===` equality or a rendered-DOM assertion
instead (the majority pattern in this repo's CALL/RENDER guards), so a real
class-4 instance outside the `.test/.includes` idiom would not be caught.

**Manual spot check (3 files, drawn from the class-5 list below):**
`check-location-fail-open.mjs` proves both the empty-rail-live path (positive:
does the real code call `emptyRailLive()`/set `covered:false`) AND two
absence claims (no "keep the flagship" copy, no bare `<CityGate>`); the
positive claims are exercised, the two absence claims are the ones flagged
under class 5. `check-editorial-everywhere.mjs` and
`check-cron-honesty.mjs` show the same shape: real acceptance assertions
alongside a handful of unproven-absence checks. **In this small sample,
class 4 in the strict "only ever proves rejection" sense did not occur** —
the guards that have any negative assertions also have positive ones; the
open question these files raise is class 5 (below), not class 4. Given the
narrow automated signal and the small manual sample, this class is reported
as **the least-verified of the nine** — a broader semantic pass (equality
and rendered-output assertions, not just `.test/.includes`) is the honest
next step, tracked in the backlog.

---

### 5. Guards whose NEGATIVE CASE is never tested (unproven absence)

**Method:** `guardHonestyAnalysis.mjs`'s `unprovenAbsenceChecks` — an absence
claim (`!X.test(subject)`, or the inverse polarity for the `if (cond)
fail(...)` idiom) with no same-file positive control (the same pattern
exercised, non-negated, against a real or literal-fixture subject) and no
prose control ("positive control" / "known-good" / "sanity check" language).

**68 files, 130 total unproven-absence probes.**

**Same method and false-positive surface the original 2026-09-04 audit
documented** — this is not a new engine, it is the same one, run against
today's `main`. Top of the list by probe count:
`scripts/test-dynamic-daily.mjs` (5), `scripts/check-editorial-everywhere.mjs`
(5), `scripts/check-location-fail-open.mjs` (5),
`scripts/test-sentry-lazy.mjs` (4), `scripts/test-eat-ssg-failsoft.mjs` (4),
`scripts/test-booking-resolve-extraction.mjs` (4),
`scripts/test-experience-now-rank.mjs` (4), `scripts/check-cron-honesty.mjs`
(4).

**Manual spot check (3 of the top 8):** all three are otherwise strong
CALL-style guards (real imports, real assertions on returned values) with a
handful of absence checks mixed in that lack a proven-reachable probe — not
broken guards, but real, fixable gaps of the exact shape CLAUDE.md's own
`test-booking-integrity.mjs:61` example describes (the Dalí→Barcelona
regression lock: `ok(!/verifiedOffers|bookingResolver|.../.test(src), ...)`
has no fixture proving the regex can still catch a real violation). Not
fixed in this pass (class-9's ranking put the canary/spend-gate/env findings
ahead of these); full list is in the backlog.

---

### 6. Guards that SILENTLY DOWNGRADE serious failures to warnings

**Method:** no single clean automated signal exists for this class (the
work order names three different shapes: console.warn/log on a load-bearing
invariant, non-zero findings that still exit 0, and known-weak/skip lists
that quietly absorb failures) — each was checked by a targeted, different
method.

- **console.warn/findings-but-exit-0:** every guard file using
  `console.warn` was checked for at least one reachable non-zero exit
  anywhere in the file — **0 files** have `console.warn` with zero paths to
  failure at all. This does not prove the *specific* warned condition is
  wired to that failure path (a counter that increments but is never
  checked before `process.exit` would slip through this check, and tracing
  that generally requires real control-flow analysis this audit did not
  build) — stated as a limitation, not swept under a clean number.
- **The sharpest, confirmed instance of this class is `check-env.mjs`
  itself** — the same file as the class-1 finding. `ENV WARNING
  NEXT_PUBLIC_VIATOR_PID is not set … revenue silently stops` printed to the
  build log and the build finished green regardless — a serious,
  CLAUDE.md-named revenue invariant, downgraded to a warning nobody reads,
  unconditionally. **FIXED as one finding, Fix 2 below** (the class-1 and
  class-6 fix are the same code change).
- **Known-weak/skip-list scan:** grepped every guard for
  `KNOWN_WEAK|KNOWN_ISSUES|ALLOWLIST|SKIP_LIST|LEGACY_OK|GRANDFATHER|
  IGNORE_LIST|EXEMPT` — 44 files. Spot-checked the two highest-stakes ones by
  hand: `scripts/check-guard-hermeticity.mjs`'s `EXEMPT` map (9 entries, each
  argued in ≥30 characters, each entry's continued applicability
  self-checked by the guard itself — a genuinely good pattern, not a
  finding) and `scripts/check-metered-matcher.mjs`'s `EXEMPT` map (3 entries,
  same shape, each reasoned — including the `sources/compare` exemption,
  which is legitimate for THAT guard's abuse-protection purpose and is a
  *different* protection layer from the spend-gate kill switch Fix 3 closes
  below). **Neither absorbs a real failure silently** — both are the
  documented-exemption pattern working as designed. The remaining 42 were
  not individually reviewed; flagged as backlog for a full pass.

---

### 7. Guards that DEPEND ON THE DEVELOPER'S LOCAL ENVIRONMENT

**Method:** `scripts/check-guard-hermeticity.mjs` already exists, is wired,
and is reused directly (its own self-tests were re-run, unchanged, and still
pass). Read in full for this audit rather than re-derived.

**What it actually covers, confirmed by reading its source:** `process.env`
reads that could decide a verdict — writes (`process.env.X =`), deletes, and
spreads into a **child** process's env are all allowed (a test stating its
own precondition); a bare read is not, unless the file is in its 9-entry
`EXEMPT` map with an argued reason. **37 assertions, 524 guards scanned, 9
exemptions, 0 unhermetic reads on this run.**

**What it does NOT cover** (its scope is explicitly `process.env` only, per
its own header comment) — checked separately, this audit:

- **Wall-clock time** (`Date.now()`/`new Date()` deciding a verdict): grepped
  24 files containing either literal. **Manually reviewed all matches that
  were not inside a regex/string being tested against APP code** (several,
  e.g. `check-sitemap.mjs`, are guards asserting the REAL code doesn't call
  `new Date()` for a timestamp — a legitimate STRUCTURAL check, not the
  guard's own verdict depending on the clock). Zero of the 24 were found to
  make the GUARD's own pass/fail depend on today's real date rather than a
  fixed fixture date. Not exhaustive — a control-flow trace analogous to
  `ambientReads()` but for `Date.now()`/`new Date()` is the honest way to
  make this a real, standing guard; recommended as a direct extension of
  `check-guard-hermeticity.mjs`, tracked in the backlog.
- **`.next` build artifacts:** 6 files reference `.next/`; not individually
  reviewed this pass (time-boxed out).
- **`node_modules` presence:** 46 files reference it — the large majority are
  legitimate (`test-map-worker.mjs` deliberately reads the installed
  `maplibre-gl` version, because ITS ENTIRE JOB is proving the vendored
  worker file matches what's installed — see the "environment gap, not a
  repo bug" note below). Not individually reviewed beyond that.
- **Network calls:** 0 files matched a bare `fetch("https://…")` to a
  non-localhost host outside the credentialed-guard pattern already handled
  by `scripts/lib/guardEnv.mjs` — this specific grep came back clean,
  though guards that build a URL from a variable rather than a literal are
  invisible to it (false-negative surface).
- **File ordering:** 73 files call `readdirSync(...)` without a visible
  `.sort(...)` nearby — not reviewed individually; a real risk in principle
  (`readdirSync` order is filesystem-dependent, not guaranteed) but this
  audit did not find or confirm a live instance of it deciding a verdict.

**Honest summary for class 7:** the process.env layer is solid and actively
enforced. The other four dependency shapes the work order names are
**unswept** — `check-guard-hermeticity.mjs` does not claim to cover them and
neither does this audit's spot-checking, beyond the wall-clock pass, which
found nothing live. Recommended backlog item: extend
`check-guard-hermeticity.mjs` itself (same file, same self-test discipline)
to add a `Date.now()`/`new Date()` detector as a second, parallel rule —
the architecture is already built for exactly this shape.

One incidental, real finding surfaced while verifying the final green run
(reported here because class 7 is where "the shell decides the answer"
lives, even though the mechanism is different): `scripts/test-map-worker.mjs`
initially failed in this audit's sandbox with `maplibre-gl is installed` /
`byte-identical to maplibre-gl@6.7.0`. This was **not a repo defect** — it
was traced to `node_modules/maplibre-gl` being absent from this sandbox's
initial state (an environment-setup gap, confirmed reproducible on an
untouched `origin/main`) and resolved cleanly by `npm ci` (which installs
the exact `package-lock.json`-pinned `6.0.0`) followed by `npm run
sync:maplibre`, with zero resulting diff to any tracked file. Not a finding
against the guard — it is exactly what the guard is *supposed* to catch
when the vendored copy and the installed package diverge, and it worked.

---

### 8. DUPLICATE guards giving false confidence

**Method:** manual review, informed by CLAUDE.md's own explicit warning that
per-surface guards with similar names (card vs. sheet vs. guide booking CTAs)
are usually real, complementary coverage — not duplication — so a name-based
sweep would misreport. Checked instead for guards asserting the identical
invariant against the identical file.

**One confirmed, real overlap:** `scripts/check-cost-gate.mjs` and
`scripts/check-spend-guard.mjs` (post-fix) both read
`app/api/places/search/route.js` and both assert
`WAYFIND_GATE`/`gateShut()` is present. Neither is redundant outright —
`check-cost-gate.mjs` uniquely asserts the gate check runs BEFORE the paid
`places:searchText` fetch (string-index ordering), which
`check-spend-guard.mjs` does not check on ANY of the 8 routes it now
discovers, including the 3 this audit just gated (Fix 3). A reviewer seeing
both green reasonably assumes "spend-gate wiring AND ordering are both
covered everywhere" — only `search/route.js` gets the ordering check; the
other 7 discovered `places.googleapis.com` callers (including the 3 fixed
here) have presence-only verification. **Not fixed in this pass** (tracked
below) — the smallest real fix is extending `check-cost-gate.mjs`'s ordering
check (or porting its logic into `check-spend-guard.mjs`'s discovery loop)
to run against every discovered `googleCaller`, not just `search/route.js`.

**44 files carry an EXEMPT/ALLOWLIST/KNOWN_WEAK-shaped construct** (see class
6) — these are a DIFFERENT thing from class-8 duplication (an exemption list
inside ONE guard, not two guards asserting the same fact) and are not
double-counted here.

**Everything else checked (env-var guards, booking/CTA guards across
card/sheet/guide surfaces) turned out to be genuinely complementary per-file
or per-surface coverage, not duplication** — consistent with CLAUDE.md's own
documented lesson from 2026-07-30 (four guards asserting "this string
appears in this file" each covering a DIFFERENT file/surface is real
coverage, not four copies of one check). This class was, on the evidence
gathered, mostly a non-issue in this repo by design — the one confirmed
overlap above is real but narrow.

---

### 9. CRITICAL FUNCTIONALITY WITH NO GUARD AT ALL

Worked top-down from the work order's named list. For each: the invariant,
whether ANY guard asserts it, and the verdict.

| invariant | guard coverage | verdict |
|---|---|---|
| **cron / production liveness** | `.github/workflows/guards.yml` (pre-merge, real) + the canary workflow — **which did not exist at the path GitHub reads until this audit** | **WAS UNGUARDED IN PRODUCTION.** Fixed — Fix 1. |
| **spend gate (Google Places)** | `check-spend-guard.mjs`, `check-cost-gate.mjs`, `check-spend-effective-cap.mjs`, `check-promote-spend-gate.mjs` — extensive, but 3 real routes (`places/details`, `places/autocomplete`, `sources/compare`) called `places.googleapis.com` with **zero** gate wiring, invisible to the hardcoded arrays those guards read | **WAS PARTIALLY UNGUARDED** (3 of 8 real call sites). Fixed — Fix 3. |
| **affiliate / booking attribution** | Extensive: `check-booking-cta.mjs`, `test-booking-resolver.mjs`, `check-untracked-affiliate-links.mjs`, `check-monetized-degrade.mjs`, `test-travelpayouts.mjs`, `check-commerce-redirect.mjs`, `test-shell-key-*`, `check-coupon-link-attribution.mjs`, and ~15 more, most RENDER/CALL grade | **Guarded, well.** No gap found in this pass. |
| **place-card data integrity** | `check-cards.mjs`, `test-card-gate.mjs`, `check-card-memo.mjs`, `check-place-card-css-contract.mjs`, `test-place-card-hook.mjs` | **Guarded.** |
| **rails rendering / ranking** | `check-rail-rank-law.mjs` (RENDER-grade, CALL on 8 real composer exports), `test-home-rails-render-smoke.mjs` (RENDERS 4 real rail components across 21 prop shapes) | **Guarded, strongly** — this pairing is exactly the "assert on the call, render the component" doctrine CLAUDE.md's own #486 postmortem prescribes. |
| **event date honesty** | `check-event-date-honesty.mjs`, `check-events.mjs`, `check-business-events.mjs` | **Guarded.** |
| **outbound link safety** | `check-links.mjs` (single validated source), `test-links.mjs` (safeUrl rejects javascript:/data:/file:, accepts http(s)), `check-untracked-affiliate-links.mjs` | **Guarded.** |
| **mobile rendering (390px)** | Extensive real-viewport Playwright coverage: `check-rail-card-fits-its-content.mjs`, `check-rail-card-width-is-global.mjs`, `check-no-sideways-scroll.mjs`, `check-mobile-poster-fit.mjs`, `test-card-action-row.mjs` (all measure at 390×844, per CLAUDE.md's own iframe-rendering standard) | **Guarded, well** — CLAUDE.md's 2026-07-30 mobile-verification lesson visibly took. |
| **the spend-gate's own ORDERING** (gate-before-pay, not just gate-present) on discovered call sites beyond `search/route.js` | Only `check-cost-gate.mjs`, only on `search/route.js` | **Partially unguarded** — see class 8. Backlog, not fixed. |
| **the canary workflow's own re-parking** | now: `check-canary-workflow-installed.mjs` | **Guarded** (this audit — the fix carries its own regression lock). |

**Top 5 unguarded invariants, ranked by what breaks if they silently fail again:**

1. **Cron/production liveness (canary workflow).** If this regresses again —
   moved back to `ops/`, edited to drop a job, or the whole file deleted —
   nothing else in the repo would notice: the pre-merge suite is
   structurally blind to render facts and live data (CLAUDE.md's own
   2026-08-20 measurement: 420 guards, 5 render, 2 gate a deploy). **Fixed,
   with its own regression lock** (`check-canary-workflow-installed.mjs`).
2. **Spend-gate coverage on newly-added Google Places call sites.** Any
   future `app/api/**/route.js` that calls `places.googleapis.com` without
   `gateShut()` reproduces the exact $1,878.92 incident shape. **Fixed, with
   its own regression lock** (the discovery walk in `check-spend-guard.mjs`
   now covers every future route automatically, not just the ones a human
   remembers to list).
3. **Revenue-critical env var absence in REAL production builds.**
   `NEXT_PUBLIC_VIATOR_PID` unset on an actual Vercel production build now
   fails the build instead of printing an unread log line. **Fixed.**
4. **Spend-gate ORDERING beyond `search/route.js`.** A future edit that
   moves `gateShut()` after the paid fetch in `places/details`,
   `places/autocomplete`, or `sources/compare` would still read as
   "gated" by `check-spend-guard.mjs`'s presence-only check. **Not fixed —
   top of the backlog.**
5. **`check-headers.mjs` (production security headers: CSP, HSTS,
   X-Frame-Options, nosniff, `x-powered-by` absence) has no live wiring at
   all.** Its only invocation path (`npm run audit:regression`) is never
   called by anything automated. **Not fixed — backlog #2**, alongside the
   remaining 42 unreviewed EXEMPT/ALLOWLIST-shaped lists (class 6) and the
   130 unproven-absence probes across 68 files (class 5).

---

## The 3 fixed (red-proved)

Ranked by money/trust exposure, per the work order — not by finding count.
Every mutation below was applied with a Node script that asserted its
target text existed before replacing it (never `sed`), printed exactly what
changed, and restored the original byte-for-byte before re-verifying green.
Scripts live in `scripts/audit/redprove-*.mjs` for reproducibility.

### Fix 1 — the canary workflow was never installed (class 2 + class 9, cron liveness)

**Was:** `.github/workflows/canary.yml` did not exist. The file lived at
`ops/canary.workflow.yml`, parked there because the credential available at
authorship time lacked the `workflow` OAuth scope GitHub requires. Three
real guards (production route contract E2E, `check-inventory-integrity.mjs`,
`check-promote-metros-live-drift.mjs`) had never run on a schedule or a push.

**Now:** `git mv ops/canary.workflow.yml .github/workflows/canary.yml`.
Added `scripts/check-canary-workflow-installed.mjs` (wired into
`scripts/guards.txt`, runs on every future prebuild) asserting: the file
exists at the path GitHub Actions actually reads; it carries a real
`schedule: - cron:` trigger, not just `workflow_dispatch`; all three `run:`
lines still point at the real spec/scripts (matched on the literal command,
not just a job name); every `scripts/*.mjs` it names still exists on disk;
and no stray parked copy survives at the old path.

**Red-prove:** `scripts/audit/redprove-canary-installed.mjs` moved the
installed file back to `ops/canary.workflow.yml` (the exact pre-fix
regression), ran the guard — `rc=1`, correctly caught — restored the file
byte-for-byte (verified), guard green again (`rc=0`).

### Fix 2 — `check-env.mjs` could never fail, on any machine, for any reason (class 1 + class 6)

**Was:** every env check ended in an unconditional `process.exit(0)`. A real
Vercel production build with `NEXT_PUBLIC_VIATOR_PID` unset or set to a
Vercel-redacted `[SENSITIVE]` placeholder printed `ENV WARNING … revenue
silently stops` and shipped green — CLAUDE.md's own named incident.

**Now:** the logic moved to `lib/envRevenueGate.js` (`ENV_CHECKS`,
`evaluateEnvChecks`, `isRealProductionBuild`) so it can be imported and
CALLED with fixtures instead of only ever read as source text.
`NEXT_PUBLIC_VIATOR_PID` alone carries `fatalInProd: true`; the fatal path
triggers ONLY when `VERCEL_ENV === "production"` (Vercel's own signal, never
invented) — every other var, and every non-production build (every local
machine, every non-Vercel CI run — `scripts/lib/guardEnv.mjs` already
documents "no dev box has the PID" as by-design), behaves exactly as before.
`scripts/check-env.mjs` is now an 8-line caller.

**Positive/negative controls** (`scripts/test-env-revenue-gate.mjs`, wired
into `scripts/guards.txt`, 17 assertions, all CALLING the real exported
function — none reading source text): a fully-healthy env in a real prod
build is not fatal (positive); the exact missing-PID shape in a real prod
build IS fatal (negative — the fix); the identical missing-PID env in a
NON-prod build is NOT fatal (dev-box control, proves local/CI machines keep
working); a `[SENSITIVE]` placeholder in prod is ALSO fatal, not just
outright absence; a DIFFERENT missing var (Google Maps key) in a real prod
build stays non-fatal (proves only the one named var was escalated); a
malformed (whitespace-only) PID in prod is fatal too.

**Red-prove:** `scripts/audit/redprove-env-revenue-gate.mjs` flipped
`fatalInProd: true` back to `false` on the real `ENV_CHECKS` entry (the
exact pre-fix shape) — test failed correctly (`rc=1`, the PROBE assertion
named exactly what regressed), restored byte-for-byte, green again
(`rc=0`). Also verified live: `VERCEL_ENV=production node scripts/check-
env.mjs` with no `NEXT_PUBLIC_VIATOR_PID` set now prints `ENV FATAL …` and
exits 1; the same command with no `VERCEL_ENV` (every ordinary dev/CI run)
still exits 0.

### Fix 3 — 3 real routes called Google Places with zero spend-gate wiring (class 2 + class 9, spend gate)

**Was:** `check-spend-guard.mjs`'s `GATED_FILES` was a hardcoded 8-entry
array. `app/api/places/details/route.js`, `app/api/places/autocomplete/
route.js`, and `app/api/sources/compare/route.js` all call
`places.googleapis.com` directly (confirmed by grep — none were guessed),
none were in the array, and none imported `gateShut()` — meaning
`WAYFIND_GATE=shut`, the emergency kill switch built specifically after the
$1,878.92 August 2026 incident, would not have stopped any of these three
from spending money. `sources/compare` additionally fires 6× Google Text
Search + 6× Foursquare per hit.

**Now:** `check-spend-guard.mjs` walks `app/api/**/route.js` for real (a
`readdirSync`-based recursive walk, asserted to find ≥50 route files and
≥8 real `places.googleapis.com` callers as its own probe), and requires
every discovered caller to reference `gateShut()` wired to either
`lib/spendGate.js` or a local `WAYFIND_GATE` gate. The mask-leanness check
(section 1 of the same file) now runs against the SAME discovered set, not
a second, independently-hand-maintained array. All 3 previously-ungated
routes were given the real fix, not just a guard: `gateShut()` imported from
`lib/spendGate.js` and checked before the paid fetch, degrading to the
existing inventory fallback (`details`) or an empty result (`autocomplete`,
`sources/compare`) — the same fail-soft shape each route already used for a
missing key or an upstream failure.

**Red-prove:** `scripts/audit/redprove-spend-guard.mjs` removed the
`gateShut()` call site from `app/api/places/autocomplete/route.js` (leaving
the import, to prove the guard catches the missing CALL, not just the
missing import) — guard failed correctly (`rc=1`, named the exact file and
reason), restored byte-for-byte, green again (`rc=0`).

---

## Prioritized backlog (not fixed this pass)

1. **Spend-gate ordering beyond `search/route.js`.** Port
   `check-cost-gate.mjs`'s "gate check runs before the paid fetch" string-
   index check into `check-spend-guard.mjs`'s discovery loop, so all 8
   discovered callers get it, not just one.
2. **`check-headers.mjs` has no live wiring.** Either add a real scheduled
   invocation (the canary workflow now has a working home — a fourth job
   there, against the deployed origin, is the natural fit) or stop claiming
   `audit:regression` protects it.
3. **The nested-template-literal desync in `scripts/lib/guardHonestyAnalysis.mjs`'s tokenizer.** Confirmed, reproducible (3 files in class 1's
   scan), upstream/shared — fix the tokenizer to track `${…}` interpolation
   depth inside a template-literal scan.
4. **130 unproven-absence probes across 68 files (class 5).** Each needs the
   same treatment CLAUDE.md's own examples got: a same-file positive-control
   fixture proving the probe can catch a real bad case. Ranked list is in
   class 5 above; `test-booking-resolve-extraction.mjs` and
   `check-editorial-everywhere.mjs` are the highest-count starting points.
5. **145 STRUCTURAL guards, all undeclared.** Adopt the
   `// STRUCTURAL-ONLY: <reason>` convention on `main` (it exists only on
   the unmerged audit-trio branch today) and tag them, or convert the
   highest-value ones to CALL/RENDER per CLAUDE.md's own extraction-PR
   doctrine.
6. **Class 7 beyond `process.env`:** extend `check-guard-hermeticity.mjs`
   with a second rule for `Date.now()`/`new Date()` deciding a verdict,
   mirroring its existing `ambientReads()` architecture. `.next`-artifact
   and `node_modules`-presence dependence were surfaced (6 and 46 files
   respectively) but not individually triaged.
7. **42 of 44 EXEMPT/ALLOWLIST/KNOWN_WEAK-shaped lists (class 6), unreviewed
   beyond the 2 spot-checked.** A full pass would either confirm they're all
   argued-and-honest (like the 2 checked) or surface a real silent-absorber.
8. **Class 4's automated signal is the weakest of the nine** (0 found, via a
   narrow idiom that cannot see equality- or render-based positive-case
   gaps). A real class-4 detector needs semantic understanding this audit's
   heuristics don't have — likely the next engine investment after the
   tokenizer fix in item 3.
