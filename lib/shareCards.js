// lib/shareCards.js — v6.17. The discovery share-card system: one card per
// "right place, right moment" tab. When a user shares one of those lists, the
// link preview renders that category's artwork (public/cards/*.jpg) with the
// live copy laid on top by /api/og — copy is NEVER baked into the image, so
// it stays dynamic, truthful and updatable (master card spec, July 2026).
//
// Keys are EXPERIENCES ids from app/home.js. Adding a category = adding a row
// here + dropping its art in public/cards/ — no component changes (the OG
// route and /l metadata read this map).
//
// Copy limits (card spec): eyebrow 12–20 chars · title 2–5 words ·
// description 55–90 chars · CTA 2–5 words. Truth rules: counts only ever come
// from the real list length (the n param at share time); descriptions state
// what the category genuinely contains — no invented scarcity, ratings or
// ranking claims.
//
// This module is imported by the edge OG route — keep it dependency-free.

// The visual language behind every Wayfind share. "Signal" is intentionally
// product-language, not a campaign slogan: a share is a useful signal from one
// person to another about what is worth their time. All place, list, weather
// and discovery previews inherit this same system even when their artwork and
// copy differ.
import { INTENT_PAGES } from "./intentPages.js";

// ══ 2026-08-12 — EVERY SHARE-CARD IMAGE IS GONE ═══════════════════════════
// Owner: "I HATE the text message design… I want every card that we have used
// or image we have used for text share deleted. I want to work on new ones."
//
// The art was committed into the repo under public/cards and public/brand, so
// this is a real deletion of files, not a cache bust: 17 images are removed from
// the tree in the same commit. Nothing in here may point at them again — a
// dangling /cards/ path would render a share card with a hole in it, which is
// worse than no photo.
//
// `art: null` was ALREADY a supported value on this shape (the world-cup entry
// used it), and the renderers already degrade to the branded, photo-free card.
// So this is not a stub or a placeholder: it is the existing no-photo path,
// switched on everywhere, and it is what ships until the new design lands.
//
// scripts/check-share-card-art.mjs fails the build if any share/OG renderer
// regains an image reference, and if any of the deleted files reappear.
export const SHARE_CARD_SYSTEM = {
  name: "Wayfind Signal",
  eyebrow: "WAYFIND SIGNAL",
  promise: "Worth your time, clearly shown.",
  accent: "#F97316",
};

export const SHARE_CARDS = {
  datenight: {
    slug: "date-night",
    art: null,
    accent: "#FF8A5C",
    eyebrow: "DATE NIGHT, HANDLED",
    title: "The Date Night List",
    desc: "Candlelit dinners, sunset views and after-dark charm — made for two.",
    cta: "Plan tonight",
    shareLine: "Date night, handled — candlelight, water views and zero “you pick.”",
  },
  nightout: {
    slug: "night-out",
    art: null,
    accent: "#E879F9",
    eyebrow: "TONIGHT'S THE NIGHT",
    title: "The Night Out List",
    desc: "Live music, cocktails and dance floors — where tonight actually happens.",
    cta: "Start the night",
    shareLine: "Where tonight actually happens — the bars, music and late kitchens worth leaving for.",
  },
  eatnow: {
    slug: "where-to-eat",
    art: null,
    accent: "#FDBA74",
    eyebrow: "HUNGRY? SOLVED.",
    title: "Where To Eat",
    desc: "The best food near you for this exact hour — no ads, no paid placement.",
    cta: "Find my table",
    shareLine: "Stop scrolling menus — this is where to eat near us right now.",
  },
  hiddengems: {
    slug: "hidden-gems",
    // No `art` here on purpose. This entry's art is DERIVED from INTENT_PAGES via
    // intentArtFor() in shareVisualFor, so /hidden-gems and its share card cannot
    // show different photos (#449). The old literal survived that change as a
    // shadowed fallback reachable only through shareCardFor().art — which nothing
    // reads — so it was dead, wrong, and looked live. Deleted rather than
    // documented (issue #459): a stale literal is how the next person fixes the
    // wrong line.
    accent: "#FFB347",
    eyebrow: "THE LOCAL SECRETS",
    title: "The Hidden Gems List",
    desc: "Quietly excellent spots most people walk right past. Found for you.",
    cta: "Show me",
    shareLine: "The spots locals keep to themselves — consider the secret out.",
  },
  outdoors: {
    slug: "outdoors",
    art: null,
    accent: "#FCD34D",
    eyebrow: "SUNSHINE ITINERARY",
    title: "The Great Outdoors",
    desc: "Beaches, trails, parks and waterfront — your whole day outside, mapped.",
    cta: "Take me outside",
    shareLine: "Salt air, golden hour, zero plans needed — our day outside, mapped.",
  },
  familyfun: {
    slug: "family-fun",
    art: null,
    accent: "#FCA5A5",
    eyebrow: "FAMILY DAY, SORTED",
    title: "The Family Fun List",
    desc: "Kid-approved parks, splash pads, zoos and shows for big laughs together.",
    cta: "Plan the day",
    shareLine: "Big smiles, worn-out kids, one great day — the family list is ready.",
  },
  // Art pending — uncomment when public/cards/places-to-stay.jpg lands (the
  // OG route falls back to the standard pin-and-road art until then anyway):
  // stays: { slug: "places-to-stay", art: null, accent: "#93C5FD",
  //   eyebrow: "TONIGHT'S LANDING", title: "Places To Stay",
  //   desc: "Easy check-ins and stays worth the trip — close to everything you came for.",
  //   cta: "Find my stay", shareLine: "Found where we're staying — close to everything." },
};

