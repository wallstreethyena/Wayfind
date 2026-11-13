# CLAUDE.md — Wayfind working rules

Rules for any Claude session in this repo. Two Claude sessions (this one + "Cowork-Claude")
and the owner (Gabriel) commit concurrently — non-collision beats speed.

**These are the rules only.** The incident behind each one (dates, PR numbers, measurements,
reproductions) is in **`docs/claude-lessons.md`** — read the matching section there before
changing, relaxing or arguing with a rule, and whenever a script comment cites "CLAUDE.md".
Revenue-audit detail: `docs/POSTMORTEM_2026-08-25_REVENUE_PATH.md`.

---

## GABRIEL EXECUTION AUTONOMY (owner operating mode, 2026-11-12, extended 2026-11-13)

The loop for every mission: investigate, fix the root cause, search for siblings, protect,
test, ship, verify, clean up, short report. Keep all the rigor. Drop the narration, the
babysitting and the repeated approvals. The standard is quiet competence.

### Missions, not screwdriver turns

Once Gabriel approves a mission, that approval covers every normal, safe, reversible,
deterministic and reasonably necessary engineering step needed to finish it. That includes:
repository inspection; tests; database reads; transaction tests that roll back; reversible
test data; reviewed additive migrations and approved cleanup migrations, plus their receipts;
guard runs, builds and previews; rebases, conflict resolution that keeps approved behavior,
branch updates and pushes; opening and updating PRs; merging when already authorized and
required checks are green; preview and production smoke tests; telemetry and read-only
production inspection; cache and stale-data cleanup; regression and bug fixes found inside
the approved scope; safe retries; routine cron/job verification; documentation the change
needs; removing temporary infrastructure; and applying an already-reviewed migration the
mission requires. If the mission covers it, do it: never ask "should I continue?", "should I
run the tests / merge / verify production?", or ask him to type "go" or paste an approval again.

