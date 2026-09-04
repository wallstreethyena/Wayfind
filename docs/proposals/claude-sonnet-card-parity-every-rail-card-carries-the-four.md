# Proposed CLAUDE.md addition — "Every rail card carries the four"

Filed here instead of CLAUDE.md directly: `scripts/check-doc-ownership.mjs` marks
CLAUDE.md owner-only for this lane. Gabriel — please fold this section into
CLAUDE.md's "Gotchas / patterns" area (or wherever you'd like it) if you agree
with it.

---

## 🧠 Every rail card carries the four (WO-B, 2026-09-03)

**THE RULE.** Every rail card — a place, an event, a sponsored placement, a
bookable tour row — renders all four of Save / Like / Dislike / Share. Owner,
verbatim: "Every rail card, regardless of what it is, should have the like,
dislike, share and save button — even if it is an event card. They all need
to have that as a global rule."

**MOST OF THIS WAS ALREADY FIXED, THE SAME DAY, BY A DIFFERENT LANE.** PR
#1097 ("Unify premium cards and upgrade event planning") landed on `main`
while this lane was mid-flight and solved the RailCard.js / IconicPlaceCard.js
half of the problem directly:

- `lib/contentCardActions.js` is a new, SEPARATE non-place signal store
  (`wf_content_card_actions_v1`) for events and tours — deliberately isolated
  from `lib/cardActions.js`'s place store so a Ticketmaster event's like or a
  Viator tour's save can never leak into place ranking.
- `RailCard.js` resolves EVERY card through it: `place` (a real Google place)
  uses the ranking-aware place store; anything else (`actionItem = {id, type,
  title, image, url}` — an event, a tour, a bookable experience) uses the
  content store. The `actionsReadOnly` prop is now DEAD — kept only so legacy
  callers don't need a simultaneous edit — because the content store always
  resolves SOME id (falling back to `href` or `title` when nothing more
  specific exists), so there is no longer a "genuinely nothing to act on"
  case for this component. No `disabled` state, no reason string: every
  control is live.
- `IconicPlaceCard.js`'s `cardActionsReadOnly` now routes through the SAME
  content store (keyed by the place's own id) instead of hiding Like/Dislike
  while leaving Save/Share live against whatever the parent wired — closing a
  live bug where a sponsor row with no verified place-store key
  (`DaypartRail`'s `paidHasStoreKey`) could still write a save/share under the
  sponsor's bogus id.
- Every tour/event rail on `main` (`BestNearby`, `SummerPicksRails`,
  `HomeAffiliateActivityRail`, `ViatorRail`, `FallIntentRails`) was converted
  from `actionsReadOnly` to `actionItem={...}` in the same PR.
- `scripts/check-card-actions.mjs` (Section 5) pins this architecture with
  static-source assertions: the content-store import, the dead
  `actionsReadOnly` row-hiding pattern's absence, Share always calling its
  resolved handler.

**WHAT WAS STILL MISSING** — verified by re-auditing `origin/main` after that
PR landed, before writing a single new line: two components draw their OWN
action row from scratch instead of going through `RailCard`/`IconicPlaceCard`,
and neither was touched by #1097 because nothing in it enumerates card
components — only render SITES that pass `onSave`/`onLike`/etc. into
`RailCard`/`IconicPlaceCard`:

- **`app/components/SponsoredPlaceCard.js` had ZERO of the four controls.**
  Fixed the same way `DaypartRail` already wires a paid `IconicPlaceCard` row
  (its `paidHasStoreKey` condition, unchanged on `main`): `SPONSORED_PLACES`
  REQUIRES a verified `placeId` on every entry
  (`scripts/check-sponsored-places.mjs` pins that), so this card is treated
  as an ORDINARY PLACE for these four controls — the real, ranking-aware
  place store, keyed by the sponsor's linked place id, so a save/like/dislike
  here is readable from `/p/` and Favorites exactly like an organic tap. A
  `useContentCardActions` branch is kept as the same defensive floor
  `IconicPlaceCard`'s own `cardActionsReadOnly` keeps for a sponsor with no
  linked place — unreachable while the registry invariant holds, kept so a
  violation of that invariant still renders four real controls instead of
  silently reverting to zero.
- **`app/components/ThingsToDoList.js`'s inline tour `Card`** had only Book
  and a conditionally-rendered Share — Save/Like/Dislike never existed. A
  Viator tour row is not a Google place, so it is wired through
  `lib/contentCardActions.js` — the exact non-place store `BestNearby` /
  `SummerPicksRails` / `HomeAffiliateActivityRail` / `ViatorRail` already use
  for the identical shape, keyed by `{id: r.id, type: "experience", ...}`.
  Rendered as `<span role="button">`, matching the file's own pre-existing
  Share control, because the whole card is a `<ViatorCommerceLink>` anchor and
  a `<button>` nested inside an `<a>` is invalid HTML.

**THE ENUMERATE-DON'T-LIST RULE.** The reason PR #1097 — a real, careful,
well-executed fix — still missed two live violations is that "the place
cards" was never a filesystem fact anywhere in the codebase; it was
whichever components a change touched. `scripts/
check-card-action-parity.mjs` fixes that structurally: it walks
`app/components/` and calls any file whose OWN source sets all four
`wf-place-card-{save,like,dislike,share}` classNames a "renderer" — never a
hand-typed list of filenames. A file discovered this way with no render
adapter in the guard **fails the guard**, by construction — a sixth
hand-rolled card is caught by the same mechanism that would have caught the
fourth and fifth. It then renders each covered component, through
`scripts/lib/jsxLoad.mjs` (the real component compiled from real JSX), against
every subject shape it plausibly carries (place / event / sponsored / tour),
and asserts all four controls appear in the rendered output. It red-proves
itself: a scratch copy of `IconicPlaceCard.js` has its Share control's
`className` deleted, the deletion is confirmed to have actually applied (not
a silent no-op), and the guard's own check is confirmed to go red on exactly
that control.

**Do not re-add a hand-typed "the place cards are: X, Y, Z" list anywhere in
this area.** The whole failure mode, twice in one day across two lanes, was a
list — mental or literal — that stopped at whichever components a change
happened to touch.

**A pre-existing regression found and fixed along the way, unrelated to the
two violations above but blocking a green guard suite:**
`scripts/check-rail-card-fits-its-content.mjs` still asserted that a
"read-only" tour card renders SHORTER than a card with an action row — true
before #1097, false after it (every card renders its action row now,
`actionsReadOnly` no longer removes anything). Updated the assertion to
require the two heights MATCH instead of differ, and confirmed this was
already red on a clean `origin/main` checkout before this lane changed
anything, per CLAUDE.md's "a red guard is not a red repo... reproduce on a
CLEAN tree" — reproduced on a clean tree, and it stayed red, so it needed a
real fix rather than a stale-artifact excuse.
