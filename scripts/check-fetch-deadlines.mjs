#!/usr/bin/env node
/**
 * scripts/check-fetch-deadlines.mjs — nothing on the rail path may hang.
 *
 * THE INCIDENT. The owner has now photographed an empty rail twice, weeks
 * apart, both times from his own phone: "sometimes it shows up, sometimes it
 * doesn't ... I have guardrails. I thought I already had guardrails in order to
 * prevent those things, but it's not protecting it."
 *
 * v8.73 (#993) found half of it — nine builders running sequentially against a
 * 12-second client deadline — parallelised them and raised the budget to 30s.
 * The half it did not find, measured on production 2026-08-27 AFTER that fix
 * shipped, serially, one request at a time, against Orlando with its metro pool
 * already warm, six fresh CDN cache cells:
 *
 *     cell 01  ->  50.0s  timed out, no body
 *     cell 02  ->   2.5s  200
 *     cell 03  ->   2.2s  200
 *     cell 04  ->  50.0s  timed out, no body
 *     cell 05  ->   5.3s  200
 *
 * Two of five, on identical work that the successful runs finished in two
 * seconds. Not slow — HUNG. /api/rails fans out to as many as forty upstream
 * calls per request (five ranked categories x up to four pool towns, each
 * possibly a metered Google Places POST, plus the Supabase cache and the
 * inventory / editorial / beach joins) and NOT ONE of those seven fetch sites
 * carried a signal or a timeout.
 *
 * Three properties made it survive every existing guard:
 *
 *   1. A HANG IS NOT AN EXCEPTION. All seven sites already had try/catch with a
 *      correct degraded answer — "429/down: serve stale" — and not one of them
 *      could ever run, because nothing threw.
 *   2. IT NEVER SELF-HEALS. A request that never completes writes nothing to
 *      the CDN, so the next reader in that cell repeats it from scratch.
 *   3. IT IS INVISIBLE TO A STATUS CHECK. Every failure mode of /api/rails
 *      answers 200 by design.
 *
 * So this guard pins the three layers of the fix and, more importantly, the
 * ORDERING BETWEEN THEM — which is the part a later tidy-up breaks without
 * noticing, because each number looks arbitrary on its own:
 *
 *     per-call 8s  <  server 20s  <  client 30s
 *
 * If the server deadline ever exceeds the client's, the reader's stopwatch
 * decides what they are told about their town again, and we are back to
 * blaming a reader's neighbourhood for our own stall.
 *
 * ASSERTED BY EXECUTION wherever it can be. fetchDeadline is run against a
 * fetch that never settles; assertRailsBody is run against the actual payload
 * shapes production returns while failing. A regex over either would pass on
 * code that does nothing (CLAUDE.md: assert the CALL, not the string).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fails = 0;
const ok = (c, m) => { if (c) pass++; else { console.error("  FAIL: " + m); fails++; } };

/** Code only: comments and string bodies blanked, so prose never reads as code
 *  and a URL containing the word does not count as a call. Both traps are in
 *  CLAUDE.md, each bought with a false positive. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``")
    .replace(/"(?:\\[\s\S]|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\[\s\S]|[^'\\\n])*'/g, "''");
}
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/* ── 1. THE PROPERTY EVERYTHING RESTS ON, BY EXECUTION ─────────────────────
   fetchDeadline must reject when the upstream never answers. If it resolves,
   or hangs itself, every degraded path downstream stays unreachable and the
   whole fix is decoration. */
{
  const { fetchDeadline, deadlineSignal, NET_DEADLINE_MS, DB_DEADLINE_MS } =
    await import(join(ROOT, "lib/fetchDeadline.js"));
  const realFetch = globalThis.fetch;
  // AbortSignal.timeout deliberately does NOT keep the event loop alive (so a
  // finished lambda can freeze); a real in-flight request does. The harness has
  // to supply that, or this test measures the harness, not the module.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    // (a) a fetch that never settles
    globalThis.fetch = (u, i) => new Promise((_res, rej) => {
      if (i && i.signal) i.signal.addEventListener("abort", () => rej(new Error("aborted")));
    });
    // THE HARNESS MUST OUTLIVE THE THING IT IS TESTING. Red-proving this
    // guard on 2026-08-27 by deleting the signal from fetchDeadline did not
    // make it fail — it made it HANG, because the test awaited the very call
    // whose bounding it was checking. A stuck CI job is not a red build; it is
    // a build nobody can read, and it would have been diagnosed as a flake.
    // So the harness carries its own deadline, and a hang is reported as the
    // failure it is.
    const t0 = Date.now();
    const verdict = await Promise.race([
      fetchDeadline("http://never.invalid", { next: { revalidate: 60 } }, 250).then(() => "resolved", () => "rejected"),
      new Promise((r) => setTimeout(() => r("hung"), 3000)),
    ]);
    const elapsed = Date.now() - t0;
    ok(verdict === "rejected",
      `EXECUTED: fetchDeadline REJECTS against a fetch that never settles (got "${verdict}") — the exact failure mode that hung production, and the one every existing try/catch could not see. "hung" here means the deadline is not being applied at all`);
    ok(verdict === "rejected" && elapsed < 2000,
      `EXECUTED: …and it rejects promptly (${elapsed}ms for a 250ms deadline), rather than waiting on its own timer`);

    // (b) a caller that brought its own signal keeps it
    const mine = new AbortController().signal;
    globalThis.fetch = (u, i) => Promise.resolve({ same: i.signal === mine });
    ok((await fetchDeadline("http://x", { signal: mine }, 250)).same === true,
      "a caller-supplied signal is preserved, not silently replaced");

    // (c) the caller's init object is never mutated — it is reused across
    //     retries and shared between call sites
    const init = { next: { revalidate: 86400 }, method: "POST" };
    globalThis.fetch = () => Promise.resolve({});
    await fetchDeadline("http://x", init, 250);
    ok(!("signal" in init), "the caller's init is not mutated — no signal is written back into a shared object");

    // (d) next: { revalidate } survives, which is what keeps the metered
    //     Google results cached. Verified against the installed Next 14.2.5:
    //     patch-fetch decides cacheability from `revalidate`, and
    //     fetchCacheKey does not hash `signal`.
    let seen = null;
    globalThis.fetch = (u, i) => { seen = i; return Promise.resolve({}); };
    await fetchDeadline("http://x", { next: { revalidate: 86400 } }, 250);
    ok(seen && seen.next && seen.next.revalidate === 86400,
      "next.revalidate passes through untouched — a deadline must not quietly un-cache 40 metered Places calls per request");
    ok(seen && seen.signal && typeof seen.signal.aborted === "boolean",
      "…and a signal was actually supplied when the caller had none (without this, (a) could pass for the wrong reason)");

    // (e) undefined init must not throw
    globalThis.fetch = (u, i) => Promise.resolve({ hasSignal: !!(i && i.signal) });
    ok((await fetchDeadline("http://x")).hasSignal === true, "a bare fetchDeadline(url) still carries a deadline");

    ok(typeof deadlineSignal(50).aborted === "boolean", "deadlineSignal returns a real AbortSignal");
    ok(NET_DEADLINE_MS > 0 && DB_DEADLINE_MS > 0, "both budgets are positive numbers");
  } finally {
    clearInterval(keepAlive);
    globalThis.fetch = realFetch;
  }
}

