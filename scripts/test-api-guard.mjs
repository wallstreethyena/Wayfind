// Gate: the paid-API guard allows legit same-origin browser calls and blocks
// curl/scrapers/cross-site, and the per-IP rate limiter trips on burst abuse.
import { isSameOrigin, rateLimitHit, RL_LIMIT, guardPaidRoute } from "../lib/apiGuard.js";

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

if (fails) { console.error(`test-api-guard: ${fails} failure(s)`); process.exit(1); }
console.log("test-api-guard: OK — same-origin gate allows real browsers + blocks scrapers/cross-site; per-IP rate limit trips on burst; internal-secret bypass works");
