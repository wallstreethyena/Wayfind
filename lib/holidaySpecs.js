// lib/holidaySpecs.js — lean per-holiday curation, closure-risk gating, and
// bounded holiday-fit scoring for lib/holidays.js (kept minimal for the "/"
// bundle budget; audit & copy helpers live in lib/holidayIntelligence.js).

const CLOSURE_HOLIDAYS = new Set(["thanksgiving", "christmas", "newyear"]);
const CLOSURE_RX = /\b(museum|science|library|city hall|courthouse|government|school|college|university|historical society|art center|cultural center|civic center|post office|bank|dmv)\b/i;
const HOLIDAY_EVENT_RX = /\b(holiday|christmas|thanksgiving|lights?|illumination|festival|parade|tree lighting|winter village|turkey trot|fireworks|celebration|botanical|garden)\b/i;
const OUTDOOR_RX = /\b(beach|riverwalk|pier|boardwalk|bayfront|waterfront|park|preserve|trail|springs|gardens?|botanical|promenade|island|marina|kayak|nature)\b/i;
const DINING_RX = /\b(restaurant|steakhouse|bistro|grille|grill|brunch|resort|hotel|supper|kitchen|dining|tavern|seafood|italian|american)\b/i;
const NYE_RX = /\b(rooftop|lounge|cocktail|bar|live music|brewery|winery|jazz|club|waterfront|pier|bayfront|downtown)\b/i;
const JUNK_RX = /\b(shopping_mall|department_store|supermarket|grocery|convenience_store|gas_station|car_wash|storage|insurance|dentist|clinic|hospital|pharmacy|auto_repair|hardware)\b/i;

export function holidayPlaceHay(p) {
  const n = String((p && p.name) || "").toLowerCase();
  const t = (Array.isArray(p && p.types) ? p.types.join(" ") : "").toLowerCase();
  const c = String((p && (p.primaryType || p.primary_type || p.category)) || "").toLowerCase();
  const l = (Array.isArray(p && p.labels) ? p.labels.join(" ") : "").toLowerCase();
  return { name: n, all: `${n} ${c} ${t} ${l}`.trim() };
}

export function isLikelyClosedOnHoliday(place, holidayKey) {
  const key = String(holidayKey || "").toLowerCase();
  if (!place || !CLOSURE_HOLIDAYS.has(key)) return false;
  if (place.openOnHoliday === true || place.holidayVerifiedOpen === true) return false;
  if (key === "thanksgiving" || key === "christmas") {
    const h = holidayPlaceHay(place);
    if (CLOSURE_RX.test(h.all) && !HOLIDAY_EVENT_RX.test(h.name)) return true;
  }
  return false;
}

const excludeClosedOrJunk = (key) => (p) => {
  if (!p || !p.name) return true;
  return JUNK_RX.test(holidayPlaceHay(p).all) || isLikelyClosedOnHoliday(p, key);
};

