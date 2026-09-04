// check-cache-refresh — the v6.35 "keep every card hot" contract.
//
// FIXED 2026-09-04 (guard-honesty audit). The previous version was 100%
// readFileSync + regex: it proved the SOURCE mentions a gate check, a
// de-dupe window, a key formula — never that the WORKER actually executes.
// That is CLAUDE.md's "pure-function proof of a mechanism that may not
// run" disease: test-cache-refresh.mjs pins refreshAgeFor/refreshDue (real
// math, real returns) and this file pinned the surrounding source text, and
// between the two nothing ever CALLED the route. The refresh worker has
// returned `skipped` in production since 2026-08-25 (WAYFIND_GATE flipped
// for the FREE-MODE cost lockdown — see CLAUDE.md lesson #1) and both
// guards stayed green throughout, because neither one runs the code that
// decides `skipped` vs "did the work".
//
// So sections 1-3 below now DRIVE THE REAL ROUTE HANDLER with real Request
// objects (CLAUDE.md: "assert on the CALL, not the string" — the same
// pattern as check-commerce-redirect.mjs) and read its actual JSON body.
// Every branch that can be reached WITHOUT a live Google fetch is now
// exercised for real: a broken import, a renamed export, an accidentally
// swapped condition, or the exact env-gate silently short-circuiting the
// worker (the 2026-08-25 incident) all now fail THIS guard, not just prod.
//
// Section 4 (cache-key / field-mask parity across the two routes) stays a
// source comparison — those are literal-string duplication invariants with
// no live-Google-free way to execute them — so it is explicitly tagged.
// // STRUCTURAL-ONLY: key formula + field mask are compared as literal
// // strings because exercising them for real requires a live Google
// // searchText call, which this guard must not make (spend + secrets).
import { readFileSync } from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

