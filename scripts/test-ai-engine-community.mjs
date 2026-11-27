// Locks the Wayfind AI engine (owner order 2026-11-27): the OpenAI dollar cap
// and personal data refusal, the community guide privacy line and moderation
// fallback, itinerary templates that can only use real candidates, the
// leaderboard name rules, daily pick limits, tiered badges and the impossible
// travel check. No network: every I/O path runs on an injected fake.
import assert from "node:assert/strict";
import {
  engineRequestCap, worstCaseCallUsd, engineMonthlyUsd, findPersonalData, engineJson, cleanPublicText, ENGINE_SKU,
} from "../lib/aiEngine.js";
import {
  stopsFromItinerary, hydrateStops, validateGuideReply, writeGuide, rulesWrite, publicGuideView, publishGuide,
  openLicensePhoto, guidePrompt, sourceHash, newGuideSlug,
} from "../lib/communityGuides.js";
import { buildCandidates, validateTemplateReply, draftTemplate, liveStops, TEMPLATE_THEMES, templatePrompt } from "../lib/itineraryTemplates.js";
import { validatePublicName } from "../lib/leaderboard.js";
import { inSendWindow, tasteFrom, choosePick, pickMessage, runDailyPicks } from "../lib/dailyPicks.js";
import { BADGES, badgeLevel, rewardsSummary, badgesFor, travelPlausible } from "../lib/rewards.js";

let count = 0;
const ok = (v, m) => { assert.ok(v, m); count += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); count += 1; };

// ── dollar cap ────────────────────────────────────────────────────────────
eq(engineMonthlyUsd({}), null, "no budget set means no calls");
eq(engineMonthlyUsd({ OPENAI_ENGINE_MONTHLY_USD: "abc" }), null, "a typo means no calls");
eq(engineMonthlyUsd({ OPENAI_ENGINE_MONTHLY_USD: "0" }), null, "zero means no calls");
eq(engineRequestCap({ OPENAI_ENGINE_MONTHLY_USD: "10" }), 3703, "$10 at the worst case per call allows 3,703 calls");
ok(engineRequestCap({ OPENAI_ENGINE_MONTHLY_USD: "10" }) * worstCaseCallUsd() <= 10, "the cap times the worst case never passes the dollar budget");
const calls = [];
const fakeRequest = (reply) => async (req, lane) => {
  calls.push({ req, lane });
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }), { status: 200 });
};
const ENV = { OPENAI_ENGINE_MONTHLY_USD: "10", OPENAI_API_KEY: "sk-test-key-0000000000" };
const schema = { type: "object", properties: { a: { type: "string" } }, required: ["a"], additionalProperties: false };
let r = await engineJson({ system: "s", user: "write about Tampa", schema }, { env: ENV, request: fakeRequest({ a: "x" }) });
eq(r.ok, true, "engineJson returns parsed JSON");
eq(calls[0].lane, { sku: ENGINE_SKU, cap: 3703, timeoutMs: 30_000 }, "every call takes a grant on the capped engine lane");
eq(calls[0].req.body.response_format.type, "json_schema", "structured outputs are requested");
r = await engineJson({ system: "s", user: "contact jane@example.com", schema }, { env: ENV, request: fakeRequest({ a: "x" }) });
eq([r.ok, r.reason], [false, "personal_data_in_prompt:email"], "a prompt with an email never leaves");
r = await engineJson({ system: "s", user: "call 941-555-0100", schema }, { env: ENV, request: fakeRequest({ a: "x" }) });
eq(r.ok, false, "a prompt with a phone number never leaves");
r = await engineJson({ system: "s", user: "user 3f1c2b9a-1234-4abc-8def-0123456789ab", schema }, { env: ENV, request: fakeRequest({ a: "x" }) });
eq(r.reason, "personal_data_in_prompt:user_id", "a prompt with an account id never leaves");
r = await engineJson({ system: "s", user: "ok", schema }, { env: { OPENAI_API_KEY: "k" }, request: fakeRequest({ a: "x" }) });
eq(r.reason, "missing_or_invalid_OPENAI_ENGINE_MONTHLY_USD", "no budget, no call");
eq(calls.length, 1, "refused prompts made no request");
eq(findPersonalData("Café Ponte in Tampa, 4.7 stars"), null, "ordinary place facts pass");
ok(!/https?:|@|—/.test(cleanPublicText("Great — see https://x.com or a@b.com")), "public text loses links, emails and dashes");

