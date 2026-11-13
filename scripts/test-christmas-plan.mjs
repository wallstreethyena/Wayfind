// Locks "My Christmas plan" sharing and friend votes:
//  * ids in a ?plan= link are untrusted: shaped, deduped, capped at 12, and
//    unknown ids (and places) are dropped against the real listings;
//  * the plan key is the same for the same set in any order;
//  * the vote store FAILS CLOSED: missing key, missing table (PostgREST 404),
//    network error, bad reply shape or a bad voter token all answer
//    { available: false } and never throw;
//  * the vote write is an idempotent insert (unique plan, item, voter);
//  * the migration is not applied by this guard, only read: RLS on, no public
//    access, the unique key, rollback documented.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parseChristmasPlanIds, christmasPlanItems, christmasPlanKey, CHRISTMAS_PLAN_MAX_ITEMS } from "../lib/christmasPlan.js";
import { readPlanVotes, castPlanVote, planVoteConfig } from "../lib/christmasPlanVotes.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ids
eq(parseChristmasPlanIds("a1,b2,a1,c3"), ["a1", "b2", "c3"], "deduped, in order");
eq(parseChristmasPlanIds(" a1 , ,b2"), ["a1", "b2"], "trimmed, blanks dropped");
eq(parseChristmasPlanIds("a1,<script>,b2;drop table,../x,%00,'or 1=1"), ["a1"], "unsafe ids dropped");
eq(parseChristmasPlanIds(undefined), [], "undefined");
eq(parseChristmasPlanIds(""), [], "empty");
eq(parseChristmasPlanIds(Array.from({ length: 40 }, (_, i) => "id" + i).join(",")).length, 12, "capped at 12");
ok(CHRISTMAS_PLAN_MAX_ITEMS === 12, "cap constant");
eq(parseChristmasPlanIds("x".repeat(121)), [], "too long");
eq(parseChristmasPlanIds("fl26-lights-2026,wfc:abc_1.2"), ["fl26-lights-2026", "wfc:abc_1.2"], "real id shapes pass");

// unknown ids dropped against listings, places excluded, order kept
const listings = [{ id: "e1", kind: "event" }, { id: "e2", kind: "event" }, { id: "t1", kind: "tour" }, { id: "p1", kind: "place" }];
eq(christmasPlanItems(listings, "e2,nope,p1,e1,t1").map((c) => c.id), ["e2", "e1", "t1"], "unknown ids and places dropped, order kept");
eq(christmasPlanItems(listings, "nope,zzz"), [], "all unknown gives nothing");
eq(christmasPlanItems(null, "e1"), [], "no listings");

// key
ok(/^[a-f0-9]{16}$/.test(christmasPlanKey(["e1", "e2"])), "key shape");
eq(christmasPlanKey(["e1", "e2"]), christmasPlanKey(["e2", "e1"]), "order does not change the plan");
ok(christmasPlanKey(["e1", "e2"]) !== christmasPlanKey(["e1", "e3"]), "different items, different plan");

