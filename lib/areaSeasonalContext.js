// lib/areaSeasonalContext.js — AreaSeasonalContext, the city x season grain.
//
// WHY THIS IS HAND-SEEDED AND NOT GENERATED
// Four rows per city per year is the case where seeding beats a pipeline: it
// changes on a seasonal cadence, and a generation run would need a key this
// environment does not have. When a key exists, the generator writes into this
// same shape — the consumers do not change.
//
// WHAT EACH FIELD IS FOR (the seasonal header previously read as a weather
// widget with a place name attached):
//   headline_context — why THIS season is notable in THIS place, right now.
//     Must be true of the actual city, not a seasonal cliché that would fit
//     anywhere. "It gets hot in summer" is not context; an afternoon storm you
//     can set a watch by is. This is the only prose authored in this file.
//   area_known_for  — what the area is known for, independent of season.
//     DERIVED from lib/culture.js TOWN_PROFILES[town].one — not re-authored.
//
// WHY area_known_for IS DERIVED (2026-07-29)
// It used to be hand-written here too, which meant a town carried TWO
// descriptions of itself in two modules with nothing keeping them in step. That
// was not hypothetical. Tampa read "Ybor City's cigar-era streets and a Cuban
// sandwich argument..." here and "The Cuban sandwich, cigars, and free-roaming
// chickens of Ybor City..." in culture.js — the same two facts, worded
// differently, either editable without the other. Sarasota had the same split
// over the Ringling and Siesta's quartz sand. Two sources of truth for one
// description is the pattern behind the price-label mess, so the culture
// profile is the source and this module reads it.
//
// ONE TOWN VOCABULARY. Lookup resolves through culture.js's TOWN_ALIASES, so
// the neighbourhood names that actually arrive from page context reach the town
// that holds the content. Keys here used to be hyphenated and alias-free, so
// "St. Petersburg" normalised to "st.-petersburg" and matched nothing, and
// "Bradenton Beach" matched nothing although culture.js maps it to Anna Maria
// Island. Both rendered no context block at all.
//
// TRUTH RULES, enforced by scripts/check-area-seasonal-context.mjs:
//   No price, hours, phone number, review count or rating in this prose. Those
//   are structured fields elsewhere; prose that states them goes stale silently
//   and nothing catches it. No invented statistics, no "#1"/"best" claims —
//   this copy has no ranking mechanism behind it, so it may not imply one.
//
// COVERAGE IS DELIBERATELY PARTIAL. A city with no entry renders NO context
// block — the same honest fallback the rest of the site uses. Do not add a
// generic default; a sentence that fits any city is exactly what this replaces.
import { TOWN_PROFILES, TOWN_ALIASES } from "./culture.js";

