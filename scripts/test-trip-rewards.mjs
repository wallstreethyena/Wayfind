// Trip log rewards: the pure rules (lib/rewards.js), the server flow
// (lib/tripLogServer.js) driven with an injected fetch (no network), and a
// real render of the drawer body and the Log your visit card in each state.
//
// Locks: tier and badge edges; giveaway hidden unless the flag is on; device
// position never reaches the database call; reads go out with the member's
// own token, never the service key; a closed place, a missing place, a bad
// date, a duplicate and a rate limit each map to a plain message; missing
// configuration answers 503, never a fake empty state.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { loadComponent } from "./lib/jsxLoad.mjs";
import {
  POINTS, TIERS, tierFor, nextTier, tierProgress, badgesFor, rewardsSummary, pointsFor,
  verifyVisit, validateTripLog, logErrorFor, giveawayPublic, haversineMiles,
} from "../lib/rewards.js";
import { handleTripLog, handleRewardsRead, tripLogEnv } from "../lib/tripLogServer.js";

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n += 1; };
const ok = (v, m) => { assert.ok(v, m); n += 1; };

// ── tiers ─────────────────────────────────────────────────────────────────
eq(tierFor(0).id, "local_scout", "0 points is Local Scout");
eq(tierFor(149).id, "local_scout", "149 is still Local Scout");
eq(tierFor(150).id, "florida_insider", "150 is Florida Insider");
eq(tierFor(499).id, "florida_insider", "499 is still Florida Insider");
eq(tierFor(500).id, "wayfind_trailblazer", "500 is Wayfind Trailblazer");
eq(tierFor(-5).id, "local_scout", "negative points clamp to the first tier");
eq(tierFor("abc").id, "local_scout", "junk points clamp to the first tier");
eq(nextTier(500), null, "no tier after the top");
eq(nextTier(149).id, "florida_insider", "next tier from 149");
eq(tierProgress(75), 0.5, "halfway to Florida Insider");
eq(tierProgress(10000), 1, "progress is 1 at the top tier");
eq(TIERS.map((t) => t.minPoints), [0, 150, 500], "tier thresholds are the documented ones");

// ── badges ────────────────────────────────────────────────────────────────
eq(badgesFor({}), [], "no badges for an empty profile");
eq(badgesFor({ visits: 1 }), ["first_visit"], "first visit");
eq(badgesFor({ visits: 3, verified_visits: 3 }), ["first_visit", "on_the_spot"], "three on the spot visits");
eq(badgesFor({ visits: 2, verified_visits: 2 }), ["first_visit"], "two on the spot visits is not enough");
eq(badgesFor({ visits: 12, intel_visits: 5, event_visits: 3, distinct_refs: 10, verified_visits: 0 }).sort(), ["event_goer", "first_visit", "local_intel", "ten_spots"], "intel, events and ten spots");

// ── points mirror ─────────────────────────────────────────────────────────
eq(pointsFor({ verification: "nearby", intelCount: 4 }), POINTS.visit + POINTS.verified + POINTS.localIntel, "max points per visit");
eq(pointsFor({ verification: "self_reported", intelCount: 1 }), POINTS.visit, "base points");

// ── giveaway flag ─────────────────────────────────────────────────────────
eq(giveawayPublic({}), false, "giveaway is off by default");
eq(giveawayPublic({ NEXT_PUBLIC_WF_GIVEAWAY_PUBLIC: "1" }), true, "giveaway turns on only with the flag");
const hidden = rewardsSummary({ points: 20, visits: 1, giveaway_month: "2026-11", giveaway_entries: 3 }, { monthStr: "2026-11", env: {} });
ok(!("giveawayEntries" in hidden), "summary never mentions entries while the giveaway is off");
const shown = rewardsSummary({ points: 20, visits: 1, giveaway_month: "2026-11", giveaway_entries: 3 }, { monthStr: "2026-11", env: { NEXT_PUBLIC_WF_GIVEAWAY_PUBLIC: "1" } });
eq(shown.giveawayEntries, 3, "entries show when the flag is on");
eq(rewardsSummary({ giveaway_month: "2026-10", giveaway_entries: 3 }, { monthStr: "2026-11", env: { NEXT_PUBLIC_WF_GIVEAWAY_PUBLIC: "1" } }).giveawayEntries, 0, "last month's entries do not count this month");

