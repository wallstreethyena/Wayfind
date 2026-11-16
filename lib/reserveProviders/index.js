// lib/reserveProviders/index.js - picks the provider for a place. Server code decides, never the model.
//   active visible partner, booking_mode instant  -> wayfind_direct
//   active visible partner, booking_mode request  -> wayfind_request
//   active verified OpenTable link                -> opentable_handoff
//   RESERVE_OPENTABLE_API === "on" AND credentials -> opentable_api (every method throws NOT_ENABLED)
//   everything else                               -> none
// forPlace(placeId) resolves to the provider plus `partner` (Wayfind lanes) or `link` (handoff) for callers that need them.
import { partnerVisible } from "../reserve.js";
import { openTableApiSelected } from "../reservePath.js";
import { createWayfindDirect } from "./wayfindDirect.js";
import { createWayfindRequest } from "./wayfindRequest.js";
import { createOpenTableHandoff } from "./openTableHandoff.js";
import { createOpenTableApi } from "./openTableApi.js";
import { createNoneProvider } from "./none.js";

const RID = /^[0-9]{1,9}$/;

export function createProviderRegistry({ repository, env = {} } = {}) {
  const direct = createWayfindDirect({ repository }), request = createWayfindRequest({ repository }), none = createNoneProvider();
  return {
    /** The Wayfind lanes share one cancel RPC, so a cancel needs no place id. */
    cancelProvider: () => direct,
    async forPlace(placeId, { wayfindOnly = false } = {}) {
      if (openTableApiSelected(env)) return createOpenTableApi();
      if (typeof placeId !== "string" || !placeId) return Object.assign(Object.create(none), { partner: null, link: null });
      const partner = await repository.getPartner(placeId);
      if (partner && partnerVisible(partner, env)) {
        const base = partner.booking_mode === "request" ? request : direct;
        return Object.assign(Object.create(base), { partner, link: null });
      }
      if (wayfindOnly) return Object.assign(Object.create(none), { partner: null, link: null });
      const link = await repository.getPlatformLink(placeId);
      if (link && link.active !== false && RID.test(String(link.external_id ?? ""))) {
        const rid = String(link.external_id);
        return Object.assign(createOpenTableHandoff({ link: { rid, slug: link.external_slug || null } }), { partner: null });
      }
      return Object.assign(Object.create(none), { partner: null, link: null });
    },
  };
}
