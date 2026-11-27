// Group Vote keeps the place you came from, and its picker understands plain
// asks ("somewhere fun"). Owner bug 2026-11-27: "i clicked on a place to
// initiate the group vote and it made me pick a new place from scratch", and
// the picker answered "somewhere fun" with "No spots or experiences matched".
// No network, no paid provider, no credentials: every dependency is injected.
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { groupPlanHref } from "../lib/shareContext.js";
import { sharePlaceId } from "../lib/shareFlow.js";
import { validateAuthReturn } from "../lib/authReturn.js";
import {
  understandGroupAsk, rulesForAsk, validateSmartAnswer, smartLabel, normalizeAsk,
  SMART_TYPES, GROUP_SEARCH_LANE, rankSmartRows,
} from "../lib/groupVoteSmartSearch.js";
import { OPENAI_COPY_LANES, laneCap } from "../lib/openAiCopy.js";
import { createGroupPlaceData } from "../lib/groupPlanPlaceData.js";
import { createGroupPlanService } from "../lib/groupPlanService.js";
import { groupMiles } from "../lib/groupPlanCandidates.js";
import { groupRateKey } from "../lib/groupPlanSecurity.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

// ── 1. The link: a place id always wins; a single place without an id still
// carries its name; lists and rails keep the plain picker. ──────────────────
const viaId = new URL(groupPlanHref("ChIJ38CBz8Vqw4gRg0oFYUGBU_s", "Dry Dock Waterfront Grill — found on Wayfind", true), "https://x.test");
eq(viaId.pathname + "|" + viaId.searchParams.get("place") + "|" + viaId.searchParams.get("name"), "/group-plans/new|ChIJ38CBz8Vqw4gRg0oFYUGBU_s|Dry Dock Waterfront Grill", "a place id starts the vote on that place");
eq(groupPlanHref("places/ChIJ38CBz8Vqw4gRg0oFYUGBU_s", "x", true), "/group-plans/new?place=ChIJ38CBz8Vqw4gRg0oFYUGBU_s&name=x", "a places/ resource id is unwrapped");
const viaName = new URL(groupPlanHref("", "Arcade Monsters", true, "Arcade Monsters"), "https://x.test");
eq([viaName.searchParams.get("pick"), viaName.searchParams.get("q")], ["1", "Arcade Monsters"], "no id but a single place: the picker opens searching its name");
eq(groupPlanHref("", "Trending near Tampa", true), "/group-plans/new?pick=1", "a list or rail keeps the plain picker");
eq(groupPlanHref("", "x", true, "a"), "/group-plans/new?pick=1", "a one-letter name is not a search");
eq(groupPlanHref("ChIJabc12345", "x", false, "x"), null, "feature off: no Group Vote at all");
ok(!/[\u0000-\u001f]/.test(decodeURIComponent(groupPlanHref("", "", true, "Bad\nName") || "")), "control characters never reach the link");

// The URL fallback recognizes both place routes.
eq(sharePlaceId({ url: "https://www.gowayfind.com/p/ChIJ38CBz8Vqw4gRg0oFYUGBU_s?t=x" }), "ChIJ38CBz8Vqw4gRg0oFYUGBU_s", "/p/<id> share links carry the place");
eq(sharePlaceId({ url: "https://www.gowayfind.com/places/ChIJ38CBz8Vqw4gRg0oFYUGBU_s" }), "ChIJ38CBz8Vqw4gRg0oFYUGBU_s", "/places/<id> share links carry the place");
eq(sharePlaceId({ url: "https://www.gowayfind.com/restaurants/sarasota" }), "", "a list page never becomes a place");

// The picker's link survives sign-in.
eq(validateAuthReturn("/group-plans/new?pick=1&q=Arcade%20Monsters"), "/group-plans/new?pick=1&q=Arcade%20Monsters", "sign-in brings the organizer back to the same search");

