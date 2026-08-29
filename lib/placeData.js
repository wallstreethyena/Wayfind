// lib/placeData.js — SERVER-ONLY, JSX-FREE data + metadata layer for durable place
// pages. Split from the JSX renderer (lib/placePage.js) so this logic — the
// allowlist gate, the details merge, and the content-gated indexability — is unit
// testable without a React runtime.
import { cache } from "react";
import { SITE_URL } from "./site";
import { socialMeta } from "./socialMeta";
import { getSkeleton } from "./placeIndex";
import { getPlaceDetails, peekPlaceDetails } from "./placeDetails";
import { getInventoryIdentity } from "./inventoryIdentity";
import { atlasPlaceFor, mergePlacePage, preferInventorySkeleton, shouldCallGooglePlaceDetails } from "./atlasPlaceAllowlist";

// Allowlist-gate + details merge, deduped per request (generateMetadata + the page
// both call it). Returns the merged place, or null when the id isn't indexed
// AND has no publish-ready Atlas card. getSkeleton() still runs first.
// Atlas-card ids never call getPlaceDetails (no Google). Identity prefers a
// wf_inventory row we already hold (name / lat / lng / signals) over Places.
// Indexed ids peek the pd1| cache and only spend Places when that cache is
// cold AND there is no Atlas copy to prefer.
export const loadPlace = cache(async (id) => {
  if (!id) return null;
  const atlas = atlasPlaceFor(id);
  const indexed = await getSkeleton(id);
  const inv = atlas ? await getInventoryIdentity(id) : null;
  const skel = preferInventorySkeleton(inv, indexed);
  if (!skel && !atlas) return null;
  const cached = (skel || atlas) ? await peekPlaceDetails(id) : null;
  let details = cached;
  if (shouldCallGooglePlaceDetails({ skel: indexed, cached, atlas })) {
    details = await getPlaceDetails(id);
  }
  return mergePlacePage(id, { skel, details, atlas });
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
    ...socialMeta({ title, description, url }),
  };
}

export function placesIndexMetadata() {
  const url = `${SITE_URL}/places`;
  const title = "Places on Wayfind — a merit-ranked local guide";
  const description = "Browse real places Wayfind covers, ranked on real reviews, not ads. Open any one for hours, directions, and what's worth your time nearby.";
  return { title, description, alternates: { canonical: url }, ...socialMeta({ title, description, url }) };
}
