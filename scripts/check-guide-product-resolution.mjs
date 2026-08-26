#!/usr/bin/env node
/**
 * check-guide-product-resolution — a guide may only claim "tickets" for a
 * product it actually verified, and the verification must be the STRONG one.
 *
 * WHY (2026-08-05). All nine tour-intent guides resolved to a generic Viator
 * search; 20 readers saw that CTA and none clicked. #599 made the label honest.
 * This resolves the real product at render time so the label can be honest AND
 * bookable.
 *
 * THE RISK THIS GUARDS. A guide bakes its CTA into HTML cached for a day, so a
 * wrong-place product is served to everyone, not to one clicker. The repo has
 * shipped exactly that bug twice (Dali -> Barcelona, Ringling -> Houston), and
 * geoConfirms() inside resolveVerified() is what stops it. There is a WEAKER
 * server-side resolver in lib/viatorServer.js that accepts any product whose
 * title merely mentions a region token — using it here would reintroduce the
 * bug on a cached surface. So this asserts the strong predicate is the one in
 * play, by DRIVING it with candidate shapes rather than reading the source.
 *
 * fetch is injected, so every case runs offline with no API key and no network.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveGuideProduct, pickAsPlace, productCtaLabel } from "../lib/guideProductResolve.js";
import { viatorProductGoUrl } from "../lib/affiliates.js";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const respond = (products) => async () => ({
  ok: true,
  json: async () => ({ products: { results: products } }),
});

const P = (title, url, code) => ({ title, productUrl: url, productCode: code || null });

/* ── 1. a genuinely matching product resolves ─────────────────────────────── */
const ringling = [
  P("The Ringling Museum Admission Ticket, Sarasota", "https://www.viator.com/tours/Sarasota/Ringling/d1-2", "R1"),
];
const good = await resolveGuideProduct({ name: "The Ringling" }, "Sarasota", { fetchImpl: respond(ringling) });
ok(good && /viator\.com/.test(good.url), `a matching Sarasota product must resolve (got ${JSON.stringify(good)})`);
// THE ASSERTION THIS GUARD SHIPPED WITHOUT. resolveVerified's offer (toOffer in
// lib/bookingResolver) carries productCode/productUrl and NO title, so
// offer.title is always undefined. Asserting only the url let that through, the
// label fell back to the pick name, and production rendered
// "See tickets: What the hour actually covers" — a guide SECTION HEADING sold as
// a bookable product.
ok(good && good.title === "The Ringling Museum Admission Ticket, Sarasota",
  `the resolved PRODUCT TITLE must survive the resolver (got ${JSON.stringify(good && good.title)})`);

/* ── 2. THE WRONG-PLACE CASE, which is the whole point ────────────────────── */
// A Houston product for a Sarasota guide. The weak token check would accept
// anything mentioning "ringling"; geoConfirms must refuse it.
const houston = [
  P("Ringling Bros Circus Experience, Houston", "https://www.viator.com/tours/Houston/Ringling/d5-9", "H9"),
];
const wrongPlace = await resolveGuideProduct({ name: "The Ringling" }, "Sarasota", { fetchImpl: respond(houston) });
ok(wrongPlace === null,
  `a HOUSTON product must NOT resolve for a Sarasota guide — this is the Ringling->Houston bug on a page cached for a day (got ${JSON.stringify(wrongPlace)})`);

// Positive control: case 1 proves the resolver can say yes, so case 2's null is
// a refusal and not a resolver that rejects everything.
ok(good !== null, "PROBE BROKEN: the resolver rejected the matching product too, so the refusal above proves nothing");

/* ── 3. ambiguity must refuse rather than guess ───────────────────────────── */
const ambiguous = [
  P("Sarasota City Tour", "https://www.viator.com/tours/Sarasota/A/d1-1", "A"),
  P("Sarasota City Tour", "https://www.viator.com/tours/Sarasota/B/d1-2", "B"),
];
const amb = await resolveGuideProduct({ name: "Sarasota City Tour" }, "Sarasota", { fetchImpl: respond(ambiguous) });
ok(amb === null, `two indistinguishable candidates must resolve to nothing, not a coin flip (got ${JSON.stringify(amb)})`);

/* ── 4. every fail-soft path returns null, never throws ───────────────────── */
const cases = [
  ["empty result set", respond([])],
  ["upstream not ok", async () => ({ ok: false, json: async () => ({}) })],
  ["malformed json", async () => ({ ok: true, json: async () => { throw new Error("bad json"); } })],
  ["network throw", async () => { throw new Error("ECONNRESET"); }],
  ["null body", async () => ({ ok: true, json: async () => null })],
];
for (const [label, impl] of cases) {
  let out = "THREW";
  try { out = await resolveGuideProduct({ name: "The Ringling" }, "Sarasota", { fetchImpl: impl }); } catch (e) {}
  ok(out === null, `${label}: must return null and never throw (got ${JSON.stringify(out)})`);
}
ok(await resolveGuideProduct({ name: "" }, "Sarasota", { fetchImpl: respond(ringling) }) === null,
  "a pick with no name must not resolve");
ok(await resolveGuideProduct({ name: "The Ringling" }, "", { fetchImpl: respond(ringling) }) === null,
  "no region means no geo evidence, so nothing may resolve");