// ── 2. Wiring: every share surface hands its place to the sheet. ────────────
const sheet = strip(readFileSync(path.join(ROOT, "app/components/shareIntentSheet.js"), "utf8"));
ok(/const singleSubject = Boolean\(opt\.kind \|\| opt\.groupSearch\);/.test(sheet), "the sheet treats a card with place kinds (or groupSearch) as one place");
ok(/groupPlanHref\(opt\.groupId \|\| opt\.id, name, undefined, singleSubject \? name : ""\)/.test(sheet), "the sheet passes the place name as the picker search");
const flow = strip(readFileSync(path.join(ROOT, "lib/shareFlow.js"), "utf8"));
ok(/groupSearch: p\.groupSearch === true/.test(flow), "openShareFlow forwards groupSearch to the sheet");
const creator = strip(readFileSync(path.join(ROOT, "app/components/CreatorFinds.js"), "utf8"));
ok(/canonicalShareUrl\(spotHref\), groupSearch: true \}/.test(creator), "creator finds without an id still name their spot");
const poster = strip(readFileSync(path.join(ROOT, "app/components/PosterEventCard.js"), "utf8"));
ok(/placeId: event\.place_id \|\| event\.placeId \|\| ""/.test(poster), "event posters hand over the venue's place id");
const home = strip(readFileSync(path.join(ROOT, "app/home.js"), "utf8"));
ok(/shareLink\(event\.name \+ " — Wayfind", href, onCopied, [^;]*\{ placeId: event\.place_id \|\| event\.placeId \|\| "" \}\)/.test(home), "home event cards hand over the venue's place id");
const page = strip(readFileSync(path.join(ROOT, "app/group-plans/new/page.js"), "utf8"));
ok(/pickQuery=\{String\(params\?\.q\|\|""\)/.test(page), "the new-plan page reads the picker search from the link");

// ── 3. The picker: runs the search on arrival and starts on the exact place.
const UI = await loadComponent(path.join(ROOT, "app/group-plans/GroupPlanClient.js"), ROOT);
ok(UI.samePlaceName("Dry Dock Waterfront Grill — found on Wayfind", "dry dock waterfront grill"), "names compare without case, punctuation or the share suffix");
ok(!UI.samePlaceName("Dry Dock", "Dry Dock Waterfront Grill"), "a partial name is not the same place");
eq(UI.pickerAutoChoice([{ id: "a", kind: "place", name: "Arcade Monsters" }, { id: "b", kind: "place", name: "Bowlero" }], "Arcade Monsters")?.id, "a", "exactly one same-named result starts the vote on it");
eq(UI.pickerAutoChoice([{ id: "a", kind: "place", name: "Starbucks" }, { id: "b", kind: "place", name: "Starbucks" }], "Starbucks"), null, "two same-named spots: the organizer chooses, never a guess");
eq(UI.pickerAutoChoice([{ id: "vx_1", kind: "experience", name: "Arcade Monsters" }], "Arcade Monsters"), null, "a tour never stands in for a place");
const pickerSrc = strip(readFileSync(path.join(ROOT, "app/group-plans/GroupPlanClient.js"), "utf8"));
ok(/run\(initialQuery,\{fromLink:true\}\)/.test(pickerSrc) && /const auto=fromLink\?pickerAutoChoice\(items,q\):null;/.test(pickerSrc), "only a search that came from the link may auto-start the vote");
ok(/<GroupPlacePicker session=\{session\} initialQuery=\{pickQuery\}\/>/.test(pickerSrc), "the client passes the link's search to the picker");
ok(/signInBlock\(returnPathFor\(mode,planId,placeId,placeName,pickQuery\)\)/.test(pickerSrc), "the sign-in return keeps the search");

// Keyword first; plain-language search only when keyword finds fewer than 3.
{
  const calls = [];
  const session = { access_token: "t" };
  const request = async (p, body) => { calls.push(body.action); return { places: [{ id: "ChIJarcade1", kind: "place", name: "Arcade Monsters", city: "Sarasota" }, { id: "dup", name: "Dup" }], experiences: [], label: "arcades, bowling and mini golf" }; };
  const thin = await UI.searchGroupPicker("somewhere fun", { lat: 27.3, lng: -82.5 }, session, request, async () => [{ id: "dup", kind: "place", name: "Dup" }]);
  eq(calls, ["smart_search"], "a thin keyword answer asks the plain-language search");
  eq(thin.items.map((x) => x.id), ["dup", "ChIJarcade1"], "keyword results stay first and duplicates are dropped");
  eq(thin.label, "arcades, bowling and mini golf", "the label comes back for the organizer");
  calls.length = 0;
  const full = await UI.searchGroupPicker("sushi", null, session, request, async () => [1, 2, 3].map((i) => ({ id: "s" + i, kind: "place", name: "Sushi " + i })));
  eq(calls, [], "three or more keyword results never spend a plain-language call");
  eq(full.items.length, 3, "keyword results pass through");
  const down = await UI.searchGroupPicker("somewhere fun", null, session, async () => { throw new Error("down"); }, async () => []);
  eq(down.items, [], "a failed plain-language search falls back to the keyword answer without throwing");
  const signedOut = await UI.searchGroupPicker("somewhere fun", null, null, async () => { throw new Error("must not be called"); }, async () => []);
  eq(signedOut.items, [], "no session, no server call");
}

// ── 4. Understanding the ask: rules first, OpenAI only as a cached backstop,
// and nothing outside the closed list survives. ─────────────────────────────
eq(normalizeAsk("  Somewhere FUN!! "), "somewhere fun", "asks are normalized");
ok(rulesForAsk("somewhere fun").includes("video_arcade") && rulesForAsk("somewhere fun").includes("bowling_alley"), "\"somewhere fun\" means arcades, bowling and the like");
ok(rulesForAsk("date night").includes("cocktail_bar"), "\"date night\" means date spots");
ok(rulesForAsk("rainy day with kids").includes("aquarium") && rulesForAsk("rainy day with kids").includes("indoor_playground"), "\"rainy day with kids\" means indoor family spots");
eq(rulesForAsk("funny bone comedy"), ["comedy_club"], "\"funny\" is not \"fun\", but comedy is comedy");
eq(rulesForAsk("xyzzy"), null, "an unknown ask has no rule");
ok(Object.keys(SMART_TYPES).every((t) => /^[a-z_]+$/.test(t)), "the vocabulary is plain place types");
eq(validateSmartAnswer({ types: ["video_arcade", "Joe's Bar", "made_up_type", "VIDEO_ARCADE", "bowling_alley"], tourWords: ["kayak", "Kayak Tours LLC", "boat", "food"] }), { types: ["video_arcade", "bowling_alley"], tourWords: ["kayak", "boat"] }, "business names, invented types and long tour phrases are dropped");
eq(validateSmartAnswer({ types: ["nope"] }), null, "an answer with no allowed type is no answer");
eq(validateSmartAnswer("video_arcade"), null, "non-object answers are rejected");
eq(smartLabel(["video_arcade", "bowling_alley", "miniature_golf_course", "zoo"]), "arcades, bowling and mini golf", "the label is built from the types, never model text");

{
  const store = new Map();
  const cache = { cget: async (k) => (store.has(k) ? { v: store.get(k) } : null), cset: async (k, v) => { store.set(k, v); } };
  let aiCalls = 0, lastLane = "";
  const goodAi = async (lane, req) => { aiCalls++; lastLane = lane; ok(/Never name a business/.test(req.system) && req.json === true && req.temperature === 0, "the model is told the rules and asked for JSON"); return { ok: true, json: { types: ["planetarium", "fake_type", "museum"], tourWords: ["stars"] } }; };
  const ruled = await understandGroupAsk("somewhere fun", { cache, openAiCopy: goodAi });
  eq([ruled.source, aiCalls], ["rules", 0], "a common ask is answered by rules and costs nothing");
  const first = await understandGroupAsk("stargazing with my nerd friends", { cache, openAiCopy: goodAi });
  eq([first.source, first.types, first.tourWords, lastLane], ["openai", ["planetarium", "museum"], ["stars"], GROUP_SEARCH_LANE], "an unusual ask goes through the group_search lane and keeps only allowed types");
  eq(first.label, "planetariums and museums", "its label is built locally");
  const again = await understandGroupAsk("Stargazing with my nerd friends!", { cache, openAiCopy: goodAi });
  eq([again.source, aiCalls], ["cache", 1], "the same ask again is served from cache, no second call");
  let failCalls = 0;
  const badAi = async () => { failCalls++; return { ok: false, reason: "account_cap" }; };
  const failed = await understandGroupAsk("quiet place to read", { cache, openAiCopy: badAi });
  eq([failed.source, failed.types], ["none", []], "a capped or failed call returns nothing, never a guess");
  ok(!store.has("gvs1|quiet place to read"), "a failed call is not cached, so it can work later");
  const junkAi = async () => ({ ok: true, json: { types: ["Joe's Pizza"] } });
  const junk = await understandGroupAsk("blarg blarg", { cache, openAiCopy: junkAi });
  eq(junk.source, "none", "an answer with nothing allowed shows nothing");
  eq(store.get("gvs1|blarg blarg"), { types: [], tourWords: [] }, "an empty answer is cached so nonsense cannot cost twice");
  const thrown = await understandGroupAsk("weird ask here", { cache: { cget: async () => { throw new Error("x"); }, cset: async () => {} }, openAiCopy: async () => { throw new Error("boom"); } });
  eq(thrown.source, "none", "nothing here throws");
}

// The lane is metered like the other OpenAI features.
ok(OPENAI_COPY_LANES.group_search && OPENAI_COPY_LANES.group_search.sku === "openai_group_search", "group_search has its own ledger sku");
eq(laneCap("group_search", {}), 2000, "group_search defaults to 2000 requests a month");
eq(laneCap("group_search", { OPENAI_GROUP_SEARCH_MONTHLY_CAP: "unlimited" }), 2000, "a bad override never means unlimited");

// ── 5. Places come only from owned inventory, near the organizer. ──────────
{
  const urls = [];
  const near = { lat: 27.336, lng: -82.531 };
  const rows = [
    { place_id: "ChIJarcade111", name: "Arcade Monsters", lat: 27.34, lng: -82.53, primary_type: "video_arcade", status: "OPERATIONAL", excluded: false, signals: { rating: 4.9, reviews: 3329 }, locality: "Sarasota" },
    { place_id: "ChIJbowl11111", name: "Bowlero Gulf Gate", lat: 27.26, lng: -82.52, primary_type: "bowling_alley", status: "OPERATIONAL", excluded: false, signals: { rating: 4.4, reviews: 1638 }, locality: "Gulf Gate" },
    { place_id: "ChIJbowl22222", name: "Bowl 2", lat: 27.3, lng: -82.5, primary_type: "bowling_alley", status: "OPERATIONAL", excluded: false, signals: { rating: 4.3, reviews: 900 } },
    { place_id: "ChIJbowl33333", name: "Bowl 3", lat: 27.31, lng: -82.5, primary_type: "bowling_alley", status: "OPERATIONAL", excluded: false, signals: { rating: 4.5, reviews: 800 } },
    { place_id: "ChIJclosed111", name: "Closed Fun", lat: 27.33, lng: -82.53, primary_type: "video_arcade", status: "CLOSED_PERMANENTLY", excluded: false, signals: { rating: 5, reviews: 9999 } },
    { place_id: "ChIJexcl11111", name: "Hidden Row", lat: 27.33, lng: -82.53, primary_type: "video_arcade", status: "OPERATIONAL", excluded: true, signals: { rating: 5, reviews: 9999 } },
    { place_id: "ChIJWSN54VZBw4gRJeqLPipSLEM", name: "Le Mans Kitchen", lat: 27.33, lng: -82.53, primary_type: "video_arcade", status: "OPERATIONAL", excluded: false, signals: { rating: 5, reviews: 9999 } },
    { place_id: "ChIJfar111111", name: "Far Away Fun", lat: 28.5, lng: -81.4, primary_type: "video_arcade", status: "OPERATIONAL", excluded: false, signals: { rating: 5, reviews: 9999 } },
  ];
  const fetchImpl = async (url) => { urls.push(String(url)); return { ok: true, json: async () => rows }; };
  const data = createGroupPlaceData({ url: "https://db.test", key: "k" }, { fetchImpl, env: {} });
  const found = await data.smartSearch(["video_arcade", "bowling_alley", "drop table"], near, Date.now());
  ok(urls.length === 1 && /\/rest\/v1\/wf_inventory\?primary_type=in\.\(video_arcade,bowling_alley\)/.test(urls[0]), "only allowlisted-looking types reach the inventory query");
  ok(/status=eq\.OPERATIONAL/.test(urls[0]) && /excluded=not\.is\.true/.test(urls[0]), "the query asks for operational, not excluded rows");
  ok(!found.some((p) => ["ChIJclosed111", "ChIJexcl11111", "ChIJWSN54VZBw4gRJeqLPipSLEM", "ChIJfar111111"].includes(p.id)), "closed, excluded, not public and far rows never show");
  eq(found[0].id, "ChIJarcade111", "the best rated with the most reviews comes first");
  eq(found.filter((p) => p.primaryType === "bowling_alley").slice(0, 2).map((p) => p.id), ["ChIJbowl33333", "ChIJbowl11111"], "each type gets its best two up front (rating weighted by reviews)");
  ok(found.every((p) => p.kind === "place" && p.name && typeof p.city === "string"), "results use the picker's shape");
  eq(await data.smartSearch([], near), [], "no types, no query");
  eq(await data.smartSearch(["video_arcade"], { lat: "x" }), [], "no point, no query");
  eq(rankSmartRows([{ place_id: "a", lat: 0, lng: 0, signals: { rating: 5, reviews: 1 } }, { place_id: "b", lat: 0, lng: 0, signals: { rating: 4.7, reviews: 2000 } }], { lat: 0, lng: 0 }, groupMiles).map((r) => r.place_id), ["b", "a"], "one perfect review does not beat thousands of great ones");
}

// ── 6. The server action: signed in, rate limited, default area. ───────────
{
  const limits = [];
  const repository = { rateLimit: async (key, max) => { limits.push([key, max]); } };
  let seenPoint = null, seenTypes = null;
  const placeData = {
    smartSearch: async (types, point) => { seenTypes = types; seenPoint = point; return [{ id: "ChIJarcade111", kind: "place", name: "Arcade Monsters", city: "Sarasota" }]; },
    searchExperiences: async (word) => (word === "kayak" ? [{ id: "vx_1KAYAK", kind: "experience", name: "Clear Kayak" }, { id: "vx_1KAYAK", kind: "experience", name: "Clear Kayak" }] : []),
  };
  const service = createGroupPlanService({ repository, placeData, askReader: async () => ({ types: ["video_arcade"], tourWords: ["kayak"], label: "arcades", source: "rules" }) });
  await assert.rejects(() => service.smartSearch("somewhere fun", null, null), (e) => e.code === "SIGN_IN_REQUIRED"); n++;
  const res = await service.smartSearch("somewhere fun", null, { id: "u1" });
  ok(limits.length === 1 && limits[0][1] === 20 && limits[0][0] === groupRateKey("smart_search", "u1"), "each organizer is rate limited (20 per window)");
  ok(seenPoint && Number.isFinite(seenPoint.lat) && Number.isFinite(seenPoint.lng), "no browser location falls back to Wayfind's default area");
  eq(seenTypes, ["video_arcade"], "the understood types are what the inventory reads");
  eq([res.places.length, res.experiences.map((e) => e.id), res.label], [1, ["vx_1KAYAK"], "arcades"], "places, deduped tours and the label come back");
  const nothing = createGroupPlanService({ repository, placeData, askReader: async () => ({ types: [], tourWords: [], label: "", source: "none" }) });
  eq((await nothing.smartSearch("blarg", { lat: 27, lng: -82 }, { id: "u1" })).places, [], "nothing understood, nothing read");
  const route = strip(readFileSync(path.join(ROOT, "app/api/group-plans/route.js"), "utf8"));
  ok(/body\.action==="smart_search"\) return groupReply\(\{ok:true,\.\.\.await service\.smartSearch\(body\.query,body\.near\|\|null,user\)\}\)/.test(route), "the route exposes smart_search behind the verified organizer");
  const mw = readFileSync(path.join(ROOT, "middleware.js"), "utf8");
  ok(mw.includes('"/api/group-plans/:path*"'), "the group-plans route stays behind the middleware guard");
}

console.log(`test-group-vote-keep-place: OK — ${n} assertions (place kept from every share, picker search survives sign-in, plain-language search grounded in owned inventory, metered and cached)`);
