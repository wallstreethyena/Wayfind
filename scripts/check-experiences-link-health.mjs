// scripts/check-experiences-link-health.mjs — the wf_experiences link-health
// pipeline, asserted on the CALL (2026-08-26 affiliate deep-link audit).
//
// THE INCIDENT THIS GUARDS AGAINST. wf_experiences rows outlive the products
// they point at: the nightly ingest only refreshes what Viator's top-50 search
// still returns, so a retired product's row keeps serving and its stored URL
// 302s users to Viator's "similar experiences" SEARCH page — a specific-
// activity card that lands on a list of other activities (owner report,
// 2026-08-26). The link_ok/last_checked_at/fail_count columns existed but were
// stamped exactly once (2026-08-22) and nothing read or refreshed them. This
// guard pins all three layers of the fix: the sweep's decision logic, the
// serving filters, and the redirect refusal.
process.env.WF_SUPPRESS_ANALYTICS = "1";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  classifyProductProbe,
  describeProductProbe,
  parseRetryAfter,
  runPoliteProbes,
  nextHealthState,
  dropDeadLinkRows,
  DEAD_AFTER_FAILS,
} from "../lib/experienceLinkHealth.js";
import { PROVIDERS, resolveOffer } from "../lib/commerceProviders.js";
import { GET as runExperienceLinkHealth } from "../app/api/cron/experiences-link-health/route.js";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── 1. probe classification, CALLED ─────────────────────────────────────── */
ok(classifyProductProbe(200, { status: "ACTIVE" }) === "alive", "200+ACTIVE is alive");
ok(classifyProductProbe(200, { status: "INACTIVE" }) === "dead_confirmed", "200+INACTIVE is confirmed dead — Viator said so itself");
ok(classifyProductProbe(404, null) === "dead_probe", "404 is a probe failure, not yet a verdict");
ok(classifyProductProbe(410, null) === "dead_probe", "410 is a probe failure");
ok(classifyProductProbe(429, null) === "unknown", "a rate limit must never kill a product");
ok(classifyProductProbe(500, null) === "unknown", "an upstream 5xx must never kill a product");
ok(classifyProductProbe(401, null) === "unknown", "OUR bad key must never kill a product");
ok(classifyProductProbe(200, {}) === "unknown", "200 with no status field is schema drift, not death");

/* ── 2. state folding, CALLED ────────────────────────────────────────────── */
ok(DEAD_AFTER_FAILS >= 2, "a single probe failure must not be able to un-list a product");
const alive = nextHealthState({ link_ok: false, fail_count: 5 }, "alive");
ok(alive && alive.link_ok === true && alive.fail_count === 0, "a live probe fully resurrects a row (link_ok true, fails reset)");
const confirmed = nextHealthState({ link_ok: true, fail_count: 0 }, "dead_confirmed");
ok(confirmed && confirmed.link_ok === false, "INACTIVE kills immediately — no waiting period on Viator's own word");
const one404 = nextHealthState({ link_ok: true, fail_count: 0 }, "dead_probe");
ok(one404 && one404.link_ok === true && one404.fail_count === 1, "first 404 only counts the failure; the row still serves");
const two404 = nextHealthState({ link_ok: true, fail_count: 1 }, "dead_probe");
ok(two404 && two404.link_ok === false && two404.fail_count === 2, `${DEAD_AFTER_FAILS} consecutive 404s kill the row`);
ok(nextHealthState({ link_ok: true, fail_count: 0 }, "unknown") === null, "unknown writes nothing but last_checked_at");
const stayDead = nextHealthState({ link_ok: false, fail_count: 2 }, "dead_probe");
ok(stayDead && stayDead.link_ok === false, "a dead row stays dead on further probe failures");

/* ── 3. the serving filter, CALLED ───────────────────────────────────────── */
const rows = [{ id: 1, link_ok: true }, { id: 2, link_ok: false }, { id: 3 }, { id: 4, link_ok: null }, null];
const kept = dropDeadLinkRows(rows).map((r) => r.id);
ok(kept.join(",") === "1,3,4", "only proven-dead rows drop; unchecked (null/absent) rows still serve");

