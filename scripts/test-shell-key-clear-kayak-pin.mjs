#!/usr/bin/env node
// scripts/test-shell-key-clear-kayak-pin.mjs
//
// Locks the ONE founder-verified in-season Florida tour pin:
//   Title: Clear Kayak Tour of Shell Key Preserve and Tampa Bay Area
//   City:  St. Petersburg, Florida (meet Tierra Verde)
//   SKU:   d5403-173028P1 (173028P1)
//   URL:   https://www.viator.com/tours/St-Petersburg/Clear-Kayak-Tours-of-Shell-Key/d5403-173028P1
//
// Verified 2026-08-19 by browser load; short slug canonicalized to the long
// one; H1 stayed this tour. Already a fixture in check-tour-strip-redirect.
// NOT the dishonest scallop SKU d50024-236862P2.
//
// ASSERT ON THE CALL, not the string. A grep for 173028P1 would pass if the
// code only mentioned the SKU in a comment. Every money claim below INVOKES
// placePartnerPick / commerceHref / resolveOffer / resolveDetailCta /
// nearbyTourListAllowed / summerEntriesNow. The live ?place= sheet is the
// path Trust hit after #944 — closed hours + viaTours ferry must not win.

import { readFileSync } from "node:fs";
import { commerceHref, placePageBookHref } from "../lib/commerce.js";
import { PARTNER_OFFER_REGISTRY, partnerOfferById } from "../lib/partnerOfferRegistry.js";
import { nearbyTourListAllowed, placePartnerPick } from "../lib/placePartnerPicks.js";
import { PROVIDERS, resolveOffer } from "../lib/commerceProviders.js";
import { resolveDetailCta } from "../lib/detailCta.js";
import { SUMMER_UNIVERSE, summerEntriesNow } from "../lib/summerUniverse.js";

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

const SKU = "173028P1";
const CANONICAL = "https://www.viator.com/tours/St-Petersburg/Clear-Kayak-Tours-of-Shell-Key/d5403-173028P1";
const HOLD_SKU = "236862P2";
const FERRY_SKU = "237533P2";
const EGMONT_SKU = "237533P5";
const PLACE = "Shell Key Preserve";
const PLACE_ID = "ChIJ5_NkHLUcw4gRndvLQGe_Ox8";

// ── 1. Existing Atlas / summer card, exact name, this SKU ────────────────
const pick = placePartnerPick({ name: PLACE });
ok(!!pick, `placePartnerPick({ name: "${PLACE}" }) returns a pin — an existing Tierra Verde summer card`);
ok(pick && pick.provider === "viator", `the pin is the viator provider (got ${pick && pick.provider})`);
ok(pick && pick.offerId === SKU, `the pin offerId is the founder-verified product code ${SKU} (got ${pick && pick.offerId})`);
ok(pick && pick.merchant === "Viator", "disclosure merchant stays Viator");
ok(placePartnerPick({ name: "shell key preserve" })?.offerId === SKU,
  "name match is case-insensitive on the exact preserve name");
ok(placePartnerPick({ name: "Shell Key" }) === null,
  "bare 'Shell Key' does not inherit the ticket — exact preserve name only");
ok(placePartnerPick({ name: "Shell Key Preserve Kayak" }) === null,
  "a superstring of the preserve name does not inherit the ticket");
ok(placePartnerPick({ name: "Fort De Soto Park" }) === null
  || placePartnerPick({ name: "Fort De Soto Park" }).offerId !== SKU,
  "Fort De Soto does not inherit the Shell Key SKU");
ok(placePartnerPick({ name: "Egmont Key State Park" })?.offerId === EGMONT_SKU,
  "Egmont Key keeps its existing ferry pin — this SKU did not steal a neighbor");
ok(placePartnerPick({ id: PLACE_ID, name: "Unnamed" })?.offerId === SKU,
  "the live ?place= id alone still resolves to the founder kayak — name drift cannot drop the pin");
ok(placePartnerPick({ id: PLACE_ID, name: PLACE })?.offerId === SKU,
  "id + exact name still resolve to the same kayak pin (one offer)");
ok(placePartnerPick({ name: PLACE })?.offerId !== FERRY_SKU,
  "Shell Key Preserve is never the 237533P2 ferry");

