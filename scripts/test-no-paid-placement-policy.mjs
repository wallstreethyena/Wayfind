#!/usr/bin/env node
// scripts/test-no-paid-placement-policy.mjs — the 2026-10-18 owner policy
// fixes, pinned on RENDERED output and on the CALL, not on source strings.
//
//  1. /partners (the index) matches the no-paid-placement commitment in
//     /editorial-policy and /how-wayfind-ranks: it discloses sponsorships that
//     exist and what they never buy, and it no longer offers placement for sale.
//  2. The affiliate opportunity worklist can never carry a commission-led
//     partner instruction ("pick highest commission"): toOpportunityRow strips
//     it on the way in, whatever a writer passes.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0; const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };

// 1. /partners
const pageMod = await loadComponent(join(ROOT, "lib/sponsorPage.js"), ROOT);
const idx = renderToStaticMarkup(pageMod.PartnersIndexPage()).replace(/\s+/g, " ");
const meta = pageMod.partnersIndexMetadata();
const all = idx + " " + meta.title + " " + meta.description;
ok(!/(?<!not )sells? (a small number of )?(local )?placements?/i.test(all), "/partners no longer offers placements for sale");
ok(!/want your business here/i.test(all), "/partners carries no sales pitch to advertisers");
ok(!/pay(s)? to be featured on Wayfind/i.test(all), "/partners does not describe buying featured placement on Wayfind");
ok(/does not sell placement in its lists, guides or rankings/i.test(idx), "/partners states placement in lists/guides/rankings is not for sale");
ok(/not buy a place on any Wayfind list, guide or ranking/i.test(idx), "/partners states what a sponsorship never buys");
ok(/not buy a Wayfind Score/i.test(idx), "…including the score");
ok(/Sponsored/.test(idx) && /paid for a sponsored card/i.test(idx), "existing sponsorships are still disclosed plainly (no weakening)");
ok(idx.includes('href="/editorial-policy"') && idx.includes('href="/how-wayfind-ranks"'), "/partners links the editorial policy and ranking method");
const editorial = readFileSync(join(ROOT, "app/editorial-policy/page.js"), "utf8");
const ranks = readFileSync(join(ROOT, "app/how-wayfind-ranks/page.js"), "utf8");
ok(/no ads and no paid placement/.test(editorial) && /never changes it/.test(editorial), "/editorial-policy still says rankings carry no paid placement and commission never changes the score");
ok(/no ads and no paid placement on Wayfind/.test(ranks) && /Commission never changes what ranks or where/.test(ranks), "/how-wayfind-ranks is unchanged on the no-paid-placement commitment");

// 2. opportunity worklist
const { toOpportunityRow, neutralPartnerSuggestion } = await import("../lib/affiliateOpportunity.js");
const seeded = [
  "Tiqets or GetYourGuide (attraction tickets; pick highest commission)",
  "Viator or GetYourGuide (tours & activities; pick highest commission)",
  "Choose the best payout",
  "Tiqets (pick highest commission)",
];
for (const s of seeded) {
  const row = toOpportunityRow({ place_id: "p1", name: "X" }, { suggestedPartner: s, reason: "r" });
  ok(!/commission|payout/i.test(String(row.suggested_partner || "")), `commission-led text is stripped by the writer: ${JSON.stringify(s)} -> ${JSON.stringify(row.suggested_partner)}`);
}
ok(neutralPartnerSuggestion(seeded[0]) === "Tiqets or GetYourGuide (attraction tickets)", "the partner names and product type survive");
ok(toOpportunityRow({ place_id: "p1" }, { suggestedPartner: "viator" }).suggested_partner === "viator", "a neutral partner name is untouched");
ok(toOpportunityRow({ place_id: "p1" }, {}).suggested_partner === null, "no suggestion stays null");
const fitText = "Tiqets or GetYourGuide (attraction tickets; choose on product fit, total price, inclusions and terms)";
ok(neutralPartnerSuggestion(fitText) === fitText, "fit/price/inclusions/terms guidance is kept");

if (fails.length) { console.error("test-no-paid-placement-policy: FAIL\n - " + fails.join("\n - ")); process.exit(1); }
console.log(`test-no-paid-placement-policy: OK — ${pass} assertions`);
