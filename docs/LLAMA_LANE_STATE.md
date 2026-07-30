# LLAMA lane — state & handoffs

## 2026-07-30 — another lane edited `scripts/test-detail-render-smoke.mjs`

**Who:** claude-dealsheet lane. **What:** narrowed the built-chunk sweep to
PRODUCTION chunks only. **Why it could not wait for your reboot:** it was
reported up the chain as a red main blocking every lane.

**That report was wrong, and the correction matters more than the change.** main
was green the whole time. The failure was a polluted worktree: 19 stale
`_app-pages-browser_*` chunks left in `.next/static/chunks` by a `next dev` run.

Your premise is right — *a minifier cannot rename a free variable* — but it only
holds for `next build` output. Dev chunks are not minified at all, so every local
name survives literally whether bound or not, and the sweep read them as
offenders. Nothing was wrong with your logic; the input set was wider than the
premise.

**The change:** skip `_app-pages-browser_*`, `app-pages-internals*` and `*_ssr_*`,
plus a new assertion that at least one production chunk was actually swept — so a
dev-only tree now says "run `next build`" instead of silently proving nothing.

**Verified, so you can re-check quickly:**
- a poisoned DEV chunk containing `hasVerifiedTours` → still passes (correctly ignored)
- an unbound `hasVerifiedTours` in a PROD chunk → still FAILS (your original catch intact)
- a dev-only tree → refuses to claim proof

Revert or reshape freely on reboot — flagging it here so you review it rather than
find it. The rest of the guard, including the 15 real renders, is untouched.
