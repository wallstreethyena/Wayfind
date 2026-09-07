// Gate: the paid-API guard allows legit same-origin browser calls and blocks
// curl/scrapers/cross-site, and the per-IP rate limiter trips on burst abuse.
import { isSameOrigin, rateLimitHit, RL_LIMIT, guardPaidRoute, isOperatorDiagnostic } from "../lib/apiGuard.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";

const H = (o) => ({ get: (k) => (k.toLowerCase() in o ? o[k.toLowerCase()] : null) });
let fails = 0;
const ok = (c, m) => { if (!c) { console.error("test-api-guard: FAIL — " + m); fails++; } };

// ── same-origin gate: allow real browser fetches ─────────────────────────────
ok(isSameOrigin(H({ "sec-fetch-site": "same-origin" })), "same-origin fetch allowed");
ok(isSameOrigin(H({ "sec-fetch-site": "same-site" })), "same-site fetch allowed");

// ── block curl / scrapers / cross-site ───────────────────────────────────────
ok(!isSameOrigin(H({ "sec-fetch-site": "cross-site" })), "cross-site blocked");
ok(!isSameOrigin(H({})), "no headers (curl) blocked");
ok(!isSameOrigin(H({ "sec-fetch-site": "none" })), "direct navigation (none) blocked");

// ── legacy fallback (no Sec-Fetch-Site): trust a same-origin Referer/Origin ───
ok(isSameOrigin(H({ referer: "https://www.gowayfind.com/food" })), "legacy: our referer allowed");
ok(isSameOrigin(H({ referer: "https://gowayfind.com/" })), "legacy: apex referer allowed");
ok(!isSameOrigin(H({ referer: "https://evil.example/x" })), "legacy: foreign referer blocked");
ok(!isSameOrigin(H({ referer: "https://notgowayfind.com/x" })), "legacy: look-alike domain blocked");
ok(isSameOrigin(H({ origin: "https://www.gowayfind.com" })), "legacy: our origin allowed");
ok(!isSameOrigin(H({ origin: "https://evil.example" })), "legacy: foreign origin blocked");

// ── per-IP rate limit ────────────────────────────────────────────────────────
const t0 = 1_000_000;
let tripped = false;
for (let i = 0; i < RL_LIMIT + 5; i++) if (rateLimitHit("1.2.3.4", t0)) tripped = true;
ok(tripped, "burst over the limit trips the rate limiter");
ok(!rateLimitHit("9.9.9.9", t0), "a different IP is unaffected by another IP's burst");
ok(!rateLimitHit("", t0), "unknown IP is not rate-limited (origin gate still applies)");

// ── the wrapper returns the right responses ──────────────────────────────────
const blocked = guardPaidRoute({ headers: H({ "sec-fetch-site": "cross-site" }) });
ok(blocked && blocked.status === 403, "guardPaidRoute → 403 for cross-site");
const passed = guardPaidRoute({ headers: H({ "sec-fetch-site": "same-origin", "x-forwarded-for": "5.5.5.5" }) });
ok(passed === null, "guardPaidRoute → null (proceed) for a same-origin call");
const internal = guardPaidRoute({ headers: H({ "x-wf-internal": "s3cret" }) }, { internalSecret: "s3cret" });
ok(internal === null, "internal secret bypasses the gate (for our SSR calls)");
const internalBad = guardPaidRoute({ headers: H({ "x-wf-internal": "wrong" }) }, { internalSecret: "s3cret" });
ok(internalBad && internalBad.status === 403, "wrong internal secret does NOT bypass");

// ── B2: rateLimitOnly — GET-302 NAVIGATIONS (e.g. /api/viator/go) skip the same-origin block but keep rate-limiting ──
const goNav = guardPaidRoute({ headers: H({ "sec-fetch-site": "none", "x-forwarded-for": "7.7.7.1" }) }, { rateLimitOnly: true });
ok(goNav === null, "rateLimitOnly: a direct/nav request (Sec-Fetch-Site none) is NOT 403'd (never breaks the redirect)");
const goCross = guardPaidRoute({ headers: H({ "sec-fetch-site": "cross-site", "x-forwarded-for": "7.7.7.2" }) }, { rateLimitOnly: true });
ok(goCross === null, "rateLimitOnly: skips the same-origin block (nav-safe)");
let goTripped = null;
for (let i = 0; i < RL_LIMIT + 5; i++) goTripped = guardPaidRoute({ headers: H({ "x-forwarded-for": "7.7.7.3" }) }, { rateLimitOnly: true });
ok(goTripped && goTripped.status === 429, "rateLimitOnly still 429s a burst from one IP (caps scrape abuse)");

