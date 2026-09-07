import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SOCIAL_SEARCH_DAILY_CEILING, boundedQueryCount, normalizeIndexedBatch, normalizeIndexedShort,
  inventoryMetrosForRegions, plannedSocialQueries, platformForSocialUrl,
  qualifiedCandidateRows, resolveDiscoveryLocations, sourceEvidenceRows,
  verifySerpFreeInventory,
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

const route = readFileSync(new URL("../app/api/cron/social-discovery/route.js", import.meta.url), "utf8");
assert.match(route, /publication_enabled:\s*false/);
assert.match(route, /paid_calls:\s*0/);
assert.match(route, /verifySerpFreeInventory/);
assert.match(route, /reserveFreeProviderCall/);
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
