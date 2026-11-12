// lib/cosmicBaseballFlorida.js
//
// Planning facts for the /cosmic-baseball-florida hub (owner mission,
// 2026-11-12). The DATES come from wf_events rows (event_series_id
// "cosmic-baseball-*"), never from this file, so a postponed or cancelled
// night disappears from the hub the moment its row changes.
//
// Everything below was read on the venue's or organiser's own page on
// 2026-11-12 and carries that page as its source. Regular-season gate times are
// labelled as the venue's normal practice, never as a Cosmic night fact.
// Unknowns stay unknown: first pitch, prices and each night's matchup were not
// published for any Florida date when this was written.

export const COSMIC_SERIES_PREFIX = "cosmic-baseball-";
export const COSMIC_LOTTERY_URL = "https://chilipeppersbaseball.com/cosmic-lottery/";
export const COSMIC_SCHEDULE_URL = "https://chilipeppersbaseball.com/schedule/";
export const COSMIC_FACTS_CHECKED = "2026-11-12";

export const COSMIC_TICKET_STEPS = Object.freeze([
  "Enter the Cosmic Lottery on the organiser's site and pick the Florida city you want. The form asks how many tickets you need (1 to 14; larger groups use a separate request).",
  "Entering does not guarantee anything. Not everyone who enters is selected.",
  "If you are selected you get a text and an email with a chance to buy. That chance lasts until the game sells out, so buy quickly.",
  "The organiser says the lottery is the only way to get tickets. Wayfind will add any other legitimate ticket source only after we verify it.",
]);

export const COSMIC_WHAT_IS = "Cosmic Baseball is a touring glow in the dark baseball show. The lights go down, black lights come on, and the players' bats, balls and uniforms glow, with UV reactive gear, a live DJ and fan interaction all game. The tour sold out 74 games in 2026 and is playing Major League ballparks for the first time in 2027.";

export const COSMIC_LOTTERY_WINDOW = "The organiser has not published an opening or closing date for the 2027 Florida draws. Its lottery page was taking entries when Wayfind checked on November 12, 2026. Once you are selected, your chance to buy lasts until that game sells out.";

export const COSMIC_DO_NOW = Object.freeze([
  "Enter the Cosmic Lottery now and pick the Florida city you want.",
  "Watch your texts and email; that is how selected entrants are told.",
  "If you are selected, buy right away, because the chance ends when the game sells out.",
  "Wait to book a hotel until you have tickets, or choose a room you can cancel for free.",
]);

export const COSMIC_UNKNOWN = "Not announced yet for any Florida date: first pitch time, ticket prices, gate times and which teams play each night. The 2027 tour adds two new teams alongside the Cosmic Chili Peppers and Glow Mojis.";

// Keyed by event_series_id. Each block answers what an attendee needs to know.
export const COSMIC_VENUES = Object.freeze({
  "cosmic-baseball-jacksonville": Object.freeze({
    city: "Jacksonville",
    venue: "VyStar Ballpark",
    pick: "Two nights, Friday and Saturday, the most chances in Florida. Jacksonville is also the earliest Florida stop, and in 2026 its first game sold out in hours.",
    getThere: "The team does not run the parking. Use the Legends lots around the sports complex (the venue lists $10 per car for Jumbo Shrimp games, cards accepted), nearby garages or street parking.",
    bring: "One clear bag up to 16 x 16 x 12 inches, or a small clutch up to 8 x 5 inches. No backpacks, coolers, outside food or aerosols (including spray sunscreen). Mobile tickets only and the park is cashless.",
    gates: "For regular Jumbo Shrimp games most gates open about an hour before first pitch, and 90 minutes before on Saturdays.",
    access: "Wheelchair seats at every price level with one companion seat each. Box office 904 358 2846.",
    sources: Object.freeze(["https://www.milb.com/jacksonville/ballpark", "https://www.milb.com/jacksonville/ballpark/prohibited-items", "https://ballpark.jaxevents.com/ballpark/parking-directions/", "https://ballpark.jaxevents.com/ballpark/accessibility-ada/"]),
  }),
  "cosmic-baseball-miami": Object.freeze({
    city: "Miami",
    venue: "loanDepot park",
    pick: "The only South Florida date, at a Major League ballpark with two Metrorail stations within a mile.",
    getThere: "Prepay parking only at marlins.com/parking or the MLB Ballpark app; it saves $5 and is the only way to guarantee a spot, and third party passes are not valid. No car: Metrorail Culmer and Civic Center stations are each within a mile, or take the City of Miami Trolley. Rideshare pickup and drop off is East Lot 1, 1380 NW 6th St.",
    bring: "One clear bag up to 16 x 16 x 8 inches or a clutch up to 6 x 8 inches. One sealed clear water bottle of 20 oz or less per person.",
    gates: "For regular Marlins games general gates open 90 minutes before first pitch.",
    access: "Accessible parking in all four garages and East Lots 2 and 3, first come first served with a placard or plate.",
    sources: Object.freeze(["https://www.mlb.com/marlins/ballpark/transportation", "https://www.mlb.com/marlins/ballpark/transportation/parking", "https://www.mlb.com/marlins/ballpark/information/guide", "https://www.mlb.com/marlins/ballpark/gameday"]),
  }),
  "cosmic-baseball-tropicana": Object.freeze({
    city: "St. Petersburg",
    venue: "Tropicana Field",
    pick: "The Tampa Bay area's only date, under a dome, so August heat and summer storms are not a factor. Best for families who need a sensory room.",
    getThere: "Prepaid parking for Lots 1, 2, 5, 6 and 7 at RaysBaseball.com/Parking, with overflow in downtown St. Pete. No car: the PSTA SunRunner stops on the north side of the stadium. Rideshare drop off is Gate 4 on 16th Street.",
    bring: "One clear bag up to 12 x 12 x 6 inches plus or instead of a small clutch up to 5 x 7 inches. No backpacks and no outside food, except one sealed water bottle of 20 oz or less.",
    gates: "For regular Rays games gates open 2 hours before first pitch on Saturdays.",
    access: "Sensory Room and free sensory bags at Guest Services. Wheelchair parking in Lots 1 and 7, ADA drop off at Gate 4, every gate accessible. Children 2 and over need a ticket.",
    sources: Object.freeze(["https://www.mlb.com/rays/ballpark/information/guide", "https://www.mlb.com/rays/ballpark/transportation", "https://www.mlb.com/rays/ballpark/information/accessibility-guide"]),
  }),
});

/** The rows of the Florida Cosmic Baseball series, soonest first. */
export function cosmicFloridaRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((e) => String(e?.event_series_id || "").startsWith(COSMIC_SERIES_PREFIX) && String(e?.state || "FL") === "FL")
    .sort((a, b) => String(a.start_date || "").localeCompare(String(b.start_date || "")));
}
