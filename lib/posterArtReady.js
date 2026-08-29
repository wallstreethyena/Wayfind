// lib/posterArtReady.js — when a DaypartRail poster tile may drop is-art-ready.
//
// THE BUG (2026-08-29, owner iPhone Safari, Parrish Home): Tonight's Move
// stayed on grey PlaceCardSkeleton cards. Box Chrome on the same live SHA
// painted the poster and dropped the overlay; /api/rails was 200 in 0.44s.
// iOS Safari often skips img.onLoad for a cached JPEG and/or an AVIF
// <picture>, so artReady stayed {} and .wf8-tile-sk never hid.
//
// A tile must have a path to markArtReady from EACH of: onLoad, complete +
// naturalWidth (Safari cache skip), and onError (a broken image must not
// leave a mute skeleton forever). decode() is a fourth lane when the engine
// exposes it.

/** True when the img has already decoded pixels — Safari cache skip of onLoad. */
export function posterImgIsReady(img) {
  if (!img) return false;
  return !!(img.complete && Number(img.naturalWidth) > 0);
}

/**
 * Bind every lane that can clear a poster. `onReady` is called at most once.
 * Returns an unbind. A complete image with no naturalWidth is treated as
 * ready-failed so a 404 cannot stick the overlay.
 */
export function bindPosterArtReady(img, onReady) {
  if (!img || typeof onReady !== "function") return () => {};
  let done = false;
  const mark = () => {
    if (done) return;
    done = true;
    onReady();
  };
  if (posterImgIsReady(img)) {
    mark();
    return () => {};
  }
  if (img.complete) {
    mark();
    return () => {};
  }
  const onLoad = () => mark();
  const onError = () => mark();
  img.addEventListener("load", onLoad);
  img.addEventListener("error", onError);
  if (typeof img.decode === "function") {
    Promise.resolve(img.decode()).then(mark, mark);
  }
  return () => {
    img.removeEventListener("load", onLoad);
    img.removeEventListener("error", onError);
  };
}

/** Walk a tile (or a track) for the poster img, including <picture><source>. */
export function posterImgInTile(tile) {
  if (!tile || typeof tile.querySelector !== "function") return null;
  return tile.querySelector("img.wf8-tim") || tile.querySelector("picture img") || null;
}
