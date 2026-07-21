// lib/personalization.js — the engine that makes the homepage "rebuild itself." Given real
// context (local time-of-day, weekend, season, weather, and which sections actually have content),
// it returns a DETERMINISTIC ordered list of section ids to render. It orders ONLY on real signals
// and DROPS sections whose data is absent (beach when unsafe/bad weather, morning picks after 11am,
// or anything the caller marks unavailable). It never uses fabricated popularity / social / crowd /
// traffic signals — those are unsourced and intentionally excluded. Pure + deterministic; tested by
// scripts/test-personalization.mjs.

export const SECTIONS = ["live-picks", "sports", "morning-picks", "beach", "things-to-do", "food", "shopping"];

// Base importance. Live Picks always leads (the vision opens every layout with the hottest event).
const BASE = { "live-picks": 200, sports: 120, "morning-picks": 60, beach: 80, "things-to-do": 60, food: 70, shopping: 50 };

const isBadWeather = (w = {}) => w.isBad === true || /rain|storm|snow|thunder/i.test(w.condition || "");
const isGoodWeather = (w = {}) => !isBadWeather(w) && /clear|sun|warm|partly|nice|fair/i.test(w.condition || "");

// orderSections(ctx): ctx = { hour, isWeekend, season, weather:{condition,isBad}, available:{id:bool} }
export function orderSections(ctx = {}) {
  const { hour = 12, isWeekend = false, season = "summer", weather = {}, available = {} } = ctx;
  const bad = isBadWeather(weather), good = isGoodWeather(weather);
  const score = {};
  for (const id of SECTIONS) {
    let s = BASE[id] ?? 0;
    if (id === "morning-picks") s += hour < 11 ? 70 : -1000;                    // gone after 11 local
    else if (id === "beach") {
      if (bad) s -= 1000;                                                       // dropped when unsafe/bad
      else { if (good) s += 30; if (season === "summer") s += 10; if (season === "winter") s -= 10; if (isWeekend) s += 25; if (hour >= 18) s -= 40; }
    } else if (id === "food") { if (hour >= 17) s += 45; else if (hour >= 11 && hour < 15) s += 10; if (isWeekend) s += 10; }
    else if (id === "things-to-do") { if (bad) s += 40; if (isWeekend) s += 10; }
    else if (id === "shopping") { if (bad) s += 30; if (isWeekend) s += 10; if (hour >= 18) s -= 10; }
    score[id] = s;
  }
  const idx = Object.fromEntries(SECTIONS.map((id, i) => [id, i]));
  return SECTIONS
    .filter((id) => available[id] !== false && score[id] > -500)               // drop unavailable + hard-dropped
    .sort((a, b) => score[b] - score[a] || idx[a] - idx[b]);                    // deterministic tiebreak
}
