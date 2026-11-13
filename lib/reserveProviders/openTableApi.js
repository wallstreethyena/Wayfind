// lib/reserveProviders/openTableApi.js - the API seam. No OpenTable API integration exists, so EVERY method throws NOT_ENABLED.
// The registry selects it only when RESERVE_OPENTABLE_API === "on" AND credentials are present (they never are).
import { ReserveStorageError } from "../reserveRepository.js";

const refuse = async () => { throw new ReserveStorageError("NOT_ENABLED", "Booking through OpenTable is not available.", 501); };

export function createOpenTableApi() {
  return { id: "opentable_api", kind: "api", searchAvailability: refuse, createReservation: refuse, cancelReservation: refuse, modifyReservation: refuse, getReservation: refuse };
}
