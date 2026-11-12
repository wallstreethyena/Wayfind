// Christmas twin detector (2026-11-12 duplicate sweep). Pure, server only.
//
// On 2026-11-12 the Christmas page showed 28 events twice: a wf_events row and
// its own research twin, never linked in CHRISTMAS_DB_RESEARCH_IDS. This finds
// SUSPECTED twins so a person reviews them. It never merges anything: names
// that match are not proof (the three Tampa boat parade cruises are different
// boats; a town's "Light Up" night is not its parade). A reviewed pair goes
// either into CHRISTMAS_DB_RESEARCH_IDS (same event) or REVIEWED_DISTINCT below.
//
// Rule: same city, and the same start date (or one side undated), and either
//   the same official page (full URL, query kept, so calendar.aspx?EID=7618 and
//   EID=7619 stay apart) with similar names or the same day, or near identical
//   names, or similar names within about a kilometre on the same day.

const STOP = new Set(["the", "of", "at", "and", "in", "christmas", "holiday", "holidays", "2026", "fl", "florida", "annual", "festival", "lights", "light", "show", "parade", "st", "th"]);

export function christmasTitleTokens(title) {
  const words = String(title || "").toLowerCase().replace(/['’]/g, "").match(/[a-z0-9]+/g) || [];
  return new Set(words.filter((w) => w.length > 2 && !STOP.has(w)));
}

export function christmasOfficialPage(url) {
  const u = String(url || "").trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").split("#")[0].replace(/\/+$/, "");
  return u || null;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let both = 0;
  for (const w of a) if (b.has(w)) both += 1;
  return both / (a.size + b.size - both);
}

function km(a, b) {
  const ok = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
  if (!ok(a.lat) || !ok(a.lng) || !ok(b.lat) || !ok(b.lng)) return Infinity;
  const dy = (Number(a.lat) - Number(b.lat)) * 111;
  const dx = (Number(a.lng) - Number(b.lng)) * 111 * Math.cos((Number(a.lat) * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

// Accepts merged pool rows (event_id, event_name, official_event_url) or
// browse cards (id, title, url).
function view(row) {
  return {
    id: row.event_id || row.id,
    title: row.event_name || row.title,
    city: String(row.city || "").trim().toLowerCase(),
    start: row.start_date || null,
    page: christmasOfficialPage(row.official_event_url || row.url),
    lat: row.lat, lng: row.lng,
  };
}

export const pairKey = (a, b) => [a, b].sort().join(" + ");

// Reviewed 2026-11-12 and confirmed to be different experiences.
export const REVIEWED_DISTINCT = Object.freeze(new Set([
  pairKey("fernandina-downtown-lights-2026", "fernandina-tree-lighting-2026"), // season display vs lighting night
  pairKey("utc-rink-2026", "utc-holidays-2026"), // ice rink vs the mall's holiday season
  pairKey("lynn-haven-christmas-parade-2026", "lynn-haven-christmas-tree-lighting-2026"), // parade vs tree lighting
  pairKey("lostpearl-boatparade-tampa-2026", "yacht-starship-tampa-boat-parade-dinner-cruise-2026"), // different boats
  pairKey("lostpearl-boatparade-tampa-2026", "pirate-water-taxi-boat-parade-cruise-2026"), // different boats
  pairKey("cocoa-beach-christmas-parade-2026", "cocoa-beach-winterfest-2026"), // Kiwanis parade vs Main Street festival
  pairKey("homestead-winter-wonderland-2026", "homestead-holiday-tree-lighting-winter-wonderland-2026"), // season vs opening night (separate city calendar entries)
  // Same organizer page and day, different experiences:
  pairKey("islands-adventure-grinchmas-2026", "universal-orlando-holidays-2026"), // one park's Grinchmas vs the resort season
  pairKey("islands-adventure-grinchmas-2026", "universal-studios-holiday-parade-2026"), // different parks
  pairKey("universal-orlando-holidays-2026", "universal-studios-holiday-parade-2026"), // resort season vs the parade
  pairKey("sparkman-wharf-winter-wonder-wharf-2026", "water-street-season-spectacular-2026"), // different venues
  pairKey("stuart-christmas-on-main-2026", "stuart-christmas-tree-lighting-2026"), // street festival vs tree lighting
  pairKey("fantasy-lights-festival-palm-coast-2026", "palm-coast-tree-lighting-2026"), // month long display vs lighting night
  pairKey("celebration-now-snowing-2026", "celebration-tree-lighting-2026"), // nightly snowfall vs tree lighting
  pairKey("st-pete-holiday-lights-displays-2026", "st-pete-santa-parade-tree-lighting-2026"), // displays vs parade
  pairKey("a-merry-winter-garden-light-show-2026", "light-up-winter-garden-2026"), // light show run vs Light Up night
  pairKey("cocoa-holiday-tree-lighting-and-movie-in-the-park-2026", "cocoa-village-boat-parade-2026"), // movie night vs boat parade
  pairKey("st-pete-santa-in-the-park-2026", "vinoy-park-holiday-movie-2026"), // Santa visit vs movie
  pairKey("boyd-hill-smores-with-santa-2026", "vinoy-park-holiday-movie-2026"), // different parks
  pairKey("boyd-hill-smores-with-santa-2026", "st-pete-santa-in-the-park-2026"), // different parks
]));

export function findChristmasTwinCandidates(rows, { reviewedDistinct = REVIEWED_DISTINCT } = {}) {
  const list = (rows || []).filter(Boolean).map(view).filter((r) => r.id && r.title);
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    const ta = christmasTitleTokens(a.title);
    for (let j = i + 1; j < list.length; j += 1) {
      const b = list[j];
      if (a.id === b.id || a.city !== b.city) continue;
      if (a.start && b.start && a.start !== b.start) continue;
      const sim = jaccard(ta, christmasTitleTokens(b.title));
      const samePage = !!a.page && a.page === b.page;
      const near = km(a, b) < 1;
      const sameDay = !!(a.start && a.start === b.start);
      if (!((samePage && (sim >= 0.5 || sameDay)) || sim >= 0.99 || (sim >= 0.5 && near && sameDay))) continue;
      const key = pairKey(a.id, b.id);
      if (reviewedDistinct.has(key)) continue;
      out.push({ key, a: a.id, b: b.id, similarity: Math.round(sim * 100) / 100, samePage });
    }
  }
  return out;
}
