// US federal holiday calendar + per-holiday curation. Pure date math, no API:
// this is what makes the yearly recurrence automatic forever. The hero card
// shows from 28 days (4 weeks) before each holiday through the holiday itself,
// then clears at midnight ending the holiday day.

import { curatedFor } from "./wc.js";

// GLOBAL RULE (v6.15) — TRUTHFUL CLAIM: a "Where to watch" venue must have a
// real screens/TV/sports-viewing signal. A restaurant/grill/steakhouse with no
// bar and no screens is NOT a watch spot, however good its food or how loudly
// its cuisine matches the tournament. Eligibility = hand-curated evidence
// (lib/wc.js) OR an explicit screens signal OR a real bar/pub/sports identity.
// Cuisine alone (a Brazilian churrascaria) never qualifies.
const WC_SCREENS_RX = /sports ?bar|big ?screens?|\btvs?\b|televisions?|watch (party|bar)|projector|game ?day|screening|show(ing|s) the (game|match|matches)/;
const WC_BAR_RX = /night_?club|\bbar\b|_bar\b|\bpub\b|_pub\b|tavern|brew ?pub|brewery|brewing|brewhouse|taproom|tap room|beer ?garden|ale ?house|draft ?house|gastropub|saloon|cantina/;
export function worldCupEligible(p) {
  if (!p || !p.name) return false;
  if (curatedFor(p.name)) return true; // hand-verified watch setup
  const name = String(p.name).toLowerCase();
  const types = (Array.isArray(p.types) ? p.types.join(" ") : "").toLowerCase();
  const hay = name + " " + types;
  return WC_SCREENS_RX.test(hay) || WC_BAR_RX.test(hay);
}

function nthWeekday(year, month, weekday, n) {
  const first = new Date(year, month, 1);
  let day = 1 + ((7 + weekday - first.getDay()) % 7) + (n - 1) * 7;
  return new Date(year, month, day);
}
function lastWeekday(year, month, weekday) {
  const last = new Date(year, month + 1, 0);
  return new Date(year, month, last.getDate() - ((7 + last.getDay() - weekday) % 7));
}

export function holidaysFor(year) {
  return [
    { key: "newyear", name: "New Year's Day", emoji: "\uD83C\uDF8A", date: new Date(year, 0, 1) },
    { key: "mlk", name: "MLK Day", emoji: "\uD83D\uDD4A\uFE0F", date: nthWeekday(year, 0, 1, 3) },
    { key: "presidents", name: "Presidents' Day", emoji: "\uD83C\uDDFA\uD83C\uDDF8", date: nthWeekday(year, 1, 1, 3) },
    { key: "memorial", name: "Memorial Day", emoji: "\uD83C\uDF96\uFE0F", date: lastWeekday(year, 4, 1) },
    { key: "juneteenth", name: "Juneteenth", emoji: "\u2728", date: new Date(year, 5, 19) },
    { key: "july4", name: "4th of July", emoji: "\uD83C\uDF86", date: new Date(year, 6, 4) },
    { key: "labor", name: "Labor Day", emoji: "\uD83C\uDF89", date: nthWeekday(year, 8, 1, 1) },
    { key: "columbus", name: "Columbus Day", emoji: "\uD83C\uDF42", date: nthWeekday(year, 9, 1, 2) },
    { key: "veterans", name: "Veterans Day", emoji: "\uD83C\uDF96\uFE0F", date: new Date(year, 10, 11) },
    { key: "thanksgiving", name: "Thanksgiving", emoji: "\uD83E\uDD83", date: nthWeekday(year, 10, 4, 4) },
    { key: "christmas", name: "Christmas", emoji: "\uD83C\uDF84", date: new Date(year, 11, 25) },
  ];
}

export function activeHoliday(now) {
  const t = now.getTime();
  for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
    for (const h of holidaysFor(y)) {
      const start = new Date(h.date.getFullYear(), h.date.getMonth(), h.date.getDate() - 28).getTime();
      const end = new Date(h.date.getFullYear(), h.date.getMonth(), h.date.getDate(), 23, 59, 59).getTime();
      if (t >= start && t <= end) return { ...h, year: y };
    }
  }
  return null;
}

