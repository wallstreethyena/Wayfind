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
// placePartnerPick / commerceHref / resolveOffer / summerEntriesNow.

import { readFileSync } from "node:fs";
import { commerceHref } from "../lib/commerce.js";
import { PARTNER_OFFER_REGISTRY, partnerOfferById } from "../lib/partnerOfferRegistry.js";
import { placePartnerPick } from "../lib/placePartnerPicks.js";
import { PROVIDERS, resolveOffer } from "../lib/commerceProviders.js";
import { SUMMER_UNIVERSE, summerEntriesNow } from "../lib/summerUniverse.js";

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

const SKU = "173028P1";
const CANONICAL = "https://www.viator.com/tours/St-Petersburg/Clear-Kayak-Tours-of-Shell-Key/d5403-173028P1";
const HOLD_SKU = "236862P2";
const PLACE = "Shell Key Preserve";

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
ok(placePartnerPick({ name: "Egmont Key State Park" })?.offerId === "237533P5",
  "Egmont Key keeps its existing ferry pin — this SKU did not steal a neighbor");

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

const hold = await resolveOffer("viator", HOLD_SKU, { env: () => null });
ok(hold.error === "no-supabase-env" && !hold.dest,
  `the scallop HOLD-SKU ${HOLD_SKU} is not pinned and fails closed without a catalogue (got ${hold.error || hold.dest})`);

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

// ── 6. Probe can fail — positives and a known-absent ─────────────────────
ok(/viator\.com/.test(CANONICAL),
  "positive control: the canonical URL really is a viator.com product, so 'no viator.com in the href' is a real distinction");
ok(placePartnerPick({ name: "A Venue That Does Not Exist" }) === null,
  "an unlisted name is still null — the pin did not loosen exact-name matching");

if (fail.length) {
  console.error("test-shell-key-clear-kayak-pin: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`test-shell-key-clear-kayak-pin: OK — ${pass} assertions (placePartnerPick + commerceHref + resolveOffer CALLED; ${SKU} hops through /api/commerce/go; dest is the founder-verified product, never searchResults, never ${HOLD_SKU}; summer rank 28 unchanged)`);
