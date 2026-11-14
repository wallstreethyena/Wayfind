// lib/reserveProviders/none.js - no way to book this restaurant through Wayfind. Never claims anything.
export function createNoneProvider() {
  return {
    id: "none", kind: "none",
    async searchAvailability() { return { ok: true, verified: false, times: null }; },
    async createReservation() { return { ok: false, code: "NO_PROVIDER" }; },
    async cancelReservation() { return { ok: false, code: "NOT_SUPPORTED" }; },
    async modifyReservation() { return { ok: false, code: "NOT_SUPPORTED" }; },
    async getReservation() { return { ok: false, code: "NOT_SUPPORTED" }; },
  };
}
