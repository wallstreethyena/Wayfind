// The ONE "no photo" look for every image slot (owner goal, 2026-10-14: every
// slot ends in a verified relevant photo or a deliberate, polished fallback).
//
// Pure and presentational: no hooks, no network, no state. Sized by its
// container (100% x 100%) with a min-height that is safe for a 58px rail
// thumb and for a full card. HONEST by construction: it only ever shows
// category / brand art, never anything that implies a photo of the venue.
//
//   <PhotoFallbackTile name="Joe's Crab Shack" category="food" />   -> 🍽️ tile
//   <PhotoFallbackTile icon="📍" compact />                         -> icon only
//   <PhotoFallbackTile pending />                                   -> quiet loading tile (same gradient, no text)
//
// Wayfind palette = the C tokens in app/components/kit.js (panel #161B22, card
// #1C2230). kit.js is not imported here so this stays a dependency-free leaf
// that server components, the jsxLoad harness and the browser harness can all
// load; scripts/test-image-health.mjs asserts CAT_GLYPH matches kit's CAT_ICONS.

// Same glyphs as kit.js CAT_ICONS (+ events / coffee / christmas). Keys are the section ids.
// `christmas` (2026-10-14): Christmas cards pass it as fallbackCategory.
export const CAT_GLYPH = { food: "🍽️", nightlife: "🍸", attractions: "🎡", beach: "🏖️", hotels: "🏨", shopping: "🛍️", events: "🎟️", coffee: "☕", christmas: "🎄" };

const CATEGORY_RX = [
  ["beach", /beach|natural_feature|coast|shore/],
  ["nightlife", /night|bar\b|pub\b|brewery|lounge|cocktail|club/],
  ["coffee", /coffee|cafe|café|bakery|dessert|ice.?cream/],
  ["food", /food|restaurant|eat|dining|meal|diner|taco|pizza|seafood|brunch/],
  ["hotels", /hotel|lodging|resort|stay|motel|inn\b/],
  ["shopping", /shop|store|mall|market|boutique/],
  ["events", /event|festival|concert|show/],
  ["attractions", /attraction|museum|park|zoo|aquarium|tour|activity|things.?to.?do|culture|gallery|theme/],
];

/** Category label/key -> glyph, or "" when unknown (the brand pin is used instead). */
export function categoryGlyph(category) {
  const c = String(category || "").toLowerCase();
  if (!c) return "";
  if (CAT_GLYPH[c]) return CAT_GLYPH[c];
  for (const [key, rx] of CATEGORY_RX) if (rx.test(c)) return CAT_GLYPH[key];
  return "";
}

/** The accessible name; also what the guards assert is non-empty. */
export function fallbackLabel(name, pending) {
  if (pending) return "Loading photo";
  const n = typeof name === "string" ? name.trim() : "";
  return n ? "Photo not available for " + n : "Photo not available";
}

const GRADIENT = "linear-gradient(135deg, #161B22 0%, #1C2230 55%, #232B3A 100%)";

export default function PhotoFallbackTile({ name, category, icon, compact = false, pending = false, decorative = false, caption = "Photo unavailable", className, style }) {
  const glyph = pending ? "" : (typeof icon === "string" && icon.trim()) || categoryGlyph(category);
  const size = compact ? 22 : 30;
  return (
    <div
      className={className}
      {...(decorative ? { "aria-hidden": "true" } : { role: "img", "aria-label": fallbackLabel(name, pending) })}
      data-photo-fallback={pending ? "pending" : "unavailable"}
      style={{
        boxSizing: "border-box", width: "100%", height: "100%", minHeight: compact ? 40 : 60, overflow: "hidden",
        borderRadius: "inherit", ...style,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
        background: GRADIENT, boxShadow: "inset 0 0 0 1px rgba(148,163,184,.10)", color: "#94A3B8", textAlign: "center",
      }}
    >
      {pending ? null : glyph
        ? <span aria-hidden="true" style={{ fontSize: size, lineHeight: 1, opacity: 0.85 }}>{glyph}</span>
        : <svg aria-hidden="true" width={size + 2} height={size + 2} viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" style={{ opacity: 0.5, flexShrink: 0 }}>
            <path d="M12 2.5C8.13 2.5 5 5.63 5 9.5c0 4.7 5.95 10.2 6.5 10.7a.74.74 0 0 0 1 0c.55-.5 6.5-6 6.5-10.7 0-3.87-3.13-7-7-7Z" />
            <circle cx="12" cy="9.4" r="2.4" />
          </svg>}
      {!pending && !compact && caption ? <small style={{ fontSize: 10, lineHeight: 1.3, padding: "0 6px" }}>{caption}</small> : null}
    </div>
  );
}
