import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GET as socialDiscoveryGET } from "../app/api/cron/social-discovery/route.js";
import {
  SOCIAL_SEARCH_DAILY_CEILING, boundedQueryCount, normalizeIndexedBatch, normalizeIndexedShort,
  inventoryMetrosForRegions, plannedSocialQueries, platformForSocialUrl,
  qualifiedCandidateRows, resolveDiscoveryLocations, sourceEvidenceRows,
  runInstagramProfileSourceProof, sanitizeInstagramProfileSourceProof, verifySerpFreeInventory,
} from "../lib/socialAcquisition.js";

assert.equal(SOCIAL_SEARCH_DAILY_CEILING, 4);
assert.equal(boundedQueryCount("not-a-number"), 2);
assert.equal(boundedQueryCount("99"), 4);
assert.equal(plannedSocialQueries("2026-09-07", 99).length, 4);
assert.deepEqual(plannedSocialQueries("2026-09-07", 2), plannedSocialQueries("2026-09-07", 2));
assert.throws(() => plannedSocialQueries("today", 2), /Florida day/);
assert.equal(platformForSocialUrl("https://www.instagram.com/reel/ABC/"), "instagram");
assert.equal(platformForSocialUrl("https://www.tiktok.com/@a/video/1"), "tiktok");
assert.equal(platformForSocialUrl("https://example.com/video"), null);

const seasonal = normalizeIndexedShort({
  link: "https://www.instagram.com/reel/ABC/", title: "A pumpkin patch and corn maze in Tampa",
  profile_name: "Local Creator", extracted_views: 250000,
}, { key: "q1", region: "Tampa Bay" });
assert.equal(seasonal.platform, "instagram");
assert.equal(seasonal.observed_views, 250000);
assert.equal(seasonal.observed_likes, null, "views are never relabelled as likes");
assert.equal(seasonal.qualification_status, "trend_only", "an indexed result without likes cannot become a card candidate");
assert.ok(seasonal.seasonal_evidence.some((x) => x.category === "pumpkin_patch"));
assert.equal(normalizeIndexedShort({ link: "https://example.com/x", title: "pumpkin patch" }), null);
const nonSeasonal = normalizeIndexedShort({ link: "https://youtu.be/abc", title: "Florida beach day", extracted_views: 999999 });
assert.equal(nonSeasonal.qualification_status, "rejected", "virality cannot replace seasonal relevance");
const rawSeasonal = { link: "https://www.instagram.com/reel/ABC/", title: "A pumpkin patch and corn maze in Tampa", profile_name: "Local Creator", extracted_views: 250000 };
assert.equal(normalizeIndexedBatch([rawSeasonal, rawSeasonal], {}).length, 1);
assert.deepEqual(inventoryMetrosForRegions(["Tampa Bay", "Sarasota Bradenton"]), ["tampa", "st-pete", "manatee-sarasota"]);
const located = resolveDiscoveryLocations([seasonal], [
  { place_id: "farm-1", name: "Pumpkin Patch", lat: 27.5, lng: -82.5, metro: "tampa", status: "OPERATIONAL" },
], { now: Date.parse("2026-09-07T12:00:00Z") });
assert.equal(located[0].identity_status, "candidate");
assert.equal(located[0].candidate_place_id, "farm-1");
const approvedCreator = { platform: "instagram", handle: "Local Creator", status: "approved",
  evidence_url: "https://official.example/creator", reviewed_at: "2026-09-01", expires_at: "2026-11-01" };
assert.equal(qualifiedCandidateRows(located, [], { now: Date.parse("2026-09-07") }).length, 0,
  "views alone cannot qualify a card candidate");
assert.equal(qualifiedCandidateRows(located, [approvedCreator], { now: Date.parse("2026-09-07") }).length, 1,
  "an explicitly approved exact creator can advance to private card review");
assert.equal(qualifiedCandidateRows([{ ...located[0], observed_likes: 1000 }], [], { now: Date.parse("2026-09-07") }).length, 0);
assert.equal(qualifiedCandidateRows([{ ...located[0], observed_likes: 1001 }], [], { now: Date.parse("2026-09-07") }).length, 1);
const evidence = sourceEvidenceRows(located, Date.parse("2026-09-07T12:00:00Z"));
assert.equal(evidence.length, 2);
assert.ok(evidence.every((row) => row.internal_use && !row.display_allowed && !row.raw_redistribution_allowed && !row.commercial_api_allowed));

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
assert.equal((await verifySerpFreeInventory("k", 2, { fetcher: async () => response({ account_status: "Active", plan_monthly_price: 0, total_searches_left: 8 }) })).ok, true);
assert.equal((await verifySerpFreeInventory("k", 2, { fetcher: async () => response({ account_status: "Active", plan_monthly_price: 50, total_searches_left: 8 }) })).reason, "not_zero_cost_plan");
assert.equal((await verifySerpFreeInventory("k", 9, { fetcher: async () => response({ account_status: "Active", plan_monthly_price: 0, total_searches_left: 8 }) })).reason, "insufficient_free_inventory");

