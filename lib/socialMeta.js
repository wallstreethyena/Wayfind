// lib/socialMeta.js — one source of truth for OpenGraph + Twitter social-preview
// tags (v6-glass-box SEO sweep). The SEO audit found `og:image` missing and the
// Twitter card falling back to the generic homepage on every route except "/",
// because each metadata delegator set `openGraph` WITHOUT `images` (Next replaces
// the whole openGraph block, dropping the inherited image) and never set `twitter`.
// Spread this into every delegator so each route ships a preview image + a
// page-specific summary_large_image card. Falls back to the brand share card.
import { SITE_URL } from "./site";

const FALLBACK_IMAGE = SITE_URL + "/share-card.png";

/**
 * @param {{title:string, description:string, url:string, image?:string}} m
 * @returns metadata fragment with a complete openGraph (incl. images) + twitter.
 */
export function socialMeta({ title, description, url, image }) {
  const img = image || FALLBACK_IMAGE;
  return {
    openGraph: { title, description, url, siteName: "Wayfind", type: "website", images: [{ url: img }] },
    twitter: { card: "summary_large_image", title, description, images: [img] },
  };
}
