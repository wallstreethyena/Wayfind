import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isFloridaInventory, normalizedPlaceName, resolveExtractedVenue, resolveSocialPlace } from "../lib/socialIdentity.js";
import { buildWeeklySocialTrendReport } from "../lib/socialTrends.js";

const now = Date.parse("2026-09-06T12:00:00Z");
const inventory = [
  { place_id: "farm-1", name: "Sunshine Pumpkin Farm", lat: 27.5, lng: -82.5 },
  { place_id: "ga-1", name: "Georgia Farm", lat: 33.7, lng: -84.4 },
];
const creator = { platform: "instagram", handle: "fixture", status: "approved", evidence_url: "https://official.example", reviewed_at: "2026-09-01", expires_at: "2026-11-01", canonical_place_id: "farm-1" };
assert.equal(normalizedPlaceName("Café & Farm!"), "cafe and farm");
assert.equal(isFloridaInventory(inventory[0]), true);
assert.equal(isFloridaInventory(inventory[1]), false);
assert.deepEqual(resolveSocialPlace({ caption: "anything", platform: "instagram", handle: "fixture" }, { creator, inventory, now }), { status: "candidate", method: "reviewed_creator_place", place_id: "farm-1", confidence: 1 });
assert.equal(resolveSocialPlace({ source_place_id: "farm-1" }, { inventory, now }).status, "candidate");
assert.deepEqual(resolveSocialPlace({ location_name: "Sunshine Pumpkin Farm", location_lat: 27.5002, location_lng: -82.5002 }, { inventory, now }), { status: "candidate", method: "location_tag_name_and_coordinates", place_id: "farm-1", confidence: 0.95 });
assert.equal(resolveSocialPlace({ caption: "Sunshine Pumpkin Farm opens its corn maze" }, { inventory, now }).status, "candidate");
assert.equal(resolveSocialPlace({ caption: "fall vibes" }, { creator: { ...creator, expires_at: "2026-09-05" }, inventory, now }).status, "unresolved");
assert.equal(resolveExtractedVenue("Sunshine Pumpkin Farm", inventory).status, "candidate");

const report = buildWeeklySocialTrendReport([
  { last_seen_at: "2026-09-04", qualification_reason: "likes_over_1000", caption: "pumpkin patch and hayride", like_count: 1501, comments_count: 20, candidate_place_id: "farm-1" },
  { last_seen_at: "2026-08-01", qualification_reason: "likes_over_1000", caption: "Halloween party", like_count: 9999, comments_count: 50 },
], { start: Date.parse("2026-09-01"), end: Date.parse("2026-09-08") });
assert.equal(report.qualified_leads, 1);
assert.equal(report.resolved_leads, 1);
assert.deepEqual(report.categories.map((x) => x.category), ["hayride", "pumpkin_patch"]);

const route = readFileSync(new URL("../app/api/cron/social-intelligence/route.js", import.meta.url), "utf8");
assert.match(route, /publication_enabled:\s*false/);
assert.doesNotMatch(route, /api\.anthropic\.com/);
assert.match(route, /buildSocialReviewQueue/);
assert.doesNotMatch(route, /from\("wf_events"\)/);
const migration = readFileSync(new URL("../supabase/migrations/20260906022518_social_intelligence_control_plane.sql", import.meta.url), "utf8");
for (const table of ["wf_social_creators", "wf_source_evidence", "wf_social_trend_reports"]) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon, authenticated`));
}
assert.match(migration, /internal_use boolean not null default false/);
assert.match(migration, /derived_facts_allowed boolean not null default false/);
assert.match(migration, /alter column like_count drop not null/);
assert.match(migration, /alter column comments_count drop not null/);
assert.match(migration, /location_lat is not null and location_lng is not null/);
console.log("check-social-intelligence: OK; identity, trends, rights, privacy and no-publication controls executed");

assert.equal(resolveSocialPlace({ caption: "anything", platform: "tiktok", handle: "fixture" }, { creator, inventory, now }).status, "unresolved");
assert.equal(isFloridaInventory({ state: "GA", lat: 30.8, lng: -84 }), false);
assert.equal(resolveSocialPlace({ caption: "Sunshine Pumpkin Farm", location_city: "Atlanta" }, { inventory, now }).status, "unresolved");
assert.match(route, /social_preflight_incomplete/);

const { readSocialPages, buildSocialReviewQueue } = await import('../lib/socialReviewQueue.js');
const corpus = Array.from({ length: 1201 }, (_, i) => ({ place_id: String(i).padStart(5, '0') }));
const requests = [];
const db = { from(table) {
  let cursor = null;
  const q = { select() { return q; }, order() { return q; }, limit() { return q; },
    eq(field, value) { assert.equal(value, 'OPERATIONAL'); return q; },
    gt(field, value) { cursor = value; return q; },
    then(resolve) { requests.push(cursor); resolve({ data: corpus.filter(r => cursor === null || r.place_id > cursor).slice(0, 200), error: null }); }
  }; return q;
} };
assert.equal((await readSocialPages(db, 'wf_inventory', '*', 'place_id')).length, 1201);
assert.equal(requests.length, 8, 'server-capped short pages do not terminate the read');
await assert.rejects(readSocialPages(db, 'wf_inventory', '*', 'place_id', { ceiling: 1000 }), /ceiling/);
const lead = { platform: 'instagram', media_id: '1', caption: 'Sunshine Pumpkin Farm corn maze', like_count: 1001 };
const queue = buildSocialReviewQueue([lead, lead, { ...lead, media_id: '2', like_count: 1000 }], inventory, { now });
assert.equal(queue.duplicates, 1);
assert.equal(queue.candidates.length, 1);
assert.equal(queue.candidates[0].publishable, false);
assert.equal(queue.rejected.below_like_threshold, 1);
assert.equal(queue.paid_calls, 0);
const approvedQueue = buildSocialReviewQueue([{ ...lead, media_id: '3', handle: 'fixture', like_count: null }], inventory, { now, creators: [creator] });
assert.equal(approvedQueue.candidates.length, 1, 'the deployed reviewed-creator registry is used by the preflight');
assert.equal(approvedQueue.candidates[0].qualification, 'qualified_creator');
assert.equal(approvedQueue.candidates[0].identity.method, 'reviewed_creator_place');
assert.match(route, /creators_read:\s*creators\.length/);
console.log('Social preflight: capped paging, ceiling failure, fresh qualification and duplicate controls passed');
