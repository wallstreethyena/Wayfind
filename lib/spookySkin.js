// lib/spookySkin.js — the SPOOKY / HALLOWEEN card skin: a sub-variant of the
// fall card skin (owner, 2026-10-06; target look = his mock-card.png).
//
// THE LAW. A card is "spooky" only when ALL of these hold (fail closed):
//   1. the fall skin is applied to it (a spooky card is a fall card first; this
//      file never skins a card the fall skin would not),
//   2. today (US Eastern, lib/siteTime.siteTodayStr) is inside the window
//      [fall skin start .. Nov 1] — after Nov 1 every card falls back to its
//      normal fall or standard look by itself, nothing to remember,
//   3. it is IDENTIFIED as Halloween by one of:
//        a. its rail is a spooky rail (SPOOKY_RAIL_IDS: lib/fallIntentRails.js
//           "Spooky Date Night", "Haunted Houses & Fright Nights",
//           "Halloween Theme Parks"),
//        b. its place id is one of the fall pool's date-night / haunts places
//           (SPOOKY_PLACE_IDS — a locked mirror of lib/fallPool.FALL_PLACE_RAIL,
//           kept here because fallPool is server-side and must not enter the
//           client bundle; scripts/check-spooky-skin.mjs pins the equality),
//        c. its own name / category / tags contain a WHOLE WORD from
//           SPOOKY_TERMS. Whole word means "boo" never matches Bookstore,
//           Booker or Bamboo, and "scream" never matches Ice Cream / Screamin.
//   A pub or bar crawl is spooky only through (c): "crawl" alone is not a term.
// Spooky wins over fall; a fall card that is not spooky keeps the orange look.
import { fallCardClass, fallSkinLive } from "./fallSkin.js";

export const SPOOKY_RAIL_IDS = Object.freeze(["date-night", "haunts", "theme-parks"]);

// date-night / haunts rows of lib/fallPool.FALL_PLACE_RAIL (SpookEasy Lounge,
// Dracula's Legacy, Ybor ghost tour, Mortem Manor, Orlando ghost tours, Fear at
// the Pier, Dead Coconut Club). The farms and food rows are NOT here.
export const SPOOKY_PLACE_IDS = Object.freeze([
  "ChIJ7QVjUK_FwogRaTLY8uxOico", "ChIJIZt3d7DFwogRQ5Lg2tPMXyk", "ChIJn6X9ZlDEwogRTbyZDHcMf_0",
  "ChIJd6lmgVh_3YgREzqTBf28i6U", "ChIJUS9EYpll54gR63QOjYM4vDw", "ChIJ2Z9gE5eNk4gRz-Ey8y0ahfM",
  "ChIJwZ_GK-d-54gRm5Ahg7PZYeY",
]);
const SPOOKY_PLACE_SET = new Set(SPOOKY_PLACE_IDS);

// Whole words / phrases, matched on text normalised to lowercase words
// (hyphens, underscores and punctuation are word breaks: "Howl-O-Scream" ->
// "howl o scream", tag "haunted_house" -> "haunted house").
const TERM_RX = /(?:^| )(?:halloween|haunted|haunting|haunt|haunts|fright|frights|spooky|scream|zombie|zombies|horror|ghost|ghosts|boo|costume crawl|monster bash)(?= |$)/;
// "ghost kitchen" (delivery-only restaurant) and "ghost pepper" are not spooky.
const NOT_SPOOKY_RX = /(?:^| )ghost (?:kitchen|kitchens|pepper|peppers)(?= |$)/g;
// "Halloween" itself, for the eyebrow: we only print "Halloween event" when the
// card's own text says Halloween. Never invented.
const HALLOWEEN_RX = /(?:^| )halloween(?= |$)/;

function normalise(parts) {
  return " " + parts.flat().filter((v) => typeof v === "string" && v).join(" ").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().replace(NOT_SPOOKY_RX, " ") + " ";
}
function textOf(card) {
  if (!card || typeof card !== "object") return "";
  return normalise([card.name, card.title, card.event_name, card.category, card.subcategory, Array.isArray(card.tags) ? card.tags : [], Array.isArray(card.types) ? card.types : []]);
}
const wrap = (rx, text) => rx.test(text.trim());