const approvedRegistry = {
  provider: "serpapi_social_free", status: "healthy", metered: true, internal_use: true,
  cost_after_free_micros: 0, capabilities: ["instagram_profile_source_proof"],
};
function sourceProofDb({ allowed = true, registry = approvedRegistry } = {}) {
  let reservations = 0;
  return {
    from(table) {
      assert.equal(table, "wf_source_registry", "source proof must not access acquisition tables");
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: registry, error: null }) }) }) };
    },
    rpc: async (name) => {
      assert.equal(name, "wf_reserve_free_provider_call"); reservations++;
      return { data: [{ allowed, reason: allowed ? "reserved" : "daily_ceiling_reached", calls: 1, free_units: 1 }], error: null };
    },
    reservations: () => reservations,
  };
}
const proofPost = { shortcode: "approved-post", owner: { username: "whenintampa" },
  like_and_view_counts_disabled: false, liked_by_count: 2001, media_preview_likes_count: 2001 };
const proofBody = { search_metadata: { status: "Success" }, profile_results: {
  username: "whenintampa", is_private: false, hide_like_and_view_counts: false,
  followers: 186000, posts_count: 1978, posts: [proofPost],
} };
const directProof = sanitizeInstagramProfileSourceProof(proofBody);
assert.equal(directProof.ok, true);
assert.equal(directProof.profile.posts[0].liked_by_count, 2001);
assert.equal(directProof.profile.posts[0].media_preview_likes_count, 2001);
assert.equal(directProof.profile.posts[0].likes_qualifying, false, "ambiguous counters cannot synthesize qualification");
assert.equal(sanitizeInstagramProfileSourceProof({ ...proofBody, profile_results: { ...proofBody.profile_results, is_private: undefined } }).reason, "profile_private_or_unknown");
assert.equal(sanitizeInstagramProfileSourceProof({ ...proofBody, profile_results: { ...proofBody.profile_results, posts: [{ ...proofPost, owner: { username: "other" } }] } }).reason, "post_owner_mismatch");
assert.equal(sanitizeInstagramProfileSourceProof({ ...proofBody, search_metadata: { status: "Processing" } }).reason, "profile_search_not_success");

let proofRequests = [];
const proofFetcher = async (url) => {
  proofRequests.push(url);
  if (url.pathname === "/account.json") return response({ account_status: "Active", plan_monthly_price: 0, total_searches_left: 8 });
  assert.equal(url.searchParams.get("engine"), "instagram_profile");
  assert.equal(url.searchParams.get("profile_id"), "whenintampa");
  assert.equal(url.searchParams.get("no_cache"), "false");
  return response(proofBody);
};
const blockedProof = await runInstagramProfileSourceProof(sourceProofDb({ registry: { ...approvedRegistry, capabilities: ["indexed_short_video_search"] } }), "secret-do-not-leak", { fetcher: proofFetcher, now: Date.parse("2026-09-07T12:00:00Z") });
assert.equal(blockedProof.reason, "profile_source_rights_unreviewed");
assert.equal(proofRequests.length, 0, "unreviewed rights make zero external calls");
const paidProof = await runInstagramProfileSourceProof(sourceProofDb(), "secret-do-not-leak", { fetcher: async () => response({ account_status: "Active", plan_monthly_price: 50, total_searches_left: 8 }), now: Date.parse("2026-09-07T12:00:00Z") });
assert.equal(paidProof.reason, "not_zero_cost_plan"); assert.equal(paidProof.profile_requests, 0);
const deniedDb = sourceProofDb({ allowed: false });
const meterDenied = await runInstagramProfileSourceProof(deniedDb, "secret-do-not-leak", { fetcher: async () => response({ account_status: "Active", plan_monthly_price: 0, total_searches_left: 8 }), now: Date.parse("2026-09-07T12:00:00Z") });
assert.equal(meterDenied.reason, "provider_meter_daily_ceiling_reached"); assert.equal(deniedDb.reservations(), 1);
proofRequests = [];
const proof = await runInstagramProfileSourceProof(sourceProofDb(), "secret-do-not-leak", { fetcher: proofFetcher, now: Date.parse("2026-09-07T12:00:00Z") });
assert.equal(proof.ok, true); assert.equal(proof.profile_requests, 1);
assert.equal(proofRequests.filter((url) => url.pathname === "/search.json").length, 1, "success makes one profile request");
let timeoutRequests = 0;
const timedOut = await runInstagramProfileSourceProof(sourceProofDb(), "secret-do-not-leak", { fetcher: async (url) => {
  if (url.pathname === "/account.json") return response({ account_status: "Active", plan_monthly_price: 0, total_searches_left: 8 });
  timeoutRequests++; throw new Error("timeout");
}, now: Date.parse("2026-09-07T12:00:00Z") });
assert.equal(timedOut.reason, "profile_network_or_timeout"); assert.equal(timeoutRequests, 1, "timeout has no retry");

