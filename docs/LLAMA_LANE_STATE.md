# LLAMA lane — state handoff

Written 2026-07-30 at the end of a long session, deliberately, before context ran out.
Purpose: a rebooted LLAMA session should be able to read **this file + CLAUDE.md** and
resume without re-deriving anything.

Read CLAUDE.md first. This file only holds what is NOT in CLAUDE.md: live open items,
where a half-finished trace stopped, and the things I would otherwise have to rediscover.

**Identity.** This lane commits as `LLAMA (Wayfind lane)`, set worktree-scoped in
`/Users/gabrielpereira/Projects/wf-llama` via `extensions.worktreeConfig` +
`git config --worktree`. Verify with `git config --worktree user.name` before the first
commit after a reboot — a fresh worktree does not inherit it.

---

## 1. Sequencing the owner set (follow this order)

1. **#501 target-list sign-off — FIRST.** Wave 1 of the Guide Factory is the
   highest-revenue work in this lane and the owner reviews the list with local knowledge
   he has and I do not. Paste the 20 targets into the pane as a compact table
   (title · primary CTA + provider · intent · winnability) so he can approve / strike /
   reorder in place. **Do not start writing guides before that.**
2. **Wave 1 build**, 2–3 guides/day once signed off.
3. **Sheet-scoped closer** — picks up only after Wave 1 is running.

---

## 2. Open items

### 2a. #501 — Guide Factory target list (OPEN PR, awaiting owner sign-off)

`docs/GUIDE_FACTORY_TARGETS.md` on branch `docs/guide-factory-targets`. 20 targets, each
gated on a **monetizable terminal that exists today** — a guide with no real CTA did not
make the list. Scored on (a) bookable intent, (b) search demand, (c) inventory depth,
(d) winnability.

**Two honesty notes that must survive into the conversation**, because they are the parts
the owner should push on:

- **(b) search demand is the weak axis.** We have no keyword tool wired. Those numbers are
  reasoned from shape and our own analytics, not measured. Stated up front in the doc —
  do not quietly upgrade them to fact.
- Two **cannibalisation risks against our own existing guides** are listed in the doc's
  penultimate section. Resolve before building those two, not after.

### 2b. Sheet-scoped closer (SPEC RECEIVED, INVESTIGATION ONLY — nothing built)

Owner-reported: the closing blurb above "Share this list" is **metro-level**, so every
sheet in a metro ends the same way.

- **Where I stopped:** the metro-level line is `areaSeasonalContext`, consumed at
  `app/components/IntentPageClient.js:202`. That is the trace pointer — start there.
- **Required shape:** closer keyed on **(metro, sheet type, sheet subject)**; the metro
  line becomes a **fallback only**, not the default.
- **Source discipline (owner, verbatim intent):** derived from `wf_editorial` + our own
  data — **never invented**.
- **Instrument:** `sheet_closer_variant {scoped|fallback}`. This is the whole point —
  without it we cannot tell whether scoped closers ever actually render.
- **Coverage order = money order:** cuisine shortlists first, then mood sheets, then guides.

**AMENDMENT, owner-reviewed 2026-07-30 — read this before designing anything:**

- **Uniqueness is PER CARD and PER SHEET INSTANCE, not per surface type.** Every hero
  card and every sheet gets its **own** derived line. This widens the scope past sheets:
  hero cards are in too.
- **The failure condition is the same sentence appearing twice anywhere on the site.**
  Not "twice in a metro", not "twice in a sheet type" — anywhere.
- **Guard required:** a build pass that collects **all rendered closer/hook lines** and
  asserts no duplicates. Collect from the render, not from the templates — a template
  count cannot see two instances resolving to the same string.
- **Richness bar raised:** each line carries **one concrete, place-cluster-specific
  truth** — a name, a rhythm, a local habit. **Weather generalities do not clear the
  bar.** "Great in the evening" is a fail; naming the cluster and what actually happens
  there is a pass.

**Design consequence to resolve before building — flag it to the owner, do not silently
pick:** a global no-duplicates assertion collides with the idea of a static metro-level
*fallback*. If two sheets in one metro both fall back, they emit the identical line and
the guard goes red. Two readings, and they lead to different builds:

1. **That is the point** — the fallback stops being graceful and becomes build-breaking,
   which forces real per-instance coverage. Strictest, and consistent with "every card
   gets its own line."
2. The fallback must itself be **derived per instance** rather than one static metro
   string, so it stays a quality floor without ever duplicating.

My read is that these converge: under either, **a single static metro sentence reused
across instances can no longer ship**, so the fallback has to become per-instance
derived. Confirm with the owner before building, because it changes what `fallback` means
in the `sheet_closer_variant` instrumentation.

### 2c. Quota-gated queue (blocked on Google Places quota, not on decisions)

