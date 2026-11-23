// Pure helpers for the "This weekend" tiles on /christmas-in-florida.
// Safe for the client bundle: no listings, no Supabase, no clock.
// The button names the partner. The href is the tracked /go route the browse
// card already built, with the surface set to this rail. Ranking never reads
// these helpers.

export const CHRISTMAS_WEEKEND_SURFACE = "christmas_weekend";
export const CHRISTMAS_WEEKEND_TILE_CLICK = "christmas_weekend_tile_click";
export const CHRISTMAS_WEEKEND_RAIL_IMPRESSION = "christmas_weekend_rail_impression";

const PARTNER_LABEL = Object.freeze({
  undercover_tourist: "Undercover Tourist",
  viator: "Viator",
  ticketmaster: "Ticketmaster",
});

const BAD_PHOTO = /\/cards-v8\/|wfplacediscovery/i;

function realPhoto(src) {
  return typeof src === "string" && src.length > 0 && !BAD_PHOTO.test(src);
}

// The first real photo on the card. Placeholder art and a discovery stand-in
// are not photos, so the rail drops that tile instead of painting a blank.
export function weekendCardPhoto(card) {
  if (!card || typeof card !== "object") return "";
  const lists = [];
  if (card.ticketRow && Array.isArray(card.ticketRow.photos)) lists.push(card.ticketRow.photos);
  if (Array.isArray(card.photos)) lists.push(card.photos);
  for (const list of lists) {
    for (const photo of list) {
      if (photo && realPhoto(photo.src)) return photo.src;
    }
  }
  return realPhoto(card.image) ? card.image : "";
}

// Keep the offer and the content id. Only the surface changes, so the click
// and the provider redirect both attribute to this rail.
export function weekendTrackedHref(href) {
  const raw = String(href || "");
  if (!/^\/api\/[a-z0-9/_-]+\/go\?/i.test(raw)) return "";
  let url;
  try { url = new URL(raw, "https://www.gowayfind.com"); } catch { return ""; }
  if (!/\/api\/[a-z0-9/_-]+\/go$/.test(url.pathname)) return "";
  url.searchParams.set("surface", CHRISTMAS_WEEKEND_SURFACE);
  url.searchParams.delete("click_id");
  return url.pathname + "?" + url.searchParams.toString();
}

export function weekendPartnerLabel(cta) {
  if (!cta || typeof cta !== "object") return "";
  if (cta.kind === "organizer") {
    return cta.label === "Official Tickets" && /^https:\/\//.test(String(cta.href || "")) ? "Official Tickets" : "";
  }
  if (cta.kind !== "affiliate") return "";
  if (!/^\/api\/[a-z0-9/_-]+\/go\?/i.test(String(cta.href || ""))) return "";
  if (cta.label === "Undercover Tourist" || cta.label === "Viator" || cta.label === "Ticketmaster") return cta.label;
  return PARTNER_LABEL[cta.provider] || "";
}

// null when this card has no ticket way in. The tile then keeps only its event link.
export function weekendTicketCta(card) {
  const cta = card && card.ticketRow && card.ticketRow.cta;
  const label = weekendPartnerLabel(cta);
  if (!label) return null;
  const href = label === "Official Tickets" ? String(cta.href) : weekendTrackedHref(cta.href);
  if (!href) return null;
  return {
    href,
    label,
    kind: cta.kind,
    provider: cta.provider || (label === "Official Tickets" ? "organizer" : ""),
  };
}

function safeGroup(group) {
  const id = String(group || "");
  return /^[a-z0-9-]{1,40}$/.test(id) ? id : "";
}

// Tile tap. Group id, position in that row, and whether a ticket button was showing.
// No title, no URL, no email, no phone.
export function weekendTileClickProps(group, position, hasCta) {
  const pos = Number(position);
  return {
    group: safeGroup(group),
    position: Number.isInteger(pos) && pos > 0 && pos < 100 ? pos : 0,
    has_cta: hasCta === true,
  };
}

export function weekendRailImpressionProps(groups) {
  const rows = [];
  let tiles = 0;
  for (const group of Array.isArray(groups) ? groups : []) {
    const id = safeGroup(group && group.id);
    const n = group && Array.isArray(group.cards) ? group.cards.length : 0;
    if (!id || n < 1) continue;
    rows.push(id);
    tiles += n;
  }
  return { groups: rows.length, tiles, rows: rows.join(",") };
}