const savedCronSecret = process.env.CRON_SECRET;
const savedSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const savedServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const savedSerpKey = process.env.SERPAPI_KEY;
const savedFetch = globalThis.fetch;
process.env.CRON_SECRET = "source-proof-test-secret";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.SERPAPI_KEY = "test-serp-key";
let routeCalls = [];
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  routeCalls.push(`${url.origin}${url.pathname}`);
  if (url.pathname === "/rest/v1/wf_source_registry") return Response.json([approvedRegistry]);
  if (url.pathname === "/rest/v1/rpc/wf_reserve_free_provider_call") return Response.json([{ allowed: true, reason: "reserved", calls: 1, free_units: 1 }]);
  if (url.pathname === "/account.json") return Response.json({ account_status: "Active", plan_monthly_price: 0, total_searches_left: 8 });
  if (url.pathname === "/search.json") return Response.json(proofBody);
  throw new Error(`unexpected route ${url.pathname}`);
};
const unauthorized = await socialDiscoveryGET(new Request("https://wayfind.test/api/cron/social-discovery?mode=source-proof", { headers: { authorization: "Bearer wrong" } }));
assert.equal(unauthorized.status, 401); assert.equal(routeCalls.length, 0);
const badMode = await socialDiscoveryGET(new Request("https://wayfind.test/api/cron/social-discovery?mode=source-proff", { headers: { authorization: "Bearer source-proof-test-secret" } }));
assert.equal(badMode.status, 400); assert.equal(routeCalls.length, 0);
const routeProof = await socialDiscoveryGET(new Request("https://wayfind.test/api/cron/social-discovery?mode=source-proof", { headers: { authorization: "Bearer source-proof-test-secret" } }));
assert.equal(routeProof.status, 200);
assert.equal(routeCalls.filter((call) => call.endsWith("/search.json")).length, 1);
const noAcquisitionCall = (calls) => calls.every((call) => !/wf_social_(discoveries|candidates)|wf_source_evidence|wf_inventory/.test(call));
assert.equal(noAcquisitionCall(routeCalls), true, "authenticated proof returns before acquisition access");
assert.equal(noAcquisitionCall([...routeCalls, "https://supabase.test/rest/v1/wf_social_discoveries"]), false, "positive control detects an acquisition write");
globalThis.fetch = savedFetch;
for (const [key, value] of [["CRON_SECRET", savedCronSecret], ["NEXT_PUBLIC_SUPABASE_URL", savedSupabaseUrl], ["SUPABASE_SERVICE_ROLE_KEY", savedServiceKey], ["SERPAPI_KEY", savedSerpKey]]) {
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
}

const route = readFileSync(new URL("../app/api/cron/social-discovery/route.js", import.meta.url), "utf8");
assert.match(route, /publication_enabled:\s*false/);
assert.match(route, /paid_calls:\s*0/);
assert.match(route, /verifySerpFreeInventory/);
assert.match(route, /reserveFreeProviderCall/);
assert.match(route, /mode === "source-proof"/);
assert.match(route, /mode !== null && mode !== "source-proof"/);
assert.match(route, /acquisition_writes:\s*0/);
assert.match(route, /wf_social_discoveries/);
assert.doesNotMatch(route, /from\(["']wf_events["']\)/);
assert.match(route, /readAcquisitionInventory/);
assert.doesNotMatch(route, /instagram\.com\//, "the cron never fetches a social platform page");

const migration = readFileSync(new URL("../supabase/migrations/20260907150500_social_acquisition_conveyor_v1.sql", import.meta.url), "utf8");
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on public\.wf_social_discoveries from anon, authenticated/);
assert.match(migration, /raw_redistribution_allowed[\s\S]*false/);
assert.match(migration, /commercial_api_allowed[\s\S]*false/);
assert.match(migration, /hard_call_ceiling_daily[\s\S]*4/);
assert.match(migration, /search_index/);

console.log("social-acquisition-conveyor-regression: OK — indexed social discovery is $0-gated, private, seasonal and unable to invent likes or publish cards");
