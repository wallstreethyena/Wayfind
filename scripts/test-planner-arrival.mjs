#!/usr/bin/env node
// scripts/test-planner-arrival.mjs
//
// Owner 2026-11-23: a date plan brought him to Wayfind, he opened Itinerary,
// and Santa said "Which Florida city, and which dates?" The city, the night
// and the saved stop were already chosen. This test builds that arrival and
// fails if the first line asks for something the visitor already gave.
//
// It calls the real helpers. A source mention of resolvePlannerOpen is only
// the wire check; the behavior assertions execute the functions.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addStopToStoredTrips } from "../lib/itineraryAdd.js";
import { encodeInvite, decodeInvite, inviteItineraryStop } from "../lib/dateInvite.js";
import { mergeTripMaps, readMergedTripStores } from "../lib/trips.js";
import {
  itineraryArrivalDetail,
  itineraryHandoffQuery,
  itineraryPlanHref,
  sanitizeHandoff,
  writePlannerHandoff,
  readPlannerHandoff,
} from "../lib/itineraryHandoff.js";
import {
  collectPlannerArrival,
  plannerArrivalGreeting,
  plannerArrivalPrompt,
  resolvePlannerOpen,
  packPlannerThread,
  plannerThreadUsable,
  acceptCityName,
} from "../lib/plannerArrival.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const fails = [];
const ok = (cond, msg) => { n += 1; if (!cond) fails.push(msg); };

const TIMID = /\b(want me to|should i|shall i|would you like|do you want|maybe|perhaps|i think|might)\b/i;
const DASH = /[-–—]/;
const BANNED = /\b(best|disney|mickey|universal|grinch|ticketmaster|imessage|purple)\b/i;
ok(TIMID.test("Want me to build the day?"), "positive control: the timid probe catches the rejected question");
ok(DASH.test("Nov 28-30"), "positive control: the dash probe catches a range hyphen");
ok(BANNED.test("the best day"), "positive control: the copy probe catches best");

const NOW = Date.parse("2026-11-23T18:00:00Z");
const TODAY = "2026-11-23";

function memStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    dump: () => data,
  };
}

function cleanCopy(text) {
  ok(!DASH.test(text), "no dash in: " + text);
  ok(!TIMID.test(text), "no permission ask in: " + text);
  ok(!BANNED.test(text), "no banned word in: " + text);
}

// The cold hello is still the line for a visitor who has told us nothing.
ok(acceptCityName("Unsorted") === "" && acceptCityName("Florida") === "", "Unsorted and Florida are not cities the planner can claim");
ok(acceptCityName("Tampa") === "Tampa" && acceptCityName("Orlando, FL") === "Orlando", "a real covered city is kept, including a center label");

const nothing = collectPlannerArrival({ today: TODAY, now: NOW });
ok(plannerArrivalGreeting("santa", nothing) === "", "no context keeps the stock hello (the sheet fills it)");
ok(!nothing.city && nothing.missing.includes("city") && nothing.missing.includes("dates"), "an empty arrival is missing a city and dates");

// The Nov 23 path: date plan saved Ulele into wf_trips_v1, the visible store
// only had an Unsorted trip, and the link carried Tampa and the night.
const inv = decodeInvite(encodeInvite({ place: "Ulele", city: "Tampa", id: "ulele", from: "Gabe", note: "Meet at 7" }));
const stop = inviteItineraryStop(inv, "dinner", "Sat, November 28", "2026-11-28");
const legacy = addStopToStoredTrips({}, stop, NOW, { autoOrder: true, addedVia: "ask_invite" });
ok(legacy.trips.fl_tampa && legacy.trips.fl_tampa.items[0].place.name === "Ulele", "the date plan still files Ulele into the Tampa trip");
const unsorted = {
  xx_unsorted: {
    key: "xx_unsorted", city: "Unsorted", state: null,
    items: [{ id: "loose", place: { id: "loose", name: "Loose stop" }, day: "" }],
  },
};
const visible = mergeTripMaps(unsorted, legacy.trips);
ok(visible.fl_tampa && visible.xx_unsorted, "merging the two stores keeps the Tampa stop and the Unsorted trip");
ok(visible.fl_tampa.items[0].day === "2026-11-28", "the agreed night survives the merge");

