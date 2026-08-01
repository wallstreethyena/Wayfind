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

export function experienceHeader(key, exp, city, localContext = "") {
  const place = String(city || "your area").split(",")[0].trim() || "your area";
  const spec = EXPERIENCE_COPY[key] || {};
  let title = String((exp && exp.title) || (exp && exp.label) || "Wayfind picks").trim();
  title = title.replace(/\bnear you\b/gi, "in " + place);
  if (place !== "your area" && !new RegExp(`\\b${esc(place)}\\b`, "i").test(title)) title += " in " + place;
  return buildCollectionHeader({
    eyebrow: spec.eyebrow || ((exp && exp.label) || "Wayfind picks"),
    title,
    deck: localizedCollectionDeck(spec.deck ? spec.deck(place) : ((exp && exp.lead) || `A focused shortlist for ${place}.`), localContext),
    city: place,
  });
}
