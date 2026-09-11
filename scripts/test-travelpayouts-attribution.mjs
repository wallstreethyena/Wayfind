// Execute the real commerce route, statistics reader and cron against local
// fetch fixtures. Never follow a partner URL or inherit a credential fixture.
import assert from "node:assert/strict";

process.env.WF_SUPPRESS_ANALYTICS = "1";
process.env.NEXT_PUBLIC_TP_MARKER_ACCOUNT = "750791";
process.env.SUPABASE_URL = "https://tp-fixture.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://tp-fixture.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-key";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon-key";
process.env.TRAVELPAYOUTS_TOKEN = "fixture-tp-token";
process.env.CRON_SECRET = "fixture-cron-secret";

const { GET: commerceGET } = await import("../app/api/commerce/go/route.js");
const { GET: cronGET } = await import("../app/api/cron/travelpayouts-attribution/route.js");
const { tpProvisionCandidates } = await import("../lib/travelpayoutsProvisioning.js");
const { normalizeTpSubId } = await import("../lib/travelpayoutsAttribution.js");
const { fetchTravelpayoutsBookings, normalizeTravelpayoutsBooking, reconcileTravelpayouts, travelpayoutsUtcDate } = await import("../lib/travelpayoutsStats.js");
const { resolveOffer } = await import("../lib/commerceProviders.js");

let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks += 1; }
const token = "wf_" + "a".repeat(32);
const sbOrigin = "https://tp-fixture.supabase.co";
const allMappings = () => tpProvisionCandidates().map((row, i) => ({ ...row, enabled: true, short_url: `https://tp.st/fixture_${i}` }));
const mapping = allMappings().find((row) => row.provider === "tiqets");
assert.ok(mapping, "fixture has a real exact registry offer");
const commerceRequest = () => new Request(`https://wayfind.test/api/commerce/go?provider=tiqets&offer=${mapping.offer_id}&surface=blog&content=guide_test&click_id=wf-client-1`, { headers: { "user-agent": "Mozilla/5.0 human fixture" } });
const cronRequest = (auth = "Bearer fixture-cron-secret") => new Request("https://wayfind.test/api/cron/travelpayouts-attribution", { headers: { authorization: auth } });
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Unexpected unconfigured fixture request"); };