/* ── 4. every wf_experiences reader applies it ───────────────────────────── */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const serve = strip(readFileSync(REPO + "lib/experiencesServe.js", "utf8"));
ok(/rows\s*=\s*dropDeadLinkRows\(rows\)/.test(serve), "serveExperiences must drop dead rows before counting/serving");
ok(serve.indexOf("dropDeadLinkRows(rows)") < serve.indexOf("const chipCounts"), "the drop must happen BEFORE chip counts — a count and its list come from one array");
const curated = strip(readFileSync(REPO + "app/api/viator/curated/route.js", "utf8"));
ok(/dropDeadLinkRows\(/.test(curated), "/api/viator/curated must drop dead rows");
ok(/select=[^`"']*link_ok/.test(curated), "/api/viator/curated must select link_ok (a filter over an unselected column is decoration)");
const foodTours = strip(readFileSync(REPO + "lib/foodTours.js", "utf8"));
ok(/link_ok\s*!==\s*false/.test(foodTours), "foodTours keeps its own link_ok filter");

/* ── 5. the redirect refusal, CALLED (assert on the call, not the string) ── */
ok(PROVIDERS.viator.deadColumn === "link_ok", "the viator provider must declare its dead column");
const fakeEnv = () => ({ url: "https://sb.test", key: "k" });
const rowFetch = (row) => async (url) => new Response(JSON.stringify([row]), { status: 200, headers: { "Content-Type": "application/json" } });
{
  const dead = await resolveOffer("viator", "173028P1", { env: fakeEnv, fetch: rowFetch({ product_code: "173028P1", product_url: "https://www.viator.com/tours/x/d1-173028P1", link_ok: false }) });
  ok(dead.error === "offer-link-dead" && !dead.dest, "a link_ok=false row must REFUSE, never redirect");
  const live = await resolveOffer("viator", "173028P1", { env: fakeEnv, fetch: rowFetch({ product_code: "173028P1", product_url: "https://www.viator.com/tours/x/d1-173028P1", link_ok: true }) });
  ok(!!live.dest && /viator\.com/.test(live.dest), "a link_ok=true row still resolves");
  const unchecked = await resolveOffer("viator", "173028P1", { env: fakeEnv, fetch: rowFetch({ product_code: "173028P1", product_url: "https://www.viator.com/tours/x/d1-173028P1", link_ok: null }) });
  ok(!!unchecked.dest, "an unchecked row (link_ok null) still resolves — the sweep decides, not the reader");
}

/* ── 6. the sweep is real: route exists and is scheduled ─────────────────── */
let routeSrc = "";
try { routeSrc = readFileSync(REPO + "app/api/cron/experiences-link-health/route.js", "utf8"); } catch {}
ok(/export async function GET/.test(routeSrc), "the sweep route must exist and export GET");
ok(/CRON_SECRET/.test(routeSrc), "the sweep must carry the fail-closed cron auth");
ok(/describeProductProbe/.test(routeSrc) && /nextHealthState/.test(routeSrc), "the sweep must decide through the shared, guard-called logic — not a private copy");
let crons = [];
try { crons = JSON.parse(readFileSync(REPO + "vercel.json", "utf8")).crons || []; } catch {}
ok(crons.some((c) => String(c.path || "").startsWith("/api/cron/experiences-link-health")), "vercel.json must schedule the sweep — a pipeline that ran once is indistinguishable from no pipeline");

/* ── 7. the real route reports work truthfully ──────────────────────────── */
async function runSweep({ selected = [], selectStatus = 200, patchStatus = 204, patchThrows = false, patchHangs = false, watchdogMs = null, productStatus = 200, productBody = { status: "ACTIVE" }, withViatorKey = true, products = {} } = {}) {
  const saved = {
    CRON_SECRET: process.env.CRON_SECRET,
    VIATOR_API_KEY: process.env.VIATOR_API_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    LINK_HEALTH_PACE_MS: process.env.LINK_HEALTH_PACE_MS,
    LINK_HEALTH_BACKOFF_MS: process.env.LINK_HEALTH_BACKOFF_MS,
    LINK_HEALTH_WATCHDOG_MS: process.env.LINK_HEALTH_WATCHDOG_MS,
    fetch: globalThis.fetch,
    setTimeout: globalThis.setTimeout,
  };
  process.env.CRON_SECRET = "cron-fixture";
  process.env.LINK_HEALTH_PACE_MS = "0"; // real route, zero waits
  process.env.LINK_HEALTH_BACKOFF_MS = "0";
  if (watchdogMs != null) process.env.LINK_HEALTH_WATCHDOG_MS = String(watchdogMs); else delete process.env.LINK_HEALTH_WATCHDOG_MS;
  process.env.SUPABASE_URL = "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-fixture";
  if (withViatorKey) process.env.VIATOR_API_KEY = "viator-fixture";
  else delete process.env.VIATOR_API_KEY;

  const pulses = [], patches = [], providerRequests = [];
  // Exercise the real abort signal without waiting six seconds per fixture.
  globalThis.setTimeout = (fn, ms, ...args) => saved.setTimeout(fn, ms === 6000 ? 0 : ms, ...args);
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const method = String(init.method || "GET").toUpperCase();
    if (u.endsWith("/rest/v1/wf_job_pulse") && method === "POST") {
      pulses.push(JSON.parse(init.body));
      return new Response(null, { status: 201 });
    }
    if (u.includes("/rest/v1/wf_experiences")) {
      if (method === "PATCH") {
        patches.push({ url: u, body: JSON.parse(init.body) });
        if (patchThrows) throw new Error("fixture PATCH network failure");
        if (patchHangs) return new Promise(() => {}); // ignores the abort signal: only the watchdog can end this run
        return new Response(null, { status: patchStatus });
      }
      return selectStatus === 200
        ? Response.json(selected)
        : Response.json({ error: "fixture select failure" }, { status: selectStatus });
    }
    if (u.includes("api.viator.com/partner/products/")) {
      providerRequests.push(u);
      const fixture = products[decodeURIComponent(u.split("/").at(-1))];
      if (fixture) {
        if (fixture.timeout) return new Promise((resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new DOMException("fixture", "AbortError")), { once: true });
        });
        if (fixture.networkError) throw new Error("secret-bearing upstream error must never be logged");
        if (fixture.bodyNetworkError) return { status: 200, json: async () => { throw new TypeError("secret-bearing response body failure"); } };
        if (fixture.invalidJson) return new Response("not json, must never be logged", { status: 200 });
        return new Response(JSON.stringify(fixture.body ?? null), { status: fixture.status ?? 200, headers: fixture.headers || {} });
      }
      return productStatus === 200
        ? Response.json(productBody)
        : new Response(null, { status: productStatus });
    }
    throw new Error("unexpected fetch " + u);
  };

  try {
    const response = await runExperienceLinkHealth(new Request("https://www.gowayfind.com/api/cron/experiences-link-health", {
      headers: { authorization: "Bearer cron-fixture" },
    }));
    return { response, body: await response.json(), pulses, patches, providerRequests };
  } finally {
    globalThis.fetch = saved.fetch;
    globalThis.setTimeout = saved.setTimeout;
    for (const key of ["CRON_SECRET", "VIATOR_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LINK_HEALTH_PACE_MS", "LINK_HEALTH_BACKOFF_MS", "LINK_HEALTH_WATCHDOG_MS"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

{
  const r = await runSweep({ withViatorKey: false });
  ok(r.response.status === 503 && r.body.ok === false, "missing VIATOR_API_KEY fails loud with HTTP 503");
  ok(r.providerRequests.length === 0, "missing configuration never makes a provider request");
  ok(r.pulses.length === 1 && r.pulses[0].job === "experiences-link-health" && r.pulses[0].failed === 1, "missing configuration records one failed pulse when database credentials are available");
}
{
  const r = await runSweep({ selectStatus: 500 });
  ok(r.response.status === 500 && r.body.ok === false, "an unreadable wf_experiences worklist cannot answer HTTP 200");
  ok(r.pulses.length === 1 && r.pulses[0].failed === 1, "a worklist read failure records one failed pulse");
}
{
  const r = await runSweep({ selected: {} });
  ok(r.response.status === 500 && r.body.ok === false, "a malformed wf_experiences worklist cannot answer HTTP 200");
  ok(r.pulses.length === 1 && r.pulses[0].failed === 1, "a malformed worklist records one failed pulse");
}
{
  const r = await runSweep();
  ok(r.response.status === 200 && r.body.ok === true && r.body.checked === 0, "an empty worklist remains a healthy HTTP 200 idle run");
  ok(r.providerRequests.length === 0, "an empty worklist makes no provider request");
  ok(r.pulses.length === 1 && r.pulses[0].attempted === 0 && r.pulses[0].succeeded === 0 && r.pulses[0].failed === 0, "an empty worklist records exactly one idle pulse");
}
{
  const row = { product_code: "FIRST404", link_ok: true, fail_count: 0 };
  const r = await runSweep({ selected: [row], productStatus: 404 });
  const statePatch = r.patches.find((p) => p.url.includes("product_code=eq.FIRST404"));
  ok(statePatch?.body?.link_ok === true && statePatch?.body?.fail_count === 1, "the first 404 persists fail_count=1 while keeping a previously-live row available");
}
{
  const row = { product_code: "SECOND404", link_ok: true, fail_count: 1 };
  const r = await runSweep({ selected: [row], productStatus: 404 });
  const statePatch = r.patches.find((p) => p.url.includes("product_code=eq.SECOND404"));
  ok(statePatch?.body?.link_ok === false && statePatch?.body?.fail_count === 2, "the second consecutive 404 reaches the quarantine threshold and persists link_ok=false");
}
{
  const row = { product_code: "UNKNOWN", link_ok: true, fail_count: 0 };
  const r = await runSweep({ selected: [row], productStatus: 429 });
  ok(r.response.status === 500 && r.body.ok === false && r.body.unknown === 1, "an all-inconclusive provider run is a visible failure, never false HTTP 200 success");
  ok(r.pulses.length === 1 && r.pulses[0].attempted === 1 && r.pulses[0].succeeded === 0, "an all-inconclusive run records attempted work with zero successes");
}
{
  const row = { product_code: "BLOCKED", link_ok: true, fail_count: 7 };
  const r = await runSweep({ selected: [row], productStatus: 403 });
  const timestampPatch = r.patches.find((p) => p.url.includes("product_code=in."));
  ok(r.response.status === 500 && r.body.unknown === 1, "a provider 403 is reported as inconclusive rather than healthy work");
  ok(timestampPatch && Object.hasOwn(timestampPatch.body, "last_checked_at"), "a provider 403 still advances only the health-check timestamp");
  ok(timestampPatch && !Object.hasOwn(timestampPatch.body, "link_ok") && !Object.hasOwn(timestampPatch.body, "fail_count"), "a provider 403 preserves the prior link_ok and fail_count state");
}
{
  const row = { product_code: "WRITEFAIL", link_ok: null, fail_count: 0 };
  const r = await runSweep({ selected: [row], patchStatus: 500 });
  ok(r.response.status === 500 && r.body.ok === false && /persistence failed/.test(r.body.error || ""), "a health-state PATCH failure returns HTTP 500");
  ok(r.pulses.length === 1 && r.pulses[0].failed === 1, "a health-state PATCH failure records one failed pulse");
}
{
  const row = { product_code: "WRITETHROW", link_ok: null, fail_count: 0 };
  const r = await runSweep({ selected: [row], patchThrows: true });
  ok(r.response.status === 500 && r.body.ok === false && /patch-fetch-error/.test(r.body.error || ""), "a thrown PATCH network failure is converted to an HTTP 500 persistence failure");
  ok(r.pulses.length === 1 && r.pulses[0].failed === 1, "a thrown PATCH network failure still records one failed pulse");
}
{
  const row = { product_code: "LIVE", link_ok: null, fail_count: 0 };
  const r = await runSweep({ selected: [row] });
  ok(r.response.status === 200 && r.body.ok === true && r.body.alive === 1, "a definitive healthy probe preserves the successful response contract");
  ok(r.pulses.length === 1 && r.pulses[0].attempted === 1 && r.pulses[0].succeeded === 1 && r.pulses[0].failed === 0, "a healthy run records one truthful successful pulse");
}

/* ── 8. reason evidence survives the real cron and pulse boundary ──────── */
{
  const cases = [
    [200, { status: "ACTIVE" }, "active"], [200, { status: "INACTIVE" }, "inactive"],
    [200, {}, "missing_status"], [404, null, "http_404"], [410, null, "http_410"],
    [401, null, "http_401"], [403, null, "http_403"], [429, null, "http_429"],
    [503, null, "http_5xx"], [400, null, "http_other"],
  ];
  for (const [status, body, reason] of cases) {
    const detail = describeProductProbe(status, body);
    ok(detail.verdict === classifyProductProbe(status, body) && detail.reason === reason, `detailed ${reason} preserves the existing verdict`);
  }
  const products = {
    ACTIVE: { body: { status: "ACTIVE" } }, DEAD: { body: { status: "INACTIVE" } },
    FIRST404: { status: 404 }, SECOND404: { status: 404 }, GONE: { status: 410 },
    AUTH: { status: 401 }, DENIED: { status: 403 }, RATE: { status: 429 },
    UPSTREAM: { status: 503 }, OTHER: { status: 400 }, SCHEMA: { body: {} },
    JSON: { invalidJson: true }, NETWORK: { networkError: true }, TIMEOUT: { timeout: true },
  };
  const selected = Object.keys(products).map((code) => ({ product_code: code, link_ok: true, fail_count: code === "SECOND404" ? 1 : 0 }));
  const r = await runSweep({ selected, products });
  const expected = { active: 1, inactive: 1, http_404: 2, http_410: 1, http_401: 1, http_403: 1, http_429: 1, http_5xx: 1, http_other: 1, missing_status: 1, invalid_json: 1, network_error: 1, timeout: 1 };
  ok(JSON.stringify(r.body.probe_outcomes) === JSON.stringify(expected), "mixed route returns every fixed probe reason and count");
  ok(r.providerRequests.length === selected.length + 2, "one request per product, plus exactly the 2 bounded 429 retries (RATE)");
  ok(r.body.alive === 1 && r.body.newly_or_still_dead === 2 && r.body.unknown === 9, "mixed probe diagnostics preserve health decisions");
  const pulse = r.pulses[0];
  ok(r.pulses.length === 1 && pulse.attempted === 14 && pulse.succeeded === 5 && pulse.failed === 9, "mixed pulse keeps truthful definitive and inconclusive counters");
  const unknown = Object.fromEntries(Object.entries(expected).filter(([k]) => !["active", "inactive", "http_404", "http_410"].includes(k)));
  ok(JSON.stringify(JSON.parse(pulse.note).probes) === JSON.stringify(unknown), "all unknown reasons survive the real recordPulse writer without truncation");
  const unknownPatch = r.patches.find((p) => p.url.includes("NETWORK"));
  ok(unknownPatch && Object.keys(unknownPatch.body).join() === "last_checked_at", "diagnostics preserve unknown-row scheduling without changing health or fail count");
  ok(!JSON.stringify(r).includes("secret-bearing") && !JSON.stringify(r).includes("must never be logged"), "upstream payload and exception text never enter diagnostic output");

  const allUnknown = selected.filter((row) => !["ACTIVE", "DEAD", "FIRST404", "SECOND404", "GONE"].includes(row.product_code));
  const bad = await runSweep({ selected: allUnknown, products });
  ok(bad.response.status === 500 && bad.pulses.length === 1 && bad.pulses[0].failed === 1, "all-unknown diagnostics retain existing visible failure semantics");
  ok(JSON.stringify(JSON.parse(bad.pulses[0].note).probes) === JSON.stringify(unknown), "all-unknown failure pulse retains the complete reason tally");

  // Maximum nightly cap and every reason plus persistence failure: assert the
  // stored pulse is valid JSON after recordPulse's real 200-character limit.
  const capRows = Array.from({ length: 400 }, (_, i) => ({ ...allUnknown[i % allUnknown.length], product_code: `CAP${i}` }));
  const capProducts = Object.fromEntries(capRows.map((row, i) => [row.product_code, products[allUnknown[i % allUnknown.length].product_code]]));
  const write = await runSweep({ selected: capRows, products: capProducts, patchThrows: true });
  const note = JSON.parse(write.pulses[0].note);
  ok(write.response.status === 500 && write.pulses.length === 1 && note.write === "patch-fetch-error", "persistence failure is distinct from provider reasons");
  ok(Object.values(note.probes).reduce((a, b) => a + b, 0) === 400 && Object.keys(note.probes).length === 9, "400-row failure pulse preserves all nine reason counts within storage limit");
  ok(write.pulses[0].note.length <= 200 && write.pulses[0].succeeded === 0, "failed persistence never claims saved successes");
  const bodyNetwork = await runSweep({ selected: [{ product_code: "BODY", link_ok: true }], products: { BODY: { bodyNetworkError: true } } });
  ok(bodyNetwork.body.probe_outcomes.network_error === 1 && !bodyNetwork.body.probe_outcomes.invalid_json, "response-body transport failure is distinct from malformed JSON");
  const healthy = await runSweep({ selected: [{ product_code: "GOOD", link_ok: false }] });
  ok(healthy.pulses.length === 1 && JSON.parse(healthy.pulses[0].note).probes.active === 1 && healthy.pulses[0].failed === 0, "healthy control preserves alive confirmation in the structured pulse");
}

/* ── 9. 429 is NOT dead: rate_limited / blocked are retry-later outcomes ──── */
{
  ok(describeProductProbe(429, null).outcome === "rate_limited", "429 is the distinct rate_limited outcome");
  ok(describeProductProbe(403, null).outcome === "blocked" && describeProductProbe(401, null).outcome === "blocked", "403/401 are the distinct blocked outcome");
  for (const prev of [{ link_ok: true, fail_count: 0 }, { link_ok: null, fail_count: 0 }, { link_ok: true, fail_count: 1 }, { link_ok: false, fail_count: 3 }]) {
    ok(nextHealthState(prev, describeProductProbe(429, null).verdict) === null && nextHealthState(prev, describeProductProbe(403, null).verdict) === null, `429/403 never produce a health state change (prev link_ok=${prev.link_ok})`);
  }
  ok(parseRetryAfter("3") === 3000 && parseRetryAfter("0") === 0 && parseRetryAfter("9999") === 10000 && parseRetryAfter("nope") === null && parseRetryAfter(null) === null, "Retry-After seconds are honoured, clamped, and garbage is ignored");
  ok(parseRetryAfter(new Date(5000).toUTCString(), 2000) === 3000, "Retry-After HTTP-date is honoured");

  // pacing + backoff, CALLED with a fake clock: concurrency cap, min gap, Retry-After wait, bounded retries.
  let t = 0, inflight = 0, peak = 0; const starts = [], waits = [];
  const sleep = async (ms) => { waits.push(ms); t += ms; };
  const calls = {};
  const res = await runPoliteProbes(["A", "B", "C", "D", "THROTTLED", "RECOVERS"], async (code) => {
    inflight++; peak = Math.max(peak, inflight); starts.push(t); calls[code] = (calls[code] || 0) + 1;
    await Promise.resolve(); inflight--;
    if (code === "THROTTLED" || (code === "RECOVERS" && calls[code] === 1)) return { verdict: "unknown", reason: "http_429", outcome: "rate_limited", retryAfterMs: 4000 };
    return { verdict: "alive", reason: "active", outcome: "alive" };
  }, { concurrency: 2, minGapMs: 100, maxRetries: 2, sleep, now: () => t });
  ok(peak <= 2, `per-host concurrency cap holds (peak ${peak})`);
  ok(waits.filter((w) => w === 100).length >= 1, `workers pause for the minimum request gap (waits ${waits.join(",")})`);
  ok(waits.includes(4000), "a 429 waits the server's Retry-After before retrying");
  ok(calls.THROTTLED === 3 && calls.RECOVERS === 2, "retries are bounded (1 + 2) and stop on success");
  ok(res[4].outcome === "rate_limited" && res[4].verdict === "unknown", "a 429 that survives its retries stays rate_limited/unknown, never dead");
  ok(res[5].verdict === "alive", "a product that recovers after backoff is judged on the retry");
  const dl = await runPoliteProbes(["X", "Y"], async () => ({ verdict: "alive", reason: "active", outcome: "alive" }), { concurrency: 1, minGapMs: 0, deadlineAt: -1, sleep, now: () => t });
  ok(dl[0] === null && dl[1] === null, "past the deadline rows are NOT probed and come back null (left untouched)");
}
{
  // Real route: a 429 storm must write NOTHING to the throttled rows.
  const rowsIn = [
    { product_code: "OKAY", link_ok: false, fail_count: 2 },
    { product_code: "THROTTLE_ALIVE", link_ok: true, fail_count: 0 },
    { product_code: "THROTTLE_DEAD", link_ok: false, fail_count: 3 },
  ];
  const r = await runSweep({ selected: rowsIn, products: { OKAY: { body: { status: "ACTIVE" } }, THROTTLE_ALIVE: { status: 429, headers: { "Retry-After": "0" } }, THROTTLE_DEAD: { status: 429 } } });
  const touched = (c) => r.patches.filter((p) => p.url.includes(c));
  ok(r.response.status === 200 && r.body.alive === 1 && r.body.rate_limited_deferred === 2, "route reports rate-limited rows as deferred, run still succeeds on definitive work");
  ok(touched("THROTTLE_ALIVE").length === 0 && touched("THROTTLE_DEAD").length === 0, "route issues NO write for rate-limited rows (not even last_checked_at - they retry first next run)");
  ok(r.patches.every((p) => p.body.link_ok !== false), "no PATCH anywhere flips link_ok to false because of a 429");
  ok(r.body.newly_or_still_dead === 0, "a 429 is never counted dead");
}

{
  // 2026-10-14 06:35Z: "Task timed out after 60 seconds" with NO pulse. A sweep
  // that cannot finish (here: Supabase PATCH never answers) must still answer
  // with a failed pulse before the platform kills it.
  const hung = await Promise.race([
    runSweep({ selected: [{ product_code: "HANG", link_ok: true, fail_count: 0 }], patchHangs: true, watchdogMs: 300 }),
    new Promise((resolve) => globalThis.setTimeout(() => resolve("never-answered"), 5000)),
  ]);
  ok(hung !== "never-answered", "a hung sweep is ended by the watchdog instead of running until the platform kills it");
  if (hung !== "never-answered") {
    ok(hung.response.status === 500 && hung.body.ok === false && /watchdog/.test(hung.body.error || ""), "the watchdog answers HTTP 500, not 200");
    ok(hung.pulses.length === 1 && hung.pulses[0].job === "experiences-link-health" && hung.pulses[0].failed === 1 && /watchdog/.test(hung.pulses[0].note || ""), "the watchdog records exactly one failed pulse naming itself");
  }
  const okRun = await runSweep({ selected: [{ product_code: "OKAY", link_ok: true, fail_count: 0 }], watchdogMs: 5000 });
  ok(okRun.response.status === 200 && okRun.pulses.length === 1 && okRun.pulses[0].failed === 0, "a healthy run under the watchdog is untouched: one success pulse");
  ok(/PROBE_BUDGET_MS = 30000/.test(routeSrc) && /WATCHDOG_MS = 48000/.test(routeSrc) && /maxDuration = 60/.test(routeSrc), "probe budget (30s) and watchdog (48s) sit inside maxDuration (60s)");
}

/* ── verdict ─────────────────────────────────────────────────────────────── */
if (fail.length) {
  console.error(`check-experiences-link-health: ${fail.length} FAILED (${pass} passed)`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-experiences-link-health: ${pass} assertions passed`);
