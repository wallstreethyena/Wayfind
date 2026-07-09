// lib/family.js — v4.73: the family intelligence layer.
//
// Gabe's spec: Wayfind should not just show places; it should explain why a
// place fits THIS exact family moment. This module derives that explanation
// live, at render time, from data we already hold legitimately: the Google
// place object, current weather, and the clock. Nothing here is scraped or
// stored, so it can never go stale and never violates Places ToS.
//
// familyWhy(place, ctx) -> { line, bestFor, cost } | null
//   ctx: { temp (F), rainy (bool), distMi, openNow }

const CATS = [
  { cat: "playground", rx: /playground|splash pad|spray ?ground/i, indoor: false, free: true, quick: true, best: "toddlers" },
  { cat: "library", rx: /\blibrary\b/i, indoor: true, free: true, quick: true, best: "toddlers" },
  { cat: "farm", rx: /\bfarms?\b|ranch|orchard|berry|petting zoo|u-pick/i, indoor: false, free: false, quick: false, best: "whole family" },
  { cat: "aquarium & zoo", rx: /aquarium|\bzoo\b|wildlife|sanctuary|animal park/i, indoor: false, free: false, quick: false, best: "whole family" },
  { cat: "museum", rx: /museum|science center|planetarium|discovery center/i, indoor: true, free: false, quick: false, best: "whole family" },
  { cat: "indoor play", rx: /trampoline|bounce|arcade|bowling|skating|roller|laser tag|indoor play|jump park|game room/i, indoor: true, free: false, quick: true, best: "big kids" },
  { cat: "mini golf", rx: /mini ?golf|putt[- ]?putt/i, indoor: false, free: false, quick: true, best: "big kids" },
  { cat: "movies", rx: /cinema|movie theater|cinemas/i, indoor: true, free: false, quick: false, best: "big kids" },
  { cat: "beach", rx: /\bbeach\b/i, indoor: false, free: true, quick: false, best: "whole family" },
  { cat: "park", rx: /\bparks?\b|preserve|nature trail|botanical|gardens?\b/i, indoor: false, free: true, quick: true, best: "whole family" },
];

export function familyProfile(place) {
  const hay = (((place && place.types) || []).join(" ") + " " + ((place && place.name) || "")).toLowerCase();
  for (const c of CATS) if (c.rx.test(hay)) return c;
  return null;
}

function driveMins(distMi) {
  if (distMi == null) return null;
  return Math.max(3, Math.round(distMi * 2)); // suburban Florida pace
}

export function familyWhy(place, ctx) {
  const prof = familyProfile(place);
  if (!prof) return null;
  const c = ctx || {};
  const temp = typeof c.temp === "number" ? c.temp : null;
  const rainy = !!c.rainy;
  const reasons = [];

  // Best-for framing leads: whose day is this for?
  const bestFor = prof.best === "toddlers" ? "Great for little ones" : prof.best === "big kids" ? "Big-kid energy" : "Whole-family pick";

  // Weather fit — the "why TODAY" heart of the layer.
  if (prof.indoor && rainy) reasons.push("rain-proof");
  else if (prof.indoor && temp != null && temp >= 88) reasons.push("beat the heat indoors");
  else if (!prof.indoor && rainy) reasons.push("better once the rain clears");
  else if (!prof.indoor && temp != null && temp >= 93) reasons.push("go early before the heat");
  else if (!prof.indoor && temp != null && temp >= 60 && temp < 88) reasons.push("great weather for it");

  if (prof.free) reasons.push("free");
  else if (place && place.priceLevel != null) reasons.push(place.priceLevel <= 1 ? "easy on the wallet" : null);

  if (prof.quick) reasons.push("works in under 2 hours");

  const mins = driveMins(c.distMi);
  if (mins != null && mins <= 30) reasons.push("about " + mins + " min away");

  if (c.openNow === true) reasons.push("open now");

  const parts = reasons.filter(Boolean).slice(0, 3);
  const line = bestFor + (parts.length ? " \u00b7 " + parts.join(" \u00b7 ") : "");
  return { line, bestFor: prof.best, cost: prof.free ? "Free" : null, cat: prof.cat };
}
