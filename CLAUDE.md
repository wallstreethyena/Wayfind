# CLAUDE.md — Wayfind working rules

Rules for any Claude session in this repo. Two Claude sessions (this one + "Cowork-Claude")
and the owner (Gabriel) commit concurrently — non-collision beats speed.

**These are the rules only.** The incident behind each one (dates, PR numbers, measurements,
reproductions) is in **`docs/claude-lessons.md`** — read the matching section there before
changing, relaxing or arguing with a rule, and whenever a script comment cites "CLAUDE.md".
Revenue-audit detail: `docs/POSTMORTEM_2026-08-25_REVENUE_PATH.md`.

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
