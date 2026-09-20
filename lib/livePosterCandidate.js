// Browser-safe facts shared by the live-poster client prefilter and the
// authoritative server image fitter. No sharp, React, network or Node APIs.
export const LIVE_POSTER_RATIO = 0.5625;
export const LIVE_POSTER_MIN_CROP_WIDTH = 640;

export function isNotEventArtwork(url) {
  if (typeof url !== "string" || !url) return true;
  return /\/api\/photo\?(?:[^#]*&)?(?:ref=places(?:%2F|\/)|place=)/i.test(url)
    || /\/api\/stock-photo\b/i.test(url);
}

export function isPlaceholderTmUrl(url) {
  return typeof url === "string" && /\/dam\/c\//i.test(url);
}

export function livePosterSourceCanPossiblyFit(source) {
  if (!source || isPlaceholderTmUrl(source.url) || isNotEventArtwork(source.url)) return false;
  const width = Number(source.width), height = Number(source.height);
  // Providers such as SeatGeek do not always supply dimensions. Unknown is
  // not a rejection; the authoritative server must inspect those bytes.
  if (!(width > 0 && height > 0)) return true;
  const cropWidth = width / height >= LIVE_POSTER_RATIO
    ? Math.round(height * LIVE_POSTER_RATIO)
    : width;
  return cropWidth >= LIVE_POSTER_MIN_CROP_WIDTH;
}

export function eventMayHaveUsableProviderArt(event) {
  const variants = Array.isArray(event?.imageVariants) ? event.imageVariants : [];
  const variantByUrl = new Map(variants.filter((v) => v?.url).map((v) => [v.url, v]));
  const seen = new Set();
  const sources = [];
  for (const variant of variants) {
    if (variant?.url && !seen.has(variant.url)) { seen.add(variant.url); sources.push(variant); }
  }
  for (const url of [event?.image, event?.thumb]) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push(variantByUrl.get(url) || { url });
  }
  return sources.some(livePosterSourceCanPossiblyFit);
}
