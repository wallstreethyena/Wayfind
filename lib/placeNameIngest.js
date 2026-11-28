// lib/placeNameIngest.js — PURE rules for the owner's name-based place intake
// (app/api/cron/place-name-ingest). No network, no clock: the route does the
// Google and Supabase I/O and passes data in, so every rule is unit-tested
// (scripts/test-place-name-ingest.mjs) rather than trusted.
//
// WHY THIS EXISTS (owner, 2026-11-28). "Add all of this girl videos to wayfind
// if she reviews a place below 9 do not include and if a place card does not
// exist we need to create it." Every existing path that turns a place into a
// card starts from a Google place id (promote-index drains ids the seeder
// already indexed). A creator names a place, not an id, so there was no way to
// add one she filmed. This closes that gap and nothing more: a request row
// names a place; the cron finds it, scores it the normal way, and writes a
// card only when it clears the owner's 9.0 bar with a real Google photo.
//
// WHAT IT WILL NOT DO.
//   - Guess. A request matches only a Google result whose name carries every
//     required word AND whose address carries the request's town. Two
//     different results that both qualify is "ambiguous", never a pick.
//   - Invent a score. No rating from Google means no card.
//   - Spend outside the free lines. The route asks the same ledger every other
//     Google caller asks (text_pro for the lookup, details_enterprise for the
//     rating via lib/placeDetails.js). A refusal parks the request; it retries
//     on a later run and is never marked failed for a budget answer.

export const INGEST_MIN_SCORE = 90; // internal points; 9.0 on the badge
export const INGEST_BATCH = 3;      // requests per run
export const INGEST_MAX_ATTEMPTS = 6;

// Terminal outcomes. A request in one of these never runs again on its own.
export const TERMINAL = Object.freeze([
  "published", "already_card", "below_9", "no_rating", "no_photo",
  "no_match", "ambiguous", "closed", "outside_metros", "unclassified", "failed",
]);
// Outcomes that mean "try again later" (a budget or a transient answer).
export const RETRYABLE = Object.freeze(["pending", "waiting_lookup", "waiting_rating"]);

export const normIngestText = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const STOP = new Set(["the", "and", "of", "at", "a", "an", "in"]);

/** The words a result's name must carry: the request's own name words, minus filler. */
export function requiredWords(req) {
  const explicit = Array.isArray(req && req.match_words) ? req.match_words : null;
  const words = explicit && explicit.length ? explicit : normIngestText(req && req.name).split(" ");
  return [...new Set(words.map(normIngestText).filter((w) => w && !STOP.has(w)))];
}

/** Does this one Google result fit the request? Returns null or the reason it does not. */
export function mismatchReason(result, req) {
  if (!result || !result.id) return "no id";
  const name = normIngestText(result.displayName && (result.displayName.text || result.displayName));
  if (!name) return "no name";
  const hay = " " + name + " ";
  for (const w of requiredWords(req)) if (!hay.includes(" " + w + " ")) return `name lacks "${w}"`;
  const area = normIngestText(req && req.area);
  if (area) {
    const addr = " " + normIngestText(result.formattedAddress) + " ";
    if (!addr.includes(" " + area + " ")) return `address lacks "${area}"`;
  }
  if (!/,\s*FL\s+\d{5}/.test(String(result.formattedAddress || ""))) return "not a Florida address";
  return null;
}

/**
 * Pick the one Google result this request names.
 * { place } on a single confident fit, { status: "no_match" | "ambiguous", reason } otherwise.
 */
export function pickCandidate(results, req) {
  const list = Array.isArray(results) ? results : [];
  const fits = [];
  const misses = [];
  for (const r of list) {
    const why = mismatchReason(r, req);
    if (why) misses.push(why); else if (!fits.some((f) => f.id === r.id)) fits.push(r);
  }
  if (fits.length === 1) return { place: fits[0] };
  if (fits.length > 1) return { status: "ambiguous", reason: `${fits.length} Google listings fit: ${fits.map((f) => f.formattedAddress).join(" | ").slice(0, 300)}` };
  return { status: "no_match", reason: list.length ? `no listing fit (${misses.slice(0, 3).join("; ")})` : "Google returned no listing" };
}

/**
 * May this scored place become a card? Pure: the caller supplies what Google
 * said. { publish:true } or { publish:false, status, reason }.
 */
export function cardDecision({ score, businessStatus, photoRef }) {
  if (businessStatus && businessStatus !== "OPERATIONAL") return { publish: false, status: "closed", reason: `Google lists it ${businessStatus}` };
  if (score == null) return { publish: false, status: "no_rating", reason: "Google has no rating for it" };
  if (score < INGEST_MIN_SCORE) return { publish: false, status: "below_9", reason: `Wayfind Score ${(score / 10).toFixed(1)} is under 9.0` };
  if (!photoRef) return { publish: false, status: "no_photo", reason: "Google has no photo for it" };
  return { publish: true };
}

/** Reshape what the route holds into the Places (New) object lib/seedPlaces.js buildInventoryRow reads. */
export function toPlacesObject(req, details) {
  return {
    id: req.place_id,
    displayName: { text: details.name || req.matched_name },
    location: { latitude: details.lat, longitude: details.lng },
    types: Array.isArray(details.types) && details.types.length ? details.types : (req.google_types || []),
    primaryType: req.primary_type || null,
    businessStatus: details.businessStatus || null,
    rating: details.rating,
    userRatingCount: details.reviews,
    photos: details.photoRef ? [{}] : [],
  };
}