/* ── 5. the strong predicate must be the one in play ──────────────────────── */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const mod = strip(readFileSync(REPO + "lib/guideProductResolve.js", "utf8"));
ok(/resolveVerified\s*\(/.test(mod),
  "must call resolveVerified — the default-deny, geo-confirmed predicate");
ok(!/resolveViatorProduct\s*\(/.test(mod),
  "must NOT use lib/viatorServer.resolveViatorProduct — its region check accepts any product whose title mentions a token, which is the wrong-place bug on a cached page");

/* ── 6. the page upgrade must be gated and must not emit a partner href ───── */
const page = strip(readFileSync(REPO + "app/guides/[slug]/page.js", "utf8"));
ok(/resolveGuideProduct\s*\(/.test(page), "the guide page must attempt render-time resolution");
ok(/guideIntent\(\s*g\s*\)\s*===\s*["']tour["']/.test(page),
  "the upgrade stays scoped to tour-intent guides");
ok(/!\s*\(\s*primaryCta\s*&&\s*primaryCta\.exact\s*\)/.test(page),
  "the upgrade must not re-resolve an already-exact CTA — re-resolving can only downgrade it");
ok(/paintGuideCta\s*\(\s*primaryCta\s*\)/.test(page),
  "after upgrade, paintGuideCta must hide a leftover search dest — search-as-Book is not Book");
ok(/viatorProductGoUrl\s*\(/.test(page),
  "a resolved product must be handed to viatorProductGoUrl, never rendered as a bare partner href");
ok(!/href:\s*hit\.url/.test(page),
  "the raw partner URL must never become the CTA href — /api/viator/go re-validates the host before it can be a Location");
ok(/exact:\s*true/.test(page), "an upgraded CTA must set exact: true so the label and the events agree");

// The upgraded href must actually be one of ours, asserted by CALLING the builder.
const built = viatorProductGoUrl("https://www.viator.com/tours/Sarasota/Ringling/d1-2", "Sarasota", "guide", "guide");
ok(typeof built === "string" && built.startsWith("/api/viator/go?"),
  `the upgrade path must produce our own redirect (got ${built})`);
ok(viatorProductGoUrl("https://evil.tld/x", "Sarasota") === null,
  "the builder must refuse a non-viator URL rather than mint a redirect to it");

/* ── 6b. the upgraded LABEL, CALLED ───────────────────────────────────────── */
// This is the rule check-guide-cta-honesty cannot exercise offline: with no API
// key no guide resolves an exact CTA, so that assertion runs zero times. Drive
// the builder directly instead.
const WP_PICK = "Winter Park Scenic Boat Tour";
const WP_PRODUCT = "Clear Kayak Sunset Tour through The Winter Park chain";
const wp = productCtaLabel(WP_PRODUCT, WP_PICK);
ok(wp && !wp.includes(WP_PICK),
  `an upgraded label must NOT name the pick when the product differs — the resolved product is a kayak tour, not the Scenic Boat Tour (got "${wp}")`);
ok(wp && wp.includes("Clear Kayak"),
  `an upgraded label must name the resolved PRODUCT (got "${wp}")`);
ok(wp && wp.length <= 62, `an upgraded label must stay button-sized at 390px (got ${wp && wp.length} chars)`);
ok(!/\s\u2026$/.test(wp || ""), "truncation must not leave a dangling space before the ellipsis");
const shortT = productCtaLabel("Ybor City Ghost Walk", "Ybor City");
ok(shortT === "See tickets: Ybor City Ghost Walk", `a short title must not be truncated (got "${shortT}")`);
ok(productCtaLabel("", "Gatorland") === "See tickets & availability",
  "with no product title the label must not name the pick — see 6c");
ok(productCtaLabel("", "") === "See tickets & availability",
  "with nothing to name, the label stays honest rather than absent");

/* ── 6c. a label may name ONLY a real product title ───────────────────────── */
// Guide picks are editorial section headings, not venues. Naming one implies it
// is bookable. This is the production bug, asserted directly.
const HEADING = "What the hour actually covers";
ok(productCtaLabel(null, HEADING) === "See tickets & availability",
  `with no product title the label must name NOTHING, not the pick heading (got "${productCtaLabel(null, HEADING)}")`);
ok(!String(productCtaLabel("", HEADING)).includes(HEADING),
  "an empty title must never fall through to the pick heading");
ok(productCtaLabel("Haunted Ybor City Ghost Walk", HEADING) === "See tickets: Haunted Ybor City Ghost Walk",
  "a real product title is still named in full");

/* ── 7. pickAsPlace must not fabricate bookability ────────────────────────── */
const place = pickAsPlace({ name: "Siesta Key Beach" }, "Sarasota");
ok(!JSON.stringify(place.types || []).includes("tourist_attraction"),
  "pickAsPlace must not stamp tourist_attraction — that token is what let free sand into the booking funnel");

if (fail.length) {
  console.error("check-guide-product-resolution: FAILED");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(
  `check-guide-product-resolution: OK — ${pass} assertions, resolver DRIVEN offline with injected fetch ` +
  `(matching product resolves; a Houston product for a Sarasota guide is refused; ambiguity refuses; ` +
  `5 fail-soft paths return null without throwing; strong resolveVerified predicate asserted in play; ` +
  `upgrade gated on !exact and routed through /api/viator/go)`
);
