#!/usr/bin/env node
/**
 * check-viator-redirect-layer — no monetized Viator link on /culture/[metro] may
 * reach the DOM as a partner URL, and the exact-product passthrough must never
 * become an open redirect.
 *
 * WHY (2026-07-31). /culture/[metro] rendered viatorDirectUrl() straight into an
 * <a href>: a live affiliate link in the DOM. Every click bypassed
 * /api/viator/go, so there was no provider_redirect_started and no server-side
 * record — the click existed only if the client-side event happened to land. It
 * is the same shape as the CJ deals rail, where a partner URL in the DOM was
 * being "clicked" ~144x/day by crawlers against ~50 human visitors.
 *
 * THE DANGEROUS HALF of the fix is the passthrough itself. Accepting a
 * destination from the request is the definition of an open redirect, so the
 * route re-validates it against the viator.com HOST. This guard CALLS the real
 * validator with the attacks that beat a naive prefix check — chiefly
 * https://www.viator.com@evil.tld, where everything before @ is userinfo and the
 * request actually resolves to evil.tld.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isValidViatorProduct, sanitizeClientClickId, GET } from "../app/api/viator/go/route.js";
import { mintClickId } from "../lib/commerce.js";
import { viatorProductGoUrl } from "../lib/affiliates.js";
import { withClickId } from "../lib/hubConversion.js";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── 1. the validator, CALLED ─────────────────────────────────────────────── */
const GOOD = [
  "https://www.viator.com/tours/Orlando/Airboat/d827-1234P5",
  "https://www.viator.com/en-US/tours/Sarasota/x/d1-2?ref=a",
];
for (const u of GOOD) ok(isValidViatorProduct(u) === true, `must ACCEPT a real product URL: ${u}`);

const ATTACKS = [
  ["https://www.viator.com@evil.tld/x", "userinfo trick — resolves to evil.tld"],
  ["https://www.viator.com.evil.tld/x", "suffix-domain trick"],
  ["https://evil.tld/https://www.viator.com/x", "path-embedded decoy"],
  ["http://www.viator.com/x", "plain http"],
  ["//www.viator.com/x", "protocol-relative"],
  ["javascript:alert(1)", "javascript URI"],
  ["https://viator.com.evil.tld", "no www + suffix"],
  ["https://www.viator.com/x\nLocation: https://evil.tld", "header injection via newline"],
  ["https://www.viator.com/x https://evil.tld", "whitespace splice"],
  ["", "empty"],
  [null, "null"],
  ["https://www.getyourguide.com/x", "a different partner entirely"],
];
for (const [u, why] of ATTACKS) {
  ok(isValidViatorProduct(u) === false, `must REFUSE (${why}): ${String(u).slice(0, 60)}`);
}
// Positive control: the probe must be able to say yes, or every "false" above is
// meaningless.
ok(isValidViatorProduct(GOOD[0]) === true, "PROBE BROKEN: validator rejects everything, so the refusals prove nothing");

/* ── 2. the client click_id, CALLED ───────────────────────────────────────── */
// CONTRACT, NOT A LITERAL. This block used to assert
//   sanitizeClientClickId("c_abcd1234efgh") !== null
// which pinned one implementation's exact prefix. When the branch collapsed to
// the single documented minter in lib/commerce.js the prefix became "wf-", and
// that hardcoded test would have gone red on a strictly more correct change
// while proving nothing about the actual requirement.
//
// The requirement is: the sanitizer accepts BOTH id shapes the system can
// actually produce — crypto.randomUUID() and the documented fallback — and
// rejects everything else. So both are OBTAINED BY CALLING the minter rather
// than typed in.
const uuidShape = "0b7f1c2d-3e4f-5a6b-7c8d-9e0f1a2b3c4d";
ok(sanitizeClientClickId(uuidShape) !== null, "a uuid click_id must be accepted");
ok(sanitizeClientClickId(mintClickId()) !== null, "the id the client actually mints must be accepted (called, not hardcoded)");
{
  // Force the no-crypto path so the DOCUMENTED fallback is what gets tested.
  const real = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
  const fallback = mintClickId();
  if (real) Object.defineProperty(globalThis, "crypto", real);
  ok(fallback.startsWith("wf-"), `the documented fallback must keep its wf- prefix, got ${JSON.stringify(fallback)}`);
  ok(sanitizeClientClickId(fallback) !== null, "the documented wf- fallback must survive server sanitisation — if it does not, the client event and provider_redirect_started carry different ids and can never be joined");
}
for (const bad of ["short", "has space", "semi;colon", "a".repeat(65), "", null, "quote\"x", "<script>", "../../etc/passwd"]) {
  ok(sanitizeClientClickId(bad) === null, `a malformed click_id must be refused: ${JSON.stringify(bad)}`);
}
ok(withClickId("/api/viator/go?product=x", "abc12345") === "/api/viator/go?product=x&click_id=abc12345",
  "withClickId must append click_id (main's public param name) to our own redirect");
