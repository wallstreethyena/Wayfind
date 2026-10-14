#!/usr/bin/env node
// test-guide-stays — a guide opted in via lib/guideStays.js renders the verified
// hotel stay rail (surface guide_stays); an un-opted guide and an empty or
// unavailable result render nothing; the rail offers verified hotels only.
//
// WHY (2026-10-14): /guides/things-to-do-sarasota had 497 views/30d and zero
// hotel links, while the same verified-hotel rail already earns on event pages.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { guideStaysConfig, GUIDE_STAYS, guideStaysPlaces, acceptVerifiedHotel } from "../lib/guideStays.js";
import { eventStays } from "../lib/eventStays.js";
import { hotelBookingRecords } from "../lib/hotelBookingVerification.js";

const fail = (m) => { console.error("test-guide-stays: FAIL - " + m); process.exit(1); };
let passed = 0;
const ok = (c, m) => { if (!c) fail(m); passed++; };
const REPO = fileURLToPath(new URL("..", import.meta.url));
const at = (rel) => fileURLToPath(new URL("../" + rel, import.meta.url));

// Config: exactly the Sarasota guide, nothing else, valid coordinates.
ok(Object.keys(GUIDE_STAYS).join() === "things-to-do-sarasota", "only things-to-do-sarasota is opted in");
ok(guideStaysConfig("things-to-do-orlando") === null && guideStaysConfig("constructor") === null, "un-opted slugs (and prototype keys) have no config");
const cfg = guideStaysConfig("things-to-do-sarasota");
ok(cfg && Math.abs(cfg.lat - 27.33) < 0.1 && Math.abs(cfg.lng + 82.53) < 0.1, "Sarasota anchor is in Sarasota");
ok(hotelBookingRecords().length >= 30, "the verified-hotel allow-list is present (" + hotelBookingRecords().length + ")");

// Wiring in the page: after the FAQ, before the related block, slug-keyed.
const page = readFileSync(at("app/guides/[slug]/page.js"), "utf8");
const iStays = page.indexOf("<GuideStays slug={params.slug} />");
ok(iStays > page.indexOf("Good to know") && iStays < page.indexOf('className="wf-guide-related" aria-labelledby'), "GuideStays sits after the FAQ and before related content");

// Real eventStays() with injected readers: one VERIFIED Sarasota hotel (Art Ovation),
// one unverified, both lodging, unverified ranks higher on score.
const row = (id, name, lat, lng, rating, reviews) => ({ id, displayName: { text: name }, location: { latitude: lat, longitude: lng }, types: ["lodging", "hotel"], primaryType: "hotel", rating, userRatingCount: reviews, formattedAddress: "1 Main St, Sarasota, FL", businessStatus: "OPERATIONAL" });
const inv = [row("ChIJn_4zMBJAw4gRnyPviItiNRs", "Art Ovation Hotel, Autograph Collection", 27.336549, -82.544937, 4.4, 900), row("ChIJunverifiedunverifiedxx", "Some Other Inn", 27.34, -82.53, 4.9, 3000)];
const opts = { readOwned: async () => [], readInventory: async () => inv };
const all = await eventStays({ lat: cfg.lat, lng: cfg.lng }, opts);
ok(all.places.length === 2, "unfiltered eventStays keeps both hotels (default behavior unchanged)");
ok(acceptVerifiedHotel({ id: "ChIJn_4zMBJAw4gRnyPviItiNRs" }) === true && acceptVerifiedHotel({ id: "ChIJunverifiedunverifiedxx" }) === false && acceptVerifiedHotel({}) === false, "acceptVerifiedHotel passes only allow-listed hotels");
const only = await eventStays({ lat: cfg.lat, lng: cfg.lng }, { ...opts, accept: acceptVerifiedHotel });
ok(only.places.length === 1 && only.places[0].id === "ChIJn_4zMBJAw4gRnyPviItiNRs", "accept narrows candidates to the verified hotel before selection");

const read = async () => only;
const found = await guideStaysPlaces("things-to-do-sarasota", read);
ok(found && found.places.length === 1, "opted-in guide with qualifying hotels yields a rail");
ok(await guideStaysPlaces("things-to-do-orlando", read) === null, "a guide without config yields no rail");
ok(await guideStaysPlaces("things-to-do-sarasota", async () => ({ places: [], unavailable: false })) === null, "zero hotels yields no section");
ok(await guideStaysPlaces("things-to-do-sarasota", async () => ({ places: only.places, unavailable: true })) === null, "unavailable inventory yields no section (never a notice)");

// Render the real cards: the verified hotel links through /api/hotels/go.
const cards = (await loadComponent(at("app/components/EventStayCards.js"), REPO)).default;
const html = renderToStaticMarkup(createElement(cards, { places: found.places, surface: "guide_stays", title: "Where to stay in Sarasota" }));
ok(html.includes("Where to stay in Sarasota"), "rail title renders");
ok(/href="\/api\/hotels\/go\?[^"]*content=ChIJn_4zMBJAw4gRnyPviItiNRs/.test(html), "verified hotel renders a Check rates link through /api/hotels/go");
ok((html.match(/\/api\/hotels\/go\?/g) || []).length === 1 && !html.includes("Some Other Inn"), "no unverified hotel appears");
const src = readFileSync(at("app/components/GuideStays.js"), "utf8");
ok(src.includes("We may earn a commission when you book through partner links"), "rail carries the partner disclosure");
ok(/surface="guide_stays"/.test(src) && /accept: acceptVerifiedHotel/.test(src), "rail is tagged surface guide_stays and reads verified hotels only");
const cta = readFileSync(at("app/components/BookingCTA.js"), "utf8");
ok(/surface: commerceSurface \|\| "detail_primary"/.test(cta) && /commerceSurface\) \|\| "detail_primary"/.test(cta), "hotel impression and click both carry the guide_stays surface");
ok(/commerceSurface=\{surface === "guide_stays"/.test(readFileSync(at("app/components/EventStayCards.js"), "utf8")), "EventStayCards passes the guide surface to the CTA");

console.log(`test-guide-stays: ${passed} checks passed`);
