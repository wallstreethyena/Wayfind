"use client";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, SUBFILTERS, VIBES, getLoader, geocodeCity, reverseGeocode, searchPlaces, fetchPlaceDetail, fetchPlaceById, findPlace, searchNearbyPlaces } from "../lib/google";
import { supabase } from "../lib/supabase";
import MapView from "./components/MapView";

const C = {
  bg: "#0D1117", panel: "#161B22", card: "#1C2230", border: "#2D3748",
  accent: "#F97316", adim: "rgba(249,115,22,.15)", blue: "#38BDF8", green: "#22C55E",
  red: "#EF4444", purple: "#A78BFA", pink: "#F472B6", gold: "#FBBF24",
  text: "#F1F5F9", muted: "#94A3B8", light: "#CBD5E1",
};
const CAT_ICONS = { food: "🍽️", nightlife: "🍸", attractions: "🎯", beach: "🏖️", hotels: "🏨", shopping: "🛍️" };
// Each category gets its own accent color, used on the selected category tab.
const CAT_COLOR = {
  food: { c: "#F97316", dim: "rgba(249,115,22,.15)" },
  nightlife: { c: "#F472B6", dim: "rgba(244,114,182,.15)" },
  attractions: { c: "#A78BFA", dim: "rgba(167,139,250,.15)" },
  beach: { c: "#2DD4BF", dim: "rgba(45,212,191,.15)" },
  hotels: { c: "#38BDF8", dim: "rgba(56,189,248,.15)" },
  shopping: { c: "#22C55E", dim: "rgba(34,197,94,.15)" },
};
const DEFAULT_CENTER = { lat: 27.5689, lng: -82.4393, name: "Parrish, FL" };

// Intent: Wayfind asks WHY you are going out, then reshapes every pick around it.
const INTENTS = [
  { id: "eat", icon: "🍽️", label: "Eat", plans: [{ cat: "food", kw: "" }, { cat: "food", kw: "popular restaurants" }, { cat: "food", kw: "local favorite" }] },
  { id: "celebrate", icon: "🎉", label: "Celebrate", plans: [{ cat: "food", kw: "upscale restaurant" }, { cat: "nightlife", kw: "cocktail bar" }, { cat: "nightlife", kw: "rooftop bar" }] },
  { id: "date", icon: "❤️", label: "Date", plans: [{ cat: "food", kw: "romantic restaurant" }, { cat: "nightlife", kw: "cocktail bar" }, { cat: "food", kw: "waterfront" }, { cat: "food", kw: "dessert" }] },
  { id: "family", icon: "👨‍👩‍👧", label: "Family", plans: [{ cat: "attractions", kw: "family friendly" }, { cat: "food", kw: "family restaurant" }, { cat: "attractions", kw: "park" }] },
  { id: "kids", icon: "👶", label: "Kids", plans: [{ cat: "attractions", kw: "things to do with kids" }, { cat: "attractions", kw: "playground park" }, { cat: "food", kw: "ice cream" }] },
  { id: "relax", icon: "🌅", label: "Relax", plans: [{ cat: "beach", kw: "" }, { cat: "attractions", kw: "park" }, { cat: "food", kw: "coffee" }] },
  { id: "night", icon: "🎵", label: "Night out", plans: [{ cat: "nightlife", kw: "bar" }, { cat: "nightlife", kw: "night club" }, { cat: "nightlife", kw: "live music" }] },
  { id: "work", icon: "💻", label: "Work", plans: [{ cat: "food", kw: "coffee shop wifi" }, { cat: "food", kw: "cafe" }] },
  { id: "visit", icon: "✈️", label: "Visiting", plans: [{ cat: "attractions", kw: "top attractions" }, { cat: "attractions", kw: "things to do" }, { cat: "attractions", kw: "landmark" }] },
];

// One line of live context for the header, shaped by weather, time and the week.
function dynamicSubline(weather) {
  const d = new Date();
  const h = d.getHours();
  const day = d.getDay();
  const weekend = day === 5 || day === 6 || day === 0;
  if (weather && weather.wet) return "Rain around today, leaning toward great indoor spots";
  if (weather && weather.rain != null && weather.rain >= 50) return "Showers likely, here are solid indoor options";
  if (h >= 21) return "Open late and worth the trip tonight";
  if (h >= 17) return "Where to land for dinner and drinks tonight";
  if (weekend && h < 12) return "Weekend favorites to start your day";
  if (weekend) return "Weekend favorites near you";
  if (h < 11) return "A good way to start your morning";
  if (h < 15) return "Lunch and midday picks near you";
  return "Today's top picks near you";
}
const CAT_LABEL_COLOR = { Food: "#F97316", Nightlife: "#F472B6", Activities: "#A78BFA", Beach: "#2DD4BF", Hotels: "#38BDF8", Shopping: "#22C55E" };

// Lowercased description + review text per place id, filled in when we prefetch
// the top results. Lets the badge engine read evidence like "on the waterfront
// with live music" that is not in the structured attribute flags. Only the
// prefetched top results have an entry; everything else falls back to name plus
// Google attributes. Nothing here is invented.
const HINTS = {};
const EMOJIS = ["❤️","⭐","🍴","🍸","🏖️","✈️","🎉","☕","🏨","🛍️","🎯","🌮","🍜","🎸","🏞️","📍"];

// Signal engine — captures like/dislike/open/save per place, drives personalised ranking.
// All data stays on-device (localStorage) until the user opts in by signing up.
function loadSignals() {
  try { return JSON.parse(localStorage.getItem("wf_signals") || "[]"); } catch { return []; }
}
function saveSignals(sigs) {
  try { localStorage.setItem("wf_signals", JSON.stringify(sigs.slice(0, 1000))); } catch {}
}
// Per-category and per-badge affinity weights. Half-life = 5 days.
function computeAffinities(sigs) {
  const catW = {}; const badgeW = {};
  const HL = 5 * 24 * 3600 * 1000;
  const now = Date.now();
  const W = { like: 1.5, save: 2.0, open: 0.2, dislike: -1.3 };
  for (const s of sigs) {
    const w = (W[s.action] || 0) * Math.pow(0.5, (now - s.ts) / HL);
    if (s.cat) catW[s.cat] = (catW[s.cat] || 0) + w;
    for (const b of (s.badges || [])) badgeW[b] = (badgeW[b] || 0) + w;
  }
  return { catW, badgeW };
}
// Blend Wayfind Score with personal affinity AND distance to re-rank the feed.
// Nearby places rank above equally-scored distant ones.
function applyAffinity(places, affinities) {
  const { catW, badgeW } = affinities;
  const maxC = Math.max(...Object.values(catW).map(Math.abs), 0.01);
  const maxB = Math.max(...Object.values(badgeW).map(Math.abs), 0.01);
  return places.map((p) => {
    const pc = (primaryCategory(p) || "").toLowerCase();
    let boost = ((catW[pc] || 0) / maxC) * 14;
    for (const b of experienceBadges(p, null, 6).map((x) => x.key)) {
      boost += ((badgeW[b] || 0) / maxB) * 9;
    }
    boost = Math.max(-20, Math.min(boost, 30));
    // Distance penalty: 1 point per 3 miles, max 15 points — same as searchPlaces
    const distPenalty = Math.min(15, (p.distMi || 0) / 3);
    return { ...p, _ps: (p.wfScore || 50) + boost - distPenalty };
  }).sort((a, b) => b._ps - a._ps);
}

// Build an absolute share URL on the current origin.
function originUrl(path) {
  if (typeof window === "undefined") return path;
  return window.location.origin + path;
}

// Compact a place down to what a shared list needs to render.
function compactPlace(p) {
  return { id: p.id, n: p.name, r: p.rating, c: p.reviews, pr: p.price, pn: p.priceNum, a: p.address, t: p.type, la: p.lat, lo: p.lng, ph: p.photo || null };
}
function expandPlace(o) {
  return { id: o.id, name: o.n, rating: o.r, reviews: o.c || 0, price: o.pr || null, priceNum: o.pn == null ? null : o.pn, address: o.a || "", type: o.t || "", lat: o.la, lng: o.lo, photo: o.ph || null, photos: o.ph ? [o.ph] : [], labels: [], mapsUrl: `https://www.google.com/maps/search/?api=1&query_place_id=${o.id}` };
}
function encodeList(places) {
  try {
    const json = JSON.stringify(places.slice(0, 25).map(compactPlace));
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.split("+").join("-").split("/").join("_").split("=").join("");
  } catch { return ""; }
}
function decodeList(str) {
  try {
    const b = str.split("-").join("+").split("_").join("/");
    const json = decodeURIComponent(escape(atob(b)));
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.map(expandPlace) : null;
  } catch { return null; }
}
// Share a link via the OS share sheet, falling back to copy. Passing url as a
// distinct field (not buried in text) is what lets iMessage/Facebook unfurl a
// rich preview card instead of showing the raw link as plain text.
async function shareLink(title, url, onCopied, text) {
  try {
    if (navigator.share) { await navigator.share({ title, text: text || title, url }); return; }
  } catch { return; }
  try {
    await navigator.clipboard.writeText(text ? `${text}\n${url}` : url);
    if (onCopied) onCopied();
  } catch {
    if (onCopied) onCopied();
  }
}
// Short random code for shareable list links (no ambiguous chars).
function randCode() {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 7; i++) out += a[Math.floor(Math.random() * a.length)];
  return out;
}

function galleryBtn(side) {
  return {
    position: "absolute", top: "50%", transform: "translateY(-50%)", [side]: 8,
    width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(255,255,255,.25)",
    background: "rgba(13,17,23,.55)", color: "#fff", fontSize: 20, lineHeight: 1,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  };
}

function stars(r) {
  if (!r) return "";
  return "★".repeat(Math.floor(r)) + (r % 1 >= 0.5 ? "½" : "");
}

const LINE_TTL = 30 * 24 * 3600 * 1000; // 30 days
function allCachedLines() {
  try { return JSON.parse(localStorage.getItem("wf_lines") || "{}"); } catch { return {}; }
}
function getCachedLine(id) {
  try {
    const e = allCachedLines()[id];
    if (e && Date.now() - e.t < LINE_TTL) return e.v;
  } catch {}
  return null;
}
function setCachedLines(map) {
  try {
    const c = allCachedLines();
    const now = Date.now();
    Object.keys(map || {}).forEach((id) => { if (map[id]) c[id] = { v: map[id], t: now }; });
    localStorage.setItem("wf_lines", JSON.stringify(c));
  } catch {}
}
function getCachedInsight(id) {
  try {
    const e = JSON.parse(localStorage.getItem("wf_insights") || "{}")[id];
    if (e && Date.now() - e.t < LINE_TTL) return e.v;
  } catch {}
  return null;
}
function setCachedInsight(id, data) {
  try {
    const c = JSON.parse(localStorage.getItem("wf_insights") || "{}");
    c[id] = { v: data, t: Date.now() };
    localStorage.setItem("wf_insights", JSON.stringify(c));
  } catch {}
}

// Turn the 0 to 100 score into a 9.0 style number plus a plain-language tier.
function scoreLabel(wf) {
  if (wf == null) return null;
  const s = (wf / 10).toFixed(1);
  let word = "Fair";
  if (wf >= 95) word = "Exceptional";
  else if (wf >= 90) word = "Excellent";
  else if (wf >= 85) word = "Great";
  else if (wf >= 80) word = "Very good";
  else if (wf >= 70) word = "Good";
  return { s, word };
}

function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// A recommendation-style header above the cards, shaped by category and time of
// day, so the list reads as picks for right now rather than a directory count.
function picksHeader(cat) {
  const h = new Date().getHours();
  const part = h < 11 ? "this morning" : h < 17 ? "this afternoon" : "tonight";
  if (cat === "nightlife") return "Where to go tonight";
  if (cat === "attractions") return "Best things to do nearby";
  if (cat === "hotels") return "Top places to stay";
  if (cat === "shopping") return "Best shopping nearby";
  return `Top picks ${part}`;
}

// WMO weather code to a small icon and word. Used with the free, keyless
// Open-Meteo API so Wayfind can show local weather and reason about it.
function weatherFromCode(code) {
  const c = Number(code);
  if (c === 0) return { icon: "☀️", label: "Clear", warm: true };
  if (c === 1 || c === 2) return { icon: "🌤️", label: "Partly cloudy", warm: true };
  if (c === 3) return { icon: "☁️", label: "Overcast" };
  if (c === 45 || c === 48) return { icon: "🌫️", label: "Fog" };
  if (c >= 51 && c <= 57) return { icon: "🌦️", label: "Drizzle", wet: true };
  if (c >= 61 && c <= 67) return { icon: "🌧️", label: "Rain", wet: true };
  if (c >= 71 && c <= 77) return { icon: "❄️", label: "Snow", wet: true };
  if (c >= 80 && c <= 82) return { icon: "🌦️", label: "Showers", wet: true };
  if (c >= 85 && c <= 86) return { icon: "🌨️", label: "Snow", wet: true };
  if (c >= 95) return { icon: "⛈️", label: "Storms", wet: true };
  return { icon: "🌡️", label: "" };
}

// A clean, honest one-liner built only from a place's stats. Used instantly and
// as the fallback when the AI card line is unavailable. Never invents anything.
function templateBlurb(p) {
  const b = experienceBadges(p, null, 1)[0];
  const key = b ? b.key : null;
  const lines = {
    localfav: "A local favorite people keep coming back to.",
    gem: "A quieter spot that punches above its size.",
    value: "Genuinely good food without the big bill.",
    waterfront: "Worth it for a table near the water.",
    rooftop: "Go for the view from up top.",
    romantic: "An easy pick for date night.",
    livemusic: "Come for the food, stay for the live music.",
    pizza: "Come for the pizza, leave happy.",
    sushi: "Fresh sushi and a steady hand.",
    steak: "For when only a great steak will do.",
    seafood: "Fresh seafood close to the water.",
    burgers: "Go for a proper, messy burger.",
    mexican: "Tacos and everything around them, done right.",
    italian: "Pasta and red sauce worth the carbs.",
    dessert: "Save room. This is the good part.",
    cocktails: "Proper cocktails, made with care.",
    wine: "A good list and a quiet pour.",
    beer: "Cold taps and a relaxed table.",
    coffee: "Where the day starts and the laptops open.",
    breakfast: "The most important meal, done right.",
    outdoor: "Grab a table in the open air.",
    family: "Easy with kids and good for grownups too.",
    groups: "Room for the whole crew.",
    dog: "Bring the dog. Everyone is welcome.",
    sports: "Big screens and the game on.",
  };
  if (key && lines[key]) return lines[key];
  if (p.rating >= 4.6) return "One of the better-reviewed spots near you.";
  if (p.rating >= 4.3) return "A solid, well-reviewed choice nearby.";
  return "Worth a look while you are nearby.";
}

// Curated experiences. Each one is a real search plus an honest filter. Badges
// on cards map straight into these, so a badge means the same thing everywhere.
const EXPERIENCES = {
  gem:       { icon: "💎", label: "Hidden gem",      title: "Hidden Gems",      cat: "food",      lead: "The quietly excellent places most people walk right past.", filter: (p) => p.rating >= 4.4 && p.reviews >= 15 && p.reviews < 800 },
  value:     { icon: "💰", label: "Great value",     title: "Great Value",      cat: "food",      keyword: "affordable cheap eats", lead: "Genuinely good food that does not cost a fortune.", filter: (p) => p.rating >= 4.2 && (p.priceNum == null || p.priceNum <= 2) },
  localfav:  { icon: "⭐", label: "Local favorite",  title: "Local Favorites",  cat: "food",      lead: "Spots people keep coming back to, ranked by the Wayfind Score.", filter: (p) => p.rating >= 4.6 && p.reviews >= 800 },
  waterfront:{ icon: "🌊", label: "Waterfront",      title: "On the Water",     cat: "food",      keyword: "waterfront", lead: "Tables with the water in view." },
  rooftop:   { icon: "🌆", label: "Rooftop",         title: "Rooftop Spots",    cat: "nightlife", keyword: "rooftop", lead: "Drinks and a view from up top." },
  romantic:  { icon: "💕", label: "Romantic",        title: "Date Night",       cat: "food",      keyword: "romantic restaurant", lead: "Low light, good wine, and a table for two." },
  livemusic: { icon: "🎵", label: "Live music",      title: "Live Music",       cat: "nightlife", keyword: "live music", lead: "Where the night comes with a soundtrack." },
  outdoor:   { icon: "🌳", label: "Outdoor",         title: "Outdoor Dining",   cat: "food",      keyword: "outdoor seating patio", lead: "Patios, courtyards, and tables in the open air." },
  groups:    { icon: "🎉", label: "Great for groups", title: "Great for Groups", cat: "food",     lead: "Room for the whole crew without the side-eye.", filter: (p) => (p.labels || []).includes("Good for groups") },
  dog:       { icon: "🐶", label: "Dog friendly",    title: "Dog Friendly",     cat: "food",      lead: "Bring the dog. Everyone is welcome here.", filter: (p) => (p.labels || []).includes("Dog friendly") },
  family:    { icon: "👨‍👩‍👧", label: "Family friendly", title: "Family Favorites", cat: "attractions", keyword: "family friendly things to do", lead: "Easy with kids and actually good for the grownups too." },
  instagram: { icon: "📸", label: "Instagrammable",   title: "Most Photogenic",   cat: "attractions", keyword: "scenic photo spots views", lead: "The spots worth stopping for the picture." },
  cocktails: { icon: "🍸", label: "Cocktails",       title: "Cocktail Bars",    cat: "nightlife", keyword: "cocktails", lead: "Proper drinks, made with care." },
  wine:      { icon: "🍷", label: "Wine",            title: "Wine Spots",       cat: "nightlife", keyword: "wine bar", lead: "A good list and a quiet pour." },
  beer:      { icon: "🍺", label: "Great beer",      title: "Beer & Breweries", cat: "nightlife", keyword: "brewery craft beer", lead: "Cold taps and a proper pour." },
  sports:    { icon: "📺", label: "Sports",          title: "Sports Bars",      cat: "nightlife", keyword: "sports bar", lead: "Big screens, cold beer, game on." },
  coffee:    { icon: "☕", label: "Coffee",          title: "Coffee Shops",     cat: "food",      keyword: "coffee shop", lead: "Where the day starts and the laptops open." },
  breakfast: { icon: "🍳", label: "Breakfast & brunch", title: "Breakfast & Brunch", cat: "food",   keyword: "breakfast brunch", lead: "The most important meal, done right." },
  pizza:     { icon: "🍕", label: "Pizza",           title: "Best Pizza",       cat: "food",      keyword: "pizza", lead: "Slices and pies worth the napkins." },
  sushi:     { icon: "🍣", label: "Sushi",           title: "Best Sushi",       cat: "food",      keyword: "sushi", lead: "Fresh fish and a steady hand." },
  steak:     { icon: "🥩", label: "Steakhouse",      title: "Steakhouses",      cat: "food",      keyword: "steakhouse", lead: "For when only a great steak will do." },
  seafood:   { icon: "🦐", label: "Seafood",         title: "Best Seafood",     cat: "food",      keyword: "seafood", lead: "Straight from the water to the table." },
  burgers:   { icon: "🍔", label: "Burgers",         title: "Best Burgers",     cat: "food",      keyword: "burgers", lead: "The honest, messy, great American burger." },
  mexican:   { icon: "🌮", label: "Mexican",         title: "Mexican",          cat: "food",      keyword: "mexican", lead: "Tacos, salsa, and everything around them." },
  italian:   { icon: "🍝", label: "Italian",         title: "Italian",          cat: "food",      keyword: "italian", lead: "Pasta, red sauce, and a little romance." },
  dessert:   { icon: "🍰", label: "Bakery & sweets", title: "Bakery & Sweets",  cat: "food",      keyword: "bakery dessert", lead: "Warm bread, pastries, cakes, and the good stuff." },
};

// Run a place through the FULL badge engine, not just the badge a user tapped.
// Every qualifying badge is found from real Google data (rating, review volume,
// price, the place name, and Google attribute flags), sorted by how defining it
// is, and capped. selectedKey, when set, is always shown first so a curated page
// never hides the reason a place is on it. Nothing is fabricated.
function experienceBadges(p, selectedKey, max) {
  const lim = max || 3;
  const L = p.labels || [];
  const nm = (p.name || "").toLowerCase();
  const t = (p.type || "").toLowerCase();
  const q = new Set();
  const hint = (HINTS[p.id] || "").toLowerCase();
  const said = (arr) => arr.some((w) => nm.includes(w) || hint.includes(w));

  // Reputation, computed from rating and review volume and price.
  if (p.rating >= 4.6 && p.reviews >= 800) q.add("localfav");
  if (p.rating >= 4.5 && p.reviews >= 2500) q.add("localfav");
  if (p.rating >= 4.4 && p.reviews >= 15 && p.reviews < 800) q.add("gem");
  if (p.rating >= 4.2 && p.priceNum != null && p.priceNum <= 2) q.add("value");

  // Setting, read from the place name and (for prefetched places) its
  // description and reviews. Honest text evidence, never invented.
  if (said(["waterfront", "riverfront", "river roo", "riverwalk", "on the river", "bayfront", "beachfront", "lakefront", " pier", "wharf", "dockside", "marina", "boathouse", "fish house", "on the bay", "on the water"])) q.add("waterfront");
  if (said(["rooftop", "roof top", "sky bar", "skybar", "skyline"])) q.add("rooftop");
  if (said(["romantic", "date night", "intimate", "candlelit", "special occasion"])) q.add("romantic");
  if (said(["instagram", "instagrammable", "photo spot", "photogenic", "aesthetic", "scenic", "great views", "amazing views", "beautiful views", "stunning views", "picturesque", "mural"])) q.add("instagram");

  // Attractions: zoos, aquariums, parks and theme parks are honestly family
  // and outdoor places even when Google sets no restaurant-style attribute.
  const ts = (p.types || []).join(" ").toLowerCase();
  if (["zoo", "aquarium", "amusement_park", "water_park", "theme_park"].some((x) => ts.includes(x))) q.add("family");
  if (["zoo", "aquarium", "amusement_park", "water_park", "theme_park", "national_park", "state_park", "botanical_garden", "campground", "beach"].some((x) => ts.includes(x))) q.add("outdoor");

  // Live music and family: real attribute flags OR the text clearly says so.
  if (L.includes("Live music") || said(["live music", "live band", "live bands"])) q.add("livemusic");
  if (L.includes("Kid friendly") || L.includes("Kids menu") || said(["family friendly", "families", "great for kids", "good for kids", "kid friendly"])) q.add("family");
  if (L.includes("Cocktails")) q.add("cocktails");
  if (L.includes("Wine")) q.add("wine");
  if (L.includes("Beer")) q.add("beer");
  if (L.includes("Good for sports")) q.add("sports");
  if (L.includes("Coffee")) q.add("coffee");
  if (L.includes("Breakfast")) q.add("breakfast");
  if (L.includes("Brunch")) q.add("breakfast");
  if (L.includes("Outdoor seating")) q.add("outdoor");
  if (L.includes("Good for groups")) q.add("groups");
  if (L.includes("Dog friendly")) q.add("dog");

  // Cuisine, read from ALL of the Google types (not just the first), so an
  // "American restaurant" that Google also tags hamburger_restaurant still earns
  // its burger badge. Names help too (a place literally called "Pizza ...").
  const tt = ((p.types || []).join(" ") + " " + t + " " + nm).toLowerCase();
  const typeMap = [["pizza", "pizza"], ["sushi", "sushi"], ["steak", "steak"], ["seafood", "seafood"], ["hamburger", "burgers"], ["burger", "burgers"], ["mexican", "mexican"], ["taco", "mexican"], ["italian", "italian"], ["bakery", "dessert"], ["ice cream", "dessert"], ["ice_cream", "dessert"], ["dessert", "dessert"], ["donut", "dessert"], ["coffee", "coffee"], ["cafe", "coffee"], ["brewery", "beer"], ["brew_pub", "beer"], ["brewpub", "beer"]];
  for (const [needle, key] of typeMap) { if (tt.includes(needle)) q.add(key); }

  const order = ["localfav", "gem", "value", "waterfront", "rooftop", "instagram", "romantic", "livemusic", "pizza", "sushi", "steak", "seafood", "burgers", "mexican", "italian", "dessert", "cocktails", "wine", "beer", "sports", "coffee", "breakfast", "outdoor", "family", "groups", "dog"];
  let keys = order.filter((k) => q.has(k) && EXPERIENCES[k]);
  if (selectedKey && EXPERIENCES[selectedKey]) {
    keys = keys.filter((k) => k !== selectedKey);
    keys.unshift(selectedKey);
  }
  return keys.slice(0, lim).map((k) => ({ key: k, icon: EXPERIENCES[k].icon, label: EXPERIENCES[k].label }));
}

