// Hermetic end-to-end: server broker and fake PostgREST transport, executing the
// actual migration and RPCs in PGlite. Never sends a request to a real service.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createAiBulletinBoard } from "../lib/aiBulletinBoard.server.js";

const migration = await readFile(new URL("../supabase/migrations/20261125121000_wf_ai_bulletin_board.sql", import.meta.url), "utf8");
const db = new PGlite();
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const rejected = async (fn, e, label) => { await assert.rejects(fn, e, label); checks++; };
const thrown = (fn, e, label) => { assert.throws(fn, e, label); checks++; };
const signature = "/rest/v1/rpc/";
const read = "select public.wf_ai_bulletin_read($1,$2,$3,$4,$5) as result";
const post = "select public.wf_ai_bulletin_post($1,$2,$3,$4,$5,$6,$7,$8,$9) as result";
const env = {
  WF_AI_BULLETIN_BOARD_ENABLED: "1",
  SUPABASE_URL: "https://bulletin.test",
  SUPABASE_SERVICE_ROLE_KEY: "hermetic-board-fixture-key",
  NODE_ENV: "test",
};
const fixtureKey = env.SUPABASE_SERVICE_ROLE_KEY;
const scope = { runDate: new Date().toISOString().slice(0, 10), region: "statewide", daypart: "all-day", topic: "posters" };
const note = { stage: "selection", status: "succeeded", signal: "candidate_count", count: 5 };
let networkCalls = 0;
const localFetch = async (url, request) => {
  networkCalls++;
  const expected = new URL(url);
  assert.equal(expected.origin, env.SUPABASE_URL);
  assert.equal(request.method, "POST");
  assert.equal(request.cache, "no-store");
  assert.equal(request.redirect, "error");
  assert.equal(request.headers.Authorization, "Bearer " + fixtureKey);
  assert.equal(request.headers.apikey, fixtureKey);
  const args = JSON.parse(request.body);
  const params = [args.p_provider, args.p_run_date, args.p_region, args.p_daypart, args.p_topic];
  try {
    let result;
    await db.exec("set role service_role");
    if (expected.pathname === signature + "wf_ai_bulletin_post") {
      result = await db.query(post, [...params, args.p_stage, args.p_status, args.p_signal, args.p_count]);
    } else if (expected.pathname === signature + "wf_ai_bulletin_read") {
      result = await db.query(read, params);
    } else {
      assert.fail("unexpected transport path");
    }
    return Response.json(result.rows[0].result);
  } catch {
    return Response.json({ message: "UNSAFE_INTERNAL_ERROR_SAMPLE" }, { status: 400 });
  } finally {
    await db.exec("reset role");
  }
};