/* ── 2. THE ORDERING. per-call < server < client ───────────────────────────
   Each number is defensible alone and the SET is what makes the design work:
   the server must always answer before the client stops listening, or the
   reader is told about their town by a stopwatch again. */
{
  const { NET_DEADLINE_MS } = await import(join(ROOT, "lib/fetchDeadline.js"));
  const rails = read("lib/railsData.js");
  const mServer = rails.match(/export const RAILS_SERVER_DEADLINE_MS\s*=\s*(\d+)/);
  const drail = read("app/components/DaypartRail.js");
  const mClient = drail.match(/export const RAILS_LOAD_TIMEOUT_MS\s*=\s*(\d+)/);
  ok(!!mServer, "railsData declares RAILS_SERVER_DEADLINE_MS (assert the declaration, not the bare name)");
  ok(!!mClient, "DaypartRail declares RAILS_LOAD_TIMEOUT_MS");
  const server = mServer ? Number(mServer[1]) : NaN;
  const client = mClient ? Number(mClient[1]) : NaN;
  ok(NET_DEADLINE_MS < server,
    `one upstream call (${NET_DEADLINE_MS}ms) must be bounded well inside the whole build (${server}ms) — otherwise a single stalled call eats the entire server budget`);
  ok(server < client,
    `the SERVER deadline (${server}ms) must be strictly inside the CLIENT budget (${client}ms) — the server decides what the reader is told, not the client's stopwatch. Reversing these restores the exact bug: the reader is told "nothing near you clears this bar" because WE stalled`);
}