const CONTENT = {
  july4: {
    tag: "4TH OF JULY",
    headline: (loc) => "The best fireworks near " + (loc || "you"),
    sub: "Top viewing spots and shows, curated for the holiday",
    queries: ["4th of July fireworks shows", "best fireworks viewing spots", "waterfront park fireworks viewing"],
    exclude: (p) => { const n = ((p && p.name) || "").toLowerCase(); const retail = ((p && p.types) || []).some((x) => /store|shop/.test(x)); return retail && /firework/.test(n); },
  },
  worldcup: {
    tag: "FIFA WORLD CUP 2026",
    headline: (loc) => "Where to watch near " + (loc || "you"),
    sub: "The best watch parties near you, live through the July 19 final",
    queries: ["sports bar big screen tv", "world cup watch party bar", "soccer bar pub", "brazilian restaurant bar"],
    // TRUTHFUL CLAIM guardrail: the "brazilian restaurant bar" query pulls in
    // churrascarias with no TVs — keep only venues with a real screens/bar
    // signal (or curated evidence). A no-signal restaurant can never enter.
    exclude: (p) => !worldCupEligible(p),
  },
};
const DEFAULT_CONTENT = (name) => ({
  tag: name.toUpperCase(),
  headline: (loc) => "The best of " + name + " weekend" + (loc ? " in " + loc : ""),
  sub: "Top picks for the holiday, near you",
  queries: ["best things to do this weekend", "top attractions and parks"],
  exclude: () => false,
});
export function contentFor(key, name) { return CONTENT[key] || DEFAULT_CONTENT(name); }

const THEMES = {
  july4: { grad: "linear-gradient(135deg, #0A1128 0%, #1B2A4A 55%, #5A1E2B 100%)", border: "rgba(228,64,95,.55)", accent: "#FF6B6B", stripe: "#B22234", text: "#FFD7D7" },
  worldcup: { grad: "linear-gradient(135deg, #0B3D2E 0%, #08251C 55%, #05100C 100%)", border: "rgba(232,184,75,.5)", accent: "#F97316", stripe: "#E8B84B", text: "#EBD9A8" },
};
const DEFAULT_THEME = { grad: "linear-gradient(135deg, #171923 0%, #23180F 100%)", border: "rgba(249,115,22,.45)", accent: "#F97316", stripe: "#F97316", text: "#FED7AA" };
export function themeFor(key) { return THEMES[key] || DEFAULT_THEME; }

// 2026 World Cup: a one-time fixed window (not annual), so it lives here rather
// than in the recurring holiday list. Card shows June 11 through the July 19 final.
export function worldCup(now) {
  const t = now.getTime();
  const start = new Date(2026, 5, 11).getTime();
  const end = new Date(2026, 6, 19, 23, 59, 59).getTime();
  if (t >= start && t <= end) return { key: "worldcup", name: "World Cup", emoji: "⚽", date: new Date(2026, 6, 19), year: 2026 };
  return null;
}

// Fixed knockout calendar (dates are locked even though teams are not):
// R16 Jul 4-7, QF Jul 9-11, SF Jul 14-15, bronze Jul 18, final Jul 19.
// Uses the viewer's local date, which is correct for a US-audience card.
const WC_MATCH_DAYS = new Set(["2026-07-04","2026-07-05","2026-07-06","2026-07-07","2026-07-09","2026-07-10","2026-07-11","2026-07-14","2026-07-15","2026-07-18","2026-07-19"]);
// v4.28: days until the next match day (0 = today). Infinity when the
// tournament window has no remaining fixtures. Cards show at <= 2.
export function worldCupDaysToNext(now) {
  const d = now || new Date();
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  let best = Infinity;
  for (const k of WC_MATCH_DAYS) {
    const [y, m, dd] = k.split("-").map(Number);
    const t = new Date(y, m - 1, dd).getTime();
    if (t >= today) best = Math.min(best, Math.round((t - today) / 864e5));
  }
  return best;
}