- **#433 — landmark seeding + paging** (DRAFT). The ICON Park gap. **Seeds are
  unverified** — the PR must not be merged on the assumption they resolve. Note the
  corrected diagnosis: the original #429 theory (per-type fan-out) was **wrong**; the real
  cause was **radius crowd-out at 2000m**. Do not re-litigate from the old theory.
- **Social-proof self-heal** — the guide-conversion social-proof block degrades silently
  when counts are missing; the self-heal was specced, not built.

### 2d. Owner-named, NOT yet started — I hold no diagnosis on these

Recording them so they are not lost, and recording honestly that I have **not**
investigated them. Do not treat the labels below as findings:

- **Eskina dedup** — duplicate rows suspected around Eskina (surfaced adjacent to the
  Brazilian cuisine classification work). Not reproduced by me.
- **Boteco hook** — a missing/weak editorial hook. Not inspected.
- **Editorial-coverage campaign** — the broad push to raise `wf_editorial` coverage.
  Related known number: the Attractions baseline was **10.6%**, not 68.3% — the higher
  figure came from counting rows carrying `issues = ['FAILED VERIFICATION']` as covered.
  **Any coverage query must exclude failed rows.** That mistake has been made once.

### 2e. Staged behind guides (owner-agreed, do not start early)

- **Landing-template port** to the remaining **84 pages**. Explicitly staged behind the
  guide work.
- **Cuisine review-synthesis** over the **569 unclassifiable rows**.

---

## 3. Standing rules this lane relies on

Beyond CLAUDE.md. These were each learned by getting it wrong at least once today.

**On guards / verification**

- **A check that runs but examines nothing is worse than no check** — it gets reported as
  evidence. Every guard gets a **break-on-purpose** run, and you must *watch it turn red*.
  Repeatedly today a break-check "passed" while proving nothing: a `.sql.bak` satisfied a
  scanner; a regex matched inside an uncalled function; a mutation string matched nothing
  at all and `sed` reported success.
- **Assert on behaviour, not on text presence.** "The string is in the file" is not "the
  code runs." Prefer positional/structural assertions (element X appears inside Y and
  before Z) over greps.
- **A caught failure must be distinguishable from legitimately-empty.** Assert both sides
  non-empty before comparing; count loop iterations. Two empties must never pass.
- **Guards that grep raw source trip over their own explanatory comments** — strip
  comments before matching. This has bitten 5+ times.
- **Extraction PRs need both guards** (the canonical pair, in CLAUDE.md): the byte-identity
  test *and* `test-detail-render-smoke`, which actually **renders** the component. #486
  shipped a `ReferenceError` to production because six layers all checked the module and
  nothing ever called the component.
- **Mobile checks: render into a 390px iframe and read the width back.** Now in CLAUDE.md.

**On shipping**

- **Never trust a merge's exit code — verify by content** (`git show origin/main:<file>`).
- **`gh pr merge --delete-branch` fails silently when a worktree holds the branch.** Remove
  the worktree first, then delete local + remote, **then re-query** to confirm.
- **`git fetch origin main` immediately before every commit.** main moves every few minutes;
  today's hero PR hit a merge conflict from exactly this.
- **Never open a PR without reading the build result.** #450 was pushed with
  `next build exit=1`.
- **Never delete a branch before confirming the merge landed** — doing so closed #453.
- **Never report a risk you have not reproduced by running the command.**
- **`rm -rf .next` before measuring anything data-dependent.** A stale fetch cache once made
  me measure 0-of-9 scored places and nearly report a phantom bug.

**On product**

- **Cuisine is a FILTER over already-geofenced local inventory, NEVER a search query.**
  Guarded; the build fails if a cuisine label can reach a query builder.
- **A null score stays null** ("Score pending"). Coercing to 0 renders a fake red 0.1/10.
- **One primary CTA per guide.** A guide with no monetizable terminal does not get built.
- **Fix structurally, not per-instance** (owner, on the wordmark): if the fix depends on
  vetting every future asset, it is not a fix.

---

## 4. Mid-thought when I stopped

Nothing is half-edited on disk. The hero-chrome work merged clean as **#503**
(`fcc2c09dc`), branch deleted, verified by content on main.

The one genuinely unfinished thread is **2b** — I had traced the metro-level closer to
`areaSeasonalContext` / `IntentPageClient.js:202` and set it down when the mobile feedback
came in. That pointer is the whole of what I know; there is no design decided yet, and the
owner has explicitly put it **after** Wave 1.

---

## 0. INBOX — messages from other lanes (read on reboot)

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

**My response, for the rebooted session:** accept it. The premise they name is mine and
still correct — a minifier cannot rename a free variable — it just only holds for
`next build` output. Dev chunks are unminified, so every local name survives literally and
the sweep read them as offenders; the logic was fine and the INPUT SET was wider than the
premise. Their added assertion (at least one production chunk was actually swept) is
exactly the falsifiability rule this lane already runs on: a dev-only tree must say "run
`next build`" rather than silently prove nothing. **No revert. Re-run their three checks
once on reboot rather than taking them on trust, then move on.**

