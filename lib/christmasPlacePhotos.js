// lib/christmasPlacePhotos.js: event tagged Christmas photos for the Christmas
// ticket cards and the event pages they open. Photos live on the EXISTING place
// row in signals.christmas_photo_gallery, each tagged with christmas_keys (the
// event ids it belongs to), so a holiday shot never shows on a year round place
// card and two events at one park never borrow each other's photos. Reads only.
export const CHRISTMAS_MAX_PHOTOS = 14;

// Event id or public /florida-events slug to the venue's existing Google place id.
// Busch and Enchant publish under a slug that is not their wf_events event_id.
// Both ids point at the same existing place. Nothing here inserts a place row.
export const CHRISTMAS_EVENT_PLACE = Object.freeze({
  "christmas-at-gaylord-palms-2026": "ChIJl0CYCGZ_3YgRL05pG5wZSsE",
  "busch-gardens-christmas-town-2026": "ChIJhRo4DU_GwogRUgjhMAj-pag",
  "christmas-town-2026": "ChIJhRo4DU_GwogRUgjhMAj-pag",
  "universal-orlando-holidays-2026": "ChIJvRBCrN9-54gRGZuuaCLGrQE",
  "enchant-christmas-st-petersburg-2026": "ChIJkXdv95vhwogR3e84WZCqrJ4",
  "enchant-stpete-2026": "ChIJkXdv95vhwogR3e84WZCqrJ4",
});

// A photo tagged with either id belongs to that one event, so the ticket card
// (event_id) and the event page (slug) show the same rail.
const CHRISTMAS_KEY_ALIASES = Object.freeze({
  "christmas-town-2026": Object.freeze(["christmas-town-2026", "busch-gardens-christmas-town-2026"]),
  "busch-gardens-christmas-town-2026": Object.freeze(["christmas-town-2026", "busch-gardens-christmas-town-2026"]),
  "enchant-stpete-2026": Object.freeze(["enchant-stpete-2026", "enchant-christmas-st-petersburg-2026"]),
  "enchant-christmas-st-petersburg-2026": Object.freeze(["enchant-stpete-2026", "enchant-christmas-st-petersburg-2026"]),
});

const VAULT_URL_RX = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/place-photos\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/;
const plain = (s) => String(s || "").replace(/\s+/g, " ").trim();

export function christmasPlaceFor(eventId, placeId) {
  return placeId || CHRISTMAS_EVENT_PLACE[String(eventId || "")] || null;
}

function tagKeys(eventId) {
  const id = String(eventId || "");
  return CHRISTMAS_KEY_ALIASES[id] || (id ? [id] : []);
}

/** Tagged entries for one event, cover first, as strip photos. */
export function christmasTaggedPhotos(eventId, gallery, label = "") {
  const id = String(eventId || "");
  const keys = new Set(tagKeys(id));
  if (!id || !keys.size || !Array.isArray(gallery)) return [];
  const seen = new Set();
  const out = [];
  const rows = gallery.filter((g) => g && Array.isArray(g.christmas_keys) && g.christmas_keys.some((k) => keys.has(String(k))));
  rows.sort((a, b) => (b.cover ? 1 : 0) - (a.cover ? 1 : 0));
  for (const g of rows) {
    const src = String(g.url || "").trim();
    if (!VAULT_URL_RX.test(src) || seen.has(src)) continue;
    const raw = plain(g.attribution_text);
    if (!raw) continue;
    seen.add(src);
    out.push({
      src,
      width: g.width || 1280,
      height: g.height || 853,
      alt: plain("Photo of " + (label || id)),
      credit: /^photo\b/i.test(raw) ? raw : "Photo by " + raw,
      creditHref: /^https:\/\//.test(String(g.attribution_url || "")) ? g.attribution_url : null,
      source: "vault",
    });
    if (out.length >= CHRISTMAS_MAX_PHOTOS) break;
  }
  return out;
}

/** Reads signals.christmas_photo_gallery for the place and returns this event's photos. */
export async function readChristmasEventPhotos(eventId, placeId, deps = {}) {
  const place = christmasPlaceFor(eventId, placeId);
  if (!place || !/^[A-Za-z0-9_-]{10,}$/.test(place)) return [];
  const env = deps.env || process.env;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const base = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  if (!key || !/^https:\/\//.test(base)) return [];
  const doFetch = deps.fetchImpl || fetch;
  try {
    const q = new URLSearchParams({ place_id: `eq.${place}`, select: "signals->christmas_photo_gallery", limit: "1" });
    const r = await doFetch(`${new URL(base).origin}/rest/v1/wf_inventory?${q}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!r || !r.ok) return [];
    const rows = await r.json();
    const gallery = rows && rows[0] && rows[0].christmas_photo_gallery;
    return christmasTaggedPhotos(eventId, gallery, deps.label);
  } catch {
    return [];
  }
}