// ── community guides: what goes public ────────────────────────────────────
const items = [
  { kind: "place", ref_id: "ChIJplace00001", sort_key: "000002", scheduled_on: "2026-12-05", note: "Mom's birthday, call Jane 941-555-0100" },
  { kind: "place", ref_id: "ChIJplace00002", sort_key: "000001", scheduled_on: "2026-12-05", note: "" },
  { kind: "place", ref_id: "ChIJplace00003", sort_key: "000001", scheduled_on: "2026-12-07" },
  { kind: "note", ref_id: null, note: "hotel confirmation 12345" },
  { kind: "place", ref_id: "ChIJplace00002__day_2026-12-07", sort_key: "000003", scheduled_on: "2026-12-07" },
  { kind: "event", ref_id: "ev-zoo-lights", sort_key: "000004", scheduled_on: "2026-12-07" },
];
const stops = stopsFromItinerary(items);
eq(stops.map((s) => [s.ref_id, s.day]), [["ChIJplace00002", 1], ["ChIJplace00001", 1], ["ChIJplace00003", 2], ["ev-zoo-lights", 2]], "trip order, day numbers instead of dates, no notes, duplicates folded");
ok(!JSON.stringify(stops).includes("2026-12") && !JSON.stringify(stops).includes("Mom") && !/note/.test(JSON.stringify(stops)), "no date and no note survives");
const placeRows = [
  { place_id: "ChIJplace00001", name: "Bakery 1908", category: "food", locality: "Tampa", status: "OPERATIONAL", editorial: "Cuban bread and pastries since 1908. Long lines on Saturday.", signals: { photo_gallery: [{ url: "https://www.gowayfind.com/a.jpg", license: "official venue website" }, { url: "https://www.gowayfind.com/b.jpg", license: "CC BY-SA 4.0", attribution_text: "Jane Photographer" }] } },
  { place_id: "ChIJplace00002", name: "Riverwalk", category: "attractions", locality: "Tampa", status: "OPERATIONAL", signals: {} },
  { place_id: "ChIJplace00003", name: "Closed Spot", category: "food", locality: "Tampa", status: "CLOSED_PERMANENTLY", signals: {} },
];
const eventRows = [{ event_id: "ev-zoo-lights", slug: "zoo-lights-2026", event_name: "ZooLights", city: "Tampa", state: "FL", event_status: "scheduled", start_date: "2026-11-20", end_date: "2026-12-30", why_go: "A million lights at the zoo." }];
const hydrated = hydrateStops(stops, placeRows, eventRows, "2026-11-27");
eq(hydrated.map((h) => h.ref_id), ["ChIJplace00002", "ChIJplace00001", "ev-zoo-lights"], "a closed place is dropped, unknown stops are dropped");
eq(hydrated[1].photo && hydrated[1].photo.url, "https://www.gowayfind.com/b.jpg", "the shareable video only gets an openly licensed photo");
eq(openLicensePhoto([{ url: "https://x/y.jpg", license: "official venue website" }]), null, "an unverified venue photo is never used in the video");
const { user: promptUser } = guidePrompt(hydrated, { city: "Tampa", days: 2 });
ok(!/Mom|Jane|941|2026-12/.test(promptUser), "the OpenAI prompt carries no notes, names or dates");
eq(findPersonalData(promptUser), null, "the guide prompt passes the personal data check");
eq(validateGuideReply({ title: "Tampa in two days", intro: "x", stops: [{ id: "ChIJinvented", blurb: "Made up place blurb" }] }, hydrated), null, "a reply about invented stops is rejected");
const v = validateGuideReply({ title: "Tampa in two days", intro: "Lights and bread.", stops: hydrated.map((h) => ({ id: h.ref_id, blurb: "A good stop for the trip, see https://spam.example" })) }, hydrated);
ok(v && !Object.values(v.blurbs).some((b) => /https?:/.test(b)), "links are stripped from model text");
// moderation: flagged or unavailable means our own editorial, never unchecked AI text
const aiReply = { ok: true, data: { title: "Tampa lights weekend", intro: "Two days.", stops: hydrated.map((h) => ({ id: h.ref_id, blurb: "Model blurb for " + h.name })) } };
let w = await writeGuide(hydrated, { city: "Tampa", days: 2 }, { engineJson: async () => aiReply, moderateText: async () => ({ ok: true, flagged: false }) });
eq([w.writer, w.moderation, w.title], ["openai", "passed", "Tampa lights weekend"], "moderated AI text is used");
w = await writeGuide(hydrated, { city: "Tampa", days: 2 }, { engineJson: async () => aiReply, moderateText: async () => ({ ok: true, flagged: true }) });
eq(w.writer, "rules", "flagged AI text is thrown away");
w = await writeGuide(hydrated, { city: "Tampa", days: 2 }, { engineJson: async () => aiReply, moderateText: async () => ({ ok: false, reason: "down" }) });
eq(w.writer, "rules", "AI text that could not be moderated is never published");
w = await writeGuide(hydrated, { city: "Tampa", days: 2 }, { allowAi: false, engineJson: async () => { throw new Error("must not call"); } });
eq(w.writer, "rules", "over the per member limit the rules writer is used without calling OpenAI");
eq(rulesWrite(hydrated, { city: "Tampa", days: 2 }).title, "2 days in Tampa", "rules title");
const view = publicGuideView({ slug: "a", title: "t", user_id: "u1", show_author: true, stops: [] }, new Map([["u1", "Sunny"]]));
ok(!("user_id" in view) && !("show_author" in view) && view.author === "Sunny", "public view drops the account id and shows the chosen name");
eq(publicGuideView({ slug: "a", user_id: "u1", show_author: false }, new Map([["u1", "Sunny"]])).author, "A Wayfind local", "no name unless the member chose to show it");
ok(/^tampa-tampa-lights-weekend-[0-9a-f]{6}$/.test(newGuideSlug("Tampa", "Tampa lights weekend")), "slug shape");
ok(sourceHash(hydrated) === sourceHash(hydrated.map((x) => ({ ...x }))) && /^[0-9a-f]{64}$/.test(sourceHash(hydrated)), "source hash is stable");

