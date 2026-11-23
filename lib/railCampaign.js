// Short rail id for Viator campaign tags and commerce click events.
// wf-<page>-<rail>-<offer>. No click token, no place name, no personal data.
// Unknown surfaces return "" so the caller keeps its own fallback
// (viatorPlacementCode still collapses a generic home_* surface to "home").
// This is not lib/railPlacement.js, which declares which partner intent a
// static page sells.

const RAIL_PREFIXES = Object.freeze([
  [/^night_out/, "nightout"],
  [/^date_night/, "datenight"],
  [/^family_day/, "family"],
  [/^today_/, "today"],
  [/^summer_/, "summer"],
  [/^halloween/, "halloween"],
  [/^fall_recommended_hotels$/, "hotels"],
  [/^fall_/, "fall"],
  [/^christmas/, "christmas"],
  [/^home_affiliate/, "activities"],
  [/^home_events_/, "events"],
  [/^events_grid/, "events"],
  [/^trending_/, "trending"],
  [/^event_stays$/, "hotels"],
  [/^guide_stays$/, "hotels"],
  [/^hotel_/, "hotels"],
]);

export function railPlacementCode(surface) {
  const s = String(surface || "").toLowerCase();
  if (!s) return "";
  for (const [rx, code] of RAIL_PREFIXES) {
    if (rx.test(s)) return code;
  }
  return "";
}

// Place-card partner hops keep the historic iconic_place_card surface unless
// the caller already named a poster rail. That rail then survives in the
// campaign and the click event.
export function commerceSurfaceForPlaceCard(surface) {
  const s = String(surface || "");
  return railPlacementCode(s) ? s : "iconic_place_card";
}
