#!/usr/bin/env node
// Guard: a business's verified deal appears where Wayfind NAMES that business
// (owner, 2026-11-19: "i need clipp to be added to guide and places where the
// businesses are being mentioned"), and only ever the RIGHT business's deal.
//
// Runs the real resolver (lib/placeDeal.js) against the real coupon registry:
//   1. Every live Clipp row with a Place ID resolves to its own offer on both
//      surfaces, through our tracked /api/commerce/go redirect, with the surface
//      that names where it was shown. (positive control, every row)
//   2. Identity only: a business NAME, a bogus id, or an unknown surface gets
//      nothing. (negative controls)
//   3. A Clipp audit date is never printed as an offer deadline ("Ends …").
//   4. After the recheck date the deal is gone (fail closed), and a free venue
//      offer keeps its own link with no commerce event.
//   5. Wiring: /places/<id> and the guide page render PlaceDealOffer from
//      placeDealFor, the guide respects editorial mode, and the island is the
//      sole commerce click owner of its anchor.
import { readFileSync } from "node:fs";
import { COUPONS, couponIsLive } from "../lib/coupons.js";
import { placeDealFor, PLACE_PAGE_DEAL_SURFACE, GUIDE_PICK_DEAL_SURFACE } from "../lib/placeDeal.js";

let fails = 0;
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.error("  ✗ " + msg); } };

// Pin "today" to the registry's own audit window so the guard does not flip
// red on the calendar; liveness is couponIsLive's job, tested by its own guard.
const clippRows = COUPONS.filter((c) => c && c.commerce && c.commerce.provider === "clipp" && c.placeId);
const today = clippRows.map((c) => String(c.expires || "").slice(0, 10)).filter(Boolean).sort()[0] || "2026-11-19";
const liveClipp = clippRows.filter((c) => couponIsLive(c, today));
ok(liveClipp.length >= 10, `at least 10 live Clipp venues to attach (got ${liveClipp.length})`);

// 1. Every live Clipp venue, both surfaces.
for (const c of liveClipp) {
  for (const surface of [PLACE_PAGE_DEAL_SURFACE, GUIDE_PICK_DEAL_SURFACE]) {
    const d = placeDealFor(c.placeId, { surface, contentId: "t:" + c.placeId, today });
    // A venue with two offers resolves to the FIRST live one (couponForPlace
    // priority); it must still be an offer FOR THIS VENUE.
    const own = d && COUPONS.find((x) => x.id === d.id);
    ok(!!d, `${c.business}: deal resolves on ${surface}`);
    if (!d) continue;
    ok(own && (own.placeId || own.venuePlaceId) === c.placeId, `${c.business}: resolved deal belongs to this venue (${d.id})`);
    if (own && own.commerce && own.commerce.provider === "clipp") {
      const q = new URLSearchParams(String(d.href).split("?")[1] || "");
      ok(d.href.startsWith("/api/commerce/go?"), `${c.business}: href is our tracked redirect`);
      ok(q.get("provider") === "clipp" && q.get("offer") === own.commerce.offerId, `${c.business}: href carries its own Clipp offer`);
      ok(q.get("surface") === surface && d.commerce && d.commerce.surface === surface, `${c.business}: href and impression share surface ${surface}`);
      ok(d.commerce.offer_id === q.get("offer") && d.commerce.content_id === q.get("content"), `${c.business}: impression and click keys match`);
      ok(d.ends === null, `${c.business}: audit date not shown as an offer deadline`);
      ok(!/\bEnds\b/.test(JSON.stringify(d.title) + JSON.stringify(d.details)), `${c.business}: no invented deadline in copy`);
    }
  }
}

// 2. Negative controls.
const sample = liveClipp[0];
ok(placeDealFor(sample && sample.business, { surface: PLACE_PAGE_DEAL_SURFACE, today }) === null, "a business NAME never resolves a deal");
ok(placeDealFor("ChIJ_not_a_registered_venue_000", { surface: PLACE_PAGE_DEAL_SURFACE, today }) === null, "an unregistered Place ID gets nothing");
ok(placeDealFor("", { surface: PLACE_PAGE_DEAL_SURFACE, today }) === null, "an empty id gets nothing");
ok(placeDealFor(undefined, { surface: PLACE_PAGE_DEAL_SURFACE, today }) === null, "undefined id gets nothing");
ok(sample && placeDealFor(sample.placeId, { surface: "coupons", today }) === null, "an unknown surface gets nothing");
ok(sample && placeDealFor("places/" + sample.placeId, { surface: PLACE_PAGE_DEAL_SURFACE, today }) !== null, "a places/<id> resource name is reduced, not rejected");

// 4. Fail closed after the recheck date; free offers keep their own link.
const after = "2099-01-01";
for (const c of liveClipp.slice(0, 5)) {
  ok(placeDealFor(c.placeId, { surface: PLACE_PAGE_DEAL_SURFACE, today: after }) === null, `${c.business}: gone after its recheck date`);
}
const free = COUPONS.find((c) => c && !c.commerce && (c.placeId || c.venuePlaceId) && couponIsLive(c, today) && /^https:\/\//.test(String(c.url || "")));
if (free) {
  const d = placeDealFor(free.placeId || free.venuePlaceId, { surface: PLACE_PAGE_DEAL_SURFACE, today });
  ok(!!d, `${free.business}: free venue offer resolves`);
  if (d && d.id === free.id) {
    ok(d.commerce === null && d.href === free.url, `${free.business}: free offer keeps its registry link and emits no commerce`);
  }
}

// 5. Wiring.
const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const place = src("lib/placePage.js");
ok(/placeDealFor\(id,\s*\{\s*surface:\s*PLACE_PAGE_DEAL_SURFACE/.test(place), "/places/<id> resolves its deal by the page's Place ID");
ok(/<PlaceDealOffer deal=\{deal\}/.test(place), "/places/<id> renders PlaceDealOffer");
ok(/CLOSED_TEMPORARILY"\s*\?\s*null\s*:\s*placeDealFor/.test(place), "a temporarily closed place shows no deal");
const guide = src("app/guides/[slug]/page.js");
ok(/pickDealFor\(pickPlaceIds\[i\], i\)/.test(guide), "guide picks resolve by their RESOLVED Place ID");
ok(/chrome\.liveDeals \? pickDealFor/.test(guide), "editorial guides carry no pick deals");
ok(/<PlaceDealOffer deal=\{pickDeals\[i\]\}/.test(guide), "guide picks render PlaceDealOffer");
ok(/<PlaceDealOffer deal=\{railDeals\.get\(place\.id\)\}/.test(guide), "guide place rail renders PlaceDealOffer");
ok(!/placeDealFor\([^)]*\.name/.test(guide + place), "no caller passes a name");
const island = src("app/components/PlaceDealOffer.js");
ok(/"data-commerce-owner": "PlaceDealOffer"/.test(island), "the island owns its commerce click (no double count)");
ok(/deal\.expires < siteTodayStr\(\)/.test(island), "the island hides a deal that expired after the cached page was built");
ok(/useCommerceImpression\(/.test(island), "the island emits a viewable impression");

console.log(`check-place-deal: ${checks - fails}/${checks} passed (${liveClipp.length} live Clipp venues, as of ${today})`);
if (fails) { console.error(`check-place-deal: ${fails} failure(s)`); process.exit(1); }
