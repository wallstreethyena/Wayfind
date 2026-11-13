// lib/reservePath.js - which way can a guest book this restaurant? Decided by server code, never by the model.
//
//   wayfind   a visible, active Wayfind partner (instant booking, real openings from wf_reserve_slots)
//   opentable a verified OpenTable restaurant id (rid) in wf_reserve_platform_links. HANDOFF ONLY:
//             we open OpenTable with the day, time and party filled in. Wayfind never books on
//             OpenTable, never reads its openings and never says a table is booked or confirmed.
//   none      neither: the app shows the place page and the restaurant phone.
//
// The env seam RESERVE_OPENTABLE_API is off. If anyone sets it to "1" the code answers NOT_ENABLED,
// because no OpenTable API integration exists. scripts/test-reserve-v2.mjs locks this.
import { partnerVisible } from "./reserve.js";
import { isDateString } from "./reserveFormat.js";
import { ReserveStorageError } from "./reserveRepository.js";

export const OPENTABLE_RESTREF = "https://www.opentable.com/restref/client/";
export const OPENTABLE_MAX_PARTY = 20;
const RID = /^[0-9]{1,9}$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Throws NOT_ENABLED when the OpenTable API seam is switched on. There is no implementation behind it. */
export function assertOpenTableApiOff(env = {}) {
  if (String(env.RESERVE_OPENTABLE_API || "") === "1") {
    throw new ReserveStorageError("NOT_ENABLED", "Booking through OpenTable is not available.", 501);
  }
}
/** The seam itself. Always refuses. Nothing may call a booking on OpenTable. */
export function bookOnOpenTable() {
  throw new ReserveStorageError("NOT_ENABLED", "Booking through OpenTable is not available.", 501);
}

/**
 * OpenTable's reservation form only offers :00 and :30. Round to the NEAREST half hour
 * (:15 rounds up, :45 rounds up), never past 23:30 and never into the next day. Null when not HH:MM.
 */
export function roundToHalfHour(time) {
  const m = HHMM.exec(typeof time === "string" ? time.trim() : "");
  if (!m) return null;
  const total = Math.min(23 * 60 + 30, Math.round((Number(m[1]) * 60 + Number(m[2])) / 30) * 30);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Pure. {url, sentTime} or null when rid is not digits. Invalid or missing date/time/party are LEFT OUT,
 * never invented. datetime needs both a valid date and time. sentTime is the half hour actually sent
 * (null when no datetime was sent) so the app can say "around 7:30 PM".
 * Full shape: https://www.opentable.com/restref/client/?rid=<rid>&datetime=<YYYY-MM-DD>T<HH:MM>&covers=<n>
 */
export function openTableHandoffUrl({ rid, date, time, party } = {}) {
  const id = String(rid ?? "").trim();
  if (!RID.test(id)) return null;
  const parts = [`rid=${id}`];
  const sentTime = isDateString(date) ? roundToHalfHour(time) : null;
  if (sentTime) parts.push(`datetime=${date}T${sentTime}`);
  const n = typeof party === "string" && /^\d{1,2}$/.test(party.trim()) ? Number(party.trim()) : party;
  if (Number.isInteger(n) && n >= 1 && n <= OPENTABLE_MAX_PARTY) parts.push(`covers=${n}`);
  return { url: `${OPENTABLE_RESTREF}?${parts.join("&")}`, sentTime };
}

/**
 * Partner first, then verified OpenTable link, then none. repository needs getPartner and getPlatformLink.
 * Returns {path:"wayfind", partner} | {path:"opentable", link:{rid, slug}} | {path:"none"}.
 */
export async function resolveBookingPath(placeId, { repository, env = {} } = {}) {
  assertOpenTableApiOff(env);
  if (typeof placeId !== "string" || !placeId) return { path: "none" };
  const partner = await repository.getPartner(placeId);
  if (partner && partnerVisible(partner, env)) return { path: "wayfind", partner };
  const link = await repository.getPlatformLink(placeId);
  if (link && link.active !== false && RID.test(String(link.external_id ?? ""))) {
    return { path: "opentable", link: { rid: String(link.external_id), slug: link.external_slug || null } };
  }
  return { path: "none" };
}
