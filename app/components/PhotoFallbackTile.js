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

/** Category label/key -> section key ("food", "beach", ...), or "" when unknown. */
export function categoryKey(category) {
  const c = String(category || "").toLowerCase();
  if (!c) return "";
  if (CAT_GLYPH[c]) return c;
  for (const [key, rx] of CATEGORY_RX) if (rx.test(c)) return key;
  return "";
}

/** Category label/key -> glyph, or "" when unknown (the brand pin is used instead). */
export function categoryGlyph(category) {
  const k = categoryKey(category);
  return k ? CAT_GLYPH[k] : "";
}

/** The accessible name; also what the guards assert is non-empty. */
export function fallbackLabel(name, pending) {
  if (pending) return "Loading photo";
  const n = typeof name === "string" ? name.trim() : "";
  return n ? "Photo not available for " + n : "Photo not available";
}

// Owner, 2026-11-27: "we cannot have a broken site". The old tile was a flat
// slate box with "Photo unavailable" printed in it, which read as a broken
// image. The tile is now a designed, category-tinted card: a deep gradient in
// the category's colour, a soft light bloom, a faint diagonal texture and the
// category glyph in a glass medallion. Still HONEST: it never shows anything
// that could pass for a photograph of the venue, and the accessible name still
// says no photo is available. [deep, mid, accent] per section key.
export const TILE_THEMES = {
  food: ["#2B0F0B", "#7A2412", "#FF8A4C"],
  coffee: ["#22150E", "#5E3720", "#E9AE73"],
  nightlife: ["#140B29", "#43196B", "#C47BFF"],
  beach: ["#04222F", "#0A5F7C", "#5BD6EC"],
  attractions: ["#25112B", "#6E2850", "#FFB86E"],
  hotels: ["#0F1630", "#2F3B73", "#A5B8FF"],
  shopping: ["#2C0D24", "#7D1C53", "#FF85BE"],
  events: ["#1B0D2E", "#5E1C70", "#FF6AA8"],
  christmas: ["#25060E", "#721127", "#F2B9A0"],
  brand: ["#170F1C", "#4E1B3F", "#FD5F00"],
};

/** The tile's CSS background for a section key (unknown -> Wayfind brand). */
export function tileBackground(key) {
  const [deep, mid, accent] = TILE_THEMES[key] || TILE_THEMES.brand;
  return [
    `radial-gradient(120% 85% at 88% 0%, ${accent}59 0%, ${accent}00 58%)`,
    `radial-gradient(90% 75% at 0% 100%, ${mid}d9 0%, ${mid}00 62%)`,
    "repeating-linear-gradient(135deg, rgba(255,255,255,.035) 0 2px, rgba(255,255,255,0) 2px 14px)",
    `linear-gradient(160deg, ${mid} 0%, ${deep} 72%)`,
  ].join(", ");
}

export default function PhotoFallbackTile({ name, category, icon, compact = false, pending = false, decorative = false, caption = null, className, style }) {
  const key = categoryKey(category) || (icon === CAT_GLYPH.christmas ? "christmas" : "");
  const glyph = pending ? "" : (typeof icon === "string" && icon.trim()) || categoryGlyph(category);
  const size = compact ? 20 : 30;
  const disc = compact ? 36 : 64;
  return (
    <div
      className={className}
      {...(decorative ? { "aria-hidden": "true" } : { role: "img", "aria-label": fallbackLabel(name, pending) })}
      data-photo-fallback={pending ? "pending" : "unavailable"}
      data-tile-theme={key || "brand"}
      style={{
        boxSizing: "border-box", width: "100%", height: "100%", minHeight: compact ? 40 : 60, overflow: "hidden",
        borderRadius: "inherit", ...style,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
        background: tileBackground(key), boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)", color: "rgba(255,255,255,.78)", textAlign: "center",
      }}
    >
      {pending ? null : (
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: disc, height: disc, maxWidth: "70%", maxHeight: "70%", aspectRatio: "1 / 1", borderRadius: "50%", flexShrink: 0, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.24)", boxShadow: "0 8px 24px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.18)" }}>
          {glyph
            ? <span style={{ fontSize: size, lineHeight: 1 }}>{glyph}</span>
            : <svg width={size + 2} height={size + 2} viewBox="0 0 24 24" fill="none" stroke="#FD5F00" strokeWidth="1.8" style={{ flexShrink: 0 }}>
                <path d="M12 2.5C8.13 2.5 5 5.63 5 9.5c0 4.7 5.95 10.2 6.5 10.7a.74.74 0 0 0 1 0c.55-.5 6.5-6 6.5-10.7 0-3.87-3.13-7-7-7Z" />
                <circle cx="12" cy="9.4" r="2.4" />
              </svg>}
        </span>
      )}
      {!pending && !compact && caption ? <small style={{ fontSize: 10, lineHeight: 1.3, padding: "0 6px", color: "rgba(255,255,255,.72)" }}>{caption}</small> : null}
    </div>
  );
}
