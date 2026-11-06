// Exact, explicitly reviewed SECONDARY resale paths for curated Florida events.
// Never replace the organiser's verified ticket page with a general venue listing.
// This registry is not a claim of inventory for every date or a paid placement.
import { commerceHref } from "./commerce.js";

const RESALE_CHOICES = Object.freeze({
  "enchant-stpete-2026": Object.freeze({
    provider: "ticketsmarter",
    offerId: "enchant-stpete-ticketsmarter",
    label: "Browse resale tickets",
    via: "TicketSmarter resale marketplace. Dates, prices and fees vary. We may earn a commission.",
    lastDay: "2026-12-27",
  }),
});

const UNAVAILABLE = new Set(["sold_out", "soldout", "off_sale", "offsale", "cancelled", "canceled", "postponed"]);

export function secondaryEventTicketAction(row, { surface = "event", today = "" } = {}) {
  if (!row || row.is_free === true || row.link_ok === false) return null;
  const id = String(row.event_id || row.id || "").replace(/^wfc:/, "");
  const entry = Object.hasOwn(RESALE_CHOICES, id) ? RESALE_CHOICES[id] : null;
  if (!entry) return null;
  const eventStatus = String(row.event_status || "").toLowerCase().replace(/[\s-]+/g, "_");
  const ticketStatus = String(row.ticket_status || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (UNAVAILABLE.has(eventStatus) || UNAVAILABLE.has(ticketStatus)) return null;
  // A secondary option accompanies the real official checkout. No blind resale
  // replacement when a venue's ticket link disappears or changes ownership.
  let official;
  try { official = new URL(String(row.official_ticket_url || "")); } catch { return null; }
  if (official.protocol !== "https:" || official.hostname !== "www.enchantchristmas.com" ||
      !official.pathname.startsWith("/st-petersburg/")) return null;
  const cutoff = String(today || "").slice(0, 10);
  if (cutoff && cutoff > entry.lastDay) return null;
  if (String(row.end_date || "") && String(row.end_date) < (cutoff || "2026-11-05")) return null;
  const href = commerceHref({ provider: entry.provider, offerId: entry.offerId,
    surface, contentId: id });
  return href ? { kind: "affiliate", href, label: entry.label, via: entry.via,
    provider: entry.provider, product: "resale-browse" } : null;
}
