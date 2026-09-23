#!/usr/bin/env node
/**
 * check-go-routes-crawler-gate — every /go affiliate redirect route refuses a
 * self-identified crawler BEFORE it can spend money or reach a partner, and
 * our OWN synthetic monitor is never one of the things that gate refuses,
 * while never counting as a human either.
 *
 * THE LEAK THIS CLOSES (2026-09-15 07:00Z). 94 provider_redirect_started in
 * one hour, 106 IPs, desktop Chrome/Mac UAs, offer ids like `q:tampa boat
 * cruise` — /api/viator/go had NO isCrawler gate while its three siblings
 * (commerce, hotels, ticketmaster) already did, so a bot hitting a `q:`
 * offer walked straight past providerSpendAllow("viator") into a real,
 * metered Viator freetext search. scripts/check-ut-crawler-clicks.mjs already
 * locks the gate's UA classification and ONE route's ordering
 * (commerce/go vs resolveOffer). This guard is the general form: it discovers
 * every go route on disk (so a FIFTH route added later cannot ship ungated
 * and silently unwired from this check), and it closes the second half of
 * the incident — the synthetic monitor must get a REAL redirect (never be
 * refused) but must never be counted as a human visitor either.
 *
 * TWO STATIC ASSERTIONS PER ROUTE (source, not behavior):
 *   1. it imports isCrawler from lib/crawler.js
 *   2. the CALL isCrawler(...) — not the import — appears in the source
 *      BEFORE any literal fetch( or providerSpendAllow( call in that same
 *      file. Comments are stripped first (CLAUDE.md: a raw-source guard must
 *      not fail, or in this case pass, on its own comment).
 *
 * THREE DYNAMIC ASSERTIONS, CALLED — never read off a string:
 *   3. a self-identified bot UA is refused with failure_reason
 *      "crawler-refused", proven by intercepting the real PostHog capture
 *      call the route makes (same technique as check-provider-redirects.mjs).
 *      Three of four fixtures use OTHERWISE-VALID params — a request that
 *      would succeed if the gate were absent — so refusal is proof the gate
 *      fired, not proof the request was going to fail anyway.
 *   4. scripts/run-synthetic-monitor.mjs's own UA is NEVER refused as a
 *      crawler: for the same three otherwise-valid fixtures it gets the REAL
 *      partner redirect (ticketmaster.com / stay22.com / viator.com), not
 *      the route's own fail-closed fallback.
 *   5. captureServer(), called directly with that UA on the request headers,
 *      issues ZERO PostHog requests — paired with a negative control (an
 *      ordinary UA issues exactly one) so "zero" cannot be "captureServer is
 *      broken and sends nothing to anyone".
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── discover every go route on disk — no hand-kept list to fall out of date ── */
function findGoRoutes(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = dir + "/" + e.name;
    if (e.isDirectory()) { findGoRoutes(full, out); continue; }
    if (e.name === "route.js" && dir.split("/").pop() === "go") out.push(full);
  }
  return out;
}
const DISCOVERED = findGoRoutes(REPO + "app/api").map((p) => p.slice(p.indexOf("app/api"))).sort();
ok(DISCOVERED.length >= 4, `PROBE BROKEN: expected to discover at least the 4 known go routes, found ${DISCOVERED.length}`);

/* ── per-route fixtures: otherwise-valid params + the destination that ONLY
   a successful (non-refused) redirect can reach ────────────────────────── */
const FIXTURES = {
  "app/api/commerce/go/route.js": {
    // No hermetic offer registry row is available to this guard without
    // depending on commerce-provider internals unrelated to the crawler gate
    // (see lib/commerceProviders.js). The ordering and refusal-with-capture
    // assertions below still fully exercise this route; only the "otherwise
    // would have succeeded" positive redirect is skipped here.
    query: "provider=unknown&offer=xyz",
    successHostSubstr: null,
  },
  "app/api/hotels/go/route.js": {
    query: "name=" + encodeURIComponent("Test Hotel") + "&address=" + encodeURIComponent("1 Main St, Sarasota, FL"),
    successHostSubstr: "stay22.com",
  },
  "app/api/ticketmaster/go/route.js": {
    query: "url=" + encodeURIComponent("https://www.ticketmaster.com/event/123"),
    // Impact env vars are unset in this hermetic run, so tmImpactLink()
    // returns the raw destination — still ticketmaster.com, never our own
    // /events fallback.
    successHostSubstr: "ticketmaster.com",
  },
  "app/api/viator/go/route.js": {
    query: "product=" + encodeURIComponent("https://www.viator.com/tours/Orlando/Airboat/d827-1234P5"),
    successHostSubstr: "viator.com",
  },
};
const missingFixture = DISCOVERED.filter((p) => !(p in FIXTURES));
ok(missingFixture.length === 0,
  `every discovered go route needs a fixture in this guard (missing: ${missingFixture.join(", ") || "none"}) — a new /go route ships unguarded by this check until one is added`);

