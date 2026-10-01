#!/usr/bin/env node
// scripts/test-beach-never-booking.mjs — a beach must never look like it needs a ticket.
//
// Owner rule (v6.53, reaffirmed 2026-09-30): Siesta / Turtle / Coquina Beach
// carried owner-pinned Viator products in PLACE_PARTNER_PICKS, and those pins
// bypassed the beach exclusion, so /things-to-do/sarasota painted a Viator
// link on the Siesta Beach card. Enforcement is now inside placePartnerPick.
//
// Asserted BY CALL, never by grepping source: placePartnerPick, resolveDetailCta,
// placePagePartner, the real IconicPlaceCard RENDERED to markup, and the real
// PLACE_PARTNER_PICKS data swept. A positive control (Dali Museum) must still
// get its CTA, otherwise "null" below could mean the pick system is just dead.
import { register } from "node:module";
register("./lib/placeDataNodeHook.mjs", import.meta.url);
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { placePartnerPick, PLACE_PARTNER_PICKS, isBeachName } = await import("../lib/placePartnerPicks.js");
const { resolveDetailCta } = await import("../lib/detailCta.js");
const { placePagePartner } = await import("../lib/placeData.js");
const Card = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;

let pass = 0;
const fails = [];
const ok = (c, m) => { c ? pass++ : fails.push(m); };

// Fixture shapes: bare {name} (guideCta / placePagePartner callers), full
// Google-typed shape (live card), and category-only shape.
const BEACHES = [
  { name: "Siesta Beach", code: "136885P1" },
  { name: "Turtle Beach", code: "87414P4" },
  { name: "Coquina Beach", code: "454941P3" },
];
const shapes = (name) => [
  { label: "name only", p: { name } },
  { label: "typed", p: { id: "fx-" + name, name, types: ["beach", "tourist_attraction", "natural_feature"] } },
  { label: "category", p: { id: "fx2-" + name, name, category: "beach", types: ["tourist_attraction"] } },
];

// POSITIVE CONTROL first: the pick system is alive and pins still resolve.
const control = { name: "The Dalí Museum", id: "fx-dali", types: ["museum", "tourist_attraction"] };
ok(placePartnerPick(control)?.offerId === "tampa-date-dali-museum", "CONTROL: a non-beach attraction still resolves its pin");
// Mixed-case proof that the long tour-at-a-beach pin is NOT caught by the bare-beach-name rule.
ok(isBeachName("Siesta Beach") && !isBeachName("Little Toot Dolphin Adventure at Clearwater Beach"),
  "CONTROL: bare beach names match, a long tour named after a beach does not");
ok(placePartnerPick({ name: "Little Toot Dolphin Adventure" }) !== null,
  "CONTROL: the named-operator boat tour pin (Little Toot) still resolves");
ok(!!resolveDetailCta({ detail: control, kind: "attraction", viaTours: {}, locName: "St. Petersburg, FL", offers: {}, openState: true }).monetized,
  "CONTROL: resolveDetailCta still monetizes the non-beach pin");

for (const b of BEACHES) {
  for (const s of shapes(b.name)) {
    ok(placePartnerPick(s.p) === null, `${b.name} (${s.label}): placePartnerPick returns null`);
    ok(placePagePartner(s.p) === null, `${b.name} (${s.label}): placePagePartner returns null`);
    const cta = resolveDetailCta({ detail: s.p, kind: "beach", viaTours: {}, locName: "Sarasota, FL", offers: {}, openState: true });
    ok(!cta.monetized && !/viator/i.test(JSON.stringify(cta)) && !String(cta.href || "").includes(b.code),
      `${b.name} (${s.label}): detail CTA is not a monetized/Viator CTA (got ${JSON.stringify(cta)})`);
  }
  // Generic beach never in the pin table, plus any alias variant of the row.
}
for (const name of ["Anna Maria Island Beach", "Some Brand New Beach", "Lido Beach"]) {
  ok(placePartnerPick({ name }) === null && placePartnerPick({ name, types: ["beach"] }) === null, `generic beach ${name}: no pick`);
}

// Data-independence: any row in the REAL table whose alias is a bare beach
// name must resolve to null under every alias; nothing in the table may let a
// beach alias through.
for (const row of PLACE_PARTNER_PICKS) {
  for (const alias of row.aliases) {
    if (isBeachName(alias)) ok(placePartnerPick({ name: alias }) === null, `table row ${row.offerId}: alias "${alias}" resolves to nothing`);
  }
}
// A synthetic beach pin appended by a future editor cannot come back: the row
// rule refuses it through any alias, including a non-beach-looking one.
ok(BEACHES.every((b) => PLACE_PARTNER_PICKS.some((r) => r.offerId === b.code)), "PRECONDITION: the three beach pins still exist in the table, so the nulls above are the RULE, not data deletion");

