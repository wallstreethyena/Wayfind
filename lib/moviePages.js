// lib/moviePages.js: the pure side of the Wayfind movie page (/movies/<id>).
// Registry rows live in lib/seasonalMovies.js; this file only derives what the page, its link
// preview, its schema and the sitemap need, so a guard can CALL it. No React, no node APIs.
//
// Copy rules: no dashes (em, en, spaced hyphen), no prices. Coming soon movies read "Opens <date>".
import { SEASONAL_MOVIES, MOVIE_COLLECTIONS, MOVIE_TICKET_OFFER, resolveMovieRows, movieTicketHref } from "./seasonalMovies.js";
import { SITE_URL } from "./site.js";

export const MOVIE_PAGE_SURFACE = "movie_page";
export const MOVIE_BUY_NOTE = "Discounted AMC, Regal and Cinemark tickets, good for any movie.";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-12-19" -> "Dec 19" (calendar text only, no Date math, so no timezone drift). */
export function movieShortDate(iso) {
  const m = ISO.exec(String(iso || ""));
  if (!m) return "";
  return `${MONTHS[Number(m[2]) - 1] || ""} ${Number(m[3])}`.trim();
}

/** 116 -> "1h 56m", 45 -> "45m", null -> null. */
export function movieRuntimeLabel(min) {
  const n = Number(min);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 60 ? `${Math.floor(n / 60)}h ${n % 60}m` : `${n}m`;
}

/** 116 -> "PT1H56M" (schema.org duration), null -> null. */
export function movieIsoDuration(min) {
  const n = Number(min);
  if (!Number.isFinite(n) || n <= 0) return null;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return "PT" + (h ? h + "H" : "") + (m || !h ? m + "M" : "");
}

/** Every registry row with its collection, in display order. */
export function allMovieRows() {
  const out = [];
  for (const collection of MOVIE_COLLECTIONS) for (const row of SEASONAL_MOVIES[collection]) out.push({ collection, row });
  return out;
}

export function allMovieIds() {
  return allMovieRows().map((r) => r.row.id);
}

/** The page's resolved movie (status flipped by today, expired rows gone), or null. */
export function movieById(id, today) {
  for (const { collection, row } of allMovieRows()) {
    if (row.id !== id) continue;
    const [movie] = resolveMovieRows([row], today);
    return movie ? { movie, collection } : null;
  }
  return null;
}

/** Live movies other than `id`, same collection first (options, never ranked by commission). */
export function otherMovies(id, today) {
  const me = movieById(id, today);
  const rows = [];
  for (const { collection, row } of allMovieRows()) {
    if (row.id === id) continue;
    const [movie] = resolveMovieRows([row], today);
    if (movie) rows.push({ movie, collection, same: me ? collection === me.collection : false });
  }
  return [...rows.filter((r) => r.same), ...rows.filter((r) => !r.same)];
}

export function moviePath(id) { return "/movies/" + id; }
export function movieUrl(id) { return SITE_URL + moviePath(id); }

/** { label, value } for the When fact and the share card: Now playing or Opens <Mon D>. */
export function movieWhen(movie) {
  if (movie.status === "coming_soon") {
    const opens = movieShortDate(movie.releaseDate);
    return { label: "Opens", value: opens || "Soon", text: opens ? "Opens " + opens : "Coming soon" };
  }
  const until = movieShortDate(movie.through);
  return { label: "Now playing", value: until ? "Through " + until : "In theaters", text: until ? "Now playing through " + until : "Now playing" };
}

export function movieTitleTag(movie) { return `${movie.title} in Theaters | Wayfind`; }

export function movieOgImageUrl(id) { return `${SITE_URL}/api/og/movie?id=${encodeURIComponent(id)}`; }

export function moviePosterUrl(movie) {
  return movie && movie.art && movie.art.src ? SITE_URL + movie.art.src : null;
}

/** The ticket button: same /api/commerce/go handoff the rail card sells, tagged with this page. */
export function movieBuyHref(id) { return movieTicketHref(id, MOVIE_PAGE_SURFACE); }
export { MOVIE_TICKET_OFFER };

/** generateMetadata result for a resolved movie. */
export function movieMetadata(movie) {
  const title = movieTitleTag(movie);
  const description = movie.why;
  const url = movieUrl(movie.id);
  const img = movieOgImageUrl(movie.id);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: "Wayfind", images: [{ url: img, width: 1200, height: 630, type: "image/jpeg", alt: `${movie.title} poster on Wayfind` }] },
    twitter: { card: "summary_large_image", title, description, images: [img] },
    robots: { index: true, follow: true },
  };
}

/** schema.org Movie. Only facts the registry holds; NR carries no contentRating. */
export function movieJsonLd(movie) {
  const duration = movieIsoDuration(movie.runtimeMin);
  const poster = moviePosterUrl(movie);
  return {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: movie.title,
    url: movieUrl(movie.id),
    description: movie.why,
    datePublished: movie.releaseDate,
    ...(poster ? { image: poster } : {}),
    ...(movie.rating && movie.rating !== "NR" ? { contentRating: movie.rating } : {}),
    ...(duration ? { duration } : {}),
  };
}

/** Sitemap rows: one per live movie. */
export function movieSitemapRows(siteUrl, today) {
  return allMovieIds().filter((id) => movieById(id, today)).map((id) => ({ url: `${siteUrl}${moviePath(id)}` }));
}
