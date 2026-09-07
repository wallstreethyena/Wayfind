// scripts/test-autocomplete-proxy.mjs — locks the 2026-07-25 fix: the search
// box's autocomplete + suggestion-detail calls must go through OUR guarded
// server routes, not straight to Google from the browser. The autocomplete
// checks execute the real route body with fixture gate/ledger/provider fetches.
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (c, m) => { if (!c) { console.error("test-autocomplete-proxy: FAIL — " + m); fails++; } };

// ── both proxy routes exist ───────────────────────────────────────────────
const acRoutePath = join(ROOT, "app/api/places/autocomplete/route.js");
const detRoutePath = join(ROOT, "app/api/places/details/route.js");
ok(existsSync(acRoutePath), "app/api/places/autocomplete/route.js exists");
ok(existsSync(detRoutePath), "app/api/places/details/route.js exists");

if (existsSync(acRoutePath)) {
  const ac = readFileSync(acRoutePath, "utf8");
  ok(/GOOGLE_MAPS_SERVER_KEY/.test(ac), "autocomplete route uses the server key (not the public referrer-restricted key)");
  ok(/places:autocomplete/.test(ac), "autocomplete route calls the Places (New) autocomplete endpoint");
  ok(/status:\s*501/.test(ac), "autocomplete route fails soft (501) when the server key is missing");
  ok(/autocomplete_unavailable/.test(ac) && /status:\s*503/.test(ac), "autocomplete spend denial is an explicit 503 diagnostic");
  ok(/Cache-Control.*no-store/.test(ac), "autocomplete spend denial is not cacheable");
}
if (existsSync(detRoutePath)) {
  const det = readFileSync(detRoutePath, "utf8");
  ok(/GOOGLE_MAPS_SERVER_KEY/.test(det), "details route uses the server key");
  ok(/X-Goog-FieldMask/.test(det), "details route sets an explicit FieldMask (fixed tier, not client-supplied)");
  ok(/status:\s*501/.test(det), "details route fails soft (501) when the server key is missing");
}

// ── middleware guards both routes with the FULL same-origin + rate-limit gate
// (neither is a GET-302 nav nor an <img>-loaded proxy, so neither belongs in
// NAV_302_ROUTES / IMAGE_ROUTES — a same-origin XHR from the search box, just
// like /api/places/search) ──────────────────────────────────────────────────
const mw = readFileSync(join(ROOT, "middleware.js"), "utf8");
ok(/"\/api\/places\/autocomplete"/.test(mw), "middleware matcher includes /api/places/autocomplete");
ok(/"\/api\/places\/details"/.test(mw), "middleware matcher includes /api/places/details");
ok(!/NAV_302_ROUTES[\s\S]{0,200}places\/autocomplete/.test(mw), "/api/places/autocomplete is NOT rate-limit-only (full guard)");
ok(!/NAV_302_ROUTES[\s\S]{0,200}places\/details/.test(mw), "/api/places/details is NOT rate-limit-only (full guard)");

