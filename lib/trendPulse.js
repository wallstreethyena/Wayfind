// lib/trendPulse.js — the trending pulse on place cards (owner, 2026-10-08:
// "anything that is trending i want a pulse behind the place card").
//
// ONE rule, shared by every place card renderer (RailCard, IconicPlaceCard),
// so a new rail can never invent its own idea of "trending":
//
//   a card pulses  ⇔  its row carries trending === true AND a non-empty
//                     trend_reason.
//
// Both fields are written only by lib/trendSignal.js (real demand data:
// foot traffic, nearby major events, two or more independent creators). The
// reason is required because a pulse is a public "this is trending" claim,
// and that module's integrity contract says a trending claim is always
// disclosed with its reason. A row with trending but no reason does not
// pulse. Nothing here reads a commission, booking or affiliate field.
//
// THE LOOK (app/components/css.js, `wfTrendPulse` + `.wf-place-card.is-trending`;
// no prose in the shipped CSS, so the reasons live here):
//   • An orange ring breathes out from behind the card while its edge glows.
//     box-shadow is used because the card's own overflow:hidden does not clip it.
//   • The outward ring stays within 4px: the place card rails (.wf8-pcrail,
//     .wf-rail-exploding) scroll sideways with only 4px of top padding, so a
//     wider ring is cut off there.
//   • .wf8-pcrail paint-contains its cards (contain:paint + content-visibility),
//     which would clip the ring to the card box, so a trending card opts out.
//     Only a few cards per rail trend, so the paint cost stays small.
//   • prefers-reduced-motion gets the same glow, standing still.
//
// Pure, zero deps, client safe. Locked by scripts/check-trend-pulse.mjs.

export function isTrendingPlace(place) {
  if (!place || place.trending !== true) return false;
  const reason = place.trend_reason;
  return typeof reason === "string" && reason.trim().length > 0;
}

// className suffix, same shape as fallCardClass()/awardWinnerClass():
// either "" or a leading-space class, so it concatenates into the card root.
export function trendPulseClass(place) {
  return isTrendingPlace(place) ? " is-trending" : "";
}

// The pulse itself is visual only, so screen readers get the same fact in
// words: the card's accessible name gains "Trending: <reason>".
export function trendPulseLabel(baseLabel, place) {
  const base = String(baseLabel || "");
  if (!isTrendingPlace(place)) return base;
  const reason = place.trend_reason.trim();
  return base ? base + ". Trending: " + reason : "Trending: " + reason;
}