/* ── 1 & 2: STATIC — import present, call precedes fetch/spend ───────────── */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const IMPORT_RE = /import\s*\{[^}]*\bisCrawler\b[^}]*\}\s*from\s*["'][^"']*lib\/crawler(?:\.js)?["']/;

// Resolve ONE level of call indirection. /api/viator/go's fetch() and
// providerSpendAllow() calls live inside resolveProduct(), a helper defined
// BEFORE the GET handler in source order — so a naive "first fetch(" text
// search finds the helper's DEFINITION (always earlier in the file) and
// reports the gate as running "after" a call that, at runtime, only ever
// happens later, from inside GET, after the gate already returned. That is
// exactly CLAUDE.md's "a guard that fires on correct code" trap. So: find
// every top-level function whose OWN body contains fetch(/providerSpendAllow(,
// then require the gate to precede that helper's CALL SITE inside GET — not
// its declaration.
function topLevelFunctionSpans(src) {
  const spans = [];
  const re = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const braceStart = src.indexOf("{", m.index);
    if (braceStart < 0) continue;
    let depth = 0, i = braceStart;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) break; }
    }
    spans.push({ name: m[1], start: m.index, end: i });
  }
  return spans;
}

for (const rel of DISCOVERED) {
  const raw = readFileSync(REPO + rel, "utf8");
  const src = strip(raw);
  ok(IMPORT_RE.test(src), `${rel}: imports isCrawler from lib/crawler.js`);

  const spans = topLevelFunctionSpans(src);
  const getSpan = spans.find((s) => s.name === "GET");
  ok(!!getSpan, `${rel}: has a top-level GET handler this guard can analyze`);
  if (!getSpan) continue;
  const getBody = src.slice(getSpan.start, getSpan.end);

  // The CALL, not the import — an import regex alone would pass even if the
  // gate were declared and never invoked (CLAUDE.md: assert the syntactic
  // position, not the substring). Position is relative to getBody.
  const callAt = getBody.search(/\bisCrawler\s*\(/);
  ok(callAt >= 0, `${rel}: calls isCrawler(...) inside the GET handler`);

  // Danger positions, ALL measured relative to getBody:
  //   (a) a literal fetch(/providerSpendAllow( written directly in GET's body
  //   (b) a call, inside GET's body, to a helper whose OWN body (defined
  //       elsewhere in the file) contains one of those calls
  const dangerPositions = [];
  for (const m of getBody.matchAll(/\bfetch\s*\(/g)) dangerPositions.push(m.index);
  for (const m of getBody.matchAll(/\bproviderSpendAllow\s*\(/g)) dangerPositions.push(m.index);
  for (const span of spans) {
    if (span.name === "GET") continue;
    const body = src.slice(span.start, span.end);
    if (!/\bfetch\s*\(/.test(body) && !/\bproviderSpendAllow\s*\(/.test(body)) continue;
    const nameRe = new RegExp("\\b" + span.name + "\\s*\\(", "g");
    for (const m of getBody.matchAll(nameRe)) dangerPositions.push(m.index);
  }

  // Not every go route reaches fetch/providerSpendAllow from within its OWN
  // file (commerce/hotels/ticketmaster delegate any network work to lib/
  // helpers imported from elsewhere, which this in-file analysis correctly
  // does not chase) — that is a fact about those routes, not a broken probe.
  // Only assert ordering where there IS something in-file to order against;
  // the positive control right after this loop proves the mechanism itself
  // actually exercises a real spend/fetch call on viator/go.
  if (dangerPositions.length) {
    const earliest = Math.min(...dangerPositions);
    ok(callAt >= 0 && callAt < earliest,
      `${rel}: isCrawler() runs BEFORE the first reachable fetch/providerSpendAllow call from GET (danger at ${earliest}, gate at ${callAt})`);
  }
}
// Positive control: viator/go is KNOWN to contain both a fetch( and a
// providerSpendAllow( call, reachable from GET via resolveProduct() (that is
// the whole incident this guard exists to close). If this were false, the
// "not every route has one" carve-out above would be silently hiding the
// fact that the ordering assertion never ran on a real spend/fetch call.
{
  const viatorSrc = strip(readFileSync(REPO + "app/api/viator/go/route.js", "utf8"));
  const viatorSpans = topLevelFunctionSpans(viatorSrc);
  const viatorGet = viatorSpans.find((s) => s.name === "GET");
  const reachesResolveProduct = !!viatorGet && /\bresolveProduct\s*\(/.test(viatorSrc.slice(viatorGet.start, viatorGet.end));
  const resolveProductSpan = viatorSpans.find((s) => s.name === "resolveProduct");
  const resolveProductIsDangerous = !!resolveProductSpan &&
    (/\bfetch\s*\(/.test(viatorSrc.slice(resolveProductSpan.start, resolveProductSpan.end)) ||
     /\bproviderSpendAllow\s*\(/.test(viatorSrc.slice(resolveProductSpan.start, resolveProductSpan.end)));
  ok(reachesResolveProduct && resolveProductIsDangerous,
    "PROBE BROKEN: expected /api/viator/go's GET to call resolveProduct(), and resolveProduct() to contain fetch(/providerSpendAllow( — if either is false, the call-indirection ordering check above never exercised a real spend/fetch call");
}

/* ── UA classification, CALLED, not read off a string ─────────────────────── */
const BOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const SYNTHETIC_UA = "WayfindSyntheticMonitor/1.0 (+https://www.gowayfind.com)";

const { isCrawler, isSyntheticMonitor } = await import(REPO + "lib/crawler.js");
ok(isCrawler(BOT_UA) === true, "isCrawler() still refuses an ordinary self-identified bot");
ok(isCrawler(SYNTHETIC_UA) === false, "isCrawler() must NEVER refuse our own synthetic monitor's UA — its book-links scenario needs a real partner redirect");
ok(isSyntheticMonitor(SYNTHETIC_UA) === true, "isSyntheticMonitor() recognizes our own monitor's exact UA");
ok(isSyntheticMonitor(BOT_UA) === false, "isSyntheticMonitor() does not falsely match an unrelated bot UA");
ok(isSyntheticMonitor("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36") === false,
  "isSyntheticMonitor() does not falsely match a real desktop browser UA");

const analytics = await import(REPO + "lib/browserAnalytics.js");
ok(analytics.isKnownBot(SYNTHETIC_UA) === true, "browserAnalytics.isKnownBot() classifies our own synthetic monitor as non-human, so its rendered pages never emit client-side events");

/* ── captureServer, CALLED directly: zero requests for the monitor's UA ────── */
{
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true }; };
  // WRITE and DELETE only, never a read-to-restore (scripts/check-guard-
  // hermeticity.mjs's rule): this process exits right after this guard runs,
  // same as scripts/check-provider-redirects.mjs, so there is nothing to
  // restore and nothing ambient ever decides the verdict.
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_guardtest_not_a_real_key";
  delete process.env.WF_SUPPRESS_ANALYTICS;
  try {
    const { captureServer } = await import(REPO + "lib/serverEvents.js");
    const headersWith = (ua) => ({ get: (name) => (String(name).toLowerCase() === "user-agent" ? ua : null) });

    calls = 0;
    await captureServer("provider_redirect_started", { distinctId: "d1", properties: { a: 1 }, headers: headersWith(SYNTHETIC_UA) });
    ok(calls === 0, `captureServer must issue ZERO requests for our synthetic monitor's UA (issued ${calls}) — this is what "no human counts" means for the /go events its own hits produce`);

    // Negative control: without it, "0" above is equally consistent with
    // captureServer being broken and never sending anything to anyone.
    calls = 0;
    await captureServer("provider_redirect_started", { distinctId: "d1", properties: { a: 1 }, headers: headersWith("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36") });
    ok(calls === 1, `PROBE BROKEN: an ordinary UA must issue exactly ONE request (issued ${calls}) — if this is 0, the zero above proves nothing`);

    calls = 0;
    await captureServer("provider_redirect_started", { distinctId: "d1", properties: { a: 1 }, headers: headersWith(null) });
    ok(calls === 1, "captureServer with NO user-agent header still emits (a missing UA is a privacy-hardened human far more often than a bot, and must not be silently dropped)");
  } finally {
    globalThis.fetch = realFetch;
  }
}

/* ── 3, 4: per-route, CALLED, with the real PostHog capture intercepted ──────
   Same technique as scripts/check-provider-redirects.mjs: fetch to
   us.i.posthog.com/capture/ is intercepted so the assertion can inspect the
   payload, and WF_SUPPRESS_ANALYTICS is deliberately NOT set — this guard's
   entire point is proving what DOES and does NOT get captured. */
{
  const captured = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("us.i.posthog.com/capture/")) {
      try { captured.push(JSON.parse((init && init.body) || "{}")); } catch {}
      return { ok: true, status: 200 };
    }
    return realFetch(url, init);
  };
  // WRITE and DELETE only — see the identical note on the block above.
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_guardtest_not_a_real_key";
  delete process.env.WF_SUPPRESS_ANALYTICS;

  const headersFrom = (ua) => ({ get: (name) => (String(name).toLowerCase() === "user-agent" ? ua : null) });
  const call = async (rel, ua) => {
    const before = captured.length;
    const { GET } = await import(REPO + rel);
    const url = `http://localhost:3000/${rel.replace(/^app\//, "").replace(/\/route\.js$/, "")}?${FIXTURES[rel].query}`;
    const res = await GET({ url, headers: headersFrom(ua) });
    return { res, events: captured.slice(before) };
  };

  try {
    for (const rel of DISCOVERED) {
      const fx = FIXTURES[rel];

      // Bot UA: refused, and refused SPECIFICALLY as a crawler.
      const bot = await call(rel, BOT_UA);
      ok(bot.res.status >= 300 && bot.res.status < 400, `${rel} (bot UA) still returns a redirect (never a hang/500)`);
      const botEvent = bot.events.find((e) => e.event === "provider_redirect_failed");
      ok(!!botEvent, `${rel} (bot UA) emits provider_redirect_failed (got: ${bot.events.map((e) => e.event).join(", ") || "none"})`);
      ok(botEvent && botEvent.properties && botEvent.properties.failure_reason === "crawler-refused",
        `${rel} (bot UA) failure_reason is "crawler-refused" (got: ${botEvent && botEvent.properties && botEvent.properties.failure_reason})`);
      if (fx.successHostSubstr) {
        const loc = bot.res.headers && (bot.res.headers.get ? bot.res.headers.get("location") : bot.res.headers.location);
        ok(!loc || !loc.includes(fx.successHostSubstr),
          `${rel} (bot UA), with OTHERWISE-VALID params, must NOT reach the partner host (a bot that gets the real redirect is the leak this guard exists to close). Location: ${loc}`);
      }

      // Synthetic monitor UA: never refused as a crawler, and — where the
      // fixture is otherwise-valid — actually reaches the real partner host.
      const synth = await call(rel, SYNTHETIC_UA);
      ok(synth.res.status >= 300 && synth.res.status < 400, `${rel} (synthetic monitor UA) still returns a redirect`);
      ok(synth.events.length === 0,
        `${rel} (synthetic monitor UA) must capture NOTHING — no human count and no bot count, it simply never happened analytically (captured: ${synth.events.map((e) => e.event).join(", ")})`);
      if (fx.successHostSubstr) {
        const loc = synth.res.headers && (synth.res.headers.get ? synth.res.headers.get("location") : synth.res.headers.location);
        ok(!!loc && loc.includes(fx.successHostSubstr),
          `${rel} (synthetic monitor UA) reaches the REAL partner host ${fx.successHostSubstr} — the redirect keeps working, exactly as its own book-links scenario requires (got Location: ${loc})`);
      }
    }
  } finally {
    globalThis.fetch = realFetch;
  }
}

if (fail.length) {
  console.error("check-go-routes-crawler-gate: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-go-routes-crawler-gate: OK — ${pass} assertions across ${DISCOVERED.length} discovered go routes (${DISCOVERED.join(", ")}); bot UA refused before spend/fetch, synthetic monitor UA gets a real redirect and zero captures`);
