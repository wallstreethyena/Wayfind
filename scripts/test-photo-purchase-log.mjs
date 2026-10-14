#!/usr/bin/env node
// scripts/test-photo-purchase-log.mjs — hermetic lock for lib/photoPurchaseLog.js
// (wf_photo_purchase, 2026-10-15, observe-only): the stored row carries ONLY the
// allowed keys (no raw IP/UA/ref/URL/key), the bucket hash does not link across
// UTC days, the writer is fail-soft (never throws), and app/api/photo/route.js
// calls it only inside `!probe` and only for the three paid-decision reasons.
//
// HERMETIC: no network, no process.env read that decides a verdict (env is
// injected). CALL-based for behaviour; the route check is a labelled structural
// check on comment-stripped source.
import { readFileSync } from "node:fs";
import { recordPhotoPurchase, uaClass, bucketHash, idempotencyKey, PURCHASE_ROW_KEYS } from "../lib/photoPurchaseLog.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const KEY = "svc-key-SECRET-123";
const ENV = { VERCEL_ENV: "production", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: KEY, VERCEL_DEPLOYMENT_ID: "dpl_abc" };
const IP = "203.0.113.77";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const D1 = Date.UTC(2026, 9, 14, 12), D2 = Date.UTC(2026, 9, 15, 12);

// 1. posted body: exact keys, no leaks
const bucket = bucketHash({ ip: IP, ua: UA, now: D1, env: ENV });
const calls = [];
const good = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 201 }; };
const res = await recordPhotoPurchase({
  placeId: "ChIJabc", surface: "card", requestId: "iad1::abc", idempotencyKey: idempotencyKey({ placeId: "ChIJabc", surface: "card", bucket, now: D1 }),
  ledgerReason: "granted", upstream: "ok", retried: false, refunded: 0, bucketHash: bucket, uaClass: uaClass(UA), sfs: "same-origin",
  // hostile extras must be dropped
  ip: IP, ua: UA, ref: "places/ChIJabc/photos/AAA", url: "https://places.googleapis.com/v1/x?key=zzz", key: KEY,
}, { fetchImpl: good, env: ENV });
ok(res === true, "resolves true on a 201");
ok(calls.length === 1 && calls[0].url === "https://x.supabase.co/rest/v1/wf_photo_purchase", "POSTs to /rest/v1/wf_photo_purchase");
const bodyStr = calls[0]?.init?.body || "";
const body = JSON.parse(bodyStr || "{}");
ok(JSON.stringify(Object.keys(body).sort()) === JSON.stringify([...PURCHASE_ROW_KEYS].sort()), "body has exactly the allowed keys: " + Object.keys(body));
ok(body.env === "production" && body.deployment_id === "dpl_abc" && body.ua_class === "ios-safari", "env/deployment/ua_class populated");
for (const bad of [IP, "Mozilla", "https://", "places/", "photos/", KEY, "key=", "googleapis"]) ok(!bodyStr.includes(bad), "body must not contain " + bad);
ok(calls[0].init.headers.Authorization === "Bearer " + KEY, "uses the service role (header only)");

// 2. bucket hash: day-salted
const h1a = bucketHash({ ip: IP, ua: UA, now: D1, env: ENV });
const h1b = bucketHash({ ip: IP, ua: UA, now: D1 + 3600e3, env: ENV });
const h2 = bucketHash({ ip: IP, ua: UA, now: D2, env: ENV });
ok(h1a === h1b && /^[0-9a-f]{32}$/.test(h1a), "same day, same hash (32 hex)");
ok(h1a !== h2, "same ip on a different UTC day hashes differently");
ok(bucketHash({ ip: IP, ua: UA, now: D1, env: {} }) === null, "no service key -> null");
ok(idempotencyKey({ placeId: "p", surface: "card", bucket: "b", now: 20000 }) === idempotencyKey({ placeId: "p", surface: "card", bucket: "b", now: 29999 }), "idempotency key stable within 10s");
ok(idempotencyKey({ placeId: "p", surface: "card", bucket: "b", now: 20000 }) !== idempotencyKey({ placeId: "p", surface: "card", bucket: "b", now: 30000 }), "idempotency key changes across 10s windows");

