// lib/reserveProviders/openTableHandoff.js - OpenTable handoff. Wayfind never books there and never reads openings.
// createReservation always answers HANDOFF_ONLY with the /api/reserve/go URL.

export function handoffGoUrl({ placeId, date, time, partySize }) {
  const p = new URLSearchParams({ placeId });
  if (date) p.set("date", date);
  if (time) p.set("time", time);
  if (partySize) p.set("party", String(partySize));
  return `/api/reserve/go?${p.toString()}`;
}

export function createOpenTableHandoff({ link = null } = {}) {
  return {
    id: "opentable_handoff", kind: "handoff", link,
    async searchAvailability() { return { ok: true, verified: false, times: null }; },
    async createReservation({ placeId, date, time, partySize }) { return { ok: false, code: "HANDOFF_ONLY", handoffUrl: handoffGoUrl({ placeId, date, time, partySize }) }; },
    async cancelReservation() { return { ok: false, code: "NOT_SUPPORTED" }; },
    async modifyReservation() { return { ok: false, code: "NOT_SUPPORTED" }; },
    async getReservation() { return { ok: false, code: "NOT_SUPPORTED" }; },
  };
}
