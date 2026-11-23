// Poster rail affiliate routing. Ticketmaster event tickets go through
// /api/ticketmaster/go with the rail surface. Organizer links stay put.
// Viator campaigns keep the rail. Exact-name attraction tickets only.
// A paid button renders a visible commission line and owns its click.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { trackedEventTicketHref, railClickContext } from "../lib/posterTickets.js";
import { railPlacementCode } from "../lib/railCampaign.js";
import { viatorCampaign, viatorPlacementCode } from "../lib/affiliates.js";
import { attractionTicketOffer } from "../lib/attractionTickets.js";
import { commercePayload } from "../lib/commerce.js";
import { RAIL_CARD_COMMISSION_LINE } from "../lib/affiliateDisclosure.js";

const repo = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };

const TM = "https://www.ticketmaster.com/event/abc123";
const wrapped = trackedEventTicketHref(TM, { surface: "date_night_livemusic", offerId: "evt1", contentId: "evt1" });
ok(wrapped && wrapped.affiliate && wrapped.provider === "ticketmaster", "a Ticketmaster event URL is an affiliate hop");
ok(wrapped.href.startsWith("/api/ticketmaster/go?"), "it routes through /api/ticketmaster/go");
{
  const u = new URL(wrapped.href, "https://www.gowayfind.com");
  ok(u.searchParams.get("url") === TM, "the destination is the same event");
  ok(u.searchParams.get("surface") === "date_night_livemusic", "the rail surface is on the redirect");
  ok(u.searchParams.get("offer") === "evt1", "the offer id is on the redirect");
  ok(!/email|gclid|lat|lng|@/.test(wrapped.href), "the redirect carries no personal data");
}
const organizer = trackedEventTicketHref("https://frrm.org/ride", { surface: "date_night_livemusic", offerId: "evt2" });
ok(organizer && organizer.affiliate === false && organizer.href === "https://frrm.org/ride", "a venue link is not rewritten");
const already = "/api/commerce/go?provider=undercover_tourist&offer=5&surface=date_night_livemusic";
const kept = trackedEventTicketHref(already, { surface: "date_night_livemusic", offerId: "evt3" });
ok(kept && kept.href === already && kept.affiliate === true, "an existing go link is not wrapped again");
ok(railClickContext(organizer.href, "date_night_livemusic", "evt2") === null, "an organizer hop is not a commerce click");
const click = railClickContext(wrapped.href, "date_night_livemusic", "evt1");
ok(click && click.surface === "date_night_livemusic" && click.rail === "datenight" && click.offer_id === "evt1" && click.provider === "ticketmaster", "the click names surface, rail and offer");
const payload = commercePayload("commerce_cta_clicked", click);
ok(payload.rail === "datenight" && payload.surface === "date_night_livemusic" && payload.offer_id === "evt1", "commerce_cta_clicked keeps rail on the existing schema");
ok(!("email" in payload), "the payload has no extra personal field");

ok(viatorPlacementCode("night_out_night_tours") === "nightout", "night out placement");
ok(viatorPlacementCode("home_rail") === "home" && railPlacementCode("home_rail") === "", "generic home placement is unchanged");
ok(viatorCampaign({ page: "/", surface: "night_out_waterfront", offerId: "108117P1" }) === "wf-home-nightout-108117p1", "campaign is wf-home-nightout-offer");
ok(viatorCampaign({ page: "/", surface: "family_day_attractions", offerId: "tampa-family-florida-aquarium" }).startsWith("wf-home-family-"), "family campaign keeps the family rail");

const aquarium = attractionTicketOffer({ name: "The Florida Aquarium" });
ok(aquarium && aquarium.provider === "klook" && aquarium.offerId === "tampa-family-florida-aquarium", "exact aquarium name returns the Klook ticket");
ok(attractionTicketOffer({ name: "Florida Aquarium Gift Shop" }) === null, "a longer name is not a match");
ok(attractionTicketOffer({ name: "Aquarium" }) === null, "a generic word is not a match");
ok(attractionTicketOffer({ name: "Van Wezel Performing Arts Hall" }) === null, "a TicketNetwork venue is not an attraction ticket");
ok(attractionTicketOffer({ name: "Siesta Beach", category: "beach" }) === null, "a beach never gets a ticket");
ok(attractionTicketOffer({ name: "Magic Kingdom" })?.provider === "undercover_tourist", "an exact park name can use Undercover Tourist");
ok(railPlacementCode("fall_recommended_hotels") === "hotels", "a hotel rail is not labeled as the fall poster");
ok(railPlacementCode("event_stays") === "hotels" && railPlacementCode("guide_stays") === "hotels", "stay rails keep a hotel rail id");

const PosterEventCard = (await loadComponent(fileURLToPath(new URL("../app/components/PosterEventCard.js", import.meta.url)), repo)).default;
const tmHtml = renderToStaticMarkup(createElement(PosterEventCard, {
  surface: "date_night_livemusic",
  event: { id: "evt1", name: "Live at the hall", dest: "https://example.com/show", url: TM, ticketed: true, venue: "The hall" },
}));
ok(tmHtml.includes("/api/ticketmaster/go?"), "the rendered Tickets button uses the tracked redirect");
ok(!tmHtml.includes('href="' + TM + '"') && !tmHtml.includes("href=\"" + TM), "the raw Ticketmaster URL is not the button href");
ok(tmHtml.includes("data-commerce-owner=\"RailCard\""), "the button owns its commerce click");
ok(tmHtml.includes(RAIL_CARD_COMMISSION_LINE), "the commission line is visible text");
ok(!tmHtml.includes("best"), "the card adds no best claim");

const orgHtml = renderToStaticMarkup(createElement(PosterEventCard, {
  surface: "night_out_shows",
  event: { id: "evt2", name: "Train ride", dest: "https://frrm.org/ride", url: "https://frrm.org/ride", ticketed: true, venue: "Museum" },
}));
ok(orgHtml.includes('href="https://frrm.org/ride"'), "the organizer button keeps its own URL");
ok(!orgHtml.includes("data-commerce-owner"), "an organizer button does not claim a partner click");
ok(!orgHtml.includes(RAIL_CARD_COMMISSION_LINE), "a non paying link shows no commission line");

if (fails.length) { console.error("test-poster-rail-tracking: FAIL\n - " + fails.join("\n - ")); process.exit(1); }
console.log("test-poster-rail-tracking: OK — " + pass + " assertions");
