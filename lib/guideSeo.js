import { SITE_URL } from "./site.js";

// Hand-reviewed relationships only. A shared city is not enough: each link
// must help the reader make the same outing decision or a clear next one.
export const GUIDE_CONTEXT_LINKS = Object.freeze({
  "swim-with-manatees-crystal-river": ["florida-scalloping-crystal-river-homosassa", "weeki-wachee-kayak-mermaids-guide"],
  "bioluminescence-kayak-tour-space-coast": ["weeki-wachee-kayak-mermaids-guide", "swim-with-manatees-crystal-river"],
  "florida-scalloping-crystal-river-homosassa": ["swim-with-manatees-crystal-river", "weeki-wachee-kayak-mermaids-guide"],
  "weeki-wachee-kayak-mermaids-guide": ["swim-with-manatees-crystal-river", "florida-scalloping-crystal-river-homosassa"],
  "winter-park-scenic-boat-tour": ["things-to-do-orlando-not-theme-parks", "orlando-in-the-rain"],
  "siesta-key-drum-circle": ["siesta-key-vs-lido-key", "things-to-do-in-sarasota-florida"],
  "pinecraft-sarasota-amish-village": ["things-to-do-in-sarasota-florida", "gulf-coast-brunch-and-date-night"],
  "siesta-key-vs-lido-key": ["anna-maria-island-day-trip", "things-to-do-in-sarasota-florida"],
  "things-to-do-sarasota": ["myakka-river-state-park-guide", "siesta-key-vs-lido-key"],
  "best-cuban-sandwich-tampa": ["ybor-city-tampa-guide", "things-to-do-in-tampa-florida"],
  "st-armands-circle-restaurants": ["gulf-coast-brunch-and-date-night", "sarasota-half-price-dining"],
  "best-restaurants-disney-springs": ["magical-dining-orlando-2026", "orlando-halloween-food-2026"],
  "best-hotels-near-magic-kingdom": ["things-to-do-orlando-not-theme-parks", "orlando-in-the-rain"],
  "gatorland-vs-wild-florida": ["things-to-do-orlando-not-theme-parks", "orlando-in-the-rain"],
  "things-to-do-orlando-not-theme-parks": ["orlando-in-the-rain", "winter-park-scenic-boat-tour"],
  "sarasota-half-price-dining": ["st-armands-circle-restaurants", "gulf-coast-brunch-and-date-night"],
  "orlando-in-the-rain": ["things-to-do-orlando-not-theme-parks", "winter-park-scenic-boat-tour"],
  "birthday-freebies-bradenton-sarasota": ["sarasota-half-price-dining", "gulf-coast-brunch-and-date-night"],
  "anna-maria-island-day-trip": ["siesta-key-vs-lido-key", "robinson-preserve-bradenton"],
  "myakka-river-state-park-guide": ["things-to-do-in-sarasota-florida", "robinson-preserve-bradenton"],
  "ybor-city-tampa-guide": ["best-cuban-sandwich-tampa", "things-to-do-in-tampa-florida"],
  "tampa-riverwalk-guide": ["things-to-do-in-tampa-florida", "ybor-city-tampa-guide"],
  "de-soto-national-memorial-bradenton": ["robinson-preserve-bradenton", "anna-maria-island-day-trip"],
  "robinson-preserve-bradenton": ["de-soto-national-memorial-bradenton", "anna-maria-island-day-trip"],
  "magical-dining-orlando-2026": ["best-restaurants-disney-springs", "orlando-halloween-food-2026"],
  "things-to-do-orlando-summer-2026": ["things-to-do-orlando-not-theme-parks", "orlando-in-the-rain"],
  "things-to-do-tampa-summer-2026": ["things-to-do-in-tampa-florida", "tampa-riverwalk-guide"],
  "things-to-do-st-petersburg-clearwater-summer-2026": ["things-to-do-in-tampa-florida", "tampa-riverwalk-guide"],
  "things-to-do-in-parrish-florida": ["robinson-preserve-bradenton", "de-soto-national-memorial-bradenton"],
  "things-to-do-in-sarasota-florida": ["myakka-river-state-park-guide", "siesta-key-vs-lido-key"],
  "things-to-do-in-tampa-florida": ["ybor-city-tampa-guide", "tampa-riverwalk-guide"],
  "gulf-coast-brunch-and-date-night": ["st-armands-circle-restaurants", "sarasota-half-price-dining"],
  "orlando-halloween-food-2026": ["fall-events-orlando-2026", "best-restaurants-disney-springs"],
  "fall-events-orlando-2026": ["orlando-halloween-food-2026", "things-to-do-orlando-not-theme-parks"],
});

const GUIDE_CONTEXT_NOTES = Object.freeze({
  "winter-park-scenic-boat-tour": { "orlando-in-the-rain": "Wet-weather backup" },
  "orlando-in-the-rain": { "winter-park-scenic-boat-tour": "For a clear-weather day" },
});