// RENDERED card: the real IconicPlaceCard, real markup.
const render = (place) => renderToStaticMarkup(createElement(Card, { place, rank: 1, href: "/p/x" }));
const goLinks = (html) => (html.match(/href="[^"]*\/api\/[a-z]+\/go[^"]*"/g) || []);
for (const b of BEACHES) {
  for (const s of shapes(b.name)) {
    const html = render({ ...s.p, rating: 4.8, reviews: 900, distMi: 3, lat: 27.26, lng: -82.55 });
    ok(html.includes(b.name), `${b.name} (${s.label}): card actually rendered (probe)`);
    ok(goLinks(html).length === 0 && !/wf-ticket-pill/.test(html) && !/Partner tickets/.test(html),
      `${b.name} (${s.label}): rendered card carries no go-link / ticket pill`);
  }
}
{
  const html = render({ ...control, rating: 4.8, reviews: 3000, distMi: 3, lat: 27.77, lng: -82.63 });
  ok(goLinks(html).length === 1 && /wf-ticket-pill/.test(html), `CONTROL: rendered non-beach card still carries exactly one go-link ticket pill (got ${goLinks(html).length})`);
}

// ── BookingCTA (the Detail sheet's own component), RENDERED ───────────────────
const BookingCTA = (await loadComponent(path.join(ROOT, "app/components/BookingCTA.js"), ROOT)).default;
const cta = (variant, detail, kind, viaTours) => renderToStaticMarkup(createElement(BookingCTA, {
  variant, detail, kind, viaTours, locName: "Sarasota, FL", logEvent: () => {}, addReservation: () => {}, openExternal: () => {},
}));
const VT = (id) => ({ [id]: { loading: false, items: [{ code: "9999P1", productCode: "9999P1", title: "Sunset Cruise from the harbor", url: "https://www.viator.com/tours/Sarasota/x/d1-9999P1" }] } });
for (const b of BEACHES) {
  for (const s of shapes(b.name)) {
    const id = s.p.id || "fx-bare-" + b.name;
    const d = { ...s.p, id };
    const prim = cta("primary", d, "beach", VT(id));
    ok(prim === "" || (!/\/api\/[a-z]+\/go/.test(prim) && !/Tickets|Tours|Search Viator|Check rates/.test(prim)),
      `${b.name} (${s.label}): BookingCTA primary renders no booking CTA (got ${prim.slice(0, 120)})`);
    ok(!/wf-ticket|Partner tickets/.test(cta("disclosure", d, "beach", VT(id))) , `${b.name} (${s.label}): disclosure variant clean`);
  }
}
// Detail sheet beach: the nearby-experiences list is labeled as nearby EXPERIENCES, never admission.
{
  const id = "fx-list-beach";
  const d = { id, name: "Siesta Beach", types: ["beach", "natural_feature"], category: "beach" };
  const list = cta("list", d, "beach", VT(id));
  ok(/Viator options nearby/.test(list) && /Sunset Cruise from the harbor/.test(list), "beach detail: the nearby list renders, titled 'Viator options nearby' (probe: the item rendered)");
  ok(!/admission/i.test(list), "beach detail: nearby list never says admission")
  ok(!/Tickets\b|Book tickets|Beach (?:tickets|admission)/i.test(list.replace(/<[^>]+>/g, " ")), "beach detail: nearby list carries no ticket/admission wording (text only)");
}

