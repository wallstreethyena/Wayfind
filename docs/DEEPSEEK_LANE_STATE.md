# DEEPSEEK lane state — 2026-07-30

> **READ THIS FIRST.** Today's money-page monetization is **untracked Uber Eats
> delivery plus the tour rail**. The CTA ladder is built and honest, but three of
> its four rungs are gated on decisions **outside this lane**: per-merchant Clipp
> deals (GWEN), a reservation affiliate (owner research), and
> `NEXT_PUBLIC_UBEREATS_TEMPLATE` so delivery earns at all. The structure is done.
> The money is waiting on other people. Do not read the built surfaces as revenue.

Handoff file. Read this **plus CLAUDE.md** to resume. Written because a session's
context got heavy, not because the lane paused.

Lane identity is stamped per-worktree:
`git config --worktree user.name "DEEPSEEK (Wayfind lane)"` in
`/Users/gabrielpereira/Projects/wf-deepseek`. **Never** the bare `git config` form —
30 worktrees share one `.git/config` and a bare set relabels every lane's commits
(see #482).

---

## Shipped today (all merged, each verified by CONTENT on origin/main)

| PR | what |
|---|---|
| #469 | commerce event layer — `commerce_impression` + field whitelist + commission kept out of the ranker |
| #477 | `/api/commerce/go` — the redirect #469's links pointed at **but which did not exist** |
| #485 | food-tour rail (Viator, by city) + the anon-key fix |
| #487 | hero-card redesign — chooser moved inside the cream card |
| #498 | shortlist redesign — the money page, one honest CTA per row |
| #502 | money-funnel declaration + the five named gaps |

Also merged **#479** under explicit owner authorization after re-verifying it — I
merged it, I did **not** author it. Keep that distinction in the authorship map.

---

## Open / next actions

### 1. BookItLink instrumentation — THE immediate one
**Coordination outcome (verified 2026-07-30):** claude.exe's `feat/detail-action-layer`
touches `BookingCTA.js`, `sheets/Detail.js`, `lib/bookingResolve.js` and their
extraction test — **`BookItLink.js` is NOT in their diff**, and it emits no
commerce events on main either (`grep -c emitCommerce` = 0).

So the detail sheet's **primary** money CTA — live in prod since
`NEXT_PUBLIC_BOOK_IT` was set — is covered by nobody. Owner's instruction: if their
branch does not cover it, **instrument it with their + GWEN's sign-off, small and
surgical, before tonight's audit.**

What "instrument" means concretely:
- `commerce_impression` on viewability (reuse GWEN's `app/components/useCommerceImpression.js`)
- `commerce_cta_clicked` alongside — **not replacing** — the existing `book_it_out`
- payload built through `funnelProps("commerce_impression", { metro, cuisine, placeId })`
- then remove its entry from `UNINSTRUMENTED_MONEY_SURFACES` and **lower the
  `CEILING` in `scripts/check-money-funnel.mjs`** (currently 5 — it ratchets down only)

### 2. Hand the funnel dialect to claude.exe regardless
Their spec adds `commerce_impression` / `commerce_cta_clicked` / `primary_cta_null`
on the detail sheet. Those events must **join** the breakdown, so they need the
commerce dialect — see the spec section below. A third key mismatch would repeat
the `metro`-drop bug silently.

### 3. Routed to LLAMA (do not fix in this lane)
- **Eskina duplicate** — two distinct `place_id`s both named "Eskina Brazilian
  Restaurant" (10,615 and 3,214 reviews) render at ranks 1 and 4 of
  `/eat/orlando/brazilian`. Canonical-place merge, census/dedup lane.
- **Boteco hook mismatch** — its hook describes "French crepes… flat whites and
  lava cake" on a **Brazilian** shortlist. Editorial coverage is 17/78 rows (~22%),
  so it is the *only* "Known for" prose a user sees on that page.
- **Editorial coverage is now a revenue priority** (owner): "Known for" is the
  highest-leverage prose on the highest-intent page and needs no Places quota.

### 4. Dark rungs — wired, waiting on data (zero code change needed here)
| rung | lights when |
|---|---|
| **deal** | GWEN seeds per-merchant Clipp rows (Columbia Restaurant, Orange Blossom Coffee) after the Deal Sheet ships. `couponForPlaceName()` starts matching — **no code change in this lane**. |
| **bookable** | a reservation affiliate exists (OpenTable/Resy). Owner research. `hasBookingCTA()` returns **false for every restaurant kind** today — `BOOKABLE_KINDS` has no food kind and `isTicketyPlace` excludes restaurants. |
| **delivery earns** | `NEXT_PUBLIC_UBEREATS_TEMPLATE` set. Owner is researching whether Uber Eats' program is joinable; if not, delivery stays user-value and earns via Clipp instead. |

Today's money-page monetization is therefore: **untracked Uber Eats delivery + the
tour rail.** Say so plainly; do not let the mock imply otherwise.

---

## The funnel dialect spec (hand this to any lane adding commerce events)

`lib/funnel.js` is the declaration. **Two dialects, not interchangeable:**

```
lib/track surfaces   → metro      cuisine   place_id
commerce schema      → city_id    category  canonical_place_id
```

`lib/commerce.js` `CONTEXT_FIELDS` has **no `metro`** — it is silently **dropped**,
and a PostHog breakdown on a dropped key returns *nothing* rather than erroring.
Proven by calling `commercePayload`, not assumed.

Always build payloads with `funnelProps(eventName, { metro, cuisine, placeId })` —
it picks the dialect from `STEP_EMITTER` so the two can never drift by hand.

**The funnel:** `cuisine_chip → cuisine_place_open → detail_open →
commerce_impression → commerce_cta_clicked`.

**It breaks at step 4 and the break looks like a result.** Steps 4–5 fire only on
surfaces that *bypass* the detail sheet. `funnelCoverage().detailPathReadable` is
`false` today, deliberately — a zero must never be readable as "users don't
convert" when it means "we never instrumented that path".

Five gaps are named in `UNINSTRUMENTED_MONEY_SURFACES` and **ratcheted**: the list
may shrink, never grow, and an entry only comes off when the guard confirms the
surface really emits `commerce_cta_clicked`.

---

## Standing rules this lane leans on

- **Verify by CONTENT on `origin/main`, never by a flag or a PR state.** Merges were
  reported done twice today while the PR sat open; `merge_commit_sha` is populated
  for *any* mergeable PR and is not evidence of a merge.
- **Assert on the CALL, not the string** (CLAUDE.md). Its stronger form earned three
  instances today, including `curl` returning **HTTP 200** on a WeGoTrip page whose
  body was a soft-404. A status code is not evidence a page exists.
- **Prove the mutation applied** before believing a red-prove. One "red" was green
  because the regex never matched.
- **Never weaken another lane's guard.** When #479's guard blocked a refactor, I
  kept the shape it asserted rather than loosening the check. When a guard must
  change because the *design* changed (#487), translate assertion-by-assertion with
  the mapping stated in the file header.
- **`gh --delete-branch` fails when a worktree holds the branch** — re-query
  `git ls-remote` afterwards; never trust its silence.
- **Ships-dark is the house discipline.** Wire the branch fully, render nothing
  until real data exists, and say what is dark.
- **A disclosure under a link that cannot earn is a false statement.** FTC line and
  `rel="sponsored"` both follow whether the link *actually earns*.
- Mocks arrive **untracked in the main clone** — SHA-verified copy into the
  worktree, commit with the PR. Untracked files do not cross worktrees.
- Headless Chrome enforces a **~500px minimum window**: a 390px screenshot is a
  *crop*, not a mobile render. Real ≤420px is the owner's device check.

---

## Environment facts worth not rediscovering

- Supabase **legacy anon JWT is disabled** (401 "Legacy API keys are disabled").
  The working key is `sb_publishable_…`, and Vercel holds it — production anon
  reads are healthy (owner verified in the dashboard).
- `wf_experiences.lat` is **NULL on all 1,234 rows** — any geo filter returns
  nothing, silently. Scope by `dest_id` (`METRO_DESTS` in `lib/foodTours.js`).
- **WeGoTrip has no Sarasota page at all** (0 of 1,199 cities) and 1 food product
  in all of Florida. Do not re-wire it; see `lib/commerceProviders.js`.
- Worktree: `/Users/gabrielpereira/Projects/wf-deepseek`. `npm ci` is needed in a
  fresh worktree — node_modules is not shared.
