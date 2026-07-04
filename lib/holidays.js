// US federal holiday calendar + per-holiday curation. Pure date math, no API:
// this is what makes the yearly recurrence automatic forever. The hero card
// shows from 21 days before each holiday through the holiday itself.

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
      const start = new Date(h.date.getFullYear(), h.date.getMonth(), h.date.getDate() - 21).getTime();
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
};
const DEFAULT_THEME = { grad: "linear-gradient(135deg, #171923 0%, #23180F 100%)", border: "rgba(249,115,22,.45)", accent: "#F97316", stripe: "#F97316", text: "#FED7AA" };
export function themeFor(key) { return THEMES[key] || DEFAULT_THEME; }

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