// ── verification ──────────────────────────────────────────────────────────
const place = { lat: 27.9506, lng: -82.4572 };
eq(verifyVisit(null, place), { verification: "self_reported", distance_band: "unknown" }, "no device position is self reported");
eq(verifyVisit({ lat: 27.9507, lng: -82.4573 }, place).verification, "nearby", "a few meters away is nearby");
eq(verifyVisit({ lat: 27.9506, lng: -82.4572 }, { lat: NaN, lng: 0 }).verification, "self_reported", "a place with no coordinates cannot verify");
eq(verifyVisit({ lat: 28.5383, lng: -81.3792 }, place), { verification: "self_reported", distance_band: "farther" }, "Orlando is not near Tampa");
ok(Math.abs(haversineMiles({ lat: 27.9506, lng: -82.4572 }, { lat: 28.5383, lng: -81.3792 }) - 77) < 4, "haversine Tampa to Orlando is about 77 miles");

// ── input validation ──────────────────────────────────────────────────────
const T = "2026-11-25";
eq(validateTripLog({ refKind: "x", refId: "ChIJabc123" }, T).ok, false, "unknown kind rejected");
eq(validateTripLog({ refKind: "place", refId: "a b" }, T).ok, false, "bad id rejected");
eq(validateTripLog({ refKind: "place", refId: "ChIJabc123", visitedOn: "2026-11-26" }, T).ok, false, "future date rejected");
eq(validateTripLog({ refKind: "place", refId: "ChIJabc123", visitedOn: "2026-11-10" }, T).ok, false, "15 days back rejected");
const v = validateTripLog({ refKind: "place", refId: "ChIJabc123", crowd: "packed", vibe: "nope", email: "a@b.c", note: "hi", device: { lat: 27, lng: -82 } }, T);
eq(v.ok, true, "valid input passes");
eq(v.value, { refKind: "place", refId: "ChIJabc123", visitedOn: T, crowd: "packed", vibe: null, bestTime: null, wait: null }, "only allow listed fields survive; unknown values drop to null; no email or note");
eq(v.device, { lat: 27, lng: -82 }, "device position is passed through for the distance check only");

// ── error mapping ─────────────────────────────────────────────────────────
eq(logErrorFor("WF_DUPLICATE").status, 409, "duplicate is 409");
eq(logErrorFor("WF_RATE_LIMITED").status, 429, "rate limit is 429");
eq(logErrorFor("WF_BAD_DATE").status, 400, "bad date is 400");
eq(logErrorFor("boom").status, 502, "anything else is 502");

// ── server flow with an injected fetch ────────────────────────────────────
eq(tripLogEnv({}), null, "missing configuration is null");
const cfg = tripLogEnv({ SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-key-0123456789abcdef", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-0123456789abcdefgh" });
ok(cfg && cfg.url === "https://proj.supabase.co", "configuration parsed");
eq((await handleTripLog({ cfg: null, token: "t".repeat(30), body: {}, todayStr: T })).status, 503, "unconfigured answers 503");

