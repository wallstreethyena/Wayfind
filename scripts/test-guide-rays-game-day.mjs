#!/usr/bin/env node
/**
 * test-guide-rays-game-day — content lock for "Tampa Bay Rays Game Day at
 * Tropicana Field" (drafted 2026-10-21). Shared /guides/[slug] template.
 * Checks: every row carries a dated source or an explicit no-source notice,
 * the 2026 venue and World Series facts, no invented hangouts, exact game
 * affiliate ticket destinations, no ticket-price claims, and an exact-subject credited hero.
 */
import { readFileSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { guideHero } from "../lib/guideHero.js";
import { guideIntent } from "../lib/guideCta.js";
import { guideKinds } from "../lib/guideRailTopics.js";
import { GUIDE_PLACE_RAILS } from "../lib/guidePlaceRails.js";
import { RAYS_GAME_DAY_ROWS, RAYS_GAME_DAY_SOURCES, RAYS_WORLD_SERIES_GAMES } from "../lib/guidesRaysGameDay2026.js";

const SLUG = "tampa-bay-rays-game-day-tropicana-field";
let checks = 0;
const failures = [];
const ok = (cond, msg) => { if (cond) checks++; else failures.push(msg); };
const forbids = (text, phrase) => !text.toLowerCase().includes(phrase.toLowerCase());

const g = GUIDES[SLUG];
ok(!!g, "guide is registered");
ok(g?.title === "Tampa Bay Rays Game Day at Tropicana Field", "title");
ok(g && g.editorialMode !== true && !g.placeRail && !(SLUG in (GUIDE_PLACE_RAILS || {})), "no editorialMode, no place rail");
ok(guideIntent(g) === "none", "no invented Book/Tickets primary CTA");
ok(guideKinds(SLUG).join() === "events", "classified as events");
ok(!g?.picks?.some((p) => p.placeId || p.bookQuery || p.viatorUrl || p.hotel), "no place ids or partner booking fields");
ok(g?.picks?.length === RAYS_GAME_DAY_ROWS.length + 7 && g.picks.length === 35, "7 games and 28 editorial rows (" + g?.picks?.length + ")");

for (const [key, s] of Object.entries(RAYS_GAME_DAY_SOURCES)) {
  ok(/^https:\/\//.test(s.url) && s.date && s.label, "source " + key + " has url, label and date");
  ok(g.sources.some((x) => x.url === s.url), "source " + key + " is listed in the sources section");
}
RAYS_GAME_DAY_ROWS.forEach((row, i) => {
  const blurb = g.picks[i + 7].blurb;
  if (row.sources.length) {
    ok(row.sources.every((k) => RAYS_GAME_DAY_SOURCES[k] && blurb.includes(RAYS_GAME_DAY_SOURCES[k].url)), "row " + (i + 1) + " shows every source URL");
    ok(/\((read )?\d{4}|\(\w+ \d{4}\)|\(2026 season\)/.test(blurb), "row " + (i + 1) + " shows a source date");
  } else {
    ok(/no sourced material found/.test(blurb), "row " + (i + 1) + " says it has no source");
  }
});

// Independent published mapping: a wrong game ID/date or a generic artist page fails.
const expectedGames = [
  ["2026-10-23", "Z7r9jZ1AAZEj_"], ["2026-10-24", "Z7r9jZ1AAZEjO"],
  ["2026-10-26", "Z7r9jZ1AAZsP9"], ["2026-10-27", "Z7r9jZ1AAZsPb"],
  ["2026-10-28", "Z7r9jZ1AAZsP_"], ["2026-10-30", "Z7r9jZ1A7JpPs"],
  ["2026-10-31", "Z7r9jZ1AAZEj-"],
];
const { guidePickTicket } = await import("../lib/guidePickTicket.js");
const { ticketOutUrl } = await import("../lib/affiliates.js");
expectedGames.forEach(([date, id], i) => {
  const pick = g.picks[i];
  const ticket = guidePickTicket(pick.ticket);
  ok(!!ticket && ticket.affiliate, "game " + (i + 1) + " renders a shared affiliate ticket button");
  const go = new URL(ticket.href, "https://www.gowayfind.com");
  const dest = go.searchParams.get("url");
  ok(go.pathname === "/api/ticketmaster/go" && dest === "https://www.ticketmaster.com/event/" + id, "game " + (i + 1) + " exact event destination");
  ok(go.searchParams.get("offer") === "tm_" + id && go.searchParams.get("content").endsWith(":game-" + (i + 1)), "per-game funnel identity");
  const impact = new URL(ticketOutUrl(dest, go.searchParams.get("surface")));
  ok(impact.hostname === "ticketmaster.evyy.net" && impact.pathname === "/c/7475855/264167/4272" && impact.searchParams.get("u") === dest, "game " + (i + 1) + " retains Wayfind Impact attribution and exact destination");
  ok(RAYS_WORLD_SERIES_GAMES[i].date === date, "verified date " + date);
  ok((/if necessary/i.test(pick.name)) === (i >= 4), "only games 5–7 conditional");
  ok(pick.eyebrow.includes(i >= 2 && i <= 4 ? "St. Petersburg, Florida" : "Milwaukee, Wisconsin"), "correct city, including away games");
});
ok(new Set(g.picks.slice(0, 7).map(p => p.ticket.href)).size === 7, "seven distinct game links");
const all = JSON.stringify(g);
ok(/April 6, 2026/.test(all) && /Steinbrenner Field/.test(all) && /2025/.test(all), "2026 venue: Trop reopened April 6, 2026 after 2025 at Steinbrenner");
ok(/1998/.test(all) && /Devil Rays/.test(all) && /After the 2007 season/.test(all), "founding and name change");
ok(/Phillies in five games/.test(all) && /Dodgers in six games/.test(all), "2008 and 2020 World Series results");
ok(/Brewers/.test(all) && /October 26/.test(all) && /October 27/.test(all) && /only if necessary/.test(all), "2026 World Series at the Trop, Game 5 conditional");
ok(/small cowbells/i.test(all) && /Cownose Clubhouse/.test(all) && /Ballpark Mojito/.test(all), "founder-requested atmosphere, traditions and drinks are sourced rows");
ok(/does not name one/.test(all) && /does not list any/.test(all) && /does not name a 'best seat'/.test(all), "unsourced sections say so");
ok(forbids(all, "$787") && forbids(all, "sold out") && forbids(all, "resale"), "no ticket price or sell-out claims");
ok(forbids(all, "Taco Bus") && forbids(all, "Dubliner") && forbids(all, "Old Northeast Tavern") && forbids(all, "Ducky"), "closed, ambiguous or undated hangouts stay out");
ok(forbids(all, "ticketmaster.evyy") && forbids(all, "viator"), "no affiliate links in the content");

const hero = guideHero(SLUG);
ok(hero && /tropicana-field\.webp$/.test(hero.src || ""), "hero is the Tropicana Field photo (exact subject)");

const src = readFileSync(new URL("../lib/guidesRaysGameDay2026.js", import.meta.url), "utf8");
const railProbe = /placeRail\s*:/;
ok(railProbe.test("placeRail: {}") && !railProbe.test(src), "module declares no place rail (probe proven)");
ok(forbids("cowbells", "sold out") && !forbids("it is sold out", "sold out"), "red-proof: forbids() can fail");

if (failures.length) { console.error("test-guide-rays-game-day: FAIL"); for (const f of failures) console.error("  - " + f); process.exit(1); }
console.log("test-guide-rays-game-day: OK — " + checks + " assertions");