// publish flow end to end on a fake database
const USER = "11111111-2222-4333-8444-555555555555";
const TOKEN = "member-token-" + "x".repeat(20);
const cfg = { url: "https://db.example.supabase.co", service: "service-key-" + "s".repeat(20), anon: "anon-key-" + "a".repeat(20) };
function fakeDb({ itin = { id: "it1", local_key: "Tampa|FL", city: "Tampa", wf_itinerary_items: items }, existing = null } = {}) {
  const log = [];
  const res = (s, b) => new Response(b === null ? null : JSON.stringify(b), { status: s });
  const f = async (url, init = {}) => {
    const u = String(url); log.push({ u, init });
    if (u.includes("/rest/v1/wf_itineraries")) return (init.headers.Authorization === "Bearer " + TOKEN) ? res(200, itin ? [itin] : []) : res(401, {});
    if (u.includes("/rest/v1/wf_inventory")) return res(200, placeRows);
    if (u.includes("/rest/v1/wf_events")) return res(200, eventRows);
    if (u.includes("/rest/v1/wf_community_guides") && init.method === "POST") { const b = JSON.parse(init.body); return res(201, [{ id: "g1", slug: b.slug }]); }
    if (u.includes("/rest/v1/wf_community_guides")) return res(200, existing ? [existing] : []);
    if (u.includes("/rpc/wf_award_guide")) return res(200, { awarded: true, points_awarded: 20, profile: { points: 20 } });
    return res(404, {});
  };
  f.log = log;
  return f;
}
let db = fakeDb();
const noAi = { takeUserGrant: async () => true, engineJson: async () => aiReply, moderateText: async () => ({ ok: true, flagged: false }), rand: "abc123" };
let pub = await publishGuide({ cfg, member: { id: USER }, token: TOKEN, body: { localKey: "Tampa|FL" }, fetchImpl: db, deps: noAi });
eq([pub.status, pub.body.code], [400, "consent"], "nothing is published without the consent box");
pub = await publishGuide({ cfg, member: { id: USER }, token: TOKEN, body: { localKey: "Tampa|FL", consent: true }, todayStr: "2026-11-27", fetchImpl: db, deps: noAi });
eq([pub.status, pub.body.status, pub.body.pointsAwarded], [200, "published", 20], "a consented publish goes live and earns guide points");
const saved = JSON.parse(db.log.find((c) => c.u.includes("wf_community_guides") && c.init.method === "POST").init.body);
ok(!JSON.stringify(saved.stops).match(/Mom|941|2026-12|hotel/), "the stored public stops carry no notes or dates");
eq(saved.user_id, USER, "the owner is the VERIFIED member");
eq(saved.show_author, false, "author name is off unless asked for");
ok(db.log.find((c) => c.u.includes("/rest/v1/wf_itineraries")).init.headers.Authorization === "Bearer " + TOKEN, "the itinerary is read with the member's own token (RLS decides)");
db = fakeDb({ existing: { id: "g1", slug: "tampa-x-abc123", status: "published", source_hash: sourceHash(hydrated), show_author: false } });
let aiCalls = 0;
pub = await publishGuide({ cfg, member: { id: USER }, token: TOKEN, body: { localKey: "Tampa|FL", consent: true }, todayStr: "2026-11-27", fetchImpl: db, deps: { ...noAi, engineJson: async () => { aiCalls += 1; return aiReply; } } });
eq([pub.body.cached, aiCalls], [true, 0], "republishing an unchanged trip makes no OpenAI call");
db = fakeDb({ itin: { id: "it1", local_key: "k", city: "Tampa", wf_itinerary_items: items.slice(0, 2) } });
pub = await publishGuide({ cfg, member: { id: USER }, token: TOKEN, body: { localKey: "k", consent: true }, fetchImpl: db, deps: noAi });
eq(pub.body.code, "too_few", "fewer than 3 stops cannot be published");

