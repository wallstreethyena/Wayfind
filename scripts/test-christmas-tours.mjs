#!/usr/bin/env node
// Locks the Viator Christmas light tours on /christmas-in-florida
// (lib/christmasTours.js). They are listings in the page's ONE list (owner
// direction 2026-11-01): christmasBrowseCached adds them, the Light shows
// pill finds them, a date filter never claims them, they sort with what is
// bookable today, attachBrowseTickets gives each its /api/commerce/go button,
// and ChristmasBrowse renders them with the one TicketCard. No viator.com URL
// or partner id reaches the page; dead or vanished rows drop; a failed read
// uses the snapshot; Santa's event catalog never lists them.
import assert from "node:assert/strict";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { isDeniedViatorSku } from "../lib/viatorDenylist.js";
import {
  CHRISTMAS_TOUR_CTA,
  CHRISTMAS_TOUR_ID_PREFIX,
  CHRISTMAS_TOUR_SNAPSHOT,
  CHRISTMAS_TOUR_VIA,
  christmasTourHref,
  christmasTourListings,
  christmasTourRow,
} from "../lib/christmasTours.js";
import { christmasBrowseCached, christmasBrowseFacets, christmasBrowsePills, parseChristmasBrowseQuery, withChristmasTourListings, christmasBrowseListings } from "../lib/christmasBrowse.js";
import { attachBrowseTickets, christmasTicketsModel } from "../lib/christmasTickets.js";
import { santaModelFromListings } from "../lib/santaChat.js";

const root = process.cwd();
const DASH = /[–—]|\s-\s/;
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

