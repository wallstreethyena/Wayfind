// lib/creatorVideos.js — curated creator-video associations (Phase 1).
//
// UGC social proof + creator referral on the place DETAIL SHEET, which is a
// noindex client surface (see app/p/[id]/page.js:32). So a featured creator's
// benefit HERE is clicks/traffic to their video, not SEO — we credit them by
// handle and link out to their real video, keeping the referrer so the visit
// attributes to Wayfind in their analytics. NO JSON-LD lives here; VideoObject /
// ItemList schema is exclusively a /trending/[city] concern (Phase 2/3, indexable).
//
// Keyed to the SAME id the app already uses for a place (place.id — a Google
// place_id, an "fsq:..." id, or a synthetic id; stored verbatim, prefix included).
// Hand-curated entries that don't carry an id may match by name (+ an optional
// city token), which keeps curation practical. Client-safe, zero deps.

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

// Presentation per platform: color + label only (the card renders the play
// affordance). No per-platform emoji-as-chrome, consistent with the redesign.
export const PLATFORM = {
  tiktok: { label: "TikTok", color: "#FF0050" },
  instagram: { label: "Instagram", color: "#E1306C" },
  youtube: { label: "YouTube", color: "#FF0000" },
  facebook: { label: "Facebook", color: "#1877F2" },
};

// Each entry: { placeId?, match?: { name, city? }, videos: [video, ...] }
//   video: { platform, url, creator?, caption?, thumbnail?, views?, postedAt? }
// A place resolves its curated videos by placeId first, then by name (+ city token).
// `caption` is ALWAYS Wayfind's own words, never the creator's verbatim caption
// (copyright + duplicate-content); the credit + link-out is how the creator benefits.
const CURATED = [
  {
    match: { name: "Spinning Coffee", city: "Bradenton" },
    videos: [
      {
        platform: "tiktok",
        url: "https://www.tiktok.com/@cindy.selects/video/7661821646973586702",
        creator: "cindy.selects",
        caption: "A local creator's visit to this Bradenton coffee spot.",
      },
    ],
  },
  {
    // Mai-Kai (Fort Lauderdale) — seeds the multi-city flow. Keyed by name+city;
    // resolving the Google Place ID + upserting wf_place_ids is deferred (blocked
    // by the Places-429 / no local key). TODO(curation): the Facebook share link
    // carries no handle — supply the creator's name/handle to complete the credit.
    match: { name: "Mai-Kai", city: "Fort Lauderdale" },
    videos: [
      {
        platform: "facebook",
        url: "https://www.facebook.com/share/r/1EPX6DN118/",
        // creator: TODO — no handle in the share URL; do not fabricate.
        caption: "Fort Lauderdale's tiki landmark since 1956: a Polynesian dinner show, reservations required.",
      },
    ],
  },
];

function cityMatches(place, locName, city) {
  if (!city) return true;
  const hay = norm([place && place.city, place && place.address, locName].filter(Boolean).join(" "));
  return hay.includes(norm(city));
}

// Curated creator videos for a place (possibly empty). `locName` is the app's
// current location label, used only to corroborate a name-based city match.
export function creatorVideosFor(place, locName) {
  if (!place) return [];
  const pid = place.id != null ? String(place.id) : "";
  const nm = norm(place.name);
  for (const e of CURATED) {
    if (e.placeId && pid && String(e.placeId) === pid) return e.videos || [];
    if (e.match && nm) {
      const cnm = norm(e.match.name);
      if (cnm && nm.includes(cnm) && cityMatches(place, locName, e.match.city)) return e.videos || [];
    }
  }
  return [];
}
