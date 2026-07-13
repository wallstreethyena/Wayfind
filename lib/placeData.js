// lib/placeData.js — SERVER-ONLY, JSX-FREE data + metadata layer for durable place
// pages. Split from the JSX renderer (lib/placePage.js) so this logic — the
// allowlist gate, the details merge, and the content-gated indexability — is unit
// testable without a React runtime.
import { cache } from "react";
import { SITE_URL } from "./site";
import { getSkeleton } from "./placeIndex";
import { getPlaceDetails } from "./placeDetails";

// Allowlist-gate + details merge, deduped per request (generateMetadata + the page
// both call it). Returns the merged place, or null when the id isn't indexed.
// getSkeleton() runs FIRST and short-circuits to null BEFORE any Google call.
export const loadPlace = cache(async (id) => {
  const skel = await getSkeleton(id); // ALLOWLIST — null => not indexed
  if (!skel) return null;
  const d = await getPlaceDetails(id); // rich content (null only on total Google+cache failure)
  const sig = skel.signals && typeof skel.signals === "object" ? skel.signals : {};
  return {
    id,
    name: (d && d.name) || skel.name || null,
    address: (d && d.address) || null,
    lat: d && d.lat != null ? d.lat : skel.lat,
    lng: d && d.lng != null ? d.lng : skel.lng,
    rating: d && d.rating != null ? d.rating : (typeof sig.rating === "number" ? sig.rating : null),
    reviews: (d && d.reviews) || sig.reviews || 0,
    price: (d && d.price) || null,
    category: (d && d.category) || skel.category || null, // may be null
    hours: (d && d.hours) || [],
    description: (d && d.description) || null,
    mapsUri: (d && d.mapsUri) || null,
    businessStatus: (d && d.businessStatus) || null,
    hasDetails: !!d,
  };
});

export function cityOf(address) {
  if (!address) return null;
  const parts = String(address).split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || null);
}

// A page is INDEXABLE only when it carries real detail content — otherwise a
// name+rating skeleton is thin/doorway, so it renders for users but stays noindex.
export function isIndexable(p) {
  return !!(p && p.hasDetails && (p.address || p.description));
}

export async function placePageMetadata({ params }) {
  const p = await loadPlace(params.id);
  if (!p || !p.name) return { title: "Place not found — Wayfind", robots: { index: false, follow: true } };
  const url = `${SITE_URL}/places/${params.id}`;
  const city = cityOf(p.address);
  const title = `${p.name}${city ? " — " + city : ""} | Wayfind`;
  const bits = [p.category, p.rating != null ? p.rating + "★" : null, p.reviews ? `${p.reviews.toLocaleString()} reviews` : null].filter(Boolean);
  const description = (p.description || `${bits.join(" · ")}${p.address ? " · " + p.address : ""}. See it on Wayfind, then open for hours, directions, and what's nearby.`).slice(0, 300);
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: isIndexable(p) ? undefined : { index: false, follow: true },
    openGraph: { title, description, url, siteName: "Wayfind", type: "website" },
  };
}

export function placesIndexMetadata() {
  const url = `${SITE_URL}/places`;
  const title = "Places on Wayfind — a merit-ranked local guide";
  const description = "Browse real places Wayfind covers, ranked on real reviews, not ads. Open any one for hours, directions, and what's worth your time nearby.";
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, siteName: "Wayfind", type: "website" } };
}
