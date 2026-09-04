import { experienceWayfindScore } from "./experiencesData.js";
import { wayfindScore } from "./wayfindScore.js";

export const SUMMER_PICK_LIMIT = 20;

export const SUMMER_PICK_RAILS = Object.freeze([
  { id: "waterfront", title: "Beaches, Swimming & Waterfront", deck: "The best places to cool off." , placeSources: ["beach"], placeRx: /beach|waterfront|sandbar|pier|swim|pool|island|shore|bayfront|riverfront/i, tourCats: ["water"], tourRx: /beach|dolphin|sunset|catamaran|sail|sandbar|shell|cruise|boat|snorkel/i },
  { id: "water-adventures", title: "Water Adventures", deck: "Unforgettable Florida days on the water." , placeSources: [], placeRx: /kayak|paddle|boat|dolphin|snorkel|tubing|spring|jet.?ski|parasail|airboat|charter|canoe|scallop|biolum/i, tourCats: ["kayaking", "parasailing", "airboat", "water", "adventure"], tourRx: /kayak|paddle|boat|dolphin|snorkel|tubing|jet.?ski|parasail|airboat|charter|scallop|biolum/i },
  { id: "family", title: "Family Fun & Kids’ Activities", deck: "Big fun for every age." , placeSources: ["family"], placeRx: /children|kids?|family|splash|water park|aquarium|zoo|arcade|bowling|mini.?golf|trampoline|science|playground/i, tourCats: ["theme", "museums", "nature"], tourRx: /family|kids?|children|aquarium|zoo|pirate|legoland|water park|wildlife|beginner/i },
  { id: "indoor", title: "Indoor & Rainy-Day Escapes", deck: "Cool indoor plans for stormy afternoons." , placeSources: [], placeRx: /museum|aquarium|cinema|movie|escape room|bowling|arcade|library|bookstore|mall|science|indoor|gallery|art center|convention/i, tourCats: ["museums"], tourRx: /museum|aquarium|indoor|escape room|virtual reality|cooking class|cocktail class|chocolate|dinner show|observation/i },
  { id: "attractions", title: "Theme Parks & Major Attractions", deck: "Big attractions worth planning ahead for." , placeSources: [], placeRx: /theme park|amusement|universal|disney|busch gardens|seaworld|legoland|kennedy space|gatorland|zoo|aquarium|wild florida|observation/i, tourCats: ["theme"], tourRx: /theme park|universal|disney|busch gardens|seaworld|legoland|kennedy space|gatorland|zoo|aquarium|wild florida|attraction pass/i },
  { id: "food", title: "Food, Cold Treats & Waterfront Dining", deck: "Summer flavors made for Florida evenings." , placeSources: ["eat", "break", "breakfast", "chef"], placeRx: /ice cream|gelato|frozen|aça[ií]|smoothie|juice|seafood|oyster|tiki|waterfront|rooftop|food hall|coffee/i, tourCats: [], tourRx: /food|culinary|tasting|taste|dinner|dessert|chocolate|coffee|brewery|distillery|cocktail|cooking|key lime/i },
  { id: "nightlife", title: "Nightlife, Sunsets & Date Night", deck: "Where summer gets better after sunset." , placeSources: ["tonight", "datenight"], placeRx: /sunset|rooftop|cocktail|wine bar|tiki|live music|comedy|night market|nightlife|beach bar|lounge|club/i, tourCats: [], tourRx: /sunset|night|evening|ghost|pub|bar crawl|cocktail|comedy|dinner cruise|biolum|helicopter/i },
  { id: "nature", title: "Nature, Wildlife & Outdoor Adventure", deck: "Wild Florida adventures worth getting outside." , placeSources: [], placeRx: /state park|preserve|wildlife|refuge|garden|spring|mangrove|nature|eco|trail|cavern|forest|manatee|dolphin|bird/i, tourCats: ["nature", "airboat", "kayaking", "adventure"], tourRx: /everglades|wildlife|eco|nature|manatee|dolphin|bird|spring|mangrove|fishing|hiking|national park/i },
  { id: "events", title: "Events, Festivals & Holiday Weekends", deck: "The events worth showing up for." , acceptPlace: false, placeSources: [], placeRx: /festival|concert|fireworks|market|summer nights|music walk|art walk|fair/i, tourCats: [], tourRx: /concert|show|fireworks|holiday|festival|limited|seasonal|weekend|sports event/i },
  { id: "shopping", title: "Shopping, Markets & Local Finds", deck: "Local finds worth making a stop." , placeSources: [], placeRx: /shopping|market|boutique|outlet|mall|antique|vintage|bookstore|record store|arts district|makers?|circle|downtown|avenue/i, tourCats: ["walking", "historical"], tourRx: /shopping|fashion|design district|art district|street art|market|boutique|vintage|artisan|maker|architecture|neighborhood walk/i },
]);

const textOf = (item) => [
  item?.name, item?.title, item?.primaryType, item?.primary_type, item?.category,
  item?._summerWhy, ...(item?.types || []), ...(item?.categories || []),
].filter(Boolean).join(" ");

export function summerPlaceHasRealPhoto(place) {
  return !!(place && (place.photoRef || place.photo_ref || place.photoUrl || place.photo_url));
}

function relevance(def, item, kind) {
  const text = textOf(item);
  if (kind === "tour") {
    const tags = Array.isArray(item?.categories) ? item.categories : [];
    return (def.tourRx.test(text) ? 4 : 0) + (def.tourCats.some((tag) => tags.includes(tag)) ? 3 : 0);
  }
  const sources = Array.isArray(item?._sourceRails) ? item._sourceRails : [];
  if (def.acceptPlace === false) return 0;
  return (def.placeRx.test(text) ? 4 : 0) + (def.placeSources.some((id) => sources.includes(id)) ? 2 : 0);
}

function scoreOf(item, kind) {
  if (kind === "tour") return experienceWayfindScore(item);
  const explicit = Number(item?.wfScore ?? item?.governed_score ?? item?._s);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return wayfindScore(item?.rating, item?.reviews) || 0;
}

export function composeSummerPickRails(places, tours, limit = SUMMER_PICK_LIMIT) {
  const placeRows = (Array.isArray(places) ? places : []).filter((place) => place?.id && place?.name && summerPlaceHasRealPhoto(place));
  const tourRows = (Array.isArray(tours) ? tours : []).filter((tour) => tour?.code && tour?.title && tour?.image);
  return SUMMER_PICK_RAILS.map((def) => {
    const candidates = [];
    for (const place of placeRows) {
      const fit = relevance(def, place, "place");
      if (fit > 0) candidates.push({ ...place, kind: "place", _summerFit: fit });
    }
    for (const tour of tourRows) {
      const fit = relevance(def, tour, "tour");
      if (fit > 0) candidates.push({ ...tour, kind: "tour", _summerFit: fit });
    }
    const seen = new Set();
    candidates.sort((a, b) =>
      (b._summerFit - a._summerFit)
      || (scoreOf(b, b.kind) - scoreOf(a, a.kind))
      || ((Number(b.reviews) || 0) - (Number(a.reviews) || 0))
    );
    const ranked = candidates.filter((item) => {
      const key = item.kind === "tour" ? `tour:${item.code}` : `place:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { ...def, total: ranked.length, cards: ranked.slice(0, Math.max(1, Number(limit) || SUMMER_PICK_LIMIT)) };
  });
}
