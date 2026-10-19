#!/usr/bin/env node
// scripts/test-no-paid-placement-policy.mjs — owner policy, 2026-10-19.
// Rankings, list order, guide picks, and the Wayfind Score are never paid
// for. A labeled sponsorship ("Sponsored · Paid partner") may appear outside
// those lists. Pinned on RENDERED output, not on source strings.
//
//  1. /editorial-policy, /how-wayfind-ranks, /partners, and the Rio partner
//     page say the same thing, and none of them claims the site has no ads
//     and no paid placement or that a business "pays to be featured".
//  2. The affiliate opportunity worklist can never carry a commission-led
//     partner instruction ("pick highest commission"): toOpportunityRow strips
//     it on the way in, whatever a writer passes.
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0; const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };

const NEVER_PAID = /Rankings, list order, guide picks, and the Wayfind Score are never paid for/;
const COMMISSION = /affiliate commission never changes|Commission never changes what ranks or where|Affiliate potential never changes what we recommend or where it ranks/;
const LABEL = /Sponsored · Paid partner/;
const OUTSIDE = /outside ranked lists/;
const NO_SCORE = /no effect on a Wayfind Score|does not buy a Wayfind Score|no advertiser can move it/;
const ABSOLUTE = /no ads and no paid placement|pays to be featured|If a sponsored slot ever appears/i;

function policySurface(name, text) {
  ok(NEVER_PAID.test(text), `${name} says rankings, list order, guide picks, and the Wayfind Score are never paid for`);
  ok(COMMISSION.test(text), `${name} says commission never changes rankings or picks`);
  ok(LABEL.test(text), `${name} names the label Sponsored · Paid partner`);
  ok(OUTSIDE.test(text), `${name} places a sponsorship outside ranked lists`);
  ok(NO_SCORE.test(text), `${name} says a sponsorship does not change a Wayfind Score`);
  ok(!ABSOLUTE.test(text), `${name} does not claim there are no ads and no paid placement, or that anyone pays to be featured`);
}

const pageMod = await loadComponent(join(ROOT, "lib/sponsorPage.js"), ROOT);
const editorialMod = await loadComponent(join(ROOT, "app/editorial-policy/page.js"), ROOT);
const ranksMod = await loadComponent(join(ROOT, "app/how-wayfind-ranks/page.js"), ROOT);
const Editorial = editorialMod.default;
const Ranks = ranksMod.default;
const editorial = renderToStaticMarkup(Editorial()).replace(/\s+/g, " ")
  + " " + editorialMod.metadata.description;
const ranks = renderToStaticMarkup(Ranks()).replace(/\s+/g, " ")
  + " " + ranksMod.metadata.description + " " + ranksMod.metadata.openGraph.description;
const idx = renderToStaticMarkup(pageMod.PartnersIndexPage()).replace(/\s+/g, " ");
const meta = pageMod.partnersIndexMetadata();
const partners = idx + " " + meta.title + " " + meta.description;
const rio = renderToStaticMarkup(pageMod.SponsorPage({ slug: "rio-body-wax-gastonia" })).replace(/\s+/g, " ");

policySurface("/editorial-policy", editorial);
policySurface("/how-wayfind-ranks", ranks);
policySurface("/partners", partners);
policySurface("/partners/rio-body-wax-gastonia", rio);

ok(!/(?<!not )sells? (a small number of )?(local )?placements?/i.test(partners), "/partners no longer offers placements for sale");
ok(!/want your business here/i.test(partners), "/partners carries no sales pitch to advertisers");
ok(/does not sell placement in its lists, guides or rankings/i.test(idx), "/partners states placement in lists/guides/rankings is not for sale");
ok(/not buy a place on any Wayfind list, guide or ranking/i.test(idx), "/partners states what a sponsorship never buys");
ok(/Rio Body Wax in Gastonia/.test(idx) && /Rio Body Wax in Gastonia/.test(meta.description), "/partners names the live Rio Body Wax Gastonia sponsorship");
ok(idx.includes('href="/editorial-policy"') && idx.includes('href="/how-wayfind-ranks"'), "/partners links the editorial policy and ranking method");
ok(rio.includes('href="/editorial-policy"') && rio.includes('href="/how-wayfind-ranks"'), "the Rio page links the editorial policy and ranking method");
ok(!/highest-rated/i.test(rio), "the Rio partner page does not claim to be the highest-rated waxing room");
ok(!/Gaston County by review volume/i.test(rio), "the Rio partner page does not make an unsourced county ranking");
ok(/as of August 23, 2026/.test(rio), "the Google review count is dated to the snapshot we actually have");
ok(/cannot buy it/.test(ranks) && /Commission never changes what ranks or where/.test(ranks), "/how-wayfind-ranks still says a business cannot buy the score and commission never changes rank");
ok(/may earn Wayfind a commission/.test(editorial) && /Affiliate potential never changes/.test(editorial), "/editorial-policy keeps the affiliate disclosure");

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