// ── 2. Book goes through the existing tracked hop — never a partner href ─
const href = commerceHref({
  provider: pick && pick.provider,
  offerId: pick && pick.offerId,
  surface: "iconic_place_card",
  contentId: "ChIJ5_NkHLUcw4gRndvLQGe_Ox8",
});
ok(!!href, "commerceHref produced a hop (null here would make every assertion below vacuous)");
ok(String(href).startsWith("/api/commerce/go?"),
  `Book is our redirect, not a partner host (got ${String(href).slice(0, 80)})`);
{
  const q = new URLSearchParams(String(href).split("?")[1] || "");
  ok(q.get("provider") === "viator", "the hop names provider=viator");
  ok(q.get("offer") === SKU, `the hop carries offer=${SKU}, not a reminted id`);
  ok(q.get("surface") === "iconic_place_card", "the hop is attributed to the place-card surface");
  ok(!q.has("click_id"),
    "the static href does not mint a click_id — IconicPlaceCard adds the client's own id on click");
  ok(!q.has("product"), "the hop is an offer-id lookup, not a request-supplied product URL");
}
ok(!/viator\.com|searchResults/i.test(String(href)),
  "the rendered href contains neither viator.com nor a searchResults path");

// ── 2b. /places Book is the same SKU AND carries a client click_id ────────
// Trust 2026-08-25: the live /places href was this hop without click_id.
// placePageBookHref is the hydrated path the island paints; fail-closed
// without an id so an unattributed Book cannot ship again.
{
  const placeHref = placePageBookHref({
    provider: pick && pick.provider,
    offerId: pick && pick.offerId,
    contentId: PLACE_ID,
    clickId: "wf-shellkey1",
  });
  ok(!!placeHref, "placePageBookHref produced a /places Book hop");
  ok(String(placeHref).startsWith("/api/commerce/go?"),
    `/places Book is our redirect (got ${String(placeHref).slice(0, 80)})`);
  const pq = new URLSearchParams(String(placeHref).split("?")[1] || "");
  ok(pq.get("offer") === SKU, `/places Book carries offer=${SKU} (got ${pq.get("offer")})`);
  ok(pq.get("click_id") === "wf-shellkey1",
    `/places Book href must include the client click_id (got ${pq.get("click_id")})`);
  ok(pq.get("surface") === "place_page", "/places Book stays surface=place_page");
  ok(pq.get("offer") !== FERRY_SKU, "/places Book is never the ferry");
  ok(placePageBookHref({ provider: pick && pick.provider, offerId: pick && pick.offerId, contentId: PLACE_ID }) === null,
    "placePageBookHref refuses to paint without a click_id");
}

// ── 3. Server resolve is the existing table-backed hop, this product code ─
// PROVIDERS.viator looks up wf_experiences by product_code. CI has no
// catalogue, so this CALL injects the founder-verified row. The hop still
// crosses both resolver gates (lookup + host allowlist). A searchResults
// URL in that row must fail. No registry row: test-booking-integrity forbids
// hand-built viator.com/tours URLs in partnerOfferRegistry (the #843 shape).
ok(!PARTNER_OFFER_REGISTRY[SKU],
  `${SKU} must not shadow the table lookup with a registry row — that is the booking-integrity raw-URL failure`);
ok(partnerOfferById(SKU, "viator") === null,
  "partnerOfferById refuses this SKU — dest comes from the catalogue, not a pasted URL");
ok(PROVIDERS.viator.table === "wf_experiences" && PROVIDERS.viator.idColumn === "product_code",
  "the pin uses the existing viator resolver (wf_experiences.product_code), not a new hop");
ok(typeof PROVIDERS.viator.resolve !== "function",
  "viator stays table-backed — no registry resolve that would need a pasted product URL");

let lookedUp = "";
const resolved = await resolveOffer("viator", SKU, {
  env: () => ({ url: "https://wayfind-guard.invalid", key: "guard-key" }),
  fetch: async (u) => {
    lookedUp = String(u);
    return {
      ok: true,
      json: async () => [{ product_code: SKU, product_url: CANONICAL }],
    };
  },
});
ok(lookedUp.includes(SKU) && lookedUp.includes("wf_experiences"),
  `resolveOffer looks up ${SKU} on wf_experiences (got ${lookedUp.slice(0, 160)})`);
ok(!resolved.error && typeof resolved.dest === "string",
  `resolveOffer("viator", "${SKU}") returns a dest (got ${resolved.error || "dest"})`);
ok(resolved.dest && resolved.dest.includes("d5403-173028P1"),
  `resolved dest is this exact product (got ${String(resolved.dest).slice(0, 120)})`);
ok(resolved.dest && !/searchResults/i.test(resolved.dest),
  "resolved dest is never a searchResults handoff");
ok(resolved.dest && !resolved.dest.includes(HOLD_SKU),
  "resolved dest is not the scallop HOLD-SKU");
{
  let host = "";
  try { host = new URL(resolved.dest).hostname; } catch { host = ""; }
  ok(host === "www.viator.com", `resolved dest host is www.viator.com after tracking (got ${host})`);
}

