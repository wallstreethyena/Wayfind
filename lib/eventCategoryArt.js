const EVENT_CATEGORY_ART = Object.freeze({
  concerts: "/events/concerts-audience.jpg",
  theater: "/events/theater-stage.jpg",
  community: "/events/local-events-market.jpg",
  tours: "/events/local-tours-kayak.jpg",
});

export function eventCategoryArt(category) {
  return EVENT_CATEGORY_ART[String(category || "").toLowerCase()] || "";
}