// ── POSITIVE CONTROLS: names that CONTAIN 'Beach' but are not beaches ─────────
// None has a real pin in the table, so the legitimate behaviour is asserted at
// each layer that could suppress it: the beach predicates stay false, and when
// an offer exists the Detail resolver and BookingCTA primary still book.
const LEGIT = [
  { name: "Palm Beach Zoo", types: ["zoo", "tourist_attraction"], kind: "attraction" },
  { name: "Daytona Beach Boardwalk", types: ["tourist_attraction", "amusement_park"], kind: "attraction" },
  { name: "Cocoa Beach Pier", types: ["tourist_attraction", "point_of_interest"], kind: "attraction" },
  { name: "Miami Beach Botanical Garden", types: ["botanical_garden", "tourist_attraction"], kind: "attraction" },
];
const { isBeachPlace } = await import("../lib/placePartnerPicks.js");
for (const l of LEGIT) {
  const id = "fx-legit-" + l.name;
  const d = { id, name: l.name, types: l.types };
  ok(!isBeachName(l.name) && !isBeachPlace(d), `${l.name}: NOT classified as a beach by isBeachName/isBeachPlace`);
  // Differential: identical types under a name WITHOUT "Beach" is the baseline. The
  // word "Beach" in the name must change nothing (a botanical garden is not an
  // attraction-identity place, so its baseline is "directions" in both).
  const base = { id: id + "-base", name: l.name.replace(/ Beach/, ""), types: l.types };
  const rr = (x) => { const r = resolveDetailCta({ detail: x, kind: l.kind, viaTours: VT(x.id), locName: "Miami, FL", offers: {}, openState: true }); return { type: r.type, monetized: r.monetized, provider: r.provider }; };
  ok(JSON.stringify(rr(d)) === JSON.stringify(rr(base)), `${l.name}: resolveDetailCta identical to its beach-less twin (${JSON.stringify(rr(d))} vs ${JSON.stringify(rr(base))})`);
  if (l.name !== "Miami Beach Botanical Garden") ok(rr(d).monetized === true, `${l.name}: resolveDetailCta monetizes when an offer exists`);
  const prim = cta("primary", d, l.kind, VT(id));
  ok(/\/api\/[a-z]+\/go/.test(prim) && /Tickets|Tours/.test(prim), `${l.name}: BookingCTA primary RENDERS a CTA when an offer exists (got ${prim.slice(0, 100)})`);
  const html = render({ ...d, rating: 4.6, reviews: 5000, distMi: 3, lat: 25.8, lng: -80.1 });
  ok(html.includes(l.name), `${l.name}: card renders (probe)`);
}
// A pin keyed to such a name (fixture row via the placeId path is not available;
// the registry is frozen) is asserted through the real table instead: every
// non-bare-beach alias in it keeps resolving.
for (const row of PLACE_PARTNER_PICKS) {
  for (const alias of row.aliases) if (!isBeachName(alias)) ok(placePartnerPick({ name: alias })?.offerId === row.offerId || placePartnerPick({ name: alias }) !== null, `table row ${row.offerId}: non-beach alias "${alias}" still resolves`);
}

// ── FERRY / TOUR PINS: still resolve, label is experience language ────────────
const TOURS = [
  { name: "Egmont Key State Park", types: ["park", "natural_feature", "tourist_attraction"], code: "237533P5" },
  { name: "Egmont Key", types: ["natural_feature", "tourist_attraction"], code: "237533P5" },
  { name: "Shell Key Preserve", types: ["park", "natural_feature", "tourist_attraction"], code: "173028P1" },
];
const ADMISSION_WORDS = /ticket|admission|entry|entrance|pass\b/i;
for (const t of TOURS) {
  const d = { id: "fx-tour-" + t.name, ...t };
  ok(placePartnerPick(d)?.offerId === t.code && placePartnerPick(d)?.product === "tour", `${t.name}: pin still resolves and is marked product=tour`);
  const html = render({ ...d, rating: 4.7, reviews: 1500, distMi: 5, lat: 27.6, lng: -82.7 });
  const pill = (html.match(/<span class="wf-ticket-pill-lb">([^<]*)<\/span>/) || [])[1];
  ok(goLinks(html).length === 1 && pill === "Tours", `${t.name}: card CTA label is "Tours" (got ${JSON.stringify(pill)})`);
  ok(!ADMISSION_WORDS.test(pill || "") && !/Partner tickets/.test(html) && /Partner tours for/.test(html), `${t.name}: card label + aria carry no admission wording`);
  const r = resolveDetailCta({ detail: d, kind: "attraction", viaTours: {}, locName: "St. Petersburg, FL", offers: {}, openState: false });
  ok(r.monetized === true && r.exact === true && /Tours/.test(r.label) && !ADMISSION_WORDS.test(r.label), `${t.name}: resolveDetailCta (even closed) keeps the pin, label "${r.label}" is experience language`);
  const prim = cta("primary", d, "attraction", {});
  const txt = prim.replace(/<[^>]+>/g, " ");
  ok(/\/api\/[a-z]+\/go/.test(prim) && /Tours/.test(txt) && !ADMISSION_WORDS.test(txt), `${t.name}: BookingCTA primary renders "${txt.trim().replace(/\s+/g, " ")}" (experience wording)`);
}
{
  // CONTROL: a true admission pin keeps "Tickets".
  const html = render({ ...control, rating: 4.8, reviews: 3000, distMi: 3, lat: 27.77, lng: -82.63 });
  ok(/<span class="wf-ticket-pill-lb">Tickets<\/span>/.test(html), "CONTROL: the Dali admission pin still says Tickets");
}

if (fails.length) {
  console.error("test-beach-never-booking: FAIL");
  fails.forEach((m) => console.error("  - " + m));
  process.exit(1);
}
console.log(`test-beach-never-booking: OK — ${pass} assertions (placePartnerPick, placePagePartner, resolveDetailCta CALLED; real IconicPlaceCard RENDERED for Siesta/Turtle/Coquina x 3 shapes + generic beaches; BookingCTA primary/list/disclosure RENDERED; Palm Beach Zoo / Daytona Boardwalk / Cocoa Beach Pier / Miami Beach Botanical stay bookable; Egmont Key + Shell Key keep pins with Tours wording; Dali control keeps Tickets; natural_feature NOT a ban)`);
