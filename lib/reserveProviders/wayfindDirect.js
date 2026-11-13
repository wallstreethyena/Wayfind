// lib/reserveProviders/wayfindDirect.js - instant lane: real openings from wf_reserve_slots, wf_reserve_book.
import { wayfindLane } from "./shared.js";

export function createWayfindDirect({ repository }) {
  return wayfindLane({
    repository, id: "wayfind_direct", kind: "instant", searchTimes: true,
    create: (a) => repository.book(a),
  });
}
