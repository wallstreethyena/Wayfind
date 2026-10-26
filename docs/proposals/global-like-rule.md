# The Global Like Rule

Status: **ADOPTED**, 2026-10-26 (owner-directed close-out of #1957).
Implemented in #1957 (`fix/global-like-buttons`) and completed the same
week by the like-everywhere convergence: guide cards, intent pages, and
Trending Now now run the same store/rules (this file is the standing
engineering guidance for place thumbs; `scripts/check-like-global.mjs`
enforces it in CI).

## The rule

Every thumbs up / thumbs down on every place card on Wayfind is one feature,
not one feature per page:

1. **One shared path.** Place cards render through the shared card
   components (`IconicPlaceCard`, `RailCard`, the home shell's card) and all
   of them write through one store: `lib/cardActions.js` +
   `lib/likeSignal.js` outside the home shell, the shell's own toggles
   inside it — both over the same localStorage maps, the same Supabase
   tables (`likes`, `saved_places` "Disliked"), and the same reconcile.
   No card variant, rail, seasonal skin, event page, stay card, search
   result, map sheet, guide pick, favorites list, or detail sheet may keep
   its own copy of the like logic.
2. **Instant, then saved, or honestly rolled back.** A tap fills the thumb
   immediately. Signed-in, it upserts `likes` on `(user_id, place_id)`
   (deletes on unlike). If the write fails, the button returns to exactly
   how it was and the visitor sees "Couldn't save that — check your
   connection and try again." Never a silent failure.
3. **Like and dislike cancel each other.** One sentiment per place per
   person, enforced in the persist layer, not per card.
4. **One truth, everywhere.** Signed in, the shared store loads the
   account's likes once per session and reconciles them with the device
   (3-way merge with a base snapshot, `wf_liked_base` / `wf_disliked_base`):
   a like made anywhere shows on every card, detail page, and device, and
   survives refresh and return visits. An empty or wiped local store never
   deletes server rows.
5. **No duplicates, no stuck states.** The `(user_id, place_id)` unique
   constraint makes duplicate rows impossible; fast double taps toggle the
   one row; two cards for the same place on one screen read the same store
   snapshot and update together.
6. **Signed out stays device-local.** Signed-out likes live on the device
   (current behavior, kept) and merge into the account at sign-in with no
   duplicates. Personalization is never presented as a signed-out feature.
7. **Measured once.** Every like, unlike, dislike, and undislike fires the
   existing PostHog events (`like` / `dislike`) with `place_id`, `surface`,
   card `position`, and `on` for direction. No second event name.
8. **Scores are untouched.** Personal likes never move the Wayfind Score
   shown to other people. The owner's curator pick remains the existing
   reviewed server pipeline, unchanged by this rule.

## Why

On 2026-10-25 the owner liked cards on the Selby Spooktacular event page
and the likes "did not stick." Root cause, proven live: the standalone card
store read only the browser's localStorage and never loaded the signed-in
user's database likes, so cards outside the home shell could show — and
toggle from — the wrong state; write failures were swallowed silently; and
an early tap could race the lazy sign-in load and never reach the database.

## Enforcement

- `scripts/check-like-global.mjs` fails the build if a new file renders a
  place thumb without the shared store, if a `persistLike`/`persistDislike`
  caller outside the store skips the convergence (server sync + shared
  deltas + rollback), if guide cards rewire their own like handlers, or if
  the sync/rollback wiring is removed.
- Wired surfaces that keep React state (`IntentPageClient`,
  `TrendingNowClient`) converge through `lib/useReactionSync.js`
  (`useReactionServerSync` + `rollbackReactionOnError`). Guide cards
  (`GuidePlaceCard`) wire no like handlers at all — the shared store in
  `IconicPlaceCard` owns their thumbs.
- `scripts/test-like-global-sync.mjs` exercises the reconcile: remote likes
  arrive, local likes push up, removals delete remotely, empty local wipes
  nothing, failed writes surface for rollback.
- `scripts/check-like-store-writes.mjs` and
  `scripts/test-card-store-coherence.mjs` keep the home shell and the card
  store from erasing each other's writes.

## Not in scope

Event thumbs ("Like this event") rate events, not places, and keep their
own on-device store. No schema change was needed: the
`(user_id, place_id)` unique constraint and upsert conflict target already
exist and are verified live.