// ── the client calls the proxy routes, not Google, as its PRIMARY path ──────
const home = readFileSync(join(ROOT, "app/home.js"), "utf8");
ok(/fetch\("\/api\/places\/autocomplete"/.test(home), "home.js fetchSuggestions calls the guarded autocomplete proxy");
ok(/fetch\("\/api\/places\/details"/.test(home), "home.js resolvePlaceDetails calls the guarded details proxy");
ok(!/fetchSuggestionsDirect|resolvePlaceDetailsDirect|importLibrary\("places"\)/.test(home), "home.js contains no direct-to-Google fallback");
// Photos from the proxied path must route through OUR /api/photo proxy, never
// straight at Google (the same key-exposure gap /api/photo's own header
// describes fixing for card images).
ok(/photoUrlFor[\s\S]{0,400}\/api\/photo\?ref=/.test(home), "picked-suggestion photos build URLs through /api/photo, not Google directly");

// ── execute the real autocomplete handler with hermetic dependencies ───────
async function sourceModule(path, prelude) {
  let source = readFileSync(path, "utf8");
  source = source.replace(/^import[^;]+;\n/gm, "");
  return import("data:text/javascript," + encodeURIComponent(prelude + "\n" + source));
}

const route = await sourceModule(acRoutePath, `
  const NextResponse = { json(value, init = {}) {
    return new Response(JSON.stringify(value), { status: init.status || 200, headers: init.headers });
  } };
  const { gateShut, autocompleteCap } = await import(${JSON.stringify(new URL("../lib/spendGate.js", import.meta.url).href)});
  const spendAllowCapped = async (sku, cap) => {
    if (!cap) return false;
    const r = await fetch("https://ledger.test/rest/v1/rpc/wf_spend_take", { method: "POST", body: JSON.stringify({ p_sku: sku, p_cap: cap }) });
    return r.ok && (await r.json()) === true;
  };
`);

const savedFetch = globalThis.fetch;
const restore = () => {
  delete process.env.WAYFIND_GATE;
  delete process.env.AUTOCOMPLETE_MONTH_CAP;
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  globalThis.fetch = savedFetch;
};
const call = () => route.POST(new Request("https://wayfind.test/api/places/autocomplete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: "parks" }) }));
const json = async (response) => ({ response, body: await response.json() });
const assertDenied = async (responsePromise, reason, label) => {
  const { response, body } = await json(await responsePromise);
  ok(response.status === 503, `${label} returns 503`);
  ok(body.error === "autocomplete_unavailable" && body.reason === reason, `${label} exposes reason ${reason}`);
  ok(response.headers.get("cache-control") === "no-store", `${label} is Cache-Control: no-store`);
};
try {
  // Establish a hermetic baseline before the first request. A configured
  // workstation/Vercel-like ambient key must not turn the missing-key proof
  // into a provider-enabled case.
  delete process.env.WAYFIND_GATE;
  delete process.env.AUTOCOMPLETE_MONTH_CAP;
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  let providerFetches = 0;
  globalThis.fetch = async (url) => { providerFetches++; throw new Error("paid provider reached"); };
  process.env.WAYFIND_GATE = "open";
  process.env.AUTOCOMPLETE_MONTH_CAP = "7";
  let missingKey = await call();
  ok(missingKey.status === 501, "missing server key preserves the 501 setup contract");
  ok((await missingKey.json()).error === "server key not configured", "missing server key names the setup error");
  process.env.GOOGLE_MAPS_SERVER_KEY = "fixture-key-not-real";
  delete process.env.WAYFIND_GATE;
  await assertDenied(call(), "gate_shut", "unset gate");
  ok(providerFetches === 0, "unset gate performs zero fetches");
  process.env.WAYFIND_GATE = "shut";
  await assertDenied(call(), "gate_shut", "shut gate");
  ok(providerFetches === 0, "shut gate performs zero fetches");
  process.env.WAYFIND_GATE = "enabled";
  await assertDenied(call(), "gate_shut", "malformed gate");
  ok(providerFetches === 0, "malformed gate performs zero fetches");
  process.env.WAYFIND_GATE = "free";
  delete process.env.AUTOCOMPLETE_MONTH_CAP;
  await assertDenied(call(), "missing_or_invalid_AUTOCOMPLETE_MONTH_CAP", "missing cap");
  ok(providerFetches === 0, "missing cap performs zero fetches");
  process.env.AUTOCOMPLETE_MONTH_CAP = "7.5";
  await assertDenied(call(), "missing_or_invalid_AUTOCOMPLETE_MONTH_CAP", "invalid cap");
  ok(providerFetches === 0, "invalid cap performs zero fetches");
  process.env.AUTOCOMPLETE_MONTH_CAP = "7";
  globalThis.fetch = async (url) => { if (String(url).includes("ledger.test")) return new Response("false", { status: 200 }); providerFetches++; throw new Error("paid provider reached"); };
  await assertDenied(call(), "monthly_cap_reached_or_ledger_unavailable", "ledger denial");
  ok(providerFetches === 0, "ledger denial performs zero paid fetches");
  globalThis.fetch = async (url) => { if (String(url).includes("ledger.test")) return new Response("true", { status: 200 }); providerFetches++; return new Response(JSON.stringify({ suggestions: [] }), { status: 200 }); };
  const response = await call();
  ok(response.status === 200 && providerFetches === 1, "ledger grant permits exactly one provider fetch");
  const body = await response.json();
  ok(Array.isArray(body.suggestions) && body.suggestions.length === 0, "a real empty upstream result remains a normal 200 empty list");
} finally { restore(); }

if (fails) process.exit(1);
console.log("test-autocomplete-proxy: OK — search box autocomplete + suggestion-detail are guarded server proxies with no browser fallback");
