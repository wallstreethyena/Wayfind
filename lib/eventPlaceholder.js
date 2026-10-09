// AN EVENT WITHOUT ITS OWN PHOTO GETS A DESIGNED TILE, NOT A STOCK PHOTO
// (owner, 2026-10-08). "Do not display unrelated photography in a way that
// suggests it depicts the actual event." Category stock (a concert crowd, a
// smiling market shopper) and Pexels "scene" photos read as pictures of the
// event. When an event has no verified image (its organizer's own photo, or a
// labelled venue photo), its card shows this: the category's icon and name on
// a tinted tile, clearly a placeholder and never a photograph.
//
// Pure data, no React: RailCard renders it, guards call it.

const BY_BUCKET = Object.freeze({
  concerts: { icon: "🎵", label: "Live music", tint: "linear-gradient(160deg,#2A1B4D,#141026)" },
  comedy: { icon: "😂", label: "Comedy", tint: "linear-gradient(160deg,#4A2A12,#1F130A)" },
  theater: { icon: "🎭", label: "Theater", tint: "linear-gradient(160deg,#4A1426,#1E0A12)" },
  sports: { icon: "🏟️", label: "Sports", tint: "linear-gradient(160deg,#123A2A,#0A1A14)" },
  community: { icon: "🏘️", label: "Local event", tint: "linear-gradient(160deg,#143246,#0A1722)" },
  business: { icon: "💼", label: "Business event", tint: "linear-gradient(160deg,#25303D,#11161D)" },
});
const HALLOWEEN = { icon: "🎃", label: "Halloween", tint: "linear-gradient(160deg,#3B1A5C,#160A24)" };
const FALL = { icon: "🍂", label: "Fall event", tint: "linear-gradient(160deg,#4A2A10,#1E1207)" };
// Christmas season tiles (owner, 2026-10-08, Florida Christmas collection).
const BOAT_PARADE = { icon: "🛥️", label: "Boat parade", tint: "linear-gradient(160deg,#16314F,#0A1626)" };
const HOLIDAY_LIGHTS = { icon: "✨", label: "Holiday lights", tint: "linear-gradient(160deg,#5A0A1A,#1E0509)" };
const CHRISTMAS = { icon: "🎄", label: "Christmas event", tint: "linear-gradient(160deg,#7A0E1C,#2A040B)" };
// Christmas v3 (2026-10-09): one tile per new rail kind, chosen by the row's
// explicit Christmas rail before any name matching.
const PARADE = { icon: "🥁", label: "Parade", tint: "linear-gradient(160deg,#6B1020,#24050B)" };
const POP_UP_BAR = { icon: "🍸", label: "Pop up bar", tint: "linear-gradient(160deg,#3D0F2E,#16050F)" };
const PARTY = { icon: "🎉", label: "Christmas party", tint: "linear-gradient(160deg,#5C1A0E,#210905)" };
const BY_CHRISTMAS_RAIL = Object.freeze({ "boat-parades": BOAT_PARADE, lights: HOLIDAY_LIGHTS, parades: PARADE, "popup-bars": POP_UP_BAR, parties: PARTY });
const BOAT_PARADE_RX = /\b(?:boat\s+parade|lighted\s+boat|light\s+boat|boat\s+a\s+long|regatta)\b/i;
const HOLIDAY_LIGHTS_RX = /\b(?:(?:holiday|christmas)\s+lights?|festival\s+of\s+lights|nights?\s+of\s+lights|lights?\s+in\s+bloom|lights?\s+(?:show|walk|display|drive)|wonderland\s+of\s+lights|winter\s+wonderland)\b/i;
const CHRISTMAS_RX = /\b(?:christmas|santa|nutcracker|grinch|tree\s+lighting|yule\w*|noel|winterfest|holiday\s+(?:market|parade|festival|bazaar|fair|night\w*|celebration))\b/i;
const FALLBACK = { icon: "📅", label: "Event", tint: "linear-gradient(160deg,#25303D,#11161D)" };

const HALLOWEEN_RX = /\b(?:hallowe?en|haunt\w*|ghosts?|spook\w*|trick[\s-]or[\s-]treat|trunk[\s-]or[\s-]treat|scare\w*|fright\w*|horror|zombies?|witch\w*|vampires?|costume)\b/i;
const FALL_RX = /\b(?:pumpkins?|harvest|corn\s?maze|hay\s?rides?|oktoberfest|fall\s+fest\w*|autumn|scarecrows?)\b/i;

export function eventPlaceholder(bucket, event = {}) {
  const text = [event.name, event.title, event.genre, event.segment, ...(Array.isArray(event.tags) ? event.tags : [])].filter(Boolean).join(" ").replace(/-/g, " ");
  if (HALLOWEEN_RX.test(text)) return HALLOWEEN;
  if (event.christmasRail && BY_CHRISTMAS_RAIL[event.christmasRail]) return BY_CHRISTMAS_RAIL[event.christmasRail];
  if (BOAT_PARADE_RX.test(text)) return BOAT_PARADE;
  if (HOLIDAY_LIGHTS_RX.test(text)) return HOLIDAY_LIGHTS;
  if (CHRISTMAS_RX.test(text)) return CHRISTMAS;
  if (FALL_RX.test(text) || event.fallTheme === true) return FALL;
  return BY_BUCKET[String(bucket || "").toLowerCase()] || FALLBACK;
}
