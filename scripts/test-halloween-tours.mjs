#!/usr/bin/env node
// Locks the Viator ghost tour section on /halloween-in-florida: every card books
// through /api/commerce/go by product code (never a viator.com URL in the page),
// merit order, live overlay, dead rows dropped, snapshot fallback on a failed
// read, dash free copy, and the rendered markup.
import assert from "node:assert/strict";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { halloweenBrowse, halloweenBrowseCards } from "../lib/halloweenBrowse.js";
import { halloweenHauntModel, withHalloweenHauntLocations, HAUNT_BROWSE_PLACE } from "../lib/halloweenHauntVault.js";
import { isDeniedViatorSku } from "../lib/viatorDenylist.js";
import { destinationUrl } from "../lib/destinations.js";
import { viatorCampaign, withViatorTracking } from "../lib/affiliates.js";
import {
  FEATURED_GHOST_TOUR_CODES,
  GHOST_DESTINATIONS,
  HALLOWEEN_TOUR_CTA,
  TOUR_REGIONS,
  TOUR_EVENT_CODES,
  TOUR_REMOVED,
  TOUR_SNAPSHOT,
  featuredGhostTours,
  ghostDestinationHref,
  ghostDestinationProductUrl,
  halloweenToursSchema,
  snapshotTours,
  tourCard,
  tourDuration,
  tourHref,
  tourMerit,
  withHalloweenTours,
  PARTNER_TOURS,
  partnerTourCard,
  partnerTours,
} from "../lib/halloweenTours.js";

const root = process.cwd();
const DASH = /[-–—]/;
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

