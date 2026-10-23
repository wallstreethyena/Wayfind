#!/usr/bin/env node
/**
 * test-ws-game3-offer — TicketNetwork offer for World Series Game 3 at
 * Tropicana Field (Brewers at Rays, Mon Oct 26 2026, 8 PM ET).
 *
 * Locks the CJ wrap, the reel sid, the inclusive ET expiry, the venue
 * fallback, the sports-menu and Florida-shows filters, the Trop place pin,
 * and the trending-guide button plus the visible commission line.
 * Dates are arguments, so the assertions do not depend on the CI clock.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const DEST = "https://www.ticketnetwork.com/tickets/8173590/world-series:-tampa-bay-rays-vs.-milwaukee-brewers-home-game-1-series-game-3-tickets-mon-oct-26-2026-tropicana-field";
const VENUE = "https://www.ticketnetwork.com/e/venues/tropicana-field-tickets";
const PRICE_OR_SEAT = /\$\d|★|\b\d[\d,]*\s+reviews\b|\b\d+\s+seats?\b|\bratings?\b/i;

const constants = await import("../lib/wsGame3Offer.js");
const { partnerOfferById, ticketnetworkDestination } = await import("../lib/partnerOfferRegistry.js");
const { resolveOffer } = await import("../lib/commerceProviders.js");
const { tnRawPathDeepLink } = await import("../lib/deals.js");
const { menuPartnerOffersFor } = await import("../lib/menuPartnerOffers.js");
const { placePartnerPick, PLACE_PARTNER_PICKS } = await import("../lib/placePartnerPicks.js");
const offersLib = await import("../lib/guidePickOffers.js");
const { SHOW_OFFERS, offerContext } = await import("../lib/paidFloridaLanding.js");
const { commerceHref } = await import("../lib/commerce.js");
const { GUIDE_OFFER_COMMISSION_LINE } = await import("../lib/affiliateDisclosure.js");
const { GUIDES } = await import("../lib/guides.js");

const {
  WS_GAME3_OFFER_ID, TROP_VENUE_OFFER_ID, WS_GAME3_EXPIRES, WS_GAME3_FALLBACK_START,
  WS_GAME3_REEL_SID, WS_GAME3_CTA, WS_GAME3_GUIDE_SLUG, WS_GAME3_PICK_ID,
  WS_GAME3_REEL_PATH, WS_GAME3_REEL_URL, calendarDayStillLive,
} = constants;

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

function nextUtcDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

const constantsSrc = readFileSync(path.join(REPO, "lib/wsGame3Offer.js"), "utf8");
ok(!/ticketnetwork\.com|anrdoezrs\.net/.test(constantsSrc), "client-safe constants carry no partner or CJ URL");
ok(!/from\s+["'][^"']*partnerOfferRegistry/.test(constantsSrc), "client-safe constants do not import the destination registry");
ok(calendarDayStillLive(WS_GAME3_EXPIRES, "2026-10-22") === true, "Oct 22 ET is live");
ok(calendarDayStillLive(WS_GAME3_EXPIRES, "2026-10-26") === true, "Oct 26 ET, the game day, is still live");
ok(calendarDayStillLive(WS_GAME3_EXPIRES, "2026-10-27") === false, "Oct 27 ET is expired");
ok(calendarDayStillLive(WS_GAME3_EXPIRES, "") === false, "a dated offer with no day fails closed");
ok(calendarDayStillLive(null, "2026-10-27") === true, "an undated row stays live");
ok(WS_GAME3_FALLBACK_START === nextUtcDay(WS_GAME3_EXPIRES), "the venue fallback starts the next calendar day");
ok(WS_GAME3_CTA === "Check dates and price", "the button copy is Check dates and price");
ok(WS_GAME3_REEL_SID === "reel-ws-g3", "the reel sid is stable");

const row = partnerOfferById(WS_GAME3_OFFER_ID, "ticketnetwork");
ok(row && row.destination === DEST, "registry destination is the Game 3 TicketNetwork page");
ok(row && row.expires === WS_GAME3_EXPIRES && row.fallbackOfferId === TROP_VENUE_OFFER_ID, "registry carries the inclusive expiry and the venue fallback id");
ok(partnerOfferById(TROP_VENUE_OFFER_ID, "ticketnetwork")?.destination === VENUE, "the Tropicana Field venue page is unchanged");
ok(ticketnetworkDestination(WS_GAME3_OFFER_ID, "2026-10-26") === DEST, "resolver returns the Game 3 page through Oct 26");
ok(ticketnetworkDestination(WS_GAME3_OFFER_ID, "2026-10-27") === VENUE, "resolver returns the venue page on Oct 27");
ok(ticketnetworkDestination(TROP_VENUE_OFFER_ID, "2026-10-27") === VENUE, "the venue id itself stays the venue page");

const live = await resolveOffer("ticketnetwork", WS_GAME3_OFFER_ID, { today: "2026-10-22", subId: WS_GAME3_REEL_SID });
const liveCj = tnRawPathDeepLink(DEST, WS_GAME3_REEL_SID);
ok(!live.error && live.dest === liveCj, "live resolve is the CJ raw-path wrap with sid reel-ws-g3 (got " + (live.error || live.dest) + ")");
ok(live.dest === "https://www.anrdoezrs.net/links/101643573/type/dlg/sid/reel-ws-g3/" + DEST, "the wrapped URL keeps PID 101643573 and the event path");
const expired = await resolveOffer("ticketnetwork", WS_GAME3_OFFER_ID, { today: "2026-10-27", subId: WS_GAME3_REEL_SID });
ok(!expired.error && expired.dest === tnRawPathDeepLink(VENUE, WS_GAME3_REEL_SID), "after expiry the same offer id still attributes and lands on the venue page");
ok(commerceHref({ provider: "ticketnetwork", offerId: WS_GAME3_OFFER_ID, surface: WS_GAME3_REEL_SID }) === WS_GAME3_REEL_PATH, "the reel path is the commerceHref the sticker uses");
ok(WS_GAME3_REEL_URL === "https://www.gowayfind.com" + WS_GAME3_REEL_PATH, "the tappable sticker URL is the production commerce path");

const geo = { lat: 27.7676, lng: -82.6403 };
const liveMenu = menuPartnerOffersFor("nightlife", "sports", { ...geo, today: "2026-10-22" });
const gameRow = liveMenu.find((r) => r.offerId === WS_GAME3_OFFER_ID);
ok(!!gameRow && liveMenu.some((r) => r.offerId === TROP_VENUE_OFFER_ID), "sports menu shows Game 3 and keeps the venue row");
ok(gameRow && gameRow.title === "World Series Game 3 at Tropicana Field" && !("price" in gameRow) && !("rating" in gameRow) && !("reviews" in gameRow), "menu row names the game and carries no price or rating");
ok(gameRow && !PRICE_OR_SEAT.test(gameRow.title + " " + gameRow.venue), "menu copy has no price, rating, or seat count");
const deadMenu = menuPartnerOffersFor("nightlife", "sports", { ...geo, today: "2026-10-27" });
ok(!deadMenu.some((r) => r.offerId === WS_GAME3_OFFER_ID) && deadMenu.some((r) => r.offerId === TROP_VENUE_OFFER_ID), "sports menu drops Game 3 on Oct 27 and keeps the venue");

const stored = PLACE_PARTNER_PICKS.filter((r) => r.aliases.includes("Tropicana Field"));
ok(stored.length >= 1 && stored.every((r) => r.offerId === TROP_VENUE_OFFER_ID), "the stored Trop pin remains the venue offer");
const livePin = placePartnerPick({ name: "Tropicana Field" }, undefined, "2026-10-22");
ok(livePin && livePin.offerId === WS_GAME3_OFFER_ID && livePin.ctaLabel === WS_GAME3_CTA && livePin.provider === "ticketnetwork", "the live Trop pin opens Game 3 with the button label");
const lastPin = placePartnerPick({ name: "Tropicana Field" }, undefined, "2026-10-26");
ok(lastPin && lastPin.offerId === WS_GAME3_OFFER_ID, "the pin is still Game 3 on Oct 26");
const deadPin = placePartnerPick({ name: "Tropicana Field" }, undefined, "2026-10-27");
ok(deadPin && deadPin.offerId === TROP_VENUE_OFFER_ID && !deadPin.ctaLabel, "on Oct 27 the pin is the venue row again");
ok(placePartnerPick({ name: "Amalie Arena" }, undefined, "2026-10-22")?.offerId === "tampa-venue-amalie-arena", "a different venue pin is unchanged");

const guide = GUIDES[WS_GAME3_GUIDE_SLUG];
ok(!!guide && guide.picks.filter((p) => p.id === WS_GAME3_PICK_ID).length === 1, "the trending guide attaches one stable pick id");
ok(!guide.picks.some((p) => p.placeId || p.bookQuery || p.viatorUrl), "trending picks still carry no place id and no partner booking field");
const rawOffers = offersLib.GUIDE_PICK_OFFERS[WS_GAME3_GUIDE_SLUG][WS_GAME3_PICK_ID].offers;
const BAD = [/\$\d/, /★/, /\b\d[\d,]*\s+reviews\b/i, /\bbest\b/i, /\bcheapest\b/i, /(?<!never |isn't |not )guaranteed/i, /\bsave\b/i, /\b\d+\s+seats?\b/i];
for (const x of rawOffers) {
  const copy = [x.title, x.whoFor, x.detail, x.meet, x.objection, x.restriction, x.kicker, x.fitLabel].filter(Boolean).join(" ");
  for (const rx of BAD) ok(!rx.test(copy), WS_GAME3_PICK_ID + "/" + x.offerId + " copy free of " + rx);
}
const liveGuide = offersLib.guidePickOffers(WS_GAME3_GUIDE_SLUG, { id: WS_GAME3_PICK_ID }, "2026-10-26");
ok(liveGuide && liveGuide.offers.length === 1 && liveGuide.offers[0].offerId === WS_GAME3_OFFER_ID, "the guide shows only Game 3 on Oct 26");
const deadGuide = offersLib.guidePickOffers(WS_GAME3_GUIDE_SLUG, { id: WS_GAME3_PICK_ID }, "2026-10-27");
ok(deadGuide && deadGuide.offers.length === 1 && deadGuide.offers[0].offerId === TROP_VENUE_OFFER_ID, "the guide shows only the venue page on Oct 27");

const mod = await loadComponent(path.join(REPO, "app/guides/[slug]/GuidePickOffer.js"), REPO);
const html = renderToStaticMarkup(createElement(mod.default, { entry: liveGuide, slug: WS_GAME3_GUIDE_SLUG }));
const ctaAt = html.indexOf(WS_GAME3_CTA);
const discAt = html.indexOf(GUIDE_OFFER_COMMISSION_LINE);
ok(ctaAt > -1 && discAt > ctaAt, "the commission sentence is visible text after the button");
ok(html.includes("#E6EDF3") && html.includes("font-size:13px"), "the commission line is 13px #E6EDF3");
ok(html.includes("min-height:44px"), "the button meets a 44px tap height");
ok(html.includes("This game") && html.includes(">For:</strong>"), "the game card uses its own kicker and fit label");
ok(!html.includes("Best for") && !html.includes("Book the guided version"), "the game card does not use the tour chrome");
ok(html.includes("offer=" + WS_GAME3_OFFER_ID) && html.includes("surface=guide_pick"), "the guide link is our commerce redirect");
ok(!/ticketnetwork\.com|anrdoezrs\.net/.test(html) && !PRICE_OR_SEAT.test(html), "the rendered card has no partner URL, price, rating, or seat count");
const htmlNext = renderToStaticMarkup(createElement(mod.default, { entry: deadGuide, slug: WS_GAME3_GUIDE_SLUG }));
ok(htmlNext.includes("offer=" + TROP_VENUE_OFFER_ID) && !htmlNext.includes("offer=" + WS_GAME3_OFFER_ID), "after expiry the guide link is the venue offer");
ok(htmlNext.includes(WS_GAME3_CTA) && htmlNext.includes(GUIDE_OFFER_COMMISSION_LINE), "the venue fallback keeps the button and the disclosure");

const liveShows = constants.dropExpiredOffers(SHOW_OFFERS, "2026-10-22");
const deadShows = constants.dropExpiredOffers(SHOW_OFFERS, "2026-10-27");
ok(liveShows.some((o) => o.offerId === WS_GAME3_OFFER_ID) && liveShows.some((o) => o.offerId === TROP_VENUE_OFFER_ID), "Florida shows keeps Game 3 and the venue while live");
ok(!deadShows.some((o) => o.offerId === WS_GAME3_OFFER_ID) && deadShows.some((o) => o.offerId === TROP_VENUE_OFFER_ID), "Florida shows drops Game 3 on Oct 27");
const note = offerContext({ offerId: WS_GAME3_OFFER_ID, provider: "ticketnetwork" });
ok(typeof note === "string" && note.length > 30 && !PRICE_OR_SEAT.test(note) && !/–|—| - /.test(note), "Florida card context names the game without a price, a rating, a seat count, or a dash");
const pageSrc = readFileSync(path.join(REPO, "app/go/florida/page.js"), "utf8");
const cssSrc = readFileSync(path.join(REPO, "app/go/florida/florida.module.css"), "utf8");
ok(pageSrc.includes("styles.offerDisclosure") && pageSrc.includes("GUIDE_OFFER_COMMISSION_LINE") && pageSrc.includes("dropExpiredOffers"), "the Florida card prints the disclosure under the Game 3 CTA and filters expiry");
ok(/\.offerDisclosure\s*\{[^}]*font-size:\s*13px[^}]*color:\s*#E6EDF3/.test(cssSrc), "the Florida disclosure is 13px and #E6EDF3, not the muted 11px line");
ok(/exactPartner\.ctaLabel \|\| partnerTicketLabel/.test(readFileSync(path.join(REPO, "lib/detailCta.js"), "utf8")), "the detail primary uses the dated button label when the pin sets one");

if (fail.length) {
  console.error("test-ws-game3-offer: FAIL\n  - " + fail.join("\n  - "));
  process.exit(1);
}
console.log("test-ws-game3-offer: OK — " + pass + " assertions (CJ wrap, reel sid, ET expiry, venue fallback, sports menu, Trop pin, guide button and disclosure, Florida shows)");