ok(!/searchResults/i.test(CANONICAL),
  "the founder-verified canonical is a product path, not searchResults");

const hold = await resolveOffer("viator", HOLD_SKU, {
  env: () => ({ url: "https://wayfind-guard.invalid", key: "k" }),
  fetch: async () => { throw new Error("HOLD SKU must not hit the catalogue"); },
});
ok(hold.error === "denied-sku" && !hold.dest,
  `the scallop HOLD-SKU ${HOLD_SKU} is denied in resolveOffer (got ${hold.error || hold.dest})`);

// ── 4. Ranking is never for sale ─────────────────────────────────────────
const shell = SUMMER_UNIVERSE.find((e) => e.key === "shell_key");
ok(!!shell, "Shell Key Preserve remains an existing summer-universe entry — we did not invent a place");
ok(shell && shell.rank === 28, `summer rank is still 28 (got ${shell && shell.rank}) — the pin did not buy a better rank`);
ok(shell && shell.venue && shell.venue.name === PLACE,
  `summer venue name is still "${PLACE}" (got ${shell && shell.venue && shell.venue.name})`);
ok(shell && shell.venue && shell.venue.city === "Tierra Verde",
  `summer venue city is still Tierra Verde (got ${shell && shell.venue && shell.venue.city})`);
ok(shell && shell.venue && shell.venue.placeId === "ChIJ5_NkHLUcw4gRndvLQGe_Ox8",
  "summer placeId is unchanged — no new Google spend, no invented identity");
const aug = summerEntriesNow(new Date("2026-08-19T12:00:00-04:00"));
ok(aug.some((e) => e.key === "shell_key"),
  "on 2026-08-19 the existing Shell Key card is in-season and live on the summer rail");
ok(placePartnerPick({ name: PLACE }).offerId === SKU,
  "the live summer card name still resolves to this SKU after the season check");