**Approval follows meaning, not the commit hash.** Gabriel approves a scope, behavior and risk
envelope. Rebasing, main advancing, a new merge SHA, mechanical conflict resolution that keeps
behavior, generated guard metadata, migration receipts, formatting and CI metadata carry the
approval forward. Fresh approval only for a material change: new product behavior, expanded
scope, more production mutation, destructive behavior, more spend, a new vendor or
integration, auth/privacy/security changes, a weakened safety control, new sensitive data
use, or materially different risk. Never weaken owner protection to avoid an approval, and
keep an auditable trail. (For owner-only files the mechanism is "Owner Approval
Persistence", `scripts/lib/ownerApproval.mjs`, PR #2456.)

**A tool confirmation dialog is not a new decision.** If the platform lets the agent confirm
using the approval already given, proceed. Before asking Gabriel to do anything, check in
order: can I do it; does the mission already cover it; does approval persistence cover it; is
there a safe alternative. Only when all four fail and the platform literally requires his
account, ask for that one action, in this form, then keep working on everything else:

> MANUAL ACTION REQUIRED
> Action: <exact click or step> · Link: <direct link, if any>
> Reason: <one sentence: why only Gabriel can do it> · Previously approved scope changed: YES / NO

Never send vague asks ("two clicks are waiting on you") or re-explain the mission.
Never bypass, imitate or work around a denied action or a platform safety gate: a refusal is
surfaced as the exact manual action needed, never routed around.

**Hard stops.** Ask Gabriel for a NEW decision only when the next action would:
1. spend money or materially increase recurring cost;
2. permanently delete valuable production data outside an approved cleanup;
3. weaken auth, privacy, security, legal, compliance or safety controls;
4. need credentials, MFA, CAPTCHA or a login only Gabriel can provide;
5. materially change user-facing behavior beyond the approved mission;
6. choose between genuinely different product directions where his preference can't be inferred;
7. materially expand the mission;
8. create significant irreversible risk;
9. send external communication he has not authorized;
10. technically require his own identity or account (ask for only that action, as above).
Everything else is execution. This section never relaxes any other rule in this file
(owner-only files still need `/owner-approve <head sha>`; full prebuild green before merge).

**Blocked does not mean stop.** Name the blocker and decide whether it really blocks the
mission. Continue every independent part, try safe lawful alternatives, leave the blocked step
ready, and ask only for the minimum action genuinely required. One provider saying no or one
confirmation prompt never halts a whole project.

### Talking to Gabriel

**No implementation diary.** Do not narrate ("now reading…", "main moved again", "checks are
running", "trying another window", "say go and I'll…"). Speak during a mission only for a
material discovery, a material change to the mission, a genuine Gabriel-only action, a real
incident, or completion. Do not repeat an unresolved condition unless its severity changed.
Plain English, calm and decisive; no timestamps unless timing matters.

**Classify before notifying.** EXPECTED (known result of undeployed, disabled, expired, queued
or intentionally pending work: an undeployed route 404s, a preview is queued, CI is waiting, a
PR is open, a cron ran healthy, no new Instagram posts, an intended exclusion fired, a
migration is intentionally pending, a known blocker is unchanged): say nothing. INFORMATIONAL:
final report only. ACTIONABLE: the manual action request above. INCIDENT (unexpected
production failure in availability, revenue, security, privacy, data integrity or major
product behavior): notify now. An error code alone is not an incident; context sets severity.

**Completion report.** Default shape, readable in 30 seconds:
```
DONE
What changed: <1–3 short bullets>
Verification: <key evidence>
Production: LIVE + VERIFIED | NOT YET VERIFIED: <reason>
Remaining risk: NONE | <one meaningful risk>
Gabriel action: NONE | <exact unavoidable action>
```
Go deeper only for high-risk incidents, migrations, revenue failures or security work.
Concise never means hiding failed tests, an incomplete deploy, an unresolved regression,
material uncertainty, a security or privacy concern, destructive risk or a real blocker.

### Async infrastructure and temporary automation

Vercel and CI queues, GitHub checks and provider processing are not babysat. When something is
queued, record its ID, continue independent work, and check it when the mission reaches
verification; no repeated polling, no "still queued" messages, and no timers or check-in jobs
unless monitoring is itself the mission. If it is still unavailable then, use the strongest
safe alternative verification and never call preview-dependent behavior passed until it was
seen. A queued preview alone does not freeze a release: when required CI is green, guards
pass, the diff is understood and in scope, and rollback is available, decide whether to ship
with production verification right after deploy; if yes, ship and verify at once; if no, leave
it ready and report one real blocker.

**Temporary automation must die.** Watchers, polling scripts, keep-awake processes, temporary
crons and debugging automation each need an explicit cleanup condition and are removed when
the mission ends or the durable fix exists. Gabriel's Mac is not production infrastructure.
If repeated rebases or watchers are needed because of how the repo is set up, fix that class
of problem (merge queue, approval carry-forward) instead of babysitting it.

### Rigor that matches the risk

**TESTED, DEPLOYED, VERIFIED are different words.** TESTED: tests passed. DEPLOYED: the target
version is live. VERIFIED: the required behavior was observed in the right environment. "The
database looks correct" is not "the feature works"; "CI green" is not "production works";
"deploy READY" is not "the user flow is verified". Verify in this order of preference:
deterministic test, integration/browser test, preview, isolated canary, production observation
without behavior change, and only when genuinely necessary and authorized a temporary
production behavior change. Never disable a live safeguard just to prove its off switch works.

**Fix systems, not symptoms.** Trace symptom, failing invariant, root cause, enabling
condition, missing protection; search for the same failure class elsewhere; add regression
protection that is wired into CI/build/deploy and red-proved where practical. Match rigor to
risk: revenue, auth, privacy, destructive data and core infrastructure get heavy protection; a
copy change does not. Choose the smallest robust solution, not the smallest hack and not the
biggest project. Sort discoveries: REQUIRED and REGRESSION are fixed now; a small, safe,
directly related fix is made if sensible; a future opportunity gets one line and you move on.

**Brand assets.** Before making any Wayfind-branded visual, check the canonical vault
(`public/brand/wayfind/` and its `manifest.json`, added by PR #2456). Never redraw, recolor or
regenerate the Wayfind logo when an approved asset exists, and never leave the only copy of a
supplied asset in chat, /tmp, a worktree or an output folder.

**Completion standard.** A mission is done when its acceptance criteria are met or a genuine
hard stop remains: code → tests → guards → build → migration → PR → merge → deploy →
production verification, as far as authorization and tooling allow.

BAD: "The migration is additive, reviewed, idempotent and required. Say 'go' and I'll apply it."
GOOD: "The reviewed migration is required for the approved mission. Applying it now."

Locked by `scripts/check-claude-md-owner-sections.mjs` (this section and every top-level
safety section must stay present).

---

## Booking integrity (no frozen lanes — these files are normal code)

- **Never weaken `geoConfirms()`** in `lib/bookingResolver.js` — it stops wrong-place
  redirects (Dalí → Barcelona, Ringling → Houston).
- **Never weaken the beach exclusion** in `isTicketyPlace()` (`lib/affiliates.js`):
  beach-typed / `natural_feature` / `category === "beach"` is NEVER bookable.
- `scripts/test-booking-integrity.mjs` must stay green — it locks both.
- `isTicketyPlace` / `viatorApiProductUrl` already exist — fold into them, never re-add.

## Revenue-path rules (2026-08-25 audit)

1. **Env-gated branches need a static guard or a CI run with the flag ON.** Keep
   `scripts/check-response-imports.mjs` green; give every new env-flag branch the same.
2. **Deterministic provider failures (billing/quota) never retry.** `lib/providerHealth.js`
   classifies + breaks the circuit; `billing:`/`quota:` pulse notes page after ONE dead run.
   Keep the Anthropic account on auto-reload — the breaker limits blast radius, it can't add credits.
3. **Every fallback rung keeps attribution; "degraded" ≠ "failed".** Redirect events carry
   `resolver_path`; `provider_redirect_failed` means unattributable, nothing else.
4. **Commercial links go through our `/api/*/go` routes**, never a client-built
   `NEXT_PUBLIC_*` template href (`Aff.uberEatsGoUrl` / `experienceGoUrl` are the pattern).
   Fixing a bake-time-env bug → grep for its siblings.
5. **New public content ships WITH sitemap + schema; new tables ship WITH RLS.** Read the
   Supabase advisor output on a schedule.

## Concurrency & git

> **🔒 The shared clone is infrastructure, not a workspace (owner directive, 2026-09-29).**
> `/Users/gabrielpereira/Projects/wayfind` is shared infrastructure only — it hosts every
> lane's worktrees. **Never use it as an active development workspace. Never commit, stash,
> reset, clean, apply patches, or create PRs from that shared clone.** Every new development
> lane must start from a **fresh `origin/main` in its own isolated worktree**
> (`git worktree add -b <lane> <path-outside-the-clone> origin/main`). Editing directly in
> the shared tree risks sweeping another lane's uncommitted work into your commit — the
> merge-#346 contamination failure.

- **Never assume your base is current.** `git fetch origin main` and diff immediately before
  every commit; branch every fix off fresh `origin/main`. `git fetch --prune --all` before
  trusting `git branch -r`.
- **Work in an isolated worktree**, never a shared one. `git status` must show only your
  files before you commit. Leave other lanes' branches/worktrees alone.
- **One lane owns one remote branch.** To build on another lane's branch, branch off it.
- **Force-push only as a pinned compare-and-swap** — a bare `--force-with-lease` after a
  fetch silently deletes other lanes' commits. Use `scripts/safe-force-push.sh <branch>`
  (refuses `main`; needs `--accept-loss <sha>` to discard anything). Owner's rule: no force
  push to a shared PR branch unless you fetched that exact branch immediately before and the
  push is conditional on the exact SHA observed. Keep `rescue/<branch>-<sha8>` until settled.
- **Per-lane identity, per worktree** (a bare `git config` in a worktree relabels the owner):
  ```
  git config --local extensions.worktreeConfig true   # once per clone
  git config --worktree user.name "<lane name>"       # every new worktree
  ```
  Verify the owner clone's `user.name` is unchanged. This lane is `claude.exe (Wayfind lane)`.
- **Every commit ends with a `Lane:` trailer** directly above `Co-Authored-By` (which stays
  last), e.g. `Lane: claude.exe (Wayfind lane)` then `Co-Authored-By: …`.
  Squash-merge rewrites authors; only the body survives. Query with
  `git log origin/main --grep='Lane: '` — `%(trailers:key=Lane)` returns EMPTY on `main`.
  A custom squash `--body` drops the trailer; carry it by hand if you override.
- **Authorship is answered by git (`--grep='Lane: '` / `%an`), never from memory.**

## How to ship a fix

1. Branch per fix off fresh `origin/main`; many small single-purpose PRs; sequence PRs that
   touch the same anchor (rebuild the 2nd on the merged 1st).
2. Assertion-guarded splice + a lock test wired into `npm run prebuild`.
3. Full `npm run prebuild` green before commit. Anything red → report-only, do not merge.
4. Squash-merge + delete branch. **Merges are owner-gated.** Owner-only files (CLAUDE.md,
   AGENTS.md, `.github/**`, … see `scripts/lib/ownerApproval.mjs`) need an
   `/owner-approve <head sha>` comment by the owner.
5. After merge: confirm the merged union is prebuild-green and the Vercel deploy is green.

`gh`/merge traps:
- `--delete-branch` from a detached HEAD (or a branch held by a worktree): **the merge
  succeeded**, only cleanup was skipped. Merge from a real branch that is not the PR's own.
- `mergeable=CONFLICTING` / "not mergeable" right after a push is often lag — poll until it
  leaves `UNKNOWN`, confirm with a real rebase.
- **Never trust an exit code or a SHA check in this squash-merge repo — verify by content**
  (`git show origin/main:<file>` + grep; diff branch vs main; grep the subject on main).
  `git branch --merged` / `--contains` are correct about ancestry and useless about shipping.
- **Pipes swallow exit codes.** `guard | tail && merge` merges on red. Use
  `set -o pipefail` / `${PIPESTATUS[0]}`, or `cmd; echo "rc=$?"`. No merge without a green
  verified on the actual exit code.
- **A red guard is not a red repo.** Reproduce on a clean tree (`rm -rf .next && npx next
  build`) before reporting a broken `main`.

## Writing guards & assertions — the check must answer the question you asked

- **Assert the syntactic role, not the substring:** declaration →
  `/(?:const|export const)\s+NAME\s*=/`; prop → inside the destructuring; rendered component
  → `/<Name[\s/>]/`; N occurrences → count them and assert N; an absence → prove the probe
  finds a known positive first (AGENTS.md §4d).
- **Stronger: assert on the CALL, not the string.** Prefer `import()` + invoke + assert the
  return over `readFileSync` + regex. Off-box (partner URL, webhook, RPC) → assert on the
  response **body**, never the status code (soft-404s return 200). If you can't execute it,
  say so in the assertion message.
- **Assert the invariant, not the file path.** Check the union of plausible locations or the
  export; count things that must exist exactly once. When a guard goes red because code
  moved, follow the code — never delete the assertion.
- **Strip comments (and string contents) before position/presence checks** — raw-source
  greps fail on their own explanatory comments.
- **Red-prove by breaking the protected thing, not the assertion** — and prove the mutation
  applied: use python (assert the target exists, print what changed), not `sed` (BSD sed
  ignores GNU `0,/re/` and reports success). Never accept a red-prove you didn't watch go red.
- **A guard that fires on correct code is worse than none.** Run it against the whole tree;
  model scope fully (default+named imports, destructured locals/params; code only). Carry a
  positive and negative control; state the false-positive surface in the success line
  (e.g. "331 files scanned against 612 lib export names").

## Verification

- **Cached data → warm-cache test + cache-key bump.** If a fix changes what goes INTO a cache,
  bump `CACHE_EPOCH` in `app/home.js` (locked by `scripts/check-cache-epoch.mjs`). Verify on a
  clean profile AND with the pre-fix cache seeded, plus a known-good control under the new key.
- **Mobile = a real 390×844 viewport.** `resize_window` can silently no-op; render the page
  into a 390px iframe and read `innerWidth` back:
  ```js
  document.body.style.cssText = "margin:0;background:#222";
  document.body.innerHTML = '<iframe src="' + url + '" style="width:390px;height:844px;border:0;display:block;margin:0 auto"></iframe>';
  ```
  Check sticky / absolute / overlaid elements first. A 1512px screenshot is not mobile evidence.
- **Reachability is transitive.** Trace to a user-visible trigger (nav button, URL param,
  card tap); for gating state enumerate every write (`grep -n "setFoo("`) and what renders
  each call site; confirm with a click. A surface with no door is OK only while something
  tracks it (`docs/KIMI_QUEUE.md`).
- **Verify on a surface that actually mounts what you changed.**

## Extraction PRs (moving a function between modules) — run BOTH

| guard | catches |
|---|---|
| `test-detail-render-smoke` — renders the component via `scripts/lib/jsxLoad.mjs` across variants × data shapes | anything that throws on an exercised path |
| `check-lib-call-imports` — static, every source file vs every `lib/` export | an unbound call no test renders |

`check:jsx` and `next build` do NOT catch unbound identifiers. Cheap artifact check: grep
`.next/static/chunks` for the helper's literal name — **production chunks only** (exclude
`_app-pages-browser_*`, `app-pages-internals*`, `*_ssr_*` dev artifacts) and assert at least
one production chunk was swept.

## Code gotchas — do NOT re-break

- **Dates/"today"** → `lib/siteTime.siteTodayStr()` (US Eastern, DST-aware). Never
  `new Date().toISOString().slice(0,10)`.
- **`placeAllowed` (`lib/placeFilter.js`)**: service/category vetoes run before the positive
  allow and are identity-protected (truthy `primaryCategory`). Fix leaks by adding to
  `CAT_EXCLUDE`, never by loosening the identity guard or reordering.
- **Cross-device sync** (`app/home.js` sign-in effect): reconcile via
  `lib/syncReconcile.reconcileIds` against per-collection base snapshots (`wf_fav_base`,
  `wf_liked_base`, `wf_disliked_base`, `wf_shared_base`). Never push all local rows up.
- **Wayfind Score**: stored 0–100, shown `/10` via `toDisplayScore`; null stays null
  ("Score pending"), never 0. `scoreLabel` routes through `toDisplayScore`.
- **Order In location**: `wf_center` → URL params → geolocation → default; `nearestMetro`
  uses haversine miles (~75mi).
- **Paid API proxies** are guarded in `middleware.js` (`lib/apiGuard.js`); add any new
  metered/scrape proxy to the matcher. `/api/eats/go` is GET-302 → `rateLimitOnly`.

## Housekeeping

- The July 2026 "AI Operating System" block lives in `docs/history/AI_OPERATING_SYSTEM_2026-07.md`.
  It is history, not instructions: no reports, emails, alerts or org chart without the
  owner's explicit approval in-session.
- Three backup tables had RLS enabled 2026-08-25 — drop them once confirmed unreferenced.
