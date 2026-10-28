// World Cup share-card copy rotation, split out of lib/shareCards.js so the
// homepage client can import wcRotation (a tap handler on the World Cup hero)
// WITHOUT dragging shareCards -> intentPages -> collectionHeader (about 12KB gz
// of intent-page copy) into the eager "/" bundle. Dependency-free on purpose:
// scripts/check-home-bundle-splits.mjs asserts it stays that way.
// lib/shareCards.js re-exports both names, so server routes are unchanged.

// v6.25 — the World Cup "Watch the game together" share card. When someone
// shares the "Where to watch" list, the recipient sees this specific card. Per
// the master card spec, copy is NEVER baked into the image — the headline,
// subtext and button ROTATE among these owner-authored variants (chosen at
// share time, carried as ?rot= so the preview stays stable for that share).
export const WC_ROTATIONS = [
  { title: "Game on. You in?", desc: "I found some places showing the match. Let’s choose one together.", cta: "Pick our spot" },
  { title: "Watch it with me", desc: "Here are a few places showing the game. Where should we go?", cta: "Choose together" },
  { title: "Pick the spot. Bring the noise.", desc: "Let’s watch the match together. Choose where we’re going.", cta: "Pick our place" },
  { title: "Same team. Same screen.", desc: "I want to watch the game with you. Let’s find our spot.", cta: "Find our spot" },
  { title: "Big game. Better together.", desc: "Here are some places where we can watch. You pick—or I will.", cta: "See the places" },
  { title: "Where are we watching?", desc: "I found a few options for the match. Let’s make the call together.", cta: "Cast your vote" },
  { title: "One match. Two votes.", desc: "Take a look at these watch spots and help me choose.", cta: "Vote on a place" },
  { title: "Let’s make match day ours", desc: "The game is better together. Where should we watch it?", cta: "Choose our spot" },
  { title: "Meet me for the match", desc: "Here are some places showing the game. Pick your favorite.", cta: "Pick a place" },
  { title: "The match needs a plan", desc: "I found the places. Now I need your vote.", cta: "Make the call" },
];
export function wcRotation(idx) {
  const n = WC_ROTATIONS.length;
  const i = Number(idx);
  return WC_ROTATIONS[Number.isFinite(i) && i >= 0 ? i % n : 0];
}
