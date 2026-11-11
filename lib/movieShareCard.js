// lib/movieShareCard.js: render-ready model for a movie's 1200x630 link preview.
// Reuses the rail poster plate (WayfindRailCard in app/api/og/card.jsx): poster whole on the left,
// title and one status line on the right. Pure, so a guard can call it. No dashes, no prices.
import { layoutHeadline, ellipsize, fitCta } from "./shareCard.js";
import { RAIL_CARD } from "./railShareCard.js";
import { moviePlaceholderTile } from "./seasonalMovies.js";
import { movieWhen, movieRuntimeLabel } from "./moviePages.js";

export const MOVIE_CARD_CTA = "SEE IT ON WAYFIND";

/** @param {object} movie resolved registry row  @param {string} collection  @param {string|null} poster JPEG data URI */
export function movieCardModel(movie, collection, poster) {
  const h = layoutHeadline(movie.title, { maxWidth: RAIL_CARD.colW, maxLines: RAIL_CARD.maxLines, sizes: RAIL_CARD.sizes, weight: 900 });
  const blockH = h.lines.length * h.size * RAIL_CARD.lead;
  const top = Math.max(RAIL_CARD.bandTop - 20, Math.round((RAIL_CARD.bandTop + RAIL_CARD.bandBottom) / 2 - blockH / 2) - 20);
  const foot = [movieWhen(movie).text, movie.rating, movieRuntimeLabel(movie.runtimeMin)].filter(Boolean).join(" · ");
  return {
    variant: "rail",
    id: movie.id,
    poster: poster || null,
    tint: moviePlaceholderTile(collection, movie.status).tint,
    lines: h.lines,
    size: h.size,
    top,
    fitted: h.fitted,
    accent: [],
    foot: ellipsize(foot, 23, 600, RAIL_CARD.colW),
    cta: fitCta(MOVIE_CARD_CTA, RAIL_CARD.colW - 60),
  };
}