// The authored layer: why this season, in this town. Keys are TOWN_PROFILES
// keys (space-separated) so the two modules share one vocabulary.
const SEASONAL_HEADLINES = {
  orlando: {
    summer: "Afternoon storms roll through most days around three and clear by dinner, so the day splits in two around them.",
    fall: "The humidity finally breaks, and the outdoor patios and festival calendar that were unusable in August come back.",
    winter: "Dry, mild and the busiest stretch of the year — the one season where being outside all day is the obvious plan.",
    spring: "The short window before the heat arrives, when the springs are still cold and the crowds have not yet peaked.",
  },
  tampa: {
    summer: "Gulf humidity sits heavy until the afternoon storm clears it, and the water is warm enough to be no relief at all.",
    fall: "The first cool mornings arrive and the waterfront comes back to life after a summer of hiding indoors.",
    winter: "Mild and dry, and the manatees gather in the warm-water outflow at Apollo Beach where the Gulf gets too cold for them.",
    spring: "Strawberry season around Plant City, and the stretch before the humidity makes the afternoons a negotiation.",
  },
  sarasota: {
    summer: "The quiet season — the snowbirds have gone, the beaches belong to locals again, and the storms arrive on schedule.",
    fall: "The water is still holding summer's warmth while the air has finally dropped, so an afternoon outside stops being an endurance test.",
    winter: "Peak season on the barrier islands, and the stretch when shark-tooth hunting at Venice Beach actually rewards the walk.",
    spring: "The islands empty out as the season winds down, and the Gulf warms up enough to swim without thinking about it.",
  },
  parrish: {
    summer: "Storms build over the river most afternoons, and the railroad museum's shaded platform and the Fort Hamer ramp are what locals plan around them.",
    fall: "The Pumpkin Patch Express runs on the six-mile line and the humidity lifts off the Manatee, which is when the preserves become walkable again.",
    winter: "Christmas trains run and the dry season makes Rye Preserve's trails and the river bank the obvious weekend, without the summer bugs.",
    spring: "Before the heat returns the upper Manatee is at its finest for paddling, and the museum's themed runs fill up well ahead.",
  },
  bradenton: {
    summer: "The Riverwalk empties in the midday heat and fills again at sunset, and the Bishop Museum is where the afternoon storm sends everyone.",
    fall: "The first dry air arrives, the Riverwalk's calendar restarts, and the Village of the Arts opens its studios to a walkable evening again.",
    winter: "Peak season on the river — the Riverwalk, the Village of the Arts and the downtown markets all run at once, and the weather is the reason.",
    spring: "Spring training fills LECOM Park, an old ballpark sitting in the middle of town, and the river stays cool enough to sit beside all afternoon.",
  },
  palmetto: {
    summer: "Emerson Point's mangrove trails hold shade when the open bay does not, and the farm market is stacked with Florida summer produce.",
    fall: "The humidity breaks over the point where the river meets the bay, which is when the temple mound trail stops being a sweat and becomes a walk.",
    winter: "Dry, mild, and the quietest good weather on this side of the river — the open-water views from the point are at their clearest.",
    spring: "Strawberries and early Florida produce pile up at the farm market, and the birding out at the point picks up before the heat.",
  },
  ellenton: {
    summer: "The outlets are the town's air-conditioned answer to the afternoon storm, and the oaks at the Gamble mansion are the only real shade outside.",
    fall: "Cooler air makes the plantation grounds walkable again, and the outlet crowds thin out between the summer and holiday rushes.",
    winter: "Holiday shopping and snowbird traffic peak together, and the antebellum mansion a mile away is at its most pleasant on foot.",
    spring: "The last comfortable stretch to tour the Greek Revival mansion outdoors before the outlets become the only bearable option.",
  },
  "lakewood ranch": {
    summer: "Waterside's lakefront catches an evening breeze the inland blocks do not, and the Sunday market moves early to get ahead of the heat.",
    fall: "Patio season restarts on Main Street and at Waterside, and the polo grounds begin preparing for the winter matches.",
    winter: "Polo Sundays are running, the farmers market is at full size, and this is the stretch the whole master plan was designed around.",
    spring: "The polo season plays out and the trails and lakes stay usable all day, right before the summer humidity settles in.",
  },
  "anna maria island": {
    summer: "Sea turtles nest along the island's beaches, and the free trolley is the sane way to move because parking near the sand goes early.",
    fall: "The summer crowds and the nesting season both wind down, and the island returns to the quiet version of itself locals prefer.",
    winter: "Peak season on a low-rise island — the sunsets draw a crowd to the pier and Bridge Street, and the Gulf is too cold for most to swim.",
    spring: "Warm water and long light before the summer rentals fill, which is the window locals quietly keep to themselves.",
  },
  cortez: {
    summer: "The working docks keep their own rhythm through the heat, and the shade at the fish houses is the only real relief on the bayfront.",
    fall: "Stone crab season opens and the boats come back in heavier, which is the point of eating here rather than somewhere with a view.",
    winter: "The Commercial Fishing Festival takes over the village in the coolest, driest stretch, and the docks stay busy with the winter catch.",
    spring: "The stone crab season runs out and the village settles back into being a workplace rather than a destination.",
  },
  "longboat key": {
    summer: "The island empties out and the beaches are genuinely uncrowded, which on Longboat means close to deserted.",
    fall: "The quiet stretch before the season returns, when the beach and the bay both belong to whoever is still here.",
    winter: "The season fills the resorts and the key road gets busy, and the beaches still stay quieter than anything to the south.",
    spring: "The tail of the season — warm water and long evenings, before the island goes back to its summer hush.",
  },
  "siesta key": {
    summer: "The quartz sand stays cool enough to cross barefoot at midday, which is the practical reason this beach works in August when others do not.",
    fall: "The crowds thin, the drum circle keeps its Sunday sunset ritual, and the water is still holding the summer's warmth.",
    winter: "Peak season fills the Village and the beach lots early, and the sand's coolness matters rather less than the parking does.",
    spring: "Spring break turns the Village loud and the beach dense, and the drum circle draws a ring that stays well past sunset.",
  },
  venice: {
    summer: "Storms churn the shallows and turn over fresh fossil beds, so the shark-tooth hunting is often better right after the weather clears.",
    fall: "The humidity lifts off the Legacy Trail, and the downtown's 1920s arcades become a walkable evening again.",
    winter: "Dry season, cool water, and the stretch when the shark-tooth beaches at Caspersen get worked over by half the town.",
    spring: "The Shark's Tooth Festival lands, and the trail and the beaches stay usable all day before the summer heat arrives.",
  },
  "plant city": {
    summer: "The berry fields are out of season and the town is at its quietest, which is when the historic downtown is actually pleasant to walk.",
    fall: "The fields are being set for the winter crop, and the first cool mornings arrive over the farm country east of Tampa.",
    winter: "This is the season — Florida's strawberries come in through the cool months, and the U-pick rows and roadside stands are the whole point.",
    spring: "The Strawberry Festival closes out the harvest with an eleven-day fair, and the last U-pick rows get picked over.",
  },
  riverview: {
    summer: "The Alafia trails turn wet and buggy, and the indoor suburbs carry the season until the river parks cool off at dusk.",
    fall: "The old phosphate hills at Alafia dry out, and the mountain biking that surprises people about flat Florida comes back.",
    winter: "Prime riding weather on the Alafia's phosphate hills, dry and cool, and the trail crowd is locals rather than visitors.",
    spring: "The last dry weeks on the trails before the summer rains, and the river parks fill up on the weekends.",
  },
  "apollo beach": {
    summer: "The manatees have scattered back into open water, and the canals and the waterfront bars are what the town is for.",
    fall: "The first cold fronts start pushing manatees toward the warm-water outflow, and the viewing centre's season begins.",
    winter: "Manatees crowd the power plant's warm-water discharge in numbers — the reason this town is on anyone's list at all.",
    spring: "The manatees disperse as the bay warms, and the preserve's birding takes over as the reason to come.",
  },
  ruskin: {
    summer: "The fields are between crops, and the bayfront preserve's shade and breeze are the only comfortable part of the day.",
    fall: "The tomato fields go back in, and camping at E.G. Simmons becomes bearable again after a summer of heat.",
    winter: "Florida's tomato season runs through the cool months, and the bayfront preserve is at its most usable for camping and paddling.",
    spring: "The last of the winter tomatoes come off the fields, and the golf-cart town next door is at its busiest before the snowbirds leave.",
  },
  "st. petersburg": {
    summer: "The murals and the Dalí are what the afternoon storm is for, and Central Avenue's breweries carry the evening.",
    fall: "The humidity breaks and the mural districts and the waterfront become a walkable evening again after a summer spent indoors.",
    winter: "Peak season downtown — the pier, the museums and Central Avenue all run full, and the weather is why people moved here.",
    spring: "Warm and clear before the heat, and the open-air art and the waterfront are usable from morning through evening.",
  },
  "st. pete beach": {
    summer: "Storms build over the Gulf most afternoons and clear for the sunset, and the Don CeSar's pink facade is the landmark everyone waits under.",
    fall: "The summer crowds go and the beach widens out, and Corey Avenue's Sunday market restarts in comfortable air.",
    winter: "The season fills the beachfront hotels, and Fort De Soto's wilder sand a short drive south is where locals go instead.",
    spring: "Warm water returns and the beach fills with spring crowds before the summer storm pattern settles in.",
  },
  gulfport: {
    summer: "The bay beach stays calm when the Gulf is rough, and the Casino ballroom's dances carry on regardless of the weather outside.",
    fall: "The Art Walk and the Tuesday market pick back up as the evenings cool, and the waterfront becomes strollable again.",
    winter: "The arts calendar runs at full strength, and the small bay beach is dog-friendly, quiet and entirely local.",
    spring: "The monthly Art Walk spills outdoors, and the independent strip along the water is at its liveliest before the summer heat.",
  },
};