// ── itinerary templates: only real candidates ─────────────────────────────
const tplPlaces = [
  ...["a", "b", "c", "d"].map((x, i) => ({ place_id: "ChIJfood000" + x, name: "Food " + x, category: "food", status: "OPERATIONAL", editorial: "Fresh food.", signals: { rating: 4.8 - i / 10 } })),
  ...["a", "b"].map((x) => ({ place_id: "ChIJattr000" + x, name: "Park " + x, category: "attractions", status: "OPERATIONAL", signals: { rating: 4.7 } })),
  { place_id: "ChIJbar0000a", name: "Bar a", category: "nightlife", status: "OPERATIONAL", signals: { rating: 4.6 } },
  { place_id: "ChIJlow00000", name: "Low rated", category: "food", status: "OPERATIONAL", signals: { rating: 3.9 } },
];
const cands = buildCandidates(tplPlaces, [{ event_id: "e1", slug: "past-show", event_name: "Past show", city: "Tampa", event_status: "scheduled", start_date: "2026-11-01", end_date: "2026-11-02" }], { todayStr: "2026-11-27", horizonStr: "2026-12-07" });
ok(!cands.some((c) => c.ref_id === "ChIJlow00000"), "low rated places are not candidates");
ok(!cands.some((c) => c.kind === "event"), "ended events are not candidates");
const theme = TEMPLATE_THEMES.perfect_day;
const fromCid = (ref) => cands.find((c) => c.ref_id === ref).cid;
const tv = validateTemplateReply({ title: "A day in Tampa", intro: "x", days: [{ day: 1, stops: [
  { id: "p999", slot: "morning", why: "invented" }, { id: fromCid("ChIJfood000a"), slot: "morning", why: "w" },
  { id: fromCid("ChIJattr000a"), slot: "midday", why: "w" }, { id: fromCid("ChIJfood000a"), slot: "evening", why: "dup" },
  { id: fromCid("ChIJfood000b"), slot: "brunchtime", why: "bad slot" }, { id: fromCid("ChIJbar0000a"), slot: "night", why: "w" },
] }, { day: 9, stops: [{ id: fromCid("ChIJfood000c"), slot: "evening", why: "bad day" }] }] }, cands, theme);
eq(tv.stops.map((s) => s.c.ref_id), ["ChIJfood000a", "ChIJattr000a", "ChIJbar0000a"], "invented ids, repeats, bad slots and bad days are dropped");
let rec = await draftTemplate(cands, { metro: "tampa", city: "Tampa", theme }, { engineJson: async () => ({ ok: false, reason: "down" }) });
eq(rec.writer, "rules", "with OpenAI down the rules planner fills the template");
ok(rec.stops.every((s) => tplPlaces.some((p) => p.place_id === s.ref_id)), "every template stop is a real inventory row");
ok(rec.stops.every((s) => !("time" in s) || s.time === null || /^\d{2}:\d{2}$/.test(s.time)), "no invented times");
eq(liveStops({ stops: [{ kind: "event", end_date: "2026-11-01" }, { kind: "place" }] }, "2026-11-27").length, 1, "ended events drop at read time");
eq(findPersonalData(templatePrompt(cands, { city: "Tampa", theme }).user), null, "template prompts carry no personal data");

