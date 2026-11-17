// lib/reserveProviders/index.js - picks the provider for a place. Server code decides, never the model.
//   active visible partner, booking_mode instant  -> wayfind_direct
//   active visible partner, booking_mode request  -> wayfind_request
//   active verified OpenTable link                -> opentable_handoff
//   RESERVE_OPENTABLE_API === "on" AND credentials -> opentable_api (every method throws NOT_ENABLED)
//   allowlisted verified public phone             -> phone_request (Confirm tap only; never dials here)
//   everything else                               -> none
// forPlace(placeId) resolves to the provider plus `partner` (Wayfind lanes) or `link` (handoff) for callers that need them.
import { partnerVisible } from "../reserve.js";
import { openTableApiSelected } from "../reservePath.js";
import { dryRunNumber, dryRunPhonePlace, PHONE_DRY_RUN_PLACE_ID, phoneSelectable } from "../reservePhone/policy.js";
import { createWayfindDirect } from "./wayfindDirect.js";
import { createWayfindRequest } from "./wayfindRequest.js";
import { createOpenTableHandoff } from "./openTableHandoff.js";
import { createOpenTableApi } from "./openTableApi.js";
import { createPhoneRequest } from "./phoneRequest.js";
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
      // Phone is last, and only when the flag, cap, secrets, and allowlist all say this one place.
      // forPlace does not dial. The call happens in createReservation, which only the Confirm handler runs.
      if (phoneSelectable(env, placeId)) {
        let phonePlace = null;
        if (placeId === PHONE_DRY_RUN_PLACE_ID && dryRunNumber(env)) phonePlace = dryRunPhonePlace(dryRunNumber(env));
        else if (typeof repository.getPhonePlace === "function") phonePlace = await repository.getPhonePlace(placeId);
        if (phonePlace && phonePlace.verified_at && typeof phonePlace.phone === "string" && phonePlace.phone) {
          return Object.assign(createPhoneRequest({ repository, env }), { partner: null, link: null, phonePlace });
        }
      }
      return Object.assign(Object.create(none), { partner: null, link: null });
    },
  };
}