// These labels restate choices already made in the corresponding guide. Pages
// without enough structured evidence get no shortcut instead of generic filler.
export const GUIDE_QUICK_CHOICES = Object.freeze({
  "swim-with-manatees-crystal-river": [
    { need: "Get in the water", label: "Kings Bay manatee swim", href: "#pick-1", pickName: "Swim with the manatees in Kings Bay", evidence: "legally get in the water" },
    { need: "Stay dry", label: "Three Sisters Springs boardwalk", href: "#pick-3", pickName: "Three Sisters Springs boardwalk, stay dry", evidence: "rather not get in" },
    { need: "Do not swim", label: "Manatee eco-cruise", href: "#pick-4", pickName: "A manatee eco-cruise for non-swimmers", evidence: "keep you topside" },
  ],
  "siesta-key-vs-lido-key": [
    { need: "Prioritize the sand", label: "Choose Siesta Key", href: "#pick-1", pickName: "Siesta Key: the sand", evidence: "99% quartz sand" },
    { need: "Balance beach and town", label: "Choose Lido Key", href: "#pick-2", pickName: "Lido Key: the balance", evidence: "restaurants a five-minute walk" },
    { need: "Make the final call", label: "Read the verdict", href: "#pick-3", pickName: "The verdict", evidence: "Siesta, the sand earns the hassle" },
  ],
  "best-hotels-near-magic-kingdom": [
    { need: "Walk to the gate", label: "Contemporary Resort", href: "#pick-1", pickName: "Disney's Contemporary Resort", evidence: "walk to Magic Kingdom" },
    { need: "Ride the monorail", label: "Polynesian Village Resort", href: "#pick-2", pickName: "Disney's Polynesian Village Resort", evidence: "Monorail access" },
    { need: "Take the boat", label: "Wilderness Lodge", href: "#pick-4", pickName: "Disney's Wilderness Lodge", evidence: "Boat to Magic Kingdom" },
  ],
  "gatorland-vs-wild-florida": [
    { need: "Classic gator park", label: "Choose Gatorland", href: "#pick-1", pickName: "Gatorland: the classic park", evidence: "Stronger shows" },
    { need: "Add an airboat", label: "Choose Wild Florida", href: "#pick-2", pickName: "Wild Florida: the airboat experience", evidence: "real airboat rides" },
    { need: "Compare the trade-offs", label: "Read the verdict", href: "#pick-3", pickName: "The verdict", evidence: "Choose Gatorland" },
  ],
  "orlando-in-the-rain": [
    { need: "Fill a long washout", label: "Orlando Science Center", href: "#pick-6", pickName: "Orlando Science Center", evidence: "genuinely long rainy day" },
    { need: "Fill about an hour", label: "Museum of Illusions", href: "#pick-4", pickName: "Museum of Illusions Orlando", evidence: "photo-driven hour" },
    { need: "Keep it walk-in", label: "Arcade Monsters", href: "#pick-9", pickName: "Arcade Monsters International Drive", evidence: "No timed ticket, no reservation" },
  ],
  "orlando-halloween-food-2026": [
    { need: "Eat inside HHN 35", label: "Start with Jack & Odd Dog", href: "#pick-1", pickName: "Jack & Odd Dog", evidence: "during Halloween Horror Nights 35" },
    { need: "Skip park admission", label: "Go to Raglan Road", href: "#pick-18", pickName: "Raglan Ghostly Guinness Pie", evidence: "Raglan Road Irish Pub & Restaurant is at Disney Springs" },
    { need: "Find a 21+ drink", label: "See Ultimate Sin-Amon", href: "#pick-11", pickName: "Ultimate Sin-Amon", evidence: "21-and-over cocktail" },
  ],
  "fall-events-orlando-2026": [
    { need: "Adult Halloween night", label: "Halloween Horror Nights 35", href: "#pick-1", pickName: "Halloween Horror Nights 35", evidence: "not recommended for children under 13" },
    { need: "All-ages Halloween", label: "Mickey's Not-So-Scary party", href: "#pick-3", pickName: "Mickey's Not-So-Scary Halloween Party", evidence: "do not want to be scared" },
    { need: "Free festival", label: "Come Out With Pride", href: "#pick-8", pickName: "Come Out With Pride", evidence: "It is free" },
  ],
});

export function guideContextLinks(slug, guides) {
  return (GUIDE_CONTEXT_LINKS[slug] || []).map((target) => ({ slug: target, title: guides[target]?.title, note: GUIDE_CONTEXT_NOTES[slug]?.[target] || null })).filter((link) => link.title);
}

export function guideQuickChoices(slug) { return GUIDE_QUICK_CHOICES[slug] || []; }

export function guideImageMetadata(art) {
  if (!art || art.kind === "unavailable" || !art.src) return null;
  const url = art.src.startsWith("/") ? SITE_URL + art.src : /^https:\/\//.test(art.src) ? art.src : null;
  if (!url) return null;
  return { url, width: art.width, height: art.height, alt: art.alt };
}

export function guideArticleImage(art) {
  const image = guideImageMetadata(art);
  if (!image) return null;
  return { "@type": "ImageObject", url: image.url, width: image.width, height: image.height, caption: art.caption };
}