const USER = "11111111-2222-3333-4444-555555555555";
const TOKEN = "member-token-" + "x".repeat(20);
function fakeFetch({ place = { place_id: "ChIJopen000001", lat: 27.9506, lng: -82.4572, status: "OPERATIONAL", excluded: false }, event = null, rpcFail = null } = {}) {
  const calls = [];
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    const auth = (init.headers && (init.headers.Authorization || init.headers.authorization)) || "";
    if (u.endsWith("/auth/v1/user")) return auth === "Bearer " + TOKEN ? res(200, { id: USER }) : res(401, {});
    if (u.includes("/rest/v1/wf_inventory")) return res(200, place ? [place] : []);
    if (u.includes("/rest/v1/wf_events")) return res(200, event ? [event] : []);
    if (u.includes("/rest/v1/rpc/wf_log_visit")) {
      if (rpcFail) return res(400, { message: rpcFail });
      return res(200, { trip_log_id: "abc", points_awarded: 30, giveaway_entry: true, profile: { points: 160, visits: 4, verified_visits: 3, intel_visits: 1, event_visits: 0, distinct_refs: 4, giveaway_month: "2026-11", giveaway_entries: 3 } });
    }
    if (u.includes("/rest/v1/wf_rewards_profile") && init.method === "PATCH") return res(204, null);
    if (u.includes("/rest/v1/wf_rewards_profile")) return res(200, [{ points: 40, visits: 2, verified_visits: 1, intel_visits: 0, event_visits: 0, distinct_refs: 2 }]);
    if (u.includes("/rest/v1/wf_trip_logs")) return res(200, [{ ref_kind: "place", ref_id: "ChIJopen000001", visited_on: T, verification: "nearby" }]);
    return res(404, {});
  };
  f.calls = calls;
  return f;
}

let f = fakeFetch();
eq((await handleTripLog({ cfg, token: null, body: {}, todayStr: T, fetchImpl: f })).status, 401, "no session is 401");
eq((await handleTripLog({ cfg, token: "bad-token-" + "y".repeat(20), body: {}, todayStr: T, fetchImpl: f })).status, 401, "a rejected session is 401");
eq((await handleTripLog({ cfg, token: TOKEN, body: { refKind: "place" }, todayStr: T, fetchImpl: f })).status, 400, "missing id is 400");

f = fakeFetch({ place: { place_id: "ChIJopen000001", lat: 1, lng: 1, status: "CLOSED_PERMANENTLY", excluded: false } });
eq((await handleTripLog({ cfg, token: TOKEN, body: { refKind: "place", refId: "ChIJopen000001" }, todayStr: T, fetchImpl: f })).status, 410, "a closed place cannot be logged");
ok(!f.calls.some((c) => c.url.includes("/rpc/")), "a closed place never reaches the database writer");
f = fakeFetch({ place: null });
eq((await handleTripLog({ cfg, token: TOKEN, body: { refKind: "place", refId: "ChIJopen000001" }, todayStr: T, fetchImpl: f })).status, 404, "an unknown place is 404");
f = fakeFetch({ place: { place_id: "ChIJopen000001", lat: 1, lng: 1, status: null, excluded: true } });
eq((await handleTripLog({ cfg, token: TOKEN, body: { refKind: "place", refId: "ChIJopen000001" }, todayStr: T, fetchImpl: f })).status, 404, "an excluded place is 404");
f = fakeFetch({ rpcFail: "WF_DUPLICATE" });
const dup = await handleTripLog({ cfg, token: TOKEN, body: { refKind: "place", refId: "ChIJopen000001" }, todayStr: T, fetchImpl: f });
eq([dup.status, dup.body.code], [409, "duplicate"], "duplicate maps to 409");

