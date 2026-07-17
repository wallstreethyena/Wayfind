# CLAUDE.md — Wayfind working notes

Guidance for any Claude session working in this repo. **Two Claude sessions edit it
concurrently** (this one + "Cowork-Claude"), plus the owner (Gabriel). Coordination and
non-collision matter more than raw speed.

---

## 🚧 Active parallel lanes — DO NOT EDIT until cleared

**Viator / affiliate booking-integrity** is owned by **Cowork-Claude** on branch
`fix/booking-integrity-v2` — the fix for "Tickets & tours" links sending people to the
wrong place (Dalí → Barcelona, Ringling → Houston: a geo/entity mismatch in the resolver).
Until that branch merges, **do NOT edit**:

- `lib/bookingResolver.js`
- `lib/verifiedOffers.js`
- `lib/viatorServer.js`
- the Viator builders in `lib/affiliates.js` (`withViatorTracking`, `viatorDirectUrl`,
  `viatorApiProductUrl`, `ticketsUrl`, `experienceGoUrl`, hotel/Stay22 builders)
- `app/api/viator/*`
- the card / detail Viator **CTA gates** in `app/home.js` and `app/components/BookingCTA.js`

`feat/experiences-inventory-v2` rebases **on top** after that merges — its
`viatorApiProductUrl` / `isTicketyPlace` are compatible and get **folded in, not
duplicated**. Don't re-add those helpers.

When cleared to work a Viator fix: build **on top of the current Viator branch**, not a
fresh branch off main, so the three lanes don't collide.

---

## ⚠️ Concurrency rules

- **main moves fast** — both sessions push, sometimes every few minutes. NEVER assume main
  is unchanged: `git fetch` and branch off **fresh `origin/main`** for every fix.
- **Work in an ISOLATED git worktree**, never a shared one. (A shared worktree once had its
  HEAD moved and working tree contaminated mid-edit — a commit accidentally swept up the
  other session's uncommitted work and had to be redone cleanly.) Always verify
  `git status` shows **only your own files** before you commit.
- Leave the other session's branches/worktrees alone.

---

## ✅ How to ship a fix

1. **Branch per fix** off fresh `origin/main`.
2. **Assertion-guarded splice** + a lock test wired into `npm run prebuild`.
3. **Full `npm run prebuild` green before commit** (all ~70 guard suites). If anything is
   red → **report-only**, do not merge.
4. **squash-merge + delete branch.** Merges are **owner-gated** (explicit `gh pr merge <#>`).
5. After merge, confirm the merged **union** is prebuild-green and the **Vercel deploy is
   green** before considering it done.
6. Prefer many small, single-purpose PRs over one big one. Sequence two fixes that touch the
   same file/anchor (rebuild the 2nd on the merged 1st).

---

## 🧠 Gotchas / patterns — do NOT re-break these

- **"Today" / any date cutoff** → use `lib/siteTime.siteTodayStr()` (venue-local US Eastern,
  DST-aware). **Never** `new Date().toISOString().slice(0,10)` — that's UTC and drops
  tonight's events after ~8 PM ET and expires coupons ~4h early.
- **Classifier `placeAllowed` (`lib/placeFilter.js`)**: the service / category-exclude vetoes
  run **before** the positive allow, and they are **identity-protected** (a real destination
  has a truthy `primaryCategory`). Don't reorder blindly — a naive change regresses
  zoo-with-`veterinary_care` and marina-with-`storage`. Category leaks are usually a broad
  allow token substring-matching a service type (`parking`→`park`, `drugstore`→`store`);
  fix by adding the service to `CAT_EXCLUDE`, not by loosening the identity guard.
- **Cross-device sync** (the sign-in effect in `app/home.js`): reconcile via
  `lib/syncReconcile.reconcileIds` against a **per-collection base snapshot**
  (`wf_fav_base` / `wf_liked_base` / `wf_disliked_base` / `wf_shared_base`). Never
  unconditionally push all local rows up — that resurrects deletions across devices.
- **Wayfind Score**: stored 0–100 internally, shown `/10` via `toDisplayScore`. A **null**
  base score must stay null (→ "Score pending"); never coerce to 0 (it produces a fake red
  0.1/10). `scoreLabel` routes through `toDisplayScore` for the same reason.
- **Order In location**: inherits the app's persisted location (`wf_center`) →
  URL params → geolocation → default. `nearestMetro` uses true haversine miles (~75mi
  radius), not raw-degree Manhattan.
- **Paid API proxies** are guarded in `middleware.js` (same-origin + per-IP rate limit via
  `lib/apiGuard.js`). Any new metered/scrape proxy must be added to the matcher.
  `/api/eats/go` is a GET-302 nav → `rateLimitOnly` (never same-origin-block a navigation).

---

## Recent state (for context, not instructions)

- Two audits complete (recent-release surfaces + full-site sweep). 14 fixes shipped
  (#181–194), all prebuild-green and deployed.
- **P0 RLS read-exposure: APPLIED + verified** by the owner (anon reads 0 rows) — **closed.**
- Remaining work is the non-Viator audit residuals (a11y P2s, order-in P2s, minor P3s) and,
  once cleared, the Viator booking-integrity lane above.