// ── leaderboard names ─────────────────────────────────────────────────────
eq(validatePublicName("Sunny Explorer").ok, true, "a normal name passes");
for (const bad of ["a", "x".repeat(25), "Wayfind Team", "admin", "me@x.com", "call 9415550100", "<script>", "Gabe"]) eq(validatePublicName(bad).ok, false, "rejected name: " + bad);

// ── daily picks ───────────────────────────────────────────────────────────
ok(inSendWindow("America/New_York", new Date("2026-11-27T15:00:00Z")), "10 AM Eastern is inside the window");
ok(!inSendWindow("America/New_York", new Date("2026-11-28T02:00:00Z")), "9 PM Eastern is quiet");
ok(!inSendWindow("America/Los_Angeles", new Date("2026-11-27T15:00:00Z")), "7 AM Pacific is quiet");
eq(tasteFrom([]), null, "no activity, no taste");
const taste = tasteFrom([{ place_id: "A", metro: "tampa", category: "food" }, { place_id: "B", metro: "tampa", category: "food" }, { place_id: "C", metro: "orlando", category: "attractions" }]);
eq([taste.metro, taste.category], ["tampa", "food"], "taste follows the member's own activity");
const pool = [{ place_id: "A" }, { place_id: "D", name: "D" }, { place_id: "E", name: "E" }];
const p1 = choosePick(pool, taste, { userId: "u", dayStr: "2026-11-27" });
ok(p1 && p1.place_id !== "A", "never a place the member already logged");
eq(choosePick(pool, taste, { userId: "u", dayStr: "2026-11-27" }), p1, "same member same day same pick");
eq(choosePick([{ place_id: "A" }], taste, { userId: "u", dayStr: "d" }), null, "no fresh place, no pick");
const msg = pickMessage({ place_id: "ChIJx", name: "Bakery 1908", category: "food", locality: "Tampa", editorial: "Cuban bread since 1908." });
ok(msg.url.startsWith("/p/ChIJx") && msg.title.length <= 80 && msg.body.length <= 170, "pick links to the Wayfind page");
// a run: one member subscribed, sends once, marks the day; a member with no activity gets nothing
const vapid = { NEXT_PUBLIC_WF_VAPID_PUBLIC_KEY: "", WF_VAPID_PRIVATE_KEY: "" };
eq((await runDailyPicks({ cfg: { url: "https://db", key: "k" }, todayStr: "2026-11-27", env: vapid })).reason, "vapid_unconfigured", "no keys, no sends");
const { generateVapidKeys } = await import("../lib/webPush.js");
const keys = generateVapidKeys();
const env2 = { NEXT_PUBLIC_WF_VAPID_PUBLIC_KEY: keys.publicKey, WF_VAPID_PRIVATE_KEY: keys.privateKey };
const sends = [];
const dbLog = [];
const dpFetch = async (url, init = {}) => {
  const u = String(url); dbLog.push({ u, init });
  const j = (b) => new Response(JSON.stringify(b), { status: 200 });
  if (u.includes("wf_web_push_subscriptions?or=")) return j([
    { id: "s1", user_id: "u1", endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: "x", auth: "y", tz: "America/New_York" },
    { id: "s2", user_id: "u2", endpoint: "https://fcm.googleapis.com/fcm/send/def", p256dh: "x", auth: "y", tz: "America/New_York" },
  ]);
  if (u.includes("wf_trip_logs?user_id=eq.u1")) return j([{ ref_id: "ChIJlogged001" }]);
  if (u.includes("wf_trip_logs") || u.includes("wf_itinerary_items")) return j([]);
  if (u.includes("wf_inventory?place_id=in.")) return j([{ place_id: "ChIJlogged001", metro: "tampa", category: "food" }]);
  if (u.includes("wf_inventory?metro=")) return j([{ place_id: "ChIJnew000001", name: "New Spot", category: "food", status: "OPERATIONAL", signals: { rating: 4.8 } }]);
  return j([]);
};
const run = await runDailyPicks({ cfg: { url: "https://db", key: "k" }, todayStr: "2026-11-27", env: env2, now: new Date("2026-11-27T15:00:00Z"), fetchImpl: dpFetch, send: async (a) => { sends.push(a); return { ok: true, status: 201, gone: false }; } });
eq([run.attempted, run.sent, run.skippedNoPick], [1, 1, 1], "the member with activity gets one pick; the one without gets none");
eq(sends[0].payload.url, "/p/ChIJnew000001?from=daily_pick", "the pick is a real, new place");
ok(dbLog.some((c) => c.init.method === "PATCH" && JSON.parse(c.init.body).last_sent_on === "2026-11-27"), "the day is marked so a second run sends nothing");
ok(dbLog[0].u.includes("last_sent_on.lt.2026-11-27"), "only members not sent today are read");
const quiet = await runDailyPicks({ cfg: { url: "https://db", key: "k" }, todayStr: "2026-11-27", env: env2, now: new Date("2026-11-28T03:00:00Z"), fetchImpl: dpFetch, send: async () => { throw new Error("must not send at night"); } });
eq(quiet.sent, 0, "nothing goes out in quiet hours");