let pass = 0;
const fail = (m) => { console.error("check-cache-refresh: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };
const read = (p) => { try { return readFileSync(new URL(p, import.meta.url), "utf8"); } catch { fail("missing protected file: " + p); } };

const cache = read("../lib/serverCache.js");
const search = read("../app/api/places/search/route.js");
const refresh = read("../app/api/places/refresh/route.js");

// ── 1. The jitter engine + its ToS-critical bound (pure functions — CALL) ────
const { refreshAgeFor, refreshDue, REFRESH_MAX_MS, DAY } = await loadComponent(path.join(ROOT, "lib/serverCache.js"), ROOT);
ok(typeof refreshAgeFor === "function" && typeof refreshDue === "function",
   "serverCache exports refreshAgeFor()/refreshDue() as callables (not just declared in source)");
ok(REFRESH_MAX_MS < 30 * DAY, `REFRESH_MAX_MS (${(REFRESH_MAX_MS / DAY).toFixed(1)}d) MUST stay < 30 days — that is what guarantees a card refreshes BEFORE its 30-day expiry`);
ok(REFRESH_MAX_MS >= 20 * DAY, `REFRESH_MAX_MS (${(REFRESH_MAX_MS / DAY).toFixed(1)}d) dropped below the 20-day floor — refreshes would fire needlessly early`);
if (!/due:\s*refreshDue\(/.test(cache)) fail("cget no longer surfaces `due` (refreshDue) — the read path can't trigger refresh-ahead");

// ── 2. The read path pokes a refresh — and NEVER blocks the user on it ───────
// (still source-checked: pokeRefresh is a private, unexported function, and
// the property under test — "never awaited" — is an absence you can't prove
// by calling it once. Kept, not weakened.)
if (!/function pokeRefresh\(/.test(search)) fail("pokeRefresh() helper is missing from the search route");
if (!/if \(fresh\.due\) pokeRefresh\(/.test(search)) fail("search route no longer pokes a refresh on a due cache hit — the day-31 cliff is back");
if (/await\s+pokeRefresh/.test(search)) fail("pokeRefresh is AWAITED — a refresh must never block/slow the user's response");
if (!/fetch\(u,/.test(search) || !/\.catch\(\(\) => \{\}\)/.test(search)) fail("the refresh poke's fetch is not fire-and-forget (must be `fetch(u, …).catch(() => {})`, never awaited)");
if (!/REFRESH_FIRED/.test(search)) fail("the per-key poke throttle (REFRESH_FIRED) is gone — a burst could stampede the refresh worker");

// ── 3. THE ACTUAL WORKER, DRIVEN FOR REAL. No live Google fetch is reached on
// any of these branches, so no spend and no secret is needed — but a broken
// import, a thrown exception, a renamed field, or (the 2026-08-25 incident) a
// gate silently swallowing every invocation are ALL caught here, because the
// route is loaded and its exported GET is actually called with a real Request
// and its actual JSON body is read — never assumed from source.
const mod = await loadComponent(path.join(ROOT, "app/api/places/refresh/route.js"), ROOT);
ok(typeof mod.GET === "function", "app/api/places/refresh/route.js exports a real GET handler (not just declared — this import would throw on a broken extraction, the #486 disease)");

const savedGate = process.env.WAYFIND_GATE;
const savedKey = process.env.GOOGLE_MAPS_SERVER_KEY;
const call = (qs) => mod.GET(new Request("https://wayfind.test/api/places/refresh?" + qs));
const body = async (qs) => { const r = await call(qs); return { status: r.status, json: await r.json() }; };

try {
  // 3a. GATE SHUT — must short-circuit BEFORE touching the cache/Google, and
  // that short-circuit must be VISIBLE in the response (not a silent no-op).
  process.env.WAYFIND_GATE = "shut";
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  { const { json } = await body("q=coffee&lat=27.9&lng=-82.5");
    ok(!!json.skipped, `WAYFIND_GATE=shut must return a visible {skipped:...} (got ${JSON.stringify(json)}) — this is the EXACT shape that has gone unseen in prod since 2026-08-25 because pokeRefresh's fetch is fire-and-forget; asserting the shape here is the only place left that looks at it`);
    ok(/gate/i.test(String(json.skipped)), "the skipped reason names the gate as the cause, not a generic failure");
  }

  // 3b. GATE FREE — same short-circuit, different reason string.
  process.env.WAYFIND_GATE = "free";
  { const { json } = await body("q=coffee&lat=27.9&lng=-82.5");
    ok(!!json.skipped, `WAYFIND_GATE=free must also return {skipped:...} (got ${JSON.stringify(json)})`);
  }

  // 3c. GATE OPEN (unset — the CI/default state) — the worker MUST run past
  // the gate and reach real logic. Proven by giving it no server key: if the
  // gate silently ate this request too, the response would be the SAME
  // {skipped} shape as 3a/3b. It is not — it is a DIFFERENT, later failure,
  // which is only possible if execution actually passed the gate check.
  delete process.env.WAYFIND_GATE;
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  { const { json } = await body("q=coffee&lat=27.9&lng=-82.5");
    ok(json.reason === "no server key" && !json.skipped,
       `gate OPEN must reach past the gate check into real logic (got ${JSON.stringify(json)}) — a {skipped} here would mean the gate silently ate an open-mode request too`);
  }

  // 3d. Bad params — reached only if the handler actually parses the query.
  process.env.GOOGLE_MAPS_SERVER_KEY = "test-key-not-real";
  { const { json } = await body("q=&lat=27.9&lng=-82.5");
    ok(json.ok === false && json.reason === "bad params", `empty q must be rejected as bad params (got ${JSON.stringify(json)})`);
  }

  // 3e. Key-consistency guard — proves the worker recomputes the key from
  // params and compares it to the caller-supplied `k`, rejecting a mismatch.
  // This is the guard against being weaponized to target an arbitrary row.
  { const { json } = await body("q=coffee&lat=27.9&lng=-82.5&k=not-the-real-key");
    ok(json.ok === false && json.reason === "key mismatch", `a k= that doesn't match the recomputed key must be refused (got ${JSON.stringify(json)}) — otherwise a poke could target ANY cache row`);
  }

  // POSITIVE CONTROL for 3e: prove this guard's own key really does match
  // when built the way the worker builds it (v1|q.toLowerCase()|lat.toFixed(2)|...),
  // so "key mismatch" above is known to be reachable and not a permanent trap.
  const realKey = ["v1", "coffee", (27.9).toFixed(2), (-82.5).toFixed(2), Math.round(24000 / 1000), 20].join("|");
  { const { json } = await body(`q=coffee&lat=27.9&lng=-82.5&k=${encodeURIComponent(realKey)}`);
    ok(json.reason !== "key mismatch", `positive control: a correctly-built key is NOT rejected as a mismatch (got ${JSON.stringify(json)}) — proves 3e's rejection means something`);
  }
} finally {
  if (savedGate === undefined) delete process.env.WAYFIND_GATE; else process.env.WAYFIND_GATE = savedGate;
  if (savedKey === undefined) delete process.env.GOOGLE_MAPS_SERVER_KEY; else process.env.GOOGLE_MAPS_SERVER_KEY = savedKey;
}

if (!/const cur = await cget\(/.test(refresh)) fail("refresh worker no longer checks the existing entry first — it could fetch ARBITRARY new queries");
if (!/MIN_GAP_MS/.test(refresh)) fail("refresh worker lost its de-dupe window (MIN_GAP_MS) — a poke burst could spike Google spend");

// ── 4. The two routes MUST build the SAME cache key + request the SAME fields ─
// STRUCTURAL-ONLY: exercising this for real needs a live Google searchText
// call (spend + a real server key), which this guard must not make. Compared
// as literal strings instead — weaker, and said so here rather than reading
// as proof.
const KEYSIG = '"v1", q.toLowerCase(), lat.toFixed(2), lng.toFixed(2), Math.round(radius / 1000), n';
if (!search.includes(KEYSIG)) fail("search route cache-key formula changed — update the refresh worker to match");
if (!refresh.includes(KEYSIG)) fail("refresh worker cache-key formula drifted from the search route (would refresh the wrong entry)");
for (const field of ["places.regularOpeningHours", "places.photos", "places.businessStatus", "places.priceLevel"]) {
  if (!refresh.includes(field)) fail("refresh worker field mask drifted from the search route (missing " + field + ")");
}

console.log(`check-cache-refresh: OK — ${pass} live-call assertions + source checks (worker actually driven under shut/free/open, key-mismatch refused+controlled, jitter <30d, key/mask parity)`);
