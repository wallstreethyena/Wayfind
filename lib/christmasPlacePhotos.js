// lib/christmasPlacePhotos.js: event tagged Christmas photos for the Christmas
// ticket cards and the event pages they open. Photos live on the EXISTING place
// row in signals.christmas_photo_gallery, each tagged with christmas_keys (the
// event ids it belongs to), so a holiday shot never shows on a year round place
// card and two events at one park never borrow each other's photos. Reads only.
import { normalizePhotoUrl, photoHashKey } from "./photoDedupe.js";
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

const VAULT_URL_RX = /^(?:https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/place-photos|https:\/\/www\.gowayfind\.com\/place-photos\/batch-\d{4}-\d{2})\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/;
const plain = (s) => String(s || "").replace(/\s+/g, " ").trim();

// Holiday photos that are not on the place row. Stetson has no place row.
// Winterfest's parade photos are these files, cover first. Same strip shape as the vault photos.
export const CHRISTMAS_STATIC_GALLERY = Object.freeze({
  "stetson-mansion-christmas-2026-2": [
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_08c508314b0a24ca.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/f844983/2147483647/strip/true/crop/1000x525+0+80/resize/1200x630!/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2Fcc%2Fa5%2F9b6a8a224d29a732a361df4370f0%2Fdownload.jpg"
    },
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_0037a7cd1556cd21.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/26a20e5/2147483647/strip/true/crop/1000x667+0+0/resize/1000x667!/format/webp/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2F41%2Ffd%2F5c0e85ea4723885a15b8fd2708d6%2Fdownload-4.jpg"
    },
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_12a09ca121613fb4.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/e696853/2147483647/strip/true/crop/1200x800+0+0/resize/1200x800!/format/webp/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2Ffd%2F00%2F7eb841b04246ba83d19855c857ed%2F75462405-2438470662930624-684026928331489280-o.jpg"
    },
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_133474259d49d439.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/c3ffe17/2147483647/strip/true/crop/1000x667+0+0/resize/2000x1334!/format/webp/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2F10%2F9f%2F5c630b684ab897abeaf8a96825f3%2Fdownload-5.jpg"
    },
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_203bba742ab4685d.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/fb0ac35/2147483647/strip/true/crop/1200x755+0+0/resize/2400x1510!/format/webp/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2F96%2F5c%2F321e9b324ce1988dc9d3a73031ec%2F76710828-2474685832642440-5776643013535072256-o.jpg"
    },
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_216d419b7dec5b4e.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/130fb0d/2147483647/strip/true/crop/1137x686+0+0/resize/1137x686!/format/webp/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2F69%2F88%2F0cc9e17d4e7089b2e4ba52e62d0e%2F79036167-2474685372642486-3318478237549461504-o.jpg"
    },
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_3198af759b06fa1b.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/2d7e0bc/2147483647/strip/true/crop/1176x765+0+0/resize/2352x1530!/format/webp/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2F9d%2F2b%2Fc99246af4ebbadbe83d5992b3d68%2F78112427-2438500276260996-2182004301612711936-o.jpg"
    },
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_1f3fe0d72af2d517.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/4bb083d/2147483647/strip/true/crop/1200x800+0+0/resize/1200x800!/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2Fdf%2F8e%2Ff7e7c9424541b99e1b3e5adae35b%2F78386029-2438504316260592-8985697102268989440-o.jpg"
    },
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_179f812d9cd2463f.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/707be2e/2147483647/strip/true/crop/1200x800+0+0/resize/2400x1600!/format/webp/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2F7c%2F4b%2Ff74891184bc6815b9ce5951e6fbc%2F77264195-2438497002927990-1894570096433561600-o.jpg"
    }
  ],
  "winterfest-boat-parade-fort-lauderdale-2026": [
    {
      "src": "/events/christmas-gallery/winterfest-boat-parade-fort-lauderdale-2026/xmas_006bd9c9426d3fd2.jpg",
      "credit": "Seminole Hard Rock Winterfest Boat Parade official website",
      "href": "https://winterfestparade.com/wp-content/uploads/2025/12/2025-72-Miss-Nicole-1024x683.webp"
    },
    {
      "src": "/events/christmas-gallery/winterfest-boat-parade-fort-lauderdale-2026/xmas_021241b48d5dd69c.jpg",
      "credit": "Seminole Hard Rock Winterfest Boat Parade official website",
      "href": "https://winterfestparade.com/wp-content/uploads/2025/12/2025-96-Gertrude-1024x683.webp"
    },
    {
      "src": "/events/christmas-gallery/winterfest-boat-parade-fort-lauderdale-2026/xmas_06c8c893bb224a83.jpg",
      "credit": "Seminole Hard Rock Winterfest Boat Parade official website",
      "href": "https://winterfestparade.com/wp-content/uploads/2025/12/2025-60-Shake-A-Leg-Miami-Yamas.webp"
    },
    {
      "src": "/events/christmas-gallery/winterfest-boat-parade-fort-lauderdale-2026/xmas_06fcf12c8a3dd2d5.jpg",
      "credit": "Seminole Hard Rock Winterfest Boat Parade official website",
      "href": "https://winterfestparade.com/wp-content/uploads/2025/12/2025-84-The-Beast-1536x1024.webp"
    },
    {
      "src": "/events/christmas-gallery/winterfest-boat-parade-fort-lauderdale-2026/xmas_084f5cf26706fa23.jpg",
      "credit": "Seminole Hard Rock Winterfest Boat Parade official website",
      "href": "https://winterfestparade.com/wp-content/uploads/2025/12/2025-44-Dare-To-Dream.webp"
    },
    {
      "src": "/events/christmas-gallery/winterfest-boat-parade-fort-lauderdale-2026/xmas_0b89f17ee9847974.jpg",
      "credit": "Seminole Hard Rock Winterfest Boat Parade official website",
      "href": "https://winterfestparade.com/wp-content/uploads/2025/12/2025-49-Catch-My-Drift.webp"
    }
  ]
});

// The featured card uses the wf_events event_id. The event page uses the public slug.
// Winterfest and the older Stetson id are the same galleries.
const CHRISTMAS_STATIC_ALIAS = Object.freeze({
  "winterfest-boat-parade-2026": "winterfest-boat-parade-fort-lauderdale-2026",
  "stetson-mansion-christmas-2026": "stetson-mansion-christmas-2026-2",
});

export function christmasStaticPhotos(eventId, label = "") {
  const id = String(eventId || "");
  const list = CHRISTMAS_STATIC_GALLERY[CHRISTMAS_STATIC_ALIAS[id] || id] || [];
  return list.slice(0, CHRISTMAS_MAX_PHOTOS).map((p) => ({ src: p.src, width: 1280, height: 853, alt: plain("Photo of " + (label || eventId)), credit: /^photo\b/i.test(p.credit) ? p.credit : "Photo by " + p.credit, creditHref: /^https:\/\//.test(p.href || "") ? p.href : null, source: "static" }));
}

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
    const keys = [normalizePhotoUrl(src), photoHashKey(g)].filter(Boolean);
    if (!VAULT_URL_RX.test(src) || keys.some((k) => seen.has(k))) continue;
    const raw = plain(g.attribution_text);
    if (!raw) continue;
    keys.forEach((k) => seen.add(k));
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
  const fixed = christmasStaticPhotos(eventId, deps.label);
  if (fixed.length) return fixed;
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