export function spookyTermMatch(card) { return wrap(TERM_RX, textOf(card)); }
export function sayHalloween(card) { return wrap(HALLOWEEN_RX, textOf(card)); }

// The window: from the fall skin start through Nov 1 inclusive (Eastern date
// string from lib/siteTime.siteTodayStr()).
export function spookySkinLive(todayStr) {
  if (!fallSkinLive(todayStr)) return false;
  return todayStr <= todayStr.slice(0, 4) + "-11-01";
}

// card: { id | place_id, name | title, category, subcategory, tags }; railId optional.
export function isSpookyCard(card, todayStr, { railId = null } = {}) {
  if (!spookySkinLive(todayStr)) return false;
  if (railId && SPOOKY_RAIL_IDS.includes(railId)) return true;
  const id = card && (card.place_id || card.id);
  if (id && SPOOKY_PLACE_SET.has(id)) return true;
  return spookyTermMatch(card);
}

// For a card the FALL skin already applies to (fall rail wrapper, fall place id,
// fall event): the class string to append. " wf-spooky-card" alone is enough
// where the .wf-fall wrapper supplies the fall skin; the helper below adds both.
export function spookyCardClass(card, todayStr, opts) {
  return isSpookyCard(card, todayStr, opts) ? " wf-spooky-card" : "";
}
// The spooky ADD-ON for a card whose root already carries fallCardClass(): " wf-spooky-card" only
// when the fall class applies too. Roots keep calling fallCardClass (the augtober guard pins that).
export function spookyOverFall(card, todayStr) {
  return fallCardClass(card && (card.place_id || card.id), todayStr) ? spookyCardClass(card, todayStr) : "";
}
// Place-card surfaces: fall class (by place id) + spooky on top, only when fall applies.
export function fallSpookyCardClass(card, todayStr) {
  const fall = fallCardClass(card && (card.place_id || card.id), todayStr);
  return fall ? fall + spookyCardClass(card, todayStr) : "";
}

// Chips: add "👻 Halloween" to a card's chip list, never above 4, never twice.
// At 4 it REPLACES the weakest generic chip (family / venue door / shot / proof
// / access, in that order), else the last chip. Schedule and restriction chips
// carry real facts and are replaced last.
const WEAK_ORDER = ["family", "venue", "shot", "access", "proof"];
// Short eyebrow for the known spooky rails so it never ellipsizes beside the badge at 390px.
const SPOOKY_EYEBROWS = { "Halloween Theme Parks": "Halloween Nights", "Haunted Houses & Fright Nights": "Haunted House" };
export function spookyEyebrow(title) { return SPOOKY_EYEBROWS[title] || title; }
export function withSpookyChip(chips, { max = 4 } = {}) {
  const list = Array.isArray(chips) ? chips.filter(Boolean) : [];
  // Already says Halloween, or already uses the ghost icon: do not add a second ghost.
  if (list.some((c) => c.key === "halloween" || /halloween|spooky/i.test(String(c.label || "")) || c.icon === "\uD83D\uDC7B")) return list;
  const chip = { key: "halloween", icon: "\uD83D\uDC7B", label: "Halloween" };
  // The chip row scrolls on a phone, so the Halloween chip goes where it is seen: first, or right
  // after the schedule chip (the owner's "when" law keeps the schedule first).
  const at = list[0] && list[0].key === "schedule" ? 1 : 0;
  if (list.length < max) return [...list.slice(0, at), chip, ...list.slice(at)];
  const out = list.slice(0, max);
  let drop = -1;
  for (const key of WEAK_ORDER) { drop = out.findIndex((c) => c.key === key); if (drop >= 0) break; }
  if (drop < 0) drop = out.length - 1;
  out.splice(drop, 1);
  out.splice(Math.min(at, out.length), 0, chip);
  return out;
}