// ── 2026-08-26: the /api/eats/* routes are GONE with Uber Eats (owner
// directive). The middleware must not carry dead matcher entries — a stale
// entry would silently re-guard a route someone re-adds under that name
// without a triage.
// ── B3: OPERATOR DIAGNOSTICS ARE REACHABLE (2026-09-06) ─────────────────────
// Two routes authenticate a NON-BROWSER operator with a Bearer CRON_SECRET, and
// both were unreachable: middleware matched the path, guardPaidRoute demanded
// browser-origin evidence, and curl was denied 403 "forbidden" BEFORE the
// route's own auth ran. Measured on production 2026-09-06 —
//   curl -H "Authorization: Bearer …" …/api/fsq/search?probe=1 -> 403 forbidden
//   the same request from a same-origin page               -> 401 unauthorized
// so the credential was never the obstacle. The instrument built to detect a
// provider outage could not be called, which is how such an outage hides.
//
// The repair recognises the request SHAPE, never the secret: middleware must
// not validate CRON_SECRET or the auth contract lives in two layers and drifts.
// These assertions CALL the real decision function and the real guard.
{
  const sp = (o) => ({ get: (k) => (k in o ? o[k] : null) });
  // The decision function itself, by call.
  ok(isOperatorDiagnostic("/api/fsq/search", sp({ probe: "1" })), "1. /api/fsq/search?probe=1 IS the operator-diagnostic shape");
  ok(isOperatorDiagnostic("/api/ta/place", sp({ probe: "2" })), "2. /api/ta/place?probe=2 IS the operator-diagnostic shape");
  ok(!isOperatorDiagnostic("/api/fsq/search", sp({ q: "coffee", lat: "27.3", lng: "-82.5" })), "3. an ORDINARY /api/fsq/search is NOT the diagnostic shape (stays fully guarded)");
  ok(!isOperatorDiagnostic("/api/ta/place", sp({ q: "ringling" })), "4. an ORDINARY /api/ta/place is NOT the diagnostic shape");
  ok(!isOperatorDiagnostic("/api/fsq/search", sp({ probe: "2" })), "…and the probe value is matched EXACTLY per path — fsq is probe=1, not any probe");
  ok(!isOperatorDiagnostic("/api/ta/place", sp({ probe: "1" })), "…ta's census is probe=2; its probe=1 is the unauthenticated hasKey ping and keeps the full guard");
  ok(!isOperatorDiagnostic("/api/places/details", sp({ probe: "1" })), "…and no OTHER matched route is opened by adding ?probe=1");
  ok(!isOperatorDiagnostic("/api/fsq/search", sp({})) && !isOperatorDiagnostic("/api/fsq/search", null), "…absent params and a null bag are refused, not treated as a diagnostic");

  // The guard's verdict for each shape, by call. curl sends no Sec-Fetch-Site,
  // Referer or Origin — that is exactly the header set that was being 403'd.
  const CURL = { "sec-fetch-site": "", "x-forwarded-for": "9.9.1.1" };
  const diagVerdict = guardPaidRoute({ headers: H({ ...CURL, "x-forwarded-for": "9.9.1.2" }) },
    { rateLimitOnly: isOperatorDiagnostic("/api/fsq/search", sp({ probe: "1" })) });
  ok(diagVerdict === null, "1b. curl-shaped GET /api/fsq/search?probe=1 is NOT middleware-403'd — it reaches the route");
  const taVerdict = guardPaidRoute({ headers: H({ ...CURL, "x-forwarded-for": "9.9.1.3" }) },
    { rateLimitOnly: isOperatorDiagnostic("/api/ta/place", sp({ probe: "2" })) });
  ok(taVerdict === null, "2b. curl-shaped GET /api/ta/place?probe=2 is NOT middleware-403'd");
  const ordinary = guardPaidRoute({ headers: H({ ...CURL, "x-forwarded-for": "9.9.1.4" }) },
    { rateLimitOnly: isOperatorDiagnostic("/api/fsq/search", sp({ q: "coffee" })) });
  ok(ordinary && ordinary.status === 403, `3b. curl-shaped ORDINARY /api/fsq/search?q=coffee is STILL 403 (got ${ordinary && ordinary.status})`);
  const ordinaryTa = guardPaidRoute({ headers: H({ ...CURL, "x-forwarded-for": "9.9.1.5" }) },
    { rateLimitOnly: isOperatorDiagnostic("/api/ta/place", sp({ q: "ringling" })) });
  ok(ordinaryTa && ordinaryTa.status === 403, `4b. curl-shaped ORDINARY /api/ta/place?q=… is STILL 403 (got ${ordinaryTa && ordinaryTa.status})`);
  const crossSite = guardPaidRoute({ headers: H({ "sec-fetch-site": "cross-site", "x-forwarded-for": "9.9.1.6" }) },
    { rateLimitOnly: isOperatorDiagnostic("/api/fsq/search", sp({ q: "coffee" })) });
  ok(crossSite && crossSite.status === 403, `5. a CROSS-SITE ordinary request is STILL 403 (got ${crossSite && crossSite.status}) — a scraper cannot use the general endpoint`);
  // 6. the diagnostic keeps the per-IP limiter: skipping same-origin is not a free pass.
  let diagBurst = null;
  for (let i = 0; i < RL_LIMIT + 5; i++) {
    diagBurst = guardPaidRoute({ headers: H({ ...CURL, "x-forwarded-for": "9.9.1.7" }) }, { rateLimitOnly: true });
  }
  ok(diagBurst && diagBurst.status === 429, `6. a diagnostic BURST from one IP still 429s (got ${diagBurst && diagBurst.status}) — rate limiting is kept, only the same-origin block is skipped`);

  // MIDDLEWARE WIRING, asserted on the CALL SITE's structure rather than on the
  // mere presence of the name: the decision must be OR'd into rateLimitOnly, not
  // imported and forgotten. (CLAUDE.md: assert the role, not the substring.)
  const mwSrc = readFileSync(new URL("../middleware.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  ok(/rateLimitOnly\s*=[\s\S]{0,220}isOperatorDiagnostic\s*\(/.test(mwSrc),
    "middleware folds isOperatorDiagnostic INTO the rateLimitOnly decision (not merely imported)");
  ok(!/CRON_SECRET/.test(mwSrc),
    "middleware does NOT reference CRON_SECRET — it recognises the request shape, never the credential, so the auth contract stays in ONE layer");
}

// ── B4: THE ROUTE STAYS THE ONLY AUTHORITY ON 401 vs SUCCESS ────────────────
// Reachability is only half the contract. The point of NOT teaching middleware
// the credential is that the ROUTE decides — so that is asserted by CALLING the
// real handler with a wrong token and a right one. Loaded through the repo's own
// harness (scripts/lib/jsxLoad.mjs) because a route imports next/server, which
// bare node cannot resolve; the harness supplies a REAL NextResponse built on
// Node's Response, not a shape mock, and compiles the REAL route file.
{
  const { loadComponent } = await import(new URL("./lib/jsxLoad.mjs", import.meta.url).href);
  const ROOT = fileURLToPath(new URL("..", import.meta.url));
  const SECRET = "fixture-cron-secret-not-a-real-value";
  const savedFetch = globalThis.fetch;
  // HERMETIC: the ambient shell is never READ. Both variables are SET to values
  // this file chooses and DELETED afterwards unconditionally, so the verdict is
  // identical in a clean terminal and in one with .env.production.local sourced
  // (check-guard-hermeticity.mjs — the 5c541b4 rule). Reading the real values to
  // "restore" them would be exactly the ambient dependency that rule forbids.
  process.env.CRON_SECRET = SECRET;
  process.env.FOURSQUARE_API_KEY = "fsqfixturekeynotreal";
  // The provider is never dialled: a stub returns a well-formed empty result so
  // the diagnostic reaches its own response builder without a network call.
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) });

  const mod = await loadComponent(fileURLToPath(new URL("../app/api/fsq/search/route.js", import.meta.url)), ROOT);
  ok(typeof mod.GET === "function", "the REAL /api/fsq/search GET handler is importable and callable");
  const callProbe = async (headers) => {
    const res = await mod.GET(new Request("https://wayfind.test/api/fsq/search?probe=1", { headers }));
    let body = null; try { body = await res.json(); } catch {}
    return { status: res.status, body };
  };

  const noTok = await callProbe({});
  ok(noTok.status === 401 && noTok.body && noTok.body.error === "unauthorized",
    `7. NO token reaches the route and gets 401 unauthorized, not 403 forbidden (got ${noTok.status} ${JSON.stringify(noTok.body)})`);
  const badTok = await callProbe({ authorization: "Bearer wrong-value" });
  ok(badTok.status === 401 && badTok.body && badTok.body.error === "unauthorized",
    `7b. a WRONG token also gets 401 from the route (got ${badTok.status})`);

  const goodTok = await callProbe({ authorization: "Bearer " + SECRET });
  ok(goodTok.status === 200, `8. a CORRECT token reaches the diagnostic code path (got ${goodTok.status})`);
  ok(goodTok.body && goodTok.body.hasKey === true && "upstreamStatus" in goodTok.body && "generation" in goodTok.body,
    `8b. …and the diagnostic payload comes back (keys: ${goodTok.body ? Object.keys(goodTok.body).join(",") : "none"})`);
  const serialised = JSON.stringify(goodTok.body || {});
  ok(!serialised.includes(SECRET) && !serialised.includes("fsqfixturekeynotreal"),
    "8c. …and it echoes NEITHER the operator secret NOR the provider key — a diagnostic that leaks its credential is worse than no diagnostic");

  // FAIL-CLOSED: an unset CRON_SECRET must not open the endpoint.
  delete process.env.CRON_SECRET;
  const noSecretConfigured = await callProbe({ authorization: "Bearer anything" });
  ok(noSecretConfigured.status === 401,
    `…and with NO CRON_SECRET configured at all the probe still refuses (got ${noSecretConfigured.status}) — fail-closed, never fail-open`);

  delete process.env.CRON_SECRET;
  delete process.env.FOURSQUARE_API_KEY;
  globalThis.fetch = savedFetch;
}