// fail closed
const KEY = christmasPlanKey(["e1", "e2"]);
const VOTER = "a".repeat(32);
const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" };
let calls = 0;
const fetchBy = (impl) => async (...a) => { calls++; return impl(...a); };
eq(planVoteConfig({}), null, "no config without a key");
eq(await readPlanVotes(KEY, VOTER, { env: {}, fetchImpl: fetchBy(() => { throw new Error("must not be called"); }) }), { available: false }, "read: no key is closed");
eq(calls, 0, "no network call without config");
eq(await castPlanVote({ planId: KEY, itemId: "e1", voter: VOTER, on: true }, { env: {}, fetchImpl: fetchBy(() => { throw new Error("no"); }) }), { available: false }, "cast: no key is closed");
const missingTable = fetchBy(async () => new Response(JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.wf_christmas_plan_votes'" }), { status: 404 }));
eq(await readPlanVotes(KEY, VOTER, { env, fetchImpl: missingTable }), { available: false }, "read: table missing is closed");
eq(await castPlanVote({ planId: KEY, itemId: "e1", voter: VOTER, on: true }, { env, fetchImpl: missingTable }), { available: false }, "cast: table missing is closed");
eq(await readPlanVotes(KEY, VOTER, { env, fetchImpl: fetchBy(async () => { throw new Error("network"); }) }), { available: false }, "read: network error is closed");
eq(await castPlanVote({ planId: KEY, itemId: "e1", voter: VOTER, on: false }, { env, fetchImpl: fetchBy(async () => { throw new Error("network"); }) }), { available: false }, "cast: network error is closed");
eq(await readPlanVotes(KEY, VOTER, { env, fetchImpl: fetchBy(async () => new Response("{}", { status: 200 })) }), { available: false }, "read: wrong reply shape is closed");
calls = 0;
eq(await castPlanVote({ planId: KEY, itemId: "e1", voter: "short", on: true }, { env, fetchImpl: fetchBy(async () => new Response(null, { status: 201 })) }), { available: false }, "cast: bad voter token is refused");
eq(await castPlanVote({ planId: "nothex", itemId: "e1", voter: VOTER, on: true }, { env, fetchImpl: fetchBy(async () => new Response(null, { status: 201 })) }), { available: false }, "cast: bad plan key is refused");
eq(calls, 0, "refused before any network call");

// when the table exists
const rows = [{ item_id: "e1", voter_token: VOTER }, { item_id: "e1", voter_token: "b".repeat(32) }, { item_id: "e2", voter_token: "b".repeat(32) }];
const seen = [];
const live = fetchBy(async (url, init) => { seen.push({ url: String(url), init }); return init.method === "POST" || init.method === "DELETE" ? new Response(null, { status: 201 }) : new Response(JSON.stringify(rows), { status: 200 }); });
const got = await readPlanVotes(KEY, VOTER, { env, fetchImpl: live });
eq(got, { available: true, counts: { e1: 2, e2: 1 }, mine: ["e1"] }, "counts and my own votes only (no tokens returned)");
ok(!JSON.stringify(got).includes("b".repeat(32)), "another voter's token is never returned");
eq(await castPlanVote({ planId: KEY, itemId: "e2", voter: VOTER, on: true }, { env, fetchImpl: live }), { available: true }, "cast on");
const post = seen.find((s) => s.init.method === "POST");
ok(/on_conflict=plan_id,item_id,voter_token/.test(post.url) && /ignore-duplicates/.test(post.init.headers.prefer), "a repeat vote is an idempotent insert");
eq(JSON.parse(post.init.body), { plan_id: KEY, item_id: "e2", voter_token: VOTER }, "insert body");
eq(await castPlanVote({ planId: KEY, itemId: "e2", voter: VOTER, on: false }, { env, fetchImpl: live }), { available: true }, "cast off");
const del = seen.find((s) => s.init.method === "DELETE");
ok(/plan_id=eq\./.test(del.url) && /item_id=eq\.e2/.test(del.url) && new RegExp("voter_token=eq\\." + VOTER).test(del.url), "delete is scoped to this voter, plan and item");

// the route and the UI keep the fail closed contract (static, the route needs a network to run)
const route = readFileSync(new URL("../app/api/christmas/plan-votes/route.js", import.meta.url), "utf8");
ok(/catch \{ return closed\(\); \}/.test(route) && /catch \{ return closed\(503\); \}/.test(route), "route answers closed on any failure");
ok(/ids\.includes\(item\)/.test(route), "route accepts only an item of the validated plan");
const ui = readFileSync(new URL("../app/components/ChristmasPlan.js", import.meta.url), "utf8");
ok(/json\.available === true \? \{/.test(ui) && /votes \? <button/.test(ui), "vote buttons render only when votes are available");
ok(/Share my plan/.test(ui) && /\/christmas-in-florida\?plan=/.test(ui), "share link is /christmas-in-florida?plan=");
const mw = readFileSync(new URL("../middleware.js", import.meta.url), "utf8");
ok(/"\/api\/christmas\/plan-votes"/.test(mw), "vote route is in the middleware matcher");

// migration (read only, never applied here)
const dir = new URL("../supabase/migrations/", import.meta.url);
const file = readdirSync(dir).find((f) => /wf_christmas_plan_votes\.sql$/.test(f));
ok(file, "migration file exists");
const sql = readFileSync(new URL(file, dir), "utf8").replace(/--.*$/gm, "");
ok(/create table public\.wf_christmas_plan_votes/.test(sql), "creates the table");
ok(/unique \(plan_id, item_id, voter_token\)/.test(sql), "unique plan, item, voter");
ok(/enable row level security/.test(sql), "RLS enabled");
ok(/revoke all on public\.wf_christmas_plan_votes from public, anon, authenticated/.test(sql), "no anon or authenticated access");
ok(!/create policy/i.test(sql) && !/grant[^;]*to (anon|authenticated|public)/i.test(sql), "no public policy or grant (same as wf_group_plans)");
ok(!/drop table|alter table public\.wf_(?!christmas)/i.test(sql), "touches nothing else");
const raw = readFileSync(new URL(file, dir), "utf8");
ok(/Rollback/.test(raw) && /drop table public\.wf_christmas_plan_votes/.test(raw) && /Ordering/.test(raw), "rollback and ordering documented");
console.log("test-christmas-plan: OK (" + n + " assertions)");

{
  const { readFileSync } = await import("node:fs");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const mw = strip(readFileSync(new URL("../middleware.js", import.meta.url), "utf8"));
  const g = await import("../lib/apiGuard.js");
  if (!(g.PLAN_VOTES_RL && g.PLAN_VOTES_RL.limit === 20 && /path === "\/api\/christmas\/plan-votes" \? PLAN_VOTES_RL/.test(mw))) throw new Error("plan votes must have their own 20/min per-IP limit in middleware");
  const br = strip(readFileSync(new URL("../app/components/ChristmasBrowse.js", import.meta.url), "utf8"));
  if (!/get\("plan"\); if \(plan\) shown\.set\("plan", plan\)/.test(br)) throw new Error("the URL rewrite must keep a shared ?plan= link");
  console.log("test-christmas-plan: vote rate limit and ?plan= persistence locked");
}
