#!/usr/bin/env node
/**
 * test-coupon-geo.mjs — locks the coupon/deal-sheet GEO-GATE.
 *
 * A city-scoped card (Clipp market or Supabase `offers` row with a city) must
 * only render for visitors whose resolved metro matches that city. Wrong-city
 * monetized inventory is worse than an empty slot.
 */
import { readFileSync } from "fs";
import { dealTiers, dealScope } from "../lib/dealSheet.js";
import { COUPONS, couponIsLive } from "../lib/coupons.js";
import { nearestMetro } from "../lib/orderInFeatured.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

const TODAY = "2026-08-01";
const SARASOTA = { lat: 27.3364, lng: -82.5307 };
const BRADENTON = { lat: 27.4989, lng: -82.5748 };
const TAMPA = { lat: 27.9506, lng: -82.4572 };
const ORLANDO = { lat: 28.5384, lng: -81.3789 };
const MIAMI = { lat: 25.76, lng: -80.19 }; // >75mi from every covered metro

const CLIPP_IDS = ["cpn-clipp-fl-sarasota", "cpn-clipp-fl-bradenton", "cpn-clipp-fl-tampa", "cpn-clipp-fl-orlando"];
const KLOOK_NATIONAL = "cpn-klook-us-attractions-5";

// Positive control: the area resolver places Bradenton in the Sarasota metro,
// so a Bradenton card is local to a Sarasota viewer (and vice versa).
ok(dealScope({ area: "Bradenton" }).metro === "sarasota", "Bradenton resolves to the Sarasota metro");
ok(dealScope({ area: "Sarasota" }).metro === "sarasota", "Sarasota resolves to the Sarasota metro");
ok(dealScope({ area: "Tampa" }).metro === "tampa", "Tampa resolves to the Tampa metro");
ok(dealScope({ area: "Orlando" }).metro === "orlando", "Orlando resolves to the Orlando metro");
ok(dealScope({ area: "United States" }).kind === "everywhere", "national inventory is everywhere, not a metro");
ok(dealScope({ area: "Europe travel" }).kind === "unplaced", "an unrecognised area is unplaced, not silently local");

// No viewer location: NATIONWIDE ONLY.
//
// INVERTED 2026-08-01. This asserted "every live deal stays renderable (can't prove
// a mismatch)" — the fail-OPEN, written down as if it were the rule. "Can't prove
// it's far" is the wrong test: the card claims a deal is NEAR YOU, so the burden is
// to prove NEAR. `center` is genuinely null on first paint, so the old behaviour
// flashed all four metros' cards and then contracted.
//
// Inverted rather than deleted, so the protection MOVES instead of disappearing —
// the same behaviour stays pinned, pointed the right way. Now identical to the rule
// lib/dealsData.js holds for the UT rail (#510); two surfaces disagreeing about
// what "near you" means is how one of them quietly goes wrong.
{
  const noCenter = dealTiers(COUPONS, TODAY);
  const shown = [...noCenter.featured, ...noCenter.ledger];
  const ids = new Set(shown.map((c) => c.id));
  ok(shown.length > 0, `something still renders with no location (got ${shown.length}) — an empty result would make the next two vacuous`);
  ok(CLIPP_IDS.every((id) => !ids.has(id)), "with no viewer location, NO city-scoped Clipp card renders — each is an unproven proximity claim");
  ok(shown.every((c) => dealScope(c).kind === "everywhere"), "…and everything that does render is nationwide, i.e. true regardless of where the user is");
}

// An area we cannot place must FAIL CLOSED, never be promoted to "probably near".
{
  const rogue = { id: "cpn-unplaceable", area: "Naples Beach District", title: "t", business: "b", url: "https://example.com" };
  ok(dealScope(rogue).kind === "unplaced", "the fixture really is unplaced — otherwise the next assertion proves nothing");
  const out = dealTiers([...COUPONS, rogue], TODAY, ORLANDO);
  ok(![...out.featured, ...out.ledger].some((c) => c.id === "cpn-unplaceable"),
    "an UNPLACED deal is not shown to a located viewer — the same rule that stopped a placeless ski deal rendering in Florida");
  ok(COUPONS.every((c) => dealScope(c).kind !== "unplaced"),
    "…and no registry deal is currently unplaced, so this rule costs zero inventory today");
}

// Matching metro: viewer in Sarasota sees the Sarasota-metro cards (Sarasota + Bradenton)
// plus nationwide, but not Tampa or Orlando.
{
  const here = dealTiers(COUPONS, TODAY, SARASOTA);
  const ids = new Set([...here.featured, ...here.ledger].map((c) => c.id));
  ok(ids.has("cpn-clipp-fl-sarasota"), "Sarasota viewer sees the Sarasota Clipp card");
  ok(ids.has("cpn-clipp-fl-bradenton"), "Sarasota viewer sees the Bradenton Clipp card (same metro)");
  ok(!ids.has("cpn-clipp-fl-tampa"), "Sarasota viewer does NOT see the Tampa Clipp card");
  ok(!ids.has("cpn-clipp-fl-orlando"), "Sarasota viewer does NOT see the Orlando Clipp card");
  ok(ids.has(KLOOK_NATIONAL), "Sarasota viewer still sees the national Klook code");
}

