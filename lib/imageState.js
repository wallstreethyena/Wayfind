// Premium redesign, Phase 3 — the image fallback chain as pure logic, in a
// plain-JS module so scripts/test-image-fallback.mjs can import it without
// evaluating kit.js's JSX. kit.js re-exports imageDisplayState + wraps it in
// the FallbackImg/BrandedImageFallback components.
//
// A card image is in exactly one of three states; it must NEVER be a blank
// rectangle or a broken-image glyph:
//   no usable src, or it errored -> "fallback" (branded artwork)
//   src present, not yet onLoad   -> "skeleton" (shimmer matching the frame)
//   src present, loaded ok        -> "image"
export function imageDisplayState({ src, errored, loaded }) {
  if (!src || errored) return "fallback";
  if (!loaded) return "skeleton";
  return "image";
}
