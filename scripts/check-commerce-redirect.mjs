#!/usr/bin/env node
/**
 * check-commerce-redirect — /api/commerce/go behaves, proven by CALLING it.
 *
 * WHY THIS GUARD EXISTS
 * #469 shipped lib/commerce.js with `commerceHref()` returning "/api/commerce/go",
 * and that route did not exist. Every link built the documented way would have
 * 404'd. The event layer's own guard could not catch it: it asserted the STRING
 * commerceHref returns, which was correct, while the path it named was dead.
 *
 * So this guard does not grep. It imports the real modules and invokes them —
 * CLAUDE.md, "assert on the CALL, not on the string" — including driving the
 * actual route handler with real Request objects and reading the real Response.
 *
 * The properties under lock:
 *   1. the route exists and the path commerceHref() names actually resolves to it
 *   2. a destination is NEVER taken from the request (no open redirect)
 *   3. only allowlisted hosts, http(s) only
 *   4. every failure is fail-soft: 302 to OUR site, never a 500, never a partner
 *   5. the redirect is never cacheable (a cached 302 shares one click_id)
 *   6. WeGoTrip/Klook stay dark (verified 2026-07-30: no FL food inventory)
 */
import { existsSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// ── 1. the path commerceHref names is the path that exists ────────────────
const { commerceHref } = await import("../lib/commerce.js");
const href = commerceHref({ provider: "viator", offerId: "abc", surface: "cuisine" });
ok(!!href, "commerceHref returned a path to check (a null here would make every assertion below vacuous)");
const routePath = String(href || "").split("?")[0];
ok(routePath === "/api/commerce/go", `commerceHref points at /api/commerce/go (got ${routePath})`);
// The whole point: the named path must correspond to a real route module.
const routeFile = path.resolve("app" + routePath + "/route.js");
ok(existsSync(routeFile),
  `${routePath} has a route module on disk — this is the exact check whose absence let #469 ship a money link to a 404`);

// ── 2/3. host allowlist, proven by calling isAllowedHost ──────────────────
const { isAllowedHost, PROVIDERS, FALLBACK, resolveOffer } = await import("../lib/commerceProviders.js");
const viatorHosts = PROVIDERS.viator.hosts;
ok(isAllowedHost("https://www.viator.com/tours/x", viatorHosts), "a real viator.com URL is allowed");
ok(isAllowedHost("https://viator.com/x", viatorHosts), "the apex domain is allowed");
ok(!isAllowedHost("https://evil.com/x", viatorHosts), "an unrelated host is refused");
// The classic allowlist bypasses. Each of these contains "viator.com" as a substring.
ok(!isAllowedHost("https://viator.com.evil.com/x", viatorHosts),
  "a suffix-attack host (viator.com.evil.com) is refused — the regex is anchored to the hostname end");
ok(!isAllowedHost("https://evil.com/?u=viator.com", viatorHosts),
  "viator.com appearing in the QUERY does not make a host allowed");
ok(!isAllowedHost("https://notviator.com/x", viatorHosts),
  "a host merely ENDING in viator.com's letters is refused (notviator.com)");
ok(!isAllowedHost("javascript:alert(1)//viator.com", viatorHosts),
  "javascript: is refused — new URL() accepts it, so protocol must be checked explicitly");
ok(!isAllowedHost("data:text/html,<script>//viator.com", viatorHosts), "data: is refused");

// Red-prove the probe itself: a check that refuses everything would pass all the
// negatives above while being worthless. It must accept a known positive.
ok(isAllowedHost("https://www.viator.com/", viatorHosts) === true,
  "the allowlist accepts a known-good URL, so the refusals above are meaningful and not a blanket deny");

// ── the fallback must be a REAL page, not just a declared constant ───────
// The first version of this guard asserted only that Location matched FALLBACK,
// which stayed green while FALLBACK pointed at "/things-to-do" — a path whose
// directory holds only a [city] segment, so a user who clicked "book" and hit any
// failure was 302'd into a 404. Assert the ROUTE RESOLVES, not that the string is
// consistent with itself.
const fbSegments = FALLBACK.split("/").filter(Boolean);
const fbFile = fbSegments.length
  ? path.resolve("app", ...fbSegments, "page.js")
  : path.resolve("app", "page.js");
ok(existsSync(fbFile),
  `the fallback ${FALLBACK} resolves to a real page (${path.relative(process.cwd(), fbFile)}) — a fallback that 404s turns every failed redirect into a dead end`);
ok(!/\[/.test(FALLBACK),
  "the fallback is a concrete path, not one containing a dynamic [segment] that would never match literally");

// ── 6. dark providers ────────────────────────────────────────────────────
ok(!PROVIDERS.wegotrip && !PROVIDERS.klook,
  "WeGoTrip and Klook are NOT wired: verified 2026-07-30 they have no food inventory in any Wayfind metro (WeGoTrip has no Sarasota page at all), so a link would land on an empty page");
ok(Object.keys(PROVIDERS).length >= 1, "at least one provider is live (an empty table would make the route pointless)");

// ── resolveOffer refuses without ever reaching the network ───────────────
const noFetch = () => { throw new Error("resolveOffer must not fetch before validating its inputs"); };
const r1 = await resolveOffer("evilcorp", "x", { fetch: noFetch, sbEnv: () => ({ url: "https://x", key: "k" }) });
ok(r1.error === "unknown-provider", "an unknown provider is refused before any I/O");
const r2 = await resolveOffer("viator", "", { fetch: noFetch, sbEnv: () => ({ url: "https://x", key: "k" }) });
ok(r2.error === "missing-offer", "an empty offer id is refused before any I/O");
// A poisoned row must not become an outbound link.
const poisoned = await resolveOffer("viator", "x", {
  sbEnv: () => ({ url: "https://x", key: "k" }),
  fetch: async () => ({ ok: true, json: async () => [{ product_code: "x", product_url: "https://evil.com/pwn" }] }),
});
ok(poisoned.error === "host-not-allowed",
  "a wf_experiences row carrying a non-viator URL is refused — the allowlist is a real second gate, not decoration");
const good = await resolveOffer("viator", "x", {
  sbEnv: () => ({ url: "https://x", key: "k" }),
  fetch: async () => ({ ok: true, json: async () => [{ product_code: "x", product_url: "https://www.viator.com/tours/abc" }] }),
});
ok(!good.error && /viator\.com/.test(good.dest || ""),
  "a legitimate row resolves to a viator.com destination (proves the refusals above are not blanket)");

// ── 4/5. drive the REAL route handler ────────────────────────────────────
// Guarded import: a MISSING route is the precise bug this guard exists to catch,
// so it must be REPORTED, not raised as an unhandled ERR_MODULE_NOT_FOUND that
// buries the message under a stack trace.
let mod = null;
try { mod = await import("../app/api/commerce/go/route.js"); }
catch (e) { ok(false, `the route module failed to import — the money link commerceHref names is dead: ${e && e.message}`); }
ok(mod && typeof mod.GET === "function", "the route exports a GET handler");

const call = (qs, headers) => mod.GET(new Request("https://wayfind.test/api/commerce/go?" + qs, { headers: headers || {} }));

if (!mod || typeof mod.GET !== "function") {
  // Without a handler every behavioural assertion below would be vacuous. Report
  // what we have rather than passing a suite that never exercised the route.
  console.error("check-commerce-redirect: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}

// No service env is configured in the guard process, so every one of these takes
// a failure path — which is exactly the behaviour under test.
const cases = [
  ["", "no params at all"],
  ["provider=viator", "offer missing"],
  ["offer=abc", "provider missing"],
  ["provider=evilcorp&offer=abc", "unknown provider"],
  // The open-redirect probes: none of these params is one the route reads, and
  // that is the property being locked — a destination cannot be supplied.
  ["provider=viator&offer=abc&url=https://evil.com", "a url= param is ignored"],
  ["provider=viator&offer=abc&dest=https://evil.com", "a dest= param is ignored"],
  ["provider=viator&offer=abc&redirect=//evil.com", "a redirect= param is ignored"],
];
for (const [qs, what] of cases) {
  const res = await call(qs);
  ok(res.status === 302, `${what}: fail-soft 302, never a 500 (got ${res.status})`);
  const loc = res.headers.get("location") || "";
  ok(!/evil\.com/.test(loc), `${what}: the attacker-supplied host never reaches Location (got ${loc})`);
  let host = null;
  try { host = new URL(loc, "https://wayfind.test").hostname; } catch {}
  ok(host === "wayfind.test", `${what}: the fallback stays on OUR origin (got ${host})`);
  ok(new URL(loc, "https://wayfind.test").pathname === FALLBACK,
    `${what}: lands on the declared fallback ${FALLBACK}`);
}

// A cached 302 would hand every later visitor the first visitor's click_id.
const cacheRes = await call("provider=viator&offer=abc");
const cc = cacheRes.headers.get("cache-control") || "";
ok(/no-store/.test(cc), `the redirect is uncacheable (cache-control: ${cc || "MISSING"})`);

// ── the distinct_id join, called not grepped ─────────────────────────────
const { distinctIdFromCookies } = await import("../lib/serverEvents.js");
const KEY = "phc_test";
ok(distinctIdFromCookies(`ph_${KEY}_posthog=` + encodeURIComponent(JSON.stringify({ distinct_id: "u-42" })), KEY) === "u-42",
  "distinct_id is read out of the posthog cookie, so a server event lands on the SAME person timeline as the client events either side of it");
ok(distinctIdFromCookies("other=1", KEY) === null,
  "an absent cookie returns null rather than a fabricated id — an invented id would silently break every funnel it appears in while looking recorded");
ok(distinctIdFromCookies(`ph_${KEY}_posthog=not-json`, KEY) === null, "a malformed cookie returns null instead of throwing");

if (fail.length) {
  console.error("check-commerce-redirect: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-commerce-redirect: OK — ${pass} assertions (route exists for the path commerceHref names, no destination from the request, allowlist anchored, every failure fail-soft to our own origin, redirect uncacheable)`);