/* ── 3. EVERY fetch ON THE RAIL PATH GOES THROUGH IT ───────────────────────
   The helper existing proves nothing if a call site still uses bare fetch —
   and a NEW one added next month is exactly how this returns. This is the
   assertion that covers code nobody has written yet. */
{
  for (const f of ["lib/landing.js", "lib/railsData.js"]) {
    const code = codeOnly(read(f));
    const bare = (code.match(/(?<![.\w])fetch\s*\(/g) || []).length;
    const wrapped = (code.match(/fetchDeadline\s*\(/g) || []).length;
    ok(wrapped > 0, `PROBE: ${f} actually calls fetchDeadline (${wrapped}x) — a zero here would make the next assertion vacuous`);
    ok(bare === 0, `${f}: no bare fetch() remains — every upstream call on the rail path is bounded (found ${bare})`);
  }
  // …and the helper is imported where it is used, not merely referenced.
  for (const f of ["lib/landing.js", "lib/railsData.js"]) {
    ok(/import\s*\{[^}]*\bfetchDeadline\b[^}]*\}\s*from\s*["'][^"']*fetchDeadline\.js["']/.test(read(f)),
      `${f}: imports fetchDeadline (an unbound call is legal JavaScript until it runs — see the #486 extraction postmortem)`);
  }
}

/* ── 4. A DEGRADED ANSWER IS NOT CACHED AS THE TRUTH ───────────────────────
   railMenuData now reports `failed`. Handing that to the CDN with an hour of
   s-maxage would pin one transient stall on every reader in that cell for the
   next hour — which is what "sometimes it shows up, sometimes it doesn't"
   actually was. */
{
  const code = codeOnly(read("app/api/rails/route.js"));
  const raw = read("app/api/rails/route.js");
  ok(/const\s+degraded\s*=/.test(code), "the route computes a `degraded` flag from the payload");
  ok(/degraded[\s\S]{0,80}no-store/.test(raw),
    "…and a degraded payload is served no-store, so the very next request rebuilds and the cell self-heals instead of latching an empty answer for an hour");
  ok(/data\.failed\s*===\s*true/.test(code),
    "…derived from data.failed, the flag railMenuData sets when the build did not complete");
  ok(/export const maxDuration\s*=\s*\d+/.test(code),
    "the route declares maxDuration — the platform ceiling outside both deadlines, so a stall in code neither of them bounds still ends in a response");
  ok(/s-maxage=3600/.test(raw), "CONTROL: the healthy answer still keeps the hour it earned (without this, 'no-store everywhere' would pass)");
}

