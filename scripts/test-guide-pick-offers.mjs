#!/usr/bin/env node
/**
 * test-guide-pick-offers — focused guide offers and the borrowed-rating rule
 * (owner direction 2026-10-18, t5u).
 *
 *  1. Stable ids: every offer attaches to a pick by its explicit `id` in the
 *     guide data, each id exists exactly once, and page.js looks offers up by
 *     the pick object (never by index / visible number).
 *  2. Copy honesty: no prices, star ratings or review counts in offer copy, no
 *     best/cheapest/guaranteed claims; one CTA wording ("Check dates and price").
 *  3. Owner-specific facts: Sarasota pick + bottom CTA = 108117P1; Boggy Creek
 *     is the airboat pick's primary offer and Wild Florida is a labelled
 *     alternative (Sunday closure, 45-min check-in, safari not included);
 *     Rock Springs launches from Kings Landing and says non-refundable; KSC
 *     names the admission option and keeps transport-only separate; the
 *     official KSC link is non-affiliate.
 *  4. Borrowed ratings: a tour CTA can never carry a place's Google rating
 *     (ctaProofScope = "none"); page.js gates the lookup on it; the rendered
 *     proof line names its source.
 *  5. Rendered markup: offers render under the pick with the restriction line
 *     before the button and the disclosure after it.
 *
 * Red-prove: `--red-prove` mutates (a) an index-keyed lookup and (b) a tour
 * CTA marked proof:"place", and requires both to FAIL.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const RED = process.argv.includes("--red-prove");
const { GUIDES } = await import("../lib/guides.js");
const offersLib = await import("../lib/guidePickOffers.js");
const ctaLib = await import("../lib/guideCta.js");
const page = readFileSync(path.join(REPO, "app/guides/[slug]/page.js"), "utf8");
const conv = readFileSync(path.join(REPO, "app/guides/[slug]/GuideConversion.js"), "utf8");

function run({ lookup, proofOf, pageSrc }) {
  let pass = 0; const fail = [];
  const ok = (c, m) => { if (c) pass++; else fail.push(m); };

  // 1. stable ids
  for (const [slug, picks] of Object.entries(offersLib.GUIDE_PICK_OFFERS)) {
    const g = GUIDES[slug];
    ok(!!g, `guide ${slug} exists`);
    if (!g) continue;
    const ids = g.picks.map((p) => p && p.id).filter(Boolean);
    ok(new Set(ids).size === ids.length, `${slug}: pick ids are unique`);
    for (const id of Object.keys(picks)) ok(ids.filter((x) => x === id).length === 1, `${slug}: offer pick id "${id}" exists exactly once`);
  }
  ok(/guidePickOffers\(params\.slug, pick\)/.test(pageSrc) && !/guidePickOffers\(params\.slug, i\)/.test(pageSrc), "page.js looks offers up by the pick object, never its index");
  // a reordered guide still attaches the same offer to the same pick
  const sar = GUIDES["things-to-do-sarasota"];
  const lido = sar.picks.find((p) => p.id === "lido-mangrove-tunnels");
  const reversed = sar.picks.slice().reverse();
  const hitRev = reversed.map((p, i) => lookup("things-to-do-sarasota", p, i)).find((e) => e && e.offers.some((x) => x.offerId === "108117P1"));
  ok(hitRev && hitRev.pickId === "lido-mangrove-tunnels", "reordering picks keeps 108117P1 on the Lido pick");
  ok(lookup("things-to-do-sarasota", { ...lido, id: undefined }, 1) === null, "a pick without an id gets no offer (fail closed)");

  // 2. copy honesty
  const BAD = [/\$\d/, /★/, /\b\d[\d,]*\s+reviews\b/i, /\bbest\b/i, /\bcheapest\b/i, /(?<!never |isn't |not )guaranteed/i, /\bsave\b/i];
  for (const [slug, picks] of Object.entries(offersLib.GUIDE_PICK_OFFERS)) for (const [id, e] of Object.entries(picks)) for (const x of e.offers) {
    const copy = [x.title, x.whoFor, x.detail, x.meet, x.objection].filter(Boolean).join(" ");
    for (const rx of BAD) ok(!rx.test(copy), `${slug}/${id}/${x.offerId}: copy free of ${rx}`);
    ok(!/★|\breviews\b/i.test(x.restriction), `${slug}/${id}/${x.offerId}: no rating in the restriction line`);
  }
  ok(offersLib.PICK_OFFER_CTA === "Check dates and price", "one CTA wording for product-page buttons");

  // 3. owner-specific facts
  const O = offersLib.GUIDE_PICK_OFFERS;
  ok(sar.partnerTour && sar.partnerTour.offerId === "108117P1", "Sarasota bottom CTA books 108117P1");
  ok(O["things-to-do-sarasota"]["lido-mangrove-tunnels"].offers[0].offerId === "108117P1", "Lido pick offer is 108117P1");
  const air = O["things-to-do-orlando-not-theme-parks"]["orlando-airboat-headwaters"].offers;
  ok(air[0].role === "primary" && /Boggy Creek/.test(air[0].operator) && air[0].offerId === "5039P5", "airboat pick: Boggy Creek is the primary offer");
  const wf = air.find((x) => x.role === "alternative");
  ok(wf && wf.offerId === "5467OHEP" && /^Alternative:/.test(wf.title) && /different venue/i.test(wf.whoFor) && /Kenansville/.test(wf.meet), "Wild Florida is a labelled alternative with its own location");
  ok(wf && /Closed Sundays/.test(wf.restriction) && /45 minutes/.test(wf.restriction) && /does not include the Drive-Thru Safari/.test(wf.detail), "Wild Florida: Sunday closure, 45-min check-in, safari not included");
  const rs = O["things-to-do-orlando-not-theme-parks"]["rock-springs-run-kayak"].offers[0];
  ok(/Kings Landing/.test(rs.meet) && /not the Kelly Park gate/.test(rs.meet) && /^Non-refundable/.test(rs.restriction), "Rock Springs: Kings Landing launch, non-refundable beside the button");
  ok(/operator cancels for weather/.test(rs.objection) && !/free (changes|cancellation)/i.test(rs.restriction), "Rock Springs: operator weather cancellation kept separate; no free-change claim");
  const ksc = O["things-to-do-orlando-not-theme-parks"]["kennedy-space-center"];
  ok(/Kennedy Space Center Tour/.test(ksc.offers[0].detail) && /Transportation Only/.test(ksc.offers[0].detail), "KSC: names the admission option, keeps transport-only separate");
  ok(ksc.official && /^https:\/\/www\.kennedyspacecenter\.com\//.test(ksc.official.href) && /earns nothing/.test(ksc.official.note), "KSC: official non-affiliate admission link for drivers");

  // 4. borrowed ratings
  const scope = (slug) => proofOf(ctaLib.guidePrimaryCta(GUIDES[slug], "2026-10-18"));
  for (const slug of ["things-to-do-sarasota", "anna-maria-island-day-trip", "ybor-city-tampa-guide", "myakka-river-state-park-guide"]) {
    if (GUIDES[slug]) ok(scope(slug) === "none", `${slug}: tour CTA carries no place rating`);
  }
  for (const [slug, g] of Object.entries(GUIDES)) {
    const c = ctaLib.guidePrimaryCta(g, "2026-10-18");
    if (c && (c.kind === "tour" || (c.kind === "deal" && (g.partnerTour || g.parkTicketLabel)))) ok(proofOf(c) === "none", `${slug}: tour/partner product never shows a place rating`);
  }
  ok(scope("things-to-do-orlando-not-theme-parks") === "place", "Orlando: Boggy Creek admission may show Boggy Creek's own rating");
  ok(/ctaProofScope\(primaryCta\) !== "place"[\s\S]{0,80}socialStatus = "not-applicable"/.test(pageSrc), "page.js skips the place-rating lookup unless the CTA is that place");
  ok(/Google reviews/.test(conv), "the proof line names its source (Google)");

  // 5. strip removal
  ok(offersLib.replacesCityStrip("things-to-do-orlando-not-theme-parks") && !offersLib.replacesCityStrip("things-to-do-sarasota"), "Orlando drops the 30-tile strip; Sarasota keeps it");
  ok(/chrome\.bookableHighlights && railIntent && bridgeCity && !replacesCityStrip\(params\.slug\) \? \(\s*<IntentPartnerPick/.test(pageSrc) && /railSeed = chrome\.bookableHighlights && railIntent && bridgeCity && !replacesCityStrip\(params\.slug\)/.test(pageSrc), "page.js gates the city strip (and its seed) on replacesCityStrip");
  return { pass, fail };
}

const real = { lookup: (s, p) => offersLib.guidePickOffers(s, p), proofOf: ctaLib.ctaProofScope, pageSrc: page };
const res = run(real);

// rendered markup
const mod = await loadComponent(path.join(REPO, "app/guides/[slug]/GuidePickOffer.js"), REPO);
const entry = offersLib.guidePickOffers("things-to-do-orlando-not-theme-parks", { id: "orlando-airboat-headwaters" });
const html = renderToStaticMarkup(createElement(mod.default, { entry, slug: "things-to-do-orlando-not-theme-parks" }));
const ok2 = (c, m) => { if (c) res.pass++; else res.fail.push(m); };
ok2(html.indexOf("5039P5") > -1 && html.indexOf("5039P5") < html.indexOf("5467OHEP"), "render: Boggy Creek renders before the Wild Florida alternative");
ok2(/A different venue/.test(html), "render: the alternative is visibly labelled");
ok2(/offer=5039P5&amp;surface=guide_pick&amp;content=things-to-do-orlando-not-theme-parks%3Aorlando-airboat-headwaters&amp;page=g-things-to-do-orlando-not-theme-parks/.test(html), "render: our redirect, guide_pick surface, stable pick id, page key");
ok2(!/viator\.com/.test(html), "render: no partner URL in the DOM");
const ri = html.indexOf("Closed Sundays"), bi = html.indexOf("Check dates and price", html.indexOf("5467OHEP"));
ok2(ri > -1 && bi > ri, "render: the restriction sits before its button");
ok2(/Wayfind may earn a commission, which never changes our picks or their order/.test(html), "render: pick offer uses the shared commission sentence");
ok2(/#E6EDF3/.test(html), "render: the commission line is the light body tone, not slate on navy");
const altBtn = html.slice(html.indexOf("5467OHEP"));
ok2(/background:transparent/.test(altBtn) && /border:1px solid #F97316/.test(altBtn), "render: the Wild Florida alternative button stays outlined");
const convMod = await loadComponent(path.join(REPO, "app/guides/[slug]/GuideConversion.js"), REPO);
const affiliateHtml = renderToStaticMarkup(createElement(convMod.default, {
  slug: "things-to-do-sarasota", region: "Sarasota", next: null, social: null, socialStatus: "not-applicable",
  cta: { kind: "deal", href: "/api/commerce/go?provider=viator&offer=108117P1&surface=guide", label: "Lido kayak tour", sponsored: true, monetized: true, exact: true, place: "Lido Key", provider: "viator", offerId: "108117P1" },
}));
ok2(/Your next step/.test(affiliateHtml) && /Wayfind may earn a commission, which never changes our picks or their order/.test(affiliateHtml), "render: an affiliate bottom CTA shows the same commission line");
const directionsHtml = renderToStaticMarkup(createElement(convMod.default, {
  slug: "example", region: "Sarasota", next: null, social: null, socialStatus: "not-applicable",
  cta: { kind: "directions", href: "https://www.google.com/maps/dir/?api=1&destination=Example", label: "Get directions", sponsored: false, monetized: false, exact: false, place: "Example" },
}));
ok2(!/Wayfind may earn a commission/.test(directionsHtml), "render: a directions next step shows no commission line");

if (RED) {
  const r1 = run({ ...real, lookup: (s, p, i) => (i === 1 ? offersLib.guidePickOffers(s, { id: "lido-mangrove-tunnels" }) : null) });
  const r2 = run({ ...real, proofOf: () => "place" });
  if (r1.fail.length && r2.fail.length) { console.log(`test-guide-pick-offers --red-prove: OK — index lookup (${r1.fail.length} failures) and borrowed tour rating (${r2.fail.length}) both caught`); process.exit(0); }
  console.error("test-guide-pick-offers --red-prove: FAILED — a mutation went green"); process.exit(1);
}
const fail = res.fail;
if (fail.length) { console.error("test-guide-pick-offers: FAIL\n  - " + fail.join("\n  - ")); process.exit(1); }
console.log(`test-guide-pick-offers: OK — ${res.pass} assertions (stable pick ids, honest copy, Boggy Creek pick + labelled Wild Florida alternative, Kings Landing/non-refundable, KSC admission option + official link, no borrowed tour ratings)`);