// Catalogue shape
const codes = CHRISTMAS_TOUR_SNAPSHOT.map((t) => t.code);
ok(codes.length >= 4, "at least four tours to choose from (" + codes.length + ")");
ok(new Set(codes).size === codes.length, "no duplicate product codes");
for (const left of ["3805P5", "28841P3", "294808P1", "294808P8"]) ok(!codes.includes(left), left + " stays out (Disney ban, low rating, or not a Christmas product)");
ok(!CHRISTMAS_TOUR_SNAPSHOT.some((t) => /mickey|disney|magic kingdom/i.test(t.name)), "no Disney product on the page");
for (const t of CHRISTMAS_TOUR_SNAPSHOT) {
  ok(/^\d+P\d+$/.test(t.code), t.code + " is a Viator product code");
  ok(!isDeniedViatorSku(t.code), t.code + " is not on the Viator HOLD denylist");
  ok(!DASH.test(t.name + t.place + t.chip) && !/\bbest\b|#1/i.test(t.name), t.code + " display copy is dash free and phrase safe");
  ok(t.fromPrice > 0 && t.rating >= 4.5 && t.reviews > 0 && t.minutes > 0, t.code + " carries price, a 4.5+ rating, reviews and duration");
  ok(/^https:\/\/media-cdn\.tripadvisor\.com\//.test(t.image), t.code + " image is on a CSP allowed host");
}

// Hrefs: our go route only, by product code, with the page and surface tags.
for (const code of codes) {
  const href = christmasTourHref(code);
  ok(/^\/api\/commerce\/go\?/.test(href), code + " books through /api/commerce/go");
  const q = new URLSearchParams(href.split("?")[1]);
  ok(q.get("provider") === "viator" && q.get("offer") === code && q.get("surface") === "christmas_tours" && q.get("page") === "christmas-in-florida", code + " href carries provider, offer, surface and page");
  ok(!/viator\.com|pid=|mcid=/.test(href), code + " href never carries a partner URL or id");
}
ok(christmasTourHref("") === null && christmasTourHref("https://www.viator.com/x") === null && christmasTourHref("3805P8") === null, "a bare, URL shaped or denied code never becomes an href");

// Ticket fields: live price and rating win, a dead row or a zero price drops the tour.
const first = CHRISTMAS_TOUR_SNAPSHOT[0];
const snapRow = christmasTourRow(first);
ok(snapRow.cta.kind === "affiliate" && snapRow.cta.label === CHRISTMAS_TOUR_CTA && snapRow.cta.via === CHRISTMAS_TOUR_VIA && snapRow.price.kind === "from" && snapRow.price.amount > 0, "a tour row is an affiliate ticket row with a from price");
const live = christmasTourRow(first, { link_ok: true, from_price: 51, rating: 4.7, reviews: 999, duration_min: 90, image: "https://evil.example/x.jpg" });
ok(live.price.text === "$51" && live.when === "1 hr 30 min tour · 4.7 ★ from 999 reviews on Viator", "live price, rating, reviews and duration win: " + live.when);
ok(live.photos[0].src === first.image && live.photos[0].credit === "Photo from Viator", "an image off the allowed hosts never replaces the snapshot image, and the photo is credited");
ok(christmasTourRow(first, { link_ok: false, from_price: 51 }) === null, "a row the sweep marked dead is dropped");
ok(christmasTourRow(first, { link_ok: true, from_price: 0 }) === null, "a live zero price is dropped, never shown as free");

// Listings: live read, dead row, failed read, vanished rows.
const env = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
const rowsOk = CHRISTMAS_TOUR_SNAPSHOT.map((t) => ({ product_code: t.code, provider: "viator", link_ok: t.code !== codes[1], from_price: t.fromPrice, rating: t.rating, reviews: t.reviews }));
let calledUrl = "";
const liveList = await christmasTourListings({ env, fetch: async (url) => { calledUrl = url; return { ok: true, json: async () => rowsOk }; } });
ok(/\/rest\/v1\/wf_experiences\?/.test(calledUrl) && calledUrl.includes("provider=eq.viator"), "the live read is the anon wf_experiences read for viator rows");
ok(liveList.length === codes.length - 1 && !liveList.some((l) => l.id === CHRISTMAS_TOUR_ID_PREFIX + codes[1]), "a live link_ok false row drops only that tour");
ok(liveList.every((l) => l.kind === "tour" && l.tourRow && l.browse_categories.includes("lights") && l.price_kind === "paid" && !l.start_date), "every tour listing is a priced Light shows listing with no claimed date");
const failed = await christmasTourListings({ env, fetch: async () => { throw new Error("down"); } });
ok(failed.length === codes.length, "a failed read lists the full snapshot");
ok((await christmasTourListings({ env: {} })).length === codes.length, "no Supabase env lists the snapshot");
ok((await christmasTourListings({ env, fetch: async () => ({ ok: true, json: async () => [] }) })).length === 0, "a tour that left the catalogue is not shown from the snapshot");

// The one list.
const TODAY = "2026-11-03";
const base = christmasBrowseListings([], TODAY);
const merged = withChristmasTourListings(base, failed);
ok(merged.length === base.length + codes.length && withChristmasTourListings(merged, failed).length === merged.length, "tours join the listings once (no duplicates on a second pass)");
ok(merged.filter((c) => c.kind === "tour").every((c) => typeof c.region === "string" && c.region), "every tour gets a research region");
const { listings, page } = await christmasBrowseCached(parseChristmasBrowseQuery({}), TODAY, async () => [], { fetchPlaces: async () => [], fetchTours: async () => failed });
const tourCards = page.cards.filter((c) => c.kind === "tour");
ok(listings.filter((c) => c.kind === "tour").length === codes.length, "christmasBrowseCached adds every tour to the listings");
ok(tourCards.length === codes.length, "every tour is on the first page of the unfiltered list");
ok(!page.cards.some((c) => "tourRow" in c), "the server only tour row never reaches the browser json");
const firstFutureTicket = page.cards.findIndex((c) => c.kind === "event" && c.start_date > TODAY);
const lastTour = page.cards.map((c) => c.kind).lastIndexOf("tour");
ok(firstFutureTicket === -1 || lastTour < firstFutureTicket, "tours sort with what is bookable today, ahead of events that start later");
// Located readers: tours sit in their own distance ring, never dumped at the end,
// and never outrank rated places on a Viator rating (no rating on the listing).
ok(listings.filter((c) => c.kind === "tour").every((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.lat > 24 && c.lat < 31.1 && c.lng > -87.7 && c.lng < -80 && !("rating" in c) && !("wfScore" in c)), "every tour listing has a Florida start point and no rating of its own");
const AUG = { lat: 29.8947, lng: -81.3145 };
const { page: augPage } = await christmasBrowseCached(parseChristmasBrowseQuery({ lat: String(AUG.lat), lng: String(AUG.lng) }), TODAY, async () => [], { fetchPlaces: async () => [], fetchTours: async () => failed });
const augTours = augPage.cards.filter((c) => c.kind === "tour");
ok(augTours.length >= 3 && augTours.slice(0, 3).every((c) => c.city === "St. Augustine" && c.distMi != null && c.distMi < 5), "a St. Augustine reader gets the St. Augustine tours first, measured from where they start");
const kwIdx = augPage.cards.findIndex((c) => c.id === CHRISTMAS_TOUR_ID_PREFIX + "5395P15");
ok(kwIdx === -1 || augPage.cards.slice(kwIdx + 1).every((c) => c.distMi == null || c.distMi >= 300), "the Key West cruise sits in its far ring for a St. Augustine reader, not ahead of nearer cards");
const lightsPill = christmasBrowsePills(listings).find((p) => p.id === "lights");
ok(!!lightsPill, "the Light shows pill is offered");
const { page: lightsPage } = await christmasBrowseCached(parseChristmasBrowseQuery({ category: "lights" }), TODAY, async () => [], { fetchPlaces: async () => [], fetchTours: async () => failed });
ok(lightsPage.cards.filter((c) => c.kind === "tour").length === codes.length, "the Light shows pill finds every tour");
const { page: decPage } = await christmasBrowseCached(parseChristmasBrowseQuery({ when: "dec" }), TODAY, async () => [], { fetchPlaces: async () => [], fetchTours: async () => failed });
ok(!decPage.cards.some((c) => c.kind === "tour"), "a date filter never claims a tour (no verified dates)");
const { page: famPage } = await christmasBrowseCached(parseChristmasBrowseQuery({ category: "family" }), TODAY, async () => [], { fetchPlaces: async () => [], fetchTours: async () => failed });
ok(!famPage.cards.some((c) => c.kind === "tour"), "the Family friendly pill never claims a tour (audience not verified)");
const { page: searched } = await christmasBrowseCached(parseChristmasBrowseQuery({ q: "St. Augustine" }), TODAY, async () => [], { fetchPlaces: async () => [], fetchTours: async () => failed });
ok(searched.cards.filter((c) => c.kind === "tour").length === CHRISTMAS_TOUR_SNAPSHOT.filter((t) => t.place === "St. Augustine").length, "a city search finds that city's tours");
ok(christmasTicketsModel(listings, TODAY).rows.every((r) => !String(r.id).startsWith(CHRISTMAS_TOUR_ID_PREFIX)), "the top ticket model never treats a tour as an event");
ok(santaModelFromListings(listings, TODAY).events.every((e) => !String(e.id).startsWith(CHRISTMAS_TOUR_ID_PREFIX)), "Santa's event catalog never lists a tour");

// Ticket fields and the rendered card.
const attached = attachBrowseTickets(page, listings, TODAY);
const tourJson = attached.cards.filter((c) => c.kind === "tour");
ok(tourJson.every((c) => c.ticketRow && c.ticketRow.cta && /^\/api\/commerce\/go\?/.test(c.ticketRow.cta.href) && c.ticketRow.photos.length === 1), "every tour card carries its go route button and its photo");
const { default: ChristmasBrowse } = await loadComponent(path.join(root, "app/components/ChristmasBrowse.js"), root);
const html = renderToStaticMarkup(createElement(ChristmasBrowse, { initial: attached, facets: { ...christmasBrowseFacets(), pills: christmasBrowsePills(listings) }, today: TODAY, initialQuery: {} }));
for (const t of CHRISTMAS_TOUR_SNAPSHOT) {
  const href = christmasTourHref(t.code).replace(/&/g, "&amp;");
  ok(html.includes('id="xb-' + CHRISTMAS_TOUR_ID_PREFIX + t.code + '"') && html.includes('href="' + href + '"'), t.code + " renders as one list card with its go href");
}
ok(!/viator\.com\/tours|pid=P0/.test(html), "no partner URL or partner id reaches the page");
ok((html.match(/>See availability ↗</g) || []).length === codes.length && (html.match(/>Tour tickets at Viator</g) || []).length === codes.length, "every tour button reads See availability with the Viator line");
const visible = html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
ok(!DASH.test(visible), "the rendered list text is dash free");
ok(!/sold out/i.test(visible), "no tour is labeled sold out");
ok(!/<h2/.test(html), "no second section heading: tours live in the one list");

console.log("test-christmas-tours: OK, " + checks + " assertions (" + codes.length + " Viator Christmas light tours in the one list, go route only)");
