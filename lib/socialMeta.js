// lib/socialMeta.js — one source of truth for OpenGraph + Twitter social-preview
// tags (v6-glass-box SEO sweep). The SEO audit found `og:image` missing and the
// Twitter card falling back to the generic homepage on every route except "/",
// because each metadata delegator set `openGraph` WITHOUT `images` (Next replaces
// the whole openGraph block, dropping the inherited image) and never set `twitter`.
// Spread this into every delegator so each route ships a preview image + a
// page-specific summary_large_image card. Falls back to the brand share card.
import { SITE_URL } from "./site";

// 2026-08-12 — the committed share-card.png is DELETED (owner: "I want every
// image we have used for text share deleted"). The fallback is now the dynamic,
// photo-free branded card, so a link preview still renders something on brand
// without a baked-in image sitting in the repo.
const FALLBACK_IMAGE = SITE_URL + "/api/og";

// v9 (owner, 2026-09-23): "everything on wayfind that is sharable looks
// premium and looks good on social media." Every og:image this helper ships
// now carries width/height/type/alt — several platforms render a preview at
// the wrong aspect (or skip it) when those are missing, and it is also what
// let a page ship a bare, undimensioned image string undetected (see
// scripts/check-hero-card.mjs). `image` still accepts a plain string for the
// handful of call sites that pass one — it is filled out to the same shape,
// defaulting to this app's own 1200x630 PNG card. A caller with real
// dimensions (the hero route's JPEG-backed photo cards) passes the full
// object instead and keeps them.
const DEFAULT_IMAGE_SHAPE = { width: 1200, height: 630, type: "image/png" };

function imageDescriptor(image, title) {
  if (image && typeof image === "object" && image.url) {
    return {
      url: image.url,
      width: image.width || DEFAULT_IMAGE_SHAPE.width,
      height: image.height || DEFAULT_IMAGE_SHAPE.height,
      type: image.type || DEFAULT_IMAGE_SHAPE.type,
      alt: image.alt || title || "Wayfind",
    };
  }
  const url = (typeof image === "string" && image) || FALLBACK_IMAGE;
  return { url, ...DEFAULT_IMAGE_SHAPE, alt: title || "Wayfind" };
}

/**
 * @param {{title:string, description:string, url:string,
 *   image?:string|{url:string,width?:number,height?:number,type?:string,alt?:string}}} m
 * @returns metadata fragment with a complete openGraph (incl. images) + twitter.
 */
export function socialMeta({ title, description, url, image }) {
  const img = imageDescriptor(image, title);
  return {
    openGraph: { title, description, url, siteName: "Wayfind", type: "website", images: [img] },
    twitter: { card: "summary_large_image", title, description, images: [img.url] },
  };
}
