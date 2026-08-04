// scripts/check-tour-strip-redirect.mjs
//
// TourStrip MUST NOT put a partner host in an href. This CALLS the component's
// exported href builder against rows that carry a live pid= partner url, which
// is the only non-vacuous way to check it.
//
// THE LEAK (found 2026-08-04, live on production). TourStrip rendered
// `href={t.url}` — the raw viator.com product URL with `pid=P00308545` readable
// in view-source — on three surfaces: /things-to-do/[city] and /beaches/[city]
// (lib/landing.js) and /best-beaches/[metro]. Four were in the DOM of
// /things-to-do/parrish. Same shape that produced ~144 CJ clicks/day against
// ~50 human visitors on the deals rail: a JS-rendering crawler that follows the
// link IS a billable partner click.
//
// WHY A SOURCE SCAN CANNOT REPLACE THIS. check-direct-affiliate-urls already
// walks app/components and it passed the entire time, because it matches
// LITERAL partner URLs in source and this URL arrived at runtime in a variable.
// Grepping for `viator.com` in TourStrip.js finds nothing today and would still
// find nothing if someone reintroduced `href={t.url}` tomorrow.
//
// AND RENDERING IT DOES NOT WORK EITHER — the first version of this guard tried
// that and reported "0 href(s) inspected" while passing. The rows arrive from a
// useEffect fetch, which never runs under renderToStaticMarkup, so the markup is
// empty and every assertion over it is vacuous. That is the same class of false
// green this file exists to prevent, one level up. Hence the exported
// tourHref(): CLAUDE.md, "assert on the CALL, not on the string".
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadComponent } from "./lib/jsxLoad.mjs";

let pass = 0;
const fail = (m) => { console.error("check-tour-strip-redirect: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mod = await loadComponent(fileURLToPath(new URL("../app/components/TourStrip.js", import.meta.url)), REPO);
const Strip = mod && mod.default;
const tourHref = mod && mod.tourHref;
ok(typeof Strip === "function", "TourStrip compiles and exports a component");
ok(typeof tourHref === "function", "TourStrip exports tourHref so this guard can call the real decision point");

// Rows in the exact shape /api/experiences returns, INCLUDING the raw product
// URL with a live pid — the value that used to reach the href. If the component
// ever renders it again, the assertions below see it.
const ROWS = [
  { code: "173028P1", title: "Clear Kayak Tour of Shell Key", image: "https://media.viator.com/a.jpg", rating: 4.9, reviews: 800, fromPrice: 69,
    url: "https://www.viator.com/tours/St-Petersburg/Clear-Kayak/d5403-173028P1?mcid=42383&pid=P00308545&medium=api" },
  { code: "108117P1", title: "Sarasota Guided Mangrove Tunnel Kayak Tour", image: "https://media.viator.com/b.jpg", rating: 5, reviews: 400, fromPrice: 64,
    url: "https://www.viator.com/tours/Sarasota/Mangrove/d25738-108117P1?mcid=42383&pid=P00308545&medium=api" },
  { code: "179637P1", title: "Little Toot Dolphin Adventure", image: "https://media.viator.com/c.jpg", rating: 4.8, reviews: 950, fromPrice: 35,
    url: "https://www.viator.com/tours/Clearwater/Dolphin/d22457-179637P1?mcid=42383&pid=P00308545&medium=api" },
];

// ── the invariant, by CALLING the decision point ──────────────────────────
// tourHref is exported precisely so this check is not vacuous. Rendering the
// component reaches NOTHING: its rows arrive from a useEffect fetch, which does
// not run under renderToStaticMarkup, so the markup is empty and every
// assertion over it inspects an empty string while reporting OK. The first
// version of this guard did exactly that — "0 href(s) inspected" — which is the
// failure mode this whole file exists to prevent, one level up.
const PARTNER_HOSTS = /viator\.com|anrdoezrs\.net|dpbolvw\.net|klook\.com|tiqets\.com|gocity\.com|citypass\.com|tp\.media|getyourguide\.com/i;

const hrefs = ROWS.map((r) => tourHref(r));
ok(hrefs.length >= 3, `the fixture set is non-empty (got ${hrefs.length}) — an empty set would make every assertion below vacuous`);
ok(hrefs.every(Boolean), "every fixture row with an offer id produces a link");
for (let i = 0; i < ROWS.length; i += 1) {
  const h = hrefs[i];
  ok(!PARTNER_HOSTS.test(h), `row "${ROWS[i].code}" produced a PARTNER href (${String(h).slice(0, 70)}) — it must leave through /api/commerce/go`);
  ok(String(h).startsWith("/api/commerce/go?"), `row "${ROWS[i].code}" links through our redirect`);
  const q = new URLSearchParams(String(h).split("?")[1] || "");
  ok(q.get("provider") === "viator", `row "${ROWS[i].code}" names the viator provider`);
  ok(q.get("offer") === ROWS[i].code, `row "${ROWS[i].code}" carries its own product code as the offer id`);
  ok(q.get("surface") === "tour_strip", `row "${ROWS[i].code}" is attributed to its own surface`);
}
// THE LEAK ITSELF: the raw url is present on every fixture row and must not
// survive into any link.
ok(ROWS.every((r) => /pid=P\d+/.test(r.url)), "positive control: the fixture rows really do carry a live pid= partner url, so there is something to leak");
ok(hrefs.every((h) => !/pid=/.test(h)), "no partner pid reaches the rendered href — the redirect re-applies it server-side instead");
// A row with no offer id must produce NOTHING, never the raw url.
ok(tourHref({ url: "https://www.viator.com/tours/x?pid=P00308545" }) === null,
   "a row with no offer id returns null — it must not fall back to the partner url");
ok(tourHref(null) === null, "a null row returns null (no crash, no link)");

// ── source contract: the raw url must not be bound to an href ─────────────
const src = await import("node:fs").then((fs) => fs.readFileSync(fileURLToPath(new URL("../app/components/TourStrip.js", import.meta.url)), "utf8"));
const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""); // strip comments; the fix documents the old form
ok(!/href=\{\s*t\.url\s*\}/.test(code), "the raw product url is never bound to an href (this is the exact line that leaked)");
ok(/commerceHref\(\{\s*provider:\s*"viator"/.test(code), "the href is built through commerceHref with the viator provider");
ok(/surface:\s*"tour_strip"/.test(code), "clicks are attributed to their own surface, not merged into another rail's reporting");
ok(/if\s*\(!href\)\s*return null/.test(code), "a row with no offer id renders NOTHING rather than falling back to the partner url");

// ── positive control ──────────────────────────────────────────────────────
// If the matcher cannot see a partner URL, every green above is vacuous.
ok(PARTNER_HOSTS.test('href="https://www.viator.com/tours/x?pid=P00308545"'),
   "positive control: the matcher recognises a raw Viator href");
ok(!PARTNER_HOSTS.test('href="/api/commerce/go?provider=viator&offer=173028P1"'),
   "negative control: our own redirect path is NOT flagged as a partner host");

console.log(`check-tour-strip-redirect: OK — ${pass} assertions (tourHref CALLED on ${ROWS.length} rows that each carry a live pid= partner url; every result is /api/commerce/go, none on a partner host, and a row with no offer id returns null rather than the raw url)`);
