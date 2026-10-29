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
import { halloweenHauntModel } from "../lib/halloweenHauntVault.js";
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
    product_code: t.code, provider: "viator", from_price: t.fromPrice + 1, rating: t.rating, reviews: t.reviews, duration_min: t.minutes, image: t.image, link_ok: t.code !== dead,
  }));
  return { ok: true, json: async () => rows };
};
const model = halloweenHauntModel();
const live = await withHalloweenTours(model, { env, fetch: fakeFetch });
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

// Schema
const schema = halloweenToursSchema(live.tours, "https://www.gowayfind.com/halloween-in-florida");
ok(schema["@type"] === "ItemList" && schema.numberOfItems === live.tours.length, "tour schema is an ItemList of every card");
ok(!JSON.stringify(schema).includes("/api/commerce/go") && !JSON.stringify(schema).includes("viator.com"), "schema never embeds the redirect or a partner URL");

// Render: default view is haunts and Halloween events; ghost tours sit behind the chip
const { default: BoHalloweenHaunt } = await loadComponent(path.join(root, "app/components/BoHalloweenHaunt.js"), root);
const html = renderToStaticMarkup(createElement(BoHalloweenHaunt, { model: live }));
const chipLabel = "Ghost tours (" + live.tours.length + ")";
ok(html.includes(">" + chipLabel + "<") && html.includes('data-filter-id="tours"'), "the ghost tours chip carries the real count: " + chipLabel);
ok((html.match(/data-haunt-id="/g) || []).length === live.haunts.length, "default view keeps the haunt grid");
ok(html.includes('id="boo-tours"') && html.includes("Florida Ghost Tours"), "default view renders the full ghost tour section under the haunts");
ok(live.tours.every((t) => html.includes('data-tour-id="' + t.id + '"')), "default view renders every ghost tour card");
ok(live.eventTours.every((t) => html.includes('data-tour-id="' + t.id + '"')), "default view renders the haunted attraction with the haunts");
ok(html.includes("Top Florida ghost tours") && (html.match(/data-featured-tour="/g) || []).length === live.featuredTours.length, "featured ghost tours render near the top");
ok(html.includes("More ghost tours on Viator"), "destination heading renders");
for (const dest of live.ghostDestinations) {
  ok(html.includes('data-ghost-dest="' + dest.id + '"') && html.includes(dest.href.replace(/&/g, "&amp;")), dest.id + " destination link renders through its tracked href");
}
ok(!DASH.test("Top Florida ghost tours") && !DASH.test("More ghost tours on Viator"), "new headings are dash free");
ok(html.includes("Show all") === false && html.includes("Prices, dates and hours for " + (live.haunts.length + live.eventTours.length) + " Florida haunts and Halloween events."), "lede counts haunts and events only");
const toursHtml = renderToStaticMarkup(createElement(BoHalloweenHaunt, { model: live, initialFilter: "tours" }));
ok(toursHtml.includes('id="boo-tours"') && toursHtml.includes("Florida Ghost Tours"), "tour section renders behind the chip");
ok((toursHtml.match(/data-tour-id="/g) || []).length === live.tours.length, "chip view: one card per ghost tour");
ok(!/data-haunt-id="/.test(toursHtml), "chip view swaps the haunt cards out");
for (const t of live.tours) {
  ok(toursHtml.includes('href="' + t.cta.href.replace(/&/g, "&amp;") + '"'), t.id + " buy href renders");
  ok(toursHtml.includes(t.name.replace(/'/g, "&#x27;")) || toursHtml.includes(t.name), t.id + " name renders");
}
ok(!/href="https:\/\/(?:www\.)?viator\.com/.test(html + toursHtml), "no raw Viator link in the page");
ok((toursHtml.match(new RegExp(HALLOWEEN_TOUR_CTA, "g")) || []).length === live.tours.length + live.featuredTours.length, "every tour card and featured pick has the See availability button");
const PICK_LINE = "Wayfind may earn a commission, which never changes our picks or their order.";
ok((toursHtml.match(/Wayfind may earn a commission when you book through partner links\./g) || []).length === 1, "page disclosure still appears once");
const toursPartnerButtons = live.tours.length + live.featuredTours.length + live.ghostDestinations.length;
ok((toursHtml.match(/which never changes our picks or their order\./g) || []).length === toursPartnerButtons, "tours view: pick disclosure on every partner button (" + toursPartnerButtons + ")");
ok(toursHtml.includes(PICK_LINE), "pick disclosure wording is the existing sentence");
const partnerTags = [...toursHtml.matchAll(/<a class="(?:boo-buy|boo-dest-link)"[^>]*>/g)].map((m) => m[0]);
ok(partnerTags.length === toursPartnerButtons && partnerTags.every((tag) => tag.includes('target="_blank"') && tag.includes('rel="sponsored nofollow noopener"')), "tours view partner links open in a new tab");
ok(html.includes('class="boo-jump"') && !html.includes('href="#boo-tours"'), "hero jump is a button that opens the chip, not an anchor to a hidden section");
const bare = renderToStaticMarkup(createElement(BoHalloweenHaunt, { model }));
ok(!bare.includes('id="boo-tours"') && !bare.includes('class="boo-jump"') && !bare.includes('data-filter-id="tours"'), "no tours, no chip and no jump button");


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
  const partnerHtml = renderToStaticMarkup(createElement(BoHalloweenHaunt, { model: merged, initialFilter: "tours" }));
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

console.log("test-halloween-tours: " + checks + " assertions OK (" + live.tours.length + " ghost tours, " + live.eventTours.length + " event tours)");
