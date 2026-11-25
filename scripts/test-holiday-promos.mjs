#!/usr/bin/env node
// scripts/test-holiday-promos.mjs — the holiday promo slot is OFF unless verified.
//
// lib/holidayPromos.js ships an EMPTY list (no verified promo exists today), and
// app/components/HolidayPromoSlot.js must then render nothing at all: no wrapper,
// no reserved space, no layout shift on /christmas-in-florida. When an entry is
// added, it shows only inside its dates, only when verified within 14 days, only
// with a same-origin href, and only with calm copy (no dashes, no pressure).
// This EXECUTES the real function and renders the real component.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { HOLIDAY_PROMOS, activeHolidayPromos, isSafePromoHref } from "../lib/holidayPromos.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const TODAY = "2026-12-10";
const valid = Object.freeze({
  id: "fixture-lights-offer",
  surfaces: ["christmas-in-florida"],
  title: "A quieter night at the lights",
  body: "Weeknight entry is easier to plan, and the partner lists a lower weeknight price.",
  href: "/api/partner/fixture/go?u=lights",
  partner: "Fixture Partner",
  claim: "15% off weeknight tickets",
  verifiedAt: "2026-12-05",
  startsOn: "2026-12-01",
  endsOn: "2026-12-24",
});
const live = (over, opts) => activeHolidayPromos("christmas-in-florida", TODAY, { promos: [{ ...valid, ...over }], ...opts });

// ── the shipped list is empty ────────────────────────────────────────────────
eq(HOLIDAY_PROMOS.length, 0, "no unverified promo ships: HOLIDAY_PROMOS is empty");
ok(Object.isFrozen(HOLIDAY_PROMOS), "the shipped list is frozen");
eq(activeHolidayPromos("christmas-in-florida", TODAY), [], "the empty list yields nothing");

// ── the filter ───────────────────────────────────────────────────────────────
eq(live({}).map((p) => p.id), ["fixture-lights-offer"], "CONTROL: a valid fixture entry passes");
eq(live({ endsOn: "2026-12-09" }), [], "an expired entry is dropped");
eq(live({ startsOn: "2026-12-11" }), [], "a future entry is dropped");
eq(live({ verifiedAt: "2026-11-20" }), [], "an entry verified more than 14 days ago is dropped");
eq(live({ verifiedAt: "2026-11-26" }).length, 1, "verified exactly 14 days ago still shows");
eq(live({ verifiedAt: "2026-12-11" }), [], "a verifiedAt in the future is dropped");
eq(live({ verifiedAt: "2026-11-20" }, { maxAgeDays: 30 }).length, 1, "maxAgeDays is honoured");
eq(live({ surfaces: ["thanksgiving-in-florida"] }), [], "an entry for another surface is dropped");
eq(live({ startsOn: "2026-02-30" }), [], "an impossible date is dropped");
eq(live({ title: "Lights — tonight only" }), [], "copy with a dash is dropped");
eq(live({ body: "Hurry, ends soon." }), [], "pressure copy is dropped");
eq(live({ claim: "" }), [], "an empty claim is dropped (leave it out instead)");
eq(live({ claim: undefined }).length, 1, "claim is optional");
for (const href of [
  "https://evil.example/go?u=1", "//evil.example/path", "/\\evil.example", "javascript:alert(1)", "/api/partner/fixture/redirect?u=1",
  "/api/../admin", "/../admin", "/guides/./x", "/christmas-in-florida\" onclick=\"x", "http://gowayfind.com/x", "", null, "/a b",
]) {
  eq(live({ href }), [], `unsafe href is dropped: ${JSON.stringify(href)}`);
  ok(!isSafePromoHref(href), `isSafePromoHref refuses ${JSON.stringify(href)}`);
}
for (const href of ["/api/partner/fixture/go?u=lights", "/api/go/viator/go?pid=1&mcid=2", "/christmas-in-florida", "/guides/christmas-lights-tampa#tickets"]) {
  ok(isSafePromoHref(href), `isSafePromoHref accepts ${href}`);
}

// ── the component ────────────────────────────────────────────────────────────
const mod = await loadComponent(path.join(root, "app/components/HolidayPromoSlot.js"), root);
const Slot = mod.default;
const html = (props) => renderToStaticMarkup(createElement(Slot, props));
eq(html({ surface: "christmas-in-florida", today: TODAY }), "", "the empty list renders nothing at all (no layout space)");
eq(html({ surface: "christmas-in-florida" }), "", "with no today prop it uses the site clock and still renders nothing");
eq(html({ surface: "christmas-in-florida", today: TODAY, promos: [{ ...valid, endsOn: "2026-12-01" }] }), "", "an expired entry renders nothing");
const card = html({ surface: "christmas-in-florida", today: TODAY, promos: [valid, { ...valid, id: "second-offer" }] });
ok(/^<aside data-holiday-promo="fixture-lights-offer"/.test(card), "a live entry renders one card");
ok(!/second-offer/.test(card), "only one card, never a stack");
ok(card.includes('href="/api/partner/fixture/go?u=lights"') && card.includes('rel="sponsored nofollow"'), "the redirector link is marked sponsored");
ok(card.includes("15% off weeknight tickets") && card.includes("Fixture Partner"), "the verified claim and partner show");
ok(!/[‐-―]/.test(card.replace(/<[^>]+>/g, "")), "the rendered copy has no dashes");
const internal = html({ surface: "christmas-in-florida", today: TODAY, promos: [{ ...valid, href: "/christmas-in-florida#browse", claim: undefined }] });
ok(internal.includes('href="/christmas-in-florida#browse"') && !internal.includes("sponsored"), "an internal link is a plain link");

// ── the page mounts it once ──────────────────────────────────────────────────
const page = readFileSync(path.join(root, "app/christmas-in-florida/page.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok(/import HolidayPromoSlot from "\.\.\/components\/HolidayPromoSlot";/.test(page), "the Christmas page imports the slot");
eq((page.match(/<HolidayPromoSlot\b/g) || []).length, 1, "the Christmas page mounts the slot once");
ok(/<HolidayPromoSlot surface="christmas-in-florida" today=\{today\} \/>/.test(page), "it is mounted for this surface with the page's site-clock today");

console.log(`test-holiday-promos: ${checks} checks passed`);
