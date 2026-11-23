// Exact-name attraction tickets for a place card. The only source is
// placePartnerPick, the same registry the detail sheet already uses.
// Klook and Tiqets (Travelpayouts), Undercover Tourist, and CityPASS.
// A tour, a transfer, a venue resale page, or a name that is not an alias
// on that row returns null. No fuzzy match and no generic search.
import { placePartnerPick } from "./placePartnerPicks.js";

const TICKET_PROVIDERS = new Set(["klook", "tiqets", "undercover_tourist", "citypass"]);

export function attractionTicketOffer(place, catalog) {
  const pick = placePartnerPick(place, catalog);
  if (!pick || !TICKET_PROVIDERS.has(pick.provider)) return null;
  if ((pick.product || "ticket") !== "ticket") return null;
  return pick;
}
