// lib/insiderSellPreview.js — the selling half of the insider-tips homepage
// mockup (app/preview/insider-tips). Owner 2026-11-28: "This homepage is not
// very converting." The first screen now leads with things you can book this
// weekend (real photo, rating, price, a ticket button), then the Christmas
// events that sell tickets, then the insider tips.
//
// Nothing here is new data. Every tile is a card the live Christmas page
// already shows (lib/christmasPageData.js): the weekend row's cards and the
// ticket grid's rows, with the same ticket ways in (lib/christmasWeekendTile.js
// weekendTicketCta: our own /go routes or the organizer's official page), the
// same honest prices (lib/christmasTickets.js ticketPrice) and the same honest
// urgency. A card with no real photo or no ticket way in is left out, never
// shown with a placeholder. "Top rated on Wayfind" uses the one shared rule
// (lib/topRatedLine.js, Wayfind score 90 or more).
import { christmasPageData } from "./christmasPageData.js";
import { weekendCardPhoto, weekendTicketCta } from "./christmasWeekendTile.js";
import { topRatedLine } from "./topRatedLine.js";
import { honestUrgency } from "./honestUrgency.js";

export const SELL_WEEKEND_MAX = 10;
export const SELL_CHRISTMAS_MAX = 6;
const MEMO_MS = 10 * 60 * 1000;
let memo = { at: 0, value: null };

const clean = (s, max = 120) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);

function ratingOf(card) {
  const r = Number(card && card.rating);
  const n = Number(card && card.reviews);
  if (!Number.isFinite(r) || r <= 0 || r > 5) return null;
  return { stars: Math.round(r * 10) / 10, reviews: Number.isFinite(n) && n > 0 ? Math.round(n) : 0 };
}

function priceLine(card) {
  const p = card && card.ticketRow && card.ticketRow.price;
  if (!p || p.soldOut) return "";
  if (p.kind === "from") return ["From", p.text, p.unit].filter(Boolean).join(" ");
  if (p.kind === "free") return clean(p.text, 40);
  return "";
}

// "Last day", "Final weekend": only from a confirmed last date (lib/honestUrgency.js).
function urgencyLabel(card, today) {
  if (card.kind === "tour") return "";
  try { const u = honestUrgency(card, today); return u && u.label ? clean(u.label, 30) : ""; } catch { return ""; }
}

/** One weekend tile, or null when it has no real photo, no ticket way in, or is sold out. */
export function sellTile(card, today = "") {
  if (!card || card.kind === "place" || !card.id) return null;
  const price = card.ticketRow && card.ticketRow.price;
  if (price && price.soldOut) return null;
  const photo = weekendCardPhoto(card);
  const cta = weekendTicketCta(card);
  if (!photo || !cta) return null;
  const rating = ratingOf(card);
  const when = clean((card.ticketRow && card.ticketRow.when) || card.when || "", 60);
  const href = card.detailHref && String(card.detailHref).startsWith("/") ? card.detailHref : null;
  return {
    id: String(card.id),
    slug: card.slug || null,
    title: clean(card.title || card.name, 90),
    city: clean(card.city, 40),
    when,
    photo,
    rating,
    topRated: rating ? !!topRatedLine({ rating: rating.stars, reviews: rating.reviews }) : false,
    price: priceLine(card),
    urgency: urgencyLabel(card, today),
    cta: { href: cta.href, partner: cta.label, kind: cta.kind, provider: cta.provider || "" },
    href,
  };
}

/** Pure: the page model from christmasPageData's result. */
export function sellModel(data, { weekendMax = SELL_WEEKEND_MAX, christmasMax = SELL_CHRISTMAS_MAX } = {}) {
  const empty = { window: null, weekend: [], christmas: [], chrome: { eventPage: "Full event page" } };
  if (!data || typeof data !== "object") return empty;
  const seen = new Set();
  const weekend = [];
  const groups = data.weekend && Array.isArray(data.weekend.groups) ? data.weekend.groups : [];
  // Round robin across the kinds (lights, parades, shows ...) so the strip is a
  // mix, each kind in its own top rated order.
  const lists = groups.map((g) => (Array.isArray(g && g.cards) ? g.cards : []));
  for (let i = 0; weekend.length < weekendMax && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      if (weekend.length >= weekendMax) break;
      const tile = i < list.length ? sellTile(list[i], data.today || "") : null;
      if (tile && !seen.has(tile.id)) { seen.add(tile.id); weekend.push(tile); }
    }
  }
  // Best rated first within the strip; ties keep the mix order.
  weekend.sort((a, b) => (b.topRated - a.topRated) || ((b.rating ? b.rating.stars : 0) - (a.rating ? a.rating.stars : 0)));
  const rows = data.tickets && Array.isArray(data.tickets.rows) ? data.tickets.rows : [];
  const christmas = rows.filter((r) => r && r.id && !seen.has(String(r.id)) && r.cta && r.cta.href
    && !(r.price && r.price.soldOut)
    && Array.isArray(r.photos) && r.photos.some((p) => p && typeof p.src === "string" && p.src)).slice(0, christmasMax);
  return {
    window: data.weekend && Array.isArray(data.weekend.window) ? data.weekend.window : null,
    weekend,
    christmas,
    chrome: { eventPage: (data.tickets && data.tickets.chrome && data.tickets.chrome.eventPage) || "Full event page" },
  };
}

/** The live model, cached 10 minutes per server instance; empty (never throws) when the reads fail. */
export async function loadSellModel({ nowMs = Date.now(), read = christmasPageData } = {}) {
  if (memo.value && nowMs - memo.at < MEMO_MS) return memo.value;
  let value;
  try { value = sellModel(await read()); } catch { value = sellModel(null); }
  if (value.weekend.length || value.christmas.length) memo = { at: nowMs, value };
  return value;
}

export function __resetSellMemo() { memo = { at: 0, value: null }; }