// The main Wayfind section a place belongs to, read from its Google types.
function catOfType(x) {
  x = (x || "").toLowerCase();
  const any = (arr) => arr.some((k) => x.includes(k));
  if (any(["lodging", "hotel", "motel", "resort", "guest_house", "bed_and_breakfast", "campground"])) return "Hotels";
  if (any(["restaurant", "food", "cafe", "coffee", "bakery", "meal_", "ice_cream", "deli"])) return "Food";
  if (any(["night_club", "bar", "pub", "brewery", "liquor"])) return "Nightlife";
  if (any(["tourist", "museum", "park", "art_gallery", "amusement", "aquarium", "zoo", "stadium", "landmark", "historical", "beach", "marina", "natural_feature"])) return "Activities";
  if (any(["store", "shopping", "mall", "market", "shop", "boutique"])) return "Shopping";
  return null;
}
function primaryCategory(p) {
  const ts = (p.types && p.types.length) ? p.types : (p.type ? [p.type.split(" ").join("_")] : []);
  for (const x of ts) { const c = catOfType(x); if (c) return c; }
  return null;
}

function tagsFor(p) {
  const t = [];
  if (p.rating >= 4.6 && p.reviews >= 300) t.push({ label: "Top rated", color: C.gold });
  if (p.rating >= 4.3 && p.priceNum != null && p.priceNum <= 2) t.push({ label: "Great value", color: C.green });
  if (p.reviews >= 2000) t.push({ label: "Very popular", color: C.blue });
  if (p.rating >= 4.5 && p.reviews > 0 && p.reviews < 250) t.push({ label: "Hidden gem", color: C.purple });
  if (p.distMi != null && p.distMi <= 5) t.push({ label: "Nearby", color: C.pink });
  if (p.type) t.push({ label: p.type, color: C.muted, dim: true });
  return t.slice(0, 5);
}

// Top 5 ranking medals: 1 gold, 2 silver, 3 to 5 bronze.
// How much to trust the rating, based purely on how many people rated it.
// No invented numbers: it just reads the real review count.
function confidenceOf(reviews) {
  const n = reviews || 0;
  if (n >= 500) return { label: "High confidence", color: "#22C55E" };
  if (n >= 100) return { label: "Medium confidence", color: "#FBBF24" };
  if (n >= 1) return { label: "Low confidence", color: "#94A3B8" };
  return null;
}

function medal(rank) {
  if (rank === 1) return { color: "#FBBF24", emoji: "🥇" };
  if (rank === 2) return { color: "#CBD5E1", emoji: "🥈" };
  if (rank >= 3 && rank <= 5) return { color: "#CD7F32", emoji: "🥉" };
  return null;
}

// Shows a real photo, or a clean branded placeholder if the photo is missing or
// fails to load. Never a broken image icon. onClick only fires on a real photo.
function FallbackImg({ src, alt, style, icon, onClick }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) {
    return (
      <div style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #1C2230, #2D3748)", cursor: "default" }}>
        <span style={{ fontSize: 26, opacity: 0.45 }}>{icon || "📍"}</span>
      </div>
    );
  }
  return <img src={src} alt={alt || ""} loading="lazy" draggable={false} onError={() => setBad(true)} onClick={onClick} style={style} />;
}

// Branded loading indicator: the Wayfind pin, gently pulsing.
function Loader({ label, size, pad }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: pad || "10px 2px", color: C.muted, fontSize: 13 }}>
      <div style={{ animation: "wfbob 1.1s ease-in-out infinite", display: "flex" }}><Critter size={size || 26} /></div>
      {label && <span>{label}</span>}
    </div>
  );
}



function Tag({ label, color, dim }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 8,
      color: dim ? C.light : color,
      background: dim ? "transparent" : `${color}22`,
      border: dim ? `1px solid ${C.border}` : "none",
      textTransform: "capitalize", whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function InfoChip({ label, value }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{value}</div>
    </div>
  );
}

const PRICE_WORD = { 0: "Free", 1: "Inexpensive", 2: "Moderate", 3: "Pricey", 4: "High-end" };
function PriceMeter({ level, word }) {
  if (level == null) return null;
  if (level === 0) return <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>Free</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>
        {[1, 2, 3, 4].map((n) => (
          <span key={n} style={{ color: n <= level ? C.green : C.muted }}>$</span>
        ))}
      </span>
      {word && <span style={{ fontSize: 12, color: C.light }}>{PRICE_WORD[level]}</span>}
    </span>
  );
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatEventDate(dateStr, timeStr) {
  const out = { mo: "", day: "", wd: "", time: "" };
  if (dateStr) {
    const p = dateStr.split("-");
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (!isNaN(d)) { out.mo = MO[d.getMonth()]; out.day = d.getDate(); out.wd = WD[d.getDay()]; }
  }
  if (timeStr) {
    const t = timeStr.split(":");
    let hr = Number(t[0]); const ap = hr >= 12 ? "PM" : "AM"; hr = hr % 12 || 12;
    out.time = `${hr}:${t[1]} ${ap}`;
  }
  return out;
}

// Compass label from degrees (direction the wind/waves come FROM).
function compass(deg) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}
function isBeach(p) {
  if (!p) return false;
  const t = (((p.types || []).join(" ")) + " " + (p.type || "")).toLowerCase();
  const n = (p.name || "").toLowerCase();
  return t.includes("beach") || n.includes("beach");
}
// Keyless wind + marine conditions for a beach point, from Open-Meteo. Fail-soft.
async function loadBeachConditions(p) {
  const out = { wind: null, windDir: null, gust: null, waveHeight: null, waveDir: null, wavePeriod: null };
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=mph&timezone=auto&forecast_days=1`);
    const d = await r.json();
    const c = d && d.current;
    if (c) {
      out.wind = c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) : null;
      out.windDir = c.wind_direction_10m != null ? c.wind_direction_10m : null;
      out.gust = c.wind_gusts_10m != null ? Math.round(c.wind_gusts_10m) : null;
    }
  } catch {}
  try {
    const r2 = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${p.lat}&longitude=${p.lng}&current=wave_height,wave_direction,wave_period&timezone=auto`);
    const d2 = await r2.json();
    const c2 = d2 && d2.current;
    if (c2) {
      out.waveHeight = c2.wave_height != null ? c2.wave_height : null;
      out.waveDir = c2.wave_direction != null ? c2.wave_direction : null;
      out.wavePeriod = c2.wave_period != null ? c2.wave_period : null;
    }
  } catch {}
  return out;
}

// Ticketmaster segment and genre to a chip icon, short label, and accent color.
function eventSegmentMeta(seg, genre) {
  const s = (seg || "").toLowerCase();
  const g = (genre || "").toLowerCase();
  if (g.includes("comedy")) return { icon: "😂", short: "Comedy", color: "#FBBF24" };
  if (s.includes("music")) return { icon: "🎵", short: "Concert", color: "#F472B6" };
  if (s.includes("sport")) return { icon: "⚾", short: "Sports", color: "#38BDF8" };
  if (s.includes("arts") || s.includes("theatre") || s.includes("theater")) return { icon: "🎭", short: "Theater", color: "#A78BFA" };
  if (s.includes("film")) return { icon: "🎬", short: "Film", color: "#FBBF24" };
  if (s.includes("family")) return { icon: "👨‍👩‍👧", short: "Family", color: "#22C55E" };
  return { icon: "🎪", short: seg || "Event", color: "#94A3B8" };
}

function todayHours(extra) {
  const hrs = extra && Array.isArray(extra.hours) ? extra.hours : null;
  if (!hrs) return null;
  const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date().getDay()];
  const line = hrs.find((h) => typeof h === "string" && h.indexOf(wd) === 0);
  if (!line) return null;
  const after = line.slice(line.indexOf(":") + 1).trim();
  return after || null;
}

function EventCard({ e, onVenue }) {
  const f = formatEventDate(e.date, e.time);
  const seg = eventSegmentMeta(e.segment, e.genre);
  return (
    <div style={{ display: "flex", flexDirection: "column", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ position: "relative" }}>
        <FallbackImg src={e.image} icon={seg.icon} style={{ width: "100%", height: 112, objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(13,17,23,.85)", borderRadius: 8, padding: "3px 7px", textAlign: "center", minWidth: 36 }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: "0.5px" }}>{f.mo}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{f.day}</div>
        </div>
        {(e.segment || e.genre) && <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(13,17,23,.85)", color: seg.color, borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 800 }}>{seg.icon} {seg.short}</div>}
      </div>
      <div style={{ padding: "9px 10px 11px", display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.name}</div>
        {e.venue && (
          <button onClick={() => onVenue && onVenue()} style={{ textAlign: "left", background: "transparent", border: "none", padding: 0, marginTop: 4, fontSize: 11.5, fontWeight: 700, color: C.accent, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>📍 {e.venue} ›</button>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 5, alignItems: "center" }}>
          {f.wd && <span style={{ fontSize: 11, color: C.muted }}>{f.wd}</span>}
          {f.time && <span style={{ fontSize: 11, color: C.muted }}>· {f.time}</span>}
        </div>
        {e.price && <div style={{ fontSize: 11.5, fontWeight: 700, color: C.green, marginTop: 4 }}>{e.price}</div>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 6 }}>
          <a href={e.url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 800, color: C.accent, textDecoration: "none" }}>{e.ticketed === false ? "Details ↗" : "Get tickets ↗"}</a>
          {e.source && <span style={{ fontSize: 9.5, color: C.muted, fontWeight: 600 }}>{e.source}</span>}
        </div>
      </div>
    </div>
  );
}

function Logo({ size = 26 }) {
  return (
    <svg width={size} height={Math.round((size * 124) / 96)} viewBox="0 0 96 124" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <defs>
        <filter id="wfglow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#F97316" floodOpacity="0.5" />
        </filter>
      </defs>
      <g filter="url(#wfglow)">
        <path d="M48 5 C26 5 9 22 9 44 C9 70 48 118 48 118 C48 118 87 70 87 44 C87 22 70 5 48 5 Z" fill="#0D1117" stroke="#F97316" strokeWidth="2.5" />
        <rect x="31" y="32" width="34" height="18" rx="3" fill="#F97316" />
        <rect x="41" y="26" width="14" height="7" rx="2" fill="#F97316" />
        <rect x="36.5" y="37.5" width="7" height="8" rx="1.5" fill="#0D1117" />
        <rect x="52.5" y="37.5" width="7" height="8" rx="1.5" fill="#0D1117" />
        <rect x="34" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
        <rect x="45" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
        <rect x="56" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
      </g>
    </svg>
  );
}

function Critter({ size = 26 }) {
  return (
    <svg width={size} height={Math.round((size * 38) / 40)} viewBox="28 22 40 38" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect x="31" y="32" width="34" height="18" rx="3" fill="#F97316" />
      <rect x="41" y="26" width="14" height="7" rx="2" fill="#F97316" />
      <rect x="36.5" y="37.5" width="7" height="8" rx="1.5" fill="#0D1117" />
      <rect x="52.5" y="37.5" width="7" height="8" rx="1.5" fill="#0D1117" />
      <rect x="34" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
      <rect x="45" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
      <rect x="56" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
    </svg>
  );
}

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hit: false }; }
  static getDerivedStateFromError() { return { hit: true }; }
  componentDidCatch() {}
  render() {
    if (this.state.hit) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: C.bg, color: C.text, padding: 24, textAlign: "center" }}>
          <div style={{ animation: "wfbob 1.1s ease-in-out infinite", display: "flex" }}><Critter size={48} /></div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>That took a wrong turn</div>
          <div style={{ fontSize: 13.5, color: C.light, maxWidth: 280, lineHeight: 1.5 }}>Something hiccuped. Tap below to get back on track.</div>
          <button onClick={() => { this.setState({ hit: false }); try { window.location.reload(); } catch (e) {} }} style={{ marginTop: 4, padding: "11px 20px", background: C.accent, border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>Reload Wayfind</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Hook content engine ─────────────────────────────────────────────────────
// Generates provocative, data-driven hook cards from real place data.
// Every hook references an actual place — nothing is invented.
function generateHooks(places, locName) {
  if (!places || places.length < 4) return [];
  const city = (locName || "your area").split(",")[0];
  const h = new Date().getHours();
  const mealLabel = h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "late-night";
  const hooks = [];
  const byScore = [...places].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));

  // LOCAL SOURCE — only places ≤15 miles. Used for city-specific hooks so "most
  // talked about in Parrish" can't pull Saint Pete (30 miles away).
  const LOCAL_MILES = 15;
  const local = places.filter((p) => p.distMi == null || p.distMi <= LOCAL_MILES);
  const localByScore = [...local].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));

  // #1 — absolute best (local first, fall back to all)
  const best = localByScore[0] || byScore[0];
  if (best) hooks.push({
    id: "best", accent: "#FBBF24", emoji: "⭐", label: "#1 right now", highlightWord: "highest-rated",
    hook: `The highest-rated spot near you right now`,
    detail: `${best.name}${best.rating ? ` · ★${best.rating}` : ""}${best.reviews ? ` · ${best.reviews.toLocaleString()} reviews` : ""}`,
    cta: "See why →", action: { type: "detail", place: best },
  });

  // Hidden gem — high rating, low review count (local only — can't be a gem if it's far)
  const gems = local.filter((p) => p.rating >= 4.5 && p.reviews >= 15 && p.reviews < 350)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0));
  if (gems[0]) hooks.push({
    id: "gem", accent: "#A78BFA", emoji: "💎", label: "Hidden gem", highlightWord: "haven't found",
    hook: `The best ${mealLabel} spot in ${city} most people haven't found`,
    detail: `${gems[0].name} · ★${gems[0].rating} · only ${gems[0].reviews} reviews`,
    cta: "Show me →", action: { type: "detail", place: gems[0] },
  });

  // Skip this — low rated with enough reviews to trust. Local only.
  const duds = local.filter((p) => p.rating && p.rating < 3.9 && p.reviews && p.reviews >= 80)
    .sort((a, b) => (a.rating || 5) - (b.rating || 5));
  if (duds.length >= 1) hooks.push({
    id: "skip", accent: "#EF4444", emoji: "🚫", label: "Skip this", highlightWord: "waste",
    hook: `Don't waste your money here in ${city}`,
    detail: duds.slice(0, 2).map((p) => `${p.name} ★${p.rating}`).join("  ·  "),
    cta: "See who →", action: { type: "detail", place: duds[0] },
  });

  // Worth the drive — INTENTIONALLY uses far places (>14 miles). This is the only
  // hook type that should reference distant spots.
  const farBest = places.filter((p) => p.distMi != null && p.distMi > 14 && p.rating >= 4.5)
    .sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
  if (farBest[0]) hooks.push({
    id: "drive", accent: "#38BDF8", emoji: "🚗", label: "Worth the drive?", highlightWord: "drive",
    hook: `Would you drive ${Math.round(farBest[0].distMi)} miles for this?`,
    detail: `${farBest[0].name} · ★${farBest[0].rating}`,
    cta: "Decide →", action: { type: "detail", place: farBest[0] },
  });

  // Best value — cheap and good. Local only.
  const vals = local.filter((p) => p.rating >= 4.3 && p.priceNum != null && p.priceNum <= 1)
    .sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
  if (vals[0]) hooks.push({
    id: "value", accent: "#22C55E", emoji: "💰", label: "Best value", highlightWord: "under $$",
    hook: `Top ${mealLabel} spots near you under $$`,
    detail: `${vals[0].name} · ★${vals[0].rating} · ${vals[0].price || "$"}`,
    cta: "Show me →", action: { type: "experience", key: "value" },
  });

  // Open right now — local only (not "open right now 25 miles away")
  const openGreat = local.filter((p) => p.openNow === true && p.rating >= 4.4)
    .sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
  if (openGreat[0]) hooks.push({
    id: "open", accent: "#22C55E", emoji: "🟢", label: "Open right now", highlightWord: "worth the trip",
    hook: `Open right now and actually worth the trip`,
    detail: `${openGreat[0].name} · ★${openGreat[0].rating}`,
    cta: "Let's go →", action: { type: "detail", place: openGreat[0] },
  });

  // Most talked about — LOCAL ONLY. "Most talked about in Parrish" must be in Parrish.
  const talked = [...local].sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
  if (talked[0] && talked[0].reviews >= 100) hooks.push({
    id: "popular", accent: "#F472B6", emoji: "🔥", label: "Most talked about", highlightWord: "overrated",
    hook: `What's the most overrated spot in ${city}?`,
    detail: `${talked[0].name} · ${talked[0].reviews?.toLocaleString()} people weighed in · ★${talked[0].rating}`,
    cta: "Judge it →", action: { type: "detail", place: talked[0] },
  });

  // Local itinerary — local only for the food + nightlife chain
  const foodTop = localByScore.find((p) => (primaryCategory(p) || "") === "Food");
  const nightTop = localByScore.find((p) => (primaryCategory(p) || "") === "Nightlife");
  if (foodTop && nightTop) hooks.push({
    id: "itinerary", accent: "#F97316", emoji: "🗺️", label: "Tonight's plan", highlightWord: "tonight",
    hook: `Quick local itinerary for tonight`,
    detail: `${foodTop.name} for dinner → ${nightTop.name} for drinks`,
    cta: "See both →", action: { type: "detail", place: foodTop },
  });

  // Top 5 summary — entry point to the ranked list
  if (byScore.length >= 5) hooks.push({
    id: "top5", accent: "#FBBF24", emoji: "🏆", label: `Top 5 in ${city}`,
    hook: `Top 5 spots within 20 minutes of you`,
    detail: byScore.slice(0, 3).map((p) => p.name).join("  ·  "),
    cta: "See all →", action: { type: "explore" },
  });

  // Late night bonus
  if (h >= 21 || h < 3) {
    const late = places.filter((p) => p.openNow === true).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
    if (late[0]) hooks.push({
      id: "latenight", accent: "#A78BFA", emoji: "🌙", label: "Still open",
      hook: `Still open and still worth it tonight`,
      detail: `${late[0].name} · ★${late[0].rating}`,
      cta: "Head there →", action: { type: "detail", place: late[0] },
    });
  }

  // Shuffle so the order varies on each session
  for (let i = hooks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [hooks[i], hooks[j]] = [hooks[j], hooks[i]];
  }
  return hooks.slice(0, 8);
}

// ─── HooksBanner component ────────────────────────────────────────────────────
// Horizontal snap-scroll strip of AI-generated provocative hook cards.
// Each card has a like button. Tapping the card opens a themed detail sheet.
// Renders the hook text with one key word highlighted in the tile's accent color.
// This is what makes "What's the most overrated spot?" pop — "overrated" glows.
function renderHookText(text, highlightWord, color) {
  if (!highlightWord || !text) return <span>{text}</span>;
  const lw = highlightWord.toLowerCase();
  const ti = text.toLowerCase().indexOf(lw);
  if (ti === -1) return <span>{text}</span>;
  return (
    <>
      <span>{text.slice(0, ti)}</span>
      <span style={{ color, fontStyle: "italic" }}>{text.slice(ti, ti + highlightWord.length)}</span>
      <span>{text.slice(ti + highlightWord.length)}</span>
    </>
  );
}