ok(!/[?&]cid=/.test(withClickId("/api/viator/go?product=x", "abc12345")),
  "withClickId must NOT use `cid` — that was this branch's name and it orphans every analytics join against main's click_id");
ok(withClickId("https://www.viator.com/x", "abc12345") === "https://www.viator.com/x",
  "withClickId must NEVER decorate an off-site URL — that leaks the join key to the partner");
ok(withClickId("/api/viator/go?click_id=already", "abc12345") === "/api/viator/go?click_id=already",
  "withClickId must not double-append");

/* ── 3. the URL builder, CALLED ───────────────────────────────────────────── */
const built = viatorProductGoUrl("https://www.viator.com/tours/Orlando/x/d1-2", "Orlando", "culture", "culture");
ok(typeof built === "string" && built.startsWith("/api/viator/go?"),
  "viatorProductGoUrl must return OUR path, not a partner URL");
ok(!/viator\.com/.test(built.split("?")[0]), "the path itself must not be a partner domain");
const parsed = new URL("https://x.test" + built);
ok(parsed.searchParams.get("product") === "https://www.viator.com/tours/Orlando/x/d1-2",
  "the exact destination must survive the round trip — attribution/destination preserved");
ok(isValidViatorProduct(parsed.searchParams.get("product")),
  "whatever the builder emits must pass the route's own validator");
ok(viatorProductGoUrl("https://evil.tld/x", "Orlando") === null,
  "the builder must refuse a non-viator URL rather than produce a redirect to it");
ok(viatorProductGoUrl(null, "Orlando") === null, "a null product must produce no link at all");

