// Pure, dependency-free membership test for the browse page's Bookable nearby
// rail. This is deliberately stricter than catalogue membership: a Viator tag
// says how a product was harvested, while this function answers whether the
// product makes sense beneath the exact menu and chip the reader selected.

const text = (row) => String(row && row.title || "");
const tags = (row) => Array.isArray(row && row.categories) ? row.categories : [];
const hasTag = (row, ...wanted) => wanted.some((key) => tags(row).includes(key));
const has = (row, rx) => rx.test(text(row));
const dealText = (row) => [row && row.title, row && row.subtitle, row && row.category, row && row.subcategory, row && row.type]
  .filter(Boolean).join(" ");

const FAMILY = /\b(famil(?:y|ies)|family[- ]friendly|kid(?:s|do)?[- ]friendly|for kids|children|all ages|peppa|legoland|aquarium|zoo|petting zoo|children(?:'s)? museum|water park)\b/i;
const TODDLER = /\b(toddlers?|preschool(?:ers?)?|little ones|peppa(?: pig)?|petting zoo|children(?:'s)? museum|splash pad|aquarium|zoo)\b/i;
const INDOOR_FAMILY = /\b(children(?:'s)? museum|science (?:center|centre|museum)|aquarium|arcade|indoor (?:play|playground|activity|activities|attraction)|trampoline park|bowling|planetarium)\b/i;
const KNOWN_FAMILY_PARK = /\b(theme park|water park|legoland|peppa(?: pig)?|disney(?:land| world)?|magic kingdom|universal (?:orlando|studios)|seaworld|busch gardens|gatorland|fun spot|crayola|kennedy space center|wonderworks)\b/i;
const FAMILY_UNSAFE = /(?:\b(?:adults?[- ]only|shoot(?:ing|er)|gun(?:s|fire)?|firearms?|haunted|ghosts?|horror|pub crawl|bar crawl|nightclub)\b|\b21\+(?=\s|$|[),.;:!?-]))/i;
const RAINY_OUTDOOR = /\b(outdoor|open[- ]air|boat|boating|cruise|kayak|paddle|parasail|jet ski|airboat|snorkel|theme park|water park)\b/i;
const NIGHT = /\b(bar crawl|pub crawl|club crawl|nightclub|nightlife|night tour|after[- ]dark|speakeasy|ghost tour|haunted|evening walking tour)\b/i;
const WELLNESS = /\b(spa|massage|wellness|yoga|thermal bath|hot spring|sauna|hammam|meditation retreat)\b/i;
const OUTDOOR_ACTIVITY = /\b(kayak(?:ing)?|canoe(?:ing)?|paddleboard(?:ing)?|snorkel(?:ing)?|parasail(?:ing)?|jet ski(?:ing)?|airboat|hiking|nature (?:tour|walk|adventure)|wildlife (?:tour|safari|cruise)|eco(?:tour|[- ]tour)|outdoor adventure|ziplin(?:e|ing)|bike tour)\b/i;
const BEACH_ACTIVITY = /\b(?:beach|ocean|gulf|coastal?)\b.{0,45}\b(?:tour|cruise|boat|sail|dolphin|snorkel|parasail|jet ski|paddle|kayak|surf)\b|\b(?:tour|cruise|boat|sail|dolphin|snorkel|parasail|jet ski|paddle|kayak|surf)\b.{0,45}\b(?:beach|ocean|gulf|coastal?)\b|\b(?:snorkel(?:ing)?|parasail(?:ing)?|surf(?:ing)? lesson)\b/i;
const ARTS_ACTIVITY = /\b(?:art|arts|gallery|galleries|mural|theat(?:er|re))\b.{0,35}\b(?:tour|walk|admission|ticket|experience|workshop|class)\b|\b(?:tour|walk|admission|ticket|experience|workshop|class)\b.{0,35}\b(?:art|arts|gallery|galleries|mural|theat(?:er|re))\b/i;
const WATER_ACTIVITY = /\b(sailboat|sailing|boat (?:tour|trip|cruise|charter|rental)|sunset cruise|harbor cruise|harbour cruise|marina tour|yacht charter|jet ski(?:ing)?|paddleboard(?:ing)?|kayak(?:ing)?|water taxi)\b/i;

const RULES = Object.freeze({
  attractions: Object.freeze({
    all: () => true,
    outdoors: (r) => hasTag(r, "nature", "adventure", "kayaking") || has(r, OUTDOOR_ACTIVITY),
    beaches: (r) => (hasTag(r, "water", "parasailing") && has(r, /\b(beach|ocean|gulf|coast|coastal|island|water|boat|sail|cruise|parasail|jet ski|paddle|kayak|snorkel|dolphin|manatee)\b/i)) || (!has(r, /\bbeach street\b/i) && has(r, BEACH_ACTIVITY)),
    museums: (r) => hasTag(r, "museums") || has(r, /\b(museum|gallery|galleries)\b/i),
    family: (r) => !has(r, FAMILY_UNSAFE) && (hasTag(r, "theme") || has(r, FAMILY)),
    tours: () => true,
    spa: (r) => has(r, WELLNESS),
    landmarks: (r) => hasTag(r, "historical") || has(r, /\b(landmark|monument|historic|heritage|city tour|sightseeing)\b/i),
    arts: (r) => (hasTag(r, "museums") && has(r, /\b(art|gallery|galleries|theat(?:er|re)|mural)\b/i)) || (!has(r, /\bart of\b/i) && has(r, ARTS_ACTIVITY)),
    marinas: (r) => (hasTag(r, "water") && has(r, /\b(boat|sail|cruise|marina|charter|jet ski|paddle|kayak|water)\b/i)) || has(r, WATER_ACTIVITY),
  }),
  beach: Object.freeze({
    all: (r) => RULES.attractions.beaches(r),
    beaches: (r) => RULES.attractions.beaches(r),
  }),
  nightlife: Object.freeze({
    all: (r) => has(r, NIGHT),
    bars: (r) => has(r, /\b(bar crawl|pub crawl|pub tour|brewery crawl|cocktail tour)\b/i),
    clubs: (r) => has(r, /\b(nightclub|club crawl|nightlife party|party (?:bus|tour|cruise))\b/i),
    speakeasy: (r) => has(r, /\b(speakeasy|cocktail|mixolog)\b/i),
    karaoke: (r) => has(r, /\bkaraoke\b/i),
    sports: (r) => has(r, /\b(sports? bar|game[- ]day|stadium|ballpark)\b/i),
    // A ghost tour is nightlife, but it is not live music merely because it
    // happens at night. Music needs its own affirmative evidence.
    music: (r) => has(r, /\b(live music|music tour|musical|concert|jazz|blues|live band|music venue)\b/i),
  }),
  family: Object.freeze({
    // The harvested theme tag is reviewed family inventory and is sufficient
    // for the broad All surface. Age/weather chips below still need proof.
    all: (r) => !has(r, FAMILY_UNSAFE) && (hasTag(r, "theme") || has(r, FAMILY) || has(r, KNOWN_FAMILY_PARK)),
    toddlers: (r) => !has(r, FAMILY_UNSAFE) && has(r, TODDLER),
    kids: (r) => !has(r, FAMILY_UNSAFE) && has(r, FAMILY),
    // This chip still means a family outing. "Adults only" and a generic
    // adventure tag do not qualify without explicit shared-age evidence.
    adults: (r) => !has(r, FAMILY_UNSAFE) && has(r, FAMILY) && has(r, /\b(adults?|grown[- ]ups?|parents?|all ages|whole family|family[- ]friendly)\b/i),
    // Outdoor theme-park membership is not evidence that an activity works on
    // a rainy day. Require an indoor family activity named in the product.
    rainy: (r) => !has(r, FAMILY_UNSAFE) && !has(r, RAINY_OUTDOOR) && has(r, INDOOR_FAMILY),
  }),
  // Viator currently sells neither restaurant seats nor lodging. Returning no
  // rows preserves those product decisions even if a title happens to contain
  // "dinner" or "hotel pickup".
  food: Object.freeze({ all: () => false, breakfast: () => false, cafes: () => false, lunch: () => false, dinner: () => false, quickbites: () => false, delivery: () => false, dessert: () => false }),
  hotels: Object.freeze({ all: () => false, luxury: () => false, budget: () => false, beach: () => false, boutique: () => false }),
  // Current cached experience inventory is deliberately disabled for Shopping
  // in CHIP_COMMERCE; its measured corpus is too thin to constitute a rail.
  shopping: Object.freeze({ all: () => false, malls: () => false, boutiques: () => false, markets: () => false, outlets: () => false, giftshops: () => false }),
});

const DEAL_SUBCATEGORIES = new Set(["theme_parks", "theme_park_hotels", "seasonal_events", "car_rental", "movies", "ski", "museum", "museums"]);

function dealMatches(row, browseCat, browseSub) {
  const cat = String(browseCat || "");
  const sub = String(browseSub || "all");
  const dealSub = String(row && row.subcategory || "");
  if (!DEAL_SUBCATEGORIES.has(dealSub)) return false;
  const adapted = { ...row, title: dealText(row), categories: [] };

  // Deals carry their commercial subtype rather than Viator catalogue tags.
  // Admit the subtype only where it is affirmative evidence for this surface;
  // narrower chips still require their own words in the row.
  if (cat === "attractions") {
    if (sub === "all") return ["theme_parks", "seasonal_events", "movies", "ski", "museum", "museums"].includes(dealSub);
    if (sub === "outdoors") return dealSub === "ski" || /\b(outdoor|park admission|water park)\b/i.test(adapted.title);
    if (sub === "family") return !FAMILY_UNSAFE.test(adapted.title) && (dealSub === "theme_parks" || FAMILY.test(adapted.title));
    if (sub === "museums") return dealSub === "museum" || dealSub === "museums" || RULES.attractions.museums(adapted);
    if (sub === "tours") return /\btours?\b/i.test(adapted.title);
    const rule = RULES.attractions[sub];
    return typeof rule === "function" && rule(adapted);
  }
  if (cat === "family") {
    if (sub === "all" && dealSub === "theme_parks") return !FAMILY_UNSAFE.test(adapted.title);
    const rule = RULES.family[sub];
    return typeof rule === "function" && rule(adapted);
  }
  if (cat === "hotels") {
    if (dealSub !== "theme_park_hotels") return false;
    if (sub === "all") return true;
    const evidence = {
      luxury: /\b(luxury|deluxe|five[- ]star|5[- ]star|premium)\b/i,
      budget: /\b(budget|affordable|value|save|discount)\b/i,
      beach: /\b(beach|oceanfront|waterfront|coastal|gulf)\b/i,
      boutique: /\bboutique\b/i,
    }[sub];
    return !!evidence && evidence.test(adapted.title);
  }
  if (cat === "nightlife") {
    const rule = RULES.nightlife[sub];
    return typeof rule === "function" && rule(adapted);
  }
  if (cat === "beach") return (sub === "all" || sub === "beaches") && /\b(beach|ocean|gulf|coast|water park)\b/i.test(adapted.title);
  // The current deal feed has no restaurant-seat or shopping subtype.
  return false;
}

/** Unknown menu/chip pairs fail closed. */
export function browseBookableMatches(row, browseCat, browseSub, opts = {}) {
  if (!row) return false;
  if (opts.kind === "deal") return dealMatches(row, browseCat, browseSub);
  if (opts.kind != null && opts.kind !== "experience") return false;
  const category = RULES[String(browseCat || "")];
  const rule = category && category[String(browseSub || "all")];
  return typeof rule === "function" ? !!rule(row) : false;
}

export function filterBrowseBookables(rows, browseCat, browseSub, opts) {
  return (Array.isArray(rows) ? rows : []).filter((row) => browseBookableMatches(row, browseCat, browseSub, opts));
}
