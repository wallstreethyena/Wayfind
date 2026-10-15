// Context is the final editorial rung, after the exact place's reviewed media.
// Owner, 2026-10-15: "everythign needs to have pictures go to unsplash.com for
// free phots or istock or adopbe stock photos". Context photos are labelled in
// the visible caption and never become place photos, map photos or evidence.
import { EDITORIAL_CONTEXT_PHOTOS } from "./editorialContextPhotos.js";

const RULES = [
  [/\b(beauty|sephora|ulta)\b/i, "beauty"],
  [/\b(food hall|farmers market)\b/i, "dining"],
  [/\b(history|science|space center|rocket|museum|mural|art|wynwood|culture)\b/i, "culture"],
  [/\b(wheel|rides|roller.?coaster|topgolf)\b/i, "theme-park"],
  [/\b(popcorn|cinema|movie|theater|theatre)\b/i, "cinema"],
  [/\b(ice.?cream|gelato|milkshake|shake|blizzard|fudge|kilwins|baskin|culver|cold stone|dairy queen)\b/i, "ice-cream"],
  [/\b(coffee|café|cafe|starbucks|latte)\b/i, "coffee"],
  [/\b(pancake|brunch|breakfast|first watch|word of mouth|dutchman|ihop|blue dolphin)\b/i, "brunch"],
  [/\b(cookie|cakes?|cheesecake|bakery|bundt|crumbl|donut|doughnut|pretzel|panera|dessert|sweet|auntie anne)\b/i, "dessert"],
  [/\b(smoothie|juice)\b/i, "smoothie"],
  [/\b(burger|wahlburger|sandwich|subs|jersey mike|burrito|moe's|chick-fil-a|hot dog)\b/i, "casual-food"],
  [/\b(sushi|seafood|fish company|crab|snapper|shrimp|oyster)\b/i, "seafood"],
  [/\b(steak|steakhouse)\b/i, "steak"],
  [/\b(wine|cocktail|bar|pub|bingo|beer|brew|ale|pints|nightlife|night out|oktoberfest)\b/i, "cocktails"],
  [/\b(boat parade|lighted.*boat|winterfest)\b/i, "boat-parade"],
  [/\b(firework|countdown|new year|ball drop)\b/i, "fireworks"],
  [/\b(christmas|holiday|light show|lights|winterland|jollywood|ice!)\b/i, "holiday-lights"],
  [/\b(theme park|magic kingdom|epcot|legoland|seaworld|roller.?coaster|topgolf)\b/i, "theme-park"],
  [/\b(manatee|aquarium|marine|wildlife)\b/i, "wildlife"],
  [/\b(beach|shore|sand|key state park|island state park|cape florida|wiggins)\b/i, "beach"],
  [/\b(kayak|spring|river|airboat|marsh|canoe|wetland)\b/i, "nature"],
  [/\b(pumpkin|maze|farm|pony|goat|animal|tractor)\b/i, "farm"],
  [/\b(arcade|escape room|crayola|ice.*complex|skating|games)\b/i, "family"],
  [/\b(outlet|shop|mall|market|main street)\b/i, "shopping"],
  [/\b(parks?|gardens?|trail|boardwalk|bayfront|waterside|walk|preserve)\b/i, "nature"],
  [/\b(hotel|resort|four seasons|suites)\b/i, "hotel"],
];

export function guideContextTopic(slug, pick = {}, guide = {}) {
  const name = String(pick.name || pick.title || pick.event_name || "").normalize("NFKD").replace(/\p{M}/gu, "");
  if (typeof pick.photoTopic === "string" && LABELS[pick.photoTopic]) return pick.photoTopic;
  // A category is stronger evidence than a passing mention in surrounding
  // prose. For example, a hotel's proximity to Magic Kingdom is not its topic.
  if (/hotel|resort|stay/i.test([slug, guide.title].join(" "))) return "hotel";
  if (/\bmarket\b/i.test(name) && /food.?hall|local makers|food|produce/i.test(String(pick.blurb || pick.detail || ""))) return "dining";
  const ownRule = RULES.find(([rx]) => rx.test(name));
  const restaurantGuide = /restaurant|dining|cuban.sandwich|brunch/i.test([slug, guide.title].join(" "));
  const body = [pick.blurb, pick.detail, pick.description].filter(Boolean).join(" ").normalize("NFKD").replace(/\p{M}/gu, "").replace(/-/g, " ");
  if (ownRule && !(restaurantGuide && ownRule[1] === "shopping")) {
    if (ownRule[1] === "nature" && /\bbeach\b/i.test(body)) return "beach";
    return ownRule[1];
  }
  // A restaurant's name may carry no food words. A restaurant guide's topic
  // wins over incidental vocabulary in a long blurb (e.g. "near the park").
  if (restaurantGuide) return "dining";
  if (/wax|museum|exhibits?|planetarium|space center|science center/i.test(body)) return "culture";
  if (/food hall|restaurant|kitchen|chef|dining/i.test(body)) return "dining";
  if (/indoor|arcade|escape room|craft|playground/i.test(body) || /in.the.rain/i.test(slug)) return "family";
  const ownBodyRule = RULES.find(([rx]) => rx.test(body));
  if (ownBodyRule) return ownBodyRule[1];
  const parent = [guide.title, slug].filter(Boolean).join(" ").replace(/-/g, " ").replace(/not theme parks/gi, "");
  return RULES.find(([rx]) => rx.test(parent))?.[1] || "florida";
}

const LABELS = {
  shopping: "shopping", beauty: "beauty", cinema: "cinema", "ice-cream": "ice cream", coffee: "coffee",
  brunch: "breakfast", dessert: "dessert", smoothie: "fruit drink", "casual-food": "casual dining",
  seafood: "seafood", steak: "steak", cocktails: "drinks", "boat-parade": "coastal holiday",
  fireworks: "fireworks", "holiday-lights": "holiday lights", "theme-park": "theme park",
  wildlife: "wildlife", beach: "beach", nature: "outdoors", farm: "farm day", family: "family outing",
  hotel: "hotel", culture: "arts", dining: "dining", florida: "Florida travel",
};

const RELATED = {
  cinema: ["family"], shopping: ["culture", "florida"], smoothie: ["brunch"],
  dessert: ["ice-cream", "brunch"], "casual-food": ["dining"], steak: ["dining"],
  seafood: ["dining"], cocktails: ["dining"], "boat-parade": ["holiday-lights"],
  "theme-park": ["family"], family: ["theme-park"], wildlife: ["nature"],
  farm: ["nature"], hotel: ["florida"], culture: ["florida"], florida: ["nature", "beach"],
};

export function guideContextPhoto(slug, pick = {}, guide = {}, { usedSrc = new Set(), topic, assets = EDITORIAL_CONTEXT_PHOTOS } = {}) {
  const desired = topic || guideContextTopic(slug, pick, guide);
  const topics = [desired, ...(RELATED[desired] || [])];
  let location = [guide.region, guide.title, slug, pick.name, pick.eyebrow, pick.appQuery, ...(guide.contextLocations || [])].filter(Boolean).join(" ");
  // Nearby coastal settings can illustrate their own metro. The actual
  // photographed beach remains named in alt text, never the recommended park.
  if (/\bKey Biscayne\b/i.test(location)) location += " Miami";
  if (/\bDunedin\b/i.test(location)) location += " Clearwater";
  const eligible = assets.filter((asset) => asset.src && asset.credit && asset.license && asset.alt
    && (!asset.locationRestriction || location.toLowerCase().includes(asset.locationRestriction.toLowerCase())));
  let candidates = [], matchedTopic = desired;
  for (const key of topics) {
    const matches = eligible.filter((asset) => asset.topics.includes(key));
    if (matches.length) { candidates = matches; matchedTopic = key; break; }
  }
  if (!candidates.length) throw new Error("Missing reviewed editorial context photo: " + desired + " (" + slug + ")");
  // Prefer another relevant photograph on this page. When a long guide uses
  // more examples than the licensed pool contains, relevance still wins.
  const fresh = candidates.filter((asset) => !usedSrc.has(asset.src));
  const pool = fresh.length ? fresh : candidates;
  const name = String(pick.name || pick.title || pick.event_name || "this section");
  const seed = [...slug + name].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 0);
  const selected = pool[seed % pool.length];
  usedSrc.add(selected.src);
  return {
    src: selected.src, width: selected.width, height: selected.height,
    position: selected.position,
    credit: selected.credit, creditHref: selected.creditHref,
    license: selected.license, licenseUrl: selected.licenseUrl,
    modificationNotice: selected.modificationNotice,
    contextual: true,
    kind: "illustrative",
    placeId: null,
    alt: selected.alt + "; contextual photograph, not a photograph of " + name,
    caption: "Illustrative " + (selected.label || LABELS[matchedTopic] || "travel") + " photo.",
  };
}