// ── tiered badges and travel ──────────────────────────────────────────────
const spot = BADGES.find((b) => b.id === "on_the_spot");
eq(badgeLevel(spot, { verified_visits: 2 }).earned, false, "2 on the spot visits: not yet");
eq(badgeLevel(spot, { verified_visits: 3 }).level, "bronze", "3: bronze");
eq(badgeLevel(spot, { verified_visits: 10 }).level, "silver", "10: silver");
eq(badgeLevel(spot, { verified_visits: 40 }).level, "gold", "40: gold");
eq(badgeLevel(spot, { verified_visits: 4 }).next, { level: "silver", levelName: "Silver", toGo: 6 }, "next level and how far");
eq(badgesFor({ visits: 1, guides_published: 1 }).sort(), ["first_visit", "guide_author"], "publishing a guide earns Guide Author");
const sum = rewardsSummary({ visits: 1, verified_visits: 12 }, { env: {} });
eq(sum.badges.find((b) => b.id === "on_the_spot").levelName, "Silver", "the summary carries the level");
const now = Date.parse("2026-11-27T15:00:00Z");
ok(travelPlausible({ lat: 27.95, lng: -82.46, created_at: "2026-11-27T14:30:00Z" }, { lat: 27.77, lng: -82.64 }, now), "Tampa to St. Pete in 30 minutes is plausible");
ok(!travelPlausible({ lat: 27.95, lng: -82.46, created_at: "2026-11-27T14:30:00Z" }, { lat: 25.76, lng: -80.19 }, now), "Tampa to Miami in 30 minutes is not");
ok(travelPlausible(null, { lat: 1, lng: 1 }, now), "no previous visit is fine");

console.log(`test-ai-engine-community: ${count} assertions passed`);
