// The Apple MapKit "safe area" for the Map tab, in CSS px from each edge of the
// map container. ONE source of truth for two things that must never disagree:
//
//   1. lib/appleExplorerMap.js sets `map.padding` from it, so MapKit keeps its
//      own Apple logo, "Legal" link and zoom controls inside this inset
//      rectangle (the bottom inset also clears our results sheet + tab bar).
//   2. app/components/screens/Map.js positions the "N places aren't pinned"
//      note from it, so the note can never sit on top of that attribution.
//
// Apple MapKit JS terms require the logo and legal link to stay visible and
// unobscured. MapKit draws them at the bottom-left of the padded rectangle,
// so the band from `bottom` up to `bottom + ATTRIBUTION_BAND` (full height of
// the logo + legal row, with air above) is reserved: Wayfind overlays go
// above it, never into it.
export const MAP_SAFE_PADDING = Object.freeze({ top: 150, right: 68, bottom: 150, left: 12 });
export const MAP_ATTRIBUTION_BAND = 44;
// A small map embedded in a page section (the Christmas lights map, 340px
// tall) has no app header, drawer or bottom nav over it. The full screen insets
// above would leave it about 40px of usable height and MapKit would fit the pins
// at continent zoom (owner report 2026-11-13: all of North America, one 99+
// cluster). Compact maps use these small insets instead.
export const COMPACT_MAP_PADDING = Object.freeze({ top: 16, right: 16, bottom: 28, left: 16 });

// CSS offsets for an overlay that must sit just above the attribution band.
export const MAP_NOTE_OFFSET = Object.freeze({
  left: MAP_SAFE_PADDING.left,
  right: MAP_SAFE_PADDING.right,
  bottom: MAP_SAFE_PADDING.bottom + MAP_ATTRIBUTION_BAND,
});

// The "Search this area" pill is centered at bottom:150 and ~40px tall, so its
// top edge reaches ~190 from the bottom, 4px under the note's baseline (194).
// The note used to HIDE while the pill stood (2026-10-14), which made the
// reader's "N places not pinned" disappear whenever the map had moved off its
// origin (every list map fits to its pins, so the offer is up almost at once;
// synthetic surface-parity-parrish-cafes read 0 for 19 unpinned places). The
// note now stays and the wrapper lifts this many px clear of the pill instead.
export const SEARCH_PILL_NOTE_LIFT = 12;

// 3D MapLibre path: its attribution control (OSM / OpenFreeMap / MapLibre) is
// drawn at the container's bottom edge, i.e. under the tab bar. Lift it above
// the collapsed results sheet (sheet top = 76 + 58 = 134 from the bottom;
// MapLibre adds its own 10px control margin) and keep its worst-case two-line
// height (44px) below the note's bottom edge: 128 + 10 + 44 = 182 <= 194.
export const MAPLIBRE_ATTRIBUTION_LIFT = 128;