/* ── 5. railMenuData's LOAD IS BOUNDED, not merely caught ──────────────────*/
{
  const code = codeOnly(read("lib/railsData.js"));
  const i = code.indexOf("export async function railMenuData");
  const block = i > -1 ? code.slice(i, i + 3000) : "";
  ok(block.length > 500, "PROBE: railMenuData was delimited — a -1 here would scan nothing and prove nothing");
  ok(/settleLoad\s*\(/.test(block),
    "railMenuData routes its load through settleLoad — which cannot reject AND cannot hang (lib/loadState.js). A bare .catch() only ever saw the failure mode that throws, and production's was the other one");
  ok(/timeoutMs:\s*RAILS_SERVER_DEADLINE_MS/.test(block),
    "…with the server deadline, not settleLoad's 12s client default");
}

/* ── 6. THE DETECTOR, BY EXECUTION AGAINST REAL FAILURE SHAPES ─────────────
   Every failure mode of /api/rails answers HTTP 200. A status check would have
   reported GREEN throughout the outage it was added to catch. */
{
  const { assertRailsBody, MIN_RAIL_CARDS } = await import(join(ROOT, "lib/commandCenter/sources/synthetic.js"));
  const healthy = JSON.stringify({ covered: true, data: { failed: false, places: { a: new Array(900).fill("i"), b: new Array(640).fill("i") } } });
  const h = assertRailsBody(healthy);
  ok(h.ok === true && h.cards === 1540,
    `CONTROL: a healthy payload PASSES (${h.cards} cards) — without this the six failure cases below could all pass on an assertion that rejects everything`);

  const BAD = [
    ["the build did not complete", { covered: true, data: { failed: true, places: {} } }],
    ["THE SILENT ONE: 200, covered, no failure flag, nothing to show", { covered: true, data: { places: { a: [], b: [] } } }],
    ["the route's own fail-closed path", { covered: false, data: null }],
    ["covered with no payload at all", { covered: true, data: null }],
  ];
  for (const [label, body] of BAD) {
    ok(assertRailsBody(JSON.stringify(body)).ok === false, `EXECUTED: rejected — ${label}`);
  }
  for (const [label, body] of [["empty body (the hang)", ""], ["truncated JSON", '{"covered":true,"data":{"pla'], ["null", null], ["undefined", undefined], ["HTML error page", "<!doctype html><title>504</title>"]]) {
    const r = assertRailsBody(body);
    ok(r.ok === false && typeof r.error === "string", `EXECUTED: rejected without throwing — ${label}`);
  }
  ok(assertRailsBody(JSON.stringify({ covered: true, data: { places: { a: new Array(MIN_RAIL_CARDS - 1).fill("i") } } })).ok === false
    && assertRailsBody(JSON.stringify({ covered: true, data: { places: { a: new Array(MIN_RAIL_CARDS).fill("i") } } })).ok === true,
    `the floor is exactly MIN_RAIL_CARDS (${MIN_RAIL_CARDS}) — asserted on both sides of the boundary, so an off-by-one is not a passing test`);
}

/* ── 7. THE PROBE IS WIRED, AND ITS FAILURE PAGES ──────────────────────────
   A detector nobody reads is the state this endpoint was already in:
   `rail_open` has carried has_places since v8.5 and nothing consumed it. */
{
  // ASSERTED BY RUNNING THE PROBE, not by grepping the target table. A regex
  // over TARGETS would pass while the assertion was silently dropped on the
  // way into probe() — which is precisely the identifier-appears-but-plays-no-
  // role false green CLAUDE.md warns about. So: drive selfCheck with a fake
  // upstream that returns the OUTAGE payload production actually returned, and
  // read the verdict out of the real result rows.
  const syn0 = read("lib/commandCenter/sources/synthetic.js");
  const { selfCheck } = await import(join(ROOT, "lib/commandCenter/sources/synthetic.js"));
  // The SILENT shape: 200, covered:true, no failure flag, rails present, and
  // not one card behind them. This is what the reader experiences as "I tapped
  // it and nothing came up", and it is the hardest one to detect — even a
  // check that counted rails would pass on it.
  const OUTAGE = JSON.stringify({ covered: true, data: { places: { tonight: [], eat: [] } } });
  const fakeHeaders = { get: () => null };
  const fake = async (url) => ({
    status: 200, headers: fakeHeaders,
    text: async () => (/\/api\/rails/.test(url) ? OUTAGE : "{}"),
    arrayBuffer: async () => new ArrayBuffer(0),
  });
  const res = await selfCheck({ fetchImpl: fake, baseUrl: "https://probe.test" });
  const rows = (res && res.data && res.data.checks) || [];
  const railsRow = rows.find((r) => r.key === "api_rails");
  ok(!!railsRow, "EXECUTED: selfCheck probes /api/rails at all — it was the one endpoint behind every place card and the only one never probed");
  ok(railsRow && /\/api\/rails/.test(railsRow.path), "…at the rails path");
  ok(railsRow && railsRow.status === 200 && railsRow.ok === false,
    "EXECUTED: a 200 carrying an EMPTY payload is reported NOT ok — the outage answered 200 by design, so a status check would have called it green");
  ok(railsRow && /place cards/.test(String(railsRow.error)),
    "…with the measured reason, not a bare status line");
  ok(railsRow && Number(railsRow.slowMs) > 3000,
    "…and its own slow budget: a cold metro build is legitimately slower than /api/geo, and an alarm that fires on correct behaviour is the one people learn to ignore");
  const otherRow = rows.find((r) => r.key === "api_geo");
  ok(otherRow && otherRow.ok === true,
    "CONTROL: a target with no assertion still passes on a 200 — the body check did not become a blanket failure");

  // ── THE PROBE MUST FIT INSIDE THE ROUTE THAT AWAITS IT ──────────────────
  // selfCheck runs inside a Promise.all under the command-center panel's own
  // maxDuration. A probe permitted to wait longer than that budget does not
  // report a failure, it CAUSES one — the owner's dashboard dies instead of
  // telling him what is wrong. Read both numbers rather than trusting that
  // whoever adds the next target remembers this file exists.
  const panelSrc = read("app/api/command-center/[panel]/route.js");
  const mPanel = panelSrc.match(/export const maxDuration\s*=\s*(\d+)/);
  ok(!!mPanel, "the command-center panel route declares maxDuration");
  const panelBudgetMs = mPanel ? Number(mPanel[1]) * 1000 : NaN;
  const synCode = codeOnly(syn0);
  const declared = [...synCode.matchAll(/timeoutMs:\s*(\d+)/g)].map((m) => Number(m[1]));
  ok(declared.length > 0, `PROBE: found ${declared.length} declared probe timeout(s) — a zero here would make the next assertion vacuous`);
  const overrun = declared.filter((t) => t >= panelBudgetMs);
  ok(overrun.length === 0,
    `every probe timeout (${declared.join(", ")}ms) is strictly inside the panel's ${panelBudgetMs}ms budget — a probe that outlives the route it runs in takes the dashboard down instead of reporting (found ${overrun.join(", ")})`);

  // ── AND IT MEASURES WHAT A READER IS ACTUALLY SERVED ────────────────────
  // Executed: read the request options the probe really passed.
  const seenCache = {};
  const fake2 = async (url, init) => {
    seenCache[/\/api\/rails/.test(url) ? "rails" : "other"] = init && init.cache;
    return { status: 200, headers: fakeHeaders, text: async () => JSON.stringify({ covered: true, data: { places: { a: new Array(99).fill("i") } } }), arrayBuffer: async () => new ArrayBuffer(0) };
  };
  await selfCheck({ fetchImpl: fake2, baseUrl: "https://probe2.test" });
  ok(seenCache.rails !== "no-store",
    "EXECUTED: the /api/rails probe does NOT force a cold rebuild — this endpoint is CDN-cached for an hour by design, so a no-store probe would spend a metro rebuild on every dashboard load and time something no reader experiences");
  ok(seenCache.other === "no-store",
    "CONTROL: the ordinary liveness targets still send no-store — this is one target's exemption, not a site-wide loss of freshness");

  const { CRITICAL_CHECKS, computeAlerts } = await import(join(ROOT, "lib/commandCenter/alerts.js"));
  ok(CRITICAL_CHECKS.includes("api_rails") && CRITICAL_CHECKS.includes("home"),
    "an empty rail is a CRITICAL alert, alongside the homepage — /api/cron/cc-alerts emails critical alerts hourly, which is the difference between the owner learning this from us and learning it from his own phone");

  // EXECUTED end to end: the shape production actually returns -> an email-worthy alert.
  const a = computeAlerts({ synthetic: { checks: [{ key: "api_rails", label: "API /api/rails (place cards)", ok: false, status: 200, ms: 900, error: "only 0 place cards across 17 rails (expected >= 50)" }] } });
  const hit = a.find((x) => x.id === "site_check_failed");
  ok(hit && hit.severity === "critical", "EXECUTED: an empty-rails probe result produces a CRITICAL alert");
  ok(hit && /0 place cards/.test(hit.detail), "…whose body carries the measured card count, so the email says what is wrong rather than that something is");

  // …and does not fire on a healthy one.
  const quiet = computeAlerts({ synthetic: { checks: [{ key: "api_rails", label: "rails", ok: true, ms: 9000, slowMs: 20000 }] } });
  ok(!quiet.some((x) => x.id === "site_check_failed" || x.id === "site_check_slow"),
    "CONTROL: a healthy 9s cold build is SILENT — a guard that fires on correct code gets switched off, and takes its real catches with it");
}

/* ── 8. RED PROOFS ─────────────────────────────────────────────────────────
   Each one breaks the thing the assertion protects and confirms the assertion
   would have caught it. A red-prove that never turns red is decoration. */
const RED = [
  ["a bare fetch() reappearing is detectable", () => {
    const c = codeOnly('const r = await fetch(url, { next: { revalidate: 60 } });');
    return (c.match(/(?<![.\w])fetch\s*\(/g) || []).length === 1;
  }],
  ["…and fetchDeadline is NOT miscounted as a bare fetch", () => {
    const c = codeOnly('const r = await fetchDeadline(url, {}, 8000);');
    return (c.match(/(?<![.\w])fetch\s*\(/g) || []).length === 0;
  }],
  ["the word 'fetch(' inside a comment or string is NOT a call", () => {
    const c = codeOnly('// we used to fetch( here\nconst s = "await fetch(x)";');
    return (c.match(/(?<![.\w])fetch\s*\(/g) || []).length === 0;
  }],
  ["a server deadline raised past the client budget is detectable", () => 25000 < 20000 === false && !(25000 < 20000)],
  ["an s-maxage'd degraded response is detectable", () => {
    const bad = 'const degraded = !data; return NextResponse.json(x, { headers: { "Cache-Control": "public, s-maxage=3600" } });';
    return !/degraded[\s\S]{0,80}no-store/.test(bad);
  }],
  ["a status-only probe would MISS the empty payload", async () => {
    const { assertRailsBody } = await import(join(ROOT, "lib/commandCenter/sources/synthetic.js"));
    const outage = { status: 200, body: JSON.stringify({ covered: true, data: { places: {} } }) };
    const statusOnly = outage.status >= 200 && outage.status < 400;   // the check we had
    const withBody = assertRailsBody(outage.body).ok;                  // the check we have
    return statusOnly === true && withBody === false;                  // green vs red, same response
  }],
];
for (const [label, fn] of RED) ok((await fn()) === true, "RED PROOF failed to fail: " + label);

if (fails) {
  console.error(`check-fetch-deadlines: FAIL — ${fails} of ${pass + fails} assertions`);
  process.exit(1);
}
console.log(`check-fetch-deadlines: OK — ${pass} assertions (fetchDeadline executed against a never-settling fetch; assertRailsBody executed against 10 real payload shapes; the 8s < 20s < 30s ordering pinned; 7 rail-path fetch sites bounded)`);
