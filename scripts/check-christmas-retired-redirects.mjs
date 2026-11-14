#!/usr/bin/env node
// A Christmas research id that was merged into another listing keeps a valid
// destination: /florida-events/<retired id> answers a permanent redirect to
// the listing it became, never a 404, and never a redirect into a 404
// (owner, 2026-11-05; the Breakers decor duplicate folded on 2026-11-03).
// Asserted on the CALL of the helper, plus the syntactic role of the page's
// miss branch (comments and strings stripped).
import assert from "node:assert/strict";
import fs from "node:fs";
import { retiredChristmasEventTarget, CHRISTMAS_BROWSE_EVENT_IDS } from "../lib/christmasEventPage.js";
import { CHRISTMAS_RESEARCH_ALIASES } from "../lib/christmasResearch.js";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

// The reviewed consolidations resolve to their surviving listing.
for (const [from, to] of [
  ["breakers-holiday-decor-2026", "breakers-holidays-2026"],
  ["fernandina-holiday-home-tour-2026", "amelia-island-museum-of-history-holiday-home-tour-2026"],
  ["ocala-wec-winter-wonderland-2026", "wec-winter-wonderland-2026"],
  ["cocoa-village-holiday-bazaar-2026", "art-and-craft-holiday-bazaar-2026"],
]) ok(retiredChristmasEventTarget(from) === to, `${from} redirects to ${to}, got ${retiredChristmasEventTarget(from)}`);
// Christmas Eve dining is its own listing: never folded into the decor card.
ok(retiredChristmasEventTarget("breakers-christmas-dining-2026") === null, "Breakers Christmas Eve dining keeps its own page");
ok(!Object.values(CHRISTMAS_RESEARCH_ALIASES).includes("breakers-christmas-dining-2026") && CHRISTMAS_RESEARCH_ALIASES["breakers-christmas-dining-2026"] === undefined, "no alias folds the dining event");
// Unknown and live slugs are untouched.
ok(retiredChristmasEventTarget("no-such-event-2026") === null && retiredChristmasEventTarget("") === null && retiredChristmasEventTarget(undefined) === null, "an unknown slug is not redirected");
ok(retiredChristmasEventTarget("breakers-holidays-2026") === null, "the surviving listing is not itself redirected");
// No self redirect and no chain anywhere in either map.
const all = { ...CHRISTMAS_RESEARCH_ALIASES, ...CHRISTMAS_BROWSE_EVENT_IDS };
const bad = Object.entries(all).filter(([from, to]) => from === to || all[to]);
ok(bad.length === 0, "no alias points at itself or at another alias: " + bad.map((p) => p.join(" -> ")).join(", "));
ok(Object.keys(all).length >= 30, "the alias maps are populated (" + Object.keys(all).length + ")");

// The page: on a MISS it asks the helper, which confirms the landing resolves with the
// same read and redirects only then; otherwise the unchanged notFound() still runs.
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const page = strip(fs.readFileSync("app/florida-events/[slug]/page.js", "utf8"));
const helper = page.match(/async function redirectRetiredChristmasEvent\(slug\) \{([\s\S]*?)\n\}/);
ok(helper, "the page defines redirectRetiredChristmasEvent");
const body = helper[1];
ok(/retiredChristmasEventTarget\(slug\)/.test(body), "the helper asks retiredChristmasEventTarget");
ok(/fetchCuratedEventBySlug\(moved\)[\s\S]*christmasEventPageRow\(row, moved\)/.test(body), "the landing is read with the same loader before redirecting");
ok(/if \(landing\) permanentRedirect\(/.test(body) && !/\bcatch\b/.test(body), "the redirect is conditioned on a resolved landing, with no catch");
const def = page.slice(page.indexOf("export default async function CuratedEventPage"));
const iRedirect = def.indexOf("if (!e) await redirectRetiredChristmasEvent(params.slug);");
const iMiss = def.indexOf("if (!e) notFound()");
ok(iRedirect > 0 && iMiss > iRedirect, "the page tries the redirect only on a miss, then still 404s");
ok(/import \{[^}]*\bpermanentRedirect\b[^}]*\} from "next\/navigation"/.test(page), "permanentRedirect is imported from next/navigation");
// Control: the probe would catch an unconditional redirect.
ok(!/if \(landing\) permanentRedirect\(/.test("const moved = x; permanentRedirect(moved);"), "control: an unconditional redirect does not satisfy the probe");
console.log(`check-christmas-retired-redirects: OK, ${checks} assertions (${Object.keys(all).length} aliases)`);
