#!/usr/bin/env node
/**
 * check-cuisine-shortlist — the money page tells the truth about what it earns.
 *
 * This is the highest-intent surface on the site: a user who reaches it has
 * already chosen a cuisine. Three ways it could quietly lie, all of which would
 * look perfect in a screenshot:
 *   1. show a CTA that cannot fire (the mock's "Reserve a table" has no partner);
 *   2. print "we may earn a commission" under a link that earns nothing;
 *   3. invent a "Known for" line where no editorial exists.
 *
 * The ladder is CALLED, not grepped (CLAUDE.md: assert on the CALL).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const { resolveRowCta, secondaryCta, showsDisclosure, CTA_LABELS, directionsUrl } =
  await import("../lib/rowCta.js");

// ── 1. the ladder, every rung, in order ──────────────────────────────────
const MAPS = "https://maps.example/x";
// 2026-08-26 — the delivery rung is GONE with Uber Eats (owner directive:
// permanently deleted). The ladder is deal > bookable > directions, and a
// stray deliveryUrl argument from an un-migrated caller must be IGNORED, not
// resurrected into a rung.
const all = resolveRowCta({ deal: { url: "https://d" }, bookingUrl: "https://b", mapsUrl: MAPS });
ok(all.type === "deal", `a deal outranks every other rung (got ${all.type})`);
const noDeal = resolveRowCta({ bookingUrl: "https://b", mapsUrl: MAPS });
ok(noDeal.type === "bookable", `bookable outranks directions (got ${noDeal.type})`);
const stray = resolveRowCta({ deliveryUrl: "https://v", deliveryEarns: true, mapsUrl: MAPS });
ok(stray.type === "directions", `a stray deliveryUrl from an un-migrated caller is ignored — the delivery rung stays deleted (got ${stray.type})`);
ok(CTA_LABELS.delivery === undefined, "no delivery label survives the removal");
const bare = resolveRowCta({ mapsUrl: MAPS });
ok(bare.type === "directions" && bare.href === MAPS, "with every monetized rung dark, the row still offers directions — never a dead end");
ok(resolveRowCta({}).type === "directions", "an empty row resolves rather than throwing");

// Verb-first labels (KIMI's spec) — a label names the ACTION, not the partner.
for (const [k, label] of Object.entries(CTA_LABELS)) {
  ok(/^[A-Z][a-z]+/.test(label), `${k} label is verb-first ("${label}")`);
  ok(!/viator|uber|clipp|opentable|google/i.test(label), `${k} label names the action, not the partner ("${label}")`);
}
ok(CTA_LABELS.deal === "Claim the deal" && CTA_LABELS.bookable === "Reserve a table" &&
   CTA_LABELS.directions === "Directions",
   "the three labels match the signed spec exactly (delivery removed 2026-08-26)");

// ── 2. THE DISCLOSURE FOLLOWS THE MONEY ──────────────────────────────────
const unpaid = resolveRowCta({ bookingUrl: null, mapsUrl: MAPS });
ok(showsDisclosure(unpaid) === false,
  "a directions row shows NO disclosure — 'we may earn a commission' under a link that cannot earn is false");
const paid = resolveRowCta({ bookingUrl: "https://b", mapsUrl: MAPS });
ok(showsDisclosure(paid) === true, "a tracked bookable link does show the disclosure");
ok(showsDisclosure(resolveRowCta({ deal: { url: "https://d" }, mapsUrl: MAPS })) === true, "a deal shows the disclosure");
ok(showsDisclosure(bare) === false, "a directions-only row shows no disclosure");
// Red-prove the probe: if showsDisclosure returned a constant, the pair above
// would be vacuous. It must disagree across the two cases.
ok(showsDisclosure(paid) !== showsDisclosure(unpaid),
  "showsDisclosure DISCRIMINATES between a paid and an unpaid link — not a constant");

// ── 3. the quiet secondary ───────────────────────────────────────────────
ok(secondaryCta(noDeal, MAPS)?.type === "directions", "a monetized row still offers directions as the quiet secondary");
ok(secondaryCta(bare, MAPS) === null,
  "a directions-PRIMARY row does not repeat directions as its secondary — two identical buttons read as a bug");
ok(typeof directionsUrl({ id: "p1", name: "X" }) === "string", "directions resolves to a URL");
ok(!/ubereats|viator|clipp/i.test(directionsUrl({ id: "p1", name: "X" })), "directions is unmonetized — a plain maps link");

// ── 4. the page renders what the data supports, and nothing more ─────────
const P = "app/eat/[metro]/[cuisine]/page.js";
const R = "app/eat/[metro]/[cuisine]/parts.js";
ok(existsSync(path.resolve(P)) && existsSync(path.resolve(R)), "the shortlist page and its rows exist");
const page = readFileSync(path.resolve(P), "utf8");
const rowsRaw = readFileSync(path.resolve(R), "utf8");
const rows = rowsRaw.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

ok(/resolveRowCta\(/.test(page), "the page resolves each row's CTA through the ONE ladder");
ok(/showsDisclosure\(/.test(rows), "the rows gate the FTC line on showsDisclosure(), not on 'a CTA exists'");
const CuisineListClient = (await loadComponent(path.resolve(R), path.resolve("."))).default;
const fixtureCta = { type: "directions", label: "Directions", href: "https://maps.example/place", monetized: false, provider: null, offerId: null };
const editorialHook = "Hand-folded soup dumplings and a glass-walled kitchen make the craft visible from every table.";
const editorialMarkup = renderToStaticMarkup(React.createElement(CuisineListClient, {
  metro: "sarasota",
  cuisine: "dumplings",
  places: [
    { id: "with-editorial", name: "Dumpling House", rating: 4.8, reviews: 320, wfScore: 91, hook: editorialHook, cta: fixtureCta, secondary: null, deal: null },
    { id: "without-editorial", name: "Second Restaurant", rating: 4.7, reviews: 210, wfScore: 89, hook: null, cta: fixtureCta, secondary: null, deal: null },
  ],
}));
ok((editorialMarkup.match(/wf-place-card-take is-known-for/g) || []).length === 1 && editorialMarkup.includes(editorialHook.replace(/[.!?]+$/, "")),
  "real editorial is delegated to IconicPlaceCard's known-for tier, while a row without editorial renders no take");
ok(!/Known for <b>\{?["'`]/.test(rows), "no hardcoded 'Known for' text");
ok(/couponEndsLabel/.test(page), "the deal chip's expiry comes from couponEndsLabel — the REAL date");
ok(!/Ends Aug 31|Ends Jul|Ends Sep/.test(page + rows), "no hardcoded expiry date anywhere (the mock's 'Ends Aug 31' is illustrative)");
ok(/siteTodayStr\(\)/.test(page),
  "coupon liveness is checked against venue-local Eastern, not UTC — a UTC date expires a Florida coupon ~4h early");

// Impressions: viewability-gated, once per row, same standard as the rail.
ok(/IntersectionObserver/.test(rows), "row impressions are viewability-gated, not fired on mount");
ok(/unobserve\(/.test(rows), "each row fires at most one impression per view");
for (const ev of ["commerce_impression", "commerce_cta_clicked"]) {
  ok(new RegExp(`emitCommerce\\(\\s*["']${ev}["']`).test(rows), `rows emit ${ev}`);
}
ok(/track\("cuisine_place_open"/.test(rows), "the existing list->detail event is UNCHANGED, so the funnel already measured keeps working");
ok(/rankBucket\(/.test(rows), "rank is bucketed, never a raw position beside a payout");
ok(!/sponsored/.test(rows.split("rel={cta.monetized")[0] || ""), "rel=sponsored is applied conditionally, not to every link");
ok(/rel=\{cta\.monetized \?/.test(rows),
  "sponsored/nofollow is applied only where the link earns — the same signal the disclosure follows");

// SSG must survive the redesign.
ok(/generateStaticParams/.test(page), "SSG intact — only (metro, cuisine) pairs with places get a route");
ok(/notFound\(\)/.test(page), "an unknown or empty cuisine still 404s rather than rendering an empty page");
// The rail composes rather than fights.
ok(/<FoodTourRail[\s/>]/.test(page), "the food-tour rail is RENDERED below the list (element form, not a bare mention)");

if (fail.length) {
  console.error("check-cuisine-shortlist: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-cuisine-shortlist: OK — ${pass} assertions (ladder called through all four rungs, disclosure follows the MONEY not the link, no invented editorial, real expiries, impressions viewability-gated, SSG intact)`);
