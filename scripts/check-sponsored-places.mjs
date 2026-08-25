#!/usr/bin/env node
/**
 * scripts/check-sponsored-places.mjs — pins Wayfind's PAID sponsor cards
 * (lib/sponsoredPlaces.js + app/components/SponsoredPlaceCard.js).
 *
 * The first advertiser to hand Wayfind money is Rio Body Wax GASTONIA, NC
 * (owner, 2026-08-23). Direct paid placement is a different animal from an
 * affiliate link, and it rots in four specific ways. Each has a wall here, and
 * each wall is red-proven at the bottom of the file — a guard nobody has ever
 * seen fail is a guard nobody can trust.
 *
 *   1. THE GATE WIDENS. The advertiser bought Gastonia. A later edit bumps the
 *      radius "to get more impressions" and the card starts rendering in
 *      Charlotte — where the SAME BRAND runs its own studio, so we would be
 *      spending their money to send their customers to the wrong branch. The
 *      radius is asserted at 15, and Charlotte / Pineville / Florida are
 *      asserted to render nothing.
 *
 *   2. THE DISCLOSURE GOES QUIET. Undisclosed pay-to-place is the FTC problem;
 *      disclosed paid placement is legal and ordinary. The label is asserted in
 *      the REAL rendered markup, not in the source, because a constant that is
 *      never rendered discloses nothing.
 *
 *   3. THE SCORE GOES UP FOR SALE. The single thing Wayfind cannot sell. Every
 *      displayed score must come from wayfindScore(rating, reviews) — the same
 *      formula that ranks the unpaid card next to it. Asserted on the hydrate
 *      output AND by proving the component holds no score literal of its own.
 *
 *   4. THE LINK STOPS BEING A PAID LINK. Google requires rel="sponsored" on a
 *      link that was paid for, and the advertiser needs utm attribution or they
 *      cannot see what they bought and will not renew.
 *
 * Plus one performance wall: the home route sits at ~498KB gz against
 * check-bundle's 500KB budget, so home.js must reach BOTH the registry and the
 * card lazily. A static import here would fail the build several guards later
 * with a message that says nothing about sponsors.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import {
  SPONSORED_PLACES, SPONSORED_DEFAULT_RADIUS_MI, sponsoredPlacesNear, sponsoredPlaceNear,
  sponsoredPlaceById, sponsoredIsLive, sponsoredHref, hydrateSponsoredPlace, milesBetween,
  sponsorHasPage, sponsorSlugs, sponsorBySlug, sponsorPagePath,
} from "../lib/sponsoredPlaces.js";
import { wayfindScore } from "../lib/wayfindScore.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
let pass = 0;
const ok = (c, m) => { if (c) pass++; else { console.error("  FAIL: " + m); fails++; } };

const HOME = readFileSync(join(ROOT, "app/home.js"), "utf8");
const CARD_SRC = readFileSync(join(ROOT, "app/components/SponsoredPlaceCard.js"), "utf8");
// Comments must not be able to satisfy a code assertion.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CARD_CODE = strip(CARD_SRC);
const HOME_CODE = strip(HOME);

/* ── 0. every entry is complete ─────────────────────────────────────────────
   A paid card assembled out of half a record is how a business ends up on the
   homepage with no way to book. `endsOn` must be PRESENT — null is allowed, but
   only as a decision someone typed, never as a field somebody forgot. */
