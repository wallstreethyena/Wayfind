#!/usr/bin/env node
// scripts/check-no-dead-end-pages.mjs — A RECOMMENDATION TELLS YOU WHERE IT IS,
// AND LETS YOU LEAVE.
//
// v8.88 (owner, 2026-08-29, on /florida-events/mobius-sarasota-night-market-
// august-2026 — a PAID partner's own landing page): "I wanna make sure that the
// Möbius event has the address and the little button that allows you to click
// on it and get directions for it. I'm not sure why you wouldn't put that in
// there. Like, how are people gonna be able to find it? … Additionally, you
// need to put a way to go back to Wayfind from that page. There's no way to get
// back."
//
// Both were true, and both were the same class of miss: THE DATA WAS ALREADY
// THERE and the page did not use it.
//
//   · `address` is in EVENT_COLUMNS and is SELECTed on every read. The Möbius
//     row has held "2211 Whitfield Park Loop, Ste 101, Sarasota, FL 34243"
//     since it was created. The page printed "{venue}, {city}, {state}".
//   · eventJsonLd() has ALWAYS emitted that street address as
//     PostalAddress.streetAddress, plus GeoCoordinates. So Google has had the
//     address on this page the whole time and the reader has not — the
//     structured data was better informed than the human it described.
//   · /events/[city]/[slug] linked to a Maps SEARCH built from the string
//     `venue + " " + city`, ignoring the address and coordinates on the same
//     object, and landing the reader on a result they then had to tap
//     Directions on themselves.
//
// This guard holds three properties. The first is EXECUTED against the real
// rule; the other two are scoped source checks on server components that node
// cannot import, and they say so in their own messages rather than reading as
// proof.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { addressLine, directionsUrl, canNavigate } from "../lib/placeWhere.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// ── 1. THE RULE, EXECUTED ───────────────────────────────────────────────────
// Row 1 is the owner's own event, with the values wf_events really holds for
// it. The rest walk the ladder in lib/placeWhere.js, including both ends: the
// row that must produce a button and the row that must NOT.
const CASES = [
  {
    why: "THE SCREENSHOT: the Möbius row, address + coordinates, no Google place id",
    row: { address: "2211 Whitfield Park Loop, Ste 101, Sarasota, FL 34243", venue: "Möbius Sarasota", city: "Sarasota", state: "FL", lat: 27.42126, lng: -82.53663 },
    line: "2211 Whitfield Park Loop, Ste 101, Sarasota, FL 34243",
    nav: true, wants: ["/maps/dir/", "Whitfield+Park+Loop"],
  },
  {
    why: "a place id wins: exact AND named, with no geocoding at all",
    row: { address: "2211 Whitfield Park Loop", placeId: "ChIJe5-RQ0Y_w4gRb7cZQa2GDkc", city: "Sarasota", state: "FL" },
    nav: true, wants: ["destination_place_id=ChIJe5-RQ0Y_w4gRb7cZQa2GDkc"],
  },
  {
    why: "coordinates only — precise, unnamed, still navigable (74 of 89 live rows carry these)",
    row: { lat: 27.3364, lng: -82.5307, city: "Sarasota", state: "FL" },
    nav: true, wants: ["destination=27.3364%2C-82.5307"],
  },
  {
    why: "venue + city, the floor: a named venue in a named city geocodes",
    row: { venue: "Van Wezel Performing Arts Hall", city: "Sarasota", state: "FL" },
    nav: true, wants: ["Van+Wezel"],
  },
  {
    why: "A CITY ALONE IS NOT A DESTINATION. This is the rung the whole function exists for: no button, rather than a pin dropped in the middle of Sarasota",
    row: { city: "Sarasota", state: "FL" },
    line: "Sarasota, FL", nav: false,
  },
  {
    why: "Null Island — a real coordinate, and the value a broken import lands on. Wayfind has never had a listing within four thousand miles of it",
    row: { lat: 0, lng: 0, city: "Nowhere" },
    nav: false,
  },
  {
    why: "null coordinates are not 0,0 — Number(null) === 0 is the coercion that emptied every now-rail in v8.82",
    row: { lat: null, lng: null, city: "Sarasota", state: "FL" },
    nav: false,
  },
  { why: "total over garbage", row: {}, line: "", nav: false },
];
for (const c of CASES) {
  const url = directionsUrl(c.row);
  ok(canNavigate(c.row) === c.nav,
    `${c.nav ? "offers" : "refuses"} a directions button — ${c.why} (got ${url ? "a url" : "null"})`);
  if (c.line !== undefined) {
    ok(addressLine(c.row) === c.line,
      `…and states the where as ${JSON.stringify(c.line)} (got ${JSON.stringify(addressLine(c.row))})`);
  }
  for (const want of c.wants || []) {
    ok(String(url).includes(want), `…and the url carries ${want} (got ${url})`);
  }
}
// Positive AND negative controls: a rule that answered one way to everything
// would satisfy half the table above.
ok(CASES.some((c) => c.nav) && CASES.some((c) => !c.nav), "positive control: the table exercises both verdicts");
// DIRECTIONS, not a map search. Those are two different Google endpoints and
// the difference is one tap the owner asked to remove.
ok(CASES.filter((c) => c.nav).every((c) => directionsUrl(c.row).startsWith("https://www.google.com/maps/dir/?")),
  "every url is the /maps/dir endpoint — /maps/search drops a pin the reader then has to tap Directions on, which is the tap this release deletes");