export const HOLIDAY_SPECS = Object.freeze({
  thanksgiving: Object.freeze({
    tag: "THANKSGIVING",
    headline: (loc) => "Thanksgiving weekend plans" + (loc ? " near " + loc : ""),
    sub: "Holiday walks, open dining, light kickoffs and family outings near you",
    queries: ["restaurants open Thanksgiving waterfront dining", "botanical gardens waterfront parks scenic walks", "holiday lights Christmas tree lighting events"],
    theme: Object.freeze({ grad: "linear-gradient(135deg, #1E130B 0%, #311B0D 55%, #16131D 100%)", border: "rgba(249,115,22,.52)", accent: "#F97316", stripe: "#EA580C", text: "#FED7AA" }),
    exclude: excludeClosedOrJunk("thanksgiving"),
    fit: (p) => {
      const h = holidayPlaceHay(p).all;
      let s = (HOLIDAY_EVENT_RX.test(h) ? 16 : 0) + (OUTDOOR_RX.test(h) ? 11 : 0) + (DINING_RX.test(h) ? 10 : 0) + (/zoo|aquarium|theme_park|garden|botanical/.test(h) ? 8 : 0);
      if (isLikelyClosedOnHoliday(p, "thanksgiving")) s -= 20;
      if (JUNK_RX.test(h)) s -= 16;
      return Math.max(-20, Math.min(s, 30));
    },
  }),
  christmas: Object.freeze({
    tag: "CHRISTMAS & HOLIDAY LIGHTS",
    headline: (loc) => "Christmas & holiday lights" + (loc ? " near " + loc : ""),
    sub: "Light displays, festive walks, holiday markets and seasonal outings near you",
    queries: ["Christmas lights holiday displays winter village", "botanical gardens holiday lights downtown tree lighting", "festive waterfront dining holiday restaurants"],
    theme: Object.freeze({ grad: "linear-gradient(135deg, #0D231B 0%, #173326 55%, #3B1219 100%)", border: "rgba(248,113,113,.50)", accent: "#F59E0B", stripe: "#DC2626", text: "#FDE68A" }),
    exclude: excludeClosedOrJunk("christmas"),
    fit: (p) => {
      const h = holidayPlaceHay(p).all;
      let s = (HOLIDAY_EVENT_RX.test(h) ? 18 : 0) + (/botanical|garden|zoo|theme_park|historic|downtown|pier|waterfront/.test(h) ? 10 : 0) + (DINING_RX.test(h) ? 7 : 0);
      if (isLikelyClosedOnHoliday(p, "christmas")) s -= 20;
      if (JUNK_RX.test(h)) s -= 16;
      return Math.max(-20, Math.min(s, 32));
    },
  }),
  newyear: Object.freeze({
    tag: "NEW YEAR'S",
    headline: (loc) => "New Year's Eve & Day" + (loc ? " near " + loc : ""),
    sub: "Waterfront countdowns, rooftops, celebratory dinners and New Year's Day resets",
    queries: ["waterfront fireworks rooftop bars New Years Eve", "best celebratory dinner live music downtown", "New Years Day brunch waterfront beaches parks"],
    theme: Object.freeze({ grad: "linear-gradient(135deg, #0E1326 0%, #1D2442 55%, #2D200C 100%)", border: "rgba(250,204,21,.48)", accent: "#FACC15", stripe: "#EAB308", text: "#FEF08A" }),
    exclude: (p) => !p || !p.name || JUNK_RX.test(holidayPlaceHay(p).all),
    fit: (p) => {
      const h = holidayPlaceHay(p).all;
      let s = (NYE_RX.test(h) ? 14 : 0) + (OUTDOOR_RX.test(h) ? 10 : 0) + (DINING_RX.test(h) ? 9 : 0) - (JUNK_RX.test(h) ? 16 : 0);
      return Math.max(-16, Math.min(s, 30));
    },
  }),
  memorial: Object.freeze({
    tag: "MEMORIAL DAY WEEKEND",
    headline: (loc) => "Memorial Day weekend" + (loc ? " near " + loc : ""),
    sub: "Beaches, springs, waterfront patios and outdoor plans near you",
    queries: ["best beaches waterfront parks springs", "waterfront restaurants tiki bars outdoor dining"],
    theme: Object.freeze({ grad: "linear-gradient(135deg, #0B192C 0%, #162E4D 55%, #3B1822 100%)", border: "rgba(96,165,250,.48)", accent: "#60A5FA", stripe: "#2563EB", text: "#DBEAFE" }),
    exclude: (p) => !p || !p.name || JUNK_RX.test(holidayPlaceHay(p).all),
    fit: (p) => {
      const h = holidayPlaceHay(p).all;
      let s = (/\bbeach\b|springs|island|waterfront|tiki|marina|kayak/.test(h) ? 15 : 0) + (OUTDOOR_RX.test(h) ? 9 : 0) + (/patio|outdoor|seafood|grill|bar/.test(h) ? 6 : 0) - (JUNK_RX.test(h) ? 15 : 0);
      return Math.max(-15, Math.min(s, 30));
    },
  }),
  labor: Object.freeze({
    tag: "LABOR DAY WEEKEND",
    headline: (loc) => "Labor Day weekend" + (loc ? " near " + loc : ""),
    sub: "Last-of-summer beaches, waterfront tables, springs and day trips near you",
    queries: ["best beaches springs waterfront parks", "waterfront dining breweries outdoor patios"],
    theme: Object.freeze({ grad: "linear-gradient(135deg, #0E1F2F 0%, #1C3544 55%, #2D1D10 100%)", border: "rgba(251,146,60,.48)", accent: "#FB923C", stripe: "#F97316", text: "#FFEDD5" }),
    exclude: (p) => !p || !p.name || JUNK_RX.test(holidayPlaceHay(p).all),
    fit: (p) => {
      const h = holidayPlaceHay(p).all;
      let s = (/\bbeach\b|springs|island|waterfront|tiki|marina/.test(h) ? 15 : 0) + (OUTDOOR_RX.test(h) ? 9 : 0) + (DINING_RX.test(h) ? 6 : 0) - (JUNK_RX.test(h) ? 15 : 0);
      return Math.max(-15, Math.min(s, 30));
    },
  }),
});
