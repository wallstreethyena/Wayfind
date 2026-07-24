// lib/cardAffiliate.js — decide which affiliate partner (if any) a browse card
// earns through, for the per-card disclosure chip (spec §2). This only READS the
// place's type/category (and calls the existing isTicketyPlace predicate); it
// never touches the Viator/Stay22 builders (that lane is owned elsewhere).
//
// Precedence: an explicit provider stamped on the row (deals/experiences) wins;
// otherwise infer from the place kind — ticketed attractions monetize via
// Viator, lodging via Stay22, everything else is unaffiliated (null).
import { isTicketyPlace } from "./affiliates.js";

const HOTELY = /lodging|hotel|motel|resort|bed_and_breakfast|guest_house/;

export function cardAffiliateProvider(place) {
  if (!place) return null;
  if (place.affiliate_provider) return place.affiliate_provider; // wf_experiences tag
  if (place.provider) return place.provider;                     // wf_deals row
  try { if (isTicketyPlace(place)) return "viator"; } catch { /* ignore */ }
  const types = ((place.types || []).join(" ")).toLowerCase();
  if (HOTELY.test(types) || place.category === "hotels" || place.category === "lodging") return "stay22";
  return null;
}