/* ── 4. the page must not be able to emit a partner href ──────────────────── */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const culture = strip(readFileSync(REPO + "app/culture/[metro]/page.js", "utf8"));
ok(!/viatorDirectUrl\s*\(/.test(culture),
  "/culture/[metro] must not call viatorDirectUrl — it yields a bare partner href");
ok(/viatorProductGoUrl\s*\(/.test(culture),
  "/culture/[metro] must build its offer links with viatorProductGoUrl");
ok(!/<a\s[^>]*href=\{\s*url\s*\}/.test(culture),
  "the per-item link must stay wrapped in TrackedOfferLink, not a bare <a href={url}>");
// resolveViatorProduct also yields a raw partner URL; it must be wrapped too.
const resolveLine = (culture.match(/const direct = await resolveViatorProduct[\s\S]{0,400}/) || [""])[0];
ok(/viatorProductGoUrl\(\s*direct/.test(resolveLine),
  "the resolveViatorProduct result is a raw viator.com URL and must also route through /api/viator/go");

/* ── 4b. the REAL handler, INVOKED ────────────────────────────────────────── */
// Reading the route's source proves it looks right. Calling it proves it
// behaves right, and only the second is what ships.
const PRODUCT = "https://www.viator.com/tours/Orlando/Airboat/d827-1234P5";
const CID = "0b7f1c2d3e4f5a6b7c8d9e0f";

const good = await GET(new Request(
  "https://x.test/api/viator/go?product=" + encodeURIComponent(PRODUCT) +
  "&city=Orlando&kind=culture&surface=culture&click_id=" + CID));
ok(good.status === 302, `an exact product must 302 (got ${good.status})`);
const loc = good.headers.get("Location") || "";
ok(loc.startsWith("https://www.viator.com/"), `Location must be the viator product (got ${loc.slice(0, 60)})`);
ok(loc.includes("/tours/Orlando/Airboat/d827-1234P5"),
  "the EXACT destination must be preserved, not replaced by a search fallback");
ok(!/\bclick_id=/.test(loc) && !/\bcid=/.test(loc), "our internal click_id must not be forwarded to the partner");
ok((good.headers.get("Cache-Control") || "").includes("s-maxage"), "the product redirect must set a cache policy");

// A refused product must NOT redirect to the attacker's URL.
const EVIL = "https://www.viator.com@evil.tld/x";
const bad = await GET(new Request(
  "https://x.test/api/viator/go?product=" + encodeURIComponent(EVIL) + "&q=orlando%20tour&city=Orlando"));
const badLoc = bad.headers.get("Location") || "";
ok(!badLoc.includes("evil.tld"), `a refused product must never reach Location (got ${badLoc.slice(0, 80)})`);
ok(bad.status === 302, "a refused product still lands the user somewhere real");
ok(/viator\.com/.test(badLoc), "the fallback must still be a viator destination, not an error page");

// No product and no query: still must not emit a broken redirect.
const none = await GET(new Request("https://x.test/api/viator/go"));
ok(none.status === 302, "a query-less call must still redirect rather than throw");

/* ── 4b. THE JOIN KEY, proven by capturing what the route emits ──────────────
 * The whole point of a client-minted click_id is that commerce_cta_clicked
 * (client) and provider_redirect_started (server) carry the SAME value, so a
 * booking can be traced back to the card that produced it. Asserting the
 * sanitiser in isolation does not prove that — the route could sanitise
 * correctly and then emit a freshly minted id anyway. So this captures the
 * events the route actually emits and compares the ids.
 */
{
  const seen = [];
  const realFetch = globalThis.fetch;
  // captureServer() short-circuits to false when NEXT_PUBLIC_POSTHOG_KEY is
  // unset, so without this the route never reaches its emit path and the
  // interceptor below would capture nothing — which would read as "the events
  // are missing" when the truth is "the test never let them be sent".
  //
  // WRITTEN UNCONDITIONALLY, NEVER READ. An earlier draft saved the ambient
  // value so it could restore it; check-guard-hermeticity (which exists on
  // feat/detail-action-layer, not on main) correctly rejected that — a guard
  // that consults the shell answers differently in a clean terminal than in one
  // with .env.production.local sourced, which is how 5c541b4 turned a
  // live-affiliate guard into decoration for six hours. Pinning a fixed stub
  // regardless of environment keeps the verdict identical in every shell.
  // run-guards sets WF_SUPPRESS_ANALYTICS=1 for every guard it spawns (guards
  // were firing fixtures into the PRODUCTION PostHog project during Vercel
  // builds). This block asserts that the route DOES capture, so suppression
  // would make it pass while proving nothing. Opting out is safe here because
  // the fetch stub below intercepts every request — nothing leaves the process
  // regardless of the flag. check-guards-emit-no-analytics enforces that a
  // route-invoking guard has one protection or the other.
  delete process.env.WF_SUPPRESS_ANALYTICS;
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_guard_stub";
  // captureServer posts to PostHog; intercept rather than reach the network.
  globalThis.fetch = async (url, init) => {
    try {
      const body = init && init.body ? JSON.parse(init.body) : null;
      if (body && body.event) seen.push({ event: body.event, click_id: (body.properties || {}).click_id });
    } catch {}
    return new Response("{}", { status: 200 });
  };
  try {
    const CLIENT_ID = "0b7f1c2d-3e4f-5a6b-7c8d-9e0f1a2b3c4d";
    await GET(new Request("https://x.test/api/viator/go?product=" + encodeURIComponent(PRODUCT) +
      "&city=Orlando&surface=culture&click_id=" + CLIENT_ID));
    const started = seen.filter((e) => e.event === "provider_redirect_started");
    ok(started.length > 0, "provider_redirect_started must be emitted for a valid product");
    ok(started.every((e) => e.click_id === CLIENT_ID),
      `provider_redirect_started must carry the CLIENT's click_id so the two events join (got ${JSON.stringify(started.map((e) => e.click_id))})`);

    // A malformed id must be REJECTED AND REPLACED — not passed through, and
    // not left empty. Passing it through would let a caller forge a join key.
    seen.length = 0;
    const FORGED = "../../etc/passwd";
    await GET(new Request("https://x.test/api/viator/go?product=" + encodeURIComponent(PRODUCT) +
      "&city=Orlando&surface=culture&click_id=" + encodeURIComponent(FORGED)));
    const started2 = seen.filter((e) => e.event === "provider_redirect_started");
    ok(started2.length > 0, "a malformed click_id must still emit the redirect event");
    ok(started2.every((e) => e.click_id && e.click_id !== FORGED),
      "a malformed click_id must be REPLACED with a minted one, never echoed back");
    ok(started2.every((e) => sanitizeClientClickId(e.click_id) !== null),
      "the replacement id must itself satisfy the sanitiser contract");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  }
}

/* ── 5. the route still records both legs ─────────────────────────────────── */
const route = strip(readFileSync(REPO + "app/api/viator/go/route.js", "utf8"));
ok(/emit\(\s*["']provider_redirect_started["']/.test(route), "the product path must emit provider_redirect_started");
ok(/emit\(\s*["']provider_redirect_failed["'][^)]*invalid-product-url/.test(route)
   || /failure_reason:\s*["']invalid-product-url["']/.test(route),
  "a refused product URL must emit provider_redirect_failed, not fail silently");
// The refusal must NOT redirect to the unvalidated value.
ok(!/Location:\s*rawProduct/.test(route), "a refused product must never reach Location");

if (fail.length) {
  console.error("check-viator-redirect-layer: FAILED");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(
  `check-viator-redirect-layer: OK — ${pass} assertions ` +
  `(validator CALLED against ${ATTACKS.length} open-redirect attacks incl. the userinfo trick, ` +
  `click_id sanitiser + withClickId off-site refusal, destination preserved round-trip, ` +
  `no partner href reachable from /culture/[metro], both redirect legs recorded)`
);