const href = itineraryPlanHref({ city: "Tampa", date: "2026-11-28", activity: "dinner", build: true });
ok(href.startsWith("/itinerary?") && href.includes("plan=1") && href.includes("city=Tampa") && href.includes("date=2026-11-28") && href.includes("activity=dinner"), "Build the rest of the day links to itinerary with the city, the date and plan=1");
ok(!href.includes("Gabe") && !href.includes("Meet"), "the itinerary link does not carry a person's name or note");
const landed = itineraryArrivalDetail(href.slice(href.indexOf("?") + 1));
ok(landed.build === true && landed.detail.city === "Tampa" && landed.detail.startDate === "2026-11-28" && landed.detail.activity === "dinner", "the landing reads the date plan as one planner open");
ok(landed.href === "/itinerary?city=Tampa&date=2026-11-28&activity=dinner", "plan=1 is consumed and not written back into the address bar (got " + landed.href + ")");
const dropped = itineraryHandoffQuery("city=Tampa&date=2026-11-28&plan=1&d=secret&who=Gabe&note=hi");
ok(dropped.get("city") === "Tampa" && dropped.get("date") === "2026-11-28" && !dropped.has("plan") && !dropped.has("d") && !dropped.has("who") && !dropped.has("note"), "the address bar keeps city and date and drops the invite payload");

const handoff = sanitizeHandoff({ source: "date", city: "Tampa", date: "2026-11-28", activity: "dinner", placeName: "Ulele", who: "Gabe", note: "Meet at 7", at: NOW }, NOW);
ok(handoff && !JSON.stringify(handoff).includes("Gabe") && !JSON.stringify(handoff).includes("Meet"), "the handoff record drops names and notes");
const sess = memStore();
ok(writePlannerHandoff(sess, handoff, NOW) && readPlannerHandoff(sess, NOW + 1000).city === "Tampa", "a fresh handoff round trips through session storage");
ok(readPlannerHandoff(sess, NOW + 7 * 60 * 60 * 1000) === null, "a handoff older than six hours is ignored");

