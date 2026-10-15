// Browser-safe facts shared by the live-poster client prefilter and the
// authoritative server image fitter. No sharp, React, network or Node APIs.
export const LIVE_POSTER_RATIO = 0.5625;
export const LIVE_POSTER_MIN_CROP_WIDTH = 640;

// Sports provider art often contains a team logo or a complete matchup.
// Preserve that identity rather than cutting it into a narrow portrait slice.
export function preservesSportsArtwork(event) {
  return /sport/i.test(String(event?.segment || ""));
}

export function isNotEventArtwork(url) {
  if (typeof url !== "string" || !url) return true;
  return /\/api\/photo\?(?:[^#]*&)?(?:ref=places(?:%2F|\/)|place=)/i.test(url)
    || /\/api\/stock-photo\b/i.test(url);
}

export function isPlaceholderTmUrl(url) {
  return typeof url === "string" && /\/dam\/c\//i.test(url);
}

export function livePosterSourceCanPossiblyFit(source, { preserveArtwork = false } = {}) {
  if (!source || isPlaceholderTmUrl(source.url) || isNotEventArtwork(source.url)) return false;
  const width = Number(source.width), height = Number(source.height);
  // Providers such as SeatGeek do not always supply dimensions. Unknown is
  // not a rejection; the authoritative server must inspect those bytes.
  if (!(width > 0 && height > 0)) return true;
  if (preserveArtwork) return width >= LIVE_POSTER_MIN_CROP_WIDTH;
  const cropWidth = width / height >= LIVE_POSTER_RATIO
    ? Math.round(height * LIVE_POSTER_RATIO)
    : width;
  return cropWidth >= LIVE_POSTER_MIN_CROP_WIDTH;
}

export function eventMayHaveUsableProviderArt(event) {
  const variants = Array.isArray(event?.imageVariants) ? event.imageVariants : [];
  const known = new Set(variants.map((variant) => variant?.url));
  const options = { preserveArtwork: preservesSportsArtwork(event) };
  return variants.some((variant) => livePosterSourceCanPossiblyFit(variant, options))
    || [event?.image, event?.thumb].some((url) => url && !known.has(url)
      && livePosterSourceCanPossiblyFit({ url }, options));
}