// ─── HooksBanner component — magazine photo-card style ────────────────────────
// Each tile is a full photo background with dark overlay + bold editorial
// typography. The hook's accent word glows in the tile's color. Matches the
// visual style of premium discovery apps.
function HooksBanner({ hooks, likedIds, totalLiked, onOpen, onLike, allPlaces }) {
  if (!hooks || hooks.length === 0) return null;
  const liked = likedIds || new Set();
  // Build a place lookup so each tile can show its place's real photo
  const placeMap = {};
  (allPlaces || []).forEach((p) => { if (p && p.id) placeMap[p.id] = p; });

  return (
    <div style={{ margin: "0 -12px 14px", paddingLeft: 12 }}>
      {totalLiked > 0 && (
        <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
          <span>❤️</span>
          <span>{totalLiked} tip{totalLiked === 1 ? "" : "s"} saved</span>
        </div>
      )}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingRight: 12, paddingBottom: 4, WebkitOverflowScrolling: "touch", scrollSnapType: "x mandatory", msOverflowStyle: "none", scrollbarWidth: "none" }}>
        {hooks.map((h) => {
          const isLiked = liked.has(h.id);
          const acc = h.accent || C.accent;
          const place = placeMap[h.placeId];
          const photo = place && place.photo;
          return (
            <div
              key={h.id}
              onClick={() => onOpen && onOpen(h)}
              style={{
                flexShrink: 0, width: 290, height: 185,
                scrollSnapAlign: "start", borderRadius: 18,
                overflow: "hidden", position: "relative", cursor: "pointer",
                boxShadow: isLiked ? `0 0 0 2.5px ${acc}, 0 8px 28px rgba(0,0,0,.5)` : "0 4px 20px rgba(0,0,0,.4)",
              }}
            >
              {/* Background: place photo or rich gradient fallback */}
              {photo
                ? <img src={photo} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${acc}50 0%, #0D1117 100%)` }} />
              }
              {/* Cinematic dark overlay — lighter at top, very dark at bottom */}
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,.18) 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,.88) 100%)" }} />
              {/* Subtle accent glow in the corner */}
              <div style={{ position: "absolute", bottom: 0, right: 0, width: 120, height: 120, background: `radial-gradient(circle at bottom right, ${acc}30 0%, transparent 65%)`, pointerEvents: "none" }} />

              {/* ── Top row: badge label + like button ── */}
              <div style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,.6)", border: `1px solid ${acc}70`, borderRadius: 999, padding: "4px 10px", backdropFilter: "blur(4px)" }}>
                  <span style={{ fontSize: 11 }}>{h.emoji}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, color: acc, textTransform: "uppercase", letterSpacing: "0.8px" }}>{h.label}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onLike && onLike(h.id); }}
                  style={{ width: 30, height: 30, borderRadius: "50%", background: isLiked ? acc : "rgba(0,0,0,.55)", border: `1.5px solid ${isLiked ? acc : "rgba(255,255,255,.35)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, cursor: "pointer", backdropFilter: "blur(4px)" }}
                >
                  {isLiked ? "❤️" : "🤍"}
                </button>
              </div>

              {/* ── Bottom: hook text + detail + CTA ── */}
              <div onClick={() => onOpen && onOpen(h)} style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 12px 13px" }}>
                <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", lineHeight: 1.25, marginBottom: 7, textShadow: "0 1px 6px rgba(0,0,0,.7)", letterSpacing: "-0.2px" }}>
                  {renderHookText(h.hook, h.highlightWord, acc)}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", lineHeight: 1.3, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h.detail}
                  </div>
                  <div style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: "#fff", background: acc, borderRadius: 999, padding: "5px 12px" }}>
                    {h.cta || "See more →"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div style={{ flexShrink: 0, width: 4 }} />
      </div>
    </div>
  );
}

// ─── Single full-width editorial hook card, for weaving into the feed ─────────
function HookSolo({ h, place, liked, onOpen, onLike }) {
  if (!h) return null;
  const acc = h.accent || C.accent;
  const photo = place && place.photo;
  return (
    <div onClick={() => onOpen && onOpen(h)} style={{ position: "relative", height: 200, borderRadius: 18, overflow: "hidden", marginBottom: 14, cursor: "pointer", boxShadow: liked ? `0 0 0 2.5px ${acc}, 0 8px 28px rgba(0,0,0,.5)` : "0 4px 20px rgba(0,0,0,.4)" }}>
      {photo
        ? <img src={photo} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
        : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${acc}50 0%, #0D1117 100%)` }} />}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,.18) 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,.88) 100%)" }} />
      <div style={{ position: "absolute", bottom: 0, right: 0, width: 140, height: 140, background: `radial-gradient(circle at bottom right, ${acc}30 0%, transparent 65%)`, pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,.6)", border: `1px solid ${acc}70`, borderRadius: 999, padding: "4px 10px", backdropFilter: "blur(4px)" }}>
          <span style={{ fontSize: 11 }}>{h.emoji}</span>
          <span style={{ fontSize: 9, fontWeight: 800, color: acc, textTransform: "uppercase", letterSpacing: "0.8px" }}>{h.label}</span>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onLike && onLike(h.id); }} style={{ width: 30, height: 30, borderRadius: "50%", background: liked ? acc : "rgba(0,0,0,.55)", border: `1.5px solid ${liked ? acc : "rgba(255,255,255,.35)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, cursor: "pointer", backdropFilter: "blur(4px)" }}>{liked ? "❤️" : "🤍"}</button>
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 14px 15px" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1.22, marginBottom: 8, textShadow: "0 1px 6px rgba(0,0,0,.7)", letterSpacing: "-0.3px" }}>{renderHookText(h.hook, h.highlightWord, acc)}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.65)", lineHeight: 1.3, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.detail}</div>
          <div style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: "#fff", background: acc, borderRadius: 999, padding: "6px 14px" }}>{h.cta || "See more →"}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Worth the Drive? widget ─────────────────────────────────────────────────
// Interactive voting widget — shows on detail sheets for far-away places or
// when the user came from a "Worth the drive?" hook. Captures yes/no, then
// reveals the live community tally.
function WorthTheDriveWidget({ place, myVote, votes, onVote }) {
  const hasVoted = !!myVote;
  const total = votes ? (votes.yes || 0) + (votes.no || 0) : 0;
  const yesPct = total > 0 ? Math.round(((votes.yes || 0) / total) * 100) : 0;
  return (
    <div style={{ background: "rgba(56,189,248,.08)", border: "1.5px solid rgba(56,189,248,.35)", borderRadius: 16, padding: "16px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 22 }}>🚗</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#E2E8F0" }}>Worth the drive?</div>
          {place.distMi != null && <div style={{ fontSize: 12, color: "#64748B" }}>{place.distMi.toFixed(1)} miles from you — weigh in</div>}
        </div>
      </div>
      {!hasVoted ? (
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => onVote("yes")}
            style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "1.5px solid #22C55E", background: "rgba(34,197,94,.12)", color: "#22C55E", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
          >
            🚗 Yes, worth it
          </button>
          <button
            onClick={() => onVote("no")}
            style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "1.5px solid #64748B", background: "transparent", color: "#94A3B8", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            🤷 Not really
          </button>
        </div>
      ) : (
        <div>
          {total > 0 ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: yesPct >= 50 ? "#22C55E" : "#EF4444" }}>{yesPct}%</span>
                <span style={{ fontSize: 12, color: "#64748B" }}>say yes · {total} vote{total === 1 ? "" : "s"} total</span>
              </div>
              <div style={{ height: 9, background: "#2D3748", borderRadius: 999, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ height: "100%", width: `${yesPct}%`, background: yesPct >= 50 ? "#22C55E" : "#EF4444", borderRadius: 999, transition: "width 0.6s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                <span style={{ color: "#22C55E", fontWeight: 700 }}>🚗 {votes.yes || 0} say worth it</span>
                <span style={{ color: "#64748B" }}>{votes.no || 0} say not really</span>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#64748B", borderTop: "1px solid #2D3748", paddingTop: 8 }}>
                You voted: <span style={{ fontWeight: 700, color: myVote === "yes" ? "#22C55E" : "#EF4444" }}>{myVote === "yes" ? "✓ Worth the drive" : "✗ Not really"}</span>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "6px 0" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: myVote === "yes" ? "#22C55E" : "#94A3B8", marginBottom: 4 }}>
                {myVote === "yes" ? "🚗 You said it's worth the drive!" : "You said not really. Fair enough."}
              </div>
              <div style={{ fontSize: 12, color: "#64748B" }}>Results will show as others weigh in.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PageInner() {
  const [screen, setScreen] = useState("suggested");
  const [cat, setCat] = useState("food");
  const [sub, setSub] = useState("all");
  const [vibe, setVibe] = useState("all");
  const [sortBy, setSortBy] = useState("best");
  const [searchRadius, setSearchRadius] = useState(24000); // meters, default ~15 miles
  const [showRadiusWheel, setShowRadiusWheel] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [deviceLoc, setDeviceLoc] = useState(null);
  const [locName, setLocName] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailExtra, setDetailExtra] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [venueEvents, setVenueEvents] = useState(null);
  const [venueEventsLoading, setVenueEventsLoading] = useState(false);
  const [venueEventsOpen, setVenueEventsOpen] = useState(false);
  const [videos, setVideos] = useState(null);
  const [videosLoading, setVideosLoading] = useState(false);
  const [sharedList, setSharedList] = useState(null);
  const [events, setEvents] = useState(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsUnavailable, setEventsUnavailable] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  const [eventCat, setEventCat] = useState("all");
  const [eventDate, setEventDate] = useState("all");
  const [eventCounts, setEventCounts] = useState(null);
  const [mapMode, setMapMode] = useState("places");
  const [mapDate, setMapDate] = useState("all");
  const [weather, setWeather] = useState(null);
  const [suggested, setSuggested] = useState(null);
  const [suggestedLoading, setSuggestedLoading] = useState(false);
  const [intent, setIntent] = useState(null);
  const [foryouEvents, setForyouEvents] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [beachCond, setBeachCond] = useState(null);
  const [beachCondLoading, setBeachCondLoading] = useState(false);
  const [allExpOpen, setAllExpOpen] = useState(false);
  const recentRef = useRef([]);
  const [blurbs, setBlurbs] = useState({});
  const [quickFilter, setQuickFilter] = useState(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [activeBadge, setActiveBadge] = useState(null);
  const [expPlaces, setExpPlaces] = useState(null);
  const [expLoading, setExpLoading] = useState(false);
  const [expOpenOnly, setExpOpenOnly] = useState(false);
  const [expSort, setExpSort] = useState("best");
  const [rolling, setRolling] = useState(false);
  const [diceFace, setDiceFace] = useState("🎲");
  const [diceChoose, setDiceChoose] = useState(false);
  const [surprisePick, setSurprisePick] = useState(null);
  const [surprisePool, setSurprisePool] = useState([]);
  const [surpriseLoading, setSurpriseLoading] = useState(false);
  const [toast, setToast] = useState("");
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(""), 1800); }
  const videoCache = useRef({});
  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightFull, setInsightFull] = useState(null);
  const [insightFullLoading, setInsightFullLoading] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  const [lists, setLists] = useState({ favorites: { id: "favorites", name: "Favorites", emoji: "❤️", places: [] }, custom: { id: "custom", name: "Customize me", emoji: "✨", places: [] } });
  const [activeList, setActiveList] = useState(null);
  const [saveTarget, setSaveTarget] = useState(null);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("⭐");
  const manualRef = useRef(false);
  // Hook state — declared before hookCards memo to avoid temporal dead zone.
  const [aiHooks, setAiHooks] = useState(null);
  const [hookLikes, setHookLikes] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("wf_hook_likes") || "[]")); } catch { return new Set(); } });
  const [hookDetail, setHookDetail] = useState(null);
  // Hook cards — computed from real data, refreshes when the place list changes.
  const hookCards = useMemo(() => {
    // AI hooks take priority — they use real place data for truly provocative copy.
    // Fall back to static templates while AI response is loading or if it fails.
    if (aiHooks && aiHooks.length > 0) return aiHooks;
    const src = (suggested && suggested.length > 0 ? suggested : places).filter(Boolean);
    return generateHooks(src, locName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiHooks, suggested && suggested.length, places && places.length, locName]);
  function handleHookAction(h) {
    if (!h || !h.action) return;
    const { type, place, key } = h.action;
    if (type === "detail" && place) openDetail(place);
    else if (type === "experience" && key) openExperience(key);
    else if (type === "explore") setScreen("explore");
  }
  const debounceRef = useRef(null);
  const tokenRef = useRef(null);
  const insightCache = useRef({});
  const scrollRef = useRef(null);
  const insightFullCache = useRef({});
  const detailCache = useRef({});
  // Engagement signals — stored in localStorage, used to personalise the feed.
  const [signals, setSignals] = useState(() => { try { if (typeof window === "undefined") return []; return loadSignals(); } catch { return []; } });
  const [liked, setLiked] = useState(() => { try { return JSON.parse(localStorage.getItem("wf_liked") || "{}"); } catch { return {}; } });
  const [disliked, setDisliked] = useState(() => { try { return JSON.parse(localStorage.getItem("wf_disliked") || "{}"); } catch { return {}; } });
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupDone, setSignupDone] = useState(() => { try { return !!localStorage.getItem("wf_signed_up"); } catch { return false; } });
  // Auth state (Supabase). Null user = signed out / no backend configured.
  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authSending, setAuthSending] = useState(false);

  // Restore session on load and listen for sign-in / sign-out.
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data && data.session && data.session.user) setUser(data.session.user);
    }).catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session && session.user ? session.user : null);
    });
    return () => { active = false; if (sub && sub.subscription) sub.subscription.unsubscribe(); };
  }, []);

  // Send a magic-link sign-in email.
  async function sendMagicLink() {
    if (!supabase || !authEmail) return;
    setAuthSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: authEmail.trim(), options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined } });
      if (error) { showToast("Could not send link"); }
      else { showToast("Check your email for a sign-in link"); setAuthOpen(false); setAuthEmail(""); }
    } catch { showToast("Could not send link"); }
    setAuthSending(false);
  }

  async function signOutUser() {
    if (!supabase) return;
    try { await supabase.auth.signOut(); } catch {}
    setUser(null);
    showToast("Signed out");
  }

  // When a user signs in, push local favorites/likes up and pull theirs down,
  // so saves persist to their account and sync across devices.
  useEffect(() => {
    if (!supabase || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const favPlaces = (lists.favorites && lists.favorites.places) || [];
        if (favPlaces.length) {
          await supabase.from("saved_places").upsert(
            favPlaces.map((p) => ({ user_id: user.id, place_id: p.id, place: p, list_name: "Favorites" })),
            { onConflict: "user_id,place_id,list_name", ignoreDuplicates: true }
          );
        }
      } catch {}
      try {
        const { data: saved } = await supabase.from("saved_places").select("place").eq("user_id", user.id).eq("list_name", "Favorites");
        if (!cancelled && saved) {
          const remote = saved.map((r) => r.place).filter(Boolean);
          setLists((prev) => {
            const fav = prev.favorites || { id: "favorites", name: "Favorites", emoji: "❤️", places: [] };
            const byId = {};
            [...fav.places, ...remote].forEach((p) => { if (p && p.id) byId[p.id] = p; });
            return { ...prev, favorites: { ...fav, places: Object.values(byId) } };
          });
        }
        const { data: dbLikes } = await supabase.from("likes").select("place_id").eq("user_id", user.id);
        if (!cancelled && dbLikes) {
          setLiked((prev) => { const next = { ...prev }; dbLikes.forEach((r) => { next[r.place_id] = true; }); return next; });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [user]);

  // "Worth the Drive?" feature
  const [detailContext, setDetailContext] = useState(null); // theme that opened the detail ("drive", "gem", etc.)
  const [myVotes, setMyVotes] = useState(() => { try { return JSON.parse(localStorage.getItem("wf_drive_votes") || "{}"); } catch { return {}; } });
  const [communityVotes, setCommunityVotes] = useState({});
  const [searchMode, setSearchMode] = useState(false);
  const [searchLabel, setSearchLabel] = useState("");
  const galleryRef = useRef(null);
  function scrollGallery(dir) {
    const el = galleryRef.current;
    if (el) el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: "smooth" });
  }

  // Detect viewport so desktop gets a wider, side-by-side layout.
  const [vw, setVw] = useState(0);
  useEffect(() => {
    const onR = () => setVw(window.innerWidth);
    onR();
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  const isDesktop = vw >= 900;
  const keyMissing = !process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  function openSurprise() {
    setSurprisePick(null);
    setScreen("surprise");
    try { window.scrollTo(0, 0); } catch {}
  }
  function pickSurprise(pool) {
    if (!pool || !pool.length) return null;
    const open = pool.filter((p) => p.openNow === true);
    const src = (open.length >= 3 ? open : pool).slice(0, 8);
    return src[Math.floor(Math.random() * src.length)];
  }

  // The pool the dice rolls from depends on where the user is: their favorites,
  // their For You feed, a badge page, or the current list of nearby spots.
  function rollDicePool() {
    if (screen === "saved") {
      if (activeList && lists[activeList]) return lists[activeList].places;
      return Object.values(lists).flatMap((l) => l.places || []);
    }
    if (screen === "suggested") return suggested || [];
    if (screen === "experience") return expPlaces || [];
    return view;
  }
  function animateRollThenPick(rawPool) {
    const pool = (rawPool || []).filter(Boolean);
    if (!pool.length) { showToast("Nothing to roll here yet"); setRolling(false); return; }
    setRolling(true);
    const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    const iv = setInterval(() => setDiceFace(faces[Math.floor(Math.random() * 6)]), 85);
    setTimeout(() => {
      clearInterval(iv);
      setRolling(false);
      setDiceFace("🎲");
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick) openDetail(pick);
    }, 1000);
  }
  function rollDice() { setDiceChoose(true); }
  async function rollFor(spec) {
    setDiceChoose(false);
    if (!spec || spec.any || !center) { animateRollThenPick(rollDicePool()); return; }
    setRolling(true);
    const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    const iv = setInterval(() => setDiceFace(faces[Math.floor(Math.random() * 6)]), 85);
    let res = [];
    try { res = await searchPlaces(spec.cat, "all", { lat: center.lat, lng: center.lng }, 32000, "all", spec.kw || ""); } catch {}
    let pool = (res || []).filter(Boolean).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
    const availToday = pool.filter((p) => p.openNow !== false || (p.nextOpen && p.nextOpen.today));
    res = (availToday.length >= 3 ? availToday : pool).slice(0, 12);
    setTimeout(() => {
      clearInterval(iv);
      setRolling(false);
      setDiceFace("🎲");
      if (res.length) { const pick = res[Math.floor(Math.random() * res.length)]; openDetail(pick); }
      else showToast("Nothing found nearby, try another");
    }, 900);
  }

  function openExperience(key) {
    if (!EXPERIENCES[key]) return;
    setActiveBadge(key);
    setExpPlaces(null);
    setExpOpenOnly(false);
    setExpSort("best");
    setScreen("experience");
    try { window.scrollTo(0, 0); } catch {}
  }

  function openSuggested() {
    setSuggested(null);
    setIntent(null);
    setCat("food");
    setSub("all");
    setVibe("all");
    setQuery("");
    setEventCat("all");
    setEventDate("all");
    setScreen("suggested");
    try { window.scrollTo(0, 0); } catch {}
  }

  // Tapping an event venue opens that venue as a real Wayfind place, so its AI
  // tips (arrival, parking, what to know) come from the venue's own reviews.
  async function openVenue(e) {
    const q = [e.venue, e.city].filter(Boolean).join(" ");
    if (!q) return;
    showToast("Loading venue…");
    const ctr = (e.lat != null && e.lng != null) ? { lat: e.lat, lng: e.lng } : center;
    try {
      const v = await findPlace(q, ctr);
      if (v) openDetail(v);
      else showToast("Could not find this venue");
    } catch { showToast("Could not load venue details"); }
  }

  function shareApp() {
    const url = (typeof window !== "undefined" && window.location && window.location.origin) ? window.location.origin : "https://wayfind-xi.vercel.app";
    shareLink("Wayfind", url, () => { setShareCopied(true); setTimeout(() => setShareCopied(false), 1800); }, "Find great things to do near you with Wayfind");
  }
  function pickCat(id) { setCat(id); setSub("all"); setVibe("all"); setQuickFilter(null); setSearchMode(false); setSearchLabel(""); setScreen("explore"); }
  useEffect(() => { try { if (scrollRef.current) scrollRef.current.scrollTo({ top: 0 }); } catch (e) {} }, [cat]);
  function pickSub(id) { setSub(id); setVibe("all"); }

  // Signal functions — record engagement, drive personalised ranking, trigger sign-up.
  function recordSignal(p, action) {
    const pc = (primaryCategory(p) || "").toLowerCase();
    const badges = experienceBadges(p, null, 6).map((b) => b.key);
    const sig = { id: p.id, cat: pc, badges, rating: p.rating || null, action, ts: Date.now() };
    const next = [sig, ...signals.filter((s) => !(s.id === p.id && s.action === action))].slice(0, 1000);
    setSignals(next);
    saveSignals(next);
  }
  function toggleLike(e, p) {
    e.stopPropagation();
    const wasLiked = !!liked[p.id];
    const nextLiked = { ...liked }; const nextDis = { ...disliked };
    if (wasLiked) { delete nextLiked[p.id]; }
    else {
      nextLiked[p.id] = true; delete nextDis[p.id];
      recordSignal(p, "like");
    }
    setLiked(nextLiked); setDisliked(nextDis);
    try { localStorage.setItem("wf_liked", JSON.stringify(nextLiked)); localStorage.setItem("wf_disliked", JSON.stringify(nextDis)); } catch {}
    if (supabase && user) {
      if (wasLiked) {
        supabase.from("likes").delete().eq("user_id", user.id).eq("place_id", p.id).then(() => {}, () => {});
      } else {
        supabase.from("likes").upsert({ user_id: user.id, place_id: p.id, place: p }, { onConflict: "user_id,place_id" }).then(() => {}, () => {});
      }
    }
  }
  function toggleDislike(e, p) {
    e.stopPropagation();
    const wasDis = !!disliked[p.id];
    const nextLiked = { ...liked }; const nextDis = { ...disliked };
    if (wasDis) { delete nextDis[p.id]; }
    else { nextDis[p.id] = true; delete nextLiked[p.id]; recordSignal(p, "dislike"); }
    setLiked(nextLiked); setDisliked(nextDis);
    try { localStorage.setItem("wf_liked", JSON.stringify(nextLiked)); localStorage.setItem("wf_disliked", JSON.stringify(nextDis)); } catch {}
  }
  function toggleHookLike(hookId) {
    const next = new Set(hookLikes);
    if (next.has(hookId)) next.delete(hookId);
    else next.add(hookId);
    setHookLikes(next);
    try { localStorage.setItem("wf_hook_likes", JSON.stringify([...next])); } catch {}
  }
  function openHook(h) {
    // If no place ID or we have a themed body, open the detail sheet.
    // Otherwise fall through to the existing action handler.
    if (h && (h.placeId || h.themeBody)) { setHookDetail(h); }
    else handleHookAction(h);
  }

  // Load community votes for a place when its detail opens (drive widget)
  useEffect(() => {
    if (!detail || !detail.id) return;
    if (detail.distMi == null || detail.distMi < 20) { if (detailContext !== "drive") return; }
    fetch(`/api/vote?placeId=${encodeURIComponent(detail.id)}`)
      .then((r) => r.json())
      .then((data) => setCommunityVotes((prev) => ({ ...prev, [detail.id]: data })))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  async function handleVote(place, vote) {
    if (!place || !place.id || myVotes[place.id]) return;
    const next = { ...myVotes, [place.id]: vote };
    setMyVotes(next);
    try { localStorage.setItem("wf_drive_votes", JSON.stringify(next)); } catch {}
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ placeId: place.id, vote, placeName: place.name, distMi: place.distMi }),
      });
      const data = await res.json();
      if (data && !data.error) setCommunityVotes((prev) => ({ ...prev, [place.id]: data }));
    } catch {}
  }

  async function submitSignup() {
    const email = signupEmail.trim();
    if (!email || signupDone) return;
    try { await fetch("/api/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, likes: Object.keys(liked).length, signals: signals.length }) }); } catch {}
    setSignupDone(true);
    try { localStorage.setItem("wf_signed_up", "1"); } catch {}
  }

  // Open a place: pull deep data (cached), then run the AI grounded in it.
  async function openDetail(p, context) {
    setDetail(p);
    setDetailContext(context || null);
    recordSignal(p, "open"); // implicit engagement signal
    try { recentRef.current = [p.id, ...recentRef.current.filter((x) => x !== p.id)].slice(0, 20); } catch {}
    setReviewsOpen(false);
    setHoursOpen(false);
    setVenueEvents(null);
    setVenueEventsOpen(false);
    setVenueEventsLoading(false);
    setWhyOpen(false);
    setShowMore(false);
    setThemesOpen(false);
    setVideos(videoCache.current[p.id] || null);
    setInsightFull(insightFullCache.current[p.id] || getCachedInsight(p.id + "::full") || null);
    setInsightFullLoading(false);
    setDetailExtra(detailCache.current[p.id] || null);
    setInsightLoading(true);
    let extra = detailCache.current[p.id];
    if (extra === undefined) {
      setDetailExtra(null);
      extra = await fetchPlaceDetail(p.id);
      detailCache.current[p.id] = extra;
    }
    setDetailExtra(extra);
    if (extra) { const rt = Array.isArray(extra.reviews) ? extra.reviews.slice(0, 4).map((r) => (r.text || "").slice(0, 300)).filter(Boolean) : []; HINTS[p.id] = ((extra.editorial || "") + " " + rt.join(" ")).toLowerCase(); }
    loadInsight(p, extra);
  }
  // Pull real upcoming ticketed events at or near a place from Ticketmaster.
  // This is the honest way to answer "when is the live music here": actual show
  // dates and times, never an invented weekly schedule. Empty is a valid answer.
  async function loadVenueEvents(p) {
    if (!p || p.lat == null || p.lng == null) { setVenueEvents([]); return; }
    setVenueEventsLoading(true);
    setVenueEvents(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat: p.lat, lng: p.lng, radius: 2 }),
      });
      const data = await res.json();
      let list = data && Array.isArray(data.events) ? data.events : [];
      const nm = (p.name || "").toLowerCase();
      const matches = list.filter((e) => {
        const v = (e.venue || "").toLowerCase();
        return v && (v.includes(nm) || nm.includes(v));
      });
      setVenueEvents((matches.length ? matches : list).slice(0, 8));
    } catch {
      setVenueEvents([]);
    } finally {
      setVenueEventsLoading(false);
    }
  }
  async function loadVideos(p) {
    if (videoCache.current[p.id]) { setVideos(videoCache.current[p.id]); setVideosLoading(false); return; }
    setVideos(null);
    setVideosLoading(true);
    try {
      const res = await fetch("/api/youtube", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: p.name, city: locName, category: cat }),
      });
      const data = await res.json();
      const vids = data && Array.isArray(data.videos) ? data.videos : [];
      videoCache.current[p.id] = vids;
      setVideos(vids);
    } catch {
      setVideos([]);
    } finally {
      setVideosLoading(false);
    }
  }
  async function loadEvents() {
    if (!center) return;
    setEventsLoading(true);
    setEventsError(false);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat: center.lat, lng: center.lng, city: locName }),
      });
      const data = await res.json();
      setEventsUnavailable(!!data.unavailable);
      setEventsError(!!data.error);
      setEventCounts(data && data.counts ? data.counts : null);
      try { if (data && data.counts) console.log("[wayfind events]", data.counts, "total", (data.events || []).length); } catch (e) {}
      setEvents(data && Array.isArray(data.events) ? data.events : []);
    } catch {
      setEventsError(true);
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }
  async function loadBlurbs(list) {
    if (!Array.isArray(list) || !list.length) { setBlurbs({}); return; }
    // 1. Seed instantly from the 30-day on-device line cache. These cost nothing:
    //    no Google call, no AI call. Repeat searches of the same area are free.
    const seeded = {};
    list.forEach((p) => { const c = getCachedLine(p.id); if (c) seeded[p.id] = c; });
    setBlurbs(seeded);
    // 2. Only fetch + generate for places NOT already cached, capped to the top few.
    //    A warm area adds nothing; a brand-new area pays once, then caches.
    const need = list.filter((p) => !seeded[p.id]).slice(0, 6);
    if (!need.length) return;
    const enriched = await Promise.all(need.map(async (p) => {
      let extra = detailCache.current[p.id];
      if (extra === undefined) {
        try { extra = await fetchPlaceDetail(p.id); } catch { extra = null; }
        detailCache.current[p.id] = extra;
      }
      const reviewText = extra && Array.isArray(extra.reviews) ? extra.reviews.slice(0, 4).map((r) => (r.text || "").slice(0, 300)).filter(Boolean) : [];
      HINTS[p.id] = (((extra && extra.editorial) || "") + " " + reviewText.join(" ")).toLowerCase();
      return { id: p.id, name: p.name, type: p.type, rating: p.rating, reviews: p.reviews, price: p.price, labels: p.labels, reviewText, editorial: (extra && extra.editorial) || "" };
    }));
    try {
      const res = await fetch("/api/blurbs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ city: locName, places: enriched }),
      });
      const data = await res.json();
      if (data && data.blurbs && typeof data.blurbs === "object") {
        setBlurbs((prev) => ({ ...prev, ...data.blurbs }));
        setCachedLines(data.blurbs);
      }
    } catch {}
  }
  async function loadInsight(p, extra) {
    if (insightCache.current[p.id]) { setInsight(insightCache.current[p.id]); setInsightLoading(false); return; }
    const cached = getCachedInsight(p.id);
    if (cached) { insightCache.current[p.id] = cached; setInsight(cached); setInsightLoading(false); return; }
    setInsight(null);
    setInsightLoading(true);
    try {
      const res = await fetch("/api/insight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: p.name, type: p.type, city: locName,
          rating: p.rating, reviewCount: p.reviews, price: p.price, openNow: p.openNow,
          category: cat, sub, mode: "compact",
          editorial: extra ? extra.editorial : null,
          reviews: extra && extra.reviews ? extra.reviews.map((r) => r.text).slice(0, 5) : [],
          attributes: p.labels || [],
        }),
      });
      const data = await res.json();
      insightCache.current[p.id] = data;
      if (data && !data.error && !data.unavailable) setCachedInsight(p.id, data);
      setInsight(data);
    } catch {
      setInsight({ error: true });
    } finally {
      setInsightLoading(false);
    }
  }
  // The heavier insight (themes, more tips, must-try). Only ever runs when the
  // user expands a place, so most opens never pay for it. Cached 30 days.
  async function loadFullInsight(p, extra) {
    if (!p) return;
    if (insightFullCache.current[p.id]) { setInsightFull(insightFullCache.current[p.id]); return; }
    const cached = getCachedInsight(p.id + "::full");
    if (cached) { insightFullCache.current[p.id] = cached; setInsightFull(cached); return; }
    setInsightFullLoading(true);
    try {
      const res = await fetch("/api/insight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: p.name, type: p.type, city: locName,
          rating: p.rating, reviewCount: p.reviews, price: p.price, openNow: p.openNow,
          category: cat, sub, mode: "full",
          editorial: extra ? extra.editorial : null,
          reviews: extra && extra.reviews ? extra.reviews.map((r) => r.text).slice(0, 5) : [],
          attributes: p.labels || [],
        }),
      });
      const data = await res.json();
      insightFullCache.current[p.id] = data;
      if (data && !data.error && !data.unavailable) setCachedInsight(p.id + "::full", data);
      setInsightFull(data);
    } catch {
      setInsightFull({ error: true });
    } finally {
      setInsightFullLoading(false);
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem("wayfind_lists");
      if (raw) { const saved = JSON.parse(raw); setLists({ favorites: { id: "favorites", name: "Favorites", emoji: "❤️", places: [] }, custom: { id: "custom", name: "Customize me", emoji: "✨", places: [] }, ...saved }); }
    } catch {}
  }, []);

  // Handle shared deep links: a single place or a shared list.
  useEffect(() => {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch { return; }
    const listStr = params.get("list");
    const placeId = params.get("place");
    if (listStr) {
      const pl = decodeList(listStr);
      if (pl && pl.length) { setSharedList(pl); setScreen("shared"); }
    } else if (placeId) {
      (async () => {
        const p = await fetchPlaceById(placeId);
        if (p) openDetail(p);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try { localStorage.setItem("wayfind_lists", JSON.stringify(lists)); } catch {}
  }, [lists]);

  useEffect(() => {
    if (keyMissing) return;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setDeviceLoc(c);
          if (manualRef.current) return;
          const name = await reverseGeocode(c.lat, c.lng);
          setCenter(c);
          setLocName(name);
        },
        () => {},
        { timeout: 8000 }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (keyMissing || !center || searchMode) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const results = await searchPlaces(cat, sub, { lat: center.lat, lng: center.lng }, searchRadius, vibe);
        if (!cancelled) { setPlaces(results); loadBlurbs(results); }
      } catch (e) {
        if (!cancelled) { setErr("Could not load places. Check your API key and that billing is enabled."); setPlaces([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, sub, vibe, center, searchRadius]);

  // Load events when on the Events screen or when the location changes.
  useEffect(() => {
    if (screen !== "events" || !center) return;
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, center]);

  // Build a curated experience: wider 30 mile search, real filter, ranked by score.
  useEffect(() => {
    if (screen !== "experience" || !activeBadge || !center) return;
    const exp = EXPERIENCES[activeBadge];
    if (!exp) return;
    let cancelled = false;
    (async () => {
      setExpLoading(true);
      try {
        let results = await searchPlaces(exp.cat || "food", "all", { lat: center.lat, lng: center.lng }, 48000, "all", exp.keyword || "");
        if (exp.filter) results = results.filter(exp.filter);
        results = results.slice().sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 30);
        if (!cancelled) { setExpPlaces(results); loadBlurbs(results); }
      } catch {
        if (!cancelled) setExpPlaces([]);
      } finally {
        if (!cancelled) setExpLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeBadge, center]);

  // Surprise Me: an honest curator. Picks one standout for right now using the
  // signals we actually have: time of day, open status, distance, review quality.
  useEffect(() => {
    if (screen !== "surprise" || !center) return;
    let cancelled = false;
    (async () => {
      setSurpriseLoading(true);
      const h = new Date().getHours();
      let scat = "food";
      let skeyword = "";
      if (h < 11) skeyword = "breakfast";
      else if (h >= 21) scat = "nightlife";
      else if (h >= 17) skeyword = "dinner";
      try {
        const results = await searchPlaces(scat, "all", { lat: center.lat, lng: center.lng }, 48000, "all", skeyword);
        if (!cancelled) {
          setSurprisePool(results);
          setSurprisePick(pickSurprise(results));
          loadBlurbs(results.slice(0, 6));
        }
      } catch {
        if (!cancelled) { setSurprisePool([]); setSurprisePick(null); }
      } finally {
        if (!cancelled) setSurpriseLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, center]);

  // Live local weather from the free, keyless Open-Meteo API. Drives the
  // greeting chip and nudges the Suggested feed. Fails soft to no weather.
  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${center.lat}&longitude=${center.lng}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset,uv_index_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=1`);
        const d = await r.json();
        const cur = d && d.current ? d.current : null;
        const day = d && d.daily ? d.daily : null;
        if (cur && !cancelled) {
          const w = weatherFromCode(cur.weather_code);
          let sunset = null;
          try { if (day && day.sunset && day.sunset[0]) { const sd = new Date(day.sunset[0]); sunset = sd.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } } catch {}
          setWeather({
            temp: Math.round(cur.temperature_2m),
            feels: cur.apparent_temperature != null ? Math.round(cur.apparent_temperature) : null,
            humidity: cur.relative_humidity_2m != null ? Math.round(cur.relative_humidity_2m) : null,
            wind: cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : null,
            hi: day && day.temperature_2m_max ? Math.round(day.temperature_2m_max[0]) : null,
            lo: day && day.temperature_2m_min ? Math.round(day.temperature_2m_min[0]) : null,
            rain: day && day.precipitation_probability_max ? day.precipitation_probability_max[0] : null,
            uv: day && day.uv_index_max ? Math.round(day.uv_index_max[0]) : null,
            sunset,
            icon: w.icon, label: w.label, warm: w.warm, wet: w.wet,
          });
        }
      } catch { if (!cancelled) setWeather(null); }
    })();
    return () => { cancelled = true; };
  }, [center]);

  // Suggested for Me: one intelligent feed that blends categories using the
  // signals we honestly have now: time of day, today's weather, and what you
  // have saved. It gets smarter as more signals come online.
  useEffect(() => {
    if (screen !== "suggested" || !center) return;
    let cancelled = false;
    (async () => {
      setSuggestedLoading(true);
      try {
        const h = new Date().getHours();
        const wet = !!(weather && weather.wet);
        // Serve a recent cached feed for this area + time so we do not re-bill
        // Google every time the user returns to Home or nudges a filter.
        const bucket = h < 11 ? "m" : h < 16 ? "l" : h < 21 ? "d" : "n";
        const ckey = `wf_sug_${center.lat.toFixed(3)}_${center.lng.toFixed(3)}_${bucket}_${intent || "none"}_${wet ? "wet" : "dry"}`;
        try {
          const raw = localStorage.getItem(ckey);
          if (raw) {
            const obj = JSON.parse(raw);
            if (obj && obj.ts && Date.now() - obj.ts < 45 * 60 * 1000 && Array.isArray(obj.places) && obj.places.length) {
              if (!cancelled) { setSuggested(obj.places); loadBlurbs(obj.places.slice(0, 8)); }
              return;
            }
          }
        } catch {}
        let plans;
        const intentDef = intent ? INTENTS.find((x) => x.id === intent) : null;
        if (intentDef) plans = intentDef.plans.slice();
        else if (h < 11) plans = [
          { cat: "food", kw: "breakfast" },
          { cat: "food", kw: "coffee" },
          { cat: "attractions", kw: "park" },
          { cat: "attractions", kw: "things to do" },
        ];
        else if (h < 16) plans = [
          { cat: "food", kw: "lunch" },
          { cat: "food", kw: "" },
          { cat: "attractions", kw: "things to do" },
          { cat: "attractions", kw: "park" },
          { cat: "nightlife", kw: "brewery" },
          { cat: "shopping", kw: "" },
        ];
        else if (h < 21) plans = [
          { cat: "food", kw: "dinner" },
          { cat: "food", kw: "" },
          { cat: "nightlife", kw: "cocktail bar" },
          { cat: "nightlife", kw: "rooftop bar" },
          { cat: "attractions", kw: "live music" },
          { cat: "attractions", kw: "things to do" },
        ];
        else plans = [
          { cat: "food", kw: "late night" },
          { cat: "nightlife", kw: "night club" },
          { cat: "nightlife", kw: "bar" },
          { cat: "nightlife", kw: "rooftop bar" },
          { cat: "food", kw: "" },
        ];
        if (wet) plans = plans.filter((p) => { const k = p.kw || ""; return !(k.includes("park") || k.includes("rooftop") || k.includes("outdoor")); });
        plans = plans.slice(0, 3); // cap parallel Google searches per load to control cost
        const results = await Promise.all(plans.map((pl) =>
          searchPlaces(pl.cat, "all", { lat: center.lat, lng: center.lng }, 32000, "all", pl.kw).catch(() => [])
        ));
        const seen = new Set();
        const buckets = [];
        results.forEach((res) => {
          const arr = (res || []).slice().sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
          const picked = [];
          for (const rr of arr) { if (rr && rr.id && !seen.has(rr.id)) { seen.add(rr.id); picked.push(rr); if (picked.length >= 6) break; } }
          if (picked.length) buckets.push(picked);
        });
        let merged = [];
        let ri = 0;
        while (merged.length < 30) {
          let added = false;
          for (const b of buckets) { if (b[ri]) { merged.push(b[ri]); added = true; } }
          if (!added) break;
          ri++;
        }
        merged = merged.slice(0, 24);
        try { localStorage.setItem(ckey, JSON.stringify({ ts: Date.now(), places: merged })); } catch {}
        if (!cancelled) { setSuggested(merged); loadBlurbs(merged.slice(0, 8)); }
      } catch {
        if (!cancelled) setSuggested([]);
      } finally {
        if (!cancelled) setSuggestedLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, center, weather, intent]);

  // Fetch AI-generated hooks once we have real place data to ground them on.
  // Falls back to the static generateHooks() output if the API call fails.
  useEffect(() => {
    const src = (suggested && suggested.length > 0 ? suggested : places).filter(Boolean);
    if (src.length < 3) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/hooks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            places: src.slice(0, 20).map((p) => ({ id: p.id, name: p.name, rating: p.rating, reviews: p.reviews, distMi: p.distMi, openNow: p.openNow, price: p.price, type: p.type })),
            locName, hour: new Date().getHours(),
            weather: weather ? { temp: weather.temp, label: weather.label } : null,
            signals: signals.slice(0, 50),
          }),
        });
        const data = await res.json();
        if (!cancelled && data.hooks && data.hooks.length > 0) setAiHooks(data.hooks);
      } catch { /* fall back to static hooks silently */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested && suggested.length, places && places.length]);

  // Lightweight events strip for the For You screen. Fail-soft: any error just
  // hides the strip and never blocks the picks.
  useEffect(() => {
    if (screen !== "suggested" || !center) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: center.lat, lng: center.lng, radius: 25, city: locName }) });
        if (!r.ok) { if (!cancelled) setForyouEvents([]); return; }
        const data = await r.json();
        const evs = (data && data.events) || [];
        if (!cancelled) setForyouEvents(evs.slice(0, 8));
      } catch { if (!cancelled) setForyouEvents([]); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, center]);

  // When the opened place is a beach, pull live wind + wave conditions.
  useEffect(() => {
    if (!detail || !isBeach(detail) || detail.lat == null || detail.lng == null) { setBeachCond(null); setBeachCondLoading(false); return; }
    let cancelled = false;
    setBeachCond(null);
    setBeachCondLoading(true);
    (async () => {
      const c = await loadBeachConditions(detail);
      if (!cancelled) { setBeachCond(c); setBeachCondLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  function onQueryChange(v) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v || v.trim().length < 3) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(() => fetchSuggestions(v.trim()), 250);
  }

  async function fetchSuggestions(q) {
    try {
      const { AutocompleteSuggestion, AutocompleteSessionToken } = await getLoader().importLibrary("places");
      if (!tokenRef.current) tokenRef.current = new AutocompleteSessionToken();
      // Geographic types — anything else is treated as an establishment/place.
      const AREA_TYPES = new Set([
        "locality", "administrative_area_level_1", "administrative_area_level_2",
        "administrative_area_level_3", "administrative_area_level_4",
        "postal_code", "country", "colloquial_area", "neighborhood",
        "sublocality", "sublocality_level_1", "route", "geocode",
      ]);
      let res;
      try {
        // No type filter — let Google surface both places and areas.
        // Location bias keeps establishment results close to the current center.
        res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken: tokenRef.current,
          ...(center ? { locationBias: { center: { lat: center.lat, lng: center.lng }, radius: 50000 } } : {}),
        });
      } catch {
        res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken: tokenRef.current,
        });
      }
      const list = (res?.suggestions || [])
        .map((s) => s.placePrediction)
        .filter(Boolean)
        .map((pp) => {
          const text = (pp.text && (pp.text.text || pp.text)) || "";
          const types = pp.types || [];
          const kind = types.some((t) => AREA_TYPES.has(t)) ? "area" : "place";
          return { text, pp, kind };
        })
        .filter((x) => x.text)
        .slice(0, 6);
      setSuggestions(list);
    } catch {
      setSuggestions([]);
    }
  }

  async function pickSuggestion(item) {
    setSuggestions([]);
    setQuery("");
    tokenRef.current = null;

    if (item.kind === "place") {
      // Route straight to the place's detail sheet.
      setLoading(true);
      try {
        const place = item.pp.toPlace();
        await place.fetchFields({
          fields: [
            "id", "location", "displayName", "formattedAddress", "types",
            "rating", "userRatingCount", "photos", "priceLevel",
            "regularOpeningHours", "businessStatus",
          ],
        });
        const photoUrl = (place.photos || [])[0]?.getURI?.({ maxWidth: 800 }) || null;
        const allPhotos = (place.photos || []).slice(0, 6).map((ph) => ph.getURI?.({ maxWidth: 800 })).filter(Boolean);
        const PRICE_LEVELS = ["FREE", "INEXPENSIVE", "MODERATE", "EXPENSIVE", "VERY_EXPENSIVE"];
        const priceNum = place.priceLevel != null
          ? (typeof place.priceLevel === "number" ? place.priceLevel : PRICE_LEVELS.indexOf(String(place.priceLevel)))
          : null;
        const placeObj = {
          id: place.id,
          name: (place.displayName?.text || place.displayName || item.text).split(",")[0].trim(),
          lat: place.location?.lat(),
          lng: place.location?.lng(),
          address: place.formattedAddress || "",
          type: (place.types || [])[0] || "",
          types: place.types || [],
          rating: place.rating || null,
          reviews: place.userRatingCount || 0,
          priceNum: priceNum >= 0 ? priceNum : null,
          price: priceNum > 0 ? "$".repeat(priceNum) : null,
          photo: photoUrl,
          photos: allPhotos,
          openNow: place.regularOpeningHours?.isOpen?.() ?? null,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query_place_id=${place.id}`,
          labels: [],
          wfScore: null,
        };
        // Recenter explore list to this place's area for the "similar spots" context.
        if (place.location) {
          setCenter({ lat: place.location.lat(), lng: place.location.lng() });
          manualRef.current = true;
        }
        openDetail(placeObj);
      } catch {
        showToast("Could not load this place");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Area / city — recenter and reload the explore feed.
    setLoading(true);
    manualRef.current = true;
    try {
      const place = item.pp.toPlace();
      await place.fetchFields({ fields: ["location", "formattedAddress", "displayName"] });
      const loc = place.location;
      if (loc) {
        setCenter({ lat: loc.lat(), lng: loc.lng() });
        const fa = place.formattedAddress || (place.displayName && (place.displayName.text || place.displayName)) || item.text;
        setLocName(String(fa).split(",").slice(0, 2).join(",").trim());
      }
    } catch {
      try {
        const c = await geocodeCity(item.text);
        if (c) { setCenter(c); setLocName(c.name.split(",").slice(0, 2).join(",").trim()); }
      } catch {}
    } finally {
      setLoading(false);
    }
  }

  async function submitSearch() {
    const q = query.trim();
    if (!q) return;
    setSuggestions([]);
    // Check if it's a Wayfind experience keyword first (burgers, rooftop, live music…).
    const ql = q.toLowerCase();
    if (ql.length >= 3) {
      const expHit = Object.keys(EXPERIENCES).find((k) => {
        const e = EXPERIENCES[k];
        const lab = (e.label || "").toLowerCase();
        return k === ql || lab === ql || lab.includes(ql) || (e.keyword && e.keyword.toLowerCase().includes(ql));
      });
      if (expHit) { setQuery(""); openExperience(expHit); return; }
    }
    setLoading(true);
    manualRef.current = true;
    // Use the device GPS if available (more accurate than geocoded center)
    const searchCenter = deviceLoc
      ? { lat: deviceLoc.lat, lng: deviceLoc.lng }
      : center ? { lat: center.lat, lng: center.lng } : null;
    try {
      // Try nearby place / chain search within 20 miles first.
      // This handles McDonald's, Burger King, any specific restaurant or business.
      if (searchCenter) {
        const nearby = await searchNearbyPlaces(q, searchCenter, 20);
        if (nearby && nearby.length > 0) {
          setQuery("");
          setSearchMode(true);
          if (nearby.length === 1) {
            // Single match — open detail directly
            setLoading(false);
            openDetail(nearby[0]);
          } else {
            // Multiple locations (chain, etc.) — show sorted list closest first
            setPlaces(nearby);
            setSearchLabel(`${nearby.length} results for "${q}"`);
            setSortBy("near");
            setScreen("explore");
            setLoading(false);
            loadBlurbs(nearby.slice(0, 6));
          }
          return;
        }
      }
      // Fall back to area / city geocode search.
      const c = await geocodeCity(q);
      if (c) {
        setCenter(c);
        setLocName(c.name.split(",").slice(0, 2).join(",").trim());
        setSearchMode(false);
        setSearchLabel("");
        setQuery("");
      } else {
        setErr("Nothing found. Try a restaurant name, chain, or city.");
      }
    } catch {
      setErr("Search failed. Try again.");
    } finally { setLoading(false); }
  }

  function saveToList(listId) {
    const l = lists[listId];
    if (!l || !saveTarget) return;
    const has = l.places.some((p) => p.id === saveTarget.id);
    setLists({ ...lists, [listId]: { ...l, places: has ? l.places.filter((p) => p.id !== saveTarget.id) : [...l.places, saveTarget] } });
    setSaveTarget(null);
  }
  // One-tap save straight to Favorites from a card heart.
  function quickSaveFavorite(p) {
    if (!p) return;
    const fav = lists.favorites || { id: "favorites", name: "Favorites", emoji: "❤️", places: [] };
    const has = fav.places.some((x) => x.id === p.id);
    setLists({ ...lists, favorites: { ...fav, places: has ? fav.places.filter((x) => x.id !== p.id) : [...fav.places, p] } });
    showToast(has ? "Removed from Favorites" : "❤️ Saved to Favorites");
    if (supabase && user) {
      if (has) {
        supabase.from("saved_places").delete().eq("user_id", user.id).eq("place_id", p.id).eq("list_name", "Favorites").then(() => {}, () => {});
      } else {
        supabase.from("saved_places").upsert({ user_id: user.id, place_id: p.id, place: p, list_name: "Favorites" }, { onConflict: "user_id,place_id,list_name" }).then(() => {}, () => {});
      }
    }
  }
  // Save a whole curated hook list as its own list under Favorites.
  function saveHookList(hook, places) {
    if (!hook || !places || !places.length) return;
    const key = "hook_" + hook.id;
    if (lists[key]) {
      const next = { ...lists }; delete next[key]; setLists(next);
      showToast("Removed from your lists");
    } else {
      setLists({ ...lists, [key]: { id: key, name: hook.themeTitle || hook.hook || "Saved list", emoji: hook.emoji || "✨", places: places.map((x) => x) } });
      showToast("❤️ Saved to your lists");
    }
  }
  const isSaved = (id) => Object.values(lists).some((l) => l.places.some((p) => p.id === id));

  function createList() {
    const name = newName.trim();
    if (!name) return;
    const id = "list_" + Date.now();
    setLists({ ...lists, [id]: { id, name, emoji: newEmoji, places: [] } });
    setNewName(""); setNewEmoji("⭐"); setNewListOpen(false);
  }
  function deleteList(id) {
    if (id === "favorites") return;
    const next = { ...lists };
    delete next[id];
    setLists(next);
    setActiveList(null);
  }
  // Build a shareable link. With Supabase we store the list and share a short
  // code, so the URL is clean and unfurls into a rich preview. Without it we
  // fall back to the long self-contained link.
  async function buildListShareUrl(places, title) {
    const payload = encodeList(places);
    const n = (places || []).length;
    const q = `t=${encodeURIComponent(title || "")}&loc=${encodeURIComponent(locName || "")}&n=${n}`;
    if (supabase && payload) {
      try {
        const code = randCode();
        const { error } = await supabase.from("shared_lists").insert({ code, payload, title: title || "", loc: locName || "", n });
        if (!error) return originUrl(`/s/${code}?${q}`);
      } catch {}
    }
    return originUrl(`/s/${payload}?${q}`);
  }
  async function shareList(places, title) {
    if (!places || !places.length) return;
    const url = await buildListShareUrl(places, title);
    shareLink(`Wayfind list: ${title}`, url, () => showToast("Link copied"), "A few places I think we should check out. Found them on Wayfind");
  }

  if (keyMissing) {
    return (
      <div style={shell}>
        <div style={{ ...wrap, alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔑</div>
            <h2 style={{ color: C.text, margin: "0 0 8px" }}>Almost there</h2>
            <p style={{ color: C.light, maxWidth: 360, lineHeight: 1.6 }}>
              Add your Google Maps API key as an environment variable named{" "}
              <code style={{ color: C.accent }}>NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> in Vercel, then redeploy.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const subs = SUBFILTERS[cat] || [];
  const vibes = VIBES[cat] || [];
  // One source of truth: the experience nav is generated from the badge
  // registry itself, so every badge that can appear on a card is also tappable
  // here. A lead order surfaces the most useful first; the rest follow.
  // A short, curated row of the most useful experiences. Every other badge stays
  // reachable through the "See all" chip, so the registry is still one source of
  // truth without flooding the home row.
  const HOME_CHIPS = ["localfav", "gem", "value", "instagram", "waterfront", "livemusic", "family", "romantic", "outdoor", "breakfast", "coffee"].filter((k) => EXPERIENCES[k]);
  const view = sortBy === "near"
    ? [...places].sort((a, b) => (a.distMi ?? 1e12) - (b.distMi ?? 1e12))
    : [...places].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));

  const exploreList = (
    <>
      <div style={{ position: "sticky", top: 0, zIndex: 3, background: C.bg, margin: "0 -12px", padding: "10px 12px 8px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: C.text, letterSpacing: "-0.2px" }}>{greetingText()}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button onClick={rollDice} style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 800, padding: "6px 12px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", background: C.accent, color: "#0D1117", border: "none" }}>🎲 Pick for me</button>
            <button onClick={() => setAllExpOpen(true)} style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 800, padding: "6px 12px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", background: C.adim, color: C.accent, border: `1px solid ${C.accent}` }}>✨ Experiences</button>
          </div>
        </div>
        {weather && (
          <div style={{ margin: "4px 0 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{weather.icon} {weather.temp}°</span>
              {weather.label && <span style={{ fontSize: 13, color: C.light, fontWeight: 600 }}>{weather.label}</span>}
              {weather.feels != null && <span style={{ fontSize: 12, color: C.muted }}>Feels {weather.feels}°</span>}
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
              {weather.hi != null ? `H ${weather.hi}° L ${weather.lo}°` : ""}
              {weather.rain != null ? ` · ☔ ${weather.rain}%` : ""}
              {weather.wind != null ? ` · 💨 ${weather.wind} mph` : ""}
              {weather.humidity != null ? ` · 💧 ${weather.humidity}%` : ""}
              {weather.uv != null ? ` · ☀️ UV ${weather.uv}` : ""}
              {weather.sunset ? ` · 🌅 Sunset ${weather.sunset}` : ""}
            </div>
          </div>
        )}
        <div style={{ fontSize: 13, color: C.light, fontWeight: 600, margin: "7px 0 8px" }}>{dynamicSubline(weather)}</div>
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch" }}>
            {HOME_CHIPS.map((k) => {
              const e = EXPERIENCES[k];
              if (!e) return null;
              return (
                <button key={k} onClick={() => openExperience(k)} style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, padding: "7px 13px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", background: C.panel, color: C.light, border: `1px solid ${C.border}` }}>
                  {e.icon} {e.label}
                </button>
              );
            })}
          </div>
          <div style={{ position: "absolute", top: 0, right: 0, bottom: 6, width: 28, pointerEvents: "none", background: `linear-gradient(90deg, rgba(13,17,23,0), ${C.bg})` }} />
        </div>
      </div>
      <div style={{ padding: "10px 2px 6px" }}>
        {loading ? <Loader label="Finding the best spots" pad="0" /> : (
          <>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: C.text, letterSpacing: "-0.2px" }}>{searchLabel || picksHeader(cat)}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
              <div style={{ fontSize: 12.5, color: C.muted }}>
                {view.length} result{view.length === 1 ? "" : "s"} ·{" "}
                <span style={{ color: C.accent, fontWeight: 700 }}>
                  {sortBy === "near" ? "closest first" : "ranked best first"}
                </span>
              </div>
              {searchLabel && (
                <button onClick={() => { setSearchMode(false); setSearchLabel(""); setSortBy("best"); }} style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 10px", cursor: "pointer" }}>Clear ×</button>
              )}
            </div>
          </>
        )}
      </div>
      {!loading && (
        <div style={{ padding: "0 2px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <button onClick={() => setSortBy("best")} style={{ padding: "6px 14px", borderRadius: 999, border: `1.5px solid ${sortBy === "best" ? C.accent : C.border}`, background: sortBy === "best" ? C.accent : "transparent", color: sortBy === "best" ? "#0D1117" : C.light, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>⭐ Best</button>
            <button onClick={() => setSortBy("near")} style={{ padding: "6px 14px", borderRadius: 999, border: `1.5px solid ${sortBy === "near" ? C.accent : C.border}`, background: sortBy === "near" ? C.accent : "transparent", color: sortBy === "near" ? "#0D1117" : C.light, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>📍 Closest</button>
            {sortBy === "near" && (
              <button onClick={() => setShowRadiusWheel((o) => !o)} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 999, border: `1.5px solid ${C.accent}`, background: C.adim, color: C.accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>📏 {Math.round(searchRadius / 1609)} mi {showRadiusWheel ? "▲" : "▼"}</button>
            )}
          </div>
          {sortBy === "near" && showRadiusWheel && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600, marginBottom: 8 }}>How far are you willing to go?</div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                {[
                  { label: "5 mi", val: 8047 },
                  { label: "10 mi", val: 16093 },
                  { label: "15 mi", val: 24140 },
                  { label: "20 mi", val: 32187 },
                  { label: "30 mi", val: 48280 },
                  { label: "50 mi", val: 80467 },
                ].map((r) => {
                  const on = searchRadius === r.val;
                  return (
                    <button key={r.val} onClick={() => { setSearchRadius(r.val); setShowRadiusWheel(false); }} style={{ flexShrink: 0, padding: "10px 18px", borderRadius: 12, border: `1.5px solid ${on ? C.accent : C.border}`, background: on ? C.accent : C.card, color: on ? "#fff" : C.light, fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                      <div>{r.label}</div>
                      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{on ? "selected" : "away"}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>Best = star rating weighted by number of reviews, so trusted favorites rank above lightly reviewed spots.</div>
        </div>
      )}
      {err && <div style={{ color: C.red, fontSize: 13, padding: "4px 2px 12px" }}>{err}</div>}
      {!loading && !err && view.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{CAT_ICONS[cat]}</div>
          <strong style={{ display: "block", color: C.light }}>Nothing found here</strong>
          <span style={{ fontSize: 13 }}>Try another category or city.</span>
        </div>
      )}
      {view.slice(0, 3).map((p, i) => (
        <PlaceCard key={p.id} p={p} rank={i + 1} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} line={blurbs[p.id]} onBadge={openExperience} />
      ))}
      {view.length > 3 && hookCards.length > 0 && (
        <HooksBanner hooks={hookCards} likedIds={hookLikes} totalLiked={hookLikes.size} onOpen={openHook} onLike={toggleHookLike} allPlaces={[...(suggested || []), ...places].filter(Boolean)} />
      )}
      {view.slice(3).map((p, i) => (
        <PlaceCard key={p.id} p={p} rank={i + 4} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} line={blurbs[p.id]} onBadge={openExperience} />
      ))}
    </>
  );

  return (
    <div style={shell}>
    <div style={{ ...wrap, maxWidth: isDesktop ? 1180 : 480 }}>
      <style>{`@keyframes wfpulse{0%,100%{transform:scale(.8);opacity:.45}50%{transform:scale(1.08);opacity:1}}@keyframes wfdot{0%,80%,100%{opacity:.25}40%{opacity:1}}@keyframes wfbob{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.06)}}`}</style>
      {/* Header */}
      <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "12px 14px", paddingTop: "max(12px, env(safe-area-inset-top))", flexShrink: 0, position: "relative", zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <img src="/wordmark.png" alt="wayfind" onClick={openSuggested} style={{ height: 30, width: "auto", display: "block", cursor: "pointer" }} />
            {locName && <span style={{ fontSize: 13, fontWeight: 400, color: C.muted, marginLeft: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>· {locName}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {supabase && (user ? (
              <button onClick={signOutUser} aria-label="Account" title={user.email || "Signed in"} style={{ flexShrink: 0, width: 34, height: 34, borderRadius: "50%", border: `1px solid ${C.border}`, background: C.card, color: C.accent, fontSize: 14, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" }}>{(user.email || "?").slice(0, 1)}</button>
            ) : (
              <button onClick={() => setAuthOpen(true)} style={{ flexShrink: 0, fontSize: 13, fontWeight: 800, padding: "7px 14px", borderRadius: 999, cursor: "pointer", background: C.card, color: C.accent, border: `1px solid ${C.accent}` }}>Sign in</button>
            ))}
            <button onClick={shareApp} aria-label="Share Wayfind" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, padding: "7px 14px", borderRadius: 999, cursor: "pointer", background: C.accent, color: "#0D1117", border: "none" }}>{shareCopied ? "✓ Copied" : "↗ Share"}</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, position: "relative" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitSearch()}
              onBlur={() => setTimeout(() => setSuggestions([]), 150)}
              placeholder="Search a restaurant, bar, or city…"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 14, color: C.text, fontSize: 15, outline: "none" }}
            />
            {suggestions.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,.5)", zIndex: 50 }}>
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                    style={{ padding: "11px 14px", fontSize: 14, color: C.text, borderBottom: i < suggestions.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span style={{ color: s.kind === "place" ? C.accent : C.muted, fontSize: 16 }}>{s.kind === "place" ? "🍴" : "📍"}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.text}</div>
                      {s.kind === "place" && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>Go to this place</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={submitSearch} style={{ background: C.accent, border: "none", borderRadius: 14, color: "#fff", fontSize: 14, fontWeight: 700, padding: "0 20px", cursor: "pointer" }}>Go</button>
        </div>
      </div>

      {/* Category tabs (Explore + Map) */}
      {screen !== "saved" && screen !== "shared" && screen !== "events" && screen !== "experience" && screen !== "surprise" && (
        <div style={{ display: "flex", gap: 7, overflowX: "auto", padding: "10px 14px", background: C.panel, flexShrink: 0 }}>
          <button key="surprise" onClick={openSurprise} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 22, border: `1.5px solid ${C.purple}`, background: screen === "surprise" ? C.purple : "transparent", color: screen === "surprise" ? "#0D1117" : C.purple, fontSize: 14, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>🎁 Surprise Me</button>
          {CATEGORIES.map((c) => {
            const cc = CAT_COLOR[c.id] || { c: C.accent, dim: C.adim };
            const on = cat === c.id && screen !== "surprise" && screen !== "suggested";
            return (
              <button key={c.id} onClick={() => {
                // When on the map tab: update the category so pins refresh, but
                // NEVER navigate away. Bypass pickCat entirely to avoid any
                // closure or batching issue that could set screen to "explore".
                if (screen === "map") {
                  setCat(c.id); setSub("all"); setVibe("all"); setQuickFilter(null); setSearchMode(false); setSearchLabel("");
                } else {
                  pickCat(c.id);
                }
              }} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 22, border: `1.5px solid ${on ? cc.c : C.border}`, background: on ? cc.dim : "transparent", color: on ? cc.c : C.light, fontSize: 14, fontWeight: on ? 700 : 600, cursor: "pointer", whiteSpace: "nowrap" }}>{c.label}</button>
            );
          })}
        </div>
      )}

      {/* Sub-filter row (Explore + Map) */}
      {screen !== "saved" && screen !== "shared" && screen !== "events" && screen !== "experience" && screen !== "surprise" && screen !== "suggested" && subs.length > 0 && (
        <div style={{ display: "flex", gap: 7, overflowX: "auto", padding: "2px 14px 8px", background: C.panel, flexShrink: 0 }}>
          {subs.map((s) => (
            <button key={s.id} onClick={() => pickSub(s.id)} style={{ flexShrink: 0, padding: "5px 13px", borderRadius: 16, border: "none", background: sub === s.id ? C.accent : C.card, color: sub === s.id ? "#fff" : C.light, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{s.label}</button>
          ))}
        </div>
      )}

      {/* Body */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: screen === "map" ? "hidden" : "auto", padding: screen === "map" ? 0 : "12px 12px 24px" }}>
        <>
            {screen === "explore" && <div style={{ maxWidth: isDesktop ? 760 : undefined, margin: isDesktop ? "0 auto" : undefined }}>{exploreList}</div>}
            {screen === "map" && (() => {
              const dateChips = [];
              const now = new Date();
              for (let i = 0; i < 14; i++) {
                const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
                const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                dateChips.push({ value, top: i === 0 ? "Today" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()], day: d.getDate() });
              }
              let mapEvents = [];
              if (mapMode === "events") {
                const src = (events || []).filter((e) => e.lat != null && e.lng != null && (mapDate === "all" || e.date === mapDate));
                const seen = new Set();
                for (const e of src) { const k = `${e.lat.toFixed(3)},${e.lng.toFixed(3)}`; if (!seen.has(k)) { seen.add(k); mapEvents.push(e); } }
              }
              const tchip = (on) => ({ flexShrink: 0, minWidth: 44, padding: "5px 9px", borderRadius: 10, border: "none", cursor: "pointer", textAlign: "center", background: on ? C.accent : "transparent", color: on ? "#fff" : C.light, fontWeight: 700 });
              return (
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  <MapView places={mapMode === "events" ? [] : view} events={mapEvents} center={center} category={cat} deviceLoc={deviceLoc} onSelect={openDetail} onSelectEvent={openVenue} />
                  <div style={{ position: "absolute", top: 12, left: 12, zIndex: 5, display: "flex", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 999, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,.45)" }}>
                    <button onClick={() => setMapMode("places")} style={{ padding: "7px 15px", fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer", background: mapMode === "places" ? C.accent : "transparent", color: mapMode === "places" ? "#fff" : C.light }}>Places</button>
                    <button onClick={() => { setMapMode("events"); if (!events) loadEvents(); }} style={{ padding: "7px 15px", fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer", background: mapMode === "events" ? C.accent : "transparent", color: mapMode === "events" ? "#fff" : C.light }}>🎟️ Events</button>
                  </div>
                  {mapMode === "events" && (
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 12, zIndex: 5, padding: "0 12px" }}>
                      {!eventsLoading && !eventsUnavailable && (
                        <div style={{ fontSize: 11.5, color: "#fff", fontWeight: 700, textAlign: "center", marginBottom: 6, textShadow: "0 1px 4px rgba(0,0,0,.8)" }}>{mapEvents.length} venue{mapEvents.length === 1 ? "" : "s"}{mapDate === "all" ? " coming up" : " that day"}</div>
                      )}
                      <div style={{ display: "flex", gap: 6, overflowX: "auto", background: "rgba(13,17,23,.9)", border: `1px solid ${C.border}`, borderRadius: 14, padding: 8, WebkitOverflowScrolling: "touch" }}>
                        <button onClick={() => setMapDate("all")} style={tchip(mapDate === "all")}><div style={{ fontSize: 10, opacity: 0.85 }}>Any</div><div style={{ fontSize: 13 }}>All</div></button>
                        {dateChips.map((d) => (
                          <button key={d.value} onClick={() => setMapDate(d.value)} style={tchip(mapDate === d.value)}><div style={{ fontSize: 10, opacity: 0.85 }}>{d.top}</div><div style={{ fontSize: 13 }}>{d.day}</div></button>
                        ))}
                      </div>
                      {eventsUnavailable && <div style={{ fontSize: 11.5, color: "#fff", textAlign: "center", marginTop: 6, textShadow: "0 1px 4px rgba(0,0,0,.8)" }}>Add a Ticketmaster key in Vercel to switch events on.</div>}
                    </div>
                  )}
                </div>
              );
            })()}
          </>

        {screen === "suggested" && (() => {
          const list = suggested || [];
          const affinities = computeAffinities(signals);
          const activeSignals = signals.filter((s) => s.action === "like" || s.action === "dislike");
          const hasAffinity = activeSignals.length >= 2;
          const displayList = hasAffinity ? applyAffinity(list, affinities) : list;
          const likeCount = Object.keys(liked).length;
          const h = new Date().getHours();
          const part = h < 11 ? "this morning" : h < 15 ? "for lunch" : h < 17 ? "this afternoon" : h < 22 ? "tonight" : "right now";
          const moment = h < 11 ? "Breakfast" : h < 15 ? "Lunch" : h < 17 ? "Afternoon" : h < 22 ? "Dinner" : "Late-night";
          const intentDef = intent ? INTENTS.find((x) => x.id === intent) : null;
          const reasons = [];
          reasons.push("the time of day");
          if (weather) reasons.push("today's weather");
          if (Object.values(lists).some((l) => (l.places || []).length)) reasons.push("places you have saved");
          return (
            <div style={isDesktop ? { display: "flex", gap: 24, alignItems: "flex-start" } : {}}>
              {/* LEFT column on desktop: intent chips + hooks + feed */}
              <div style={{ flex: 1, minWidth: 0 }}>
              {!isDesktop && (
              <div style={{ border: `1px solid ${C.accent}`, borderRadius: 16, padding: 16, marginBottom: 14, background: `linear-gradient(160deg, rgba(255,150,70,.10) 0%, ${C.adim} 55%)` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: weather ? 11 : 6 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase" }}>You are exploring</div>
                    {locName ? (
                      <div style={{ fontSize: 21, fontWeight: 800, color: C.text, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {locName}</div>
                    ) : null}
                  </div>
                  {weather && (
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 30, lineHeight: 1 }}>{weather.icon}</span>
                      <span style={{ fontSize: 24, fontWeight: 800, color: C.text }}>{weather.temp}°</span>
                    </div>
                  )}
                </div>
                {weather && (
                  <div style={{ display: "flex", gap: 7, marginBottom: 13, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch" }}>
                    {weather.label && <span style={wstat}>{weather.label}</span>}
                    {weather.feels != null && <span style={wstat}>Feels {weather.feels}°</span>}
                    {weather.wind != null && <span style={wstat}>💨 {weather.wind} mph</span>}
                    {weather.sunset && <span style={wstat}>🌅 Sunset {weather.sunset}</span>}
                  </div>
                )}
                <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{intentDef ? intentDef.icon + " " + intentDef.label + " near you" : "✨ " + moment + " picks"}</div>
                <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5, marginTop: 5 }}>{intentDef ? "Curated for " + intentDef.label.toLowerCase() + ", ranked by the Wayfind Score and tuned to " + moment.toLowerCase() + "." : "The best-rated, currently open spots near you, tuned to " + moment.toLowerCase() + "."}</div>
                {list.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>⭐ {list.length} spots worth your time, ranked best first</div>
                    {hasAffinity && <span style={{ fontSize: 11, fontWeight: 800, color: C.accent, background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 999, padding: "2px 8px" }}>🎯 Ranked for your taste</span>}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 13 }}>
                  <button onClick={rollDice} style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "none", background: C.accent, color: "#0D1117", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>🎲 Pick for me</button>
                  <button onClick={() => setScreen("explore")} style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: `1.5px solid ${C.accent}`, background: "transparent", color: C.accent, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Browse all ↗</button>
                </div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>Pick for me lands you on one of these spots at random, for when you cannot decide. Browse all opens the full menu by category.</div>
              </div>
              )}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text, marginBottom: 8 }}>Why are you heading out?</div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                  {INTENTS.map((it) => {
                    const on = intent === it.id;
                    return (
                      <button key={it.id} onClick={() => setIntent(on ? null : it.id)} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 15px", borderRadius: 999, border: `1.5px solid ${on ? C.accent : C.border}`, background: on ? C.accent : C.panel, color: on ? "#0D1117" : C.light, fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{it.icon} {it.label}</button>
                    );
                  })}
                </div>
              </div>
              {!isDesktop && foryouEvents && foryouEvents.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>🎟️ Events nearby</div>
                    <span onClick={() => setScreen("events")} style={{ fontSize: 12.5, fontWeight: 700, color: C.accent, cursor: "pointer" }}>See all ↗</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                    {foryouEvents.map((e) => {
                      const f = formatEventDate(e.date, e.time);
                      return (
                        <div key={e.id} onClick={() => openVenue(e)} style={{ flexShrink: 0, width: 190, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, cursor: "pointer" }}>
                          <div style={{ fontSize: 11.5, fontWeight: 800, color: C.purple, marginBottom: 4 }}>{f.wd} {f.mo} {f.day}{f.time ? " · " + f.time : ""}</div>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.3, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.name}</div>
                          <div style={{ fontSize: 11.5, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {e.venue || e.city || "Nearby"}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {(suggestedLoading || suggested === null) && <Loader label="Reading the moment" pad="8px 2px" />}
              {!suggestedLoading && suggested !== null && list.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ display: "inline-flex", animation: "wfbob 1.4s ease-in-out infinite", marginBottom: 12 }}><Critter size={52} /></div>
                  <strong style={{ display: "block", color: C.light }}>Nothing to suggest just yet</strong>
                  <span style={{ fontSize: 13 }}>Try again in a moment or pick a category.</span>
                </div>
              )}
              {!suggestedLoading && suggested !== null && displayList.slice(0, 4).map((p, i) => (
                <PlaceCard key={p.id} p={p} rank={i + 1} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} line={blurbs[p.id]} onBadge={openExperience} />
              ))}
              {hookCards.length > 0 && (
                <HooksBanner hooks={hookCards.slice(0, 3)} likedIds={hookLikes} totalLiked={hookLikes.size} onOpen={openHook} onLike={toggleHookLike} allPlaces={[...(suggested || []), ...places].filter(Boolean)} />
              )}
              {!suggestedLoading && suggested !== null && (() => {
                const rest = displayList.slice(4);
                const inlineHooks = hookCards.slice(3);
                const pm = {};
                [...(suggested || []), ...places].filter(Boolean).forEach((pp) => { if (pp && pp.id) pm[pp.id] = pp; });
                const out = [];
                rest.forEach((p, i) => {
                  if (i > 0 && i % 6 === 0 && inlineHooks.length) {
                    const h = inlineHooks[(Math.floor(i / 6) - 1) % inlineHooks.length];
                    if (h) out.push(<HookSolo key={`hook-${h.id}-${i}`} h={h} place={pm[h.placeId]} liked={hookLikes.has(h.id)} onOpen={openHook} onLike={toggleHookLike} />);
                  }
                  out.push(<PlaceCard key={p.id} p={p} rank={i + 5} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} line={blurbs[p.id]} onBadge={openExperience} />);
                });
                return out;
              })()}
              <div style={{ height: 20 }} />
              </div>
              {isDesktop && (
                <div style={{ width: 340, flexShrink: 0, position: "sticky", top: 12 }}>
                  <div style={{ border: `1px solid ${C.accent}`, borderRadius: 16, padding: 16, marginBottom: 14, background: `linear-gradient(160deg, rgba(255,150,70,.10) 0%, ${C.adim} 55%)` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: weather ? 10 : 6 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase" }}>You are exploring</div>
                        {locName ? <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {locName}</div> : null}
                      </div>
                      {weather && <div style={{ flexShrink: 0 }}><span style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{weather.icon} {weather.temp}°</span></div>}
                    </div>
                    {weather && (
                      <div style={{ display: "flex", gap: 5, marginBottom: 11, flexWrap: "wrap" }}>
                        {weather.label && <span style={wstat}>{weather.label}</span>}
                        {weather.feels != null && <span style={wstat}>Feels {weather.feels}°</span>}
                        {weather.wind != null && <span style={wstat}>💨 {weather.wind} mph</span>}
                        {weather.sunset && <span style={wstat}>🌅 Sunset {weather.sunset}</span>}
                      </div>
                    )}
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{intentDef ? intentDef.icon + " " + intentDef.label + " near you" : "✨ " + moment + " picks"}</div>
                    {list.length > 0 && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 5, fontWeight: 600 }}>⭐ {list.length} spots, ranked best first</div>}
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button onClick={rollDice} style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "none", background: C.accent, color: "#0D1117", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>🎲 Pick for me</button>
                      <button onClick={() => setScreen("explore")} style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: `1.5px solid ${C.accent}`, background: "transparent", color: C.accent, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Browse all ↗</button>
                    </div>
                  </div>
                  {foryouEvents && foryouEvents.length > 0 && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>🎟️ Events nearby</div>
                        <span onClick={() => setScreen("events")} style={{ fontSize: 12, fontWeight: 700, color: C.accent, cursor: "pointer" }}>See all ↗</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {foryouEvents.slice(0, 6).map((e) => {
                          const f = formatEventDate(e.date, e.time);
                          return (
                            <div key={e.id} onClick={() => openVenue(e)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, cursor: "pointer" }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: C.purple, marginBottom: 3 }}>{f.wd} {f.mo} {f.day}{f.time ? " · " + f.time : ""}</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.3, marginBottom: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.name}</div>
                              <div style={{ fontSize: 10.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {e.venue || e.city || "Nearby"}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {screen === "surprise" && (() => {
          const p = surprisePick;
          const sl = p ? scoreLabel(p.wfScore) : null;
          const badges = p ? experienceBadges(p) : [];
          return (
            <div>
              <div onClick={() => setScreen("explore")} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.accent, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: "4px 2px 10px" }}>‹ Back</div>
              <div style={{ paddingBottom: 6 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.text }}>✨ {greetingText().replace("Good ", "")} pick</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>One standout for right now, chosen from what is open, close, highly rated, and right for the time of day.</div>
              </div>
              {surpriseLoading && <Loader label="Finding something good" pad="16px 2px" />}
              {!surpriseLoading && !p && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
                  <strong style={{ display: "block", color: C.light }}>Nothing to suggest right now</strong>
                  <span style={{ fontSize: 13 }}>Try a different area.</span>
                </div>
              )}
              {!surpriseLoading && p && (
                <div>
                  <div onClick={() => openDetail(p)} style={{ background: C.card, border: `1px solid ${C.accent}`, borderRadius: 16, overflow: "hidden", cursor: "pointer" }}>
                    <FallbackImg src={p.photo} icon="🍽️" style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
                    <div style={{ padding: 16 }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{p.name}</div>
                      {p.address && <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>📍 {p.address}</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        {sl && <span style={{ fontSize: 20, fontWeight: 900, color: C.accent }}>{sl.s}</span>}
                        {sl && <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{sl.word}</span>}
                        {p.rating && <span style={{ color: "#F59E0B", fontSize: 13 }}>★ {p.rating}</span>}
                        {p.openNow === true && <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>Open now</span>}
                        {p.openNow === false && <span style={{ fontSize: 12, fontWeight: 700, color: p.nextOpen && p.nextOpen.today ? C.gold : C.red }}>{p.nextOpen && p.nextOpen.today ? p.nextOpen.label : "Closed today"}</span>}
                        {p.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
                      </div>
                      {badges.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                          {badges.map((b) => (
                            <button key={b.key} onClick={(e) => { e.stopPropagation(); openExperience(b.key); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: C.accent, background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 999, padding: "3px 9px", cursor: "pointer" }}>{b.icon} {b.label}</button>
                          ))}
                        </div>
                      )}
                      {blurbs[p.id] && <div style={{ fontSize: 13, color: C.light, lineHeight: 1.45, marginTop: 10 }}><span style={{ color: C.accent }}>✨ </span>{blurbs[p.id]}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button onClick={() => openDetail(p)} style={{ flex: 1, background: C.accent, color: "#0D1117", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, padding: "13px 0", cursor: "pointer" }}>See full details</button>
                    <button onClick={() => setSurprisePick(pickSurprise(surprisePool))} style={{ flex: 1, background: "transparent", color: C.accent, border: `1.5px solid ${C.accent}`, borderRadius: 12, fontSize: 14, fontWeight: 800, padding: "13px 0", cursor: "pointer" }}>✨ Try another</button>
                  </div>
                  {/* Other picks — fills the screen and adds discovery */}
                  {surprisePool.filter((o) => o && o.id !== p.id).length > 0 && (
                    <div style={{ marginTop: 22 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: "0.3px", textTransform: "uppercase", marginBottom: 10 }}>Other great picks nearby</div>
                      {surprisePool.filter((o) => o && o.id !== p.id).slice(0, 4).map((other) => (
                        <div key={other.id} onClick={() => setSurprisePick(other)} style={{ display: "flex", alignItems: "center", gap: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8, cursor: "pointer" }}>
                          <FallbackImg src={other.photo} icon="🍽️" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{other.name}</div>
                            <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center", flexWrap: "wrap" }}>
                              {other.rating && <span style={{ fontSize: 12, color: "#F59E0B" }}>★ {other.rating}</span>}
                              {other.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {other.distMi.toFixed(1)} mi</span>}
                              {other.openNow === true && <span style={{ fontSize: 11, fontWeight: 600, color: C.green }}>Open</span>}
                              {other.openNow === false && <span style={{ fontSize: 11, fontWeight: 600, color: C.red }}>Closed</span>}
                            </div>
                          </div>
                          <span style={{ color: C.muted, fontSize: 18, flexShrink: 0 }}>›</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {screen === "experience" && activeBadge && EXPERIENCES[activeBadge] && (() => {
          const exp = EXPERIENCES[activeBadge];
          let list = expPlaces || [];
          if (expOpenOnly) list = list.filter((p) => p.openNow !== false);
          if (expSort === "near") list = [...list].sort((a, b) => (a.distMi ?? 1e12) - (b.distMi ?? 1e12));
          else list = [...list].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
          return (
            <div>
              <div onClick={() => { setScreen("explore"); setActiveBadge(null); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.accent, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: "4px 2px 10px" }}>‹ Back</div>
              <div style={{ background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
                <div style={{ fontSize: 34, lineHeight: 1 }}>{exp.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginTop: 6 }}>{exp.title}</div>
                <div style={{ fontSize: 13.5, color: C.light, lineHeight: 1.5, marginTop: 6 }}>{exp.lead}</div>
                <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.45, marginTop: 8 }}>Based on rating, review volume, distance, relevance, and real experience signals.</div>
                {!expLoading && <div style={{ fontSize: 12, color: C.muted, marginTop: 8, fontWeight: 600 }}>{list.length} place{list.length === 1 ? "" : "s"} found</div>}
              </div>
              {expLoading && <Loader label="Curating the best spots" pad="8px 2px" />}
              {!expLoading && (expPlaces || []).length > 0 && (
                <div style={{ display: "flex", gap: 7, marginBottom: 12, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch" }}>
                  <button onClick={() => setExpOpenOnly((o) => !o)} style={{ flexShrink: 0, whiteSpace: "nowrap", padding: "6px 12px", borderRadius: 999, border: `1.5px solid ${expOpenOnly ? C.green : C.border}`, background: expOpenOnly ? "rgba(34,197,94,.15)" : "transparent", color: expOpenOnly ? C.green : C.light, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{expOpenOnly ? "✓ Open now" : "Open now"}</button>
                  <button onClick={() => setExpSort("best")} style={{ flexShrink: 0, whiteSpace: "nowrap", padding: "6px 12px", borderRadius: 999, border: `1.5px solid ${expSort === "best" ? C.accent : C.border}`, background: expSort === "best" ? C.adim : "transparent", color: expSort === "best" ? C.accent : C.light, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Best</button>
                  <button onClick={() => setExpSort("near")} style={{ flexShrink: 0, whiteSpace: "nowrap", padding: "6px 12px", borderRadius: 999, border: `1.5px solid ${expSort === "near" ? C.accent : C.border}`, background: expSort === "near" ? C.adim : "transparent", color: expSort === "near" ? C.accent : C.light, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Closest</button>
                  <button onClick={rollDice} style={{ flexShrink: 0, whiteSpace: "nowrap", padding: "6px 12px", borderRadius: 999, border: "none", background: C.accent, color: "#0D1117", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>🎲 Pick for me</button>
                </div>
              )}
              {!expLoading && activeBadge === "instagram" && (expPlaces || []).length > 0 && (() => {
                const h = new Date().getHours();
                let light;
                if (h < 8) light = "Early light is soft and golden. Keep the sun to one side of your subject and shoot toward the open sky, not into the sun.";
                else if (h < 11) light = "Morning sun sits in the east. Stand with the sun behind you or to your left so faces are evenly lit and shadows stay short.";
                else if (h < 15) light = "Midday sun is high and harsh. Find open shade or a covered spot, keep the sun behind you, and avoid overhead noon shadows on faces.";
                else if (h < 18) light = "Afternoon sun moves to the west and softens. Side light works well; angle your subject so light skims across them.";
                else if (h < 20) light = "Golden hour. Put the sun behind your subject for a warm rim glow, then tap to focus and raise exposure so faces do not go dark.";
                else light = "After sunset, light is low. Use railings or a ledge to steady the shot, and frame against city lights or the sky.";
                return (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.pink, marginBottom: 8 }}>📸 Photo tips for right now</div>
                    <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, marginBottom: 8 }}>{light}</div>
                    <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.55 }}>
                      <div style={{ marginBottom: 4 }}>🎯 Framing: put the subject on a third, not dead center, and use a doorway, archway, or branches in front as a natural frame.</div>
                      <div style={{ marginBottom: 4 }}>🧍 Poses: shoot a candid walking or looking-away shot rather than a straight-on stare, turn shoulders slightly off camera, and keep hands busy.</div>
                      <div>📐 Lines: line up paths, railings, or shorelines so they lead toward the subject, and get low for a taller, more dramatic look.</div>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>General photography guidance based on the current time, not specific to each spot.</div>
                  </div>
                );
              })()}
              {!expLoading && list.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>{exp.icon}</div>
                  <strong style={{ display: "block", color: C.light }}>Nothing matched within 30 miles</strong>
                  <span style={{ fontSize: 13 }}>Try a different experience or area.</span>
                </div>
              )}
              {!expLoading && list.map((p, i) => (
                <PlaceCard key={p.id} p={p} rank={i + 1} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} line={blurbs[p.id]} onBadge={openExperience} selectedBadge={activeBadge} />
              ))}
            </div>
          );
        })()}

        {screen === "saved" && !activeList && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingTop: 4 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Your lists</div>
              <button onClick={() => setNewListOpen(true)} style={{ background: C.adim, border: `1px solid ${C.accent}`, color: C.accent, fontSize: 13, fontWeight: 700, padding: "7px 14px", borderRadius: 20, cursor: "pointer" }}>+ New list</button>
            </div>
            {supabase && !user && (
              <div onClick={() => setAuthOpen(true)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 14px", borderRadius: 14, border: `1px solid ${C.accent}`, background: C.adim, marginBottom: 16, cursor: "pointer" }}>
                <div style={{ fontSize: 22 }}>☁️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>Sign in to save across devices</div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>Your lists live only on this phone right now. Back them up and open them anywhere.</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.accent, whiteSpace: "nowrap" }}>Sign in ›</span>
              </div>
            )}
            {supabase && user && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Signed in as {user.email}</div>
                <span onClick={signOutUser} style={{ fontSize: 13, fontWeight: 700, color: C.accent, cursor: "pointer" }}>Sign out</span>
              </div>
            )}
            {Object.values(lists).map((l) => {
              const row = (
                <div onClick={() => setActiveList(l.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.card, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, border: `1px solid ${C.border}` }}>{l.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{l.name}</div>
                    <div style={{ fontSize: 13, color: C.muted }}>{l.places.length} place{l.places.length !== 1 ? "s" : ""}</div>
                  </div>
                  <span style={{ color: C.muted, fontSize: 20 }}>›</span>
                </div>
              );
              return l.id === "favorites"
                ? <div key={l.id}>{row}</div>
                : <SwipeRow key={l.id} onDelete={() => deleteList(l.id)}>{row}</SwipeRow>;
            })}
            <div style={{ fontSize: 11.5, color: C.muted, textAlign: "center", marginTop: 14 }}>Swipe a list left to delete it.</div>
          </div>
        )}

        {screen === "saved" && activeList && lists[activeList] && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 14, paddingTop: 4 }}>
              <button onClick={() => setActiveList(null)} style={{ background: "none", border: "none", color: C.accent, fontSize: 22, cursor: "pointer" }}>‹</button>
              <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text }}>{lists[activeList].emoji} {lists[activeList].name}</div>
              {lists[activeList].places.length > 0 && (
                <button onClick={() => shareList(lists[activeList].places, lists[activeList].name)} style={{ background: C.adim, border: `1px solid ${C.accent}`, color: C.accent, fontSize: 13, fontWeight: 700, padding: "7px 12px", borderRadius: 20, cursor: "pointer" }}>Share ↗</button>
              )}
              {activeList !== "favorites" && (
                <button onClick={() => deleteList(activeList)} style={{ background: "none", border: `1px solid ${C.border}`, color: C.red, fontSize: 16, width: 34, height: 34, borderRadius: 10, cursor: "pointer" }}>🗑</button>
              )}
            </div>
            {lists[activeList].places.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: C.muted }}>Tap the bookmark on any place to save it here.</div>
            ) : (
              <>
                {lists[activeList].places.length > 1 && (
                  <button onClick={rollDice} style={{ width: "100%", marginBottom: 14, padding: "12px 0", borderRadius: 12, border: `1.5px solid ${C.accent}`, background: C.adim, color: C.accent, fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>🎲 Pick for me</button>
                )}
                {lists[activeList].places.map((p) => (
                  <PlaceCard key={p.id} p={p} saved liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onBadge={openExperience} />
                ))}
              </>
            )}
          </div>
        )}
        {screen === "shared" && sharedList && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 14, paddingTop: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>📩 Shared with you</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{sharedList.length} place{sharedList.length !== 1 ? "s" : ""} someone wanted you to see</div>
              </div>
              <button onClick={() => { setSharedList(null); setScreen("explore"); }} style={{ background: C.accent, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 20, cursor: "pointer" }}>Explore ›</button>
            </div>
            {sharedList.map((p) => (
              <PlaceCard key={p.id} p={p} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onBadge={openExperience} />
            ))}
          </div>
        )}
        {screen === "events" && (() => {
          const all = events || [];
          const segs = [];
          all.forEach((e) => { const m = eventSegmentMeta(e.segment, e.genre); if ((e.segment || e.genre) && !segs.find((s) => s.short === m.short)) segs.push(m); });
          let shown = all;
          if (eventCat !== "all") shown = shown.filter((e) => eventSegmentMeta(e.segment, e.genre).short === eventCat);
          if (eventDate !== "all") shown = shown.filter((e) => e.date === eventDate);
          const eventDateChips = [];
          const enow = new Date();
          for (let i = 0; i < 28; i++) {
            const d = new Date(enow.getFullYear(), enow.getMonth(), enow.getDate() + i);
            const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            eventDateChips.push({ value, top: i === 0 ? "Today" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()], day: d.getDate() });
          }
          const dchip = (on) => ({ flexShrink: 0, minWidth: 46, padding: "6px 9px", borderRadius: 12, border: `1px solid ${on ? C.accent : C.border}`, cursor: "pointer", textAlign: "center", background: on ? C.accent : C.panel, color: on ? "#fff" : C.light, fontWeight: 700 });
          return (
            <div>
              <div style={{ paddingTop: 4, marginBottom: 12 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Events near you</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>Concerts, sports, and shows worth building a night around</div>
              </div>
              {!eventsLoading && !eventsUnavailable && !eventsError && all.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {(eventCat !== "all" || eventDate !== "all") && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                      <button onClick={() => { setEventCat("all"); setEventDate("all"); }} style={{ fontSize: 11, fontWeight: 800, color: C.accent, background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 999, padding: "3px 10px", cursor: "pointer" }}>Show all ✕</button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                    <button onClick={() => setEventDate("all")} style={dchip(eventDate === "all")}><div style={{ fontSize: 10, opacity: 0.85 }}>Any</div><div style={{ fontSize: 14 }}>All</div><div style={{ fontSize: 9, opacity: 0.75, height: 11 }}>{all.length}</div></button>
                    {eventDateChips.map((d) => {
                      const count = all.filter((e) => e.date === d.value).length;
                      return (
                        <button key={d.value} onClick={() => setEventDate(d.value)} style={dchip(eventDate === d.value)}>
                          <div style={{ fontSize: 10, opacity: 0.85 }}>{d.top}</div>
                          <div style={{ fontSize: 14 }}>{d.day}</div>
                          <div style={{ fontSize: 9, opacity: 0.75, height: 11 }}>{count > 0 ? count : ""}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {!eventsLoading && !eventsUnavailable && !eventsError && segs.length > 1 && (
                <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 12, WebkitOverflowScrolling: "touch" }}>
                  <button onClick={() => setEventCat("all")} style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, padding: "6px 13px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", background: eventCat === "all" ? C.adim : C.panel, color: eventCat === "all" ? C.accent : C.light, border: `1px solid ${eventCat === "all" ? C.accent : C.border}` }}>All</button>
                  {segs.map((m) => (
                    <button key={m.short} onClick={() => setEventCat(m.short)} style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, padding: "6px 13px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", background: eventCat === m.short ? C.adim : C.panel, color: eventCat === m.short ? C.accent : C.light, border: `1px solid ${eventCat === m.short ? C.accent : C.border}` }}>{m.icon} {m.short}</button>
                  ))}
                </div>
              )}
              {eventsLoading && <Loader label="Finding plans" pad="8px 2px" />}
              {!eventsLoading && eventsUnavailable && <div style={{ color: C.muted, fontSize: 13, padding: "8px 2px" }}>Events are not turned on yet. Add a Ticketmaster key in Vercel to switch them on.</div>}
              {!eventsLoading && !eventsUnavailable && eventsError && (
                <div style={{ textAlign: "center", padding: "40px 24px", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                  <strong style={{ display: "block", color: C.light }}>Could not reach the events service</strong>
                  <span style={{ fontSize: 13 }}>The Ticketmaster key may be wrong or not active yet.</span>
                  <div onClick={loadEvents} style={{ marginTop: 12, color: C.accent, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Tap to retry ↻</div>
                </div>
              )}
              {!eventsLoading && !eventsUnavailable && !eventsError && all.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🎟️</div>
                  <strong style={{ display: "block", color: C.light }}>No upcoming plans found</strong>
                  <span style={{ fontSize: 13 }}>Try searching a bigger city nearby.</span>
                </div>
              )}
              {!eventsLoading && !eventsUnavailable && !eventsError && all.length > 0 && shown.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 24px", color: C.muted }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
                  <strong style={{ display: "block", color: C.light }}>Nothing on this day</strong>
                  <span style={{ fontSize: 13 }}>Try another date or tap All.</span>
                </div>
              )}
              {!eventsLoading && !eventsUnavailable && !eventsError && shown.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {shown.map((e) => <EventCard key={e.id} e={e} onVenue={() => openVenue(e)} />)}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Roll the dice */}
      <style>{"@keyframes wfroll{0%{transform:rotate(0deg) scale(1)}50%{transform:rotate(180deg) scale(1.25)}100%{transform:rotate(360deg) scale(1)}}"}</style>
      {rolling && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(13,17,23,.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <div style={{ fontSize: 92, lineHeight: 1, animation: "wfroll 0.5s linear infinite" }}>{diceFace}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Finding your spot…</div>
          <div style={{ fontSize: 12.5, color: C.light }}>Letting the dice decide</div>
        </div>
      )}
      {diceChoose && !rolling && (
        <div onClick={() => setDiceChoose(false)} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(13,17,23,.85)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(ev) => ev.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "82vh", overflowY: "auto", background: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, border: `1px solid ${C.border}`, padding: "18px 16px calc(22px + env(safe-area-inset-bottom))" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 3 }}>🎲 Pick for me</div>
            <div style={{ fontSize: 13, color: C.light, marginBottom: 14, lineHeight: 1.5 }}>Pick what you are in the mood for and the dice lands you on a top rated spot near you that is open now.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
              {[
                { label: "🍽️ Food", cat: "food", kw: "" },
                { label: "☕ Coffee", cat: "food", kw: "coffee" },
                { label: "🍰 Dessert", cat: "food", kw: "dessert" },
                { label: "🍸 Bars & drinks", cat: "nightlife", kw: "bar" },
                { label: "🍺 Breweries", cat: "nightlife", kw: "brewery" },
                { label: "🌃 Nightlife", cat: "nightlife", kw: "night club" },
                { label: "🎵 Live music", cat: "nightlife", kw: "live music" },
                { label: "🌊 Waterfront", cat: "food", kw: "waterfront" },
                { label: "💕 Date night", cat: "food", kw: "romantic restaurant" },
                { label: "🎯 Activities", cat: "attractions", kw: "things to do" },
                { label: "🌳 Parks & outdoors", cat: "attractions", kw: "park" },
                { label: "👨‍👩‍👧 Family", cat: "attractions", kw: "family friendly" },
                { label: "🛍️ Shopping", cat: "shopping", kw: "" },
                { label: "🎲 Anything", any: true },
              ].map((d) => (
                <button key={d.label} onClick={() => rollFor(d)} style={{ flex: d.any ? "1 1 100%" : "1 1 calc(50% - 5px)", padding: "13px 10px", borderRadius: 14, border: `1px solid ${d.any ? C.accent : C.border}`, background: d.any ? C.adim : C.card, color: d.any ? C.accent : C.text, fontSize: 14, fontWeight: d.any ? 800 : 700, cursor: "pointer" }}>{d.label}</button>
              ))}
            </div>
            <button onClick={() => setDiceChoose(false)} style={{ width: "100%", marginTop: 12, padding: "11px 0", borderRadius: 12, border: "none", background: "transparent", color: C.muted, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <div style={{ background: C.panel, borderTop: `1px solid ${C.border}`, display: "flex", flexShrink: 0, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {[{ id: "home", icon: "🏠", label: "Home" }, { id: "events", icon: "🎟️", label: "Events" }, { id: "map", icon: "🗺️", label: "Map" }, { id: "saved", icon: "❤️", label: "Favorites" }].map((s) => {
          const active = (s.id === "home" && (screen === "suggested" || screen === "explore" || screen === "experience" || screen === "surprise")) || s.id === screen;
          return (
          <button key={s.id} onClick={() => { setActiveList(null); if (s.id === "home") { openSuggested(); } else { setScreen(s.id); } }} style={{ flex: 1, padding: "12px 8px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "transparent", border: "none", cursor: "pointer" }}>
            <span style={{ fontSize: 24, opacity: active ? 1 : 0.85 }}>{s.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: active ? C.accent : C.muted }}>{s.label}</span>
          </button>
          );
        })}
      </div>

      {/* Detail sheet */}
      {detail && (
        <div style={sheetBg} onClick={() => setDetail(null)}>
          <div style={sheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ position: "sticky", top: 0, zIndex: 5, background: C.panel, padding: "10px 12px", paddingTop: "max(10px, env(safe-area-inset-top))", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}` }}>
              <button onClick={() => shareLink(detail.name, originUrl("/?place=" + encodeURIComponent(detail.id)), () => showToast("Link copied"), `Want to go to ${detail.name} together? Found it on Wayfind`)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px", borderRadius: 19, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Share ↗</button>
              <button onClick={() => setDetail(null)} aria-label="Close" style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px", borderRadius: 19, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 14, fontWeight: 700, lineHeight: 1, cursor: "pointer" }}>✕ Close</button>
            </div>
            {detail.photos && detail.photos.length > 0 ? (
              <div style={{ position: "relative" }}>
                <div ref={galleryRef} style={{ display: "flex", gap: 6, overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
                  {detail.photos.map((src, i) => (
                    <FallbackImg key={i} src={src} icon="🍽️" onClick={() => setLightbox(src)} style={{ width: detail.photos.length > 1 ? "88%" : "100%", flexShrink: 0, height: 240, objectFit: "cover", scrollSnapAlign: "start", cursor: "zoom-in" }} />
                  ))}
                </div>
                {detail.photos.length > 1 && (
                  <>
                    <button onClick={() => scrollGallery(-1)} aria-label="Previous photo" style={galleryBtn("left")}>‹</button>
                    <button onClick={() => scrollGallery(1)} aria-label="Next photo" style={galleryBtn("right")}>›</button>
                  </>
                )}
              </div>
            ) : (
              <FallbackImg src={detail.photo} icon="🍽️" onClick={() => detail.photo && setLightbox(detail.photo)} style={{ width: "100%", height: 220, objectFit: "cover", cursor: detail.photo ? "zoom-in" : "default" }} />
            )}
            <div style={{ padding: "16px 16px calc(30px + env(safe-area-inset-bottom))" }}>
              {/* 1. Basics */}
              <div style={{ fontSize: 21, fontWeight: 800, marginBottom: 6, color: C.text, lineHeight: 1.25 }}>{detail.name}</div>
              {detail.address && (
                <a href={detail.mapsUrl} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 12.5, color: C.muted, textDecoration: "none", marginBottom: 10, lineHeight: 1.4 }}>📍 {detail.address}</a>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {(() => { const pc = primaryCategory(detail); return pc ? <span style={{ fontSize: 12.5, fontWeight: 800, color: CAT_LABEL_COLOR[pc] || C.light }}>{pc}</span> : null; })()}
                {detail.rating && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ color: "#F59E0B" }}>★</span>
                    <span style={{ fontSize: 13, color: C.muted }}>{detail.rating}</span>
                    {detail.reviews > 0 && (
                      <button onClick={() => { const n = !reviewsOpen; setReviewsOpen(n); if (n) loadFullInsight(detail, detailExtra); }} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontSize: 13, color: C.accent, fontWeight: 700, textDecoration: "underline" }}>{detail.reviews.toLocaleString()} reviews {reviewsOpen ? "▴" : "▾"}</button>
                    )}
                  </span>
                )}
                {detail.priceNum != null ? <PriceMeter level={detail.priceNum} word /> : (detail.price && <span style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>{detail.price}</span>)}
                {detail.openNow != null && <span style={{ fontSize: 13, fontWeight: 700, color: detail.openNow ? C.green : C.red }}>{detail.openNow ? "Open" : "Closed"}</span>}
                {detail.distMi != null && <span style={{ fontSize: 13, color: C.muted }}>· {detail.distMi.toFixed(1)} mi</span>}
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {experienceBadges(detail, null, 4).map((b) => (
                  <button key={b.key} onClick={() => { setDetail(null); openExperience(b.key); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: C.accent, background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 999, padding: "4px 11px", cursor: "pointer" }}>{b.icon} {b.label}</button>
                ))}
              </div>

              {reviewsOpen && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 10 }}>What people say</div>
                  {insightFullLoading && !insightFull && <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Reading the reviews…</div>}
                  {insightFull && !insightFull.error && (() => {
                    const A = (v) => (Array.isArray(v) ? v.filter((x) => x && String(x).trim()) : []);
                    const loves = A(insightFull.loves);
                    const keywords = A(insightFull.keywords);
                    if (!loves.length && !keywords.length) return null;
                    return (
                      <div style={{ marginBottom: 12 }}>
                        {loves.length > 0 && loves.slice(0, 5).map((l, i) => (
                          <div key={i} style={{ fontSize: 13.5, color: C.text, display: "flex", gap: 8, padding: "3px 0" }}><span style={{ color: C.green }}>✔</span><span>{l}</span></div>
                        ))}
                        {keywords.length > 0 && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                            {keywords.slice(0, 6).map((k, i) => (
                              <span key={i} style={{ fontSize: 11, fontWeight: 600, color: C.light, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 10px" }}>{k}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Reviews</div>
                  {detailExtra && detailExtra.reviews && detailExtra.reviews.length > 0 ? (
                    detailExtra.reviews.map((r, i) => (
                      <div key={i} style={{ marginBottom: i < detailExtra.reviews.length - 1 ? 12 : 0, paddingBottom: i < detailExtra.reviews.length - 1 ? 12 : 0, borderBottom: i < detailExtra.reviews.length - 1 ? `1px solid ${C.border}` : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                          {r.rating && <span style={{ color: "#F59E0B", fontSize: 12 }}>{stars(r.rating)}</span>}
                          {r.author && <span style={{ fontSize: 11, color: C.muted }}>{r.author}</span>}
                          {r.when && <span style={{ fontSize: 11, color: C.muted }}>· {r.when}</span>}
                        </div>
                        <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5 }}>{r.text}</div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 13, color: C.muted }}>No review text available for this place.</div>
                  )}
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 10 }}>Reviews from Google, which shares up to five per place. The good, the bad, and everything between. No invented numbers.</div>
                  <a href={`https://search.google.com/local/reviews?placeid=${detail.id}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 12.5, fontWeight: 800, color: C.accent, textDecoration: "none" }}>Read all reviews on Google ↗</a>
                </div>
              )}

              {detailExtra && detailExtra.editorial && (
                <div style={{ fontSize: 13.5, color: C.light, lineHeight: 1.5, marginBottom: 14, paddingLeft: 10, borderLeft: `3px solid ${C.border}` }}>{detailExtra.editorial}</div>
              )}

              {/* Worth the Drive? widget — shows for far-away places or when opened from the drive hook */}
              {detail && (detailContext === "drive" || (detail.distMi != null && detail.distMi >= 20)) && (
                <WorthTheDriveWidget
                  place={detail}
                  myVote={(myVotes || {})[detail.id]}
                  votes={(communityVotes || {})[detail.id]}
                  onVote={(v) => handleVote(detail, v)}
                />
              )}

              {/* 2. Why Wayfind picked it */}
              <div style={{ background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: "0.5px" }}>WHY WAYFIND PICKED IT</span>
                  {(() => { const sl = scoreLabel(detail.wfScore); return sl ? <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}><span style={{ fontSize: 22, fontWeight: 900, color: C.accent, lineHeight: 1 }}>{sl.s}</span><span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>/ 10</span></span> : null; })()}
                </div>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, marginTop: 7 }}>High Wayfind Score based on rating, review volume, distance, and experience signals.</div>
                <button onClick={() => setWhyOpen((o) => !o)} style={{ marginTop: 9, background: "transparent", border: `1px solid ${C.accent}`, color: C.accent, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: "4px 12px", cursor: "pointer" }}>{whyOpen ? "Hide ▴" : "Why? ▾"}</button>
                {whyOpen && (() => {
                  const sl = scoreLabel(detail.wfScore);
                  const cf = confidenceOf(detail.reviews);
                  return (
                    <div style={{ marginTop: 10, fontSize: 12.5, color: C.light, lineHeight: 1.55 }}>
                      {sl && <div style={{ marginBottom: 6, color: C.text, fontWeight: 700 }}>{sl.s}/10 · {sl.word}{detail.reviews > 0 ? ` · ${detail.reviews.toLocaleString()} reviews` : ""}{cf ? ` · ${cf.label.toLowerCase()}` : ""}</div>}
                      {insight && insight.verdict && <div style={{ marginBottom: 6, color: C.text }}>{insight.verdict}</div>}
                      <div>The Wayfind Score is the Google rating weighted by how many people rated it, so consistently strong places rank higher. The same place always scores the same.</div>
                    </div>
                  );
                })()}
              </div>

              {/* 3. Insider tip */}
              <div style={{ marginBottom: 16, background: C.adim, border: `1px solid ${C.accent}`, borderLeft: `4px solid ${C.accent}`, borderRadius: 14, padding: "13px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>💡</span>
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: C.accent }}>Insider tip</span>
                </div>
                {(() => {
                  const th = todayHours(detailExtra);
                  const chips = [];
                  if (detail.openNow === true) chips.push({ c: C.green, t: th ? "Open now · " + th : "Open now" });
                  else if (detail.openNow === false) chips.push({ c: C.red, t: th ? "Closed now · " + th + " today" : "Closed now" });
                  else if (th) chips.push({ c: C.light, t: "Today: " + th });
                  if (detail.price) chips.push({ c: C.light, t: detail.price });
                  if (detail.rating) chips.push({ c: C.gold, t: "★ " + detail.rating + (detail.reviews ? " (" + detail.reviews.toLocaleString() + ")" : "") });
                  if (!chips.length) return null;
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 11 }}>
                      {chips.map((ch, i) => (
                        <span key={i} style={{ fontSize: 12, fontWeight: 800, color: ch.c, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: "5px 11px" }}>{ch.t}</span>
                      ))}
                    </div>
                  );
                })()}
                {insightLoading && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted }}>
                    <div style={{ animation: "wfbob 1.1s ease-in-out infinite", display: "flex" }}><Critter size={22} /></div>
                    Reading the reviews for the best tip
                  </div>
                )}
                {!insightLoading && insight && insight.unavailable && <div style={{ fontSize: 13, color: C.muted }}>The details above are live. AI tips are not turned on yet.</div>}
                {!insightLoading && insight && insight.error && (
                  <div onClick={() => { delete insightCache.current[detail.id]; loadInsight(detail, detailExtra); }} style={{ fontSize: 13, color: C.accent, cursor: "pointer", fontWeight: 600 }}>Could not load the tip. Tap to retry ↻</div>
                )}
                {!insightLoading && insight && !insight.unavailable && !insight.error && (() => {
                  const ins = insight || {};
                  const tip = ins.tip || (Array.isArray(ins.tips) && ins.tips[0]) || ins.mustTry || "";
                  const bestTime = ins.bestTime && String(ins.bestTime).trim() ? ins.bestTime : "";
                  const caution = ins.caution || (Array.isArray(ins.cautions) && ins.cautions[0]) || "";
                  const hasTip = tip && String(tip).trim();
                  if (!hasTip && !bestTime && !caution) return <div style={{ fontSize: 13, color: C.muted }}>The live details above are the key things to know here.</div>;
                  return (
                    <div>
                      {hasTip && <div style={{ fontSize: 14.5, color: C.text, lineHeight: 1.5, fontWeight: 600, marginBottom: bestTime || caution ? 10 : 0 }}>{tip}</div>}
                      {bestTime && <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: C.light, marginBottom: caution ? 5 : 0 }}><span>📅</span><span>{bestTime}</span></div>}
                      {caution && <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: C.light }}><span>⚠️</span><span>{caution}</span></div>}
                    </div>
                  );
                })()}
              </div>

              {/* 4. Actions */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <a href={detail.mapsUrl} target="_blank" rel="noreferrer" style={{ flex: 1, padding: 13, background: C.accent, borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>Open in Google Maps ↗</a>
                <button onClick={() => { setDetail(null); setSaveTarget(detail); }} style={{ flex: 1, padding: 13, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>❤️ Favorite</button>
              </div>

              {isBeach(detail) && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#2DD4BF", marginBottom: 8 }}>🏖️ Beach conditions</div>
                  {beachCondLoading && <div style={{ fontSize: 13, color: C.muted }}>Checking wind and water…</div>}
                  {!beachCondLoading && beachCond && (() => {
                    const bc = beachCond;
                    const dir = bc.windDir != null ? compass(bc.windDir) : null;
                    const opp = bc.windDir != null ? compass((bc.windDir + 180) % 360) : null;
                    let shore = null;
                    if (bc.windDir != null && bc.waveDir != null) {
                      let diff = Math.abs(bc.windDir - bc.waveDir) % 360;
                      if (diff > 180) diff = 360 - diff;
                      shore = diff <= 60 ? "onshore" : diff >= 120 ? "offshore" : "cross";
                    }
                    const waveFt = bc.waveHeight != null ? (bc.waveHeight * 3.281).toFixed(1) : null;
                    const hasAny = bc.wind != null || shore || waveFt;
                    return (
                      <div>
                        {bc.wind != null && <div style={{ fontSize: 13.5, color: C.text, marginBottom: 6 }}>💨 Wind {bc.wind} mph{bc.gust ? " (gusts " + bc.gust + ")" : ""}{dir ? " from the " + dir : ""}</div>}
                        {shore && <div style={{ fontSize: 13.5, color: C.text, marginBottom: 6 }}>🧭 {shore === "onshore" ? "Blowing in off the water" : shore === "offshore" ? "Blowing out toward the water" : "Blowing along the beach"}</div>}
                        {waveFt && <div style={{ fontSize: 13.5, color: C.text, marginBottom: 6 }}>🌊 Waves about {waveFt} ft{bc.wavePeriod != null ? ", " + Math.round(bc.wavePeriod) + "s apart" : ""}</div>}
                        {dir && <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, marginTop: 4 }}>Tent tip: the wind comes from the {dir}, so set your tent or windbreak with the opening facing the {opp}, away from the wind.</div>}
                        {!hasAny && <div style={{ fontSize: 13, color: C.muted }}>Live conditions are not available for this spot right now.</div>}
                      </div>
                    );
                  })()}
                  {!beachCondLoading && !beachCond && <div style={{ fontSize: 13, color: C.muted }}>Could not load conditions right now.</div>}
                </div>
              )}

              <div style={{ marginBottom: 4 }}>
                <button onClick={() => { const n = !showMore; setShowMore(n); if (n) { loadFullInsight(detail, detailExtra); loadVideos(detail); } }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", fontSize: 14, fontWeight: 800, color: C.accent, background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 12, padding: "12px 14px" }}>
                  <span>{showMore ? "Show less" : "✨ Show more details, tips and videos"}</span>
                  <span style={{ fontSize: 12, fontWeight: 800 }}>{showMore ? "▴" : "▾"}</span>
                </button>
                {showMore && (
                  <div style={{ marginTop: 10 }}>
                    {insightFullLoading && !insightFull && <div style={{ fontSize: 13, color: C.muted }}>Pulling the details together…</div>}
                    {insightFull && !insightFull.error && !insightFull.unavailable && (() => {
                      const A = (v) => (Array.isArray(v) ? v.filter((x) => x && String(x).trim()) : []);
                      const goodFor = A(insightFull.goodFor);
                      const tips = A(insightFull.tips);
                      const lab = { fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", margin: "12px 0 7px" };
                      return (
                        <div>
                          {goodFor.length > 0 && (
                            <>
                              <div style={lab}>Good for</div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {goodFor.slice(0, 6).map((g, i) => (
                                  <span key={i} style={{ fontSize: 12, fontWeight: 600, color: C.green, background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.4)", borderRadius: 999, padding: "4px 11px" }}>✓ {g}</span>
                                ))}
                              </div>
                            </>
                          )}
                          {(() => {
                            const mt = Array.isArray(insightFull.mustTry) ? insightFull.mustTry.filter((x) => x && String(x).trim()) : (insightFull.mustTry && String(insightFull.mustTry).trim() ? [insightFull.mustTry] : []);
                            if (!mt.length) return null;
                            return (
                              <>
                                <div style={lab}>Must try</div>
                                <div style={{ background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 10, padding: "10px 12px" }}>
                                  {mt.slice(0, 3).map((m, i) => (
                                    <div key={i} style={{ fontSize: 14, fontWeight: 600, color: C.text, display: "flex", gap: 8, padding: "2px 0" }}><span>🍴</span><span>{m}</span></div>
                                  ))}
                                </div>
                              </>
                            );
                          })()}
                          {tips.length > 0 && (
                            <>
                              <div style={lab}>Insider tips</div>
                              {tips.slice(0, 4).map((t, i) => (
                                <div key={i} style={{ fontSize: 13, color: C.light, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", marginBottom: 6, display: "flex", gap: 8 }}><span>💡</span><span>{t}</span></div>
                              ))}
                            </>
                          )}
                          {insightFull.vibe && String(insightFull.vibe).trim() && (
                            <div style={{ marginTop: 10 }}><InfoChip label="Vibe" value={insightFull.vibe} /></div>
                          )}
                        </div>
                      );
                    })()}
                    {insightFull && insightFull.error && (
                      <div onClick={() => { delete insightFullCache.current[detail.id]; loadFullInsight(detail, detailExtra); }} style={{ fontSize: 13, color: C.accent, cursor: "pointer", fontWeight: 600 }}>Could not load more. Tap to retry ↻</div>
                    )}
                    {(videosLoading || (videos && videos.length > 0)) && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 2, display: "flex", alignItems: "center", gap: 7 }}><span style={{ color: "#FF0000", fontSize: 14 }}>▶</span> Video reviews</div>
                        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Creators who covered this place on YouTube.</div>
                        {videosLoading && !videos ? (
                          <div style={{ fontSize: 13, color: C.muted }}>Finding videos…</div>
                        ) : (
                          videos.map((v) => (
                            <a key={v.id} href={v.url} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 10, marginBottom: 10, textDecoration: "none", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                              {v.thumb && <FallbackImg src={v.thumb} icon="▶️" style={{ width: 120, height: 68, objectFit: "cover", flexShrink: 0 }} />}
                              <div style={{ padding: "7px 8px 7px 0", minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.title}</div>
                                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{v.channel}</div>
                              </div>
                            </a>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>


              {/* 5. Optional collapsed */}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginBottom: 4 }}>
                <div onClick={() => { const n = !venueEventsOpen; setVenueEventsOpen(n); if (n && venueEvents === null && !venueEventsLoading) loadVenueEvents(detail); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: 13, fontWeight: 700, color: C.text }}>
                  <span>🎟️ Events near here</span>
                  <span style={{ fontSize: 12, color: C.accent, fontWeight: 800 }}>{venueEventsOpen ? "▴" : "▾"}</span>
                </div>
                {venueEventsOpen && (
                  <div style={{ marginTop: 10 }}>
                    {venueEventsLoading && <div style={{ fontSize: 13, color: C.muted }}>Checking Ticketmaster…</div>}
                    {!venueEventsLoading && venueEvents && venueEvents.length > 0 && (
                      <>
                        {venueEvents.map((e) => {
                          const f = formatEventDate(e.date, e.time);
                          return (
                            <a key={e.id} href={e.url} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 10, alignItems: "center", textDecoration: "none", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", marginBottom: 7 }}>
                              <div style={{ flexShrink: 0, textAlign: "center", minWidth: 34 }}>
                                <div style={{ fontSize: 9, fontWeight: 800, color: C.accent, textTransform: "uppercase" }}>{f.mo}</div>
                                <div style={{ fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1 }}>{f.day}</div>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
                                <div style={{ fontSize: 11, color: C.muted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.venue ? `📍 ${e.venue} · ` : ""}{f.wd}{f.time ? ` · ${f.time}` : ""}{e.price ? ` · ${e.price}` : ""}</div>
                              </div>
                              <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: C.accent }}>{e.ticketed === false ? "Details ↗" : "Tickets ↗"}</span>
                            </a>
                          );
                        })}
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Ticketed events at or near this location, from Ticketmaster. Check the venue on each before you go.</div>
                      </>
                    )}
                    {!venueEventsLoading && venueEvents && venueEvents.length === 0 && (
                      <div style={{ fontSize: 12.5, color: C.muted }}>No ticketed events found near here right now. Casual or free live music will not show up here, since only ticketed events are listed.</div>
                    )}
                  </div>
                )}
              </div>

              {detailExtra && detailExtra.hours && detailExtra.hours.length > 0 && (
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginBottom: 4 }}>
                  <div onClick={() => setHoursOpen((o) => !o)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: 13, fontWeight: 700, color: C.text }}>
                    <span>🕒 Hours</span>
                    <span style={{ fontSize: 12, color: C.accent, fontWeight: 800 }}>{hoursOpen ? "▴" : "▾"}</span>
                  </div>
                  {hoursOpen && (
                    <div style={{ marginTop: 8, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
                      {detailExtra.hours.map((line, i) => {
                        const parts = line.split(": ");
                        return (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, color: C.light, padding: "2px 0" }}>
                            <span style={{ fontWeight: 600, color: C.text }}>{parts[0]}</span>
                            <span style={{ textAlign: "right" }}>{parts.slice(1).join(": ")}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {allExpOpen && (
        <div onClick={() => setAllExpOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(ev) => ev.stopPropagation()} style={{ background: C.panel, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "82dvh", overflowY: "auto", padding: "18px 16px calc(18px + env(safe-area-inset-bottom))" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>All experiences</div>
              <button onClick={() => setAllExpOpen(false)} aria-label="Close" style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 999, width: 34, height: 34, fontSize: 16, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {Object.keys(EXPERIENCES).map((k) => {
                const e = EXPERIENCES[k];
                return (
                  <button key={k} onClick={() => { setAllExpOpen(false); openExperience(k); }} style={{ display: "flex", alignItems: "center", gap: 9, textAlign: "left", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 12px", cursor: "pointer" }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{e.icon}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{e.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Hook editorial page — full-screen themed experience, not a sheet */}
      {hookDetail && (() => {
        const allSrc = [...(suggested || []), ...places].filter(Boolean);
        const acc = hookDetail.accent || C.accent;
        const theme = hookDetail.theme || "best";
        const isLiked = hookLikes.has(hookDetail.id);
        const primaryId = hookDetail.placeId;

        // Theme-specific place curation — each theme shows the right number
        // of places, curated from real data. "Top 5" = exactly 5. "Skip" = 3.
        let themePlaces = [];
        const byScore = [...allSrc].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
        if (theme === "top5" || theme === "best") {
          themePlaces = byScore.slice(0, 5);
        } else if (theme === "gem") {
          themePlaces = allSrc.filter((p) => p.rating >= 4.4 && p.reviews >= 15 && p.reviews < 450).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5);
          const pri = allSrc.find((x) => x.id === primaryId);
          if (pri && !themePlaces.find((p) => p.id === pri.id)) themePlaces = [pri, ...themePlaces].slice(0, 5);
        } else if (theme === "skip") {
          themePlaces = allSrc.filter((p) => p.rating && p.rating < 3.9 && p.reviews >= 50).sort((a, b) => (a.rating || 5) - (b.rating || 5)).slice(0, 4);
        } else if (theme === "value") {
          themePlaces = allSrc.filter((p) => p.rating >= 4.2 && (p.priceNum === 1 || p.priceNum === 0)).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 5);
        } else if (theme === "open") {
          themePlaces = allSrc.filter((p) => p.openNow === true).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 5);
        } else if (theme === "popular" || theme === "overrated") {
          themePlaces = [...allSrc].sort((a, b) => (b.reviews || 0) - (a.reviews || 0)).slice(0, 5);
        } else if (theme === "drive") {
          themePlaces = allSrc.filter((p) => p.distMi != null && p.distMi > 12 && p.rating >= 4.4).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 3);
        } else if (theme === "itinerary") {
          const food = allSrc.filter((p) => (primaryCategory(p) || "") === "Food").sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 2);
          const night = allSrc.filter((p) => (primaryCategory(p) || "") === "Nightlife").sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 2);
          themePlaces = [...food, ...night];
        } else if (theme === "latenight") {
          themePlaces = allSrc.filter((p) => p.openNow === true).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 5);
        } else {
          const pri = allSrc.find((x) => x.id === primaryId);
          themePlaces = pri ? [pri, ...byScore.filter((p) => p.id !== pri.id).slice(0, 4)] : byScore.slice(0, 5);
        }
        if (themePlaces.length === 0 && primaryId) {
          const pri = allSrc.find((x) => x.id === primaryId);
          if (pri) themePlaces = [pri];
        }

        const MEDALS = { 0: "🥇", 1: "🥈", 2: "🥉" };
        const rankColours = { 0: "#FBBF24", 1: "#CBD5E1", 2: "#CD7F32" };
        const showRank = theme === "top5" || theme === "best";
        const showWarn = theme === "skip";

        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 950, background: C.bg, display: "flex", flexDirection: "column", overflowY: "hidden" }}>
            {/* Gradient hero header */}
            <div style={{ background: `linear-gradient(155deg, ${acc}2A 0%, ${C.bg} 72%)`, borderBottom: `1px solid ${acc}35`, padding: "max(16px, calc(env(safe-area-inset-top) + 12px)) 16px 18px", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <button onClick={() => setHookDetail(null)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: "none", color: acc, fontSize: 14, fontWeight: 800, cursor: "pointer", padding: 0 }}>‹ Back</button>
                <button
                  onClick={() => toggleHookLike(hookDetail.id)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, background: isLiked ? acc + "25" : "transparent", border: `1.5px solid ${isLiked ? acc : C.border}`, borderRadius: 999, padding: "6px 14px", color: isLiked ? acc : C.muted, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
                >
                  {isLiked ? "❤️ Saved" : "🤍 Save"}
                  {hookLikes.size > 0 && <span style={{ fontSize: 10.5, color: C.muted }}>· {hookLikes.size}</span>}
                </button>
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, color: acc, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 7 }}>{hookDetail.emoji} {hookDetail.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.text, lineHeight: 1.25, marginBottom: hookDetail.themeBody ? 10 : 4 }}>
                {hookDetail.themeTitle || hookDetail.hook}
              </div>
              {hookDetail.themeBody && (
                <div style={{ fontSize: 13.5, color: C.light, lineHeight: 1.6, marginBottom: 8 }}>{hookDetail.themeBody}</div>
              )}
              <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>
                {themePlaces.length} {theme === "skip" ? "to avoid" : theme === "drive" ? "worth the trip" : "curated picks"} · Tap any to see full details
              </div>
            </div>

            {/* Scrollable editorial list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px calc(24px + env(safe-area-inset-bottom))" }}>
              {themePlaces.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ display: "inline-flex", animation: "wfbob 1.4s ease-in-out infinite", marginBottom: 12 }}><Critter size={48} /></div>
                  <div style={{ fontSize: 14, color: C.light }}>Not enough data for this filter right now</div>
                </div>
              )}

              {themePlaces.map((p, i) => {
                const isFeatured = i === 0;
                const medalEmoji = MEDALS[i];
                const rankColor = rankColours[i] || C.accent;
                const badges = experienceBadges(p, null, 2);
                return (
                  <div
                    key={p.id}
                    onClick={() => { setHookDetail(null); openDetail(p, hookDetail.theme); }}
                    style={{
                      background: isFeatured ? `linear-gradient(135deg, ${acc}18 0%, ${C.card} 60%)` : C.card,
                      border: `1.5px solid ${isFeatured ? acc + "60" : C.border}`,
                      borderRadius: 16, marginBottom: 10, overflow: "hidden", cursor: "pointer",
                      boxShadow: isFeatured ? `0 4px 20px ${acc}20` : "none",
                    }}
                  >
                    {/* Featured (first) place: large photo on top */}
                    {isFeatured && (
                      <div style={{ position: "relative" }}>
                        <FallbackImg src={p.photo} icon="🍽️" style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
                        {showRank && (
                          <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,.7)", borderRadius: 10, padding: "5px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 20 }}>{medalEmoji || "🏆"}</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>#{i + 1} Pick</span>
                          </div>
                        )}
                        {showWarn && (
                          <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(239,68,68,.85)", borderRadius: 10, padding: "5px 12px" }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>⚠️ Skip this</span>
                          </div>
                        )}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(13,17,23,.95))", padding: "20px 14px 12px" }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{p.name}</div>
                        </div>
                      </div>
                    )}

                    {/* Card body */}
                    <div style={{ display: isFeatured ? "block" : "flex", padding: isFeatured ? "12px 14px 14px" : 0, gap: 0 }}>
                      {!isFeatured && (
                        <div style={{ position: "relative", flexShrink: 0 }}>
                          <FallbackImg src={p.photo} icon="🍽️" style={{ width: 86, height: 86, objectFit: "cover", display: "block" }} />
                          {showRank && (
                            <div style={{ position: "absolute", top: 5, left: 5, width: 22, height: 22, borderRadius: "50%", background: rankColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: medalEmoji ? 14 : 10, fontWeight: 800, color: "#0D1117" }}>
                              {medalEmoji || (i + 1)}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ padding: isFeatured ? 0 : "10px 12px", flex: 1, minWidth: 0 }}>
                        {!isFeatured && <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text, lineHeight: 1.3, marginBottom: 5 }}>{p.name}</div>}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
                          {p.rating && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: showWarn ? C.red : (p.rating >= 4.5 ? C.green : "#3F8F4E"), color: "#0D1117", fontWeight: 800, fontSize: 13, padding: "2px 8px", borderRadius: 7 }}>
                              ★ {p.rating}
                            </span>
                          )}
                          {p.reviews > 0 && <span style={{ fontSize: 12, color: C.muted }}>{p.reviews.toLocaleString()} reviews</span>}
                          {p.openNow === true && <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>Open now</span>}
                          {p.openNow === false && <span style={{ fontSize: 11, fontWeight: 700, color: C.red }}>Closed</span>}
                          {p.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
                          {p.price && <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>{p.price}</span>}
                        </div>
                        {badges.length > 0 && (
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                            {badges.map((b) => (
                              <span key={b.key} style={{ fontSize: 11, fontWeight: 700, color: acc, background: acc + "18", border: `1px solid ${acc}55`, borderRadius: 999, padding: "2px 8px" }}>{b.icon} {b.label}</span>
                            ))}
                          </div>
                        )}
                        {isFeatured && (
                          <div style={{ fontSize: 12.5, color: acc, fontWeight: 700 }}>See full details →</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Bottom save + share actions */}
              {themePlaces.length > 0 && (
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button
                    onClick={() => { toggleHookLike(hookDetail.id); saveHookList(hookDetail, themePlaces); }}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 0", borderRadius: 14, border: `1.5px solid ${isLiked ? acc : C.border}`, background: isLiked ? acc + "20" : "transparent", color: isLiked ? acc : C.light, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
                  >
                    {isLiked ? "❤️ Saved" : "🤍 Save this list"}
                  </button>
                  <button
                    onClick={async () => { const ttl = hookDetail.themeTitle || hookDetail.hook || "My Wayfind picks"; const url = await buildListShareUrl(themePlaces, ttl); shareLink(ttl, url, () => showToast("Link copied"), `${ttl} — my picks on Wayfind`); }}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 0", borderRadius: 14, border: "none", background: acc, color: "#0D1117", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
                  >
                    ↗ Share
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Copied toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 84, left: "50%", transform: "translateX(-50%)", zIndex: 1100, background: C.text, color: C.bg, fontSize: 13, fontWeight: 700, padding: "10px 18px", borderRadius: 999, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>{toast}</div>
      )}

      {/* Full-screen photo viewer */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <img src={lightbox} alt="" onClick={() => setLightbox(null)} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />
          <button onClick={() => setLightbox(null)} aria-label="Close" style={{ position: "absolute", top: "max(16px, calc(env(safe-area-inset-top) + 10px))", right: 16, width: 44, height: 44, borderRadius: "50%", border: "1px solid rgba(255,255,255,.3)", background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 20, cursor: "pointer", zIndex: 2 }}>✕</button>
          <div style={{ position: "absolute", bottom: "max(20px, calc(env(safe-area-inset-bottom) + 12px))", left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,.7)", fontSize: 12, pointerEvents: "none" }}>Tap anywhere to close</div>
        </div>
      )}

      {/* Save-to-list sheet */}
      {authOpen && (
        <div style={sheetBg} onClick={() => setAuthOpen(false)}>
          <div style={{ ...sheet, padding: "20px 16px 32px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 6 }}>Sign in to Wayfind</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>Save your spots to your account so they follow you across devices. We email a one-tap link, no password needed.</div>
            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="you@email.com"
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 15, marginBottom: 12, outline: "none" }}
            />
            <button onClick={sendMagicLink} disabled={authSending || !authEmail} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: C.accent, color: "#0D1117", fontSize: 15, fontWeight: 800, cursor: authSending || !authEmail ? "default" : "pointer", opacity: authSending || !authEmail ? 0.6 : 1 }}>{authSending ? "Sending…" : "Email me a sign-in link"}</button>
          </div>
        </div>
      )}
      {saveTarget && (
        <div style={sheetBg} onClick={() => setSaveTarget(null)}>
          <div style={{ ...sheet, padding: "20px 16px 32px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Add to favorites</div>
              <button onClick={() => { setSaveTarget(null); setNewListOpen(true); }} style={{ background: "none", border: `1px solid ${C.accent}`, color: C.accent, fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 18, cursor: "pointer" }}>+ New list</button>
            </div>
            {Object.values(lists).map((l) => (
              <div key={l.id} onClick={() => saveToList(l.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: 13, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 8, cursor: "pointer" }}>
                <span style={{ fontSize: 26 }}>{l.emoji}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{l.name}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>{l.places.length} places{l.places.some((p) => p.id === saveTarget.id) ? " · Added ✓" : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create-list sheet */}
      {newListOpen && (
        <div style={sheetBg} onClick={() => setNewListOpen(false)}>
          <div style={{ ...sheet, padding: "20px 16px 32px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, color: C.text }}>New list</div>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createList()}
              placeholder="List name (e.g. Date Night)"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 15, outline: "none", marginBottom: 16 }}
            />
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Pick an icon</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8, marginBottom: 20 }}>
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => setNewEmoji(e)} style={{ fontSize: 22, padding: "8px 0", borderRadius: 10, cursor: "pointer", background: newEmoji === e ? C.adim : C.card, border: `1.5px solid ${newEmoji === e ? C.accent : C.border}` }}>{e}</button>
              ))}
            </div>
            <button onClick={createList} disabled={!newName.trim()} style={{ width: "100%", padding: 14, background: newName.trim() ? C.accent : C.card, border: "none", borderRadius: 12, color: newName.trim() ? "#fff" : C.muted, fontSize: 15, fontWeight: 700, cursor: newName.trim() ? "pointer" : "default" }}>Create list</button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

function SwipeRow({ children, onDelete }) {
  const REVEAL = 84;
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(false);
  const sx = useRef(0); const sy = useRef(0); const base = useRef(0); const horiz = useRef(false);
  function start(e) { const t = e.touches[0]; sx.current = t.clientX; sy.current = t.clientY; horiz.current = false; setDrag(true); }
  function move(e) {
    const t = e.touches[0]; const mx = t.clientX - sx.current; const my = t.clientY - sy.current;
    if (!horiz.current) { if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my)) horiz.current = true; else return; }
    let nd = base.current + mx; if (nd > 0) nd = 0; if (nd < -(REVEAL + 40)) nd = -(REVEAL + 40); setDx(nd);
  }
  function end() { setDrag(false); const open = dx < -REVEAL / 2; const nd = open ? -REVEAL : 0; base.current = nd; setDx(nd); }
  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "flex-end" }}>
        <div onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ width: REVEAL, background: C.red, color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>Delete</div>
      </div>
      <div onTouchStart={start} onTouchMove={move} onTouchEnd={end} style={{ transform: `translateX(${dx}px)`, transition: drag ? "none" : "transform .2s ease", background: C.bg, position: "relative" }}>
        {children}
      </div>
    </div>
  );
}
function PlaceCard({ p, rank, saved, liked, disliked, onDetail, onSave, onLike, onDislike, line, onBadge, selectedBadge }) {
  const badges = experienceBadges(p, selectedBadge, 3);
  const pcat = primaryCategory(p);
  const m = rank ? medal(rank) : null;
  const take = line || templateBlurb(p);
  return (
    <div onClick={onDetail} style={{ background: C.card, border: `1px solid ${liked ? "rgba(34,197,94,.45)" : disliked ? "rgba(239,68,68,.3)" : C.border}`, borderRadius: 14, marginBottom: 12, overflow: "hidden", cursor: "pointer" }}>
      <div style={{ display: "flex" }}>
        <FallbackImg src={p.photo} icon="🍽️" style={{ width: 96, height: "auto", minHeight: 96, objectFit: "cover", flexShrink: 0 }} />
        <div style={{ padding: "12px 12px", flex: 1, minWidth: 0, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            {rank && (m
              ? <div style={{ fontSize: 21, lineHeight: 1, flexShrink: 0, width: 28, textAlign: "center" }}>{m.emoji}</div>
              : <div style={{ width: 28, textAlign: "center", color: C.muted, fontSize: 13, fontWeight: 800, flexShrink: 0 }}>#{rank}</div>
            )}
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.3, paddingRight: 4 }}>{p.name}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "7px 0 6px" }}>
            {pcat && <span style={{ fontSize: 12, fontWeight: 800, color: CAT_LABEL_COLOR[pcat] || C.light }}>{pcat}</span>}
            {p.rating && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: p.rating >= 4.5 ? C.green : p.rating >= 4.0 ? "#3F8F4E" : C.card, color: p.rating >= 4.0 ? "#0D1117" : C.light, fontWeight: 800, fontSize: 14, padding: "2px 8px", borderRadius: 8 }}>★ {p.rating}</span>}
            {p.reviews > 0 && (() => { const cf = confidenceOf(p.reviews); return (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: C.muted }}>
                {cf && <span style={{ width: 7, height: 7, borderRadius: "50%", background: cf.color, flexShrink: 0 }} />}
                {p.reviews.toLocaleString()} reviews
              </span>
            ); })()}
            {p.priceNum != null ? <PriceMeter level={p.priceNum} word /> : (p.price && <span style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>{p.price}</span>)}
            {p.openNow != null && <span style={{ fontSize: 11, fontWeight: 600, color: p.openNow ? C.green : C.red }}>{p.openNow ? "Open" : "Closed"}</span>}
            {p.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
            {badges.map((b) => (
              <button key={b.key} onClick={(e) => { e.stopPropagation(); if (onBadge) onBadge(b.key); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: C.accent, background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 999, padding: "3px 9px", cursor: "pointer" }}>{b.icon} {b.label}</button>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.45 }}><span style={{ color: C.accent }}>✨ </span>{take}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
            <button onClick={(e) => { e.stopPropagation(); onSave(); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: saved ? C.accent : "transparent", border: `1.5px solid ${saved ? C.accent : C.border}`, borderRadius: 999, color: saved ? "#0D1117" : C.light, fontSize: 12, fontWeight: 700, padding: "5px 12px", cursor: "pointer" }}>{saved ? "♥ Saved" : "♡ Save"}</button>
            {onLike && (
              <button onClick={onLike} title={liked ? "Unlike" : "Like this"} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: liked ? "rgba(34,197,94,.15)" : "transparent", border: `1.5px solid ${liked ? C.green : C.border}`, borderRadius: 999, color: liked ? C.green : C.muted, fontSize: 13, fontWeight: 700, padding: "5px 11px", cursor: "pointer" }}>👍{liked ? " Liked" : ""}</button>
            )}
            {onDislike && (
              <button onClick={onDislike} title={disliked ? "Undo" : "Not for me"} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: disliked ? "rgba(239,68,68,.12)" : "transparent", border: `1.5px solid ${disliked ? C.red : C.border}`, borderRadius: 999, color: disliked ? C.red : C.muted, fontSize: 13, fontWeight: 700, padding: "5px 11px", cursor: "pointer" }}>👎{disliked ? " Nope" : ""}</button>
            )}
            <button onClick={(e) => { e.stopPropagation(); shareLink(p.name, p.mapsUrl || "", null, "Check out " + p.name + " on Wayfind"); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 999, color: C.light, fontSize: 12, fontWeight: 700, padding: "5px 12px", cursor: "pointer" }}>↗ Share</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const wstat = { flexShrink: 0, whiteSpace: "nowrap", fontSize: 12, fontWeight: 700, color: C.light, background: "rgba(13,17,23,.5)", border: "1px solid rgba(249,115,22,.3)", borderRadius: 999, padding: "5px 11px" };
const shell = { background: C.bg, height: "100dvh", minHeight: "100dvh", display: "flex", justifyContent: "center" };
const wrap = { background: C.bg, color: C.text, height: "100dvh", width: "100%", maxWidth: 480, fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", touchAction: "pan-y", overscrollBehavior: "none" };
const sheetBg = { position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 900, display: "flex", alignItems: "flex-end", justifyContent: "center" };
const sheet = { background: C.panel, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "92dvh", overflowY: "auto" };

export default function Page() {
  return (
    <ErrorBoundary>
      <PageInner />
    </ErrorBoundary>
  );
}