const mw = readFileSync(new URL("../middleware.js", import.meta.url), "utf8");
ok(!/"\/api\/eats\//.test(mw), "middleware carries NO /api/eats/* matcher entries (routes deleted 2026-08-26)");

// ── 2026-07-17 audit: the Viator proxies are guarded too ──
// /api/viator/tours = same-origin XHR hitting the metered Viator API + a
// service-role Supabase write → full guard. /api/viator/go = GET-302 nav → rate-
// limit only (GET-302 nav). Both were completely unguarded before.
ok(/"\/api\/viator\/tours"/.test(mw), "middleware matcher includes /api/viator/tours (full guard)");
ok(/"\/api\/viator\/go"/.test(mw), "middleware matcher includes /api/viator/go");
ok(/NAV_302_ROUTES[\s\S]*\/api\/viator\/go/.test(mw), "middleware treats /api/viator/go as a rate-limit-only GET-302 nav route");

// Curator Boost: /api/signals/likes is a same-origin XHR reading likes/events via
// service-role → full guard (no SSR caller).
ok(/"\/api\/signals\/likes"/.test(mw), "middleware matcher includes /api/signals/likes (full guard)");

if (fails) { console.error(`test-api-guard: ${fails} failure(s)`); process.exit(1); }
console.log("test-api-guard: OK — same-origin gate allows real browsers + blocks scrapers/cross-site; per-IP rate limit trips on burst; internal-secret bypass works; viator proxies guarded (go routes=rate-limit-only); eats routes verified deleted");
