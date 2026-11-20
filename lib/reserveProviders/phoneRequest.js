// lib/reserveProviders/phoneRequest.js - phone_request lane.
// Selected only for an allowlisted restaurant with a verified public phone, and only used when the guest
// taps Confirm. searchAvailability never claims a time. createReservation places at most one call.
import { startPhoneRequest } from "../reservePhone/orchestrator.js";

export function createPhoneRequest({ repository, env = {} } = {}) {
  return {
    id: "phone_request",
    kind: "phone_request",
    async searchAvailability() { return { ok: true, verified: false, times: null }; },
    async createReservation(a = {}) {
      return startPhoneRequest({
        repository,
        env,
        nowMs: a.nowMs,
        telephony: a.telephony,
        voice: a.voice,
        events: a.events,
        fetchImpl: a.fetchImpl,
        request: {
          userId: a.userId,
          placeId: a.placeId,
          idempotencyKey: a.idempotencyKey,
          guestName: a.guestName,
          restaurantName: a.restaurantName,
          date: a.date,
          time: a.time,
          partySize: a.partySize,
          windowMinutes: a.windowMinutes,
          phonePlace: a.phonePlace,
        },
      });
    },
    async cancelReservation() { return { ok: false, code: "NOT_SUPPORTED" }; },
    async modifyReservation() { return { ok: false, code: "NOT_SUPPORTED" }; },
    async getReservation() { return { ok: false, code: "NOT_SUPPORTED" }; },
  };
}