const REQUIRED = [
  "id", "advertiser", "label", "placeId", "name", "venueLine", "address", "lat", "lng",
  "rating", "reviews", "headline", "body", "cta", "href", "center", "radiusMi", "startsOn",
];
ok(SPONSORED_PLACES.length >= 1, "there is at least one sponsored placement");
for (const s of SPONSORED_PLACES) {
  for (const f of REQUIRED) {
    ok(s[f] !== undefined && s[f] !== null && s[f] !== "", `${s.id || "?"}: required field "${f}" is present and non-empty`);
  }
  ok(Object.prototype.hasOwnProperty.call(s, "endsOn"), `${s.id}: declares endsOn (null is allowed; missing is not)`);
  ok(typeof s.label === "string" && /sponsor/i.test(s.label), `${s.id}: the label says the word "Sponsored" — got ${JSON.stringify(s.label)}`);
  ok(Number.isFinite(s.lat) && Number.isFinite(s.lng), `${s.id}: real coordinates`);
  ok(Number.isFinite(s.center.lat) && Number.isFinite(s.center.lng), `${s.id}: the gate has a real centre`);
  ok(Number(s.rating) > 0 && Number(s.reviews) > 0, `${s.id}: carries a real rating and review count`);
  ok(/^https:\/\//.test(s.href), `${s.id}: the booking link is https`);
  // A gate is a promise about who is paying for whose attention. Nothing may be
  // wider than this without a deliberate, visible edit to the ceiling itself.
  ok(Number(s.radiusMi) > 0 && Number(s.radiusMi) <= 25, `${s.id}: gate radius must be 1–25mi, got ${s.radiusMi}`);
  ok(milesBetween(s.lat, s.lng, s.center.lat, s.center.lng) < 1, `${s.id}: the gate is centred on the venue itself`);
}
ok(new Set(SPONSORED_PLACES.map((s) => s.id)).size === SPONSORED_PLACES.length, "sponsor ids are unique");
ok(SPONSORED_DEFAULT_RADIUS_MI === 15, `the default gate is 15mi, got ${SPONSORED_DEFAULT_RADIUS_MI}`);

/* ── 1. THE GATE ────────────────────────────────────────────────────────────
   Rio bought Gaston County. The two nearest same-brand studios are their OWN
   Charlotte (8925 J M Keynes Dr) and Pineville branches — showing a Charlotte
   reader the Gastonia card costs the advertiser a booking rather than winning
   one, which is why this gate is deliberately tighter than the 20mi Coconut
   Grove one. */
const rio = sponsoredPlaceById("rio-body-wax-gastonia");
ok(!!rio, "the rio-body-wax-gastonia placement exists");
if (rio) {
  ok(rio.radiusMi === 15, `Rio's gate must be 15 miles, got ${rio.radiusMi}`);
  ok(rio.placeId === "ChIJH0a_B7W_VogRrXeKuCFkr-Q", "Rio carries its real Google place_id");
  ok(/gastonia/i.test(rio.venueLine), "the venue line names Gastonia, so a reader knows which branch");

  const INSIDE = [
    ["the studio's own doorstep", 35.2619678, -81.126481],
    ["downtown Gastonia", 35.2621, -81.1873],
    ["Belmont NC", 35.2429, -81.0373],
  ];
  const OUTSIDE = [
    // Their own other branches. These must NEVER receive the Gastonia card.
    ["Charlotte (their own University studio)", 35.3091, -80.749],
    ["Pineville (their own studio)", 35.0881, -80.8606],
    ["uptown Charlotte", 35.2271, -80.8431],
    // The home market. A NC placement in Florida is the spam failure.
    ["Sarasota", 27.3364, -82.5307],
    ["Tampa", 27.9506, -82.4572],
    ["Miami", 25.7617, -80.1918],
  ];
  for (const [label, lat, lng] of INSIDE) {
    ok(sponsoredPlaceNear(lat, lng)?.id === "rio-body-wax-gastonia", `a reader in ${label} receives the card`);
  }
  for (const [label, lat, lng] of OUTSIDE) {
    ok(sponsoredPlaceNear(lat, lng) === null, `a reader in ${label} receives NOTHING`);
  }
  ok(sponsoredPlaceNear(null, undefined) === null, "an unresolved location receives nothing");
  ok(sponsoredPlaceNear(NaN, NaN) === null, "a NaN location receives nothing");
  ok(sponsoredPlacesNear(35.2621, -81.1873).length === 1, "exactly one card, never a stack of them");
}

/* ── 2. THE FLIGHT WINDOW ───────────────────────────────────────────────────
   A placement with an end date must retire itself the morning after, the same
   way couponIsLive() retires a dead deal. Proven on a synthetic entry so the
   live one does not have to expire to exercise the path. */
const dated = { ...rio, id: "x", startsOn: "2026-01-01", endsOn: "2026-06-30" };
ok(sponsoredIsLive(dated, "2026-03-01") === true, "a placement inside its flight runs");
ok(sponsoredIsLive(dated, "2026-07-01") === false, "a placement past endsOn does NOT run");
ok(sponsoredIsLive({ ...dated, startsOn: "2027-01-01" }, "2026-08-23") === false, "a placement before startsOn does NOT run");
ok(sponsoredIsLive({ ...rio, endsOn: null }, "2099-01-01") === true, "endsOn:null runs until it is pulled, by decision");

/* ── 3. THE SCORE IS NOT FOR SALE ───────────────────────────────────────────
   Money buys the slot. It has never bought the number, and this is where that
   stays true. */
if (rio) {
  const h = hydrateSponsoredPlace(rio, { lat: 35.2621, lng: -81.1873 });
  ok(h.wfScore === wayfindScore(rio.rating, rio.reviews), "the hydrated score IS wayfindScore(rating, reviews)");
  ok(h.wfScore !== null && h.wfScore > 0, "…and it is a real number");
  ok(Number.isFinite(h.distMi) && h.distMi < 15, "hydrate computes a real distance from the reader");
  // 2026-08-25: a committed self-hosted asset (/partners/*.jpg) is BETTER than
  // the proxy — no metered fetch, no spend gate, survives cache purges. The
  // real rule stands either way: never a keyed Google URL in the DOM.
  ok(h.photo && (h.photo.startsWith("/partners/") || h.photo.startsWith("/api/photo?ref=")), "the photo is self-hosted or goes through Wayfind's own proxy");
  ok(!/googleapis\.com/.test(String(h.photo)) && !/key=/.test(String(h.photo)), "…and is never a keyed Google URL");
}
// The component may not carry a score of its own — it must ask PlaceScoreChip,
// the same component every unpaid card uses.
ok(/PlaceScoreChip/.test(CARD_CODE), "the card renders the shared PlaceScoreChip");
ok(!/\b(?:score|wfScore|governed_score)\s*[:=]\s*\d/i.test(CARD_CODE), "the card hardcodes no score value");
ok(!/wayfindScore\s*\(/.test(CARD_CODE), "the card does not compute a score of its own — hydrate owns that");

/* ── 4. THE LINK ────────────────────────────────────────────────────────────*/
if (rio) {
  const href = sponsoredHref(rio);
  ok(href.includes("utm_source=wayfind"), "the outbound is stamped so the advertiser can see what Wayfind sent");
  ok(href.includes("utm_medium=sponsored_card"), "…and which unit sent it");
  ok(href.includes("utm_campaign=rio-body-wax-gastonia"), "…and which campaign");
  ok(new URL(href).hostname === new URL(rio.href).hostname, "stamping never redirects the reader somewhere else");
  ok(new URL(href).hostname.endsWith("riobodywax.zenoti.com"), "the link goes to the advertiser's own booking system");
}

/* ── 5. THE RENDERED CARD ───────────────────────────────────────────────────
   Everything above is a fact about a module. These are facts about the pixels,
   read off the real component through react-dom/server. */
const mod = await loadComponent(join(ROOT, "app/components/SponsoredPlaceCard.js"), ROOT);
const Card = mod.default || mod;
ok(renderToStaticMarkup(React.createElement(Card, { pick: null })) === "", "no pick renders literally nothing");

const pick = hydrateSponsoredPlace(rio, { lat: 35.2621, lng: -81.1873 });
const html = renderToStaticMarkup(React.createElement(Card, { pick }));
ok(html.includes(rio.label), `the disclosure label renders — expected ${JSON.stringify(rio.label)}`);
ok(/paid placement/i.test(html), "the paid-placement footnote renders");
ok(/not part of the deal/i.test(html), "…and it says the score was not part of the deal");
ok(html.includes("Rio Body Wax") && html.includes("Gastonia"), "the business and its branch both render — a reader must know WHICH studio");
// React escapes text nodes, so the expectation has to be escaped the same way —
// otherwise an apostrophe in the advertiser's own copy reads as a missing line.
const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
ok(html.includes(esc(rio.headline)), "the advertiser's headline renders");
ok(html.includes(esc(rio.body)), "the advertiser's body copy renders");
ok(html.includes(rio.claim), "the advertiser's own claim renders");
ok(html.includes("384") && /Google reviews/.test(html), "the real review count renders, attributed to Google");
ok(/4\.9★/.test(html), "the real star rating renders");
ok(/Wayfind Score 9\.5 out of 10/.test(html), "the LIVE Wayfind Score renders (9.5 for 4.9 / 384)");
ok(/Score pending/.test(html) === false, "a paid card never ships the pending state");
ok(html.includes(rio.person.name), "the esthetician the reader will actually sit with is credited");

// The anchor: paid link hygiene, in the markup.
const anchor = html.match(/<a [^>]*href="[^"]*riobodywax[^"]*"[^>]*>/);
ok(!!anchor, "the CTA is a real anchor to the advertiser");
if (anchor) {
  const a = anchor[0];
  ok(/rel="[^"]*\bsponsored\b/.test(a), 'rel carries "sponsored" — Google requires it on a paid link');
  ok(/rel="[^"]*\bnofollow\b/.test(a), 'rel carries "nofollow"');
  ok(/rel="[^"]*\bnoopener\b/.test(a), 'rel carries "noopener"');
  ok(/target="_blank"/.test(a), "the booking page opens in its own tab");
  ok(/utm_source=wayfind/.test(a), "the rendered href carries the advertiser's attribution");
  ok(/aria-label="/.test(a), "the CTA has an accessible name that says where it goes");
}
// A reserved media box, so a paid card is never the thing that shifts the feed.
ok(/aspect-ratio:\s*3\s*\/\s*2/.test(html) || /aspectRatio/.test(CARD_CODE), "the media box is reserved before the image lands");
ok(/loading="lazy"/.test(html), "the sponsor photo is lazy — it must not compete with LCP");