// Artwork-only fallbacks for every share surface that does not have bespoke
// category copy above. They deliberately contain no words: /api/og owns all
// live text, so a shared preview stays truthful as a list, city, count or
// recommendation changes. Each image is composed with the detail on the left
// and a quiet right-hand text-safe field for the dynamic Wayfind overlay.
//
// Keep this dependency-free: it is used in Edge OG routes.
// ONE ART SOURCE for the surfaces that are ALSO intent pages. Three share
// keys name the same destination as an INTENT_PAGES entry under a different
// spelling, and each used to hold its own copy of the art path — which is why
// the /hidden-gems share card kept rendering the old photo after the page
// moved to a new one. These three now read the page's art.
//
// The other share keys are NOT intent pages (nightout, eatnow, outdoors) and
// SHARE_VISUALS below is a different asset class entirely: purpose-built
// 1200x630 art that keeps its right side quiet for the text overlay (see
// public/cards/README.md). Neither is a duplicate, and neither is merged.
const INTENT_ART_KEY = { datenight: "date-night", familyfun: "family", hiddengems: "hidden-gems" };
function intentArtFor(canonical) {
  const k = INTENT_ART_KEY[canonical];
  return k ? (INTENT_PAGES[k] || {}).art || null : null;
}

export const SHARE_VISUALS = {
  nearby: { art: null },
  stays: { art: null },
  cozyindoor: { art: null },
  shopping: { art: null },
};

const VISUAL_ALIASES = {
  // Experience and curated-list keys.
  food: "eatnow",
  restaurants: "eatnow",
  eat: "eatnow",
  nightlife: "nightout",
  bars: "nightout",
  drinks: "nightout",
  attractions: "outdoors",
  "things-to-do": "outdoors",
  things: "outdoors",
  experiences: "outdoors",
  beaches: "outdoors",
  beach: "outdoors",
  family: "familyfun",
  "family-fun": "familyfun",
  // Hyphenated/spaced spellings of the canonical SHARE_CARDS keys. Without
  // these, "date night" compacts to "date-night", misses the exact-key check
  // (the key is "datenight"), and falls through to the fuzzy tests where
  // /night/ claims it for nightout.
  "date-night": "datenight",
  "night-out": "nightout",
  "eat-now": "eatnow",
  "hidden-gems": "hiddengems",
  hotels: "stays",
  hotel: "stays",
  lodging: "stays",
  "places-to-stay": "stays",
  "cozy-indoor": "cozyindoor",
  cozy: "cozyindoor",
  retail: "shopping",
  shops: "shopping",
  "best-of-area": "nearby",
  best: "nearby",
  today: "nearby",
  nearby: "nearby",
  weather: "nearby",
  place: "nearby",
  list: "nearby",
};

function visualKey(key) {
  const raw = String(key || "").toLowerCase().trim();
  if (!raw) return "nearby";
  const compact = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (VISUAL_ALIASES[raw]) return VISUAL_ALIASES[raw];
  if (VISUAL_ALIASES[compact]) return VISUAL_ALIASES[compact];
  // An EXACT canonical key wins before any fuzzy match. "datenight" is a real
  // SHARE_CARDS key, but it contains the substring "night", and the nightout
  // test below runs before the date test — so the date-night share card
  // rendered the NIGHT-OUT photo. Same shape as the parking->park leak that
  // lib/placeFilter documents. The fuzzy tests exist to route arbitrary caller
  // strings; they must never outrank a name we actually define.
  if (SHARE_CARDS[compact] || SHARE_VISUALS[compact]) return compact;
  if (/hotel|stay|resort|lodg/.test(compact)) return "stays";
  if (/shop|retail|market/.test(compact)) return "shopping";
  if (/cozy|indoor|rain/.test(compact)) return "cozyindoor";
  if (/food|eat|restaurant|dining/.test(compact)) return "eatnow";
  if (/night|bar|cocktail|club|music/.test(compact)) return "nightout";
  if (/family|kid/.test(compact)) return "familyfun";
  if (/beach|outdoor|park|tour|attraction|experience/.test(compact)) return "outdoors";
  if (/date|romance/.test(compact)) return "datenight";
  if (/hidden|gem/.test(compact)) return "hiddengems";
  return "nearby";
}

