#!/usr/bin/env node
// Santa table search is local and its dates are exact (owner 2026-11-14).
// Locks: (1) where Santa looks comes from the strongest signal (typed city, selected place, fresh consented location,
// page city) and an unknown area asks for the city instead of a statewide "nearby" list; (2) "next Friday" with two
// possible Fridays carries no date on the client, so the concierge asks with both exact dates; (3) the thread wiring
// sends the resolved area to the server and shows the honest booking route on each pick.
// Code is called directly (pure functions); the wiring checks run on comment-stripped source.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const fails = [];
const ok = (cond, msg) => { n += 1; if (!cond) fails.push(msg); };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (f) => strip(readFileSync(path.join(REPO, f), "utf8"));

const { resolveSearchArea, AREA_STALE_MS } = await import("../lib/santaArea.js");
const { nextWeekdayChoices, hasExplicitCalendarDate, weekdayIsAmbiguous } = await import("../lib/reserveDates.js");
const { classifySantaMessage } = await import("../lib/santaIntent.js");
const { plannerPersona } = await import("../lib/plannerPersona.js");

const NOW = Date.parse("2026-11-14T17:00:00Z"); // Saturday, Nov 14 2026, noon Eastern
const TAMPA = { slug: "tampa", name: "Tampa" };
const MIAMI_BEACH = { lat: 25.7907, lng: -80.13, loc: "Miami Beach", ts: NOW - 60_000 };
const NEAR_TAMPA = { lat: 27.96, lng: -82.45, loc: "Ybor City", ts: NOW - 60_000 };

// ---- 1. where Santa looks ----------------------------------------------------------------------------------
{
  const page = resolveSearchArea({ text: "find me dinner", pageCity: TAMPA, nowMs: NOW });
  ok(page.source === "page_city" && page.label === "Tampa" && Math.abs(page.lat - 27.95) < 0.1, "page city only: searches Tampa: " + JSON.stringify(page));
  const consented = resolveSearchArea({ text: "find me dinner", storedPoint: NEAR_TAMPA, pageCity: TAMPA, nowMs: NOW });
  ok(consented.source === "stored_location" && consented.label === "Ybor City" && consented.lat === 27.96, "fresh consented location that agrees with the page: used: " + JSON.stringify(consented));
  const consentedOnly = resolveSearchArea({ text: "find me dinner", storedPoint: NEAR_TAMPA, nowMs: NOW });
  ok(consentedOnly.source === "stored_location", "fresh consented location, no page city: used");
  const typed = resolveSearchArea({ text: "find me dinner in Orlando", storedPoint: NEAR_TAMPA, pageCity: TAMPA, nowMs: NOW });
  ok(typed.source === "message_city" && typed.label === "Orlando" && Math.abs(typed.lat - 28.54) < 0.1, "an explicit different city beats the page and the location: " + JSON.stringify(typed));
  const place = resolveSearchArea({ text: "somewhere close for dinner", selectedPlace: { id: "ChIJx", name: "The Florida Aquarium", lat: 27.944, lng: -82.445 }, storedPoint: MIAMI_BEACH, nowMs: NOW });
  ok(place.source === "selected_place" && place.label === "near The Florida Aquarium" && place.lat === 27.944, "the selected place beats a stored location: " + JSON.stringify(place));
  const conflict = resolveSearchArea({ text: "find me dinner", storedPoint: MIAMI_BEACH, pageCity: TAMPA, nowMs: NOW });
  ok(conflict.source === "page_city" && conflict.label === "Tampa", "a stored Miami Beach point that contradicts the Tampa page loses: " + JSON.stringify(conflict));
  const stale = resolveSearchArea({ text: "find me dinner", storedPoint: { ...NEAR_TAMPA, ts: NOW - AREA_STALE_MS - 1 }, nowMs: NOW });
  ok(stale.source === "unknown" && stale.reason === "stale_location", "a stale stored location alone is not where you are: " + JSON.stringify(stale));
  const noTs = resolveSearchArea({ text: "find me dinner", storedPoint: { lat: 27.96, lng: -82.45 }, nowMs: NOW });
  ok(noTs.source === "unknown", "a stored point with no timestamp is not trusted as fresh");
  const staleWithPage = resolveSearchArea({ text: "find me dinner", storedPoint: { ...MIAMI_BEACH, ts: NOW - AREA_STALE_MS - 1 }, pageCity: TAMPA, nowMs: NOW });
  ok(staleWithPage.source === "page_city", "stale location with a page city: the page city");
  const unknown = resolveSearchArea({ text: "find me dinner", nowMs: NOW });
  ok(unknown.source === "unknown" && unknown.label === null && unknown.reason === "no_location" && !("lat" in unknown), "nothing reliable: unknown, no coordinates at all");
  const future = resolveSearchArea({ text: "find me dinner", storedPoint: { ...NEAR_TAMPA, ts: NOW + 86_400_000 }, nowMs: NOW });
  ok(future.source === "unknown", "a stored point stamped in the future is not trusted");
}

