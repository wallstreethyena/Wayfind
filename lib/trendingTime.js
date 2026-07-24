// lib/trendingTime.js — make "trending near you" reflect what actually fits the
// current hour. wf_buzz_picks ranks purely by popularity, so at 9pm it happily
// surfaces museums and beaches that are done for the day. We DON'T have live
// open/close hours here (that would need a Places call per row), so this is an
// honest TIME-OF-DAY FIT by category — never a claimed "open now". It only
// re-weights the ranking and adds a soft, truthful descriptor; it never invents
// hours or says a specific place is open.
//
// Each category has a typical active window [open, close) in 24h local time
// (close may wrap past midnight). Inside the window a category scores high; well
// outside it drops so tonight's list leans to things you can actually do now.
// Patterns are substring-tolerant (match plurals/compounds like "attractions",
// "nightlife", "nightclub"); a few short words keep \b to avoid false hits.
const WINDOWS = [
  { key: "nightlife", re: /nightlife|nightclub|night club|\bbar\b|\bpub\b|lounge|brewery|cocktail|speakeasy|live music|\bclub\b/i, open: 17, close: 3, day: "evenings" },
  { key: "dining",    re: /restaurant|food|dining|eatery|cafe|coffee|bakery|brunch|diner|\bgrill|bistro|seafood/i, open: 8, close: 23, day: "meal times" },
  { key: "indoor",    re: /museum|gallery|\bart\b|aquarium|\bzoo\b|science|history|theater|theatre|cinema|movie/i, open: 9, close: 21, day: "daytime & evening" },
  { key: "outdoor",   re: /park|beach|trail|nature|outdoor|scenic|hiking|\bhike\b|botanical|garden|wildlife|preserve/i, open: 6, close: 19, day: "daytime" },
  { key: "attraction",re: /theme|amusement|water\s?park|attraction|landmark|monument|\btower\b|\bpier\b/i, open: 9, close: 21, day: "daytime & evening" },
  { key: "tour",      re: /\btour|cruise|kayak|\bboat|sail|airboat|walking/i, open: 8, close: 20, day: "daytime" },
];

function windowFor(category) {
  return WINDOWS.find((w) => w.re.test(String(category || ""))) || null;
}

// Is `hour` (0-23) inside [open, close), handling windows that wrap past midnight.
function inWindow(hour, w) {
  return w.close > w.open ? (hour >= w.open && hour < w.close) : (hour >= w.open || hour < w.close);
}

// Ranking multiplier for a category at the given local hour. Unknown categories
// stay neutral (1) so we never bury something just because we can't classify it.
// In-window: boosted. Out-of-window: damped (and a shoulder hour eases the edge).
export function timeScore(category, hour) {
  const w = windowFor(category);
  if (!w) return 1;
  if (inWindow(hour, w)) return 1.3;
  // shoulder: within 1h of the window edge — half penalty, not full.
  const near = inWindow((hour + 1) % 24, w) || inWindow((hour + 23) % 24, w);
  return near ? 0.8 : 0.45;
}

// A short, HONEST descriptor about when this kind of place is typically active —
// never a claim that a specific place is open. Returns "" when nothing useful.
export function timeFit(category, hour) {
  const w = windowFor(category);
  if (!w) return "";
  return inWindow(hour, w) ? "good right now" : `best at ${w.day}`;
}

// Sort buzz picks for the current hour: popularity, weighted by time-of-day fit,
// minus the owner's drive penalty (−0.2 per 5 mi past 17). Pure; returns a new
// array. `hour` defaults to the caller's local hour.
export function rankByHour(picks, hour) {
  const h = Number.isFinite(hour) ? hour : 0;
  const drive = (mi) => (mi > 17 ? Math.ceil((mi - 17) / 5) * 0.2 : 0);
  const val = (p) => ((Number(p.popularity) || 0) * 10) * timeScore(p.category, h) - drive(Number(p.distance_mi) || 0);
  return [...(Array.isArray(picks) ? picks : [])].sort((a, b) => val(b) - val(a));
}