// Catalogue shape
const codes = TOUR_SNAPSHOT.map((t) => t.code);
ok(codes.length >= 40, "at least 40 Florida tours in the snapshot (" + codes.length + ")");
for (const gone of Object.keys(TOUR_REMOVED)) ok(!codes.includes(gone), "audit removed " + gone + " stays removed: " + TOUR_REMOVED[gone]);
ok(!TOUR_SNAPSHOT.some((t) => /Creatures of the Night|Mickey/i.test(t.name)), "no Viator tour duplicates the ZooTampa or Mickey haunt cards");
ok(!TOUR_SNAPSHOT.some((t) => /kayak/i.test(t.name)), "no kayak tours on a Halloween page");
for (const c of TOUR_EVENT_CODES) ok(codes.includes(c), "event code " + c + " is a real snapshot row");
ok(new Set(codes).size === codes.length, "no duplicate product codes");
const regionIds = new Set(TOUR_REGIONS.map((r) => r.id));
for (const t of TOUR_SNAPSHOT) {
  ok(/^\d+(?:P\d+|OLDJAIL)$/.test(t.code), t.code + " is a Viator product code");
  ok(!isDeniedViatorSku(t.code), t.code + " is not on the Viator HOLD denylist");
  ok(regionIds.has(t.region) && t.region !== "all", t.code + " has a real region");
  ok(!DASH.test(t.name + t.place) && !/\bbest\b|#1/i.test(t.name), t.code + " display name is dash free and phrase safe");
  ok(t.fromPrice > 0 && t.rating > 0 && t.reviews > 0 && t.minutes > 0, t.code + " snapshot carries price, rating, reviews, duration");
  ok(/^https:\/\/media-cdn\.tripadvisor\.com\//.test(t.image), t.code + " image is on a CSP allowed host");
}

// Href: our redirect, provider viator, product code, surface, content, page
const href = tourHref("38620P1");
ok(href === "/api/commerce/go?provider=viator&offer=38620P1&surface=halloween_haunts&content=hw-tour-38620P1&page=halloween-in-florida", "tour href is the commerce redirect: " + href);
ok(tourHref("https://www.viator.com/x") === null && tourHref("") === null, "red-prove: a URL or blank code never becomes an href");

// Destination links: tracked redirect, distinct campaign surfaces, dash free labels.
const campaigns = [];
for (const dest of GHOST_DESTINATIONS) {
  ok(!DASH.test(dest.label), dest.id + " label is dash free: " + dest.label);
  const product = ghostDestinationProductUrl(dest);
  const href = ghostDestinationHref(dest);
  ok(product && product.includes("/" + dest.destId + "-ttd") && !/searchResults/i.test(product), dest.id + " is a destination page");
  if (dest.market) ok(product === withViatorTracking(destinationUrl("viator", dest.market)), dest.id + " uses the destinations.js url with Viator tracking");
  const u = new URL(href, "https://www.gowayfind.com");
  ok(u.pathname === "/api/viator/go", dest.id + " goes through /api/viator/go");
  ok(u.searchParams.get("product") === product, dest.id + " product param is the destination url");
  ok(u.searchParams.get("surface") === dest.surface, dest.id + " surface tag");
  ok(u.searchParams.get("page") === "halloween-in-florida", dest.id + " keeps the halloween page tag");
  const last = new URL(product).pathname.split("/").filter(Boolean).pop() || "";
  const offerId = (last.match(/^d\d+-([A-Za-z0-9]+)$/) || [])[1];
  campaigns.push(viatorCampaign({ page: "halloween-in-florida", surface: dest.surface, offerId }));
}
ok(campaigns.every(Boolean) && new Set(campaigns).size === GHOST_DESTINATIONS.length, "destination campaigns are distinct: " + campaigns.join(" | "));
ok(ghostDestinationHref(null) === null && ghostDestinationProductUrl({}) === null, "red-prove: a blank destination never becomes an href");

// Merit order: big review counts beat tiny perfect scores
ok(tourMerit({ rating: 4.7, reviews: 2479 }) > tourMerit({ rating: 5, reviews: 5 }), "2479 reviews at 4.7 outranks 5 reviews at 5.0");
const snap = snapshotTours();
ok(snap.length === TOUR_SNAPSHOT.length, "snapshot renders every tour");
const featured = featuredGhostTours(snap);
ok(featured.map((t) => t.id).join(",") === FEATURED_GHOST_TOUR_CODES.join(","), "featured order is the approved product list");
ok(featuredGhostTours(snap.filter((t) => t.id !== "38620P1")).length === FEATURED_GHOST_TOUR_CODES.length - 1, "a product missing from the catalogue is omitted, not invented");
ok(featuredGhostTours([]).length === 0, "no tours means no featured cards");
for (const t of featured) {
  ok(t.fromPrice > 0 && t.rating > 0 && t.reviews > 0 && /^https:\/\//.test(t.photo.src), t.id + " featured card uses stored price, rating, reviews and image");
  ok(!DASH.test([t.name, t.place, t.ratingLabel, t.duration, t.cta.label, t.cta.via].join(" ")), t.id + " featured copy is dash free");
}
for (let i = 1; i < snap.length; i += 1) ok(tourMerit(snap[i - 1]) >= tourMerit(snap[i]), "merit order holds at " + i);
ok(tourDuration(90) === "1 hr 30 min" && tourDuration(60) === "1 hr" && tourDuration(120) === "2 hrs" && tourDuration(20) === "20 min", "duration labels");

// Live overlay: live price wins, bad image host refused
const base = TOUR_SNAPSHOT[0];
const over = tourCard(base, { from_price: 99, rating: 4.1, reviews: 9999, duration_min: 45, image: "https://evil.example/a.jpg" });
ok(over.fromPrice === 99 && over.reviews === 9999 && over.duration === "45 min", "live row overlays price, reviews, duration");
ok(over.photo.src === base.image, "red-prove: an image off the allowed hosts keeps the snapshot image");

// withHalloweenTours: live read, dead row dropped, missing row dropped
const env = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
const dead = codes[1];
const missing = codes[2];
let seenUrl = "";
const fakeFetch = async (url) => {
  seenUrl = url;
  const rows = TOUR_SNAPSHOT.filter((t) => t.code !== missing).map((t) => ({
    // Synthetic exact product coordinates, not a destination/city fallback.
    ...(t.code === codes[0] ? { lat: 27.9506, lng: -82.4572 } : t.code === codes[3] ? { lat: 28.5, lng: -81.4 } : {}),
    product_code: t.code, provider: "viator", from_price: t.fromPrice + 1, rating: t.rating, reviews: t.reviews, duration_min: t.minutes, image: t.image, link_ok: t.code !== dead,
  }));
  return { ok: true, json: async () => rows };
};
const model = halloweenHauntModel({ now: "2026-10-29T12:00:00-04:00" });
const live = await withHalloweenHauntLocations(await withHalloweenTours(model, { env, fetch: fakeFetch }), {
  now: Date.parse("2026-10-29T12:00:00-04:00"), env,
  fetch: async () => ({ ok: true, json: async () => [["howlTampa", 27.9506, -82.4572], ["zooTampa", 27.98, -82.46], ["hhn", 28.5, -81.4]].map(([id, lat, lng]) => ({
    place_id: HAUNT_BROWSE_PLACE[id], independent_coords: [{ source: "wikidata", lat, lng }],
  })) }),
});
ok(/wf_experiences/.test(seenUrl) && /provider=eq\.viator/.test(seenUrl), "reads wf_experiences for viator rows");
const liveAll = [...live.tours, ...live.eventTours];
ok(liveAll.length === TOUR_SNAPSHOT.length - 2, "dead and vanished rows are dropped");
ok(!liveAll.some((t) => t.id === dead) && !liveAll.some((t) => t.id === missing), "dropped rows do not render");
ok(live.tours.every((t) => t.group === "ghost") && live.eventTours.every((t) => t.group === "event" && t.filters.includes("local")), "ghost tours and haunted attractions are split by group");
ok(liveAll.every((t) => t.fromPrice === TOUR_SNAPSHOT.find((s) => s.code === t.id).fromPrice + 1), "live prices win");
ok(live.haunts.length === model.haunts.length && live.tourRegions === TOUR_REGIONS, "haunts untouched, regions attached");
const failed = await withHalloweenTours(model, { env, fetch: async () => { throw new Error("down"); } });
ok(failed.tours.length + failed.eventTours.length === TOUR_SNAPSHOT.length, "a failed read renders the snapshot, never an empty section");
const noEnv = await withHalloweenTours(model, { env: {} });
ok(noEnv.tours.length + noEnv.eventTours.length === TOUR_SNAPSHOT.length, "no Supabase env renders the snapshot");

// 2026-10-29 identity audit: one card per product and per name, none repeats a haunt card
ok(new Set(TOUR_SNAPSHOT.map((t) => t.code)).size === TOUR_SNAPSHOT.length, "tour product codes are unique");
const tourNameKey = (t) => t.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
ok(new Set(TOUR_SNAPSHOT.map(tourNameKey)).size === TOUR_SNAPSHOT.length, "tour names are unique");
const hauntKeys = model.haunts.map((h) => tourNameKey(h));
ok(TOUR_SNAPSHOT.every((t) => !hauntKeys.some((k) => k.includes(tourNameKey(t)) || tourNameKey(t).includes(k))), "no tour card repeats a haunt card (same venue or event)");
ok(![...live.tours, ...live.eventTours].some((t) => /sold out|unavailable/i.test(JSON.stringify(t))), "no tour card claims sold out or unavailable (Viator selling_out is a demand flag, not proof)");
ok(model.haunts.every((h) => h.id !== "sideshowObscura"), "the Sideshow Obscura store is not in the haunt collection");

// Schema
const schema = halloweenToursSchema(live.tours, "https://www.gowayfind.com/halloween-in-florida");
ok(schema["@type"] === "ItemList" && schema.numberOfItems === live.tours.length, "tour schema is an ItemList of every card");
ok(!JSON.stringify(schema).includes("/api/commerce/go") && !JSON.stringify(schema).includes("viator.com"), "schema never embeds the redirect or a partner URL");

// The default SSR page has no location and therefore no listing cards. Every
// catalogue card is still rendered in isolation to preserve all facts and links.
const { default: BoHalloweenHaunt, TourCard, CategoryRail, HalloweenBrowseContent } = await loadComponent(path.join(root, "app/components/BoHalloweenHaunt.js"), root);
const html = renderToStaticMarkup(createElement(BoHalloweenHaunt, { model: live }));
ok(html.includes('data-filter-id="ghost"') && html.includes("Ghost tours"), "ghost tours has a category selector");
ok(!/data-(?:haunt|tour|browse)-id=/.test(html), "default SSR never renders statewide cards without a location");
ok(html.includes("Where are you looking?") && html.includes("Use my location") && html.includes("Choose area"), "unknown location requires an explicit chooser");
ok(!html.includes('id="boo-tours"') && !html.includes("Florida Ghost Tours"), "legacy statewide tour section is replaced by local category rails");
ok(!html.includes("Top Florida ghost tours") && !html.includes("data-featured-tour="), "statewide featured picks cannot bypass the local radius");
ok(!html.includes("More ghost tours on Viator"), "generic city booking heading is removed");
for (const dest of live.ghostDestinations) {
  ok(!html.includes('data-ghost-dest="' + dest.id + '"') && !html.includes(dest.href.replace(/&/g, "&amp;")), dest.id + " generic destination shortcut is absent");
}
ok(!DASH.test("Ghost tours and haunted walks") && !DASH.test("Halloween parties and nightlife"), "category headings are dash free");
ok(html.includes("Find Halloween plans within 40 miles.") && !html.includes("Prices, dates and hours for " + (live.haunts.length + live.eventTours.length) + " Florida haunts"), "lede states the radius rather than implying all Florida cards are nearby");
const toursHtml = live.tours.map((t) => renderToStaticMarkup(createElement(TourCard, { t }))).join("");
const eventsHtml = live.eventTours.map((t) => renderToStaticMarkup(createElement(TourCard, { t }))).join("");
ok((toursHtml.match(/data-tour-id="/g) || []).length === live.tours.length, "isolated render covers every retained ghost tour exactly once");
ok(live.tours.every((t) => toursHtml.includes('data-tour-id="' + t.id + '"')), "every ghost tour id renders in its own card");
ok(live.eventTours.every((t) => eventsHtml.includes('data-tour-id="' + t.id + '"')), "every haunted attraction id renders in its own card");
ok(!/data-haunt-id="/.test(toursHtml), "tour card renderer never emits a haunt identity");
for (const t of [...live.tours, ...live.eventTours]) {
  const cardHtml = renderToStaticMarkup(createElement(TourCard, { t }));
  ok(cardHtml.includes('href="' + t.cta.href.replace(/&/g, "&amp;") + '"'), t.id + " buy href renders");
  ok(cardHtml.includes(t.name.replace(/'/g, "&#x27;")) || cardHtml.includes(t.name), t.id + " name renders");
  ok(cardHtml.includes(t.cta.via), t.id + " seller line accompanies the booking link");
  ok((cardHtml.match(/class="boo-buy"/g) || []).length === 1, t.id + " has a single primary booking CTA");
}
ok(!/href="https:\/\/(?:www\.)?viator\.com/.test(html + toursHtml + eventsHtml), "no raw Viator link in the page or isolated cards");
ok((toursHtml.match(new RegExp(HALLOWEEN_TOUR_CTA, "g")) || []).length === live.tours.length, "every tour card has the See availability button");
const DISCLOSURE = "Wayfind may earn a commission when you book through partner links. Rankings are never for sale.";
const origin = { lat: 27.9506, lng: -82.4572, kind: "device", label: "your current location" };
const location = { origin, status: "ready", areas: [], requestLocation() {}, chooseArea() {} };
const browse = halloweenBrowse(live, { ...origin });
const localHtml = renderToStaticMarkup(createElement(HalloweenBrowseContent, { model: live, location }));
ok(browse.cards.length > 0 && browse.cards.length < live.haunts.length + live.tours.length + live.eventTours.length, "origin yields only the local subset of injected exact-identity inventory and product fixtures");
for (const t of [...live.tours, ...live.eventTours]) {
  const admitted = browse.cards.find((row) => row.browseType === "tour" && row.id === t.id);
  ok(localHtml.includes('data-tour-id="' + t.id + '"') === Boolean(admitted), t.id + " page visibility matches exact venue distance eligibility");
  if (admitted) ok(admitted.distanceMi <= 40, t.id + " uses the full precision hard radius");
}
for (const rail of browse.rails.filter((row) => row.cards.length > 0)) {
  const section = renderToStaticMarkup(createElement(CategoryRail, { rail, origin }));
  ok((section.split(DISCLOSURE).length - 1) === 1, rail.id + " has exactly one section disclosure");
  ok(section.indexOf(DISCLOSURE) < section.indexOf('data-halloween-rail-track='), rail.id + " discloses commission before the booking cards");
}
ok((localHtml.split(DISCLOSURE).length - 1) === (localHtml.match(/data-halloween-rail="/g) || []).length, "every local category rail retains the full disclosure once");
ok(!toursHtml.includes("Wayfind may earn a commission") && !eventsHtml.includes("Wayfind may earn a commission"), "isolated cards do not repeat the category disclosure");
const partnerTags = [...(toursHtml + eventsHtml).matchAll(/<a class="boo-buy"[^>]*>/g)].map((m) => m[0]);
ok(partnerTags.length === live.tours.length + live.eventTours.length && partnerTags.every((tag) => tag.includes('target="_blank"') && tag.includes('rel="sponsored nofollow noopener"')), "every tour partner link opens in a new tab with the sponsored rel");
ok(!html.includes('class="boo-jump"') && !html.includes('href="#boo-tours"'), "legacy tour jumps cannot bypass the new category control");
const bare = renderToStaticMarkup(createElement(BoHalloweenHaunt, { model }));
ok(!bare.includes('data-tour-id="') && !bare.includes('data-ghost-dest="'), "model without tours emits no tour cards or generic booking links");


// ── 2026-10-29 partner ghost tours (US Ghost Adventures via Awin) ─────────
{
  const H64 = "a".repeat(64);
  const googleStored = (id) => ({ source: "google", src: "/api/photo/stored/" + id + "?v=" + H64, width: 1280, height: 853, credit: { name: "x", authors: [{ name: "Pat Lee", uri: "https://maps.google.com/x" }] } });
  const vaultRow = (id, text) => [{ url: "https://abc.supabase.co/storage/v1/object/public/place-photos/" + id + "/f.jpg", width: 1280, height: 853, attribution_text: text, attribution_url: "https://commons.wikimedia.org/wiki/File:X.jpg", source_ref: "File:X.jpg" }];
  ok(PARTNER_TOURS.length === 3 && PARTNER_TOURS.every((t) => t.provider === "awin_usghostadventures"), "three US Ghost Adventures tours");
  const all = await partnerTours({ readPhoto: async (id) => googleStored(id) });
  ok(all.length === 3, "partner tours render with a stored Google photo");
  for (const t of all) {
    const base = PARTNER_TOURS.find((p) => p.code === t.id);
    ok(t.cta.href === "/api/commerce/go?provider=awin_usghostadventures&offer=" + base.offerId + "&surface=halloween_haunts&content=hw-tour-" + base.code + "&page=halloween-in-florida", t.id + " books through the commerce redirect by offer id");
    ok(!/usghostadventures\.com|awin1\.com/.test(t.cta.href), t.id + " never prints a raw partner URL");
    ok(t.cta.via === "Tour tickets at US Ghost Adventures" && t.cta.rel === "sponsored nofollow noopener" && t.cta.label === HALLOWEEN_TOUR_CTA, t.id + " sponsored CTA names the partner");
    ok(t.ratingLabel === "" && t.reviews === 0, t.id + " prints no rating without a review count");
    ok(t.photo.credit === "Photo by Pat Lee on Google Maps", t.id + " Google photo carries its credit");
    ok(!DASH.test(t.name + t.place + t.priceLabel + t.duration + t.photo.alt + t.cta.via), t.id + " copy is dash free");
    ok(["tampa", "staug", "more"].includes(t.region), t.id + " sits in a real region");
  }
  const none = await partnerTours({ readPhoto: async () => null, readVault: async () => [] });
  ok(none.length === 0, "red-prove: no stored photo, no partner card");
  const vault = await partnerTours({ readPhoto: async () => null, readVault: async (id) => vaultRow(id, "Unknown authorUnknown author or not provided — Public domain, via Wikimedia Commons") });
  ok(vault.length === 3 && vault.every((t) => t.photo.source === "vault" && t.photo.credit === "Public domain photo via Wikimedia Commons"), "vault photo fallback, public domain credit cleaned");
  const credited = await partnerTours({ readPhoto: async () => null, readVault: async (id) => vaultRow(id, "Cromemco — CC BY-SA-3.0, via Wikimedia Commons") });
  ok(credited.every((t) => t.photo.credit === "Photo by Cromemco CC BY SA 3.0, via Wikimedia Commons"), "vault credit keeps the author and license");
  ok(partnerTourCard({ ...PARTNER_TOURS[0], provider: "viator" }, googleStored("x")) === null, "red-prove: an unknown partner gets no card");
  ok(partnerTourCard(PARTNER_TOURS[0], { src: "https://evil.example/x.jpg", credit: "Photo by X" }) === null, "red-prove: an outside image URL is refused");
  const merged = await withHalloweenTours(model, { env: {}, readPhoto: async (id) => googleStored(id) });
  ok(merged.tours.filter((t) => t.id.startsWith("usga-")).length === 3, "partner tours join the ghost tour chip");
  ok(merged.eventTours.every((t) => !t.id.startsWith("usga-")), "partner tours never land in the haunt grid");
  const partnerHtml = merged.tours.map((t) => renderToStaticMarkup(createElement(TourCard, { t }))).join("");
  for (const t of merged.tours.filter((x) => x.id.startsWith("usga-"))) {
    const at = partnerHtml.indexOf('data-tour-id="' + t.id + '"');
    const end = partnerHtml.indexOf("</article>", at);
    ok(at > -1 && partnerHtml.slice(at, end).includes(t.photo.credit), t.id + " renders with its photo credit");
  }
}


// 2026-10-29 regression (Vercel preview build failed): an injected env/fetch
// must govern the partner photo reads too. A child process gets real looking
// service creds in ITS env (set here, never read from this shell) plus a
// tripwire global fetch; with injected deps the partner reads may touch
// neither, so the result is identical on CI, a laptop and the Vercel build.
{
  const { spawnSync } = await import("node:child_process");
  const { pathToFileURL } = await import("node:url");
  const lib = pathToFileURL(path.join(root, "lib/halloweenTours.js")).href;
  const vault = pathToFileURL(path.join(root, "lib/halloweenHauntVault.js")).href;
  const code = [
    "let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('tripwire'); };",
    "const { withHalloweenTours, TOUR_SNAPSHOT } = await import(" + JSON.stringify(lib) + ");",
    "const { halloweenHauntModel } = await import(" + JSON.stringify(vault) + ");",
    "const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://fake.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' };",
    "const stub = async () => ({ ok: true, json: async () => [] });",
    "const m = await withHalloweenTours(halloweenHauntModel(), { env, fetch: stub });",
    "console.log(JSON.stringify({ calls, partners: m.tours.filter((t) => t.id.startsWith('usga-')).length }));",
  ].join("\n");
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: root,
    encoding: "utf8",
    env: { SUPABASE_URL: "https://realproject.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "tripwire-not-a-real-key", NODE_ENV: "test" },
  });
  const line = String(run.stdout || "").trim().split("\n").pop() || "{}";
  let out = {};
  try { out = JSON.parse(line); } catch { out = {}; }
  ok(run.status === 0, "sealed child ran (" + String(run.stderr || "").slice(0, 200) + ")");
  ok(out.calls === 0, "injected deps: partner photo reads never use the global fetch, whatever the process env holds");
  ok(out.partners === 0, "injected deps without a service key: no partner card");
}

// 2026-10-29 tour classification, price basis (per person vs per group), Jacksonville region, stale live row guard, and family filter
{
  ok(TOUR_REGIONS.some((r) => r.id === "jax" && r.label === "Jacksonville") && TOUR_REGIONS.some((r) => r.id === "more" && r.label === "Key West"), "Jacksonville and Key West have distinct region chips");
  const jaxCards = snap.filter((t) => t.region === "jax");
  ok(jaxCards.map((t) => t.id).sort().join(",") === "201204P3,333341P1", "both Jacksonville tours sit in the jax region, never under Key West");
  const keyWestCards = snap.filter((t) => t.region === "more" && t.group === "ghost");
  ok(keyWestCards.length > 0 && keyWestCards.every((t) => t.place === "Key West"), "every ghost tour in the Key West region is actually in Key West");
  const pcb = snap.find((t) => t.id === "180859P9");
  ok(pcb && pcb.group === "event" && pcb.place === "Panama City Beach, FL Panhandle" && pcb.formatLabel === "Walk through haunted house", "Panama City Beach attraction is in the event group with Panhandle place label");
  const groupCodes = ["186588P10", "209615P123", "333814P8", "5567095P1"];
  ok(snap.filter((t) => t.priceUnit === "per group").map((t) => t.id).sort().join(",") === groupCodes.join(","), "private vehicle/group tours carry per group price basis");
  ok(snap.filter((t) => !groupCodes.includes(t.id)).every((t) => t.priceUnit === "per person"), "individual tours carry per person price basis");
  ok(snap.find((t) => t.id === "5046OLDJAIL").formatLabel === "Daytime jail history tour" && snap.find((t) => t.id === "5046P21").formatLabel === "Night paranormal investigation", "Old Jail daytime tour and night paranormal experience are clearly distinguished");
  ok(snap.find((t) => t.id === "107194P211").formatLabel === "Self guided phone game" && snap.find((t) => t.id === "469510P10").formatLabel === "Self guided audio tour", "self guided phone game and audio tours are labeled");
  ok(toursHtml.includes("per group") && toursHtml.includes("per person") && toursHtml.includes("Private group tour") && toursHtml.includes("Self guided audio tour") && toursHtml.includes("Daytime jail history tour"), "rendered tour cards show formatLabel and priceUnit");
  // Stale live row guard: dead link_ok, zero from_price, or removed code returns null instead of falling back to snapshot
  ok(tourCard(TOUR_SNAPSHOT[0], { from_price: 0, link_ok: true }) === null, "red-prove: a live row with from_price 0 fails closed instead of falling back to snapshot price");
  ok(tourCard(TOUR_SNAPSHOT[0], { from_price: 40, link_ok: false }) === null, "red-prove: a live row with link_ok false fails closed");
  ok(tourCard({ ...TOUR_SNAPSHOT[0], code: "28841P2" }) === null && tourHref("28841P2") === null, "red-prove: a TOUR_REMOVED code never produces a tourCard or tourHref");
  // Family suitability requires affirmative evidence. General ghost tours remain
  // in their own category; an absent adultOnly flag is not a kids recommendation.
  const familyHtml = renderToStaticMarkup(createElement(HalloweenBrowseContent, { model: live, initialFilter: "family", location }));
  ok(!familyHtml.includes("272079P3") && !familyHtml.includes("Spirits and Spirits Haunted Pub Crawl") && !familyHtml.includes("430526P2"), "family category excludes adult pub crawls and 18+ tours");
  ok(!familyHtml.includes('data-tour-id="38620P1"') && !familyHtml.includes('data-tour-id="122676P1"'), "general ghost tours do not silently become family recommendations");
  const classified = halloweenBrowseCards(live);
  for (const id of ["38620P1", "122676P1"]) ok(classified.some((row) => row.id === id && row.browseCategory === "ghost"), id + " remains available in the ghost tour catalogue");
  const family = halloweenBrowse(live, { ...origin, category: "family" });
  ok(family.cards.length > 0 && family.cards.every((row) => row.browseCategory === "family" && row.distanceMi <= 40), "family controls return verified local family listings");
  ok((familyHtml.match(/data-halloween-rail="/g) || []).length === 1 && familyHtml.includes('data-halloween-rail="family"'), "family selection renders only its category rail");
}

console.log("test-halloween-tours: " + checks + " assertions OK (" + live.tours.length + " ghost tours, " + live.eventTours.length + " event tours)");
