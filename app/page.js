"use client";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, SUBFILTERS, VIBES, getLoader, geocodeCity, reverseGeocode, searchPlaces, fetchPlaceDetail, fetchPlaceById, findPlace, searchNearbyPlaces } from "../lib/google";
import { supabase } from "../lib/supabase";
import MapView from "./components/MapView";

const BUILD = "v2.3";
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
const SHEET_EASE = "transform .34s cubic-bezier(.22,.61,.36,1)";
// A small grab handle at the top of every bottom sheet, so it reads as "pull down to close".
function Grabber() {
  return (
    <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", padding: "9px 0 5px" }}>
      <div style={{ width: 38, height: 5, borderRadius: 99, background: "#3A4453" }} />
    </div>
  );
}
const DEFAULT_CENTER = { lat: 27.5689, lng: -82.4393, name: "Parrish, FL" };
const FEATURED_AREAS = [
  { name: "Realengo, Rio de Janeiro", short: "Realengo", lat: -22.8847, lng: -43.4286, radius: 48280 },
  { name: "Padre Miguel, Rio de Janeiro", short: "Padre Miguel", lat: -22.8770, lng: -43.4470, radius: 48280 },
];

// Intent: Wayfind asks WHY you are going out, then reshapes every pick around it.
const INTENTS = [
  { id: "eat", icon: "🍽️", label: "Hungry", plans: [{ cat: "food", kw: "" }, { cat: "food", kw: "popular restaurants" }, { cat: "food", kw: "local favorite" }] },
  { id: "celebrate", icon: "🎉", label: "Celebrate", plans: [{ cat: "food", kw: "upscale restaurant" }, { cat: "nightlife", kw: "cocktail bar" }, { cat: "nightlife", kw: "rooftop bar" }] },
  { id: "date", icon: "❤️", label: "Date Night", plans: [{ cat: "food", kw: "romantic restaurant" }, { cat: "nightlife", kw: "cocktail bar" }, { cat: "food", kw: "waterfront" }, { cat: "food", kw: "dessert" }] },
  { id: "family", icon: "👨‍👩‍👧", label: "Family Time", plans: [{ cat: "attractions", kw: "family friendly" }, { cat: "food", kw: "family restaurant" }, { cat: "attractions", kw: "park" }] },
  { id: "kids", icon: "👶", label: "With Kids", plans: [{ cat: "attractions", kw: "things to do with kids" }, { cat: "attractions", kw: "playground park" }, { cat: "food", kw: "ice cream" }] },
  { id: "relax", icon: "🌅", label: "Relax", plans: [{ cat: "beach", kw: "" }, { cat: "attractions", kw: "park" }, { cat: "food", kw: "coffee" }] },
  { id: "night", icon: "🎵", label: "Night Out", plans: [{ cat: "nightlife", kw: "bar" }, { cat: "nightlife", kw: "night club" }, { cat: "nightlife", kw: "live music" }] },
  { id: "work", icon: "💻", label: "Work Friendly", plans: [{ cat: "food", kw: "coffee shop wifi" }, { cat: "food", kw: "cafe" }] },
  { id: "visit", icon: "✈️", label: "Visiting Town", plans: [{ cat: "attractions", kw: "top attractions" }, { cat: "attractions", kw: "things to do" }, { cat: "attractions", kw: "landmark" }] },
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

// A stable, anonymous, per-device id (no personal data — just a random string)
// used to attribute pooled engagement events and measure return visits. Created
// once and kept in localStorage. Returns null if storage is unavailable.
function deviceId() {
  try {
    if (typeof window === "undefined") return null;
    let id = localStorage.getItem("wf_device");
    if (!id) { id = "d_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); localStorage.setItem("wf_device", id); }
    return id;
  } catch { return null; }
}

// Module-level event logger (no user attribution — device id only). Used by
// leaf components like PlaceCard that sit outside the main component scope.
function logEventAnon(action, place, extra) {
  try {
    if (!supabase) return;
    supabase.from("events").insert({
      action,
      place_id: (place && place.id) || null,
      place_name: (place && place.name) || null,
      device_id: deviceId(),
      user_id: null,
      meta: extra || null,
    }).then(() => {}, () => {});
  } catch (e) {}
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
  if (c === 0) return { icon: "☀️", img: "sunny", label: "Clear", warm: true };
  if (c === 1 || c === 2) return { icon: "🌤️", img: "partly", label: "Partly cloudy", warm: true };
  if (c === 3) return { icon: "☁️", img: "cloudy", label: "Overcast" };
  if (c === 45 || c === 48) return { icon: "🌫️", img: "cloudy", label: "Fog" };
  if (c >= 51 && c <= 57) return { icon: "🌦️", img: "rain", label: "Drizzle", wet: true };
  if (c >= 61 && c <= 67) return { icon: "🌧️", img: "rain", label: "Rain", wet: true };
  if (c >= 71 && c <= 77) return { icon: "❄️", img: "snow", label: "Snow", wet: true };
  if (c >= 80 && c <= 82) return { icon: "🌦️", img: "rain", label: "Showers", wet: true };
  if (c >= 85 && c <= 86) return { icon: "🌨️", img: "snow", label: "Snow", wet: true };
  if (c >= 95) return { icon: "⛈️", img: "storm", label: "Storms", wet: true };
  return { icon: "🌡️", img: "cloudy", label: "" };
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

// v3.9: a home-grid tile backed by a generated image (public/tiles/*.png). If the image
// is missing or fails to load it falls back to the original icon and label tile, so the
// grid never breaks even before the images are uploaded. `overlay` lets the location and
// weather tiles paint live text (city, current conditions) over an intentionally blank frame.
function ImgTile({ src, onClick, overlay, fallback }) {
  const [err, setErr] = useState(false);
  return (
    <button onClick={onClick} style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", minHeight: 82, borderRadius: 14, overflow: "hidden", border: err ? `1px solid ${C.border}` : "none", background: C.card, cursor: "pointer", padding: 0, display: "block" }}>
      {!err && <img src={src} alt="" draggable={false} onError={() => setErr(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
      {!err && overlay}
      {err && <div style={{ width: "100%", height: "100%", minHeight: 82, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: "12px 6px" }}>{fallback}</div>}
    </button>
  );
}

// v4.0: clean home-grid tile in the Pick-a-category style — a thin colored frame, a faint
// matching wash, and the app font. No images, no glow. `icon` takes an emoji or a node (the
// weather tile passes a small <img>); `labelColor` overrides the label color when needed.
function CleanTile({ onClick, color, icon, label, sub, labelColor }) {
  return (
    <button onClick={onClick} style={{ position: "relative", width: "100%", minHeight: 76, borderRadius: 14, cursor: "pointer", padding: "8px 6px", textAlign: "center", border: `1.5px solid ${color}`, background: `linear-gradient(150deg, ${color}26, ${color}0D 72%), ${C.card}`, boxShadow: "0 2px 10px rgba(0,0,0,.28)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
      <span style={{ fontSize: 27, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 29 }}>{icon}</span>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: labelColor || color }}>{label}</span>
      {sub && <span style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 2px" }}>{sub}</span>}
    </button>
  );
}

// v4.0: shared sheet header so every app-tile sheet opens with the same hero treatment —
// a colored icon badge that matches its tile, a large title, and a muted subtitle.
function RadiusSlider({ mi, onChange, where }) {
  return (
    <div style={{ padding: "12px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
      <style>{".wf-radius{-webkit-appearance:none;appearance:none;width:100%;height:28px;background:transparent;outline:none;margin:6px 0;cursor:pointer}.wf-radius::-webkit-slider-runnable-track{height:6px;border-radius:999px;background:#2D3748}.wf-radius::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:28px;height:28px;border-radius:50%;background:radial-gradient(circle at 34% 30%,#ff7a7a,#dc2626);border:2px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,.55);cursor:pointer;margin-top:-11px}.wf-radius::-moz-range-track{height:6px;border-radius:999px;background:#2D3748}.wf-radius::-moz-range-thumb{width:28px;height:28px;border-radius:50%;background:radial-gradient(circle at 34% 30%,#ff7a7a,#dc2626);border:2px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,.55);cursor:pointer}"}</style>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Within <span style={{ color: C.accent }}>{mi} mi</span></div>
        <div style={{ fontSize: 11.5, color: C.muted }}>of {where}</div>
      </div>
      <input type="range" min={1} max={30} step={1} value={mi} onChange={(e) => onChange(Number(e.target.value))} className="wf-radius" aria-label="Search distance in miles" />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: C.muted, fontWeight: 700 }}><span>1 mi</span><span>30 mi</span></div>
    </div>
  );
}

function SheetHero({ icon, title, subtitle, color }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 54, height: 54, borderRadius: 16, border: `1.5px solid ${color}`, background: `linear-gradient(150deg, ${color}26, ${color}0D 72%), ${C.card}`, fontSize: 28, lineHeight: 1, marginBottom: 11 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.2px", lineHeight: 1.15 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.45 }}>{subtitle}</div>}
    </div>
  );
}

// v4.4: flat line nav icons in the Wayfind language — no emoji, no red heart. Each takes
// the active or inactive color so the bar stays on-brand and consistent at any state.
function NavIcon({ name, color, size }) {
  const sz = size || 23;
  const p = { width: sz, height: sz, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  if (name === "home") return (<svg {...p}><path d="M4 12 L12 4.5 L20 12" /><path d="M6 10.5 V19.5 H18 V10.5" /><path d="M10 19.5 V14 H14 V19.5" /></svg>);
  if (name === "events") return (<svg {...p}><rect x="3" y="7" width="18" height="10" rx="2.5" /><path d="M14 7 V17" strokeDasharray="1.6 2.2" /></svg>);
  if (name === "map") return (<svg {...p}><path d="M9 4.5 L3 7 V19.5 L9 17 L15 19.5 L21 17 V4.5 L15 7 L9 4.5 Z" /><path d="M9 4.5 V17" /><path d="M15 7 V19.5" /></svg>);
  if (name === "saved") return (<svg {...p}><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg>);
  return null;
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
  if (!s || s.includes("misc") || s.includes("undefined") || s.includes("other")) return { icon: "🎪", short: "Other", color: "#94A3B8" };
  return { icon: "🎪", short: seg || "Other", color: "#94A3B8" };
}

// An honest "what to wear" suggestion built only from signals we actually have:
// today's live weather, the venue's type, and its price tier. No invented
// specifics, no product links — just a practical nudge.
// Deterministic lunar phase from a known new-moon epoch. Pure math, no API, no
// fabrication: same date always yields the same phase.
function moonPhase(date) {
  const synodic = 29.530588853;
  const epochDays = Date.UTC(2000, 0, 6, 18, 14, 0) / 86400000;
  const nowDays = date.getTime() / 86400000;
  const age = (((nowDays - epochDays) % synodic) + synodic) % synodic;
  const illum = Math.round(((1 - Math.cos((2 * Math.PI * age) / synodic)) / 2) * 100);
  let name, emoji;
  if (age < 1.85) { name = "New moon"; emoji = "🌑"; }
  else if (age < 5.54) { name = "Waxing crescent"; emoji = "🌒"; }
  else if (age < 9.23) { name = "First quarter"; emoji = "🌓"; }
  else if (age < 12.92) { name = "Waxing gibbous"; emoji = "🌔"; }
  else if (age < 16.61) { name = "Full moon"; emoji = "🌕"; }
  else if (age < 20.30) { name = "Waning gibbous"; emoji = "🌖"; }
  else if (age < 23.99) { name = "Last quarter"; emoji = "🌗"; }
  else if (age < 27.68) { name = "Waning crescent"; emoji = "🌘"; }
  else { name = "New moon"; emoji = "🌑"; }
  return { name, emoji, illum };
}
// An honest heads-up derived only from the real numbers already fetched. Not an
// official alert; just a sensible tip when a condition crosses a threshold.
function weatherAdvisory(w) {
  if (!w) return null;
  if (w.rain != null && w.rain >= 60) return { icon: "🌧️", text: "Showers likely today. Worth keeping an indoor backup in mind." };
  if (w.wind != null && w.wind >= 25) return { icon: "💨", text: "Breezy out there. Patios and the beach may be gusty." };
  if (w.uv != null && w.uv >= 8) return { icon: "🧴", text: "Very high UV today. Sunscreen if you'll be out a while." };
  if (w.hi != null && w.hi >= 95) return { icon: "🥵", text: "Hot one today. Hydrate and lean toward shade." };
  if (w.lo != null && w.lo <= 40) return { icon: "🧥", text: "Cool later on. Bring a layer if you're out tonight." };
  return null;
}
function whatToWear(p, weather) {
  if (!p) return null;
  const t = ((p.type || "") + " " + (Array.isArray(p.types) ? p.types.join(" ") : "")).toLowerCase();
  const pn = p.priceNum;
  let dress;
  if (/beach|park|trail|outdoor|zoo|garden|hik/.test(t)) dress = "Casual and comfortable, with shoes you can walk in.";
  else if (pn === 4 || pn === 3) dress = "An upscale spot — smart casual to dressy fits the room.";
  else if (/bar|pub|brewery|club|night/.test(t)) dress = "Relaxed and casual fits the vibe.";
  else if (pn === 2) dress = "Smart casual is a safe call.";
  else dress = "Casual is fine here.";
  let wx = null;
  if (weather && weather.temp != null) {
    const temp = weather.temp;
    if (weather.wet) wx = `It's ${temp}° and ${(weather.label || "wet").toLowerCase()} out, so bring a layer or umbrella.`;
    else if (temp >= 88) wx = `It's hot at ${temp}°, so keep it light and breathable and bring water.`;
    else if (temp <= 55) wx = `It's chilly at ${temp}°, so layer up.`;
    else wx = `Comfortable ${temp}° out right now.`;
  }
  return { dress, wx };
}

// Category-aware version of the dress card. Keeps "what to wear" only where weather
// or vibe actually matters (beach, outdoor, nightlife). For food it returns a useful
// data-true line from price and meal type instead, since dress advice reads gimmicky
// for a restaurant. Granular Google attributes (groups, cuisine) are not in our data,
// so this stays honest rather than inventing "good for groups, burgers".
function placeVibe(p, weather) {
  if (!p) return null;
  const cat = primaryCategory(p);
  if (cat === "beach" || cat === "attractions" || cat === "nightlife") {
    const w = whatToWear(p, weather);
    return w ? { icon: "👕", title: "What to wear", body: w.dress + (w.wx ? " " + w.wx : "") } : null;
  }
  if (cat === "food") {
    const t = ((p.type || "") + " " + (Array.isArray(p.types) ? p.types.join(" ") : "")).toLowerCase();
    const pn = p.priceNum;
    let lead = "";
    if (/breakfast|brunch/.test(t)) lead = "Good for breakfast and brunch.";
    else if (/coffee|cafe/.test(t)) lead = "An easy spot for coffee and a casual sit.";
    else if (/bakery/.test(t)) lead = "A bakery, good for a quick grab or a treat.";
    else if (/ice_cream|dessert|gelato|frozen_yogurt/.test(t)) lead = "A dessert stop.";
    else if (/fast_food|meal_takeaway/.test(t)) lead = "Quick and casual.";
    else if (pn === 4) lead = "An upscale spot for a special-occasion meal.";
    else if (pn === 3) lead = "A nicer sit-down meal.";
    else if (pn === 2) lead = "An easy meal out.";
    else if (pn === 1) lead = "Casual and budget-friendly.";
    else if (p.rating != null && p.rating >= 4.5) lead = "A consistently well-loved local spot.";
    let extra = "";
    if (/breakfast|brunch|coffee|cafe|bakery|ice_cream|dessert/.test(t)) {
      if (pn === 4) extra = " On the upscale side.";
      else if (pn === 1) extra = " Easy on the wallet.";
    }
    const body = (lead + extra).trim();
    return body ? { icon: "🍽️", title: "Good to know", body } : null;
  }
  return null;
}

// Straight-line miles between two coords. Used to recompute distance from the
// user's real location when a place is opened from a flow that searched around a
// different point (e.g. an event venue searched near the event, not near you).
function miBetween(aLat, aLng, bLat, bLng) {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
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
function HooksBanner({ hooks, likedIds, totalLiked, onOpen, onLike, allPlaces, isDesktop }) {
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
      <div style={{ margin: isDesktop ? "0 -12px 14px" : "0 0 14px", gap: 12, paddingBottom: 4, WebkitOverflowScrolling: "touch", scrollbarWidth: "none", ...(isDesktop ? { display: "flex", flexWrap: "wrap", overflowX: "visible", paddingLeft: 12, paddingRight: 12 } : { display: "grid", gridTemplateColumns: "repeat(2, 1fr)" }) }}>
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
                flexShrink: 0, width: isDesktop ? 290 : "100%", height: isDesktop ? 185 : 152,
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
                <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", lineHeight: 1.25, marginBottom: 7, textShadow: "0 1px 6px rgba(0,0,0,.7)", letterSpacing: "-0.2px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
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

// Compute the list of real places a hook represents (same logic the detail
// sheet uses), so a card's heart can save the full list to Favorites.
function placesForHook(hook, allSrc) {
  const theme = (hook && hook.theme) || "best";
  const primaryId = hook && hook.placeId;
  const byScore = [...allSrc].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
  let out = [];
  if (theme === "top5" || theme === "best") out = byScore.slice(0, 5);
  else if (theme === "gem") {
    out = allSrc.filter((p) => p.rating >= 4.4 && p.reviews >= 15 && p.reviews < 450).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5);
    const pri = allSrc.find((x) => x.id === primaryId);
    if (pri && !out.find((p) => p.id === pri.id)) out = [pri, ...out].slice(0, 5);
  } else if (theme === "skip") out = allSrc.filter((p) => p.rating && p.rating < 3.9 && p.reviews >= 50).sort((a, b) => (a.rating || 5) - (b.rating || 5)).slice(0, 4);
  else if (theme === "value") out = allSrc.filter((p) => p.rating >= 4.2 && (p.priceNum === 1 || p.priceNum === 0)).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 5);
  else if (theme === "open") out = allSrc.filter((p) => p.openNow === true).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 5);
  else if (theme === "popular" || theme === "overrated") out = [...allSrc].sort((a, b) => (b.reviews || 0) - (a.reviews || 0)).slice(0, 5);
  else if (theme === "drive") out = allSrc.filter((p) => p.distMi != null && p.distMi > 12 && p.rating >= 4.4).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 3);
  else if (theme === "itinerary") {
    const food = allSrc.filter((p) => (primaryCategory(p) || "") === "Food").sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 2);
    const night = allSrc.filter((p) => (primaryCategory(p) || "") === "Nightlife").sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 2);
    out = [...food, ...night];
  } else if (theme === "latenight") out = allSrc.filter((p) => p.openNow === true).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 5);
  else {
    const pri = allSrc.find((x) => x.id === primaryId);
    out = pri ? [pri, ...byScore.filter((p) => p.id !== pri.id).slice(0, 4)] : byScore.slice(0, 5);
  }
  if (out.length === 0 && primaryId) {
    const pri = allSrc.find((x) => x.id === primaryId);
    if (pri) out = [pri];
  }
  return out;
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
  const [searchRadius, setSearchRadius] = useState(24140); // meters, ~15 miles default
  const [visibleCount, setVisibleCount] = useState(5); // explore list shows 5, then "Wayfind 5 more spots"
  const [radiusSheet, setRadiusSheet] = useState(false);
  const [pendingRadius, setPendingRadius] = useState(24140);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [sliderMi, setSliderMi] = useState(15);
  const [showRadiusWheel, setShowRadiusWheel] = useState(false);
  const [showNearbyExp, setShowNearbyExp] = useState(false); // v3.7 Phase 2: ✨ Nearby experiences dropdown in the sort row
  const [sortOpen, setSortOpen] = useState(false);
  const [heroNonce, setHeroNonce] = useState(0); // taps on "show another angle" cycle the hero pick
  const [pickOpen, setPickOpen] = useState(false); // Pick-for-me panel expanded
  const [menuSheet, setMenuSheet] = useState(null); // which app-tile sheet is open: menu|explore|experiences|weather|null
  const [homeRolling, setHomeRolling] = useState(false); // dice animating in the panel
  const [homeDiceFace, setHomeDiceFace] = useState("🎲");
  const [rollHistory, setRollHistory] = useState([]); // session-only history of dice rolls
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
  const [mapPreview, setMapPreview] = useState(null);
  const [eventPreview, setEventPreview] = useState(null);
  const [weather, setWeather] = useState(null);
  const [suggested, setSuggested] = useState(null);
  const [suggestedLoading, setSuggestedLoading] = useState(false);
  const [intent, setIntent] = useState(null);
  const [foryouEvents, setForyouEvents] = useState(null);
  const [libraryEvents, setLibraryEvents] = useState([]); // curated civic/library events for the local-community hero card
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
  const diceRouteRef = useRef(false);
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
  const sheetDragRef = useRef({});
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
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState("signin"); // signin | signup
  const [accountOpen, setAccountOpen] = useState(false); // account menu popover

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
      if (error) { showToast(error.message ? `Sign-in error: ${error.message}` : "Could not send link"); }
      else { showToast("Check your email for a sign-in link"); setAuthOpen(false); setAuthEmail(""); }
    } catch (e) { showToast(e && e.message ? `Sign-in error: ${e.message}` : "Could not send link"); }
    setAuthSending(false);
  }
  // One-tap social sign-in. No email, no rate limits. Needs the provider enabled
  // in Supabase. Redirects out to Google/Apple and back to the app.
  async function signInWithProvider(provider) {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined } });
      if (error) showToast(`Sign-in error: ${error.message}`);
    } catch (e) { showToast(e && e.message ? `Sign-in error: ${e.message}` : "Could not sign in"); }
  }
  // Email + password. Works with no email sending at all if "Confirm email" is
  // turned off in Supabase. Sign in for existing accounts, sign up for new ones.
  async function passwordAuth() {
    if (!supabase || !authEmail || !authPassword) return;
    setAuthSending(true);
    try {
      const creds = { email: authEmail.trim(), password: authPassword };
      const res = authMode === "signup"
        ? await supabase.auth.signUp(creds)
        : await supabase.auth.signInWithPassword(creds);
      if (res.error) { showToast(`Sign-in error: ${res.error.message}`); }
      else if (res.data && res.data.session) { showToast("Signed in"); setAuthOpen(false); setAuthEmail(""); setAuthPassword(""); }
      else { showToast("Account created. Check your email to confirm, then sign in."); }
    } catch (e) { showToast(e && e.message ? `Sign-in error: ${e.message}` : "Could not sign in"); }
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
      if (pick) { diceRouteRef.current = true; setSurprisePool(pool); setSurprisePick(pick); setScreen("surprise"); try { window.scrollTo(0, 0); } catch {} }
    }, 1000);
  }
  function rollDice() { setDiceChoose(true); }
  // In-place dice roll for the home Pick-for-me panel. Spins, lands on a random
  // spot from the current feed, and pushes it onto a session roll history the
  // user can scroll back through. Does not navigate away.
  function rollHomePick(pool) {
    const arr = (pool || []).filter(Boolean);
    if (!arr.length) { showToast("Nothing to roll here yet"); return; }
    setHomeRolling(true);
    const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    const iv = setInterval(() => setHomeDiceFace(faces[Math.floor(Math.random() * 6)]), 90);
    setTimeout(() => {
      clearInterval(iv);
      setHomeDiceFace("🎲");
      setHomeRolling(false);
      const pick = arr[Math.floor(Math.random() * arr.length)];
      if (pick) setRollHistory((h) => [pick, ...h.filter((x) => x && x.id !== pick.id)].slice(0, 8));
    }, 900);
  }
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
      if (res.length) { const pick = res[Math.floor(Math.random() * res.length)]; diceRouteRef.current = true; setSurprisePool(res); setSurprisePick(pick); setScreen("surprise"); try { window.scrollTo(0, 0); } catch {} }
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
      if (v) {
        if (v.lat != null && v.lng != null && center && center.lat != null) {
          const d = miBetween(center.lat, center.lng, v.lat, v.lng);
          if (d != null) v.distMi = d;
        }
        v._event = { name: e.name || "Event", date: e.date || "", time: e.time || "", url: e.url || "" };
        openDetail(v);
      } else showToast("Could not find this venue");
    } catch { showToast("Could not load venue details"); }
  }

  // Swipe a bottom sheet down (from its top) to close it, shared across every pop-up
  // sheet. Engages only when the sheet is scrolled to the top and the pull is clearly
  // downward, so normal scrolling and any horizontal content keep working; each sheet
  // passes its own close action. Tapping a Close button still works too.
  function sheetDragStart(e, onClose) {
    const el = e.currentTarget;
    const t = e.touches[0];
    sheetDragRef.current = { el, onClose, y0: t.clientY, x0: t.clientX, atTop: el.scrollTop <= 0, active: true, decided: false, dragging: false, dy: 0 };
    el.style.transition = "none";
  }
  function sheetDragMove(e) {
    const d = sheetDragRef.current;
    if (!d || !d.active || !d.el) return;
    const dy = e.touches[0].clientY - d.y0;
    const dx = e.touches[0].clientX - d.x0;
    if (!d.decided) {
      if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
      d.decided = true;
      d.dragging = d.atTop && dy > 0 && Math.abs(dy) > Math.abs(dx);
      if (!d.dragging) { d.active = false; return; }
    }
    if (d.dragging && dy > 0) { d.dy = dy; d.el.style.transform = "translateY(" + dy + "px)"; }
  }
  function sheetDragEnd() {
    const d = sheetDragRef.current;
    const el = d && d.el;
    if (!el) { sheetDragRef.current = {}; return; }
    el.style.transition = SHEET_EASE;
    if (d.dragging && d.dy > 90) {
      el.style.transform = "translateY(110%)";
      const oc = d.onClose;
      setTimeout(() => { try { oc && oc(); } catch (er) {} }, 340);
    } else {
      el.style.transform = "translateY(0px)";
    }
    sheetDragRef.current = {};
  }

  function shareApp() {
    const url = (typeof window !== "undefined" && window.location && window.location.origin) ? window.location.origin : "https://wayfind-xi.vercel.app";
    logEvent("share", null, { kind: "app" });
    shareLink("Wayfind", url, () => { setShareCopied(true); setTimeout(() => setShareCopied(false), 1800); }, "Find great things to do near you with Wayfind");
  }
  function pickCat(id) { setCat(id); setSub("all"); setVibe("all"); setQuickFilter(null); setSearchMode(false); setSearchLabel(""); setScreen("explore"); }
  // Reset the scroll container to the top whenever the list the user is looking
  // at changes — category, sub-filter, vibe, sort, intent, distance, or screen.
  // Without this, changing a filter leaves you stranded mid-list looking at
  // different content.
  useEffect(() => { try { if (scrollRef.current) scrollRef.current.scrollTo({ top: 0 }); } catch (e) {} setMapPreview(null); setEventPreview(null); }, [cat, sub, vibe, intent, searchRadius, screen, activeBadge]);
  // Reset the explore list back to 5 whenever a new result set loads or search mode flips.
  useEffect(() => { setVisibleCount(5); }, [places, searchMode]);
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
  // Pooled, anonymous engagement log. One fire-and-forget row per action into a
  // shared Supabase "events" table — this is the proprietary signal Google can't
  // give us (what locals actually like, save, and share). Never throws, never
  // blocks the UI, and only writes when a backend is configured.
  function logEvent(action, place, extra) {
    try {
      if (!supabase) return;
      const row = {
        action,
        place_id: (place && place.id) || (extra && extra.place_id) || null,
        place_name: (place && place.name) || null,
        device_id: deviceId(),
        user_id: user ? user.id : null,
        meta: extra || null,
      };
      supabase.from("events").insert(row).then(() => {}, () => {});
    } catch (e) {}
  }
  function toggleLike(e, p) {
    e.stopPropagation();
    const wasLiked = !!liked[p.id];
    const nextLiked = { ...liked }; const nextDis = { ...disliked };
    if (wasLiked) { delete nextLiked[p.id]; }
    else {
      nextLiked[p.id] = true; delete nextDis[p.id];
      recordSignal(p, "like");
      logEvent("like", p);
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
    else { nextDis[p.id] = true; delete nextLiked[p.id]; recordSignal(p, "dislike"); logEvent("dislike", p); }
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
        body: JSON.stringify({ lat: center.lat, lng: center.lng, city: locName, radius: Math.round((searchRadius || 24140) / 1609.34) }),
      });
      const data = await res.json();
      setEventsUnavailable(!!data.unavailable);
      setEventsError(!!data.error);
      setEventCounts(data && data.counts ? data.counts : null);
      try { if (data && data.counts) console.log("[wayfind events]", data.counts, "total", (data.events || []).length); } catch (e) {}
      const evs = data && Array.isArray(data.events) ? data.events : [];
      setEvents(evs);
      if (!data.unavailable && !data.error && evs.length === 0) logEvent("events_none", null, { loc: locName || "", lat: center.lat, lng: center.lng });
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
    const need = list.filter((p) => !seeded[p.id]).slice(0, 3);
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
      if (pl && pl.length) { setSharedList(pl); setScreen("shared"); logEvent("share_open", null, { kind: "list", n: pl.length }); }
    } else if (placeId) {
      logEvent("share_open", null, { kind: "place", place_id: placeId });
      (async () => {
        const p = await fetchPlaceById(placeId);
        if (p) openDetail(p);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const listsHydrated = useRef(false);
  useEffect(() => {
    // Skip the first run so default empty lists never overwrite real saved data
    // before the load effect above has hydrated from localStorage.
    if (!listsHydrated.current) { listsHydrated.current = true; return; }
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
        if (!cancelled) { setPlaces(results); loadBlurbs(results); if (!results || results.length === 0) logEvent("places_none", null, { loc: locName || "", cat, lat: center.lat, lng: center.lng }); }
      } catch (e) {
        if (!cancelled) { setErr("We couldn't load spots right now. Try again in a moment."); setPlaces([]); }
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
    if (diceRouteRef.current) { diceRouteRef.current = false; setSurpriseLoading(false); return; }
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
            icon: w.icon, img: w.img, label: w.label, warm: w.warm, wet: w.wet,
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
        if (!cancelled) {
          setForyouEvents(evs.slice(0, 8));
          setLibraryEvents(evs.filter((e) => e && e.civic).slice(0, 6));
        }
      } catch { if (!cancelled) { setForyouEvents([]); setLibraryEvents([]); } }
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

  function jumpToArea(a) {
    manualRef.current = true;
    setSearchMode(false);
    setCenter({ lat: a.lat, lng: a.lng, name: a.name });
    setLocName(a.name);
    setSearchRadius(a.radius || 24140);
    setQuery("");
    setSuggestions([]);
    try { if (scrollRef.current) scrollRef.current.scrollTo({ top: 0 }); } catch (e) {}
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
    if (!saveTarget) return;
    setLists((prev) => {
      const l = prev[listId];
      if (!l) return prev;
      const has = l.places.some((p) => p.id === saveTarget.id);
      return { ...prev, [listId]: { ...l, places: has ? l.places.filter((p) => p.id !== saveTarget.id) : [...l.places, saveTarget] } };
    });
    setSaveTarget(null);
  }
  // One-tap save straight to Favorites from a card heart.
  function quickSaveFavorite(p) {
    if (!p) return;
    const fav = lists.favorites || { id: "favorites", name: "Favorites", emoji: "❤️", places: [] };
    const has = fav.places.some((x) => x.id === p.id);
    setLists((prev) => {
      const f = prev.favorites || { id: "favorites", name: "Favorites", emoji: "❤️", places: [] };
      const h = f.places.some((x) => x.id === p.id);
      return { ...prev, favorites: { ...f, places: h ? f.places.filter((x) => x.id !== p.id) : [...f.places, p] } };
    });
    showToast(has ? "Removed from Favorites" : "❤️ Saved to Favorites");
    if (!has) logEvent("save", p);
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
    const existed = !!lists[key];
    setLists((prev) => {
      if (prev[key]) { const next = { ...prev }; delete next[key]; return next; }
      return { ...prev, [key]: { id: key, name: hook.themeTitle || hook.hook || "Saved list", emoji: hook.emoji || "✨", places: places.map((x) => x) } };
    });
    showToast(existed ? "Removed from your lists" : "❤️ Saved to your lists");
  }
  // Heart on a recommendation card: like it AND save the full list to Favorites.
  function onHookHeart(hookId) {
    toggleHookLike(hookId);
    const h = (hookCards || []).find((x) => x.id === hookId);
    if (!h) return;
    const allSrc = [...(suggested || []), ...places].filter(Boolean);
    const pls = placesForHook(h, allSrc);
    if (pls.length) saveHookList(h, pls);
  }
  const isSaved = (id) => Object.values(lists).some((l) => l.places.some((p) => p.id === id));

  function createList() {
    const name = newName.trim();
    if (!name) return;
    const id = "list_" + Date.now();
    setLists((prev) => ({ ...prev, [id]: { id, name, emoji: newEmoji, places: [] } }));
    setNewName(""); setNewEmoji("⭐"); setNewListOpen(false);
  }
  function deleteList(id) {
    if (id === "favorites") return;
    setLists((prev) => { const next = { ...prev }; delete next[id]; return next; });
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
    logEvent("share", null, { kind: "list", n: places.length, title: title || "" });
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
    ? [...places].filter((p) => sliderMi >= 30 || p.distMi == null || p.distMi <= sliderMi).sort((a, b) => (a.distMi ?? 1e12) - (b.distMi ?? 1e12))
    : [...places].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));

  const exploreList = (
    <>
      {/* v3.7 Phase 2: "Good evening" header (greeting, weather, Pick for me, Experiences button, experience pills) hidden per request. The ranked list below is computed from the same place data, unaffected. Experiences moved to the ✨ Nearby control in the sort row. */}
      <div style={{ padding: "10px 2px 6px" }}>
        {loading ? <Loader label="Finding the best spots" pad="0" /> : (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.3px" }}>{searchLabel || picksHeader(cat)}</div>
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setSortBy("best")} style={{ padding: "6px 14px", borderRadius: 999, border: `1.5px solid ${sortBy === "best" ? C.accent : C.border}`, background: sortBy === "best" ? C.accent : "transparent", color: sortBy === "best" ? "#0D1117" : C.light, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>⭐ Best</button>
            <button onClick={() => { if (sortBy !== "near") { setSortBy("near"); setSliderMi(Math.min(30, Math.max(1, Math.round(searchRadius / 1609.34)))); setRadiusOpen(true); } else { setRadiusOpen((o) => !o); } }} style={{ padding: "6px 14px", borderRadius: 999, border: `1.5px solid ${sortBy === "near" ? C.accent : C.border}`, background: sortBy === "near" ? C.accent : "transparent", color: sortBy === "near" ? "#0D1117" : C.light, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>📍 Closest</button>
            <button onClick={() => setShowNearbyExp((o) => !o)} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 999, border: `1.5px solid ${showNearbyExp ? C.accent : C.border}`, background: showNearbyExp ? C.adim : "transparent", color: showNearbyExp ? C.accent : C.light, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Refine {showNearbyExp ? "▲" : "▼"}</button>
          </div>
          {sortBy === "near" && radiusOpen && (
            <div style={{ marginTop: 10 }}><RadiusSlider mi={sliderMi} onChange={setSliderMi} where={locName ? locName.split(",")[0] : "you"} /></div>
          )}
          {showNearbyExp && (
            <div style={{ marginTop: 10, padding: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 800, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.4px" }}>How far are you willing to go?</div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                {[{ label: "5 mi", val: 8047 }, { label: "10 mi", val: 16093 }, { label: "15 mi", val: 24140 }, { label: "20 mi", val: 32187 }, { label: "30 mi", val: 48280 }, { label: "50 mi", val: 80467 }].map((r) => {
                  const on = searchRadius === r.val;
                  return (
                    <button key={r.val} onClick={() => setSearchRadius(r.val)} style={{ flexShrink: 0, padding: "9px 16px", borderRadius: 12, border: `1.5px solid ${on ? C.accent : C.border}`, background: on ? C.accent : C.panel, color: on ? "#fff" : C.light, fontSize: 13.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{r.label}</button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 800, margin: "16px 0 8px", textTransform: "uppercase", letterSpacing: "0.4px" }}>Curated experiences near you</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {HOME_CHIPS.map((k) => {
                  const e = EXPERIENCES[k];
                  if (!e) return null;
                  return (
                    <button key={k} onClick={() => { setShowNearbyExp(false); openExperience(k); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: C.panel, color: C.light, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      <span>{e.icon}</span><span>{e.label}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}><b style={{ color: C.light }}>Best</b> = star rating weighted by number of reviews, so trusted favorites rank above lightly reviewed spots.</div>
            </div>
          )}
        </div>
      )}
      {err && <div style={{ color: C.red, fontSize: 13, padding: "4px 2px 12px" }}>{err}</div>}
      {!loading && !err && view.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{CAT_ICONS[cat]}</div>
          <strong style={{ display: "block", color: C.light }}>Nothing here yet</strong>
          <span style={{ fontSize: 13 }}>We're still adding spots in your area. Try another category nearby.</span>
        </div>
      )}
      {view.slice(0, 3).map((p, i) => (
        <PlaceCard key={p.id} p={p} rank={i + 1} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} line={blurbs[p.id]} onBadge={openExperience} />
      ))}
      {view.length > 3 && hookCards.length > 0 && (
        <HooksBanner hooks={hookCards} likedIds={hookLikes} totalLiked={hookLikes.size} onOpen={openHook} onLike={onHookHeart} allPlaces={[...(suggested || []), ...places].filter(Boolean)} isDesktop={isDesktop} />
      )}
      {view.slice(3, visibleCount).map((p, i) => (
        <PlaceCard key={p.id} p={p} rank={i + 4} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} line={blurbs[p.id]} onBadge={openExperience} />
      ))}
      {!loading && view.length > visibleCount && (
        <div style={{ padding: "2px 2px 10px" }}>
          <div style={{ height: 1, background: C.border, margin: "0 0 12px" }} />
          <button onClick={() => setVisibleCount((c) => c + 5)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, border: "none", background: "linear-gradient(180deg, #FB923C 0%, #F97316 52%, #EA580C 100%)", color: "#fff", fontSize: 14.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(249,115,22,.4)" }}>
            Wayfind 5 more spots
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}><path d="M5 12h13M13 6l6 6-6 6" /></svg>
          </button>
          <div style={{ textAlign: "center", fontSize: 11.5, color: C.muted, marginTop: 9 }}>More spots worth your time nearby</div>
        </div>
      )}
    </>
  );

  return (
    <div style={shell}>
    <div style={{ ...wrap, maxWidth: isDesktop ? 1040 : 480 }}>
      <style>{`@keyframes wfpulse{0%,100%{transform:scale(.8);opacity:.45}50%{transform:scale(1.08);opacity:1}}@keyframes wfdot{0%,80%,100%{opacity:.25}40%{opacity:1}}@keyframes wfbob{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.06)}}`}</style>
      {/* Header */}
      <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "12px 14px", paddingTop: "max(12px, env(safe-area-inset-top))", flexShrink: 0, position: "relative", zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <img src="/wordmark.png" alt="wayfind" onClick={openSuggested} style={{ height: 30, width: "auto", display: "block", cursor: "pointer" }} />
            {locName && <span style={{ fontSize: 13, fontWeight: 400, color: C.muted, marginLeft: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>· {locName}</span>}
            <span style={{ fontSize: 9, fontWeight: 600, color: C.muted, opacity: 0.5, marginLeft: 4 }}>{BUILD}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {supabase && (user ? (
              <button onClick={() => setAccountOpen(true)} aria-label="Account" title={user.email || "Signed in"} style={{ flexShrink: 0, width: 34, height: 34, borderRadius: "50%", border: `1px solid ${C.border}`, background: C.card, color: C.accent, fontSize: 14, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" }}>{(user.email || "?").slice(0, 1)}</button>
            ) : (
              <button onClick={() => setAuthOpen(true)} style={{ flexShrink: 0, fontSize: 13, fontWeight: 800, padding: "7px 14px", borderRadius: 999, cursor: "pointer", background: C.card, color: C.accent, border: `1px solid ${C.accent}` }}>Sign in</button>
            ))}
            <button onClick={shareApp} aria-label="Share Wayfind" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, fontSize: 15, fontWeight: 700, borderRadius: 999, cursor: "pointer", background: "transparent", color: C.muted, border: `1px solid ${C.border}` }}>{shareCopied ? "✓" : "↗"}</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, position: "relative" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 15, pointerEvents: "none", opacity: 0.85 }}>🔍</span>
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitSearch()}
              onBlur={() => setTimeout(() => setSuggestions([]), 150)}
              placeholder="Search a place or city"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px 12px 38px", background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 14, color: C.text, fontSize: 15, outline: "none" }}
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
          <button onClick={submitSearch} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg, #FB923C 0%, #F97316 52%, #EA580C 100%)", border: "none", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 800, padding: "0 16px", height: 48, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 2px 10px rgba(249,115,22,.4)" }}>Wayfind It</button>
        </div>
        {screen === "suggested" && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, flexShrink: 0 }}>Featured:</span>
          {FEATURED_AREAS.map((a) => (
            <button key={a.name} onClick={() => jumpToArea(a)} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.card, color: C.light, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              <span>📍</span>{a.short}
            </button>
          ))}
        </div>
        )}
      </div>

      {/* Category tabs (Explore + Map). Hidden on home, where the app-tile grid replaces it. */}
      {screen !== "saved" && screen !== "shared" && screen !== "events" && screen !== "experience" && screen !== "surprise" && screen !== "suggested" && (
        screen === "map" ? (
          /* v4.4: map categories as one horizontal scrollable chip row, so the map gets the height. */
          <div style={{ display: "flex", gap: 8, padding: "8px 12px", background: C.panel, flexShrink: 0, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            {CATEGORIES.map((c) => {
              const cc = CAT_COLOR[c.id] || { c: C.accent, dim: C.adim };
              const on = cat === c.id;
              return (
                <button key={c.id} onClick={() => { setCat(c.id); setSub("all"); setVibe("all"); setQuickFilter(null); setSearchMode(false); setSearchLabel(""); }} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, border: `1.5px solid ${on ? cc.c : C.border}`, background: on ? cc.dim : "transparent", color: on ? cc.c : C.light, fontSize: 13, fontWeight: on ? 800 : 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 15, lineHeight: 1 }}>{CAT_ICONS[c.id] || "📍"}</span>
                  {c.label.replace(/^\S+\s/, "")}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 7, padding: "10px 14px", background: C.panel, flexShrink: 0, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <button key="surprise" onClick={openSurprise} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 22, border: `1.5px solid ${C.purple}`, background: screen === "surprise" ? C.purple : "transparent", color: screen === "surprise" ? "#0D1117" : C.purple, fontSize: 13.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>🎁 Surprise Me</button>
            {CATEGORIES.map((c) => {
              const cc = CAT_COLOR[c.id] || { c: C.accent, dim: C.adim };
              const on = cat === c.id && screen !== "surprise" && screen !== "suggested";
              return (
                <button key={c.id} onClick={() => { pickCat(c.id); }} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 22, border: `1.5px solid ${on ? cc.c : C.border}`, background: on ? cc.dim : "transparent", color: on ? cc.c : C.light, fontSize: 13.5, fontWeight: on ? 700 : 600, cursor: "pointer", whiteSpace: "nowrap" }}>{c.label}</button>
              );
            })}
          </div>
        )
      )}

      {/* Sub-filter row. v3.8: Explore shows it as 4-across tiles; on the Map it is moved onto the map as a bottom overlay (see map render below). */}
      {screen === "explore" && subs.length > 0 && (
        <div style={{ display: "flex", gap: 7, padding: "2px 14px 10px", background: C.panel, flexShrink: 0, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {subs.map((s) => (
            <button key={s.id} onClick={() => pickSub(s.id)} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 999, border: `1.5px solid ${sub === s.id ? C.accent : C.border}`, background: sub === s.id ? C.accent : C.card, color: sub === s.id ? "#fff" : C.light, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{s.label}</button>
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
                  <MapView places={mapMode === "events" ? [] : view} events={mapEvents} center={center} category={cat} deviceLoc={deviceLoc} onSelect={(p) => setMapPreview(p)} onSelectEvent={(e) => { setMapPreview(null); setEventPreview(e); }} />
                  <div style={{ position: "absolute", top: 12, left: 12, zIndex: 5, display: "flex", background: "rgba(22,27,34,.82)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: `1px solid ${C.border}`, borderRadius: 999, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,.45)" }}>
                    <button onClick={() => setMapMode("places")} style={{ padding: "7px 15px", fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer", background: mapMode === "places" ? C.accent : "transparent", color: mapMode === "places" ? "#fff" : C.light }}>Places</button>
                    <button onClick={() => { setMapMode("events"); if (!events) loadEvents(); }} style={{ padding: "7px 15px", fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer", background: mapMode === "events" ? C.accent : "transparent", color: mapMode === "events" ? "#fff" : C.light }}>🎟️ Events</button>
                  </div>
                  {mapMode === "places" && (
                    <div style={{ position: "absolute", top: 12, right: 12, zIndex: 5, background: "rgba(22,27,34,.82)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "8px 10px", boxShadow: "0 4px 16px rgba(0,0,0,.45)", display: "flex", flexDirection: "column", gap: 5 }}>
                      {[["#FBBF24", "Top pick"], ["#4C8DFF", "Open"], ["#5B6675", "Closed"]].map((row) => (
                        <div key={row[1]} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: row[0], flexShrink: 0, boxShadow: "0 0 0 1px rgba(0,0,0,.3)" }} />
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: C.light, whiteSpace: "nowrap" }}>{row[1]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {mapMode === "events" && (
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 26, zIndex: 5, padding: "0 12px" }}>
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
                  {mapMode === "places" && subs.length > 0 && !mapPreview && (
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 26, zIndex: 5, padding: "0 12px" }}>
                      <div style={{ display: "flex", gap: 6, overflowX: "auto", background: "rgba(13,17,23,.92)", border: `1px solid ${C.border}`, borderRadius: 14, padding: 8, WebkitOverflowScrolling: "touch" }}>
                        {subs.map((s) => (
                          <button key={s.id} onClick={() => pickSub(s.id)} style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 10, border: "none", cursor: "pointer", background: sub === s.id ? C.accent : "transparent", color: sub === s.id ? "#fff" : C.light, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>{s.label}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {mapMode === "places" && mapPreview && (() => {
                    const mp = mapPreview;
                    const sl = scoreLabel(mp.wfScore);
                    const opensLater = mp.openNow === false && mp.nextOpen && mp.nextOpen.today;
                    const openList = (view || []).filter((x) => x && x.openNow === true && x.distMi != null);
                    const closestOpen = openList.length ? openList.reduce((a, b) => (b.distMi < a.distMi ? b : a)) : null;
                    let tag = null;
                    if (closestOpen && closestOpen.id === mp.id) tag = { t: "Closest open spot", c: C.green };
                    else if (mp.distMi != null && mp.distMi >= 25 && (mp.rating || 0) >= 4.5) tag = { t: "Worth the drive", c: C.gold };
                    return (
                      <div style={{ position: "absolute", left: 12, right: 12, bottom: 22, zIndex: 6 }}>
                        <div style={{ position: "relative", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 34px rgba(0,0,0,.6)" }}>
                          <div onClick={() => openDetail(mp)} style={{ display: "flex", cursor: "pointer", minWidth: 0 }}>
                            <FallbackImg src={mp.photo} icon="📍" style={{ width: 96, height: 96, objectFit: "cover", flexShrink: 0, display: "block" }} />
                            <div style={{ padding: "10px 12px", minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 14.5, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 22 }}>{mp.name}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 4 }}>
                                {sl && <span style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}>{sl.word}</span>}
                                {mp.rating && <span style={{ color: "#F59E0B", fontSize: 12 }}>★ {mp.rating}</span>}
                                {mp.openNow === true && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.green }}>Open</span>}
                                {mp.openNow === false && <span style={{ fontSize: 11.5, fontWeight: 700, color: opensLater ? C.gold : C.red }}>{opensLater ? mp.nextOpen.label : "Closed"}</span>}
                                {mp.distMi != null && <span style={{ fontSize: 11.5, color: C.muted }}>· {mp.distMi.toFixed(1)} mi</span>}
                              </div>
                              {tag && <div style={{ fontSize: 11, fontWeight: 800, color: tag.c, marginTop: 5 }}>{tag.t}</div>}
                              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.accent, marginTop: tag ? 4 : 5 }}>See details →</div>
                            </div>
                          </div>
                          <button onClick={(ev) => { ev.stopPropagation(); setMapPreview(null); }} aria-label="Dismiss" style={{ position: "absolute", top: 7, right: 7, width: 24, height: 24, borderRadius: 999, border: "none", background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 13, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                        </div>
                      </div>
                    );
                  })()}
                  {mapMode === "events" && eventPreview && (() => {
                    const ev = eventPreview;
                    const dl = ev.date ? (() => { try { return new Date(ev.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); } catch { return ev.date; } })() : "";
                    return (
                      <div style={{ position: "absolute", left: 12, right: 12, bottom: 22, zIndex: 6 }}>
                        <div style={{ position: "relative", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 34px rgba(0,0,0,.6)" }}>
                          <div onClick={() => openVenue(ev)} style={{ display: "flex", cursor: "pointer", minWidth: 0 }}>
                            <FallbackImg src={ev.image} icon="🎫" style={{ width: 96, height: 96, objectFit: "cover", flexShrink: 0, display: "block" }} />
                            <div style={{ padding: "10px 12px", minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 14.5, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 22 }}>{ev.name}</div>
                              {(dl || ev.time) && <div style={{ fontSize: 11.5, fontWeight: 700, color: C.accent, marginTop: 4 }}>{dl}{ev.time ? " · " + ev.time : ""}</div>}
                              {ev.venue && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {ev.venue}</div>}
                              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.accent, marginTop: 5 }}>View venue →</div>
                            </div>
                          </div>
                          <button onClick={(ev2) => { ev2.stopPropagation(); setEventPreview(null); }} aria-label="Dismiss" style={{ position: "absolute", top: 7, right: 7, width: 24, height: 24, borderRadius: 999, border: "none", background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 13, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                        </div>
                      </div>
                    );
                  })()}
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
          // ── HERO PICK ──────────────────────────────────────────────────────
          // One standout to greet you. The feed is already tuned to time of day
          // and today's weather upstream, so the hero draws from that tuned list
          // and respects the active intent chip. Which angle greets you
          // alternates by time bucket — the top-ranked pick in some buckets, a
          // strong but less-obvious gem in others — so morning and afternoon
          // never open on the same card. It is deterministic within a bucket, so
          // it does not reshuffle on you; tapping "another angle" cycles between
          // the two without refetching anything.
          const heroBucket = h < 11 ? 0 : h < 15 ? 1 : h < 17 ? 2 : h < 22 ? 3 : 4;
          // Trust fix (v4.2): the hero must be somewhere you can actually go right now.
          // Prefer places confirmed open; if none are confirmed open, fall back to
          // unknown-status places; only if neither exists do we surface a closed place,
          // and the badge below drops the "start here" promise in that case.
          const heroOpenNow = displayList.filter((p) => p && p.openNow === true);
          const heroUnknown = displayList.filter((p) => p && p.openNow == null);
          const heroBase = heroOpenNow.length ? heroOpenNow : (heroUnknown.length ? heroUnknown : displayList.filter(Boolean));
          const heroTop = heroBase.length ? heroBase[0] : null;
          const heroGem = heroBase.length >= 3
            ? (heroBase.slice(2, 8).reduce((b, p) => (!b || (p.rating || 0) > (b.rating || 0) ? p : b), null) || heroBase[2])
            : null;
          let heroOrder = (heroBucket % 2 === 0) ? [heroTop, heroGem] : [heroGem, heroTop];
          heroOrder = heroOrder.filter((p, i, a) => p && a.findIndex((x) => x && x.id === p.id) === i);
          const heroPick = heroOrder.length ? heroOrder[heroNonce % heroOrder.length] : null;
          const heroSl = heroPick ? scoreLabel(heroPick.wfScore) : null;
          const heroHook = heroPick ? hookCards.find((hk) => hk && hk.placeId === heroPick.id) : null;
          const heroReason = heroPick ? ((heroHook && heroHook.hook) ? heroHook.hook : (blurbs[heroPick.id] || "")) : "";
          const heroIsGem = !!(heroPick && heroGem && heroPick.id === heroGem.id && (!heroTop || heroGem.id !== heroTop.id));
          // Honest hero badge: only say "start here" when the place is genuinely open now.
          // If it opens later today, set that expectation instead of implying it is ready.
          // If status is unknown or it is closed, fall back to a neutral "top pick" label.
          const heroOpenConfirmed = !!(heroPick && heroPick.openNow === true);
          const heroOpensLater = !!(heroPick && heroPick.openNow === false && heroPick.nextOpen && heroPick.nextOpen.today);
          let heroBadgeIcon = heroIsGem ? "💎" : "📍";
          let heroBadgeText = heroIsGem ? "Hidden gem nearby" : "Top pick nearby";
          if (heroOpenConfirmed) { heroBadgeIcon = heroIsGem ? "💎" : "✨"; heroBadgeText = heroIsGem ? "Hidden gem · open now" : "Open now"; }
          else if (heroOpensLater) { heroBadgeIcon = "⏳"; heroBadgeText = "Worth the wait · " + heroPick.nextOpen.label; }
          // v4.6: tighter, more confident reason line. Drops the rating parenthetical and the
          // distance (both already shown above) and sharpens the weather and time fragments.
          const whyPick = h < 11 ? "morning" : h < 15 ? "lunch" : h < 17 ? "afternoon" : h < 22 ? "evening" : "late-night";
          const heroWhy = [];
          if (heroPick) {
            if (heroOpenConfirmed) heroWhy.push("open now");
            if (heroPick.rating != null && heroPick.rating >= 4.5) heroWhy.push("loved locally");
            else if (heroSl && heroSl.word) heroWhy.push(heroSl.word.toLowerCase() + " rated");
            if (weather && weather.temp != null && weather.temp >= 58 && weather.temp <= 92 && !(weather.label && /rain|storm|snow|sleet/i.test(weather.label))) heroWhy.push("great weather match");
            heroWhy.push("strong " + whyPick + " pick");
          }
          const feedList0 = heroPick ? displayList.filter((p) => p && p.id !== heroPick.id) : displayList;
          const feedList = sortBy === "near" ? feedList0.filter((p) => p && (sliderMi >= 30 || p.distMi == null || p.distMi <= sliderMi)) : feedList0;
          // Trust fix (v4.3): closed places no longer hold the top slots. Sort by the
          // chosen order first (score for Best, distance for Closest), then stably push
          // open-now to the top, unknown-status next, opens-later below that, and closed
          // last. Closed spots still appear, just never in the most valuable positions.
          const homeOpenRank = (p) => !p ? 4 : p.openNow === true ? 0 : p.openNow == null ? 1 : (p.nextOpen && p.nextOpen.today) ? 2 : 3;
          const homeBaseSorted = sortBy === "near" ? [...feedList].sort((a, b) => (a.distMi ?? 1e12) - (b.distMi ?? 1e12)) : [...feedList];
          const homeFeed = homeBaseSorted.sort((a, b) => homeOpenRank(a) - homeOpenRank(b));
          return (
            <div style={isDesktop ? { display: "flex", gap: 28, alignItems: "flex-start", maxWidth: 1000, margin: "0 auto" } : {}}>
              {/* LEFT column on desktop: intent chips + hooks + feed */}
              <div style={{ flex: 1, minWidth: 0, maxWidth: isDesktop ? 600 : undefined }}>
              {/* App-tile navigation grid: replaces the scrolling category row on home. Each tile opens its own sheet. */}
              <div style={{ marginBottom: 16 }}>
                <button onClick={() => setMenuSheet("menu")} style={{ width: "100%", borderRadius: 18, border: `1.5px solid ${C.accent}`, background: `linear-gradient(150deg, ${C.adim} 0%, ${C.card} 70%)`, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", marginBottom: 12 }}>
                  <span style={{ width: 32, height: 32, flexShrink: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 4 }}>
                    <span style={{ background: C.accent, borderRadius: 3 }} />
                    <span style={{ background: C.accent, borderRadius: 3, opacity: 0.65 }} />
                    <span style={{ background: C.accent, borderRadius: 3, opacity: 0.65 }} />
                    <span style={{ background: C.accent, borderRadius: 3 }} />
                  </span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 17, fontWeight: 800 }}>What are you in the mood for?</div>
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>Food, nightlife, beaches, and more</div>
                  </div>
                  <span style={{ marginLeft: "auto", color: C.accent, fontSize: 20 }}>›</span>
                </button>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 2px 9px" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: C.muted }}>Discover {locName ? locName.split(",")[0] : "your area"}</div>
                  {weather && (
                    <button onClick={() => setMenuSheet("weather")} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 10px 3px 6px", cursor: "pointer" }}>
                      <img src={"/wx/" + (weather.img || "cloudy") + ".png"} alt="" style={{ height: 18, width: "auto", display: "block" }} />
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{weather.temp}°</span>
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {[{ icon: "🎁", label: "Surprise", go: openSurprise }, { icon: "📍", label: "Nearby", go: () => setMenuSheet("explore") }, { icon: "✨", label: "Occasions", go: () => setMenuSheet("experiences") }, { icon: "📅", label: "Events", go: () => setMenuSheet("community") }].map((t) => (
                    <button key={t.label} onClick={t.go} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: "11px 3px", borderRadius: 14, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                      <span style={{ fontSize: 20, lineHeight: 1 }}>{t.icon}</span>
                      <span style={{ whiteSpace: "nowrap" }}>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {!suggestedLoading && suggested !== null && heroPick && (
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent, margin: "2px 2px 8px" }}>Your next move</div>
              )}
              {!suggestedLoading && suggested !== null && heroPick && (
                <div style={{ marginBottom: 16, border: `1.5px solid ${C.accent}`, borderRadius: 18, overflow: "hidden", background: `linear-gradient(160deg, rgba(255,150,70,.10) 0%, ${C.card} 60%)`, boxShadow: "0 6px 24px rgba(0,0,0,.35)" }}>
                  <div onClick={() => openDetail(heroPick)} style={{ cursor: "pointer" }}>
                    <div style={{ position: "relative" }}>
                      <FallbackImg src={heroPick.photo} icon="📍" style={{ width: "100%", height: 185, objectFit: "cover", display: "block" }} />
                      <div style={{ position: "absolute", top: 12, left: 12, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,.62)", border: `1px solid ${C.accent}80`, borderRadius: 999, padding: "5px 11px", backdropFilter: "blur(4px)" }}>
                        <span style={{ fontSize: 12 }}>{heroBadgeIcon}</span>
                        <span style={{ fontSize: 10, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: "0.7px" }}>{heroBadgeText}</span>
                      </div>
                    </div>
                    <div style={{ padding: 16 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{heroPick.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        {heroSl && <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{heroSl.word}</span>}
                        {heroSl && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>{heroSl.s}/10</span>}
                        {heroPick.rating && <span style={{ color: "#F59E0B", fontSize: 13 }}>★ {heroPick.rating}</span>}
                        {heroPick.reviews != null && <span style={{ fontSize: 12, color: C.muted }}>· {heroPick.reviews.toLocaleString()} reviews</span>}
                        {heroPick.openNow === true && <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>· Open now</span>}
                        {heroPick.openNow === false && <span style={{ fontSize: 12, fontWeight: 700, color: heroPick.nextOpen && heroPick.nextOpen.today ? C.gold : C.red }}>· {heroPick.nextOpen && heroPick.nextOpen.today ? heroPick.nextOpen.label : "Closed"}</span>}
                        {heroPick.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {heroPick.distMi.toFixed(1)} mi</span>}
                      </div>
                      {heroWhy.length > 0 && <div style={{ fontSize: 13.5, color: C.light, lineHeight: 1.5, marginTop: 10 }}><span style={{ color: C.accent, fontWeight: 800 }}>Why: </span>{heroWhy.slice(0, 4).join(" · ")}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, padding: "0 16px 16px" }}>
                    <button onClick={() => openDetail(heroPick)} style={{ flex: 2, background: C.accent, color: "#0D1117", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, padding: "13px 0", cursor: "pointer" }}>Take me there →</button>
                    {heroOrder.length > 1 && (
                      <button onClick={() => setHeroNonce((n) => n + 1)} style={{ flex: 1, background: "transparent", color: C.accent, border: `1.5px solid ${C.accent}`, borderRadius: 12, fontSize: 13.5, fontWeight: 800, padding: "13px 0", cursor: "pointer" }}>Another angle</button>
                    )}
                  </div>
                </div>
              )}
              {/* v3.7: mobile inline "You are exploring" card removed — it duplicated the 📍 This area tile sheet. Data is unchanged; it now loads only when the tile is opened. */}
              {/* v4.1: standalone "Happening at the library" card removed from home — this content now lives in the Community tile sheet (menuSheet === "community"). libraryEvents state and fetch are unchanged. */}
              {!isDesktop && foryouEvents && foryouEvents.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>🎟️ Events nearby</div>
                    <span onClick={() => setScreen("events")} style={{ fontSize: 12.5, fontWeight: 700, color: C.accent, cursor: "pointer" }}>See all ↗</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {foryouEvents.slice(0, 6).map((e) => {
                      const f = formatEventDate(e.date, e.time);
                      const evRel = (() => { if (!e.date) return null; const ed = new Date(e.date + "T00:00:00"); const t0 = new Date(); t0.setHours(0, 0, 0, 0); const diff = Math.round((ed - t0) / 86400000); if (diff <= 0) return "Tonight"; if (diff === 1) return "Tomorrow"; if (diff <= 6 && (ed.getDay() === 6 || ed.getDay() === 0)) return "This weekend"; return null; })();
                      return (
                        <div key={e.id} onClick={() => openVenue(e)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 9, cursor: "pointer", minWidth: 0 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: evRel ? C.accent : C.purple, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{evRel ? evRel.toUpperCase() : (f.mo + " " + f.day)}{f.time ? " · " + f.time : ""}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.25, marginBottom: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.name}</div>
                          <div style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {e.venue || e.city || "Nearby"}</div>
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
              {!suggestedLoading && suggested !== null && list.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Your picks</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setSortBy("best")} style={{ padding: "6px 13px", borderRadius: 999, border: `1.5px solid ${sortBy === "best" ? C.accent : C.border}`, background: sortBy === "best" ? C.accent : "transparent", color: sortBy === "best" ? "#0D1117" : C.light, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>⭐ Best</button>
                    <button onClick={() => { if (sortBy !== "near") { setSortBy("near"); setSliderMi(Math.min(30, Math.max(1, Math.round(searchRadius / 1609.34)))); setRadiusOpen(true); } else { setRadiusOpen((o) => !o); } }} style={{ padding: "6px 13px", borderRadius: 999, border: `1.5px solid ${sortBy === "near" ? C.accent : C.border}`, background: sortBy === "near" ? C.accent : "transparent", color: sortBy === "near" ? "#0D1117" : C.light, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>📍 Closest</button>
                  </div>
                </div>
              )}
              {!suggestedLoading && suggested !== null && list.length > 0 && sortBy === "near" && radiusOpen && (
                <div style={{ marginBottom: 10 }}><RadiusSlider mi={sliderMi} onChange={setSliderMi} where={locName ? locName.split(",")[0] : "you"} /></div>
              )}
              {!suggestedLoading && suggested !== null && homeFeed.slice(0, 4).map((p, i) => (
                <PlaceCard key={p.id} p={p} rank={i + 1} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} line={blurbs[p.id]} onBadge={openExperience} />
              ))}
              {hookCards.length > 0 && (() => {
                // v3.7: show exactly two discovery cards — pin Top 5 (the entry into the
                // ranked list), then one rotating provocative hook. The rest weave into
                // the feed below. Title styled to match the "Events nearby" section.
                const t5 = hookCards.find((h) => h.id === "top5");
                const oth = hookCards.filter((h) => h.id !== "top5");
                const bannerHooks = (t5 ? [t5, ...oth] : oth).slice(0, 2);
                if (!bannerHooks.length) return null;
                return (
                  <div style={{ margin: "2px 2px 0" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 8 }}>📍 Near you right now</div>
                    <HooksBanner hooks={bannerHooks} likedIds={hookLikes} totalLiked={hookLikes.size} onOpen={openHook} onLike={onHookHeart} allPlaces={[...(suggested || []), ...places].filter(Boolean)} isDesktop={isDesktop} />
                  </div>
                );
              })()}
              {!suggestedLoading && suggested !== null && (() => {
                const rest = homeFeed.slice(4);
                // v3.7: keep the two banner hooks out of the inline weave so nothing repeats.
                const _t5 = hookCards.find((h) => h.id === "top5");
                const _oth = hookCards.filter((h) => h.id !== "top5");
                const _bannerIds = new Set((_t5 ? [_t5, ..._oth] : _oth).slice(0, 2).map((h) => h.id));
                const inlineHooks = hookCards.filter((h) => !_bannerIds.has(h.id));
                const pm = {};
                [...(suggested || []), ...places].filter(Boolean).forEach((pp) => { if (pp && pp.id) pm[pp.id] = pp; });
                const out = [];
                rest.forEach((p, i) => {
                  if (i > 0 && i % 6 === 0 && inlineHooks.length) {
                    const h = inlineHooks[(Math.floor(i / 6) - 1) % inlineHooks.length];
                    if (h) out.push(<HookSolo key={`hook-${h.id}-${i}`} h={h} place={pm[h.placeId]} liked={hookLikes.has(h.id)} onOpen={openHook} onLike={onHookHeart} />);
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
          const badges = p ? experienceBadges(p).slice(0, 2) : [];
          // v4.6: capitalized identity + state-aware subtitle so a closed pick is never framed as "right now".
          const period = (() => { const hr = new Date().getHours(); return hr < 12 ? "Morning" : hr < 17 ? "Afternoon" : "Evening"; })();
          const sOpen = !!(p && p.openNow === true);
          const sOpensLater = !!(p && p.openNow === false && p.nextOpen && p.nextOpen.today);
          const sSub = sOpen ? "Open now, nearby, and worth your time."
            : sOpensLater ? (p.nextOpen.label + " · a strong pick for a little later.")
            : "A top pick nearby, chosen for rating, distance, and fit.";
          // v5.0: state-aware primary action. Never tell someone to drive to a closed place.
          const openAlt = surprisePool.find((o) => o && o.openNow === true && (!p || o.id !== p.id)) || null;
          const goMaps = () => { if (p && p.mapsUrl) window.open(p.mapsUrl, "_blank", "noopener"); else if (p) openDetail(p); };
          let primaryLabel = "Take me there →";
          let primaryAction = goMaps;
          if (p && !sOpen) {
            if (sOpensLater) { primaryLabel = "Plan for " + p.nextOpen.label.replace(/^opens\s+/i, "") + " →"; primaryAction = goMaps; }
            else { primaryLabel = isSaved(p.id) ? "Saved ✓" : "Save for later →"; primaryAction = () => quickSaveFavorite(p); }
          }
          const sWhy = [];
          if (p) {
            if (sOpen) sWhy.push("open now");
            else if (sOpensLater) sWhy.push("opens " + p.nextOpen.label.replace(/^opens\s+/i, "").trim());
            if (p.rating != null && p.rating >= 4.5) sWhy.push("local favorite");
            else if (sl && sl.word) sWhy.push(sl.word.toLowerCase() + " rated");
            if (p.distMi != null && p.distMi <= 20) sWhy.push("close enough");
            sWhy.push("strong " + period.toLowerCase() + " option");
          }
          return (
            <div>
              <div onClick={() => setScreen("suggested")} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.accent, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: "4px 2px 10px" }}>‹ Back</div>
              <div style={{ paddingBottom: 6 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.text }}>✨ Your {period} Pick</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{sSub}</div>
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
                  <div onClick={() => openDetail(p)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", cursor: "pointer" }}>
                    <FallbackImg src={p.photo} icon="🍽️" style={{ width: "100%", height: 230, objectFit: "cover", display: "block" }} />
                    <div style={{ padding: 16 }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{p.name}</div>
                      {p.address && <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>📍 {p.address}</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        {sl && <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{sl.word}</span>}
                        {sl && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>{sl.s}/10</span>}
                        {p.rating && <span style={{ color: "#F59E0B", fontSize: 13 }}>★ {p.rating}</span>}
                        {p.openNow === true && <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>Open now</span>}
                        {p.openNow === false && <span style={{ fontSize: 12, fontWeight: 700, color: p.nextOpen && p.nextOpen.today ? C.gold : C.red }}>{p.nextOpen && p.nextOpen.today ? p.nextOpen.label : "Closed today"}</span>}
                        {p.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
                      </div>
                      {sWhy.length > 0 && <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5, marginTop: 9 }}><span style={{ color: C.accent, fontWeight: 800 }}>Why: </span>{sWhy.slice(0, 4).join(" · ")}</div>}
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
                  <button onClick={primaryAction} style={{ width: "100%", marginTop: 12, background: C.accent, color: "#0D1117", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 800, padding: "14px 0", cursor: "pointer" }}>{primaryLabel}</button>
                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button onClick={() => shareLink(p.name, (typeof window !== "undefined" ? window.location.origin : "") + "?place=" + encodeURIComponent(p.id), () => { setShareCopied(true); setTimeout(() => setShareCopied(false), 1800); }, "Check out " + p.name + " on Wayfind")} style={{ flex: 1, background: "transparent", color: C.light, border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 13.5, fontWeight: 700, padding: "12px 0", cursor: "pointer" }}>{shareCopied ? "Copied ✓" : "↗ Share"}</button>
                    <button onClick={() => quickSaveFavorite(p)} style={{ flex: 1, background: isSaved(p.id) ? C.adim : "transparent", color: isSaved(p.id) ? C.accent : C.light, border: `1px solid ${isSaved(p.id) ? C.accent : C.border}`, borderRadius: 12, fontSize: 13.5, fontWeight: 800, padding: "12px 0", cursor: "pointer" }}>{isSaved(p.id) ? "♥ Saved" : "♡ Save"}</button>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    {!sOpen && openAlt ? (
                      <button onClick={() => setSurprisePick(openAlt)} style={{ flex: 1, background: "transparent", color: C.green, border: `1.5px solid ${C.green}`, borderRadius: 12, fontSize: 13.5, fontWeight: 800, padding: "12px 0", cursor: "pointer" }}>Find open now</button>
                    ) : (
                      <button onClick={() => openDetail(p)} style={{ flex: 1, background: "transparent", color: C.light, border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 13.5, fontWeight: 700, padding: "12px 0", cursor: "pointer" }}>See details</button>
                    )}
                    <button onClick={() => setSurprisePick(pickSurprise(surprisePool))} style={{ flex: 1, background: "transparent", color: C.light, border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 13.5, fontWeight: 800, padding: "12px 0", cursor: "pointer" }}>✨ Try another</button>
                  </div>
                  {/* v4.6: backup picks split into Open now and For later so closed spots are labeled, not hidden in prime slots. */}
                  {(() => {
                    const others = surprisePool.filter((o) => o && o.id !== p.id);
                    const openG = others.filter((o) => o.openNow === true).slice(0, 3);
                    const laterG = others.filter((o) => o.openNow === false).slice(0, 3);
                    if (!openG.length && !laterG.length) return null;
                    return (
                      <div style={{ marginTop: 22, paddingBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: "0.3px", textTransform: "uppercase", marginBottom: 10 }}>Backup picks</div>
                        {openG.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, color: C.green, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 7 }}>Open now</div>}
                        {openG.map((other) => (
                          <div key={other.id} onClick={() => setSurprisePick(other)} style={{ display: "flex", alignItems: "center", gap: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8, cursor: "pointer" }}>
                            <FallbackImg src={other.photo} icon="🍽️" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{other.name}</div>
                              <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center", flexWrap: "wrap" }}>
                                {other.rating && <span style={{ fontSize: 12, color: "#F59E0B" }}>★ {other.rating}</span>}
                                {other.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {other.distMi.toFixed(1)} mi</span>}
                              </div>
                            </div>
                            <span style={{ color: C.muted, fontSize: 18, flexShrink: 0 }}>›</span>
                          </div>
                        ))}
                        {laterG.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.4px", margin: "12px 0 7px" }}>For later</div>}
                        {laterG.map((other) => (
                          <div key={other.id} onClick={() => setSurprisePick(other)} style={{ display: "flex", alignItems: "center", gap: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8, cursor: "pointer", opacity: 0.82 }}>
                            <FallbackImg src={other.photo} icon="🍽️" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{other.name}</div>
                              <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center", flexWrap: "wrap" }}>
                                {other.rating && <span style={{ fontSize: 12, color: "#F59E0B" }}>★ {other.rating}</span>}
                                {other.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {other.distMi.toFixed(1)} mi</span>}
                                <span style={{ fontSize: 11, fontWeight: 600, color: C.gold }}>{other.nextOpen && other.nextOpen.today ? other.nextOpen.label : "Opens later"}</span>
                              </div>
                            </div>
                            <span style={{ color: C.muted, fontSize: 18, flexShrink: 0 }}>›</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
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
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🎟️</div>
                  <strong style={{ display: "block", color: C.light }}>No events to show right now</strong>
                  <span style={{ fontSize: 13 }}>Check back in a little while.</span>
                  <div onClick={loadEvents} style={{ marginTop: 12, color: C.muted, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Refresh ↻</div>
                </div>
              )}
              {!eventsLoading && !eventsUnavailable && !eventsError && all.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🎟️</div>
                  <strong style={{ display: "block", color: C.light }}>No events in your area yet</strong>
                  <span style={{ fontSize: 13 }}>We're still expanding Wayfind events to your area. Check back soon.</span>
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
      {radiusSheet && (
        <div style={sheetBg} onClick={() => setRadiusSheet(false)}>
          <div style={{ ...sheet, padding: "6px 16px calc(20px + env(safe-area-inset-bottom))", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setRadiusSheet(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ textAlign: "center", marginTop: 4 }}>
              <div style={{ fontSize: 30 }}>📍</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginTop: 4 }}>How far should we look?</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>Search distance from {locName || center.name || "you"}.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 18 }}>
              {[{ mi: 3, v: 4828 }, { mi: 5, v: 8047 }, { mi: 10, v: 16093 }, { mi: 15, v: 24140 }, { mi: 25, v: 40234 }, { mi: 30, v: 48280 }].map((r) => {
                const on = pendingRadius === r.v;
                return (
                  <button key={r.v} onClick={() => setPendingRadius(r.v)} style={{ padding: "16px 8px", borderRadius: 14, border: `1.5px solid ${on ? C.accent : C.border}`, background: on ? C.adim : C.card, color: on ? C.accent : C.light, fontSize: 18, fontWeight: 800, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <span>{r.mi}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: on ? C.accent : C.muted }}>miles</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => { setSearchRadius(pendingRadius); setRadiusSheet(false); }} style={{ width: "100%", marginTop: 18, height: 52, borderRadius: 14, border: "none", background: "linear-gradient(180deg, #FB923C 0%, #F97316 52%, #EA580C 100%)", color: "#fff", fontSize: 15.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(249,115,22,.4)" }}>Search this area</button>
            <div style={{ textAlign: "center", fontSize: 11.5, color: C.muted, marginTop: 10 }}>We only search again when you tap the button, to save data.</div>
          </div>
        </div>
      )}
      {diceChoose && !rolling && (
        <div onClick={() => setDiceChoose(false)} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(13,17,23,.85)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(ev) => ev.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setDiceChoose(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd} style={{ width: "100%", maxWidth: 480, maxHeight: "82vh", overflowY: "auto", overscrollBehaviorY: "contain", transition: SHEET_EASE, background: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, border: `1px solid ${C.border}`, padding: "6px 16px calc(22px + env(safe-area-inset-bottom))" }}>
            <Grabber />
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
        {[{ id: "home", icon: "home", label: "Home" }, { id: "events", icon: "events", label: "Events" }, { id: "map", icon: "map", label: "Map" }, { id: "saved", icon: "saved", label: "Favorites" }].map((s) => {
          const active = (s.id === "home" && (screen === "suggested" || screen === "explore" || screen === "experience" || screen === "surprise")) || s.id === screen;
          return (
          <button key={s.id} onClick={() => { setActiveList(null); if (s.id === "home") { openSuggested(); } else { setScreen(s.id); } }} style={{ flex: 1, padding: "12px 8px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "transparent", border: "none", cursor: "pointer" }}>
            <NavIcon name={s.icon} color={active ? C.accent : C.muted} />
            <span style={{ fontSize: 11, fontWeight: active ? 700 : 600, color: active ? C.accent : C.muted }}>{s.label}</span>
          </button>
          );
        })}
      </div>

      {/* Detail sheet */}
      {detail && (
        <div style={sheetBg} onClick={() => setDetail(null)}>
          <div style={{ ...sheet, overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setDetail(null))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ position: "sticky", top: 0, zIndex: 5, background: C.panel, padding: "10px 12px", paddingTop: "max(10px, env(safe-area-inset-top))", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}` }}>
              <button onClick={() => { logEvent("share", detail, { kind: "place" }); shareLink(detail.name, originUrl("/?place=" + encodeURIComponent(detail.id)), () => showToast("Link copied"), `Want to go to ${detail.name} together? Found it on Wayfind`); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px", borderRadius: 19, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Share spot</button>
              <button onClick={() => quickSaveFavorite(detail)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px", borderRadius: 19, border: `1px solid ${isSaved(detail.id) ? C.accent : C.border}`, background: isSaved(detail.id) ? C.adim : C.card, color: isSaved(detail.id) ? C.accent : C.text, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{isSaved(detail.id) ? "✓ Saved" : "❤️ Save"}</button>
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
              {detail._event && (
                <div style={{ background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 12, padding: "10px 13px", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>🎟️ Event</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1.3 }}>{detail._event.name}</div>
                  {(detail._event.date || detail._event.time) && <div style={{ fontSize: 13, fontWeight: 700, color: C.light, marginTop: 3 }}>{[detail._event.date, detail._event.time].filter(Boolean).join(" · ")}</div>}
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>at {detail.name}</div>
                </div>
              )}
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
                {detail.openNow != null && <button onClick={() => setHoursOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "transparent", border: "none", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 700, color: detail.openNow ? C.green : C.red }}>{detail.openNow ? "Open" : "Closed"} <span style={{ fontSize: 10 }}>{hoursOpen ? "▴" : "▾"}</span></button>}
                {detail.distMi != null && <span style={{ fontSize: 13, color: C.muted }}>· {detail.distMi.toFixed(1)} mi</span>}
              </div>

              {hoursOpen && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
                  {detailExtra && detailExtra.hours && detailExtra.hours.length > 0 ? (
                    detailExtra.hours.map((line, i) => {
                      const parts = line.split(": ");
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, color: C.light, padding: "2px 0" }}>
                          <span style={{ fontWeight: 600, color: C.text }}>{parts[0]}</span>
                          <span style={{ textAlign: "right" }}>{parts.slice(1).join(": ")}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ fontSize: 12.5, color: C.muted }}>{detailExtra ? "Hours not listed for this place." : "Loading hours…"}</div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {experienceBadges(detail, null, 4).map((b) => (
                  <button key={b.key} onClick={() => { setDetail(null); openExperience(b.key); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: C.accent, background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 999, padding: "4px 11px", cursor: "pointer" }}>{b.icon} {b.label}</button>
                ))}
              </div>

              {(() => { const v = placeVibe(detail, weather); if (!v) return null; return (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 6 }}>{v.icon} {v.title}</div>
                  <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5 }}>{v.body}</div>
                </div>
              ); })()}

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
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, marginTop: 7 }}>{(() => {
                  const lead = detail.rating != null && detail.rating >= 4.5 ? "A local favorite" : detail.rating != null && detail.rating >= 4 ? "A well-rated spot" : "A solid pick nearby";
                  const rev = detail.reviews >= 1000 ? " with thousands of reviews" : detail.reviews >= 200 ? " with plenty of reviews" : "";
                  const dist = detail.distMi == null ? "." : detail.distMi <= 5 ? ", and close by." : detail.distMi <= 20 ? ", an easy drive from you." : ", worth the trip.";
                  return lead + rev + dist;
                })()}</div>
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
                  <div style={{ fontSize: 13, color: C.muted }}>The live details above are the key things to know here.</div>
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

              {/* 4. Actions — for a closed place the main action becomes Save, not "go now". */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {detail.openNow === false ? (
                  <>
                    <button onClick={() => { setDetail(null); setSaveTarget(detail); }} style={{ flex: 1, padding: 13, background: C.accent, border: "none", borderRadius: 12, color: "#0D1117", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>❤️ Save for later</button>
                    <a href={detail.mapsUrl} target="_blank" rel="noreferrer" style={{ flex: 1, padding: 13, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 15, fontWeight: 600, textDecoration: "none", textAlign: "center" }}>Directions ↗</a>
                  </>
                ) : (
                  <>
                    <a href={detail.mapsUrl} target="_blank" rel="noreferrer" style={{ flex: 1, padding: 13, background: C.accent, borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>Open in Google Maps ↗</a>
                    <button onClick={() => { setDetail(null); setSaveTarget(detail); }} style={{ flex: 1, padding: 13, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>❤️ Favorite</button>
                  </>
                )}
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
                  {!beachCondLoading && !beachCond && <div style={{ fontSize: 13, color: C.muted }}>Live conditions aren't available right now.</div>}
                </div>
              )}

              <div style={{ marginBottom: 4 }}>
                <button onClick={() => { const n = !showMore; setShowMore(n); if (n) { loadFullInsight(detail, detailExtra); loadVideos(detail); } }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", fontSize: 14, fontWeight: 800, color: C.accent, background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 12, padding: "12px 14px" }}>
                  <span>{showMore ? "Show less" : "✨ Tips, videos & more"}</span>
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
                      <div style={{ fontSize: 13, color: C.muted }}>That's everything we have on this spot for now.</div>
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

              {/* Hours now expand from the Open/Closed status badge near the title. */}

            </div>
          </div>
        </div>
      )}

      {allExpOpen && (
        <div onClick={() => setAllExpOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(ev) => ev.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setAllExpOpen(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd} style={{ background: C.panel, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "82dvh", overflowY: "auto", overscrollBehaviorY: "contain", transition: SHEET_EASE, padding: "6px 16px calc(18px + env(safe-area-inset-bottom))" }}>
            <Grabber />
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
        // Merge the two source lists, but de-dupe by id — a place that appears
        // in both the suggested feed and the nearby search would otherwise show
        // up twice in a themed list.
        const allSrc = (() => {
          const seen = new Set(); const out = [];
          [...(suggested || []), ...places].filter(Boolean).forEach((p) => {
            if (p && p.id && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
          });
          return out;
        })();
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
        // Safety net: no theme should ever render the same place twice.
        themePlaces = themePlaces.filter((p, i, a) => p && p.id && a.findIndex((x) => x && x.id === p.id) === i);

        const MEDALS = { 0: "🥇", 1: "🥈", 2: "🥉" };
        const rankColours = { 0: "#FBBF24", 1: "#CBD5E1", 2: "#CD7F32" };
        const showRank = theme === "top5" || theme === "best";
        const showWarn = theme === "skip";

        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 950, background: C.bg, display: "flex", flexDirection: "column", overflowY: "hidden", alignItems: isDesktop ? "center" : "stretch" }}>
            {/* Gradient hero header */}
            <div style={{ background: `linear-gradient(155deg, ${acc}2A 0%, ${C.bg} 72%)`, borderBottom: `1px solid ${acc}35`, padding: "max(16px, calc(env(safe-area-inset-top) + 12px)) 16px 18px", flexShrink: 0, width: "100%", maxWidth: isDesktop ? 880 : "none", boxSizing: "border-box" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <button onClick={() => setHookDetail(null)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: "none", color: acc, fontSize: 14, fontWeight: 800, cursor: "pointer", padding: 0 }}>‹ Back</button>
                <button
                  onClick={() => { toggleHookLike(hookDetail.id); saveHookList(hookDetail, themePlaces); }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, background: isLiked ? acc + "25" : "transparent", border: `1.5px solid ${isLiked ? acc : C.border}`, borderRadius: 999, padding: "6px 14px", color: isLiked ? acc : C.muted, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
                >
                  {isLiked ? "❤️ Saved to lists" : "🤍 Save to lists"}
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
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px calc(24px + env(safe-area-inset-bottom))", width: "100%", maxWidth: isDesktop ? 880 : "none", boxSizing: "border-box" }}>
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

      {/* Account menu — opens from the header avatar so a tap no longer signs you out by accident */}
      {accountOpen && user && (
        <div style={sheetBg} onClick={() => setAccountOpen(false)}>
          <div style={{ ...sheet, padding: "6px 16px 28px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setAccountOpen(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.adim, border: `1px solid ${C.accent}`, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, textTransform: "uppercase", flexShrink: 0 }}>{(user.email || "?").slice(0, 1)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Signed in</div>
                <div style={{ fontSize: 13, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email || ""}</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
              <span style={{ color: C.accent }}>✓ </span>Your favorites and likes are saved to your account and follow you to any device you sign in on.
            </div>
            <button onClick={() => { setAccountOpen(false); setScreen("saved"); }} style={{ width: "100%", padding: 13, borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10, textAlign: "left" }}>❤️ Your saved spots</button>
            <button onClick={() => { setAccountOpen(false); signOutUser(); }} style={{ width: "100%", padding: 13, borderRadius: 12, border: `1px solid ${C.red}`, background: "transparent", color: C.red, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Sign out</button>
          </div>
        </div>
      )}

      {/* App-tile sheets: opened from the home navigation grid */}
      {menuSheet && (
        <div style={sheetBg} onClick={() => setMenuSheet(null)}>
          <div style={{ ...sheet, padding: "6px 16px 28px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setMenuSheet(null))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            {menuSheet === "menu" && (
              <>
                <SheetHero icon="🧭" title="Browse by category" subtitle={"Pick a category to explore near " + (locName ? locName.split(",")[0] : "you") + "."} color={C.accent} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  {CATEGORIES.map((c) => {
                    const cc = CAT_COLOR[c.id] || { c: C.accent, dim: C.adim };
                    return (
                      <button key={c.id} onClick={() => { setMenuSheet(null); pickCat(c.id); }} style={{ height: 84, borderRadius: 16, border: `1.5px solid ${cc.c}`, background: cc.dim, color: C.text, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 15, fontWeight: 800 }}>
                        <span style={{ fontSize: 26, lineHeight: 1 }}>{CAT_ICONS[c.id] || "📍"}</span>
                        <span>{c.label.replace(/^\S+\s/, "")}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {menuSheet === "community" && (
              <>
                <SheetHero icon="📚" title="Local Events" subtitle="Free local programs and civic events near you." color="#2DD4BF" />
                {libraryEvents && libraryEvents.length > 0 ? (
                  <>
                    {libraryEvents.slice(0, 12).map((e, i) => {
                      const dt = e.date ? new Date(e.date + "T00:00:00") : null;
                      return (
                        <div key={(e.id || e.name || "ev") + "-" + i} onClick={() => { if (e.url) window.open(e.url, "_blank", "noopener"); }} style={{ display: "flex", alignItems: "center", gap: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 13px", marginBottom: 8, cursor: e.url ? "pointer" : "default" }}>
                          <div style={{ flexShrink: 0, width: 44, textAlign: "center" }}>
                            {dt ? (<><div style={{ fontSize: 10.5, fontWeight: 800, color: "#2DD4BF", textTransform: "uppercase", letterSpacing: "0.3px" }}>{dt.toLocaleDateString(undefined, { month: "short" })}</div><div style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1.05 }}>{dt.getDate()}</div></>) : (<div style={{ fontSize: 22 }}>📚</div>)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.name}</div>
                            <div style={{ fontSize: 12, color: C.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.time ? e.time + " · " : ""}{e.venue || "Manatee County Library"}</div>
                          </div>
                          {e.url && <span style={{ color: C.muted, fontSize: 16, flexShrink: 0 }}>›</span>}
                        </div>
                      );
                    })}
                    <div style={{ fontSize: 10.5, color: C.muted, marginTop: 10, textAlign: "center" }}>Manatee County Public Library · via LibCal</div>
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "28px 16px", color: C.muted, fontSize: 13.5, lineHeight: 1.5 }}>No local programs loaded right now. Check back soon for library events, workshops, and civic happenings nearby.</div>
                )}
              </>
            )}
            {menuSheet === "explore" && (
              <>
                <SheetHero icon="📍" title={locName || "Nearby"} subtitle="Open spots near you, ranked best first." color={C.accent} />
                {(() => {
                  const src = (suggested && suggested.length ? suggested : places) || [];
                  if (src.length < 4) return null;
                  const counts = {};
                  src.forEach((p) => { const c = primaryCategory(p); if (c) counts[c] = (counts[c] || 0) + 1; });
                  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2);
                  if (!top.length) return null;
                  const gems = src.filter((p) => (p.rating || 0) >= 4.5).length;
                  const catLine = top.map(([c, n]) => `${c} (${n})`).join(" and ");
                  return (
                    <div style={{ fontSize: 13.5, color: C.light, lineHeight: 1.55, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, marginBottom: 5 }}>The local scene</div>
                      Strongest around here: {catLine}.{gems > 0 ? ` ${gems} spot${gems === 1 ? "" : "s"} sitting at 4.5★ or higher.` : ""}
                    </div>
                  );
                })()}
                <button onClick={() => { setMenuSheet(null); setScreen("explore"); }} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: C.accent, color: "#0D1117", fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>Show me the best spots →</button>
              </>
            )}
            {menuSheet === "pick" && (
              <>
                <SheetHero icon="🎲" title="Pick for me" subtitle="Can't decide? Roll and Wayfind lands you on one great spot nearby. Your rolls are saved below." color={C.accent} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 6 }}>
                  <button onClick={() => rollHomePick(suggested || places || [])} disabled={homeRolling} style={{ width: 84, height: 84, borderRadius: 20, border: `2px solid ${C.accent}`, background: C.adim, fontSize: 42, cursor: homeRolling ? "default" : "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", animation: homeRolling ? "wfbob 0.4s ease-in-out infinite" : "none" }}>{homeRolling ? homeDiceFace : "🎲"}</button>
                  <button onClick={() => rollHomePick(suggested || places || [])} disabled={homeRolling} style={{ padding: "11px 26px", borderRadius: 999, border: "none", background: C.accent, color: "#0D1117", fontSize: 14, fontWeight: 800, cursor: homeRolling ? "default" : "pointer", opacity: homeRolling ? 0.6 : 1 }}>{rollHistory.length ? "Roll again" : "Roll the dice"}</button>
                </div>
                {rollHistory.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Your rolls</div>
                    {rollHistory.map((rp, i) => (
                      <div key={rp.id + "-" + i} onClick={() => { setMenuSheet(null); openDetail(rp); }} style={{ display: "flex", alignItems: "center", gap: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", marginBottom: 7, cursor: "pointer" }}>
                        <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: C.adim, color: C.accent, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{rollHistory.length - i}</span>
                        <FallbackImg src={rp.photo} icon="🍽️" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rp.name}</div>
                          <div style={{ display: "flex", gap: 6, marginTop: 2, alignItems: "center" }}>
                            {rp.rating && <span style={{ fontSize: 11, color: "#F59E0B" }}>★ {rp.rating}</span>}
                            {rp.distMi != null && <span style={{ fontSize: 11, color: C.muted }}>· {rp.distMi.toFixed(1)} mi</span>}
                          </div>
                        </div>
                        <span style={{ color: C.muted, fontSize: 16, flexShrink: 0 }}>›</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {menuSheet === "experiences" && (
              <>
                <SheetHero icon="✨" title="Occasions" subtitle="Pick an occasion and the feed reshapes around it." color={C.gold} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  {INTENTS.map((it) => {
                    const on = intent === it.id;
                    return (
                      <button key={it.id} onClick={() => { setIntent(on ? null : it.id); setMenuSheet(null); }} style={{ height: 76, borderRadius: 16, border: `1.5px solid ${on ? C.accent : C.border}`, background: on ? C.adim : C.card, color: on ? C.accent : C.light, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 14, fontWeight: 800 }}>
                        <span style={{ fontSize: 24, lineHeight: 1 }}>{it.icon}</span>
                        <span>{it.label}</span>
                      </button>
                    );
                  })}
                  <button onClick={() => { const rc = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)]; setMenuSheet(null); pickCat(rc.id); }} style={{ height: 76, borderRadius: 16, border: `1.5px dashed ${C.accent}`, background: C.adim, color: C.accent, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 13, fontWeight: 800 }}>
                    <span style={{ fontSize: 24, lineHeight: 1 }}>🎲</span>
                    <span>Surprise Me</span>
                  </button>
                </div>
              </>
            )}
            {menuSheet === "weather" && weather && (
              <>
                <SheetHero icon="🌤️" title="Weather right now" subtitle={(locName ? locName.split(",")[0] : "Your area") + ", live conditions."} color={C.blue} />
                {(() => { const adv = weatherAdvisory(weather); return adv ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.adim, border: `1px solid ${C.gold}`, borderRadius: 12, padding: "11px 13px", marginBottom: 14 }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{adv.icon}</span>
                    <div style={{ fontSize: 13, color: C.light, lineHeight: 1.45 }}>{adv.text}</div>
                  </div>
                ) : null; })()}
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                  <img src={"/wx/" + (weather.img || "cloudy") + ".png"} alt="" style={{ height: 64, width: "auto", display: "block" }} />
                  <div>
                    <div style={{ fontSize: 38, fontWeight: 800, color: C.text, lineHeight: 1 }}>{weather.temp}°</div>
                    {weather.label && <div style={{ fontSize: 14, color: C.light, marginTop: 4 }}>{weather.label}</div>}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  {weather.feels != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Feels like</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.feels}°</div></div>)}
                  {weather.wind != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Wind</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>💨 {weather.wind} mph</div></div>)}
                  {weather.sunset && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Sunset</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>🌅 {weather.sunset}</div></div>)}
                  {weather.rain != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Rain chance</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.rain}%</div></div>)}
                  {weather.hi != null && weather.lo != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>High / Low</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.hi}° / {weather.lo}°</div></div>)}
                  {weather.humidity != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Humidity</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.humidity}%</div></div>)}
                  {weather.uv != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>UV index</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.uv}{weather.uv >= 8 ? " · high" : weather.uv >= 6 ? " · mod" : ""}</div></div>)}
                  {(() => { const m = moonPhase(new Date()); return (
                    <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px" }}>
                      <span style={{ fontSize: 34, lineHeight: 1 }}>{m.emoji}</span>
                      <div>
                        <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Tonight's moon</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginTop: 2 }}>{m.name}</div>
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{m.illum}% illuminated</div>
                      </div>
                    </div>
                  ); })()}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Save-to-list sheet */}
      {authOpen && (
        <div style={sheetBg} onClick={() => setAuthOpen(false)}>
          <div style={{ ...sheet, padding: "6px 16px 32px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setAuthOpen(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 6 }}>{authMode === "signup" ? "Create your Wayfind account" : "Sign in to Wayfind"}</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>Save your spots so they follow you across devices.</div>

            <button onClick={() => signInWithProvider("google")} style={{ width: "100%", padding: 13, borderRadius: 12, border: `1px solid ${C.border}`, background: "#FFFFFF", color: "#1F2937", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>G</span> Continue with Google
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>or with email</div>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>

            <input type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@email.com"
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 15, marginBottom: 10, outline: "none" }} />
            <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Password"
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 15, marginBottom: 12, outline: "none" }} />
            <button onClick={passwordAuth} disabled={authSending || !authEmail || !authPassword} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: C.accent, color: "#0D1117", fontSize: 15, fontWeight: 800, cursor: authSending || !authEmail || !authPassword ? "default" : "pointer", opacity: authSending || !authEmail || !authPassword ? 0.6 : 1 }}>
              {authSending ? "…" : authMode === "signup" ? "Create account" : "Sign in"}
            </button>
            <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: C.muted }}>
              {authMode === "signup" ? "Already have an account? " : "New here? "}
              <span onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")} style={{ color: C.accent, fontWeight: 700, cursor: "pointer" }}>{authMode === "signup" ? "Sign in" : "Create one"}</span>
            </div>
          </div>
        </div>
      )}
      {saveTarget && (
        <div style={sheetBg} onClick={() => setSaveTarget(null)}>
          <div style={{ ...sheet, padding: "6px 16px 32px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setSaveTarget(null))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
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
          <div style={{ ...sheet, padding: "6px 16px 32px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setNewListOpen(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
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
      <div onTouchStart={start} onTouchMove={move} onTouchEnd={end} style={{ transform: `translateX(${dx}px)`, transition: drag ? "none" : "transform .2s ease", background: C.bg, position: "relative", touchAction: "pan-y" }}>
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
            <button onClick={(e) => { e.stopPropagation(); logEventAnon("share", p, { kind: "place_card" }); shareLink(p.name, p.mapsUrl || "", null, "Check out " + p.name + " on Wayfind"); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 999, color: C.light, fontSize: 12, fontWeight: 700, padding: "5px 12px", cursor: "pointer" }}>↗ Share</button>
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
