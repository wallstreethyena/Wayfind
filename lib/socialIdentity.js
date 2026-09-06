const FL_BOUNDS = Object.freeze({ minLat: 24.3, maxLat: 31.1, minLng: -87.7, maxLng: -79.7 });

export function normalizedSocialHandle(value) {
  return String(value || "").trim().replace(/^@/, "").toLowerCase();
}

export function normalizedPlaceName(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

export function isFloridaInventory(row) {
  const state = String(row?.state || row?.region || "").trim().toUpperCase();
  if (state && state !== "FL" && state !== "FLORIDA") return false;
  if (row?.lat == null || row?.lng == null) return false;
  const lat = Number(row?.lat), lng = Number(row?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= FL_BOUNDS.minLat && lat <= FL_BOUNDS.maxLat
    && lng >= FL_BOUNDS.minLng && lng <= FL_BOUNDS.maxLng;
}

function literalNameInCaption(name, caption) {
  const needle = normalizedPlaceName(name);
  const haystack = ` ${normalizedPlaceName(caption)} `;
  return needle.length >= 5 && haystack.includes(` ${needle} `);
}

function haversineMi(aLat, aLng, bLat, bLng) {
  const rad = (n) => n * Math.PI / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Creator associations and source IDs are candidate hints, not post-specific proof.
// A literal unique name is only a candidate; it cannot publish a place/event.
export function resolveSocialPlace(lead, { creator = null, inventory = [], now } = {}) {
  const florida = (Array.isArray(inventory) ? inventory : []).filter(isFloridaInventory);
  const reviewed = Number.isFinite(now) && creator?.status === "approved" && creator.evidence_url
    && Number.isFinite(Date.parse(creator.reviewed_at)) && Date.parse(creator.reviewed_at) <= now
    && Date.parse(creator.expires_at) > now;
  if (reviewed && creator.platform === lead?.platform
    && normalizedSocialHandle(creator.handle) === normalizedSocialHandle(lead?.handle)
    && creator.canonical_place_id) {
    const exact = florida.find((p) => p.place_id === creator.canonical_place_id);
    if (exact) return { status: "candidate", method: "reviewed_creator_place", place_id: exact.place_id, confidence: 1 };
  }
  // Stable source IDs are accepted only when they map directly to an owned
  // inventory ID. An arbitrary ID supplied in caption text never enters here.
  if (lead?.source_place_id) {
    const exact = florida.find((p) => p.place_id === String(lead.source_place_id));
    if (exact) return { status: "candidate", method: "stable_source_place_id", place_id: exact.place_id, confidence: 1 };
  }
  const locName = normalizedPlaceName(lead?.location_name);
  const locLat = Number(lead?.location_lat), locLng = Number(lead?.location_lng);
  if (locName && Number.isFinite(locLat) && Number.isFinite(locLng) && isFloridaInventory({ lat: locLat, lng: locLng })) {
    const geo = florida.filter((p) => normalizedPlaceName(p.name) === locName)
      .map((p) => ({ p, miles: haversineMi(locLat, locLng, Number(p.lat), Number(p.lng)) }))
      .filter((x) => Number.isFinite(x.miles) && x.miles <= 0.25).sort((a, b) => a.miles - b.miles);
    if (geo.length === 1) return { status: "candidate", method: "location_tag_name_and_coordinates", place_id: geo[0].p.place_id, confidence: 0.95 };
  }
  const matches = florida.filter((p) => literalNameInCaption(p.name, lead?.caption));
  const city = normalizedPlaceName(lead?.location_city);
  const cityMatches = city ? matches.filter((p) => normalizedPlaceName(p.metro) === city || normalizedPlaceName(p.city) === city) : matches;
  if (city && cityMatches.length === 0) return { status: "unresolved", method: "city_conflict", place_id: null, confidence: 0 };
  if (city && cityMatches.length === 1) return { status: "candidate", method: "literal_name_and_city", place_id: cityMatches[0].place_id, confidence: 0.85 };
  if (matches.length === 1) return { status: "candidate", method: "literal_unique_name", place_id: matches[0].place_id, confidence: 0.7 };
  return { status: "unresolved", method: matches.length > 1 ? "ambiguous_literal_name" : "no_literal_identity", place_id: null, confidence: 0 };
}

export function resolveExtractedVenue(venueName, inventory = []) {
  const wanted = normalizedPlaceName(venueName);
  if (wanted.length < 5) return { status: "unresolved", method: "no_extracted_venue", place_id: null, confidence: 0 };
  const matches = (Array.isArray(inventory) ? inventory : []).filter(isFloridaInventory)
    .filter((p) => normalizedPlaceName(p.name) === wanted);
  return matches.length === 1
    ? { status: "candidate", method: "evidence_backed_extracted_name", place_id: matches[0].place_id, confidence: 0.8 }
    : { status: "unresolved", method: matches.length > 1 ? "ambiguous_extracted_name" : "extracted_name_not_found", place_id: null, confidence: 0 };
}
