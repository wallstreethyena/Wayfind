#!/usr/bin/env node
// /christmas-in-florida emitted <img src="/api/photo?place=ChIJn2JUR3Bf7IgRDoeGio3YFuE&g=2&w=640">
// for Goodwood Museum and Gardens, which answers 404 (inventory holds only the
// placeholder ref wfplacediscovery; its wf_place_photo row is "rejected"). The tile
// fallback hid it, but every view still made a request known to fail.
// EXECUTES lib/placePhotoServable.js + lib/christmasTickets.js with injected readers:
//   - a place URL the route cannot serve is dropped BEFORE render (tile shows)
//   - a servable one, a licensed /events path and a stored Google photo are kept (controls)
//   - the check itself never spends: probe mode, no credited surface
import assert from "node:assert/strict";
import { placePhotoServable, uncreditedPlacePhotoId } from "../lib/placePhotoServable.js";
import { resolvePlacePhoto } from "../lib/placePhotoServe.js";
import { christmasTicketsModel, withChristmasTicketPhotos, withBrowseTicketPhotos, attachBrowseTickets, dropUnservableCardPhotos } from "../lib/christmasTickets.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const GOODWOOD = "ChIJn2JUR3Bf7IgRDoeGio3YFuE";
const URL_G = "/api/photo?place=" + GOODWOOD + "&g=2&w=640";

// URL classifier
ok(uncreditedPlacePhotoId(URL_G) === GOODWOOD, "plain place url recognised");
ok(uncreditedPlacePhotoId("/api/photo?place=" + GOODWOOD + "&s=card&g=2") === "", "credited surface url is not judged here");
ok(uncreditedPlacePhotoId("/api/photo?ref=places%2Fx%2Fphotos%2Fy&g=2") === "", "ref url ignored");
ok(uncreditedPlacePhotoId("/events/christmas/x.webp") === "" && uncreditedPlacePhotoId(null) === "", "non api urls ignored");

// The REAL resolver on the REAL Goodwood inventory row (placeholder ref, no owned url): it must miss.
const goodwoodRow = { photo_ref: "places/" + GOODWOOD + "/photos/wfplacediscovery", signals: { price: null, rating: null, reviews: 0, priceNum: null } };
const calls = [];
const realResolve = (input) => { calls.push(input); return resolvePlacePhoto(input, { inventoryGet: async () => goodwoodRow }); };
const dead = { resolve: realResolve, findFree: async () => null, noMemo: true };
ok((await placePhotoServable(GOODWOOD, dead)) === false, "Goodwood (placeholder ref, no free photo) is provably not servable");
ok(calls.length === 1 && calls[0].probe === true && calls[0].googleSurface === false, "the check runs in probe mode with no credited surface, so it can never spend");
ok((await placePhotoServable(GOODWOOD, { ...dead, findFree: async () => ({ src: "x" }) })) === true, "a free permanent photo makes it servable");
ok((await placePhotoServable(GOODWOOD, { noMemo: true, findFree: async () => null, resolve: async () => ({ type: "redirect", location: "https://img.example/x.jpg" }) })) === true, "an owned inventory photo makes it servable");
ok((await placePhotoServable(GOODWOOD, { noMemo: true, resolve: async () => { throw new Error("db down"); } })) === true, "if the check itself fails, keep the image (client tile fallback still covers it)");

function holidayCard(id, image, placeId = GOODWOOD) {
  return {
    kind: "event", id, title: "T " + id, name: "T " + id, city: "Tallahassee", venue: "Goodwood Museum and Gardens",
    start_date: "2026-12-01", end_date: "2026-12-20", season_undated: false, closing_unannounced: false,
    christmasRail: "lights", browse_categories: ["lights"], audience: "family", price_kind: "paid", is_free: false,
    price_label: "Ticketed", price_note: "$20", official_ticket_url: "https://tickets.example.org/buy",
    image, placeholder: { icon: "✨", label: "Holiday lights" }, place_id: placeId, detailHref: null,
  };
}
const mk = (id, image, placeId = GOODWOOD) => holidayCard(id, image, placeId);
const TODAY = "2026-11-20";
const base = { noMemo: true, readTagged: async () => [], readGoogle: async () => null, readVault: async () => [] };

