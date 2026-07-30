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

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const { resolveRowCta, secondaryCta, showsDisclosure, CTA_LABELS, directionsUrl } =
  await import("../lib/rowCta.js");

// ── 1. the ladder, every rung, in order ──────────────────────────────────
const MAPS = "https://maps.example/x";
const all = resolveRowCta({ deal: { url: "https://d" }, bookingUrl: "https://b", deliveryUrl: "https://v", deliveryEarns: true, mapsUrl: MAPS });
ok(all.type === "deal", `a deal outranks every other rung (got ${all.type})`);
const noDeal = resolveRowCta({ bookingUrl: "https://b", deliveryUrl: "https://v", deliveryEarns: true, mapsUrl: MAPS });
ok(noDeal.type === "bookable", `bookable outranks delivery (got ${noDeal.type})`);
const noBook = resolveRowCta({ deliveryUrl: "https://v", deliveryEarns: true, mapsUrl: MAPS });
ok(noBook.type === "delivery", `delivery outranks directions (got ${noBook.type})`);
const bare = resolveRowCta({ mapsUrl: MAPS });
ok(bare.type === "directions" && bare.href === MAPS, "with every monetized rung dark, the row still offers directions — never a dead end");
ok(resolveRowCta({}).type === "directions", "an empty row resolves rather than throwing");

// Verb-first labels (KIMI's spec) — a label names the ACTION, not the partner.
for (const [k, label] of Object.entries(CTA_LABELS)) {
  ok(/^[A-Z][a-z]+/.test(label), `${k} label is verb-first ("${label}")`);
  ok(!/viator|uber|clipp|opentable|google/i.test(label), `${k} label names the action, not the partner ("${label}")`);
}
ok(CTA_LABELS.deal === "Claim the deal" && CTA_LABELS.bookable === "Reserve a table" &&
   CTA_LABELS.delivery === "Order pickup" && CTA_LABELS.directions === "Directions",
   "the four labels match the signed spec exactly");

// ── 2. THE DISCLOSURE FOLLOWS THE MONEY ──────────────────────────────────
// The subtlest failure on this page: "Order pickup" resolves to a real Uber Eats
// destination but earns NOTHING while NEXT_PUBLIC_UBEREATS_TEMPLATE is unset.
// Printing an FTC line under it would be a false statement to the user, and would
// teach them the line is boilerplate rather than information.
const unpaid = resolveRowCta({ deliveryUrl: "https://v", deliveryEarns: false, mapsUrl: MAPS });
ok(unpaid.type === "delivery" && unpaid.monetized === false,
  "an untracked delivery link is delivery-but-NOT-monetized");
ok(showsDisclosure(unpaid) === false,
  "…and shows NO disclosure — 'we may earn a commission' under a link that cannot earn is false");
const paid = resolveRowCta({ deliveryUrl: "https://v", deliveryEarns: true, mapsUrl: MAPS });
ok(showsDisclosure(paid) === true, "a TRACKED delivery link does show the disclosure");
ok(showsDisclosure(resolveRowCta({ deal: { url: "https://d" }, mapsUrl: MAPS })) === true, "a deal shows the disclosure");
ok(showsDisclosure(bare) === false, "a directions-only row shows no disclosure");
// Red-prove the probe: if showsDisclosure returned a constant, the pair above
// would be vacuous. It must disagree across the two cases.
ok(showsDisclosure(paid) !== showsDisclosure(unpaid),
  "showsDisclosure DISCRIMINATES between a paid and an unpaid link — not a constant");

// ── 3. the quiet secondary ───────────────────────────────────────────────
ok(secondaryCta(noBook, MAPS)?.type === "directions", "a monetized row still offers directions as the quiet secondary");
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
ok(/\{p\.hook \?/.test(rows),
  "the 'Known for' line is CONDITIONAL on real editorial — measured coverage is ~22% of rows, and a placeholder would be invented prose");
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
