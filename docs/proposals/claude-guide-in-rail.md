# Proposed CLAUDE.md / AGENTS.md rule: guides ride inside rails

Owner directive, 2026-10-08:

> "I don't like how you are entering the guide in its own rail. Place it in the
> 3rd place in each of the rail system it belongs, not on an individual rail.
> The rails are the centerpiece, don't add things in between. Make sure this is
> the global rule for all of the rails."

Proposed rule text (for the owner to add; these files are owner-only):

- **Guides go INSIDE the rail they belong to, as its third card.** Never render a
  guide card (or anything else) between rails. A rail with fewer than two cards
  gets the guide last. Insert only through `lib/railGuideSlot.js`
  (`insertGuideAt` / `guideSlotIndex`), via `app/components/RailGuideSlot.js`
  for rail collections and `guideForPlaceRail` for the homepage drop. The guide
  carries no rank and is never counted as a place. Locked by
  `scripts/check-guide-in-rail.mjs`.