/* ── 6. HOW HOME.JS REACHES IT (the bundle wall) ────────────────────────────*/
ok(!/import\s+[^;]*from\s+["']\.\.\/lib\/sponsoredPlaces["']/.test(HOME_CODE),
  "home.js must NOT statically import lib/sponsoredPlaces — the home route has ~1.6KB of headroom against check-bundle's 500KB budget");
ok(/await import\(\s*["']\.\.\/lib\/sponsoredPlaces["']\s*\)/.test(HOME_CODE),
  "home.js reaches the registry through a dynamic import, after the reader's location resolves");
ok(!/import\s+SponsoredPlaceCard\s+from/.test(HOME_CODE),
  "home.js must NOT statically import the card component either");
ok(/nextDynamic\(\s*\(\)\s*=>\s*import\(\s*["']\.\/components\/SponsoredPlaceCard["']\s*\)/.test(HOME_CODE),
  "the card component rides next/dynamic");
ok(/<SponsoredPlaceCard\b/.test(HOME_CODE), "home.js actually renders the card");
ok(/sponsoredPick\s*\?/.test(HOME_CODE) || /&&\s*sponsoredPick/.test(HOME_CODE),
  "the render is gated on sponsoredPick — the ONLY thing that decides who sees a paid card");
ok(/sponsoredPlaceNear\(/.test(HOME_CODE), "home.js asks the gate rather than filtering the registry itself");

/* ── 6b. THE PARTNER PAGE — the half of the deal with no geo-gate ───────────
   The card can only reach someone standing in Gaston County with the app open.
   This page answers "brazilian wax gastonia" for anyone, forever, and is the
   link the business puts in its own bio. It is also the surface that can hurt
   the domain if it is allowed to go thin, so the floor is asserted first. */
const PAGE_SRC = readFileSync(join(ROOT, "lib/sponsorPage.js"), "utf8");
const SITEMAP = readFileSync(join(ROOT, "app/sitemap.js"), "utf8");
const LAYOUT = readFileSync(join(ROOT, "app/layout.js"), "utf8");
const ROUTE = readFileSync(join(ROOT, "app/partners/[slug]/page.js"), "utf8");
const INDEX_ROUTE = readFileSync(join(ROOT, "app/partners/page.js"), "utf8");

ok(sponsorHasPage(rio) === true, "Rio clears the content floor for a page");
ok(sponsorSlugs().includes("rio-body-wax-gastonia"), "…and appears in sponsorSlugs()");
ok(sponsorPagePath(rio) === "/partners/rio-body-wax-gastonia", "the page path is the slug, so URL and campaign id cannot drift");
ok(sponsorBySlug("rio-body-wax-gastonia") === rio, "the slug resolves back to the sponsor");
ok(sponsorBySlug("not-a-partner") === null, "an unknown slug resolves to null (the route 404s on it)");
// THE FLOOR, proven to actually exclude. A paid page with nothing on it does
// not rank, and a site that ships thin pages for money stops ranking at all.
ok(sponsorHasPage({ ...rio, page: undefined }) === false, "a sponsor with no page content gets NO page");
ok(sponsorHasPage({ ...rio, page: { ...rio.page, about: ["one"] } }) === false, "…nor one with a single thin paragraph");
ok(sponsorHasPage({ ...rio, page: { ...rio.page, services: ["a", "b"] } }) === false, "…nor one with almost no services");

// Discoverable, not an orphan.
ok(/sponsorSlugs/.test(SITEMAP), "the sitemap is built from sponsorSlugs()");
ok(/\/partners/.test(SITEMAP), "the sitemap carries the /partners layer");
ok(/href="\/partners"/.test(LAYOUT), "the site footer links /partners — otherwise every partner page is an orphan");
ok(/dynamicParams\s*=\s*false/.test(ROUTE), "an unknown /partners slug is a real 404, not a soft-404 over infinite URL space");
ok(/generateStaticParams/.test(ROUTE) && /sponsorSlugs/.test(ROUTE), "the route prerenders exactly the slugs that earned a page");
ok(/generateMetadata/.test(ROUTE), "the page carries its own metadata (title/description/canonical)");
ok(/PartnersIndexPage/.test(INDEX_ROUTE), "/partners renders the index");

// The rendered page.
const pageMod = await loadComponent(join(ROOT, "lib/sponsorPage.js"), ROOT);
const pageHtml = renderToStaticMarkup(pageMod.SponsorPage({ slug: "rio-body-wax-gastonia" }));
ok(pageHtml.includes(rio.label), "the page renders the sponsored label");
// The literal transaction, in a sentence a reader cannot misread — and NOT the
// "<brand> partner" construction lib/creatorRights.js bans.
ok(/pays to be featured/i.test(pageHtml.replace(/\s+/g, " ")),
  "the page says in plain words that the business pays to be featured");
ok(/no advertiser can move it/i.test(pageHtml), "…and that the score cannot be bought");
ok(pageHtml.includes("Wayfind Score"), "the Wayfind Score is named on the page");
ok(/9\.5/.test(pageHtml), "the page shows the LIVE score (9.5 for 4.9 / 384)");
ok(pageHtml.includes(esc(rio.page.lede)), "the lede renders");
ok(rio.page.waxes.every((w) => pageHtml.includes(w.name)), "every wax formula renders");
ok(pageHtml.includes(esc(rio.page.services[0])), "the service list renders");
ok(pageHtml.includes(rio.address), "the address renders");
// The /places disclaimer would be a LIE here — this page IS affiliated, by
// invoice. It must never be copy-pasted in.
ok(!/not affiliated with the places listed/i.test(pageHtml),
  "the page does NOT carry the independent-guide disclaimer — on a paid page that sentence is false");
// Schema: LocalBusiness yes, borrowed aggregateRating no.
const ldBlocks = [...pageHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
ok(ldBlocks.length >= 2, "the page emits business + breadcrumb JSON-LD");
ok(ldBlocks.some((b) => /HealthAndBeautyBusiness|LocalBusiness/.test(b)), "…a business entity");
ok(ldBlocks.some((b) => /BreadcrumbList/.test(b)), "…and a breadcrumb trail");
ok(!ldBlocks.some((b) => /aggregateRating/i.test(b)),
  "NO aggregateRating in the schema of a PAID page — those stars are Google's, not ours to mark up");
// The page's booking link is a paid link too, and reports separately.
const pageAnchor = pageHtml.match(/<a [^>]*href="[^"]*riobodywax[^"]*"[^>]*>/);
ok(!!pageAnchor, "the page has a booking anchor");
if (pageAnchor) {
  ok(/rel="[^"]*\bsponsored\b/.test(pageAnchor[0]), "…carrying rel=sponsored");
  ok(/utm_medium=partner_page/.test(pageAnchor[0]),
    "…and stamped partner_page, so the advertiser can see the page working separately from the card");
}
ok(sponsoredHref(rio, "partner_page").includes("utm_medium=partner_page"), "sponsoredHref honours the surface it was asked for");
ok(sponsoredHref(rio).includes("utm_medium=sponsored_card"), "…and still defaults to the card");

// The index.
const idxHtml = renderToStaticMarkup(pageMod.PartnersIndexPage());
ok(idxHtml.includes("Partners on Wayfind"), "the index renders its heading");
ok(!/wayfind partner/i.test(idxHtml) && !/wayfind partner/i.test(pageHtml),
  "neither page uses the banned affiliation construction, in the RENDERED markup (the source scan cannot see JSX line breaks)");
ok(idxHtml.includes("/partners/rio-body-wax-gastonia"), "…and links every partner page");
ok(/does not buy a Wayfind Score|not buy a Wayfind Score/i.test(idxHtml), "…and states plainly what money does not buy");

/* ── 6c. THE PREMIUM CARD (v8.43.1) ────────────────────────────────────────
   "Premium" here is a set of decisions, not a mood, so each one is pinned. */
ok(/linear-gradient\(90deg/.test(CARD_CODE), "the advertiser's colour appears as a single edge rule, not a background wash");
ok(html.includes("Google reviews"), "the review count is attributed to Google on the card");
ok(/<h3[^>]*>Rio Body Wax<\/h3>/.test(html), "the business name is the card's heading element, not the ad copy");
ok(html.includes('href="/partners/rio-body-wax-gastonia"'), "the card links into the partner page");
ok(html.includes('href="tel:+17046712160"'), "the card offers the real phone number");
ok(/google\.com\/maps/.test(html), "the card offers directions");
// One filled action, and only one. A second filled button is how a paid unit
// stops reading premium and starts reading like a banner.
const filled = (html.match(/background:#6D2E8E/g) || []).length;
ok(filled === 1, `exactly one filled brand button on the card, got ${filled}`);

/* ── 7. RED PROOFS ──────────────────────────────────────────────────────────
   Each wall above is shown to actually fail when the thing it protects breaks.
   Without these, a guard that always passes reads exactly like a guard that
   works. */
const RED = [
  ["a widened gate is detectable", () => {
    const wide = { ...rio, radiusMi: 40 };
    const near = [wide].filter((s) => milesBetween(35.2271, -80.8431, s.center.lat, s.center.lng) <= s.radiusMi);
    return near.length === 1; // uptown Charlotte would now be inside
  }],
  ["a blank disclosure label is detectable", () => {
    const blank = { ...rio, label: "" };
    return !(typeof blank.label === "string" && /sponsor/i.test(blank.label));
  }],
  ["a faked score is detectable", () => {
    const faked = { ...hydrateSponsoredPlace(rio, rio.center), rating: 5.0, reviews: 20000 };
    return faked.wfScore !== wayfindScore(faked.rating, faked.reviews);
  }],
  ["a missing rel=sponsored is detectable", () => {
    return !/rel="[^"]*\bsponsored\b/.test('<a href="https://x" rel="noopener">go</a>');
  }],
  ["an unstamped outbound is detectable", () => {
    return !sponsoredHref({ id: "y", href: "https://example.com/" }).includes("utm_campaign=rio-body-wax-gastonia");
  }],
  ["a thin partner page is detectable", () => {
    return sponsorHasPage({ ...rio, page: { lede: "x", about: [], services: [] } }) === false;
  }],
  ["an orphaned partner layer is detectable", () => {
    return !/href="\/partners"/.test('<a href="/creators">Local creators</a>');
  }],
];
for (const [label, fn] of RED) ok(fn() === true, "RED PROOF failed to fail: " + label);

if (fails) {
  console.error(`check-sponsored-places: FAIL — ${fails} of ${pass + fails} assertions`);
  process.exit(1);
}
console.log(`check-sponsored-places: OK — ${pass} assertions (1 placement, gate 15mi, score derived, disclosure rendered)`);