// Mismatching metro: an Orlando visitor must never see Sarasota/Bradenton/Tampa cards.
{
  const away = dealTiers(COUPONS, TODAY, ORLANDO);
  const ids = new Set([...away.featured, ...away.ledger].map((c) => c.id));
  ok(ids.has("cpn-clipp-fl-orlando"), "Orlando viewer sees the Orlando Clipp card");
  ok(!ids.has("cpn-clipp-fl-sarasota") && !ids.has("cpn-clipp-fl-bradenton") && !ids.has("cpn-clipp-fl-tampa"),
    "Orlando visitor sees NONE of the Sarasota/Bradenton/Tampa Clipp cards");
  ok(ids.has(KLOOK_NATIONAL), "Orlando visitor still sees the national Klook code");
}

// Bradenton viewer: nearestMetro resolves to Sarasota, so the whole Sarasota metro is local.
{
  ok(nearestMetro(BRADENTON.lat, BRADENTON.lng) === "sarasota", "Bradenton snaps to the Sarasota metro");
  const here = dealTiers(COUPONS, TODAY, BRADENTON);
  const ids = new Set([...here.featured, ...here.ledger].map((c) => c.id));
  ok(ids.has("cpn-clipp-fl-bradenton"), "Bradenton viewer sees the Bradenton Clipp card");
  ok(ids.has("cpn-clipp-fl-sarasota"), "Bradenton viewer sees the Sarasota Clipp card");
  ok(!ids.has("cpn-clipp-fl-orlando"), "Bradenton viewer does not see the Orlando Clipp card");
}

// Outside coverage: a Miami visitor gets nationwide/unplaced only; no metro-scoped cards.
{
  const out = dealTiers(COUPONS, TODAY, MIAMI);
  const ids = new Set([...out.featured, ...out.ledger].map((c) => c.id));
  ok(!CLIPP_IDS.some((id) => ids.has(id)), "Miami visitor sees no Clipp market cards");
  ok(ids.has(KLOOK_NATIONAL), "Miami visitor still sees the national Klook code");
}

// Supabase `offers` rows flow through the same gate: normalizeOfferRow sets `area`
// from the row's `city`, and dealTiers filters the merged list.
{
  const offer = { id: "offer:test", offer_title: "Test", city: "Sarasota", affiliate_url: "https://example.com" };
  const { normalizeOfferRow } = await import("../lib/coupons.js");
  const shaped = normalizeOfferRow(offer);
  ok(shaped && shaped.area === "Sarasota", "a Supabase offers row carries its city in `area`");
  ok(dealScope(shaped).metro === "sarasota", "…and resolves to the Sarasota metro");
  const forOrlando = dealTiers([shaped], TODAY, ORLANDO);
  ok(forOrlando.featured.length === 0 && forOrlando.ledger.length === 0,
    "a Sarasota Supabase offer is hidden from an Orlando viewer");
  const forSarasota = dealTiers([shaped], TODAY, SARASOTA);
  ok(forSarasota.featured.length === 1 || forSarasota.ledger.length === 1,
    "…and renders for a Sarasota viewer");
}

// Wiring: the Deal Sheet passes the viewer's center into dealTiers.
{
  const screen = read("app/components/screens/Coupons.js");
  ok(/dealTiers\(\s*all,\s*today,\s*center\s*\)/.test(screen),
    "CouponsScreen passes center to dealTiers");
  ok(/const \{ cpnOffers, center \} = ctx/.test(screen),
    "CouponsScreen takes center off ctx");
}

// Wiring: the experience-strip also geo-gates, using the same resolver.
{
  const exp = read("app/components/screens/Experience.js");
  ok(/import \{ dealScope \} from "\.\.\/\.\.\/\.\.\/lib\/dealSheet"/.test(exp),
    "ExperienceScreen imports the same dealScope resolver");
  ok(/import \{ nearestMetro \} from "\.\.\/\.\.\/\.\.\/lib\/orderInFeatured"/.test(exp),
    "ExperienceScreen imports nearestMetro");
  ok(/viewerKnown/.test(exp) && /viewerMetro/.test(exp), "ExperienceScreen resolves the viewer metro before filtering coupons");
  ok(/dealScope\(c\)/.test(exp), "ExperienceScreen filters each coupon through dealScope");
}

// The gate must never drop a live deal silently: partition still uses input refs.
{
  // BASELINE IS NOW THE REGISTRY ITSELF, not dealTiers-with-no-center.
  // This used `dealTiers(COUPONS, TODAY)` as a stand-in for "the full sheet". That
  // was a proxy for an ungated view, and it stopped being one the moment no-location
  // became nationwide-only — the comparison would have gone red for a purely
  // mechanical reason while the behaviour it cares about was fine. Comparing against
  // the LIVE REGISTRY is what the assertion always meant, and it cannot drift again.
  const liveIds = new Set(COUPONS.filter((c) => couponIsLive(c, TODAY)).map((c) => c.id));
  const orlando = dealTiers(COUPONS, TODAY, ORLANDO);
  const orlandoIds = new Set([...orlando.featured, ...orlando.ledger].map((c) => c.id));
  ok(liveIds.size > 0 && orlandoIds.size > 0, `both sides are non-empty (registry ${liveIds.size}, Orlando ${orlandoIds.size}) — two empties must never pass`);
  ok([...orlandoIds].every((id) => liveIds.has(id)), "every Orlando-visible deal exists in the live registry — the gate filters, it cannot MINT a card");
  ok(orlandoIds.size < liveIds.size, `Orlando sees strictly fewer deals than the registry holds (${orlandoIds.size} < ${liveIds.size}) — the gate is actually removing something`);
}

console.log(`test-coupon-geo: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
