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
export const SHARE_CARD_SYSTEM = {
  name: "Wayfind Signal",
  eyebrow: "WAYFIND SIGNAL",
  promise: "Worth your time, clearly shown.",
  accent: "#F97316",
};

export const SHARE_CARDS = {
  datenight: {
    slug: "date-night",
    art: "/cards/date-night.jpg",
    accent: "#FF8A5C",
    eyebrow: "DATE NIGHT, HANDLED",
    title: "The Date Night List",
    desc: "Candlelit dinners, sunset views and after-dark charm — made for two.",
    cta: "Plan tonight",
    shareLine: "Date night, handled — candlelight, water views and zero “you pick.”",
  },
  nightout: {
    slug: "night-out",
    art: "/cards/night-out.jpg",
    accent: "#E879F9",
    eyebrow: "TONIGHT'S THE NIGHT",
    title: "The Night Out List",
    desc: "Live music, cocktails and dance floors — where tonight actually happens.",
    cta: "Start the night",
    shareLine: "Where tonight actually happens — the bars, music and late kitchens worth leaving for.",
  },
  eatnow: {
    slug: "where-to-eat",
    art: "/cards/where-to-eat.jpg",
    accent: "#FDBA74",
    eyebrow: "HUNGRY? SOLVED.",
    title: "Where To Eat",
    desc: "The best food near you for this exact hour — no ads, no paid placement.",
    cta: "Find my table",
    shareLine: "Stop scrolling menus — this is where to eat near us right now.",
  },
  hiddengems: {
    slug: "hidden-gems",
    art: "/cards/hidden-gems.jpg",
    accent: "#FFB347",
    eyebrow: "THE LOCAL SECRETS",
    title: "The Hidden Gems List",
    desc: "Quietly excellent spots most people walk right past. Found for you.",
    cta: "Show me",
    shareLine: "The spots locals keep to themselves — consider the secret out.",
  },
  outdoors: {
    slug: "outdoors",
    art: "/cards/outdoors.jpg",
    accent: "#FCD34D",
    eyebrow: "SUNSHINE ITINERARY",
    title: "The Great Outdoors",
    desc: "Beaches, trails, parks and waterfront — your whole day outside, mapped.",
    cta: "Take me outside",
    shareLine: "Salt air, golden hour, zero plans needed — our day outside, mapped.",
  },
  familyfun: {
    slug: "family-fun",
    art: "/cards/family-fun.jpg",
    accent: "#FCA5A5",
    eyebrow: "FAMILY DAY, SORTED",
    title: "The Family Fun List",
    desc: "Kid-approved parks, splash pads, zoos and shows for big laughs together.",
    cta: "Plan the day",
    shareLine: "Big smiles, worn-out kids, one great day — the family list is ready.",
  },
  // Art pending — uncomment when public/cards/places-to-stay.jpg lands (the
  // OG route falls back to the standard pin-and-road art until then anyway):
  // stays: { slug: "places-to-stay", art: "/cards/places-to-stay.jpg", accent: "#93C5FD",
  //   eyebrow: "TONIGHT'S LANDING", title: "Places To Stay",
  //   desc: "Easy check-ins and stays worth the trip — close to everything you came for.",
  //   cta: "Find my stay", shareLine: "Found where we're staying — close to everything." },
};

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
  staticArt: "/cards/world-cup.png",
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
  return card ? card.shareLine : "Check this Wayfind list: " + (title || "Top picks");
}
