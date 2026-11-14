// lib/reserveProviders/shared.js - helpers shared by the Wayfind lanes (instant and request).
const wrap = (error) => ({ ok: false, code: "STORAGE", cause: error });

export function wayfindLane({ repository, id, kind, create, searchTimes }) {
  return {
    id, kind,
    async searchAvailability({ placeId, date, partySize }) {
      if (!searchTimes) return { ok: true, verified: false, times: null };
      try { return { ok: true, verified: true, times: await repository.slots(placeId, date, partySize) }; }
      catch (error) { return { ...wrap(error), verified: false, times: null }; }
    },
    async createReservation(a) {
      let out;
      try { out = await create(a); } catch (error) { return wrap(error); }
      if (!out || out.ok !== true) return { ok: false, code: String((out && out.code) || "UNAVAILABLE"), ...(out && out.booking ? { booking: out.booking } : {}) };
      return { ok: true, booking: out.booking };
    },
    async cancelReservation({ bookingId, userId }) {
      try {
        const out = await repository.cancel({ bookingId, actor: "guest", userId });
        return out.ok ? { ok: true, booking: out.booking } : { ok: false, code: String(out.code || "NOT_FOUND") };
      } catch (error) { return wrap(error); }
    },
    async modifyReservation() { return { ok: false, code: "NOT_SUPPORTED" }; },
    async getReservation({ bookingId, userId }) {
      try {
        const booking = await repository.getUserBooking(userId, bookingId);
        return booking ? { ok: true, booking } : { ok: false, code: "NOT_FOUND" };
      } catch (error) { return wrap(error); }
    },
  };
}
