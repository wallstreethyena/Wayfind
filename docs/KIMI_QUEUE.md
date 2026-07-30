# KIMI queue — product decisions waiting on an owner call

Questions that engineering **deliberately did not answer**, because answering them would
have meant making a product decision inside a technical PR.

**Format:** newest first. Each entry states the question, what is true today, why it was
not decided in-flight, and what unblocks. When an entry is answered, record the decision
and who made it, then strike it — do not delete the history; a queue with no record of
past answers gets the same question re-asked.

---

## 2. The converted experiences chooser needs an entry point

**Question:** where does the experiences/occasions chooser open from, and does it show
`EXPERIENCES` or `INTENTS`?

These are filed as one entry on purpose — they are the same product question. Deciding
the tile set without deciding the entry point leaves a styled surface nobody can reach;
deciding the entry point without the tile set means wiring a door to a room whose
contents are still undecided.

**What is true today:**

- `sheets/Menu.js` has two sub-states left: `pick` (Wayfind Roulette) and `experiences`
  (the Occasions chooser). It had six; the other four were unreachable and were deleted
  (PR #480).
- `menuSheet` is written in exactly two places: `setMenuSheet("pick")` in `app/home.js`,
  and `setMenuSheet("experiences")` — which lived inside the now-deleted `menu` block.
- So **`experiences` has no reachable setter.** It is correctly styled — it wears the
  same `CollectionHero` as the experience screen, the single-pick screen and every
  standalone collection route (PR #478) — and it is currently dead UI.
- It renders the `INTENTS` tiles ("Hungry", "Date Night", "Family Time", …) plus a
  Surprise Me tile. `EXPERIENCES` is the *other* table (16 rows: Great Outdoors, Hidden
  Gems, …), and the surface people reach for by name is "all experiences".

**Why it was not decided in-flight:** PR #478 was a styling conversion. Swapping the tile
set changes what the surface offers, and inventing an entry point decides where a feature
lives in the navigation. Neither belongs in a restyle.

**What unblocks it:** an answer to both halves. If the answer needs `app/home.js` wiring
(a nav tile, a URL param, a card tap), it comes back to the Claude Opus session.

**Prior art worth not repeating:** a sheet in `app/home.js` rendered an "All experiences"
grid and was deleted in PR #478 because `setAllExpOpen(true)` appeared zero times. That
surface existed, looked finished, and had never been opened by anyone. Whatever is decided
here, the entry point is the part that makes it real.

---

## 1. Should the experiences chooser offer `EXPERIENCES` instead of `INTENTS`?

Folded into entry 2 above — they are the same decision and are tracked together. Kept as
a separate heading only because it was filed first, so the cross-reference resolves.
