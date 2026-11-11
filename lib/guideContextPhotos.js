// Context is the final editorial rung, after the exact place's reviewed media.
// Owner, 2026-10-15: "everythign needs to have pictures go to unsplash.com for
// free phots or istock or adopbe stock photos". Context photos are labelled in
// the visible caption and never become place photos, map photos or evidence.
import { EDITORIAL_CONTEXT_PHOTOS } from "./editorialContextPhotos.js";

const FOOD_TOPICS = new Set([
  "dining", "coffee", "brunch", "dessert", "smoothie",
  "casual-food", "seafood", "steak", "cocktails", "ice-cream", "halloween-food"
]);

const RULES = [
  [/\b(beauty|sephora|ulta)\b/i, "beauty"],
  [/\b(food hall|farmers market)\b/i, "dining"],
  [/\b(craft fair|art festival|night market|street market)\b/i, "shopping"],
  [/\b(craft|crayola|coloring|art workshop|pottery|ceramics?)\b/i, "craft"],
  [/\b(manatee|aquarium|marine|wildlife|cownose|red tide|alligator|gatorland)\b/i, "wildlife"],
  [/\b(haunt(?:ed|s|ing)?|horror|howl[\s-]*o[\s-]*scream|scream[\s-]*a[\s-]*geddon|spooky point|fearville|nightmare village|fright|ghost(?:s|busters| tour)?|zombie|skelebration|terror|undead|vampire|witches ride|monster masquerade)\b/i, "haunts"],
  [/\b(brick[\s-]*or[\s-]*treat|trick[\s-]*or[\s-]*treat|not[\s-]*so[\s-]*scary|spooktacular|boo bash|zoo boo|boo in bloom|gators,?\s*ghosts)\b/i, "halloween-family"],
  [/\b(pumpkin\s+(?:cream\s+)?ale|pumpkin\s+beer|brewing|brewer(?:y|ies))\b/i, "cocktails"],
  [/\b(pumpkin spice|halloween food|halloween menu|halloween drink)\b/i, "halloween-food"],
  [/\b(pumpkin|corn maze|hayride|pony|petting zoo|goat|harvest festival|fall farm|berry farm|family farms?|dairy farms?)\b/i, "farm"],
  [/\b(casita taqueria|tacos?|taqueria)\b/i, "casual-food"],
  [/\b(st\.?\s*pete pier|venice.*pier|clearwater.*pier|pier 60)\b/i, "beach"],
  [/\b(tropicana field|devil rays|stingrays|world series|al pennant|\bpennant\b|more cowbell|between-innings|catwalks|in-game promotions)\b/i, "baseball"],
  [/\b(history|science|space center|rocket|museum|mural|art|wynwood|culture|concert|symphony|amphitheatre|amphitheater)\b/i, "culture"],
  [/\b(wheel|rides|roller.?coaster)\b/i, "theme-park"],
  [/\b(topgolf|arcade|escape room|ice.*complex|skating|games|dinner(?: and)? show|pickleball)\b/i, "florida"],
  [/\b(popcorn|cinema|movie|theater|theatre|musical)\b/i, "cinema"],
  [/\b(ice.?cream|gelato|milkshake|shake|blizzard|fudge|kilwins|baskin|culver|cold stone|dairy queen)\b/i, "ice-cream"],
  [/\b(coffee|café|cafe|starbucks|lattes?|espresso|roasters?|matcha)\b/i, "coffee"],
  [/\b(pancake|brunch|breakfast|first watch|word of mouth|dutchman|ihop|blue dolphin)\b/i, "brunch"],
  [/\b(cookie|cakes?|cheesecake|bakery|bundt|crumbl|donut|doughnut|pretzel|panera|dessert|sweet|auntie anne)\b/i, "dessert"],
  [/\b(smoothie|juice)\b/i, "smoothie"],
  [/\b(burger|wahlburger|sandwich|subs|jersey mike|burrito|moe's|chick-fil-a|hot dog|odd dog)\b/i, "casual-food"],
  [/\b(sushi|seafood|fish company|crab|snapper|shrimp|oyster)\b/i, "seafood"],
  [/\b(steak|steakhouse)\b/i, "steak"],
  [/\b(wines?|cocktails?|bars?|pubs?|bingo|beers?|brews?|brewing|brewer(?:y|ies)|ales?|pints|nightlife|night out|oktoberfest|toberfest)\b/i, "cocktails"],
  [/\b(boat parade|lighted.*boat|winterfest)\b/i, "boat-parade"],
  [/\b(firework|countdown|new year|ball drop)\b/i, "fireworks"],
  [/\b(christmas|holidays?|light show|lights|winterland|ice!)\b/i, "holiday-lights"],
  [/\b(halloween)\b/i, "halloween-family"],
  [/\b(theme park|magic kingdom|epcot|legoland|seaworld|roller.?coaster)\b/i, "theme-park"],
  [/\b(beach|shore|sand|key state park|island state park|cape florida|wiggins)\b/i, "beach"],
  [/\b(kayak|spring|river|airboat|marsh|canoe|wetland)\b/i, "nature"],
  [/\b(maze|farm|pony|goat|animal|tractor)\b/i, "farm"],
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
  if (name.trim() === "CAKE") return "culture";
  const ownRule = RULES.find(([rx]) => rx.test(name));
  const restaurantGuide = /\b(restaurants?|dining|cuban[\s.-]*sandwich|brunch)\b/i.test([slug, guide.title].join(" "))
    && !/\b(things[\s-]*to[\s-]*do)\b/i.test(slug);
  // Boilerplate (source links, "Geo: ... market", status lines) is not the
  // pick's subject. "market" in a Geo line once turned concerts into a shop.
  const body = [pick.blurb, pick.detail, pick.description].filter(Boolean).join(" ")
    .replace(/\b(Source|Geo|Status|Signal|Date):[^.]*(\.|$)/g, " ").replace(/https?:\/\/\S+/g, " ")
    .normalize("NFKD").replace(/\p{M}/gu, "").replace(/-/g, " ");
  if (ownRule && (!restaurantGuide || FOOD_TOPICS.has(ownRule[1]))) {
    if (ownRule[1] === "nature" && /\bbeach\b/i.test(body)) return "beach";
    return ownRule[1];
  }
  // A restaurant's name may carry no food words (or may include a street/town
  // like "Winter Park" or "Park Avenue"). A restaurant guide's topic wins.
  if (restaurantGuide) return "dining";
  if (/tropicana-field/i.test(slug) && !ownRule) return "baseball";
  const parent = [guide.title, slug].filter(Boolean).join(" ").replace(/-/g, " ").replace(/not theme parks/gi, "");
  // Once the pick's own identity has had priority, seasonal context is more
  // useful than a passing mention of indoor activities in its description.
  if (/\b(new year|fireworks?|countdown)\b/i.test(parent)) return "fireworks";
  if (/\b(christmas|holidays?)\b/i.test(parent)) return "holiday-lights";
  if (/\bcraft|coloring|art workshop|pottery|ceramics?/i.test(body)) return "craft";
  if (/wax|museum|exhibits?|planetarium|space center|science center/i.test(body)) return "culture";
  if (/food hall|restaurant|kitchen|chef|dining/i.test(body)) return "dining";
  if (/indoor|arcade|escape room|playground/i.test(body) || /in.the.rain/i.test(slug)) return "florida";
  const ownBodyRule = RULES.find(([rx]) => rx.test(body));
  if (ownBodyRule) return ownBodyRule[1];
  return RULES.find(([rx]) => rx.test(parent))?.[1] || "florida";
}

const LABELS = {
  shopping: "shopping", beauty: "beauty", craft: "creative activity", cinema: "cinema", "ice-cream": "ice cream", coffee: "coffee",
  brunch: "breakfast", dessert: "dessert", smoothie: "fruit drink", "casual-food": "casual dining",
  seafood: "seafood", steak: "steak", cocktails: "drinks", "boat-parade": "Christmas boat parade",
  fireworks: "fireworks", hanukkah: "Hanukkah menorah", "holiday-lights": "holiday lights", "theme-park-christmas": "theme park Christmas",
  "theme-park": "theme park", haunts: "haunted attraction", "halloween-family": "family Halloween",
  "halloween-food": "Halloween food", halloween: "Halloween event", "fall-festival": "fall festival",
  baseball: "ballpark", wildlife: "wildlife", beach: "beach", nature: "outdoors", farm: "farm day",
  family: "family outing", hotel: "hotel", culture: "arts", dining: "dining", florida: "Florida travel",
};

const RELATED = {
  cinema: ["culture", "family"], shopping: ["culture", "florida"], smoothie: ["brunch"],
  dessert: ["ice-cream", "brunch"], "casual-food": ["dining"], steak: ["dining"],
  seafood: ["dining"], cocktails: ["dining"], "boat-parade": ["holiday-lights"],
  "theme-park-christmas": ["holiday-lights", "theme-park"],
  haunts: ["halloween", "nature"], "halloween-family": ["halloween", "farm", "theme-park"],
  "halloween-food": ["dessert", "dining"], "fall-festival": ["farm", "dining", "nature"],
  baseball: ["florida"],
  "theme-park": ["family"], family: ["farm", "nature", "theme-park"], wildlife: ["nature"],
  farm: ["fall-festival", "family", "nature"], hotel: ["florida"], culture: ["florida"], florida: ["nature", "beach"],
};

export function isContextAssetUsed(asset, usedSrc) {
  if (!usedSrc || typeof usedSrc.has !== "function") return false;
  if (usedSrc.has(asset.src)) return true;
  if (asset.creditHref && asset.creditHref !== "https://pintofarm.com" && usedSrc.has(asset.creditHref)) return true;
  if (Array.isArray(asset.duplicateSrcs) && asset.duplicateSrcs.some((src) => usedSrc.has(src))) return true;
  return false;
}

export function markContextAssetUsed(asset, usedSrc) {
  if (!usedSrc || typeof usedSrc.add !== "function") return;
  usedSrc.add(asset.src);
  if (asset.creditHref && asset.creditHref !== "https://pintofarm.com") usedSrc.add(asset.creditHref);
  if (Array.isArray(asset.duplicateSrcs)) {
    for (const src of asset.duplicateSrcs) usedSrc.add(src);
  }
}

// Image intent rule (owner, 2026-11-04): every picture must match the intent
// of its content, and no picture beats a wrong one. These subjects have no
// reviewed context photo, so they get none until the Picture Scrapper sources
// a verified photo of the actual act, show, team or venue.
export const NO_CONTEXT_SUBJECT = /\b(concerts?|tour|live music|band|bluegrass|blues|metal|rock|hip hop|symphony|orchestra|candlelight|jazz|guitarist|headliner|comedy|musical|theat(?:er|re)|stage|play|hamilton|ballet|opera|panel|lightning|blackhawks|bucs|buccaneers|hockey|basketball|football|tickets?|meteor|red tide|rink|skating|cownose|tacos?|taqueria|night market|pier|stone crab)\b/i;

const SEASON_FALL = /\b(halloween|haunt\w*|pumpkins?|spooky|boo|trick or treat|fright|horror|fall|autumn|harvest|corn maze|oktoberfest|hayride)\b/i;
const PERFORMANCE_LEAD = /\b(concert|live music|band|bluegrass|blues|metal|headliner|guitarist|comedy|solo comedy|musical|theat(?:er|re)|stage show|play|symphony|orchestra|home game|hockey|basketball)\b/i;

// Image intent pass, 2026-11-09 (owner): these rows were showing a stock
// stand in that did not match the event (popcorn for a play, a beach for a
// fishing festival, the hero ballpark twice). No exact licensed photo was
// found, so the row stays empty rather than show a wrong picture.
const OWNER_EMPTY_ROWS = new Set([
  "trending-in-florida-this-week-nov-2-2026::Grand Wine Tasting at the St. Petersburg Shuffleboard Club",
  "trending-in-florida-this-week-nov-2-2026::Florida Fin Fest",
  "trending-in-florida-this-week-oct-19-2026::Rays win the AL pennant; World Series vs Brewers",
  "trending-in-florida-this-week-oct-19-2026::Beach week weather: sunny all week, breezier weekend",
  "trending-in-florida-this-week-oct-19-2026::45th John's Pass Seafood Festival",
  "trending-in-florida-this-week-oct-19-2026::St. Pete Boos & Booze Halloween Bar Crawl",
  "trending-in-florida-this-week-oct-19-2026::Fruitville Grove Pumpkin Festival",
  "trending-in-florida-this-week-oct-19-2026::Dracula (The Players)",
  "trending-in-florida-this-week-oct-19-2026::Sophisticated Ladies",
  "trending-in-florida-this-week-oct-19-2026::Blood Relations (Lizzie Borden)",
  "gulf-coast-world-series-week-2026::Something Is Beneath the Water",
  "gulf-coast-world-series-week-2026::A Nightmare on Franklin Street",
  "gulf-coast-world-series-week-2026::Gulf beach weather this week",
]);

export function contextPhotoRefusal(slug, pick = {}, guide = {}, desired) {
  const name = String(pick.name || pick.title || pick.event_name || "");
  if (/^search phrase/i.test(String(pick.eyebrow || ""))) return "search-phrase-row";
  // Nov 9 pulse: nine picks have their own vetted photos. Every other row on
  // this page stays empty. A context stand-in is the wrong picture.
  if (slug === "trending-in-florida-this-week-nov-9-2026") return "nov-9-unvetted-row";
  if (OWNER_EMPTY_ROWS.has(`${slug}::${name}`)) return "owner-empty-row";
  if (desired === "florida") return "generic-florida-fallback";
  if (NO_CONTEXT_SUBJECT.test(name)) return "subject-without-reviewed-photo";
  // The lead sentence decides a nameless subject ("Greensky Bluegrass" is a
  // band only once the blurb says so). Generic mentions further down do not.
  const lead = String(pick.blurb || "").replace(/\b(Source|Geo|Status|Date):[^.]*(\.|$)/g, " ").split(/(?<=\.)\s/).slice(0, 2).join(" ");
  if (PERFORMANCE_LEAD.test(lead) && ["culture", "shopping", "nature", "beach", "family", "theme-park"].includes(desired)) return "subject-without-reviewed-photo";
  return null;
}

export function guideContextPhoto(slug, pick = {}, guide = {}, { usedSrc = new Set(), topic, assets = EDITORIAL_CONTEXT_PHOTOS, strict = !topic } = {}) {
  const desired = topic || guideContextTopic(slug, pick, guide);
  // Strict (every caller that lets the pick decide its own topic): refuse
  // generic fallbacks, related-topic substitutes and repeats. Null renders the
  // existing photo-less layout (the renderers already handle a missing image).
  if (strict && contextPhotoRefusal(slug, pick, guide, desired)) return null;
  const topics = strict ? [desired] : [desired, ...(RELATED[desired] || [])];
  let location = [guide.region, guide.title, slug, pick.name, pick.eyebrow, pick.appQuery, ...(guide.contextLocations || [])].filter(Boolean).join(" ");
  // Nearby coastal settings can illustrate their own metro. The actual
  // photographed beach remains named in alt text, never the recommended park.
  if (/\bKey Biscayne\b/i.test(location)) location += " Miami";
  if (/\bDunedin\b/i.test(location)) location += " Clearwater";
  const eligible = assets.filter((asset) => asset.src && asset.credit && asset.license && asset.alt
    && (!asset.locationRestriction || location.toLowerCase().includes(asset.locationRestriction.toLowerCase())));
  const seasonText = [guide.title, slug, pick.name, pick.blurb, pick.detail].filter(Boolean).join(" ");
  let candidates = [], matchedTopic = desired;
  let fallbackCandidates = [], fallbackTopic = desired;
  for (const key of topics) {
    let matches = eligible.filter((asset) => asset.topics.includes(key));
    // A skyline is not a festival, a show or a museum. Strict picks never get
    // a city scene as a stand-in for their own subject.
    if (strict) matches = matches.filter((asset) => !asset.topics.some((t) => t.startsWith("city-")));
    // Seasonal photos only on seasonal content: a pumpkin pile is not a
    // year round farm, and never Christmas content.
    if (strict && !SEASON_FALL.test(seasonText)) matches = matches.filter((asset) => !asset.topics.some((t) => /halloween|pumpkin|^fall$|haunts/.test(t)));
    // A broad travel fallback should show the actual region when a reviewed
    // city image is available, rather than suggest an unrelated activity.
    if (key === "florida") {
      const regional = eligible.filter((asset) => asset.locationRestriction && asset.topics.some((t) => t.startsWith("city-")));
      if (regional.length) matches = regional;
    }
    if (matches.length) {
      if (!fallbackCandidates.length) {
        fallbackCandidates = matches;
        fallbackTopic = key;
      }
      if (matches.some((asset) => !isContextAssetUsed(asset, usedSrc))) {
        candidates = matches;
        matchedTopic = key;
        break;
      }
      // For specific sports/ballpark topics, reusing an eligible ballpark photo
      // is more truthful than falling back to generic beaches or trails.
      if (key === "baseball") break;
    }
  }
  if (!candidates.length) {
    candidates = fallbackCandidates;
    matchedTopic = fallbackTopic;
  }
  if (strict && !candidates.length) return null;
  if (!candidates.length) throw new Error("Missing reviewed editorial context photo: " + desired + " (" + slug + ")");
  // Prefer another relevant photograph on this page. When a long guide uses
  // more examples than the licensed pool contains, relevance still wins.
  const fresh = candidates.filter((asset) => !isContextAssetUsed(asset, usedSrc));
  if (strict && !fresh.length) return null;
  const pool = fresh.length ? fresh : candidates;
  const name = String(pick.name || pick.title || pick.event_name || "this section");
  const seed = [...slug + name].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 0);
  const selected = pool[seed % pool.length];
  markContextAssetUsed(selected, usedSrc);
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
    caption: "Illustrative " + (selected.label || LABELS[matchedTopic] || "travel") + " photo, not " + name + ".",
  };
}