// Ticket grid rows
{
  const m = christmasTicketsModel([mk("g", URL_G)], TODAY);
  ok(m.rows[0].photos.length === 1 && m.rows[0].photos[0].src === URL_G, "fixture starts with the place photo");
  const dropped = await withChristmasTicketPhotos(m, { ...base, servable: dead });
  ok(dropped.rows[0].photos.length === 0, "unservable place photo is removed from the ticket row before render");
  ok(dropped.rows[0].placeholder && dropped.rows[0].placeholder.label, "the row keeps its designed placeholder tile");
  const kept = await withChristmasTicketPhotos(m, { ...base, servable: { noMemo: true, findFree: async () => ({ src: "x" }), resolve: realResolve } });
  ok(kept.rows[0].photos.length === 1, "control: servable place photo is kept");
  const lic = christmasTicketsModel([mk("lic", "/events/christmas/stetson-mansion-christmas-2026-2.webp")], TODAY);
  const licOut = await withChristmasTicketPhotos(lic, { ...base, servable: dead });
  ok(licOut.rows[0].photos.length === 1, "control: a licensed local photo is never touched");
  const stored = { src: "/api/photo/stored/abc_DEF?v=" + "a".repeat(64), width: 1000, height: 700, source: "google", credit: { authors: [{ name: "A. Photographer", uri: "https://maps.google.com/x" }] } };
  const mixed = await withChristmasTicketPhotos(m, { ...base, servable: dead, readGoogle: async () => stored });
  ok(mixed.rows[0].photos.length === 1 && mixed.rows[0].photos[0].source === "google", "a stored Google photo still shows when the place url is dropped");
}

// Browse cards (statewide list + /api/christmas/browse)
{
  const cards = [
    { ...mk("ev", URL_G), imageIsVenue: true, photoAttr: null },
    { kind: "place", id: "pl", title: "Place", name: "Place", image: URL_G, place_id: GOODWOOD, christmasRail: "lights", tags: [] },
    { ...mk("lic", "/events/christmas/stetson-mansion-christmas-2026-2.webp") },
  ];
  const page = { cards, total: 3 };
  const listings = cards.filter((c) => c.kind !== "place");
  const withTix = attachBrowseTickets(page, listings, TODAY, new Map());
  const out = await withBrowseTicketPhotos(withTix, listings, TODAY, new Map(), { ...base, servable: dead });
  const by = Object.fromEntries(out.cards.map((c) => [c.id, c]));
  ok(by.ev.image === null && by.ev.placeholder, "browse event card: dead place image removed, placeholder set");
  ok(by.pl.image === null && by.pl.placeholder, "browse place card: dead place image removed, placeholder set");
  ok(by.lic.image === "/events/christmas/stetson-mansion-christmas-2026-2.webp", "control: licensed browse photo untouched");
  const onlyPlaces = await withBrowseTicketPhotos({ cards: [cards[1]], total: 1 }, [], TODAY, new Map(), { ...base, servable: dead });
  ok(onlyPlaces.cards[0].image === null, "a page of only place cards is processed too (no early return)");
  const keep = await withBrowseTicketPhotos(withTix, listings, TODAY, new Map(), { ...base, servable: { noMemo: true, findFree: async () => ({ src: "x" }), resolve: realResolve } });
  ok(keep.cards.find((c) => c.id === "ev").image === URL_G, "control: servable browse image kept");
}

// Vercel prebuild has SUPABASE_SERVICE_ROLE_KEY. GitHub CI and a laptop do not.
// The composition guard injects readers and uses fixture place ids. Those ids
// are not in inventory, so a live lookup drops the photo the guard is counting.
// A page render passes no readers and must still drop a place the store cannot serve.
{
  const saved = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = "http://127.0.0.1:9";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "guard-dummy-not-a-secret";
  try {
    const m = christmasTicketsModel([holidayCard("herm", URL_G)], TODAY);
    const hermetic = await withChristmasTicketPhotos(m, { ...base });
    ok(hermetic.rows[0].photos.length === 1 && hermetic.rows[0].photos[0].src === URL_G, "injected readers never ask the build machine's Supabase, so a fixture place photo stays");
    const live = await dropUnservableCardPhotos({ ...holidayCard("live", URL_G), imageIsVenue: true }, {});
    ok(live.image === null && live.placeholder, "a page render with a service key still drops a place the store cannot serve");
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

console.log(`test-christmas-unservable-photo: ${n} assertions OK (real resolvePlacePhoto run on the Goodwood inventory row)`);