f = fakeFetch();
const good = await handleTripLog({ cfg, token: TOKEN, body: { refKind: "place", refId: "ChIJopen000001", crowd: "busy", device: { lat: 27.9507, lng: -82.4573 } }, todayStr: T, fetchImpl: f, env: {} });
eq(good.status, 200, "a valid log succeeds");
eq(good.body.verification, "nearby", "position near the place verifies");
eq(good.body.rewards.tier.id, "florida_insider", "summary uses the returned profile");
ok(!("giveawayEntries" in good.body.rewards), "success never mentions entries while the giveaway is off");
const rpcCall = f.calls.find((c) => c.url.includes("/rpc/wf_log_visit"));
const rpcBody = JSON.parse(rpcCall.init.body);
eq(rpcBody.p_user_id, USER, "the writer gets the VERIFIED user id, not one from the body");
ok(!/27\.95|82\.45|"lat"|"lng"|device/.test(rpcCall.init.body), "no device coordinate is ever sent to the database");
eq(rpcBody.p_verification, "nearby", "verification decided server side");
ok(rpcCall.init.headers.Authorization === "Bearer " + cfg.service, "the writer uses the service role");
const patch = f.calls.find((c) => c.init.method === "PATCH");
eq(JSON.parse(patch.init.body), { tier: "florida_insider", badges: ["first_visit", "on_the_spot"] }, "stored tier and badges follow lib/rewards.js");
f = fakeFetch();
const backdated = await handleTripLog({ cfg, token: TOKEN, body: { refKind: "place", refId: "ChIJopen000001", visitedOn: "2026-11-20", device: { lat: 27.9507, lng: -82.4573 } }, todayStr: T, fetchImpl: f });
eq([backdated.status, backdated.body.verification], [200, "self_reported"], "a back dated visit is self reported even with a position near the place");
f = fakeFetch({ place: { place_id: "ChIJopen000001", lat: null, lng: null, status: "OPERATIONAL", excluded: false } });
const nullIsland = await handleTripLog({ cfg, token: TOKEN, body: { refKind: "place", refId: "ChIJopen000001", device: { lat: 0, lng: 0 } }, todayStr: T, fetchImpl: f });
eq(nullIsland.body.verification, "self_reported", "a place with no stored position never verifies, even for a device at 0,0");
const forged = await handleTripLog({ cfg, token: TOKEN, body: { refKind: "place", refId: "ChIJopen000001", userId: "99999999-0000-0000-0000-000000000000" }, todayStr: T, fetchImpl: fakeFetch() });
eq(forged.status, 200, "a body user id is ignored");

// events: found by event_id or slug, cancelled and not yet started are refused
f = fakeFetch({ event: { event_id: "gaylord-ice-2026", slug: "gaylord-ice-2026", lat: 28.36, lng: -81.4, start_date: "2026-11-14", event_status: "scheduled" } });
const evOk = await handleTripLog({ cfg, token: TOKEN, body: { refKind: "event", refId: "gaylord-ice-2026" }, todayStr: T, fetchImpl: f });
eq([evOk.status, evOk.body.verification], [200, "self_reported"], "an event visit without a position is self reported");
const evUrl = f.calls.find((c) => c.url.includes("/rest/v1/wf_events")).url;
ok(decodeURIComponent(evUrl).includes('or=(event_id.eq."gaylord-ice-2026",slug.eq."gaylord-ice-2026")'), "event lookup matches event_id or slug with a quoted value");
f = fakeFetch({ event: { event_id: "x-2026", slug: "x-2026", start_date: "2026-11-01", event_status: "cancelled" } });
eq((await handleTripLog({ cfg, token: TOKEN, body: { refKind: "event", refId: "x-2026" }, todayStr: T, fetchImpl: f })).status, 410, "a cancelled event cannot be logged");
f = fakeFetch({ event: { event_id: "u-2026", slug: "u-2026", start_date: "2026-11-01", event_status: "unannounced" } });
eq((await handleTripLog({ cfg, token: TOKEN, body: { refKind: "event", refId: "u-2026" }, todayStr: T, fetchImpl: f })).status, 410, "an unannounced or paused event cannot be logged");
f = fakeFetch({ event: { event_id: "y-2026", slug: "y-2026", start_date: "2026-12-01", event_status: "scheduled" } });
eq((await handleTripLog({ cfg, token: TOKEN, body: { refKind: "event", refId: "y-2026" }, todayStr: T, fetchImpl: f })).body.code, "not_started", "an event that has not started cannot be logged");
f = fakeFetch({ event: { event_id: "e-2026", slug: "e-2026", start_date: "2026-10-01", end_date: "2026-10-31", event_status: "completed" } });
eq((await handleTripLog({ cfg, token: TOKEN, body: { refKind: "event", refId: "e-2026" }, todayStr: T, fetchImpl: f })).body.code, "ended", "a visit after an event ended cannot be logged");
f = fakeFetch({ event: { event_id: "other-2026", slug: "other-2026", start_date: "2026-11-01" } });
eq((await handleTripLog({ cfg, token: TOKEN, body: { refKind: "event", refId: "z-2026" }, todayStr: T, fetchImpl: f })).status, 404, "a row for another event is not accepted");

