// lib/christmasStubhub.js: reviewed StubHub event pages for Christmas shows.
//
// StubHub ships DARK (lib/stubhub.js): Wayfind is not a confirmed StubHub
// affiliate until STUBHUB_PARTNERIZE_CAMREF is set. This map holds ONLY exact
// StubHub event pages checked by hand (same production, same venue and city,
// same date). No performer pages, no search pages, no guessed ids. A show with
// no row here never gets a StubHub option, and with no camref no show does.
//
// Review 2026-11-12: StubHub searches for the pinned shows (Mannheim Steamroller
// Christmas at Peabody Auditorium, A Charlie Brown Christmas Live at Ruth
// Eckerd Hall, Christmas Carole at Alhambra) returned only performer, venue or
// 2025 pages, never an exact 2026 event page. So the map is empty on purpose.
// Add rows as { date: "YYYY-MM-DD", url: "https://www.stubhub.com/.../event/<id>" }.
import { isStubhubLive, isStubhubUrl, stubhubGoUrl } from "./stubhub.js";

export const CHRISTMAS_STUBHUB = Object.freeze({});

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

// The StubHub option for the listing's next mapped night, or null. `map` is a
// parameter only so a guard can exercise the live path; callers use the default.
export function christmasStubhubOption(card, today, surface, map = CHRISTMAS_STUBHUB) {
  if (!isStubhubLive()) return null;
  const id = card && (card.id || card.event_id);
  const rows = id ? map[id] : null;
  if (!Array.isArray(rows) || !DATE_RX.test(String(today || ""))) return null;
  const next = rows
    .filter((r) => r && DATE_RX.test(r.date) && r.date >= today && isStubhubUrl(r.url) && /\/event\/\d+/.test(r.url))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return null;
  const href = stubhubGoUrl(next.url, { surface, contentId: id, offerId: id });
  return href ? { provider: "stubhub", label: "StubHub", href } : null;
}