const arrival = collectPlannerArrival({
  trips: visible,
  search: href.slice(href.indexOf("?")),
  handoff,
  today: TODAY,
  now: NOW,
});
ok(arrival.city === "Tampa" && arrival.startDate === "2026-11-28" && arrival.vibe === "Dinner", "arrival keeps Tampa, Nov 28 and dinner");
ok(!arrival.missing.includes("city") && !arrival.missing.includes("dates"), "a complete date plan is not missing a city or dates");
const greet = plannerArrivalGreeting("santa", arrival);
ok(/Tampa/.test(greet) && /Nov 28/.test(greet) && /dinner/i.test(greet) && /Ulele|spots you saved/.test(greet), "Santa names the city, the night and the saved stop (got " + greet + ")");
ok(!/elves are bored/.test(greet) && !/Which Florida city/.test(greet), "Santa does not ask for the city he already has (got " + greet + ")");
ok(/I'll build the day/.test(greet), "when nothing is missing Santa says he will build the day");
cleanCopy(greet);

const built = resolvePlannerOpen({
  voice: "santa",
  reset: false,
  inMemoryMessages: [],
  storedThread: null,
  authUserId: null,
  arrival,
  detail: { build: true },
  now: NOW,
});
ok(built.mode === "build" && built.messages[0].text === greet && /Tampa/.test(built.submitPrompt) && /Nov 28/.test(built.submitPrompt), "Build the rest of the day submits a prompt that carries the known city and date");
cleanCopy(built.submitPrompt);

// Three saved Orlando stops across a weekend. The line the owner asked for,
// without a dash and without asking permission.
const orlando = { fl_orlando: { key: "fl_orlando", city: "Orlando", state: "FL", items: [
  { id: "a", place: { id: "a", name: "Lake Eola", city: "Orlando" }, day: "2026-11-28" },
  { id: "b", place: { id: "b", name: "Leu Gardens", city: "Orlando" }, day: "2026-11-29" },
  { id: "c", place: { id: "c", name: "Ivanhoe", city: "Orlando" }, day: "2026-11-30" },
] } };
const orlandoArrival = collectPlannerArrival({ trips: orlando, today: TODAY, now: NOW });
const orlandoLine = plannerArrivalGreeting("santa", orlandoArrival);
ok(orlandoLine === "Got it, Orlando Nov 28 to 30, and I kept the 3 spots you saved. I'll build the day.", "three saved spots across a known weekend (got " + orlandoLine + ")");
cleanCopy(orlandoLine);
ok(plannerArrivalPrompt(orlandoArrival) === "Build my day in Orlando on Nov 28 to 30, keep the 3 spots I saved.", "the ready prompt names the same weekend and the saved spots");

const cityOnly = collectPlannerArrival({
  detail: { city: "Orlando" },
  today: TODAY,
  now: NOW,
});
const cityLine = plannerArrivalGreeting("santa", cityOnly);
ok(/Orlando/.test(cityLine) && /Which dates do I pack the sleigh for\?/.test(cityLine) && !/Which Florida city/.test(cityLine), "a known city is not asked again (got " + cityLine + ")");
cleanCopy(cityLine);
ok(resolvePlannerOpen({ voice: "santa", arrival: cityOnly, detail: { build: true }, inMemoryMessages: [], now: NOW }).mode === "greet", "a build request without dates asks instead of calling the planner");

const dateOnly = collectPlannerArrival({ detail: { startDate: "2026-11-28", endDate: "2026-11-30" }, today: TODAY, now: NOW });
const dateLine = plannerArrivalGreeting("santa", dateOnly);
ok(/Nov 28 to 30/.test(dateLine) && /Which Florida city\?/.test(dateLine) && !/pack the sleigh/.test(dateLine), "known dates are not asked again (got " + dateLine + ")");
cleanCopy(dateLine);

const bothMissing = collectPlannerArrival({
  trips: unsorted,
  today: TODAY,
  now: NOW,
});
const bothLine = plannerArrivalGreeting("santa", bothMissing);
ok(/Loose stop/.test(bothLine) && /Which Florida city, and which dates\?/.test(bothLine) && !/Unsorted/.test(bothLine), "an Unsorted trip counts as a saved spot and is not called a city (got " + bothLine + ")");
cleanCopy(bothLine);

const liked = collectPlannerArrival({
  liked: { p1: { id: "p1", name: "Ulele", city: "Tampa" } },
  today: TODAY,
  now: NOW,
});
const likedLine = plannerArrivalGreeting("wayfind", liked);
ok(/Tampa/.test(likedLine) && /you liked/.test(likedLine) && /Ulele/.test(likedLine), "a liked place is acknowledged when nothing is filed on a trip (got " + likedLine + ")");
cleanCopy(likedLine);

const split = collectPlannerArrival({
  trips: {
    fl_orlando: { key: "fl_orlando", city: "Orlando", state: "FL", items: [{ id: "a", place: { id: "a", name: "Lake Eola", city: "Orlando" } }] },
    fl_tampa: { key: "fl_tampa", city: "Tampa", state: "FL", items: [{ id: "b", place: { id: "b", name: "Ulele", city: "Tampa" } }] },
  },
  today: TODAY,
  now: NOW,
});
const splitLine = plannerArrivalGreeting("santa", split);
ok(/Orlando/.test(splitLine) && /Tampa/.test(splitLine) && /Which city/.test(splitLine) && !/I'll build the day/.test(splitLine), "two real cities are named and one is asked for (got " + splitLine + ")");
cleanCopy(splitLine);

const browse = collectPlannerArrival({
  browse: { city: "Sarasota", date: "2026-12-01", query: "brunch", path: "/events", screen: "events", at: NOW - 1000 },
  today: TODAY,
  now: NOW,
});
const browseLine = plannerArrivalGreeting("santa", browse);
ok(/Sarasota/.test(browseLine) && /Dec 1/.test(browseLine), "a fresh events filter is used when the visitor has not named a trip (got " + browseLine + ")");
cleanCopy(browseLine);
const stale = collectPlannerArrival({
  browse: { city: "Miami", date: "2026-12-01", at: NOW - 13 * 60 * 60 * 1000 },
  today: TODAY,
  now: NOW,
});
ok(!stale.hasContext, "a browse filter older than twelve hours is not treated as a plan");

const center = collectPlannerArrival({
  center: { loc: "Orlando, FL", manual: true, ts: NOW - 1000, lat: 28.54, lng: -81.38 },
  today: TODAY,
  now: NOW,
});
ok(center.city === "Orlando", "a manual center the visitor picked is a city");
const gps = collectPlannerArrival({
  center: { loc: "Orlando, FL", manual: false, ts: NOW, lat: 28.54, lng: -81.38 },
  today: TODAY,
  now: NOW,
});
ok(!gps.city, "an automatic center is not claimed as a city they chose");

// Reopening resumes. A different account does not inherit the thread.
const thread = packPlannerThread({
  authUserId: null,
  voice: "santa",
  city: "Tampa",
  activeTripKey: "fl_tampa",
  messages: [
    { role: "assistant", text: greet },
    { role: "user", text: "Build my day in Tampa on Nov 28." },
  ],
  proposedPlan: { title: "Tampa", city: "Tampa", days: [{ date: "2026-11-28", label: "Sat", stops: [{ id: "ulele", name: "Ulele" }] }] },
  now: NOW,
});
ok(thread && thread.messages.length === 2 && thread.proposedPlan.days[0].stops[0].name === "Ulele", "a thread with a visitor line is stored with its plan");
ok(packPlannerThread({ messages: [{ role: "assistant", text: greet }], now: NOW }) === null, "a hello the visitor has not answered is not frozen, so the next open can see new saves");
ok(plannerThreadUsable(thread, null, NOW) && plannerThreadUsable(thread, "user_gabe", NOW), "a guest thread resumes for that guest and for the account they sign into");
const owned = packPlannerThread({ ...thread, authUserId: "user_gabe", messages: thread.messages, now: NOW });
ok(!plannerThreadUsable(owned, "user_other", NOW) && !plannerThreadUsable(owned, null, NOW), "another account, and a sign out, do not inherit the thread");
ok(!plannerThreadUsable(thread, null, NOW + 13 * 60 * 60 * 1000), "a thread older than twelve hours starts fresh");

const resumed = resolvePlannerOpen({
  voice: "santa",
  reset: false,
  inMemoryMessages: [],
  storedThread: thread,
  authUserId: null,
  arrival,
  detail: { build: true },
  now: NOW,
});
ok(resumed.mode === "resume" && resumed.messages[1].text.includes("Tampa"), "the same city opened again resumes the thread instead of planning a second time");
const kept = resolvePlannerOpen({
  voice: "santa",
  reset: false,
  inMemoryMessages: thread.messages,
  storedThread: null,
  authUserId: null,
  arrival,
  detail: {},
  now: NOW,
});
ok(kept.mode === "keep", "an open sheet that already has the thread stays on it");
const switched = resolvePlannerOpen({
  voice: "santa",
  reset: false,
  inMemoryMessages: [],
  storedThread: thread,
  authUserId: null,
  arrival: orlandoArrival,
  detail: {},
  now: NOW,
});
ok(switched.mode === "greet" && switched.clearThread && /Orlando/.test(switched.messages[0].text), "a different city replaces the stored thread");

const local = memStore({
  wayfind_trips: JSON.stringify(unsorted),
  wf_trips_v1: JSON.stringify(legacy.trips),
});
const mergedRead = readMergedTripStores(local);
ok(mergedRead.fl_tampa && mergedRead.xx_unsorted, "the itinerary reader sees both the app store and the date plan store");

const sheet = readFileSync(path.join(ROOT, "app/components/WayfindPlannerSheet.js"), "utf8");
const home = readFileSync(path.join(ROOT, "app/home.js"), "utf8");
const ask = readFileSync(path.join(ROOT, "app/ask/AskClient.js"), "utf8");
ok(sheet.includes("resolvePlannerOpen("), "the planner sheet opens through resolvePlannerOpen");
ok(home.includes("itineraryArrivalDetail(") && home.includes('import("../lib/itineraryHandoff.js")') && !/from ["']\.\.\/lib\/itineraryHandoff\.js["']/.test(home), "the itinerary handoff keeps city and date and stays out of the homepage static graph");
ok(!/from ["']\.\/trips\.js["']/.test(readFileSync(path.join(ROOT, "lib/plannerCompanionBridge.js"), "utf8")), "the layout bridge does not pull lib/trips.js into the first load");
ok(ask.includes('setItem("wf_trips_v1"') && ask.includes('setLocal("wayfind_trips"') && ask.includes("itineraryPlanHref("), "the date plan still writes wf_trips_v1 and also the store Itinerary reads, then opens with the plan");

// Every voice, every sparse arrival, stays inside the copy rules.
for (const voice of ["santa", "boo", "wayfind"]) {
  for (const sample of [arrival, orlandoArrival, cityOnly, dateOnly, bothMissing, liked, split, browse]) {
    const line = plannerArrivalGreeting(voice, sample);
    if (line) cleanCopy(line);
  }
}

if (fails.length) {
  console.error("test-planner-arrival: FAIL — " + fails.length + "/" + n);
  for (const f of fails) console.error("  · " + f);
  process.exit(1);
}
console.log("test-planner-arrival: OK — " + n + " assertions; a known city, date and saved stop is named, and only a real gap is asked");
