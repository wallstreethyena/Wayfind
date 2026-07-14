// lib/placeTaxonomy.js — v6.16: NO LONGER A SECOND CLASSIFIER.
//
// This file used to own its own independent category logic, and that was the bug.
// Two classifiers existed: this one wrote every `wf_inventory.category` (via the
// seeder), while lib/placeCategory.js decided what the LIVE gate showed. They
// disagreed on 66 of 1,027 real rows — this file called a marina a `beach` and a
// mobile-home park a `hotel`, the live gate called them Activities, and nothing
// reconciled them. That divergence IS the "wrong list" bug class.
//
// It is now a thin ADAPTER over the one classifier in lib/placeCategory.js. It
// keeps this module's long-standing API (classifyPlace(types, primaryType, name)
// -> { category, tags, via }) so the seeder and its tests keep working, and adds
// the fields the repair path needs.
//
// The two rules that lived ONLY here are preserved, because they are load-bearing:
//   1. TAGS — the sub-filter vocabulary (museums / outdoors / markets / bars …)
//      that the read path matches to chips BY EQUALITY. Now emitted by classify().
//   2. `via` PROVENANCE — how the category was decided: "primaryType" | "types" |
//      "name" | null. A category recovered from the NAME is NOT trusted: the
//      seeder lands those with needs_review=true and last_verified_at=null. The
//      name net may FLAG; it may never silently decide. This is what keeps a
//      guessed category from masquerading as a verified one.

import { classify } from "./placeCategory.js";

// classifyPlace — unchanged signature, one implementation underneath.
// Returns { category, tags, via } exactly as before. `category` is the STORED
// wf_inventory vocabulary (food|nightlife|attractions|beach|hotels|shopping) and
// is null when the place carries no discovery identity — the honest signal that
// the seeder should fall back to the anchor list (data/anchors.json) or skip it.
export function classifyPlace(types, primaryType, name) {
  const { category, tags, via } = classify({ types, primaryType, name });
  return { category, tags, via };
}

// classifyPlaceFull — everything the seeder and the repair script need, including
// the exclusion verdict (a service/trade business, a residence, a parking lot or
// a scraped short-term rental is not a Wayfind result in ANY category) and the
// SECOND list a place also belongs in (a campground is an outdoor experience AND
// a real place to stay tonight).
export function classifyPlaceFull(types, primaryType, name) {
  return classify({ types, primaryType, name });
}

export { classify } from "./placeCategory.js";
