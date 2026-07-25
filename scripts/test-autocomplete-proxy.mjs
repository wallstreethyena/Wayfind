// scripts/test-autocomplete-proxy.mjs — locks the 2026-07-25 fix: the search
// box's autocomplete + suggestion-detail calls must go through OUR guarded
// server routes, not straight to Google from the browser. Static/source-level
// checks only (no live Google/network calls) — mirrors the style of
// test-api-guard.mjs and check-metered-matcher.mjs.
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
ok(/fetchSuggestionsDirect/.test(home), "the direct-to-Google SDK path still exists as a dev/local fallback (server key unset)");
// Photos from the proxied path must route through OUR /api/photo proxy, never
// straight at Google (the same key-exposure gap /api/photo's own header
// describes fixing for card images).
ok(/photoUrlFor[\s\S]{0,400}\/api\/photo\?ref=/.test(home), "picked-suggestion photos build URLs through /api/photo, not Google directly");

if (fails) process.exit(1);
console.log("test-autocomplete-proxy: OK — search box autocomplete + suggestion-detail are guarded server proxies with a dev-only fallback");
