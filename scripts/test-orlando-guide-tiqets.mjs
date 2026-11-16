#!/usr/bin/env node
// The Orlando non park guide lists the existing exact Tiqets products through
// /api/commerce/go. The button names Tiqets. Order is the catalog list, never
// commission. Theme park products stay off the list.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { ORLANDO_EXACT_TIQETS, orlandoExactTiqetsEntry } from "../lib/orlandoGuideTickets.js";
import { PARTNER_OFFER_REGISTRY } from "../lib/partnerOfferRegistry.js";
import { PROVIDERS } from "../lib/commerceProviders.js";
import { commerceHref } from "../lib/commerce.js";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const DASH = /[\u2013\u2014]|\s-\s/;
let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } };

const entry = orlandoExactTiqetsEntry();
ok(entry.offers.length === 10, "ten exact Orlando Tiqets offers, got " + entry.offers.length);
ok(entry.offers.map((o) => o.offerId).join() === ORLANDO_EXACT_TIQETS.map(([id]) => id).join(), "order stays the editorial list");
const banned = /seaworld|aquatica|discovery-cove|fun-spot|legoland|peppa|universal|gatorland/i;
for (const offer of entry.offers) {
  const row = PARTNER_OFFER_REGISTRY[offer.offerId];
  ok(row && row.provider === "tiqets", offer.offerId + " is an existing Tiqets registry row");
  ok(offer.provider === "tiqets" && offer.buttonLabel === "Tiqets", offer.offerId + " button names Tiqets");
  ok(!banned.test(offer.offerId), offer.offerId + " is not a theme park product");
  const copy = [offer.title, offer.whoFor, offer.detail, offer.restriction, offer.buttonLabel].join(" ");
  ok(!DASH.test(copy) && !/\$\d|\bbest\b/i.test(copy), offer.offerId + " copy has no dash, price, or best claim");
  const href = commerceHref({ provider: offer.provider, offerId: offer.offerId, surface: "guide_pick", contentId: "things-to-do-orlando-not-theme-parks:" + entry.pickId, page: "g-things-to-do-orlando-not-theme-parks" });
  ok(/^\/api\/commerce\/go\?provider=tiqets&offer=/.test(href), offer.offerId + " links through /api/commerce/go");
}
ok(PROVIDERS.tiqets && PROVIDERS.tiqets.requireTracking === true, "Tiqets redirects require tracking");

const page = readFileSync(path.join(REPO, "app/guides/[slug]/page.js"), "utf8");
ok(/orlandoExactTiqetsEntry\(\)/.test(page) && /things-to-do-orlando-not-theme-parks/.test(page), "the Orlando guide renders the exact list");

const mod = await loadComponent(path.join(REPO, "app/guides/[slug]/GuidePickOffer.js"), REPO);
const html = renderToStaticMarkup(createElement(mod.default, { entry, slug: "things-to-do-orlando-not-theme-parks" }));
ok(html.includes(">Tiqets") && !/tiqets\.com/.test(html), "rendered buttons name Tiqets and carry no partner URL");
ok((html.match(/offer=orlando-hook-/g) || []).length >= 8, "rendered hrefs are commerce go offer ids");

if (fails) {
  console.error("test-orlando-guide-tiqets: " + fails + " failure(s)");
  process.exit(1);
}
console.log("test-orlando-guide-tiqets: OK");