f = fakeFetch();
const read = await handleRewardsRead({ cfg, token: TOKEN, todayStr: T, fetchImpl: f, env: {} });
eq(read.status, 200, "rewards read succeeds");
eq(read.body.rewards.points, 40, "read returns the member's points");
eq(read.body.recent, [{ refKind: "place", refId: "ChIJopen000001", visitedOn: T, verified: true }], "recent visits mapped");
const restReads = f.calls.filter((c) => c.url.includes("/rest/v1/"));
ok(restReads.length === 2 && restReads.every((c) => c.init.headers.Authorization === "Bearer " + TOKEN), "reads go out with the member's own token so RLS decides");
eq((await handleRewardsRead({ cfg, token: null, todayStr: T, fetchImpl: f })).status, 401, "rewards read without a session is 401");

// ── real renders ──────────────────────────────────────────────────────────
const root = fileURLToPath(new URL("..", import.meta.url));
const drawer = await loadComponent(fileURLToPath(new URL("../app/components/RewardsDrawer.js", import.meta.url)), root);
const Body = drawer.RewardsBody;
const r = (state) => renderToStaticMarkup(React.createElement(Body, { state, onRetry: () => {}, onSignIn: () => {} }));
ok(r({ loading: true }).includes('data-rewards-loading="1"'), "loading state renders");
ok(r({ loading: false, data: { ok: false, code: "sign_in", error: "Sign in to see your rewards." } }).includes(">Sign in<"), "signed out state offers sign in");
ok(r({ loading: false, data: { ok: false, code: "offline", error: "You are offline." } }).includes("Try again"), "offline state offers retry");
const emptyHtml = r({ loading: false, data: { ok: true, rewards: rewardsSummary({}, { env: {} }), recent: [] } });
ok(emptyHtml.includes('data-rewards-empty="1"') && emptyHtml.includes('data-rewards-tier="local_scout"'), "empty state renders with the first tier");
ok(!/giveaway|prize|win /i.test(emptyHtml) && !emptyHtml.includes("Entries this month"), "no giveaway or prize copy while off");
const fullHtml = r({ loading: false, data: { ok: true, rewards: rewardsSummary({ points: 520, visits: 14, verified_visits: 4, intel_visits: 6, event_visits: 3, distinct_refs: 11 }, { env: {} }), recent: [{ verified: true }, { verified: false }] } });
ok(fullHtml.includes("You reached the top tier") && (fullHtml.match(/data-earned="1"/g) || []).length === 5, "top tier with all five badges");
for (const html of [emptyHtml, fullHtml]) ok(!/[–—]/.test(html), "no dashes in drawer copy");

const card = await loadComponent(fileURLToPath(new URL("../app/components/LogVisitCard.js", import.meta.url)), root);
const Card = card.default;
const signedOut = renderToStaticMarkup(React.createElement(Card, { refId: "ChIJopen000001", user: null, onSignIn: () => {} }));
ok(signedOut.includes('data-log-visit="collapsed"') && signedOut.includes(">Sign in<"), "signed out card asks to sign in");
const signedIn = renderToStaticMarkup(React.createElement(Card, { refId: "ChIJopen000001", user: { id: USER } }));
ok(signedIn.includes(">Log your visit<") && !/[–—]/.test(signedIn), "signed in card offers Log your visit, no dashes");
eq(renderToStaticMarkup(React.createElement(Card, { refId: "", user: null })), "", "no id renders nothing");
ok(/min-height:92px/.test(signedIn.replace(/\s/g, "")) && card.LOG_VISIT_MIN_HEIGHT === 92, "collapsed card height matches the placeholder the detail sheet reserves");

console.log(`test-trip-rewards: OK (${n} assertions; rules, server flow with injected fetch, real renders)`);