ok(CASES.filter((c) => c.nav).every((c) => !/\s/.test(directionsUrl(c.row))),
  "…and every url is encoded (a raw space in an href is a link some clients truncate)");

// ── 2. ONE RULE, NOT ONE PER PAGE (weaker check, source) ────────────────────
// Both event pages must CALL it. A page that rebuilt its own maps URL would be
// the third spelling of "where", which is how the date-night claim became three
// different rules (v8.82).
const PAGES = [
  "app/florida-events/[slug]/page.js",
  "app/events/[city]/[slug]/page.js",
];
for (const rel of PAGES) {
  const src = stripComments(readFileSync(join(ROOT, rel), "utf8"));
  ok(/directionsUrl\(/.test(src),
    `${rel} builds its map link by CALLING directionsUrl (weaker check, source: these are async server components that node cannot import)`);
  ok(!/maps\/search/.test(src),
    `${rel} no longer hand-builds a /maps/search URL — that endpoint ignores the address and coordinates on the very row it is describing`);
  ok(/addressLine\(/.test(src),
    `${rel} states the street through addressLine, so the page and the JSON-LD cannot disagree about where something is`);
}

// ── 3. NO CONTENT PAGE IS A DEAD END (weaker check, source) ─────────────────
// The pill is byte-shared with /guides, which has had one since v6. These three
// simply never got it — and an EVENT page is the worst place to omit it,
// because it carries two share controls: most of its readers arrive from a text
// message, where the browser has no back stack to offer.
const EXITS = [
  "app/florida-events/[slug]/page.js",
  "app/florida-events/page.js",
  "app/events/[city]/[slug]/page.js",
];
for (const rel of EXITS) {
  const src = stripComments(readFileSync(join(ROOT, rel), "utf8"));
  const home = /href="\/"/.test(src);
  const shelf = /href="\/florida-events"/.test(src) || /href="\/events"/.test(src);
  ok(home || shelf,
    `${rel} gives the reader a way out — a link back to Wayfind or to the shelf this page sits on (weaker check, source)`);
}
// The two curated pages get the HOME door specifically. "More in Florida
// Events" in the footer is a related-content link, not an exit, and it was what
// the Möbius page had instead of one.
for (const rel of ["app/florida-events/[slug]/page.js", "app/florida-events/page.js"]) {
  const src = stripComments(readFileSync(join(ROOT, rel), "utf8"));
  ok(/Back to Wayfind/.test(src) && /href="\/"/.test(src),
    `${rel} carries the shared "Back to Wayfind" pill, the same affordance /guides has had since v6`);
}

console.log(`\ncheck-no-dead-end-pages: ${fail ? "FAIL" : "OK"} — ${pass} assertions; ${CASES.length} rows EXECUTED through lib/placeWhere (the owner's own Möbius row, a place id, bare coordinates, venue+city, and the three shapes that must produce NO button), plus scoped source checks proving both event pages call the one rule and no content page is a terminal.`);
process.exit(fail ? 1 : 0);
