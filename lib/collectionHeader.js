// One small contract for every collection header: one complete headline, one
// one-sentence deck, and an eyebrow only when it adds information. Callers own
// the words; this helper owns the assembly so a city cannot be appended twice.

const esc = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function cityOnce(title, city) {
  let out = String(title || "").trim();
  const place = String(city || "").trim();
  if (!out || !place || place === "your town") return out;
  const rx = new RegExp(`\\b${esc(place)}\\b`, "gi");
  let seen = false;
  out = out.replace(rx, (match) => {
    if (seen) return "";
    seen = true;
    return match;
  });
  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

export function firstSentence(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  const hit = value.match(/^.*?[.!?](?:\s|$)/);
  return (hit ? hit[0] : value).trim();
}

export function headingMeaning(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildCollectionHeader({ eyebrow, title, deck, city }) {
  const headline = cityOnce(title, city);
  const brow = headingMeaning(eyebrow) === headingMeaning(headline) ? "" : String(eyebrow || "").trim();
  return {
    eyebrow: brow,
    title: headline,
    deck: firstSentence(deck),
  };
}

// Join the sheet promise to Wayfind's vetted city context without growing a
// second city-copy database. One sentence, one idea: what this collection does
// and the local lens it uses. Unknown cities keep the authored promise alone.
export function localizedCollectionDeck(deck, localContext) {
  const promise = String(deck || "").trim().replace(/[.!?]+$/, "");
  const culture = String(localContext || "").trim().replace(/[.!?]+$/, "");
  if (!culture) return promise ? promise + "." : "";
  const lower = culture.charAt(0).toLowerCase() + culture.slice(1);
  return `${promise} — ${lower}.`;
}

// Editorial intent sheets answer two questions at once: what kind of outing is
// this, and what does that mean HERE? The experience owns the promise while the
// vetted area context supplies local texture. These describe possibilities;
// they do not tell a visitor what they must do.
const INTENT_EDITORIAL = {
  nearby: {
    eyebrow: "NEARBY, WITH A POINT OF VIEW",
    title: (city) => `What is hiding in plain sight around ${city}`,
    deck: (city) => `A closer read on ${city}, across food, culture and the places that make an ordinary day feel less ordinary`,
    imageKicker: "THE WAYFIND LOCAL EDITION",
    imageTitle: (city) => `${city} is closer than it looks.`,
    dekLead: "A sharper read on what is nearby.",
  },
  "best-of": {
    eyebrow: "THE LOCAL SHORTLIST",
    title: (city) => `What ${city} is actually known for`,
    deck: (city) => `The landmarks and everyday favorites that give ${city} its identity, with the obvious edited down`,
    imageKicker: "THE WAYFIND CITY EDITION",
    imageTitle: (city) => `${city}, beyond the headline.`,
    dekLead: "The defining places, with the obvious edited down.",
  },
  "hidden-gems": {
    eyebrow: "THE QUIETER SIDE",
    title: (city) => `The ${city} most people walk right past`,
    deck: () => `Quietly excellent places that reward curiosity, without turning every local favorite into a secret`,
    imageKicker: "THE WAYFIND UNDER-THE-RADAR EDITION",
    imageTitle: (city) => `${city} keeps some of its best stories off the main road.`,
    dekLead: "Less obvious, never obscure for its own sake.",
  },
  "date-night": {
    eyebrow: "THE WAYFIND FOR TWO EDITION",
    title: (city) => `${city}, made for two`,
    deck: (city) => `A more intimate side of ${city}, where the room, the walk afterward and the pace matter as much as the reservation`,
    imageKicker: "THE WAYFIND FOR TWO EDITION",
    imageTitle: () => "The right atmosphere changes the whole evening.",
    dekLead: "Romantic without feeling rehearsed.",
  },
  family: {
    eyebrow: "GOOD FOR THE WHOLE CREW",
    title: (city) => `${city} without the family compromise`,
    deck: (city) => `${city} outings with enough wonder for kids and enough substance for the adults who brought them`,
    imageKicker: "THE WAYFIND FAMILY EDITION",
    imageTitle: () => "A family day can still have a point of view.",
    dekLead: "Shared fun, with fewer forced smiles.",
  },
  tonight: {
    eyebrow: "PERFECT FOR TONIGHT",
    title: (city) => `${city} after dark, without the guesswork`,
    deck: (city) => `Tables, stages and last stops that fit ${city} at this hour, with what is open and nearby carrying more weight than daytime fame`,
    imageKicker: "THE WAYFIND AFTER-DARK EDITION",
    imageTitle: (city) => `After dark, ${city} keeps a different kind of time.`,
    dekLead: "What works tonight, not merely what ranks well.",
  },
  "worth-the-drive": {
    eyebrow: "BEYOND THE NEIGHBORHOOD",
    title: (city) => `What is worth leaving ${city} for`,
    deck: (city) => `Day trips and destination places that earn the extra miles from ${city}, with the tradeoff stated plainly`,
    imageKicker: "THE WAYFIND DAY-TRIP EDITION",
    imageTitle: () => "Some places make the drive part of the story.",
    dekLead: "Extra miles should buy a different experience.",
  },
  budget: {
    eyebrow: "MORE DAY, LESS SPEND",
    title: (city) => `The lower-cost side of ${city}`,
    deck: (city) => `Free and affordable ways into ${city} that keep the character and the reason for going`,
    imageKicker: "THE WAYFIND GOOD-VALUE EDITION",
    imageTitle: () => "A memorable day does not need an expensive receipt.",
    dekLead: "Lower cost, not lower standards.",
  },
  seasonal: {
    eyebrow: "RIGHT PLACE, RIGHT SEASON",
    title: (city) => `${city}, in its element`,
    deck: (city) => `Places and plans around ${city} whose appeal is strongest in this stretch of the year`,
    imageKicker: "THE WAYFIND SEASONAL EDITION",
    imageTitle: (city) => `${city} changes with the calendar.`,
    dekLead: "Timing is part of the experience.",
  },
};

function culturalCounterpoint(text) {
  const value = String(text || "").trim().replace(/[.!?]+$/, "");
  if (!value) return "";
  const parts = value.split(/\s+(?:but|while)\s+|\s+[—–-]\s+/i).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : value;
}

function contextFields(localContext) {
  if (localContext && typeof localContext === "object") {
    return {
      known: String(localContext.area_known_for || "").trim(),
      seasonal: String(localContext.headline_context || "").trim(),
    };
  }
  return { known: String(localContext || "").trim(), seasonal: "" };
}

function shortLocalFact(value, maxWords = 18) {
  const clean = String(value || "").trim().replace(/[.!?]+$/, "");
  const firstClause = clean.split(/[,;]|\s+[—–]\s+/)[0].trim();
  const candidate = firstClause.split(/\s+/).length >= 7 ? firstClause : clean;
  const words = candidate.split(/\s+/);
  return words.length > maxWords ? words.slice(0, maxWords).join(" ") : candidate;
}

function localIntentLens(intent, place, localContext) {
  const { known, seasonal } = contextFields(localContext);
  const local = culturalCounterpoint(known).replace(/[.!?]+$/, "");
  const season = shortLocalFact(seasonal);
  if (intent === "tonight" && season) return `After dark locally: ${season.charAt(0).toLowerCase() + season.slice(1)}`;
  if (intent === "seasonal" && season) return season;
  if (!local) return "";
  const lenses = {
    nearby: `Close to home: ${local}`,
    "best-of": `The local counterpoint: ${local}`,
    "hidden-gems": `The quieter local thread: ${local}`,
    "date-night": `The more local evening: ${local}`,
    family: `Beyond the all-day attraction: ${local}`,
    "worth-the-drive": `The benchmark back in ${place}: ${local}`,
    budget: `${place}'s character already lives in ${local}`,
  };
  return lenses[intent] || `Around ${place}, ${local}`;
}

export function editorialIntentHeader(intent, city, localContext = "") {
  const place = String(city || "your town").split(",")[0].trim() || "your town";
  const spec = INTENT_EDITORIAL[intent] || INTENT_EDITORIAL.nearby;
  const local = localIntentLens(intent, place, localContext);
  const authoredDeck = spec.deck(place).replace(/[.!?]+$/, "");
  const deck = local
    ? `${authoredDeck} — ${local.charAt(0).toLowerCase() + local.slice(1)}.`
    : authoredDeck + ".";
  const header = buildCollectionHeader({ eyebrow: spec.eyebrow, title: spec.title(place), deck, city: place });
  return { ...header, imageKicker: spec.imageKicker, imageTitle: spec.imageTitle(place), dekLead: spec.dekLead };
}

const EXPERIENCE_COPY = {
  outdoors: {
    eyebrow: "OUTSIDE",
    deck: (city) => `The beaches, parks, trails and waterfront that make ${city} worth stepping outside for.`,
  },
  seasonal: {
    eyebrow: "IN SEASON",
    deck: (city) => `The places and plans around ${city} that genuinely fit this season.`,
  },
  hiddengems: {
    eyebrow: "HIDDEN GEMS",
    deck: (city) => `The quietly excellent places in ${city} most people walk right past.`,
  },
  bucketlist: {
    eyebrow: "BUCKET LIST",
    deck: (city) => `The signature ${city} experiences worth planning a day around.`,
  },
  familyfun: {
    eyebrow: "FAMILY FUN",
    deck: (city) => `The ${city} outings that work for kids without boring the adults.`,
  },
  friends: {
    eyebrow: "GOOD COMPANY",
    deck: (city) => `The best group plans in ${city}, from daytime adventures to late-night energy.`,
  },
  datenight: {
    eyebrow: "DATE NIGHT",
    deck: (city) => `The best of ${city} for two, from intimate tables to after-dark charm.`,
  },
  nightout: {
    eyebrow: "AFTER DARK",
    deck: (city) => `Where ${city} comes alive after dinner: cocktails, music and late kitchens.`,
  },
  eatnow: {
    eyebrow: "WHERE TO EAT",
    deck: (city) => `The ${city} tables that fit this exact hour, from local staples to the next good bite.`,
  },
  cozyindoor: {
    eyebrow: "INDOORS",
    deck: (city) => `The museums, cafés and rain-proof corners that make a day inside ${city} feel intentional.`,
  },
  brunch: {
    eyebrow: "BRUNCH",
    deck: (city) => `The ${city} brunches worth giving up a slow morning for.`,
  },
};

const EXPERIENCE_PRESENTATION = {
  outdoors: { title: (c) => `${c}, with more sky around it`, kicker: "THE WAYFIND OUTDOOR EDITION", image: () => "The best way outside depends on where you are.", lead: "Fresh air, with a local point of view." },
  hiddengems: { title: (c) => `The quieter side of ${c}`, kicker: "THE WAYFIND UNDER-THE-RADAR EDITION", image: (c) => `${c} keeps some of its best stories off the main road.`, lead: "Less obvious, never obscure for its own sake." },
  bucketlist: { title: (c) => `The ${c} experiences that stay with you`, kicker: "THE WAYFIND SIGNATURE EDITION", image: () => "Some places become part of the story you tell later.", lead: "The memorable version, edited down." },
  familyfun: { title: (c) => `${c} without the family compromise`, kicker: "THE WAYFIND FAMILY EDITION", image: () => "A family day can still have a point of view.", lead: "Shared fun, with fewer forced smiles." },
  friends: { title: (c) => `${c} is better with the group chat`, kicker: "THE WAYFIND GOOD-COMPANY EDITION", image: () => "The plan is easier when everyone has a reason to say yes.", lead: "Enough energy for the whole table." },
  datenight: { title: (c) => `${c}, made for two`, kicker: "THE WAYFIND FOR TWO EDITION", image: () => "The right atmosphere changes the whole evening.", lead: "Romantic without feeling rehearsed." },
  nightout: { title: (c) => `${c} after dark`, kicker: "THE WAYFIND NIGHT-OUT EDITION", image: () => "The city changes character when the lights come on.", lead: "The late side of town, with the filler removed." },
  eatnow: { title: (c) => `What ${c} tastes like right now`, kicker: "THE WAYFIND TABLE EDITION", image: () => "A city often explains itself best at the table.", lead: "The next good bite, in the right context." },
};

export function experienceHeader(key, exp, city, localContext = "") {
  const place = String(city || "your area").split(",")[0].trim() || "your area";
  const spec = EXPERIENCE_COPY[key] || {};
  const presentation = EXPERIENCE_PRESENTATION[key] || {};
  let title = presentation.title ? presentation.title(place) : String((exp && exp.title) || (exp && exp.label) || "Wayfind picks").trim();
  title = title.replace(/\bnear you\b/gi, "in " + place);
  if (place !== "your area" && !new RegExp(`\\b${esc(place)}\\b`, "i").test(title)) title += " in " + place;
  const { known } = contextFields(localContext);
  const header = buildCollectionHeader({
    eyebrow: spec.eyebrow || ((exp && exp.label) || "Wayfind picks"),
    title,
    deck: localizedCollectionDeck(spec.deck ? spec.deck(place) : ((exp && exp.lead) || `A focused shortlist for ${place}.`), known),
    city: place,
  });
  return {
    ...header,
    imageKicker: presentation.kicker || "THE WAYFIND LOCAL EDITION",
    imageTitle: presentation.image ? presentation.image(place) : `${place}, through a sharper lens.`,
    dekLead: presentation.lead || "A local shortlist with a reason to exist.",
  };
}