// 3. fail-soft
const f = { placeId: "ChIJabc", surface: "detail" };
ok(await recordPhotoPurchase(f, { fetchImpl: async () => ({ ok: false, status: 500 }), env: ENV }) === false, "false on injected 500");
ok(await recordPhotoPurchase(f, { fetchImpl: async () => { throw new Error("boom"); }, env: ENV }) === false, "false on throw");
const t0 = Date.now();
ok(await recordPhotoPurchase(f, { fetchImpl: (u, i) => new Promise((_, rej) => i.signal.addEventListener("abort", () => rej(new Error("aborted")))), env: ENV }) === false, "false on abort timeout");
ok(Date.now() - t0 < 2000, "abort fires near 400ms");
ok(await recordPhotoPurchase(null, { fetchImpl: good, env: ENV }) === false, "null fields -> false, no throw");

// 4. preview / dev no-op
const before = calls.length;
ok(await recordPhotoPurchase(f, { fetchImpl: good, env: { ...ENV, VERCEL_ENV: "preview" } }) === false, "preview no-op");
ok(await recordPhotoPurchase(f, { fetchImpl: good, env: { ...ENV, VERCEL_ENV: "" } }) === false, "dev no-op");
ok(calls.length === before, "no fetch in preview/dev");

// 5. uaClass
const U = {
  "ios-safari": UA,
  "android-chrome": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  "desktop-chrome": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "desktop-safari": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  other: "curl/8.0",
};
for (const [want, ua] of Object.entries(U)) ok(uaClass(ua) === want, `uaClass ${want} got ${uaClass(ua)}`);
ok(uaClass("") === "other" && uaClass(undefined) === "other", "uaClass empty -> other");

// 6. structural: no spend gate import; route scoping (comments stripped)
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const lib = readFileSync(new URL("../lib/photoPurchaseLog.js", import.meta.url), "utf8");
const self = readFileSync(new URL(import.meta.url), "utf8");
const SG = "spend" + "Gate";
ok(!stripComments(lib).includes(SG) && !lib.includes(SG), "lib/photoPurchaseLog.js never mentions " + SG);
ok(!self.includes(SG), "this test never mentions " + SG);

const route = stripComments(readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8"));
const callRx = /recordPhotoPurchase\(/g;
const calls_ = [...route.matchAll(callRx)];
ok(calls_.length === 1, "route calls recordPhotoPurchase exactly once, got " + calls_.length);
const at = calls_[0]?.index ?? -1;
const probeAt = route.indexOf("if (!probe) {");
ok(probeAt > -1 && at > probeAt, "call comes after the `if (!probe) {` block opens");
// the block must still be open at the call: balance braces between probeAt and at
const seg = route.slice(probeAt, at);
let depth = 0; let minDepth = 0;
for (const c of seg) { if (c === "{") depth++; else if (c === "}") { depth--; minDepth = Math.min(minDepth, depth); } }
ok(depth >= 1 && minDepth >= 0, "recordPhotoPurchase is lexically inside the !probe block");
const guardM = route.slice(probeAt, at).match(/if \(([^)]*"google"[^\n]*)\) \{\s*try \{[\s\S]*$/);
ok(!!guardM && /"google"/.test(guardM[1]) && /"owned-miss"/.test(guardM[1]) && /"spend-denied"/.test(guardM[1]), "call is gated on google/owned-miss/spend-denied");
ok(guardM && (guardM[1].match(/result\.reason === "/g) || []).length === 3, "gate names exactly the three reasons");

if (fail.length) { console.error("test-photo-purchase-log FAILED:\n - " + fail.join("\n - ")); process.exit(1); }
console.log(`test-photo-purchase-log: OK — ${pass} assertions (row keys, no-leak body, day-salted hash, fail-soft 500/throw/abort, preview/dev no-op, uaClass, route !probe scoping).`);
