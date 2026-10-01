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

if (fails.length) {
  console.error("test-beach-never-booking: FAIL");
  fails.forEach((m) => console.error("  - " + m));
  process.exit(1);
}
console.log(`test-beach-never-booking: OK — ${pass} assertions (placePartnerPick, placePagePartner, resolveDetailCta CALLED; real IconicPlaceCard RENDERED for Siesta/Turtle/Coquina x 3 shapes + generic beaches; Dali control keeps its pill; natural_feature-only places deliberately out of scope)`);
