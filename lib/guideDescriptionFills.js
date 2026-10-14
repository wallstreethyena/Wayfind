// lib/guideDescriptionFills.js - SERVER-ONLY, pure. A small, reviewed set of
// "why go" lines for places that have NO other editorial anywhere, filled from
// copy Wayfind already holds: the owner-approved GUIDES pick blurbs
// (lib/guides.js).
//
// WHY THIS EXISTS (2026-10-13). /places/{id} already lets a guide pick's blurb
// stand in for a place description (lib/guidePlaceIndex.js). The in-app Detail
// sheet reads /api/editorial instead, and that route never looked at guides, so
// the same place showed a real description on its web page and an empty
// "Wayfind editorial" slot in the app. Top-viewed examples (PostHog detail_open,
// 90 days): Mount Dora Historic District 44 opens, Kelly Park 36, Wekiwa Springs
// 28, Boggy Creek Airboat 28, Blue Spring 22, Playalinda 18.
//
// WHAT IT IS NOT. It is not a generator and not a bulk promote of every guide
// pick. Each entry below was read by a person against the rules:
//   - the blurb describes THE PLACE, not a list, a season, a price, a rating
//     or the guide itself;
//   - no hours, days, prices, dates, years, phone or address (the same
//     operationalData() gate the owned-editorial publisher uses);
//   - no time-bound words (new, reopened, this spring, limited time);
//   - no "Best time" and no "Local tip": the guide's separate `tip` field is
//     NOT carried over, because it has no per-claim evidence;
//   - no dashes in public copy (owner rule). Where the guide used one, the
//     minimal punctuation edit is declared in `edits` and replayed against the
//     live blurb, so the text can never silently drift from the guide.
//
// PRECEDENCE. This is the LAST tier of /api/editorial. An Atlas card, a
// verified wf_editorial row or a handwritten lib/editorial.js entry always wins
// ("once a verified line is written it stays"). The id must also pass the same
// approveCandidate() live-status gate as every other tier.
//
// FAIL CLOSED. If the guide pick is gone, or its blurb no longer reproduces
// `expected` after the declared edits, the entry returns null and
// scripts/test-guide-description-fills.mjs goes red. Nobody's edit to a guide
// can change what a place page says without this file being touched too.
import { GUIDES } from "./guides.js";
import { OFFICIAL_DESCRIPTION_FILLS } from "./officialDescriptionFills.js";

