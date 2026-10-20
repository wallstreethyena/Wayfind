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
assert.match(route, /recordPulse\("social-intelligence"/);
assert.doesNotMatch(route, /api\.anthropic\.com/);
assert.match(route, /buildSocialReviewQueue/);
assert.doesNotMatch(route, /from\("wf_events"\)/);
assert.doesNotMatch(route, /wf_inventory[^\n]*state/, "the live inventory table has no state column");
assert.doesNotMatch(route, /readSocialPages\(db,\s*["']wf_inventory/, "preflight must not page the entire owned inventory");
assert.match(route, /healthy empty: no stored social leads/);
const migration = readFileSync(new URL("../supabase/migrations/20260906022518_social_intelligence_control_plane.sql", import.meta.url), "utf8");
for (const table of ["wf_social_creators", "wf_source_evidence", "wf_social_trend_reports"]) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon, authenticated`));
}
assert.match(migration, /internal_use boolean not null default false/);
assert.match(migration, /derived_facts_allowed boolean not null default false/);
assert.match(migration, /alter column like_count drop not null/);
assert.match(migration, /alter column comments_count drop not null/);
assert.match(migration, /creator_follower_count bigint/);
assert.match(migration, /wf_social_candidates_follower_observation_ck/);
assert.match(migration, /location_lat is not null and location_lng is not null/);
console.log("check-social-intelligence: OK; identity, trends, rights, privacy and no-publication controls executed");

assert.equal(resolveSocialPlace({ caption: "anything", platform: "tiktok", handle: "fixture" }, { creator, inventory, now }).status, "unresolved");
assert.equal(isFloridaInventory({ state: "GA", lat: 30.8, lng: -84 }), false);
assert.equal(resolveSocialPlace({ caption: "Sunshine Pumpkin Farm", location_city: "Atlanta" }, { inventory, now }).status, "unresolved");
assert.match(route, /social_preflight_incomplete/);

const { readSocialPages, readSocialIdentityInventory, socialIdentityHints, buildSocialReviewQueue } = await import('../lib/socialReviewQueue.js');
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
assert.deepEqual(socialIdentityHints([{ platform:'instagram',handle:'fixture',source_place_id:'farm-1',location_name:'Sunshine Pumpkin Farm' }],[creator]),{ids:['farm-1'],names:['Sunshine Pumpkin Farm']});
const inventoryCalls=[];
const inventoryDb={from(){const q={select(){return q;},eq(){return q;},in(field,values){inventoryCalls.push({field,values});return q;},limit(){return q;},then(resolve){resolve({data:[inventory[0]],error:null});}};return q;}};
assert.deepEqual(await readSocialIdentityInventory(inventoryDb,[{source_place_id:'farm-1',location_name:'Sunshine Pumpkin Farm'}],[]),[inventory[0]]);
assert.deepEqual(inventoryCalls.map(x=>x.field),['place_id','name']);
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
const vercel = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
assert.match(vercel, /\/api\/cron\/social-intelligence/);
console.log('Social preflight: capped paging, ceiling failure, fresh qualification and duplicate controls passed');

// Execute the real GET body, queue, qualification and paginated readers. Only
// the database transport and pulse sink are fixtures; no publication or HTTP.
const loadGet = new Function('process', 'createClient', 'readSocialPages', 'readSocialIdentityInventory', 'buildSocialReviewQueue', 'recordPulse',
  route.replace(/^import[^;]+;\n/gm, '').replace(/^export /gm, '') + '\nreturn GET;');
const closedLeads = [
  { platform: 'web', media_id: 'owner-20261013-naree-tampa', review_status: 'promoted', source_place_id: 'closed-place' },
  { platform: 'web', media_id: 'owner-20261013-forbici-st-pete', review_status: 'promoted', location_name: 'Closed venue' },
  { ...lead, media_id: 'rejected-eligible', review_status: 'rejected' },
  { ...lead, media_id: 'promoted-eligible', review_status: 'promoted' },
];
const closedQueue = buildSocialReviewQueue(closedLeads, inventory, { now });
assert.equal(closedQueue.inspected, 4);
assert.equal(closedQueue.attempted, 0);
assert.deepEqual(closedQueue.skipped, { previously_promoted: 3, previously_rejected: 1 });
assert.deepEqual(closedQueue.rejected, {});
assert.deepEqual(closedQueue.candidates, []);
assert.deepEqual(socialIdentityHints(closedLeads, [creator]), { ids: [], names: [] });
assert.equal(queue.attempted, 2, 'duplicates are inspected but not attempted twice');
assert.equal(queue.attempted, queue.candidates.length + Object.values(queue.rejected).reduce((a, b) => a + b, 0));

// The handler receives its own process facade. Its configuration is entirely
// explicit and never reads or mutates the guard runner's environment.
const fixtureProcess = { env: {
  CRON_SECRET: 'social-fixture-cron',
  NEXT_PUBLIC_SUPABASE_URL: 'https://social-fixture.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'social-fixture-service',
} };
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => { throw new Error('social preflight must not call a provider'); };
  async function runPreflight(leads, { readError = false, authorization = true } = {}) {
    const reads = [], pulses = [];
    const fixtureDb = { from(table) {
      assert.ok(['wf_social_candidates', 'wf_social_creators', 'wf_inventory'].includes(table), 'read only known private preflight tables');
      reads.push(table);
      let cursor = null, key = null, filter = () => true;
      const q = {
        select() { return q; }, order(field) { key = field; return q; }, limit() { return q; },
        eq(field, value) { assert.equal(field, 'status'); assert.equal(value, 'OPERATIONAL'); return q; },
        in(field, values) { filter = row => values.includes(row[field]); return q; },
        gt(field, value) { cursor = value; return q; }, abortSignal() { return q; },
        then(resolve) {
          const rows = table === 'wf_social_candidates' ? leads : table === 'wf_inventory' ? inventory : [];
          resolve(readError ? { data: null, error: { message: 'fixture read unavailable' } }
            : { data: rows.filter(filter).filter(row => cursor === null || row[key] > cursor).sort((a, b) => String(a[key]).localeCompare(String(b[key]))), error: null });
        },
      };
      return q;
    } };
    const GET = loadGet(fixtureProcess, () => fixtureDb, readSocialPages, readSocialIdentityInventory, buildSocialReviewQueue,
      async (job, pulse) => { assert.equal(job, 'social-intelligence'); pulses.push(pulse); return true; });
    const response = await GET(new Request('https://fixture.invalid/api/cron/social-intelligence', {
      headers: authorization ? { authorization: 'Bearer social-fixture-cron' } : {},
    }));
    return { status: response.status, body: await response.json(), pulses, reads };
  }
  function assertPulse(result, attempted, succeeded, failed) {
    assert.equal(result.pulses.length, 1, 'one heartbeat per run');
    assert.deepEqual(Object.fromEntries(['attempted', 'succeeded', 'failed'].map(key => [key, result.pulses[0][key]])), { attempted, succeeded, failed });
  }
  function assertPrivate(result) {
    assert.equal(result.status, 200);
    assert.equal(result.body.publication_enabled, false);
    assert.equal(result.body.mode, 'private_review');
    assert.equal(result.body.published, 0);
    assert.equal(result.body.paid_calls, 0);
    for (const candidate of result.body.candidates) assert.equal(candidate.publishable, false);
  }
  const closed = await runPreflight(closedLeads);
  assertPrivate(closed);
  assertPulse(closed, 0, 0, 0);
  assert.equal(closed.body.inspected, 4);
  assert.deepEqual(closed.body.skipped, closedQueue.skipped);
  assert.ok(!closed.reads.includes('wf_inventory'), 'closed history cannot trigger identity inventory reads');
  const productionRows = await runPreflight(closedLeads.slice(0, 2));
  assertPulse(productionRows, 0, 0, 0);
  assert.equal(productionRows.body.inspected, 2, 'the exact two promoted production IDs remain visible as stored history');
  const eligible = await runPreflight([{ ...lead, review_status: 'pending', source_place_id: 'farm-1' }]);
  assertPrivate(eligible);
  assertPulse(eligible, 1, 1, 0);
  assert.equal(eligible.body.candidates[0].identity.place_id, 'farm-1');
  const disqualified = await runPreflight([{ ...lead, review_status: 'pending', like_count: 1000 }]);
  assertPrivate(disqualified);
  assertPulse(disqualified, 1, 0, 1);
  assert.deepEqual(disqualified.body.rejected, { below_like_threshold: 1 });
  const mixed = await runPreflight([...closedLeads, lead, { ...lead, media_id: 'bad', caption: 'ordinary dinner' }]);
  assertPrivate(mixed);
  assertPulse(mixed, 2, 1, 1);
  assert.deepEqual(mixed.body.rejected, { no_seasonal_offering: 1 });
  assert.deepEqual(mixed.body.skipped, closedQueue.skipped);
  const empty = await runPreflight([]);
  assertPrivate(empty);
  assertPulse(empty, 0, 0, 0);
  assert.equal(empty.body.acquisition_status, 'no_stored_leads');
  const unavailable = await runPreflight(closedLeads, { readError: true });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.error, 'social_preflight_incomplete');
  assertPulse(unavailable, 1, 0, 1);
  delete fixtureProcess.env.SUPABASE_SERVICE_ROLE_KEY;
  const missingDb = await runPreflight(closedLeads);
  assert.equal(missingDb.status, 503);
  assert.equal(missingDb.body.error, 'supabase_unconfigured');
  assertPulse(missingDb, 1, 0, 1);
  assert.deepEqual(missingDb.reads, []);
  const unauthorized = await runPreflight(closedLeads, { authorization: false });
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(unauthorized.pulses, []);
  assert.deepEqual(unauthorized.reads, []);
} finally {
  globalThis.fetch = originalFetch;
}
console.log('Social preflight runtime: terminal history, eligible/disqualified/mixed work, empty, read failure, missing DB and authorization passed');