// ---- 2. dates ----------------------------------------------------------------------------------------------
{
  const sat = "2026-11-14";
  ok(JSON.stringify(nextWeekdayChoices("book next Friday", sat)) === '["2026-11-20","2026-11-27"]', "Sat Nov 14: next Friday is Nov 20 or Nov 27");
  ok(nextWeekdayChoices("this Friday", sat) === null && nextWeekdayChoices("Friday", sat) === null, "this Friday / Friday are not ambiguous");
  ok(nextWeekdayChoices("next Friday", "2026-11-20") === null, "next Friday said on a Friday is not ambiguous");
  ok(hasExplicitCalendarDate("next Friday, Nov 27") && hasExplicitCalendarDate("11/27") && hasExplicitCalendarDate("2026-11-27") && !hasExplicitCalendarDate("next Friday at 7 for 4"), "explicit calendar dates are recognised, a time and party are not dates");
  ok(weekdayIsAmbiguous("next Friday at 7 for 4", sat) && !weekdayIsAmbiguous("next Friday Nov 27", sat), "ambiguity is settled by an exact date");
  const a = classifySantaMessage("find me dinner next Friday for 4", { today: sat });
  ok(a.kind === "find_food" && a.details.date === null && a.details.partySize === 4, "client carries no guessed date for an ambiguous next Friday: " + JSON.stringify(a.details));
  const b = classifySantaMessage("book a table next Friday Nov 27 at 7", { today: sat });
  ok(b.kind === "reserve" && b.details.date === "2026-11-27", "an explicit date is kept: " + JSON.stringify(b.details));
  const c = classifySantaMessage("book a table this Friday at 7 for 2", { today: sat });
  ok(c.details.date === "2026-11-20", "this Friday on Sat Nov 14 is Nov 20: " + c.details.date);
  const d = classifySantaMessage("book a table tomorrow at 7 for 2", { today: sat });
  ok(d.details.date === "2026-11-15", "tomorrow is Nov 15: " + d.details.date);
}

// ---- 3. wiring ----------------------------------------------------------------------------------------------
{
  const DASH = /[—–]/;
  ok(DASH.test("a — b") && DASH.test("a – b"), "positive control: the dash probe finds an em and an en dash");
  for (const v of ["santa", "boo", "wayfind"]) {
    const line = plannerPersona(v).askCity;
    ok(typeof line === "string" && /city/i.test(line) && !DASH.test(line), v + ": asks for the city, no dashes: " + line);
  }
  const sheet = read("app/components/WayfindPlannerSheet.js");
  ok(/area\.source === "unknown"[\s\S]{0,260}awaitingAreaRef\.current = intent;[\s\S]{0,80}text: p\.askCity/.test(sheet), "unknown area: Santa asks for the city and holds the request");
  ok(/role: "picks", k: Date\.now\(\), intent, area \}/.test(sheet), "known area: the picks entry carries the resolved area");
  ok(/if \(area && area\.source !== "unknown"\) \{\s*pendingPicksRef\.current = \{[^}]*\}, area \};/.test(sheet), "reserve picks are queued only with a known area");
  ok(/if \(awaitingAreaRef\.current\) \{[\s\S]{0,900}area\.source === "message_city"[\s\S]{0,300}role: "picks", k: Date\.now\(\), intent: held, area \}/.test(sheet), "the city answer to Santa's question shows picks for that city (not a new trip)");
  ok(/answer\.kind === "none" && !TRIP_WORDS\.test\(text\) && text\.split\(\/\\s\+\/\)\.length <= 5 \? parsePlannerCity\(text\)/.test(sheet), "only a short city answer counts; 'Plan my Tampa weekend' stays a trip request");
  const { TRIP_WORDS } = await import("../lib/santaIntent.js");
  ok(TRIP_WORDS.test("Plan my Tampa weekend") && !TRIP_WORDS.test("Tampa") && !TRIP_WORDS.test("in St. Pete please"), "trip words split a trip request from a city answer");
  ok(sheet.indexOf("if (awaitingAreaRef.current) {") > -1 && sheet.indexOf("if (awaitingAreaRef.current) {") < sheet.indexOf("const routed = classifySantaMessage(text, {"), "the city answer is handled before the dispatcher");
  ok(/<ReservePicks key=\{m\.k\} intent=\{m\.intent\} area=\{m\.area \|\| null\}/.test(sheet) && !/<ReservePicks key=\{m\.k\}[^>]*point=\{readStoredPoint\(\)\}/.test(sheet), "thread picks search the resolved area, never the raw stored point");
  const picks = read("app/components/ReservePicks.js");
  ok(/const where = area && Number\.isFinite\(area\.lat\) && Number\.isFinite\(area\.lng\) \? area : point;/.test(picks) && /body\.lat = where\.lat; body\.lng = where\.lng;/.test(picks), "ReservePicks posts the area's coordinates");
  ok(/needsArea: Boolean\(r\.needsArea\)/.test(picks) && /data-reserve-picks-empty="area"/.test(picks), "a server needsArea answer asks for the city");
  ok(/data-reserve-picks-wider="1" onClick=\{\(\) => setWide\(true\)\}/.test(picks) && /if \(wide\) body\.wide = true;/.test(picks), "the wider search is an explicit tap");
  ok(/wayfind: "Book on Wayfind", opentable: "Book on OpenTable", none: "No online booking"/.test(picks), "each pick says its real booking route");
  const find = read("lib/reserveFind.js");
  ok(/if \(!metro && !hasPoint && !r\.query\) return \{ ok: true, picks: \[\], needsArea: true \};/.test(find), "server: no area returns needsArea, never a statewide list");
}

if (fails.length) {
  for (const f of fails) console.error("test-santa-local-dates: FAIL - " + f);
  process.exit(1);
}
console.log(`test-santa-local-dates: OK - ${n} assertions (area resolution and date rules called directly; thread wiring on comment-stripped source)`);