/**
 * Resolve the visual for any category, place type or list key. Existing
 * bespoke discovery cards win; all other share paths receive a stable,
 * premium default rather than falling back to a generic pin graphic.
 */
export function shareVisualFor(key) {
  const canonical = visualKey(key);
  const card = SHARE_CARDS[canonical];
  const derived = intentArtFor(canonical);
  if (derived) return { art: derived, key: canonical };
  if (card && card.art) return { art: card.art, key: canonical };
  const visual = SHARE_VISUALS[canonical] || SHARE_VISUALS.nearby;
  return { ...visual, key: canonical };
}

// v6.25 — the World Cup "Watch the game together" share card. When someone
// shares the "Where to watch" list, the recipient sees this specific card. Per
// the master card spec, copy is NEVER baked into the image — the headline,
// subtext and button ROTATE among these owner-authored variants (chosen at
// share time, carried as ?rot= so the preview stays stable for that share).
export const WC_ROTATIONS = [
  { title: "Game on. You in?", desc: "I found some places showing the match. Let’s choose one together.", cta: "Pick our spot" },
  { title: "Watch it with me", desc: "Here are a few places showing the game. Where should we go?", cta: "Choose together" },
  { title: "Pick the spot. Bring the noise.", desc: "Let’s watch the match together. Choose where we’re going.", cta: "Pick our place" },
  { title: "Same team. Same screen.", desc: "I want to watch the game with you. Let’s find our spot.", cta: "Find our spot" },
  { title: "Big game. Better together.", desc: "Here are some places where we can watch. You pick—or I will.", cta: "See the places" },
  { title: "Where are we watching?", desc: "I found a few options for the match. Let’s make the call together.", cta: "Cast your vote" },
  { title: "One match. Two votes.", desc: "Take a look at these watch spots and help me choose.", cta: "Vote on a place" },
  { title: "Let’s make match day ours", desc: "The game is better together. Where should we watch it?", cta: "Choose our spot" },
  { title: "Meet me for the match", desc: "Here are some places showing the game. Pick your favorite.", cta: "Pick a place" },
  { title: "The match needs a plan", desc: "I found the places. Now I need your vote.", cta: "Make the call" },
];
export function wcRotation(idx) {
  const n = WC_ROTATIONS.length;
  const i = Number(idx);
  return WC_ROTATIONS[Number.isFinite(i) && i >= 0 ? i % n : 0];
}
// The card entry (so shareCardFor resolves it and /l gets rich metadata). The
// OG route detects custom==="worldcup" and renders the bespoke "Watch the game
// together" design; art is drawn in-route, not a jpg.
SHARE_CARDS.worldcup = {
  slug: "world-cup",
  custom: "worldcup",
  art: null,
  // v6.32 — owner-designed finished card (copy baked in). When staticArt is set,
  // the share preview serves this exact PNG as the og:image instead of the
  // in-route drawn version, so people see the owner's art pixel-for-pixel.
  staticArt: null,
  staticW: 1758,
  staticH: 895,
  accent: "#F98626",
  eyebrow: "WORLD SOCCER",
  subLabel: "Places showing the match",
  title: WC_ROTATIONS[0].title,
  desc: WC_ROTATIONS[0].desc,
  cta: WC_ROTATIONS[0].cta,
  shareLine: "I found the places showing the match — let’s pick our spot on Wayfind.",
};

/** The card for an experience/list key, or null (callers keep default OG). */
export function shareCardFor(key) {
  if (key === "hol-worldcup" || key === "worldcup") return SHARE_CARDS.worldcup;
  return (key && SHARE_CARDS[key]) || null;
}

/** Native-share text for a category list; falls back to the generic line. */
export function shareTextFor(key, title) {
  const card = shareCardFor(key);
  // The fallback was "Check this Wayfind list: …" — directory voice at the one
  // moment the product is being handed to another person. "List" describes our
  // data structure; nobody texts a friend a list.
  //
  // The reason to send it is that the filtering is already done: these pages
  // are ranked by the Wayfind Score with no paid placement, which is exactly
  // what "saves you the search" claims and nothing more. Emotional frame,
  // and every word of it is backed.
  return card ? card.shareLine : "Saves you the search — " + (title || "our top picks");
}