// ── 5. Client / guide source: no raw viator.com on this pin ──────────────
function stripComments(src) {
  return String(src || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}
const placeSrc = stripComments(readFileSync(new URL("../lib/placePartnerPicks.js", import.meta.url), "utf8"));
ok(!/https:\/\/www\.viator\.com/i.test(placeSrc),
  "lib/placePartnerPicks.js has no raw viator.com URL — the card only stores the opaque offer id");
ok(/\b173028P1\b/.test(placeSrc),
  "positive control: the product code is declared as a placePick offer id, so the absence check above is not scanning an empty file");

const cardSrc = stripComments(readFileSync(new URL("../app/components/IconicPlaceCard.js", import.meta.url), "utf8"));
ok(/commerceHref\(\{\s*provider:\s*partner\.provider/.test(cardSrc),
  "IconicPlaceCard builds the ticket href through commerceHref");
ok(!/https:\/\/www\.viator\.com/i.test(cardSrc),
  "IconicPlaceCard has no raw viator.com href");

const summerGuides = stripComments(readFileSync(new URL("../lib/guidesSummer2026.js", import.meta.url), "utf8"));
ok(!/\b173028P1\b/.test(summerGuides) && !/d5403-173028P1/.test(summerGuides),
  "guidesSummer2026.js does not carry this SKU — do not copy the #843 raw-viatorUrl bug");
ok(!/Clear Kayak Tour of Shell Key/.test(summerGuides),
  "guidesSummer2026.js has no invented editorial for this tour");

const guides = stripComments(readFileSync(new URL("../lib/guides.js", import.meta.url), "utf8"));
ok(!/\b173028P1\b/.test(guides) && !/d5403-173028P1/.test(guides),
  "lib/guides.js does not carry this SKU as a raw viatorUrl");

// ── 6. Live render path Trust hit (CALL resolveDetailCta, not a SKU grep) ─
// Production 2026-08-25: ?place=ChIJ5_NkHLUcw4gRndvLQGe_Ox8 painted only
// offer=237533P2 (Shell Key Ferry) from viaTours. The founder pin never
// reached the sheet because (a) closed-hours ran first and (b) the nearby
// list is a second offer source. This is that exact shape.
const livePlace = {
  id: PLACE_ID,
  name: PLACE,
  types: ["park", "natural_feature", "tourist_attraction", "point_of_interest"],
  address: "2187 Oceanview Dr, Tierra Verde, FL 33715, USA",
  lat: 27.6586734,
  lng: -82.7401087,
};
const ferryViaTours = {
  [PLACE_ID]: {
    loading: false,
    items: [{
      code: FERRY_SKU,
      title: "Shell Key Ferry",
      url: "https://www.viator.com/tours/St-Petersburg/Shell-Key-Ferry/d5403-237533P2",
    }],
  },
};
const liveCta = resolveDetailCta({
  detail: livePlace,
  kind: "nature",
  viaTours: ferryViaTours,
  locName: "Tierra Verde, FL",
  offers: {},
  openState: false,
});
ok(liveCta && liveCta.monetized === true,
  "the live closed Preserve sheet still paints an earning Book — closed hours cannot drop the founder pin");
ok(liveCta.offerId === SKU,
  `live primary offerId is the kayak ${SKU}, not the ferry (got ${liveCta && liveCta.offerId})`);
ok(liveCta.offerId !== FERRY_SKU,
  "live primary is never 237533P2");
ok(liveCta.exact === true, "live primary is the exact pin, not a viaTours re-resolve");
ok(String(liveCta.href || "").startsWith("/api/commerce/go?"),
  `live Book hops through /api/commerce/go (got ${String(liveCta.href || "").slice(0, 80)})`);
{
  const q = new URLSearchParams(String(liveCta.href || "").split("?")[1] || "");
  ok(q.get("offer") === SKU, `live href carries offer=${SKU} (got ${q.get("offer")})`);
  ok(q.get("provider") === "viator", "live href names provider=viator");
  ok(q.get("offer") !== FERRY_SKU, "live href does not carry the ferry offer");
}
ok(!/searchResults/i.test(String(liveCta.href || "")),
  "live href is never a searchResults URL");
ok(nearbyTourListAllowed(livePlace) === false,
  "nearbyTourListAllowed is false on the pinned Preserve — the ferry list cannot paint");
ok(nearbyTourListAllowed({ name: "A Museum Without A Pin", id: "ChIJ_no_pin" }) === true,
  "positive control: an unpinned place still allows the nearby list");

const idOnly = resolveDetailCta({
  detail: { ...livePlace, name: "Unnamed" },
  kind: "nature",
  viaTours: ferryViaTours,
  locName: "Tierra Verde, FL",
  offers: {},
  openState: true,
});
ok(idOnly.offerId === SKU,
  `place-id match still paints the kayak when the display name drifted (got ${idOnly && idOnly.offerId})`);

const egmont = resolveDetailCta({
  detail: {
    id: "ChIJ_egmont_not_this_card",
    name: "Egmont Key State Park",
    types: ["park", "tourist_attraction"],
    address: "3500 Pinellas Bayway S, Tierra Verde, FL 33715, USA",
  },
  kind: "nature",
  viaTours: {
    ChIJ_egmont_not_this_card: {
      loading: false,
      items: [{ code: FERRY_SKU, title: "Shell Key Ferry", url: "https://www.viator.com/tours/x/d5403-237533P2" }],
    },
  },
  locName: "Tierra Verde, FL",
  offers: {},
  openState: true,
});
ok(egmont.offerId === EGMONT_SKU,
  `Egmont keeps ${EGMONT_SKU} (got ${egmont && egmont.offerId}) — this fix did not steal the neighbor`);
ok(egmont.offerId !== FERRY_SKU, "Egmont is not 237533P2");

const holdPlace = resolveDetailCta({
  detail: { id: "ChIJ_crystal", name: "Crystal River State Park", types: ["park"] },
  kind: "wildlife",
  viaTours: {},
  locName: "Crystal River, FL",
  offers: {},
  openState: true,
});
ok(holdPlace.offerId !== HOLD_SKU && placePartnerPick({ name: "Crystal River State Park" }) === null,
  "Crystal River / 236862P2 stays unpinned — this did not revive #843 or the HOLD-SKU");

// ── 7. Probe can fail — positives and a known-absent ─────────────────────
ok(/viator\.com/.test(CANONICAL),
  "positive control: the canonical URL really is a viator.com product, so 'no viator.com in the href' is a real distinction");
ok(placePartnerPick({ name: "A Venue That Does Not Exist" }) === null,
  "an unlisted name is still null — the pin did not loosen exact-name matching");

if (fail.length) {
  console.error("test-shell-key-clear-kayak-pin: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`test-shell-key-clear-kayak-pin: OK — ${pass} assertions (placePartnerPick + commerceHref + resolveOffer + resolveDetailCta CALLED; live closed+ferry viaTours still paints ${SKU} through /api/commerce/go; nearby list suppressed; never ${FERRY_SKU}, never searchResults, never ${HOLD_SKU}; Egmont stays ${EGMONT_SKU}; summer rank 28 unchanged)`);
