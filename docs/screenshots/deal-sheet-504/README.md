# Deal Sheet (#504) — visual evidence

Captured 2026-07-30 against `next dev` on the PR branch, at the post-cut state:
**5 money cards + 12 ledger rows**. The viewer had no `wf_center` in
`localStorage`, so the app used its own resolved center, which lands in the
**Sarasota** metro — that is the viewer these shots represent.

| file | what it proves |
|---|---|
| `01-money-rail-local-first-in-app.jpg` | The sheet in real app chrome (bottom nav, header). The money rail opens **Discover Sarasota · SARASOTA**, then **Clipp · Sarasota**. |
| `02-sheet-header-and-money-rail.jpg` | Header, tier heading "Worth money tonight", and the first two money cards. |
| `03-money-card-footer-and-ledger-head.jpg` | The pinned footer — expiry, "Code verified", CTA, and the disclosure directly under the CTA it describes. |
| `04-ledger-all-12-rows-zootampa-last.jpg` | **All 12 ledger rows in one frame.** ZooTampa (area `Tampa`) is **last**, below rows with no end date at all — under expiry-only sorting its `Ends Sep 7` would have placed it 2nd. This is the locality key, visible. |
| `05-money-rail-end-klook-national-last.jpg` | The rail scrolled to its end: **Klook · UNITED STATES is the last of the 5 cards.** Before this PR it was 2nd, above Clipp Sarasota, because it expired soonest. |
| `06-klook-card-s3usatt-code-and-disclosure.jpg` | The Klook card carries **`S3USATT`** — the one surviving code after the owner's cut — plus "Wayfind earns a commission *via Klook* — your price is the same." |

## Two capture snags, and what actually works

Both were hit again this session; recording the working method so the next
capture does not rediscover them.

**1. The sheet does not live in the document.** `document.scrollHeight` equals
`innerHeight` (744 vs 743) — the content is inside a flex child with
`overflow-y:auto` (`flex:1; min-height:0`). The window has nothing to scroll, so
plain page-scroll screenshots return the same top-of-page frame every time.
Setting that container's `scrollTop` directly is also unreliable: React re-renders
reset it between the assignment and the capture, and the visual moved ~166px for a
900px assignment.

*What works:* walk from the scroll container up to `<html>` and force
`overflow:visible; height:auto; max-height:none; flex:none; position:static` on
every ancestor, and `overflow:visible; height:auto` on `html`/`body`. The document
then becomes ~1724px tall and `window.scrollTo()` behaves normally, so sections
capture reliably. Hiding `position:fixed`/`sticky` nodes stops the bottom nav
overlaying each section. Shot `01` is captured *before* this flattening, so the
real chrome is on record too.

**2. The money rail is a separate horizontal scroller** (`scrollWidth` 1650 vs
`clientWidth` 456). Flattening the vertical column does not expand it — set
`rail.scrollLeft = rail.scrollWidth` to reach the last card (shots `05`, `06`).

**3. Local rendering needs a Maps key** or `app/home.js` returns its "Almost
there" gate instead of the app. A throwaway placeholder value in `.env.local` is
enough — it only has to be non-empty. `.env.local` and `.vercel` are both covered
by `.gitignore` (`.env*`, `.vercel`), and were deleted after capture regardless:
this worktree shares `.git` with the owner's clone.
