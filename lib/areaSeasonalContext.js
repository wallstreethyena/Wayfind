// lib/areaSeasonalContext.js — AreaSeasonalContext, the city x season grain.
//
// WHY THIS IS HAND-SEEDED AND NOT GENERATED
// Four rows per city per year is the case where seeding beats a pipeline: the
// whole corpus for three cities is twelve sentences, it changes on a seasonal
// cadence, and a generation run would need a key this environment does not
// have. When a key exists, the generator writes into this same shape — the
// consumers do not change.
//
// WHAT EACH FIELD IS FOR (the seasonal header previously read as a weather
// widget with a place name attached):
//   headline_context — why THIS season is notable in THIS place, right now.
//     Must be true of the actual city, not a seasonal cliché that would fit
//     anywhere. "It gets hot in summer" is not context; an afternoon storm you
//     can set a watch by is.
//   area_known_for  — what the area is known for, independent of season. Same
//     register as a culture-profile's "the one thing to know" line.
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

export const AREA_SEASONAL_CONTEXT = {
  orlando: {
    summer: {
      headline_context: "Afternoon storms roll through most days around three and clear by dinner, so the day splits in two around them.",
      area_known_for: "The theme parks are the headline, but the lakes, springs and Winter Park's brick streets are what locals do on a day off.",
    },
    fall: {
      headline_context: "The humidity finally breaks, and the outdoor patios and festival calendar that were unusable in August come back.",
      area_known_for: "The theme parks are the headline, but the lakes, springs and Winter Park's brick streets are what locals do on a day off.",
    },
    winter: {
      headline_context: "Dry, mild and the busiest stretch of the year — the one season where being outside all day is the obvious plan.",
      area_known_for: "The theme parks are the headline, but the lakes, springs and Winter Park's brick streets are what locals do on a day off.",
    },
    spring: {
      headline_context: "The short window before the heat arrives, when the springs are still cold and the crowds have not yet peaked.",
      area_known_for: "The theme parks are the headline, but the lakes, springs and Winter Park's brick streets are what locals do on a day off.",
    },
  },
  tampa: {
    summer: {
      headline_context: "Gulf humidity sits heavy until the afternoon storm clears it, and the water is warm enough to be no relief at all.",
      area_known_for: "Ybor City's cigar-era streets and a Cuban sandwich argument the city has been having with Miami for a century.",
    },
    fall: {
      headline_context: "The first cool mornings arrive and the waterfront comes back to life after a summer of hiding indoors.",
      area_known_for: "Ybor City's cigar-era streets and a Cuban sandwich argument the city has been having with Miami for a century.",
    },
    winter: {
      headline_context: "Mild and dry, and the manatees gather in the warm-water outflow at Apollo Beach where the Gulf gets too cold for them.",
      area_known_for: "Ybor City's cigar-era streets and a Cuban sandwich argument the city has been having with Miami for a century.",
    },
    spring: {
      headline_context: "Strawberry season around Plant City, and the stretch before the humidity makes the afternoons a negotiation.",
      area_known_for: "Ybor City's cigar-era streets and a Cuban sandwich argument the city has been having with Miami for a century.",
    },
  },
  sarasota: {
    summer: {
      headline_context: "The quiet season — the snowbirds have gone, the beaches belong to locals again, and the storms arrive on schedule.",
      area_known_for: "Siesta Key's quartz sand stays cool underfoot, and the Ringling estate is a genuine art museum most visitors drive past.",
    },
    fall: {
      headline_context: "The water is still holding summer's warmth while the air has finally dropped, so an afternoon outside stops being an endurance test.",
      area_known_for: "Siesta Key's quartz sand stays cool underfoot, and the Ringling estate is a genuine art museum most visitors drive past.",
    },
    winter: {
      headline_context: "Peak season on the barrier islands, and the stretch when shark-tooth hunting at Venice Beach actually rewards the walk.",
      area_known_for: "Siesta Key's quartz sand stays cool underfoot, and the Ringling estate is a genuine art museum most visitors drive past.",
    },
    spring: {
      headline_context: "The islands empty out as the season winds down, and the Gulf warms up enough to swim without thinking about it.",
      area_known_for: "Siesta Key's quartz sand stays cool underfoot, and the Ringling estate is a genuine art museum most visitors drive past.",
    },
  },
};

// City names arrive from page context ("Orlando", "St. Petersburg", ...), so
// normalise before lookup. Returns null when the city has no entry — the caller
// renders nothing rather than a generic line.
export function areaSeasonalContext(city, season) {
  if (!city || !season) return null;
  const key = String(city).trim().toLowerCase().replace(/\s+/g, "-");
  const byCity = AREA_SEASONAL_CONTEXT[key];
  if (!byCity) return null;
  return byCity[season] || null;
}