try {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls");
  const board = createAiBulletinBoard({ env, fetchImpl: localFetch });
  const sessionScope = { ...scope };
  const openai = board.forProvider("openai", sessionScope);
  sessionScope.topic = "project";
  const gemini = board.forProvider("gemini", scope);
  const grok = board.forProvider("grok", scope);
  const claude = board.forProvider("claude", scope);

  await rejected(() => openai.read(), { code: "BOARD_UNAVAILABLE" }, "No migration: controlled storage failure, never empty");
  const afterMissing = networkCalls;
  thrown(() => createAiBulletinBoard({ env: { ...env, WF_AI_BULLETIN_BOARD_ENABLED: "" }, fetchImpl: localFetch }), { code: "BOARD_DISABLED" });
  thrown(() => createAiBulletinBoard({ env: { ...env, SUPABASE_SERVICE_ROLE_KEY: "[SENSITIVE]" }, fetchImpl: localFetch }), { code: "BOARD_CONFIGURATION" });
  thrown(() => createAiBulletinBoard({ env: { ...env, SUPABASE_URL: "https://trailing.example/auth" }, fetchImpl: localFetch }), { code: "BOARD_CONFIGURATION" });
  thrown(() => createAiBulletinBoard({ env: { ...env, SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" }, fetchImpl: localFetch }), { code: "BOARD_FORBIDDEN" }, "Mock transport does not bypass real host restrictions");
  // Production-shaped no-network factories: authentication must be checked
  // before even binding a provider; a valid secret does not start network I/O.
  const productionEnv = {
    ...env, NODE_ENV: "production", VERCEL_ENV: "production",
    SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    CRON_SECRET: "hermetic-cron-fixture",
  };
  const route = "https://gowayfind.test/api/cron/florida-intelligence";
  const cronReq = new Request(route, { headers: { authorization: "Bearer " + productionEnv.CRON_SECRET } });
  const badReq = new Request(route, { headers: { authorization: "Bearer hermetic-cron-fixturE" } });
  // The existing production firewall deliberately refuses test-*.mjs entry
  // points even if a test fabricates VERCEL_ENV. Test the cron boundary in a
  // subprocess with a non-test entry and a transport that can never hit HTTPS.
  const { spawnSync } = await import("node:child_process");
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { createAiBulletinBoard } from ${JSON.stringify(new URL("../lib/aiBulletinBoard.server.js", import.meta.url).href)};
    const env = ${JSON.stringify(productionEnv)};
    const prohibitNetwork = async () => assert.fail("unexpected network I/O");
    const route = ${JSON.stringify(route)};
    assert.throws(() => createAiBulletinBoard({ env, fetchImpl: prohibitNetwork }), /authenticated scheduler/);
    assert.throws(() => createAiBulletinBoard({ env, fetchImpl: prohibitNetwork, req: new Request(route, {headers: ${JSON.stringify(Object.fromEntries(badReq.headers))}}) }), /authenticated scheduler/);
    const ready = createAiBulletinBoard({ env, fetchImpl: prohibitNetwork, req: new Request(route, {headers: ${JSON.stringify(Object.fromEntries(cronReq.headers))}}) });
    assert.equal(typeof ready.forProvider, "function");
    assert.throws(() => createAiBulletinBoard({
      env, fetchImpl: prohibitNetwork, req: new Request(route, {
        headers: { authorization: "Bearer " + env.CRON_SECRET, "x-wf-synthetic": "1" },
      }),
    }), /authenticated scheduler/);
    console.log("cron ACL verified");
  `], { encoding: "utf8", env: {}, timeout: 10_000 });
  eq([child.status, child.stdout.trim(), child.stderr.trim()], [0, "cron ACL verified", ""], "scheduler context requires an exact secret");
  thrown(() => board.forProvider("anonymous", scope), { code: "BOARD_SCOPE" });
  thrown(() => board.forProvider("openai", { ...scope, runDate: "2026-02-30" }), { code: "BOARD_SCOPE" });
  thrown(() => board.forProvider("openai", { ...scope, notes: "arbitrary" }), { code: "BOARD_SCOPE" });
  await rejected(() => gemini.post({ ...note, stage: "publication" }), { code: "BOARD_OBSERVATION" });
  await rejected(() => gemini.post({ ...note, provider: "openai" }), { code: "BOARD_OBSERVATION" });
  await rejected(() => gemini.post({ ...note, body: "arbitrary" }), { code: "BOARD_OBSERVATION" });
  await rejected(() => gemini.post({ ...note, count: 1_000_000 }), { code: "BOARD_OBSERVATION" });
  await rejected(() => gemini.post({ ...note, signal: "none" }), { code: "BOARD_OBSERVATION" });
  await rejected(() => gemini.post({ ...note, get count() { assert.fail("getter evaluated"); } }), { code: "BOARD_OBSERVATION" });
  const synthetic = createAiBulletinBoard({
    env, fetchImpl: localFetch, req: new Request(route, { headers: { "x-wf-synthetic": "1" } }),
  }).forProvider("openai", scope);
  await rejected(() => synthetic.post(note), { code: "BOARD_FORBIDDEN" }, "write firewall refuses synthetic contexts before storage");
  eq(networkCalls, afterMissing, "invalid inputs never reach storage");

  await db.exec(migration);
  eq(await openai.read(), [], "an applied empty board is distinct from unavailable");
  eq(await openai.post(note), "inserted", "OpenAI can report to the bound scope");
  eq(await openai.post(note), "unchanged", "identical replay performs no change");
  await rejected(() => openai.post({ ...note, count: 7 }), { code: "BOARD_CONFLICT" }, "different replay cannot modify the first report");
  eq(await gemini.read(), [{ provider: "openai", ...note }], "Gemini sees OpenAI report, without DB metadata");
  eq(await board.forProvider("gemini", { ...scope, topic: "project" }).read(), [], "mutable caller scope did not reroute binding");
  eq(await board.forProvider("gemini", { ...scope, region: "orlando" }).read(), [], "different regions do not share reports");
  eq(await board.forProvider("gemini", { ...scope, daypart: "evening" }).read(), [], "different dayparts do not share reports");
  eq(await board.forProvider("gemini", { ...scope, runDate: "2026-01-01" }).read(), [], "different days do not share reports");
  const health = { stage: "health", status: "degraded", signal: "deterministic_fallback", count: 0 };
  eq(await gemini.post(health), "inserted");
  eq(await grok.post(health), "inserted");
  eq(await claude.post(health), "inserted");
  eq((await openai.read()).map((r) => r.provider), ["claude", "gemini", "grok", "openai"], "provider-bound writers all contribute to shared context");

  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec("set role " + role);
    await rejected(() => db.query("select * from wf_ai_private.bulletin"), { code: "42501" }, role + " cannot select the private table");
    await rejected(() => db.query("update wf_ai_private.bulletin set status = 'degraded'"), { code: "42501" }, role + " cannot modify the private table");
    if (role !== "service_role") {
      await rejected(() => db.query(read, ["openai", scope.runDate, scope.region, scope.daypart, scope.topic]), { code: "42501" }, role + " cannot read through an RPC");
      await rejected(() => db.query(post, ["openai", scope.runDate, scope.region, scope.daypart, scope.topic, note.stage, note.status, note.signal, 5]), { code: "42501" }, role + " cannot write through an RPC");
    }
    await db.exec("reset role");
  }

  await db.exec("set role service_role");
  await rejected(() => db.query(post, ["grok", scope.runDate, scope.region, scope.daypart, scope.topic, "publication", "ready", "none", 0]), { code: "23514" }, "SQL enforces publication author even without JS");
  await rejected(() => db.query(post, ["grok", scope.runDate, scope.region, scope.daypart, scope.topic, "verification", "ready", "https://untrusted.test", 0]), { code: "23514" }, "SQL prohibits free text even without JS");
  await rejected(() => db.query(post, ["grok", "2050-01-01", scope.region, scope.daypart, scope.topic, "verification", "ready", "none", 0]), { code: "22023" }, "SQL prevents unbounded future dates");
  await db.exec("reset role");

  await db.query("update wf_ai_private.bulletin set observed_at = statement_timestamp() - interval '8 days' where provider = 'gemini'");
  eq((await openai.read()).map((r) => r.provider), ["claude", "grok", "openai"], "aged reports cannot be read before pruning");
  eq((await db.query("select count(*)::int as n from wf_ai_private.bulletin")).rows[0].n, 4);
  eq(await openai.post({ stage: "publication", status: "succeeded", signal: "verified_evidence", count: 0 }), "inserted");
  eq((await db.query("select count(*)::int as n from wf_ai_private.bulletin where provider = 'gemini'")).rows[0].n, 0, "normal write prunes expired reports");

  // Three independent fail-closed barriers: even a temporarily erroneous
  // grant to both layers is blocked by the private function's caller check.
  await db.exec(`begin;
    grant execute on function public.wf_ai_bulletin_read(text,date,text,text,text) to anon;
    grant usage on schema wf_ai_private to anon;
    grant execute on function wf_ai_private.read_bulletin(text,date,text,text,text) to anon;
    set role anon`);
  await rejected(() => db.query(read, ["openai", scope.runDate, scope.region, scope.daypart, scope.topic]), {
    code: "42501", message: "private bulletin access denied",
  }, "a mistaken public and private EXECUTE grant still cannot pass the internal role gate");
  await db.exec("rollback");
  await db.exec("set role anon");
  await rejected(() => db.query(read, ["openai", scope.runDate, scope.region, scope.daypart, scope.topic]), { code: "42501" }, "negative control restored");
  await db.exec("reset role");

  const bad = createAiBulletinBoard({
    env,
    fetchImpl: async () => Response.json([{ provider: "openai", ...note, unexpected: "private" }]),
  }).forProvider("grok", scope);
  await rejected(() => bad.read(), { code: "BOARD_INVALID_RESPONSE" }, "unexpected backend fields fail closed");
} finally {
  await db.close();
}
console.log(`test-ai-bulletin-board: PASS (${checks} checks)`);
