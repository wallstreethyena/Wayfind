#!/usr/bin/env node
// scripts/check-event-hero-and-directions.mjs — v9.00 (owner, 2026-09-07, on
// the Howl-O-Scream page): "The Howl-O-Scream page is currently a text
// document, not a premium Wayfind event page. It has no strong hero image,
// the raw website URL wraps badly, directions are duplicated, the hierarchy
// is weak and it does not visually match the rest of Wayfind."
//
// EVIDENCE (production, 2026-09-07, https://www.gowayfind.com/florida-events/
// howl-o-scream-busch-gardens-tampa-2026 — HTTP 200, confirmed live before
// this guard was written):
//   * NO <img> for a hero at all. eventPhotos("howl-o-scream-tampa-2026")
//     returns null (no owned-photography consent record — most events, by
//     design), and app/florida-events/[slug]/page.js had exactly one branch:
//     shots.hero or nothing. The row's own wf_events.hero_image column DID
//     hold a real photo (it already reaches Event JSON-LD via eventJsonLd) —
//     the page just never looked at it. The hero was not weak. It was absent.
//   * TWO "Get directions" buttons rendered: one from the page's own S.dirs
//     pill, a second from the shared <EventWhere> block directly below it —
//     verified by fetching the live HTML and counting rendered anchors.
//   * The "Website" row printed the FULL raw path as visible link text —
//     "buschgardens.com/tampa/events/howl-o-scream" — not a bare host, with no
//     width limit, in a flex row next to a 100px-wide label. That is what
//     wraps badly on a 390px viewport.
//   * The "Nearby & worth it" cards sat inside the SAME bordered, orange-
//     accented card as Busch Gardens Tampa Bay's own address and buttons —
//     nothing distinguished a nearby restaurant's thumbnail from part of the
//     event a reader is buying a ticket to.
//
// This guard pins the FIX for all four, source-checked (hermetic — no
// network, no Supabase) against app/florida-events/[slug]/page.js and
// app/components/EventWhere.js, the shared "where" block v8.99 already put
// behind both event surfaces. Section 5 RED-PROVES each check against literal
// fixtures of the ORIGINAL, pre-fix JSX captured from production on
// 2026-09-07 — proving every assertion below would actually have caught the
// bug it now guards, not just described it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// The real functions BEHIND the two source-checked rungs above — not just a
// regex over the JSX that calls them. websiteHost is what the "Official
// site" caption in EventWhere.js actually renders (rung 2), and
// directionsUrl is what the one Get-directions button's href actually
// resolves to (rung 1). Executing them here proves the underlying behavior,
// not merely that the right function name appears in the source text.
import { websiteHost, directionsUrl } from "../lib/placeWhere.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
// Strip block and line comments before every source assertion — a guard that
// can be failed by its own rationale comment (an example string quoted in a
// // note) is a guard someone eventually deletes rather than fixes.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const PAGE_PATH = "app/florida-events/[slug]/page.js";
const WHERE_PATH = "app/components/EventWhere.js";
const pageSrc = strip(read(PAGE_PATH));
const whereSrc = strip(read(WHERE_PATH));

/* ── the checks, as reusable functions so section 5 can red-prove each one
   against a captured pre-fix fixture, not just narrate that it would ─────── */

// 1. EXACTLY ONE "Get directions" across the two files that compose an event
// page (the page itself + the shared EventWhere block it renders).
function countDirectionsButtons(page, where) {
  const rx = /\{"[^"]*Get directions"\}/g;
  return ((page.match(rx) || []).length) + ((where.match(rx) || []).length);
}

