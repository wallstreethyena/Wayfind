// One media standard for place-detail surfaces. Feed cards and event heroes
// keep their own layouts. Full originals remain available in the photo viewer.
export const PLACE_DETAIL_PHOTO_STANDARD = Object.freeze({
  frame: Object.freeze({ width: "100%", aspectRatio: "16 / 9", minHeight: 220, maxHeight: 420 }),
  image: Object.freeze({ objectFit: "cover", objectPosition: "center" }),
});