// Towns with no culture profile supply their own area line. Orlando is a
// CULTURE metro, not a Sarasota-corridor town, so it has no TOWN_PROFILES entry.
const AREA_WITHOUT_PROFILE = {
  orlando: "The theme parks are the headline, but the lakes, springs and Winter Park's brick streets are what locals do on a day off.",
};

export const AREA_SEASONAL_CONTEXT = (() => {
  const out = {};
  for (const [town, seasons] of Object.entries(SEASONAL_HEADLINES)) {
    const profile = TOWN_PROFILES[town];
    const known = (profile && profile.one) || AREA_WITHOUT_PROFILE[town];
    // §5: a town seeded with seasonal prose but no area line is a wiring error,
    // not a town that renders half a header. Name it and stop. Dropping it
    // silently would surface as "this city has no context", which is a
    // legitimate product state and therefore undiagnosable from the outside.
    if (!known) {
      throw new Error(
        "areaSeasonalContext: '" + town + "' has seasonal copy but no area line — it is " +
        "not a key in culture.js TOWN_PROFILES and has no AREA_WITHOUT_PROFILE entry"
      );
    }
    out[town] = {};
    for (const [season, headline] of Object.entries(seasons)) {
      out[town][season] = { headline_context: headline, area_known_for: known };
    }
  }
  return out;
})();

// City names arrive from page context ("Orlando", "St. Petersburg", "Bradenton
// Beach", ...), so normalise and then resolve neighbourhood names through the
// SAME alias table culture.js uses. Returns null when the town has no entry —
// the caller renders nothing rather than a generic line.
export function areaSeasonalContext(city, season) {
  if (!city || !season) return null;
  const name = String(city).trim().toLowerCase().replace(/\s+/g, " ");
  const key = AREA_SEASONAL_CONTEXT[name] ? name : (TOWN_ALIASES[name] || name);
  const byCity = AREA_SEASONAL_CONTEXT[key];
  if (!byCity) return null;
  return byCity[season] || null;
}
