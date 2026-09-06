# Semantic audit: `feat/summer-2026-city-guides` -> `main`

Date: 2026-09-04. Purpose: prove zero content loss before the branch is deleted.
Divergence at audit time: **6 commits ahead, 627 behind** `origin/main` (tip `9f1a32a3`).
Merge base: `7e0183e2`, 2026-08-06.

## Verdict

**Delete. Nothing on this branch needs to reach `main`.**
Five of six commits are already on `main` in fuller form. The sixth is rejected on
the merits (below), not merely as redundant.

## Commit-by-commit

| Commit | Subject | Status on `main` | Evidence |
|---|---|---|---|
| `12d4c362` | five missing creator avatars + guard activation | **Present** | all 9 `public/creators/*.jpg` in `origin/main` tree; `check-creator-avatars.mjs` wired in `guards.txt`, no longer in the `EXCLUDED` map |
| `77d0f758` | three creators, 63 spots | **Present** | all handles in `lib/creatorVideos.js` on main, with more references than the branch added |
| `834d3803` | @stufftodointampabay, 23 spots | **Present** | 27 references on main vs the branch's addition |
| `ce004a53` | ten summer-2026 city guides | **Present** | `lib/guidesSummer2026.js` on main, all 10 slugs |
| `e24f7466` | remove dead `communityBoost()` reader | **Present** | only a historical comment remains at `app/home.js:1450` on main |
| `a2cc0926` | desktop header alignment | **Present** | `WF_WIDE_BP`, `WF_WIDE_COL`, `wf-catrow`, `wf-cattile`, `min(100vw,1280px)` all in main's `css.js` |

Line-level sweep: of 564 substantial lines the branch adds, 129 are absent from
main. All but one cluster are cosmetic inline-style drift in files main rewrote.
The single functional cluster is the "Featured deals" hero, addressed below.

## The one unique feature: "Featured deals" hero — REJECTED

The branch adds an orange top-of-fold card on `/` that filters `COUPONS`, picks one,
and routes to the Coupons screen. It is the only functional code on this branch that
`main` lacks. It is rejected for three independent reasons.

### 1. It reverses a deliberate owner decision, made blind on a stale base

`main` commit `c7d58bd2` (**2026-08-16**): *"fix(home): remove the weather card and
'Deals near you' from the homepage."* The rationale is preserved verbatim in
`app/home.js` (v8.4 block): *"come off the homepage — MOBILE AND DESKTOP, not one
breakpoint,"* with `<HomeAside>` kept intact but given no render site, because
*"Deals remains reachable from the nav's Coupons tab, which is its own screen and owns
the vetted card, the proximate disclosure and the attribution (lib/commerce.js rule 2)."*

The branch's hero was authored **2026-08-25**, nine days after that decision, from a
base predating it by ten days. The lane could not see the decision it was undoing.

### 2. Its selection logic is wrong in ways `main` deliberately fixed

The hero does its own filtering:

```js
const activeCoupons = COUPONS.filter((c) => couponIsLive(c));
const featured = activeCoupons.find((c) => c.business === "Clipp" && c.title.includes("dining")) || activeCoupons[0];
```

Against `lib/dealSheet.js` `dealTiers()`, the canonical selector, this fails on:

- **No geo gate.** `dealTiers()` fails closed on location: `unplaced` deals are dropped
  ("the card claims a deal is NEAR YOU, so the burden is to prove NEAR"), and an unknown
  viewer center yields national-only. The hero applies no scope test at all, so an
  Orlando visitor is served a Sarasota/Bradenton card. That is the precise failure the
  2026-07-31 owner directive closed: *"wrong-city monetized inventory is worse than no card."*
- **Hand-sort.** Selecting on `business === "Clipp"` and `title.includes("dining")` is
  exactly what `dealTiers()` forbids: *"TWO KEYS, both derived from the data — no hand-sort
  can creep into either."*
- **No tier logic.** It ignores the featured/ledger split that keeps the money rail honest,
  so a free community offer can render as the headline deal.
- **Crashes on render.** `couponIsLive` is called without being imported
  (`app/home.js:62` imports only `COUPONS, couponForPlaceName, normalizeOfferRow`), a
  `ReferenceError` behind the app's single top-level error boundary. Caught by
  `check-lib-call-imports.mjs`, which is why the branch cannot build.

### 3. The claimed benefit already exists

Coupons is a first-class nav entry, not a buried screen: `app/home.js:453` —
`{ id: "coupons", icon: "coupons", label: "Coupons", href: "/coupons" }` — with its own
route, on mobile and desktop. There is no missing mobile surface to add.

**If a homepage deals surface is wanted later**, it is a new product decision that
reopens `c7d58bd2`, and it must be built on `dealTiers(coupons, todayIso, viewerCenter)`,
stay geo-gated, render nothing when no valid local deal exists, route into the Coupons
screen, construct no affiliate URL of its own, and preserve `lib/commerce.js` rule 2
disclosure and attribution. It is not this code.

## Preservation record

The dirty working tree in the primary clone (64 modified, 143 untracked, primarily an
unfinished TikTok Pixel integration) is **not** on this branch's commits and is preserved
independently before any deletion:

- ref `wip/snapshot-20260904` and tag `wip-snapshot-20260904` (commit `d0e00b5e`) — exact
  working tree including untracked files
- `_backup/wip-snapshot-20260904.tar.gz` — same content as an archive
- `_backup/wip-tiktok-pixel-*.patch` — tracked modifications only (**incomplete by design**:
  `git diff` does not carry untracked files, and `lib/tiktokPixel.js`,
  `app/components/TikTokPixel.js` and `scripts/test-tiktok-pixel.mjs` are all new)

Restore verified: extracting the archive over the live tree produces **0 differing files**.
The only omissions are gitignored build artifacts and one empty directory.

## Deletion preconditions

- [x] semantic audit recorded (this file)
- [x] Featured Deals explicitly rejected with reasons
- [x] TikTok WIP independently preserved and restore-proven
- [ ] TikTok integration rebuilt on current `main` as its own PR
- [ ] final re-verify that `main` still contains every item in the table above

Delete only when all five are checked.