try {
  const classic = await resolveOffer("tiqets", mapping.offer_id);
  assert.ok(classic.dest && classic.sourceUrl === mapping.destination_url);
  for (const scenario of ["success", "missing", "null-row", "nonarray", "ambiguous", "enabled-string", "read-outage", "write-outage", "wrong-account", "wrong-campaign", "wrong-source", "wrong-destination", "bad-short-url"]) {
    let saved = null;
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      const parsed = new URL(url);
      check(parsed.origin === sbOrigin, "commerce fixture never opens affiliate destinations");
      check(init.cache === "no-store", "click mapping and write bypass caches");
      check(init.headers.apikey === "fixture-service-key", "attribution uses service credentials");
      calls.push(parsed.pathname);
      if (parsed.pathname === "/rest/v1/wf_tp_links") {
        if (scenario === "read-outage") return new Response("unavailable", { status: 503 });
        const row = { ...mapping };
        if (scenario === "wrong-account") row.marker = "999";
        if (scenario === "wrong-campaign") row.campaign_id = "137";
        if (scenario === "wrong-source") row.trs = "999";
        if (scenario === "wrong-destination") row.destination_url = "https://www.tiqets.com/other";
        if (scenario === "bad-short-url") row.short_url = "https://tp.st.evil.test/abc";
        if (scenario === "enabled-string") row.enabled = "true";
        if (scenario === "null-row") return Response.json([null]);
        if (scenario === "nonarray") return Response.json({ data: [row] });
        if (scenario === "ambiguous") return Response.json([row, row]);
        return Response.json(scenario === "missing" ? [] : [row]);
      }
      assert.equal(parsed.pathname, "/rest/v1/wf_tp_clicks");
      assert.equal(init.method, "POST");
      if (scenario === "write-outage") throw new Error("fixture storage outage");
      saved = JSON.parse(init.body);
      // Durable acknowledgment occurs before the handler can emit a 302.
      await Promise.resolve();
      return new Response(null, { status: 201 });
    };
    const response = await commerceGET(commerceRequest());
    const dest = new URL(response.headers.get("location"));
    check(response.status === 302 && /no-store/.test(response.headers.get("cache-control")), `${scenario}: usable uncacheable redirect`);
    if (scenario === "success") {
      check(saved && dest.searchParams.get("sub_id") === saved.click_token, "exact stored token is the emitted provider sub_id");
      check(/^wf_[a-f0-9]{32}$/.test(saved.click_token), "cryptographically opaque token shape");
      check(saved.offer_id === mapping.offer_id && saved.campaign_id === 89 && saved.surface === "blog" && saved.content_id === "guide_test", "durable click binds exact inventory and content");
      check(new Date(saved.expires_at) - new Date(saved.clicked_at) === 30 * 86400000, "click attribution expiry is 30 days");
      check(calls.length === 2, "one mapping read and durable write precede redirect");
    } else {
      check(dest.toString() === classic.dest, `${scenario}: safe classic affiliate fallback`);
      check(!dest.searchParams.has("sub_id") && saved === null, `${scenario}: no unjoinable token emitted`);
      check(calls.length === (scenario === "write-outage" ? 2 : 1), `${scenario}: invalid mapping never writes a click`);
    }
  }

  check(normalizeTpSubId(`.${token}`) === token && normalizeTpSubId(token) === token, "provider's single leading dot normalizes to exact token");
  check(normalizeTpSubId(`..${token}`) === null && normalizeTpSubId("wf_invalid") === null, "malformed provider tokens are rejected");
  check(travelpayoutsUtcDate("2026-09-10T00:30:00Z") === "2026-09-10", "00:30 UTC stays September 10 while Eastern is September 9");
  const booking = (overrides = {}) => ({
    sub_id: `.${token}`, action_id: "booking-1", campaign_id: 89,
    date: "2020-01-02", created_at: "2020-01-02 10:00:00", updated_at: "2020-01-03 11:00:00",
    state: "processing", action_type: "booking", profit_usd: "3.45", paid_profit_usd: null, price_usd: null,
    ...overrides,
  });
  const normalized = normalizeTravelpayoutsBooking(booking());
  check(normalized.sub_id === token && normalized.state === "pending", "official processing state becomes pending with normalized join token");
  check(normalized.profit_usd === "3.45" && normalized.paid_profit_usd === null && normalized.price_usd === null, "nullable money remains unknown, never fabricated zero");
  check(normalized.action_created_at === "2020-01-02T10:00:00.000Z", "provider timestamps without zone explicitly use UTC");
  check(normalizeTravelpayoutsBooking(booking({ state: "cancelled" })).state === "canceled", "cancellation spelling normalizes");
  check(normalizeTravelpayoutsBooking(booking({ sub_id: "other-publisher" })) === null, "other publisher bookings are excluded");
  for (const overrides of [{ sub_id: ".." + token }, { state: "unknown" }, { action_id: "" }, { profit_usd: "NaN" }, { campaign_id: 999 }, { updated_at: null }, { created_at: "2020-02-30" }]) {
    assert.throws(() => normalizeTravelpayoutsBooking(booking(overrides)));
    checks += 1;
  }

  function statsFixture({ rows = [booking()], alter = null } = {}) {
    const calls = [];
    const fetchImpl = async (url, init) => {
      assert.equal(url, "https://api.travelpayouts.com/statistics/v1/execute_query");
      assert.equal(init.method, "POST");
      assert.equal(init.cache, "no-store");
      assert.equal(init.headers["X-Access-Token"], "fixture-tp-token");
      const body = JSON.parse(init.body);
      calls.push(body);
      assert.deepEqual(body.filters.slice(0, 2), [{ field: "type", op: "eq", value: "action" }, { field: "action_type", op: "eq", value: "booking" }]);
      assert.deepEqual(body.sort, [{ field: "updated_at", order: "asc" }]);
      const campaign = body.filters.find((f) => f.field === "campaign_id").value;
      const eligible = rows.filter((row) => row.campaign_id === campaign);
      const response = { fields: body.fields, total_rows: eligible.length, offset: body.offset, limit: 1000, results: eligible.slice(body.offset, body.offset + 1000) };
      return alter ? alter(response, body) : Response.json(response);
    };
    return { calls, fetchImpl };
  }
  const options = { from: "2020-01-01", through: "2026-09-10T00:30:00Z", token: "fixture-tp-token" };
  const official = statsFixture();
  const officialRows = await fetchTravelpayoutsBookings({ ...options, fetchImpl: official.fetchImpl });
  check(officialRows.length === 1 && officialRows[0].state === "pending", "exact official fields/results response is consumed");
  check(official.calls.length === 3 && official.calls.every((body) => body.filters.find((f) => f.op === "le").value === "2026-09-10"), "three campaigns use inclusive UTC date boundary");
  const paged = statsFixture({ rows: Array.from({ length: 1001 }, (_, i) => booking({ action_id: `page-${i}` })) });
  check((await fetchTravelpayoutsBookings({ ...options, fetchImpl: paged.fetchImpl })).length === 1001, "all 1001 bookings survive pagination");
  check(paged.calls.length === 4 && paged.calls[1].offset === 1000, "page 2 fetched before next campaign");
  for (const [name, alter] of [
    ["cap", (p) => ({ ...p, total_rows: 5001 })],
    ["truncated", (p) => ({ ...p, total_rows: 2 })],
    ["offset", (p) => ({ ...p, offset: 1 })],
    ["schema", (p) => ({ ...p, fields: ["sub_id"] })],
    ["string-total", (p) => ({ ...p, total_rows: "1" })],
  ]) {
    const bad = statsFixture({ alter: (p) => Response.json(alter(p)) });
    await assert.rejects(fetchTravelpayoutsBookings({ ...options, fetchImpl: bad.fetchImpl }), undefined, name);
    checks += 1;
  }
  const duplicates = statsFixture({ rows: [booking(), booking()] });
  await assert.rejects(fetchTravelpayoutsBookings({ ...options, fetchImpl: duplicates.fetchImpl }), /duplicate/); checks += 1;
  let repaired = false;
  const optional = statsFixture({ alter: (p, body) => {
    if (body.fields.includes("paid_profit_usd")) return new Response("Unknown field paid_profit_usd", { status: 400 });
    repaired = true;
    return Response.json({ ...p, results: p.results.map(({ paid_profit_usd: ignored, ...row }) => row) });
  } });
  const withoutPaid = await fetchTravelpayoutsBookings({ ...options, fetchImpl: optional.fetchImpl });
  check(repaired && withoutPaid[0].paid_profit_usd === null, "explicit optional field error retries without inventing paid revenue");
  const counts = (n, overrides = {}) => ({ received: n, inserted: n, updated: 0, stale: 0, unmatched: 0, invalid: 0, ...overrides });
  const rpcDB = (result) => ({ rpc(name, { p_rows }) { assert.equal(name, "wf_tp_reconcile"); assert.ok(p_rows.length); return Promise.resolve({ data: result, error: null }); } });
  assert.deepEqual(await reconcileTravelpayouts(rpcDB(counts(1)), [normalized]), counts(1)); checks += 1;
  await assert.rejects(reconcileTravelpayouts(rpcDB(counts(1, { inserted: 0 })), [normalized]), /counts did not reconcile/); checks += 1;
  await assert.rejects(reconcileTravelpayouts(rpcDB(counts(1, { inserted: 0, unmatched: 1 })), [normalized]), (error) => error.counts.unmatched === 1); checks += 1;
  const aborted = AbortSignal.abort(new Error("fixture deadline"));
  await assert.rejects(fetchTravelpayoutsBookings({ ...options, signal: aborted, fetchImpl: async () => { throw new Error("must not fetch"); } }), /fixture deadline/); checks += 1;
  const stalledBody = new AbortController();
  const bodyTimer = setTimeout(() => stalledBody.abort(new Error("stalled body deadline")), 20);
  try {
    await assert.rejects(fetchTravelpayoutsBookings({ ...options, signal: stalledBody.signal, fetchImpl: async () => ({ ok: true, text: () => new Promise(() => {}) }) }), /stalled body deadline/);
    checks += 1;
  } finally { clearTimeout(bodyTimer); }
  const stalledRpc = new AbortController();
  const rpcTimer = setTimeout(() => stalledRpc.abort(new Error("stalled RPC deadline")), 20);
  try {
    const stuck = { abortSignal(signal) { assert.equal(signal, stalledRpc.signal); return this; }, then() {} };
    await assert.rejects(reconcileTravelpayouts({ rpc: () => stuck }, [normalized], { signal: stalledRpc.signal }), /stalled RPC deadline/);
    checks += 1;
  } finally { clearTimeout(rpcTimer); }

  function cronFixture({ idle = false, pulse = "confirmed", provisionFailure = false, provisionReadFailure = false, rpcCounts = counts(1), statsRows = [booking()] } = {}) {
    const calls = [];
    const pulses = [];
    let sharedSignal = null;
    const fetchImpl = async (url, init = {}) => {
      const parsed = new URL(url);
      calls.push(parsed.pathname);
      assert.equal(init.cache, "no-store");
      if (parsed.hostname === "api.travelpayouts.com") {
        if (parsed.pathname === "/links/v1/create") return new Response("fixture outage", { status: 503 });
        assert.equal(init.signal, sharedSignal, "statistics shares earliest-click deadline");
        return statsFixture({ rows: statsRows }).fetchImpl(url, init);
      }
      assert.equal(parsed.origin, sbOrigin, "cron never opens a partner link");
      assert.equal(new Headers(init.headers).get("apikey"), "fixture-service-key");
      if (parsed.pathname === "/rest/v1/wf_tp_links") return provisionReadFailure ? new Response("fixture mapping read error", { status: 503 }) : Response.json(provisionFailure ? [] : allMappings());
      if (parsed.pathname === "/rest/v1/wf_tp_clicks") {
        assert.equal(parsed.searchParams.get("order"), "clicked_at.asc");
        assert.equal(parsed.searchParams.get("limit"), "1");
        sharedSignal = init.signal;
        return Response.json(idle ? [] : [{ clicked_at: "2020-01-01T00:00:00Z" }]);
      }
      if (parsed.pathname === "/rest/v1/rpc/wf_tp_reconcile") {
        assert.equal(init.signal, sharedSignal, "RPC shares earliest-click deadline");
        assert.equal(JSON.parse(init.body).p_rows[0].state, "pending");
        return Response.json(rpcCounts);
      }
      assert.equal(parsed.pathname, "/rest/v1/wf_job_pulse");
      pulses.push(JSON.parse(init.body));
      if (pulse === "indeterminate") throw new DOMException("fixture timeout after possible commit", "TimeoutError");
      if (pulse === "refused") return new Response("fixture denied", { status: 403 });
      return new Response(null, { status: 201 });
    };
    return { fetchImpl, calls, pulses };
  }
  let fixture = cronFixture();
  globalThis.fetch = fixture.fetchImpl;
  check((await cronGET(cronRequest("Bearer wrong"))).status === 401 && fixture.calls.length === 0, "unauthorized cron does zero I/O");
  delete process.env.CRON_SECRET;
  check((await cronGET(cronRequest())).status === 401 && fixture.calls.length === 0, "missing secret fails closed before I/O");
  process.env.CRON_SECRET = "fixture-cron-secret";
  delete process.env.TRAVELPAYOUTS_TOKEN;
  const absentToken = await cronGET(cronRequest());
  check(absentToken.status === 503 && (await absentToken.json()).ranWork === false, "missing token is explicit cannot-run");
  check(fixture.calls.every((p) => p === "/rest/v1/wf_job_pulse"), "missing token attempts only failure telemetry");
  process.env.TRAVELPAYOUTS_TOKEN = "fixture-tp-token";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  check((await cronGET(cronRequest())).status === 503, "anon credentials cannot substitute for missing service key");
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-key";
  for (const scenario of [{ idle: true }, {}, { pulse: "indeterminate" }, { pulse: "refused" }, { provisionFailure: true }, { provisionReadFailure: true }, { rpcCounts: counts(1, { inserted: 0, unmatched: 1 }) }, { rpcCounts: counts(1, { inserted: 0, invalid: 1 }) }, { statsRows: [booking(), booking({ action_id: "second-booking" })], rpcCounts: counts(2, { inserted: 1, invalid: 1 }) }]) {
    fixture = cronFixture(scenario);
    globalThis.fetch = fixture.fetchImpl;
    const response = await cronGET(cronRequest());
    const body = await response.json();
    check(fixture.pulses.length === 1, "exactly one terminal pulse per cron run");
    if (scenario.provisionFailure || scenario.provisionReadFailure || scenario.rpcCounts) {
      check(response.status === 500 && body.ok === false, "pending provisioning or rejected reconciliation fails visibly");
      if (scenario.rpcCounts) {
        check(body.counts.unmatched + body.counts.invalid === 1, "rejection counts preserved in failure response");
        check(body.succeeded === scenario.rpcCounts.inserted, "accepted partial reconciliation remains visible alongside rejected rows");
      }
      else {
        if (scenario.provisionFailure) check(body.provisioning.failed > 0 && body.provisioning.remaining > 0, "provisioning failures expose pending mappings");
        check(body.counts.inserted === 1 && body.succeeded === 1 && body.provisioningError, "failed new mappings still reconcile existing bookings and expose completed work");
        check(fixture.calls.includes("/rest/v1/rpc/wf_tp_reconcile"), "provisioning failure cannot skip booking reconciliation");
      }
    } else {
      check(response.status === 200 && body.ok, "real cron completes fixture work");
      check(body.idle === Boolean(scenario.idle), "explicit idle is truthful");
      if (scenario.idle) check(!fixture.calls.includes("/statistics/v1/execute_query") && body.counts === null, "no durable clicks means no statistics request");
      else check(body.counts.inserted === 1, "cron reconciles fetched provider row");
      check(body.pulse.ok === (!scenario.pulse) && body.pulse.indeterminate === (scenario.pulse === "indeterminate"), "confirmed, refused and indeterminate pulse outcomes remain distinct");
    }
  }
  console.log(`test-travelpayouts-attribution: OK — ${checks} assertions; real redirect, official statistics contract, bounded reconciliation and cron terminal paths`);
} finally {
  globalThis.fetch = originalFetch;
}
