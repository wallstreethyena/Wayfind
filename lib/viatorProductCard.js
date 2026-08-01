// Pure presentation mapping shared by the curated-product route and its guard.
// Accepts both Viator search/detail responses and cached wf_experiences rows.
// It deliberately emits no product URL: the browser books by opaque product
// code through Wayfind's commerce redirect.

export function viatorImage(product) {
  const images = Array.isArray(product?.images) ? product.images : [];
  const variants = images
    .flatMap((image) => Array.isArray(image?.variants) ? image.variants : [])
    .filter((variant) => variant && typeof variant.url === "string" && variant.url);
  const preferred = variants
    .filter((variant) => Number(variant.width) >= 360 && Number(variant.width) <= 900)
    .sort((a, b) => Number(b.width || 0) - Number(a.width || 0))[0];
  const largest = variants.slice().sort((a, b) => Number(b.width || 0) - Number(a.width || 0))[0];
  const direct = images.find((image) => image && typeof image.url === "string" && image.url);
  return (preferred && preferred.url) || (largest && largest.url) || (direct && direct.url) || null;
}

function durationLabel(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return null;
  const rounded = Math.round(value);
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function viatorProductCard(product) {
  const code = String(product?.productCode || "").trim();
  if (!code || product?.status === "INACTIVE") return null;
  const duration = product?.duration || {};
  const minutes = duration.fixedDurationInMinutes || duration.variableDurationToMinutes;
  const searchPrice = product?.pricing?.summary?.fromPrice;
  return {
    code,
    title: String(product?.title || "").trim().slice(0, 140),
    image: viatorImage(product),
    rating: Number(product?.reviews?.combinedAverageRating || 0) || 0,
    reviews: Number(product?.reviews?.totalReviews || 0) || 0,
    fromPrice: Number(searchPrice || 0) || 0,
    duration: durationLabel(minutes),
  };
}

export function cachedExperienceCard(row) {
  const code = String(row?.product_code || "").trim();
  if (!code) return null;
  return {
    code,
    title: String(row?.title || "").trim().slice(0, 140),
    image: String(row?.image || "").trim() || null,
    rating: Number(row?.rating || 0) || 0,
    reviews: Number(row?.reviews || 0) || 0,
    fromPrice: Number(row?.from_price || 0) || 0,
    duration: durationLabel(row?.duration_min),
  };
}