export function worldCupMatchToday(now) {
  const d = now || new Date();
  const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  return WC_MATCH_DAYS.has(key);
}

// Holiday-fit scoring: how well a place suits THIS holiday, read only from
// signals the data actually carries (name, Google types, labels). Bounded on
// purpose, so it reorders comparable places without letting a weak one
// leapfrog a clearly better one. Add a key per holiday to make its card smart.
const FIT = {
  july4: (p) => {
    const name = (((p && p.name) || "")).toLowerCase();
    const types = (Array.isArray(p && p.types) ? p.types.join(" ") : "").toLowerCase();
    const labels = (Array.isArray(p && p.labels) ? p.labels.join(" ") : "").toLowerCase();
    const hay = name + " " + labels;
    let s = 0;
    // Open water and elevated, open-sky spots are what "best fireworks viewing" means.
    if (/waterfront|lakefront|riverfront|lakeside|bayfront/.test(hay)) s += 15;
    if (/\b(lake|river|bay|harbor|marina|pier|boardwalk|promenade|riverwalk|beach|waterway)\b/.test(hay)) s += 10;
    if (/\bpark\b|scenic|overlook|rooftop|downtown|esplanade|commons/.test(hay) || /park|natural_feature/.test(types)) s += 8;
    if (/tourist_attraction|point_of_interest|stadium|amphitheatre|amphitheater/.test(types)) s += 4;
    if (/firework/.test(name)) s += 12;
    // Indoor / retail = poor viewing.
    if (/shopping_mall|department_store|\bmall\b|indoor|movie_theater|supermarket|\bstore\b/.test(hay + " " + types)) s -= 12;
    return Math.max(-15, Math.min(s, 32));
  },
  worldcup: (p) => {
    // v6.15 — reward VERIFIED viewing signal, never cuisine alone. Curated
    // evidence and real screens/sports-bar identity carry the score; a bare
    // "brazil/latin" name gets nothing on its own (the eligibility gate keeps
    // no-signal restaurants out entirely; this only orders the eligible ones).
    const name = (((p && p.name) || "")).toLowerCase();
    const types = (Array.isArray(p && p.types) ? p.types.join(" ") : "").toLowerCase();
    const hay = name + " " + types;
    let s = 0;
    if (curatedFor(p && p.name)) s += 20;                                   // hand-verified watch spot
    if (/sports ?bar/.test(hay)) s += 16;
    if (WC_SCREENS_RX.test(hay)) s += 12;                                   // explicit screens/TVs/watch-party
    if (/\bpub\b|_pub\b|tavern|brew ?pub|brewery|brewing|taproom|beer ?garden|ale ?house|draft ?house|gastropub/.test(hay)) s += 8;
    if (/rooftop|stadium|social|sky bar/.test(name)) s += 4;
    // A brazilian/latin identity only helps when there is ALSO a bar/screen
    // signal (an eligible venue) — never a standalone cuisine boost.
    if (/brazil|brasil|latin|irish|english pub/.test(name) && WC_BAR_RX.test(hay)) s += 4;
    if (/cafe|bakery|coffee|ice_cream|dessert/.test(hay)) s -= 8;
    return s;
  },
};
export function fitFor(key, place) { const f = FIT[key]; return f ? f(place) : 0; }

// Editorial pins: the spots you personally know are the real answer for a
// holiday in a given market. A large, deliberate boost to force them to the
// top. They only fire where the named place actually exists in results, so a
// pin for one market never affects another.
const PINS = {
  july4: ["lake eola park"], // downtown Orlando's Fireworks at the Fountain — verify the current-year event before leaning on it
};
export function pinFor(key, place) {
  const pins = PINS[key]; if (!pins || !pins.length) return 0;
  const n = (((place && place.name) || "")).toLowerCase();
  return pins.some((k) => n.indexOf(k) !== -1) ? 50 : 0;
}
