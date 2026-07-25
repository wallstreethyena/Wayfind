const EVENT_CATEGORY_ART = Object.freeze({
  concerts: "/events/concerts-audience.jpg",
  theater: "/events/theater-stage.jpg",
  tours: "/events/local-tours-kayak.jpg",
});

const COMMUNITY_ART = Object.freeze({
  social: "/events/community-social.jpg",
  food: "/events/community-food.jpg",
  market: "/events/local-events-market.jpg",
  neighborhood: "/events/community-neighborhood.jpg",
  kids: "/events/community-kids.jpg",
});

function eventSearchText(event) {
  if (!event || typeof event !== "object") return "";
  return [
    event.name,
    event.title,
    event.genre,
    event.venue?.name || event.venue,
    event.venueName,
    event.description,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function communityEventArtKind(event) {
  const text = eventSearchText(event);

  // Specific audiences and formats win before broader community language.
  if (/\b(kids?|children|child|family|families|youth|teen|storytime|story hour|summer learning|camp|balloon|movie nights?|school|playground|splash|water play|easter egg|trick.?or.?treat)\b/.test(text)) return "kids";
  if (/\b(farmers'? market|marketplace|night market|flea market|craft market|artisan market|bazaar|vendor fair|makers? market|swap meet)\b/.test(text)) return "market";
  if (/\b(food|dining|dinner|brunch|breakfast|lunch|supper|culinary|cuisine|tasting|cook.?off|barbecue|bbq|food truck|wine|beer|brewery|cocktail|restaurant|chef)\b/.test(text)) return "food";
  if (/\b(neighbou?rhood|community|block party|town hall|heritage|parade|street fair|county fair|volunteer|cleanup|garden|farm day|homecoming)\b/.test(text)) return "neighborhood";
  return "social";
}

export function eventCategoryArt(category, event) {
  const key = String(category || "").toLowerCase();
  if (key === "community") return COMMUNITY_ART[communityEventArtKind(event)];
  return EVENT_CATEGORY_ART[key] || "";
}
