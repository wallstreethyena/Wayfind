// lib/exploreMenu.js — the "Explore near you" home menu (v5.84).
//
// Five tiles, fixed benefit copy (NO live stats/claims — this replaces the
// computeTileSubline digest that made unverifiable "17 open right now / 4.9
// stars" claims), and a deterministic time-based reorder. The ordering is a
// PURE, injectable function so the 15:32 / 15:33:00 / 15:33+ boundary is
// unit-testable without touching the wall clock.
//
// Product decision (do not "improve" the copy into a promise): every subline
// is a user-benefit, not a claim we can't substantiate. The labels are two
// words, active, and read like a helpful local recommendation.

// key -> { compact label, benefit subline, NavIcon name, openCurated kind }.
export const EXPLORE_TILES = {
  today: { label: "Today's Best", sub: "A short list for a good day out.", icon: "attractions", kind: "today" },
  food:  { label: "Eat Well",     sub: "Good food without the endless scroll.", icon: "food", kind: "food" },
  shop:  { label: "Shop Local",   sub: "Local finds worth a browse.", icon: "shopping", kind: "shopping" },
  stay:  { label: "Stay Tonight", sub: "Easy places to land tonight.", icon: "hotels", kind: "stays" },
  night: { label: "Night Out",    sub: "Live plans worth leaving for.", icon: "nightlife", kind: "nightlife" },
};

// Base order before the cutoff; evening order at/after it. "Today's Best" is
// always first; at 3:33 PM local, "Night Out" jumps to #2.
const ORDER_DAY = ["today", "food", "shop", "stay", "night"];
const ORDER_EVENING = ["today", "night", "food", "shop", "stay"];

// The deterministic first-paint order. The time-of-day reorder must NOT run
// during the render body (server SSR time vs client hydration time would
// diverge across the cutoff → hydration mismatch). Render this default, then
// swap in orderExploreMenu() from a post-mount effect.
export const EXPLORE_ORDER_DEFAULT = ORDER_DAY.slice();

// 3:33 PM, INCLUSIVE — at 15:33:00 the evening order applies.
export const CUTOFF_MINUTES = 15 * 60 + 33;

// The five tile keys in display order.
//   now              — a Date (injected; never captured inside, so this is pure).
//   tzOffsetMinutes  — the selected location's UTC offset (Google's
//                      utcOffsetMinutes) when known; when null/undefined the
//                      device-local time is used. NOTE: the app stores no
//                      per-location IANA timezone, so device-local is the honest
//                      fallback the spec calls for (correct for an on-location
//                      user; a nearby place's offset refines it when available).
export function orderExploreMenu(now, tzOffsetMinutes) {
  let minutes;
  if (typeof tzOffsetMinutes === "number" && isFinite(tzOffsetMinutes)) {
    const loc = new Date(now.getTime() + tzOffsetMinutes * 60000);
    minutes = loc.getUTCHours() * 60 + loc.getUTCMinutes();
  } else {
    minutes = now.getHours() * 60 + now.getMinutes();
  }
  return (minutes >= CUTOFF_MINUTES ? ORDER_EVENING : ORDER_DAY).slice();
}
