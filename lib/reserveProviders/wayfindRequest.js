// lib/reserveProviders/wayfindRequest.js - request lane: no availability is ever claimed.
// wf_reserve_request saves a 'requested' booking; the restaurant answers on its manage page.
import { wayfindLane } from "./shared.js";

export function createWayfindRequest({ repository }) {
  return wayfindLane({
    repository, id: "wayfind_request", kind: "request", searchTimes: false,
    create: (a) => repository.request(a),
  });
}