// 2. NO RAW URL as visible text. The bug shape was a hand-rolled
// `.replace(/^https?:\/\//,...)` that stripped the protocol but not the path,
// so "https://buschgardens.com/tampa/events/howl-o-scream/" rendered as
// "buschgardens.com/tampa/events/howl-o-scream" — a raw path, not a host.
// Pinned two ways: (a) that exact hand-rolled pattern must never reappear in
// the page, and (b) the one place a URL variable IS shown as text
// (EventWhere's "Official site" caption) must route through websiteHost(),
// which returns a bare hostname only ("buschgardens.com"), never a path.
function rendersRawUrlText(page) {
  return /\.replace\(\/\^https\?/.test(page);
}
function siteCaptionUsesHostOnly(where) {
  return /const host = website \? websiteHost\(website\)/.test(where);
}

// 3. A HERO THAT NEVER RENDERS AS NOTHING. Three rungs in source order: owned
// photography, then the row's own hero_image, then a monogram fallback — the
// same shape as app/components/css.js's .wf-place-card-monogram, so an event
// with neither never opens on a bare kicker + h1 (the "text document" defect).
function heroLadderComplete(page) {
  const block = (page.match(/\{shots && shots\.hero \? \([\s\S]*?\n\s*\)\}/) || [""])[0];
  if (!block) return false;
  return /shots\.hero \? \(/.test(block)
    && /e\.hero_image \? \(/.test(block)
    && /heroFallback/.test(block)
    && !/:\s*null\s*\)\}?\s*$/.test(block.trim()); // the final rung must not be a no-op
}

// 4. NEARBY RECOMMENDATIONS STRUCTURALLY AND VISUALLY SEPARATE FROM THE
// VENUE. The venue card and the nearby card must be TWO different DOM
// containers (nearby not nested inside .wfw-card), with visibly distinct
// copy stating these are not the venue, and a distinct accent color from the
// venue card's own (never the venue's orange — PICK teal instead, the same
// color already used for the numbered map pins).
function nearbySeparatedFromVenue(where) {
  const cardOpen = where.indexOf('<div className="wfw-card">');
  // The boundary is the START of the nearby card's own opening tag, not just
  // the class name substring — className="wfw-nearcard" also appears earlier,
  // inside the CSS template's `.wfw-nearcard{...}` rule, which would put
  // nearIdx BEFORE cardOpen and always fail this check.
  const nearIdx = where.indexOf('<div className="wfw-nearcard"');
  if (cardOpen === -1 || nearIdx === -1) return false;
  // The venue card must fully CLOSE before the nearby card begins: the
  // nearby markup is a SIBLING <div>, not a child, of .wfw-card.
  const between = where.slice(cardOpen, nearIdx);
  const opens = (between.match(/<div\b/g) || []).length;
  const closes = (between.match(/<\/div>/g) || []).length;
  const cardClosedFirst = closes >= opens; // every <div> opened after wfw-card, including wfw-card itself, has been closed
  const distinctAccent = /\.wfw-nearcard\{[^}]*rgba\(46,201,166/.test(where) // PICK teal
    && !/\.wfw-nearcard\{[^}]*rgba\(249,115,22/.test(where); // never the venue card's orange (ACCENT)
  const saysNotTheVenue = /not the venue|not part of/i.test(where.slice(nearIdx, nearIdx + 800));
  return cardClosedFirst && distinctAccent && saysNotTheVenue;
}

/* ── EXECUTE the real functions the JSX above calls, not just their source ─
   Rungs 1 and 2 are pinned in source as "renders through directionsUrl /
   websiteHost", which only proves the right NAME appears. Actually calling
   them proves the BEHAVIOR: a directions href is the /maps/dir endpoint
   (never /maps/search — a second-tap search result), and a website caption
   is a bare host with no scheme and no path — the exact shape that makes a
   raw, wrapping URL structurally impossible, not merely absent today. */

const buschGardens = { venue: "Busch Gardens Tampa Bay", address: "10165 N McKinley Dr", city: "Tampa", state: "FL", lat: 28.0371, lng: -82.4195 };
const dirHref = directionsUrl(buschGardens);
ok(typeof dirHref === "string" && dirHref.startsWith("https://www.google.com/maps/dir/?"),
  `directionsUrl (the one Get-directions button's href) resolves to the turn-by-turn /maps/dir endpoint for a real venue shape, not /maps/search (got ${dirHref})`);

const rawOfficialUrl = "https://buschgardens.com/tampa/events/howl-o-scream/";
const captionHost = websiteHost(rawOfficialUrl);
ok(captionHost === "buschgardens.com",
  `websiteHost (the "Official site" caption EventWhere actually renders) reduces the real Howl-O-Scream official url to a bare host — not a path (got ${JSON.stringify(captionHost)})`);
ok(!captionHost.includes("/") && !captionHost.startsWith("http"),
  `websiteHost's return value structurally CANNOT wrap as a path — it carries no "/" and no scheme (got ${JSON.stringify(captionHost)})`);

/* ── run the real checks against the live source ──────────────────────── */

ok(countDirectionsButtons(pageSrc, whereSrc) === 1,
  `exactly one "Get directions" button across ${PAGE_PATH} + ${WHERE_PATH} (got ${countDirectionsButtons(pageSrc, whereSrc)}) — the owner's "directions are duplicated"`);
ok(!/\bS\.dirs\b/.test(pageSrc),
  `${PAGE_PATH} no longer defines its own directions pill (S.dirs) — directions render from exactly one place, <EventWhere>`);
ok(/className="wfw-btn wfw-dir"/.test(whereSrc) && (whereSrc.match(/className="wfw-btn wfw-dir"/g) || []).length === 1,
  `${WHERE_PATH} renders the one Get-directions button exactly once`);

ok(!rendersRawUrlText(pageSrc),
  `${PAGE_PATH} must not hand-roll a protocol-only URL strip — that pattern is exactly what left the full path "buschgardens.com/tampa/events/howl-o-scream" as visible text`);
ok(siteCaptionUsesHostOnly(whereSrc),
  `${WHERE_PATH}'s Official-site caption must be websiteHost(website) — a bare hostname, never a path`);
ok(!/>\{site\}</.test(pageSrc) && !/\{site\.replace\(/.test(pageSrc),
  `${PAGE_PATH} never prints the raw \`site\` url (or a hand-rolled strip of it) as visible text`);

ok(heroLadderComplete(pageSrc),
  `${PAGE_PATH} hero renders owned photography, then hero_image, then a monogram fallback — never nothing`);
ok(/heroFallback:\s*\{/.test(pageSrc) && /heroFallbackMark:\s*\{/.test(pageSrc),
  `${PAGE_PATH} defines the monogram fallback panel style (S.heroFallback / S.heroFallbackMark)`);
ok(/function heroInitials\(/.test(pageSrc),
  `${PAGE_PATH} derives fallback initials the same way RailCard/IconicPlaceCard do (not a stock image)`);

ok(nearbySeparatedFromVenue(whereSrc),
  `${WHERE_PATH}: the nearby-places card is a structurally separate container from the venue card, with a distinct accent and copy that says it is not the venue`);
ok(/pins\.length\s*>\s*0/.test(whereSrc),
  `${WHERE_PATH} still gates the nearby shelf on having real pins (never a thin shelf)`);

/* ── 5. RED-PROVE: each check must actually fail against the PRE-FIX source ─
   Fixtures below are the literal JSX captured from production on 2026-09-07,
   before this release. If a check cannot fail here, it proves nothing about
   the fix — it would have passed the bug too. */

const PRE_FIX_HERO = `
      {shots && shots.hero ? (
        <img src={shots.hero.src} alt={shots.hero.alt} width={shots.hero.w} height={shots.hero.h} style={S.hero} />
      ) : null}
`;
ok(!heroLadderComplete(PRE_FIX_HERO),
  "RED-PROVE: the pre-fix hero (owned photo or literally nothing) fails heroLadderComplete — the check has teeth");

const PRE_FIX_CTA = `
      {dirs || ticket ? (
        <p style={{ margin: "-12px 0 22px" }}>
          {ticket ? (
            <a style={S.tix} href={ticket.href} target="_blank" rel="sponsored nofollow noopener">
              {"tickets"}
            </a>
          ) : null}
          {dirs ? (
            <a style={S.dirs} href={dirs} target="_blank" rel="noopener nofollow">
              {"Get directions"}
            </a>
          ) : null}
        </p>
      ) : null}
`;
const PRE_FIX_WHERE_DIR = `<a className="wfw-btn wfw-dir" href={directionsHref} target="_blank" rel="noopener nofollow">{"Get directions"}</a>`;
ok(countDirectionsButtons(PRE_FIX_CTA, PRE_FIX_WHERE_DIR) === 2,
  `RED-PROVE: the pre-fix page (its own pill + EventWhere's) counts two Get-directions buttons, not one (got ${countDirectionsButtons(PRE_FIX_CTA, PRE_FIX_WHERE_DIR)})`);

const PRE_FIX_WEBSITE_ROW = `{site ? <div style={S.row}><span style={S.k}>Website</span><span style={S.v}><a style={S.link} href={site} rel="nofollow noopener" target="_blank">{site.replace(/^https?:\\/\\/(www\\.)?/, "").replace(/\\/$/, "")}</a></span></div> : null}`;
ok(rendersRawUrlText(PRE_FIX_WEBSITE_ROW),
  "RED-PROVE: the pre-fix Website row's hand-rolled strip is caught by rendersRawUrlText — it printed a full path, not a host");

const PRE_FIX_WHERE_NEAR = `
  return (
    <section className="wfw" aria-label="Where it is and how to get there">
      <div className="wfw-card">
        <div className="wfw-head">head</div>
        {pins.length > 0 ? (
          <div className="wfw-near">
            <h3>Nearby &amp; worth it</h3>
            <p>Real places near {venue}, ranked by Wayfind.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
`;
ok(!nearbySeparatedFromVenue(PRE_FIX_WHERE_NEAR),
  "RED-PROVE: the pre-fix layout (nearby cards nested inside the SAME .wfw-card, no disambiguating copy) fails nearbySeparatedFromVenue");

// A guard whose positive checks would ALSO pass on the broken fixtures proves
// nothing — so also prove the real, fixed source is distinguishable from the
// pre-fix fixtures on every axis above (belt-and-suspenders against a
// mis-written regex that happens to match both).
ok(countDirectionsButtons(pageSrc, whereSrc) !== countDirectionsButtons(PRE_FIX_CTA, PRE_FIX_WHERE_DIR),
  "self-test: the fixed source's directions count differs from the pre-fix fixture's");
ok(heroLadderComplete(pageSrc) !== heroLadderComplete(PRE_FIX_HERO),
  "self-test: the fixed source's hero-ladder verdict differs from the pre-fix fixture's");
ok(nearbySeparatedFromVenue(whereSrc) !== nearbySeparatedFromVenue(PRE_FIX_WHERE_NEAR),
  "self-test: the fixed source's nearby-separation verdict differs from the pre-fix fixture's");

if (fail.length) {
  console.error(`check-event-hero-and-directions: FAIL — ${fail.length} of ${pass + fail.length}`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-event-hero-and-directions: OK — ${pass} assertions (one Get-directions button, no raw URL text, a hero that never renders as nothing, nearby recommendations structurally separated from the venue) — red-proved against the pre-fix page.`);