// evidence: "guide-source" = the guide lists an external source that names this
// exact place (see `sourceUrl`). "guide-copy" = Wayfind guide copy only, with no
// place-specific external source recorded in the repo. Both are shown as
// Wayfind's own words; the field exists so the next reviewer can see which
// lines still want an outside citation before anyone promotes them to a
// verified wf_editorial row.
export const GUIDE_DESCRIPTION_FILLS = [
  {
    placeId: "ChIJGSMzu2Oi54gR-rlDDL6V3Qs", name: "Mount Dora Historic District",
    slug: "things-to-do-orlando-not-theme-parks", pick: "Day-trip to Mount Dora",
    edits: [["45 minutes northwest:", "45 minutes northwest of Orlando:"]],
    expected: "A hilly (for Florida) lakefront town 45 minutes northwest of Orlando: antique district, an inland lighthouse, and a downtown built for slow afternoons.",
    evidence: "guide-copy",
    verifiedOn: "2026-10-13",
  },
  {
    placeId: "ChIJw5hmHut154gRI1LE7BjQiEg", name: "Kelly Park - Rock Springs",
    slug: "things-to-do-orlando-not-theme-parks", pick: "Kayak a natural spring",
    edits: [],
    expected: "Launch from Camp Joy through the Kelly Park gate to paddle Rock Springs Run. This is separate from the park's tubing and swimming area.",
    evidence: "guide-source",
    verifiedOn: "2026-10-13",
    sourceUrl: "https://www.orangecountyfl.net/DesktopModules/OCFL/CountyParks/OCPark.aspx?d=117&m=dtlvw",
  },
  {
    placeId: "ChIJd_yTxUh054gR9cGD0gI_yHw", name: "Wekiwa Springs State Park",
    slug: "things-to-do-orlando-not-theme-parks", pick: "Swim at Wekiwa Springs",
    edits: [["north of downtown,", "north of downtown Orlando,"]],
    expected: "A 72-degree spring pool twenty minutes north of downtown Orlando, ringed by real Florida forest with canoes and kayaks for rent at the top of the run.",
    evidence: "guide-copy",
    verifiedOn: "2026-10-13",
  },
  {
    placeId: "ChIJE1158xWa3YgRyxYmba83M0o", name: "Boggy Creek Airboat Adventures",
    slug: "things-to-do-orlando-not-theme-parks", pick: "Airboat the Everglades headwaters",
    edits: [],
    expected: "Take an airboat onto the headwaters south of Orlando, where the ride crosses open marsh and wildlife habitat rather than a staged park course.",
    evidence: "guide-source",
    verifiedOn: "2026-10-13",
    sourceUrl: "https://bcairboats.com/faq/",
  },
  {
    placeId: "ChIJyYEUav8P54gRatuv_zQzm20", name: "Blue Spring State Park",
    slug: "things-to-do-orlando-not-theme-parks", pick: "Blue Spring State Park in manatee season",
    edits: [[" — a boardwalk view", ": a boardwalk view"]],
    expected: "November through March the spring run fills with hundreds of wild manatees escaping the cold St. Johns River: a boardwalk view of megafauna no aquarium can sell you.",
    evidence: "guide-copy",
    verifiedOn: "2026-10-13",
  },
  {
    placeId: "ChIJdeCS1uW54IgRqG67_UFPInI", name: "Playalinda Beach",
    slug: "things-to-do-orlando-not-theme-parks", pick: "Watch a rocket launch",
    edits: [],
    expected: "Playalinda Beach can put you close to launches from Kennedy Space Center, but access depends on park hours and launch operations.",
    evidence: "guide-source",
    verifiedOn: "2026-10-13",
    sourceUrl: "https://www.nps.gov/cana/planyourvisit/rocket-launch-viewing.htm",
  },
  {
    placeId: "ChIJKRTWX9g_w4gRk2YMbJtyfi4", name: "Tibbals Learning Center & Circus Museum at The Ringling",
    slug: "things-to-do-in-sarasota-florida", pick: "Tibbals Learning Center and Circus Museum",
    edits: [[" — a 44,000-piece", ": a 44,000-piece"]],
    expected: "The part of the estate people expect to skip and end up spending an hour in, largely because of the Howard Bros. Circus Model: a 44,000-piece miniature reconstruction of the Ringling circus at its peak, built over decades by one man.",
    evidence: "guide-copy",
    verifiedOn: "2026-10-13",
  },
  {
    placeId: "ChIJfUYeWmAlw4gReflS439GCg0", name: "Gamble Creek Farms",
    slug: "things-to-do-in-parrish-florida", pick: "Gamble Creek Farms",
    edits: [],
    expected: "A 26-acre Real Organic Certified farm growing produce right in Parrish, operating as both a working farm and a community destination with a market. They sell fresh produce alongside other Florida-grown products, run group tours and host free seasonal family events.",
    evidence: "guide-copy",
    verifiedOn: "2026-10-13",
  },
];

const BY_ID = new Map(GUIDE_DESCRIPTION_FILLS.map((e) => [e.placeId, e]));
const OFFICIAL_BY_ID = new Map(OFFICIAL_DESCRIPTION_FILLS.map((e) => [e.placeId, e]));

/** The live guide blurb for an entry with its declared edits applied, or null. */
export function deriveFillText(entry, guides = GUIDES) {
  if (!entry) return null;
  const guide = guides && guides[entry.slug];
  const pick = guide && Array.isArray(guide.picks)
    ? guide.picks.find((p) => p && p.placeId === entry.placeId && p.name === entry.pick)
    : null;
  if (!pick || typeof pick.blurb !== "string") return null;
  let text = pick.blurb;
  for (const [from, to] of entry.edits || []) {
    if (!text.includes(from)) return null;
    text = text.replace(from, to);
  }
  return text;
}

/**
 * The editorial payload /api/editorial serves for a place when no stronger tier
 * holds one, in the same shape cardToEditorial() / mapWfEditorial() emit. Only
 * `why` is filled: no vibe, no best time, no local tip, no watch-out.
 */
export function guideDescriptionFor(placeId, guides = GUIDES) {
  const official = OFFICIAL_BY_ID.get(placeId);
  if (official && !BY_ID.has(placeId)) {
    let host = [];
    try { host = [new URL(official.sourceUrl).hostname.replace(/^www\./, "")]; } catch { host = []; }
    return {
      name: official.name,
      vibe: null, why: official.text, knownFor: null, bestFor: null,
      foodMove: null, drinkMove: null, insiderMove: null, proMove: null,
      story: null, proof: null, goodToKnow: null, funFact: null, watchOut: null,
      sources: host,
    };
  }
  const entry = BY_ID.get(placeId);
  if (!entry) return null;
  const text = deriveFillText(entry, guides);
  if (!text || text !== entry.expected) return null;
  let sources = [];
  if (entry.sourceUrl) {
    try { sources = [new URL(entry.sourceUrl).hostname.replace(/^www\./, "")]; } catch { sources = []; }
  }
  return {
    name: entry.name,
    vibe: null, why: text, knownFor: null, bestFor: null,
    foodMove: null, drinkMove: null, insiderMove: null, proMove: null,
    story: null, proof: null, goodToKnow: null, funFact: null, watchOut: null,
    sources,
  };
}
