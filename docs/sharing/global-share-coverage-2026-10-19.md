# Global Group Share coverage — 2026-10-19

Branch `feat/global-group-share` from `origin/main` d8edd01b. This change does
not enable Group Vote. `NEXT_PUBLIC_GROUP_PLANS_ENABLED` and
`WF_GROUP_PLANS_ENABLED` stay off; activation still needs the owner's
migration, hosted verification, worker and email steps in
`docs/design/group-planning-activation.md`.

## What already worked

One share engine serves the site: `ShareButton` and the home shell's
`shareLink` both open `lib/shareFlow.js::openShareFlow`, which shows the
intent sheet (`Just share it`, `I'm asking someone out`, `Group Vote` for a
concrete place when enabled, `Cancel`) and then the text-first chooser
(Text message, Email, More share options, Copy link). Place cards, the place
detail sheet (44px Share), event cards, events grid, guide pages and guide
picks, saved lists, and `/l/[key]` collections already used it. Shared place
links land on `/p/[id]`; event shares keep their tracked ticket route.

## Gaps fixed here

| Surface | Before | After |
| --- | --- | --- |
| Map place preview | Share recorded analytics only; no sheet opened | Opens the shared flow for that place |
| Map event preview | No Share action | `Share this event` opens the shared flow |
| Itinerary trip | Places shareable; the trip itself was not | `Share` sends the trip through the existing list share |
| Top-40 card (BestNearby) | Share recorded analytics only | Uses the caller's share or the shared card floor |
| Share sheets on desktop | Bottom-anchored sheet | Centered dialog at 720px and wider |

## Still true by design

- Events are not places, so event shares offer no Group Vote entry. Group
  plans anchor on one concrete place, verified again server-side.
- Signed-out visitors can share and copy links. Creating or viewing a group
  plan still requires sign-in, with return to the same plan afterwards.
- The blog lives in a separate repository and is out of scope for this PR.
- The home place-card Share chip is shorter than 44px. Enlarging it would
  change measured card dimensions, which are protected; left unchanged.

## Verification

- New `scripts/test-global-share-entrypoints.mjs` (15 assertions, wired in
  `scripts/guards.txt`): red when the map wiring is removed, green restored.
- Green: `test-unified-share-flow`, `test-share-out-chooser`,
  `test-group-plan-ui`, `test-group-vote-ballot`, `test-group-vote-organizer`,
  `check-guide-share`, `check-rail-share`, `check-destination-share`,
  `check-favorites-auth`, `check-card-actions`, map and detail guards,
  `npm run check:jsx`, and `next build`.
- `node scripts/run-guards.mjs` stops at `test-home-first-paint` (guard 150),
  which fails identically on unmodified `origin/main` in this environment
  because Chromium cannot launch here. Browser screenshots and a live server
  smoke test were not possible in this sandbox and remain release QA.
