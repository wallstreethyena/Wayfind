// Seasonal "Movies in Theaters" registry (Fall / Halloween / Christmas rails).
// Pure data + pure helpers. No imports. Every row's facts were read off the movie's own
// fandango.com movie-overview page on 2026-10-28; that page is kept as `sourceUrl`, the
// verification source only. It is never rendered or linked.
//
// Voice rules: "why" is one Wayfind-voice line, no dashes, no prices. Rows are
// options in display order, never ranked by commission.
// Art: null renders a designed placeholder tile (moviePlaceholderTile). Posters are
// SELF-HOSTED official one-sheets at public/movies/<id>-400.webp, never hotlinked.
// WEEKLY REFRESH NOTE: when a refresh adds a new movie, download its poster the same way
// (the one-sheet image URL from its Fandango page JSON-LD, curl it ONCE), convert to webp
// at 400px wide (quality ~80, aspect kept, under 60KB), save as public/movies/<id>-400.webp
// and set art: { src: "/movies/<id>-400.webp", credit: "Official poster" }. The guard
// check-seasonal-movies.mjs fails on a missing, non webp or oversized file.

const row = (r) => Object.freeze({ ...r, vibes: Object.freeze(r.vibes) });

export const SEASONAL_MOVIES = Object.freeze({
  fall: Object.freeze([
    row({ id: "sense-and-sensibility-2026", title: "Sense and Sensibility", rating: "PG", runtimeMin: 131, releaseDate: "2026-10-16", status: "now_playing", through: null,
      why: "A warm, witty new Jane Austen with Daisy Edgar-Jones. Sweater weather in movie form.",
      vibes: ["cozy", "romance", "sweater weather"],
      sourceUrl: "https://www.fandango.com/sense-and-sensibility-2026-244998/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/sense-and-sensibility-2026-400.webp", credit: "Official poster" } }),
    row({ id: "klara-and-the-sun-2026", title: "Klara and The Sun", rating: "PG-13", runtimeMin: 116, releaseDate: "2026-10-23", status: "now_playing", through: null,
      why: "Taika Waititi adapts the Ishiguro novel with Jenna Ortega. Thoughtful and heartfelt for a slow Sunday.",
      vibes: ["book adaptation", "heartfelt", "new this week"],
      sourceUrl: "https://www.fandango.com/klara-and-the-sun-2026-246291/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/klara-and-the-sun-2026-400.webp", credit: "Official poster" } }),
    row({ id: "back-to-the-future-2026", title: "Back to the Future", rating: "PG-13", runtimeMin: 116, releaseDate: "2026-10-21", status: "now_playing", through: null,
      why: "Marty and Doc back for a limited run. Pure nostalgia, bring kids who have never seen it.",
      vibes: ["nostalgia", "family", "limited run"],
      sourceUrl: "https://www.fandango.com/back-to-the-future-2026-247467/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/back-to-the-future-2026-400.webp", credit: "Official poster" } }),
    row({ id: "wildwood-2026", title: "Wildwood", rating: "PG-13", runtimeMin: 130, releaseDate: "2026-10-23", status: "now_playing", through: null,
      why: "A handcrafted LAIKA fantasy about a girl rescuing her baby brother. Gorgeous stop motion for families.",
      vibes: ["family", "stop motion", "adventure"],
      sourceUrl: "https://www.fandango.com/wildwood-2026-246438/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/wildwood-2026-400.webp", credit: "Official poster" } }),
    row({ id: "whalefall-2026", title: "Whalefall", rating: "PG-13", runtimeMin: 106, releaseDate: "2026-10-16", status: "now_playing", through: null,
      why: "A diver swallowed by a whale with one hour of air. A survival story you will talk about after.",
      vibes: ["survival", "gripping", "coast"],
      sourceUrl: "https://www.fandango.com/whalefall-2026-246280/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/whalefall-2026-400.webp", credit: "Official poster" } }),
    row({ id: "the-odyssey-2026", title: "The Odyssey", rating: "R", runtimeMin: 172, releaseDate: "2026-07-17", status: "now_playing", through: null,
      why: "Nolan's Homer epic is still playing. The big screen is the only way to see this one.",
      vibes: ["epic", "big screen", "long"],
      sourceUrl: "https://www.fandango.com/the-odyssey-2026-241283/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/the-odyssey-2026-400.webp", credit: "Official poster" } }),
  ]),
  halloween: Object.freeze([
    row({ id: "clayface-2026", title: "Clayface", rating: "R", runtimeMin: 108, releaseDate: "2026-10-23", status: "now_playing", through: null,
      why: "A rising star turns into a revenge monster. Fresh in theaters and built for a dark night.",
      vibes: ["monster", "dark", "new this week"],
      sourceUrl: "https://www.fandango.com/clayface-2026-244768/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/clayface-2026-400.webp", credit: "Official poster" } }),
    row({ id: "other-mommy-2026", title: "Other Mommy", rating: "R", runtimeMin: 93, releaseDate: "2026-10-09", status: "now_playing", through: null,
      why: "An eight year old meets something in her closet. Short, creepy and best with the lights off.",
      vibes: ["creepy", "closet monster", "short and scary"],
      sourceUrl: "https://www.fandango.com/other-mommy-2026-246464/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/other-mommy-2026-400.webp", credit: "Official poster" } }),
    row({ id: "resident-evil-2026", title: "Resident Evil", rating: "R", runtimeMin: 94, releaseDate: "2026-09-18", status: "now_playing", through: null,
      why: "Zach Cregger reinvents the zombie franchise. Loud, scary and great with a group.",
      vibes: ["jump scares", "franchise", "group night"],
      sourceUrl: "https://www.fandango.com/resident-evil-2026-245893/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/resident-evil-2026-400.webp", credit: "Official poster" } }),
    row({ id: "practical-magic-2-2026", title: "Practical Magic 2", rating: "PG-13", runtimeMin: 130, releaseDate: "2026-09-11", status: "now_playing", through: null,
      why: "The Owens sisters are back with moonlit mischief. Witchy and cozy, no jump scares.",
      vibes: ["witchy", "cozy", "girls night"],
      sourceUrl: "https://www.fandango.com/practical-magic-2-2026-246473/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/practical-magic-2-2026-400.webp", credit: "Official poster" } }),
    row({ id: "nightmare-before-christmas-2026", title: "The Nightmare Before Christmas", rating: "PG", runtimeMin: 76, releaseDate: "2026-10-01", status: "now_playing", through: null,
      why: "Jack Skellington back on the big screen for a limited run. The one the whole family agrees on.",
      vibes: ["family", "classic", "limited run"],
      sourceUrl: "https://www.fandango.com/the-nightmare-before-christmas-re-release-2026-242669/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/nightmare-before-christmas-2026-400.webp", credit: "Official poster" } }),
    row({ id: "verity-2026", title: "Verity", rating: "R", runtimeMin: 114, releaseDate: "2026-10-02", status: "now_playing", through: null,
      why: "Anne Hathaway and Dakota Johnson in the Colleen Hoover thriller. Tense, twisty, date night ready.",
      vibes: ["psychological", "date night", "book club"],
      sourceUrl: "https://www.fandango.com/verity-2026-240033/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/verity-2026-400.webp", credit: "Official poster" } }),
  ]),
  christmas: Object.freeze([
    row({ id: "ebenezer-2026", title: "Ebenezer", rating: "NR", runtimeMin: null, releaseDate: "2026-11-13", status: "coming_soon", through: null,
      why: "Johnny Depp as Scrooge from Ti West. The name you know, the story you do not.",
      vibes: ["Scrooge", "dark holiday", "date night"],
      sourceUrl: "https://www.fandango.com/ebenezer-2026-246467/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/ebenezer-2026-400.webp", credit: "Official poster" } }),
    row({ id: "its-a-wonderful-life-80th", title: "It's A Wonderful Life 80th Anniversary", rating: "PG", runtimeMin: 135, releaseDate: "2026-12-18", status: "coming_soon", through: null,
      why: "Capra's holiday classic back on the big screen for its 80th year. Make it the family tradition.",
      vibes: ["classic", "family tradition", "limited run"],
      sourceUrl: "https://www.fandango.com/its-a-wonderful-life-80th-anniversary-244296/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/its-a-wonderful-life-80th-400.webp", credit: "Official poster" } }),
    row({ id: "festive-fun-with-peppa-2026", title: "Festive Fun with Peppa", rating: "NR", runtimeMin: 60, releaseDate: "2026-11-14", status: "coming_soon", through: null,
      why: "Peppa celebrates Evie's first Christmas in a one hour cinema event. An easy first movie for little ones.",
      vibes: ["little kids", "first movie", "one hour"],
      sourceUrl: "https://www.fandango.com/festive-fun-with-peppa-cinema-experience-2026-247788/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/festive-fun-with-peppa-2026-400.webp", credit: "Official poster" } }),
    row({ id: "violent-night-2-2026", title: "Violent Night 2", rating: "R", runtimeMin: 110, releaseDate: "2026-12-04", status: "coming_soon", through: null,
      why: "Santa is back and he is still not nice. Loud, funny holiday action for the grown ups.",
      vibes: ["adults", "action", "funny"],
      sourceUrl: "https://www.fandango.com/violent-night-2-2026-246466/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/violent-night-2-2026-400.webp", credit: "Official poster" } }),
    row({ id: "disneys-hexed-2026", title: "Disney's Hexed", rating: "PG", runtimeMin: 109, releaseDate: "2026-11-25", status: "coming_soon", through: null,
      why: "Disney's new animated adventure lands Thanksgiving week. The family movie of the holiday break.",
      vibes: ["family", "Thanksgiving week", "Disney"],
      sourceUrl: "https://www.fandango.com/disneys-hexed-2026-246251/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/disneys-hexed-2026-400.webp", credit: "Official poster" } }),
    row({ id: "hunger-games-sunrise-2026", title: "The Hunger Games: Sunrise on the Reaping", rating: "PG-13", runtimeMin: 150, releaseDate: "2026-11-20", status: "coming_soon", through: null,
      why: "Young Haymitch and the 50th Games. The big one for teens over the holidays.",
      vibes: ["teens", "franchise", "big opening"],
      sourceUrl: "https://www.fandango.com/the-hunger-games-sunrise-on-the-reaping-2026-240138/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/hunger-games-sunrise-2026-400.webp", credit: "Official poster" } }),
    row({ id: "avengers-doomsday-2026", title: "Avengers: Doomsday", rating: "NR", runtimeMin: null, releaseDate: "2026-12-18", status: "coming_soon", through: null,
      why: "Marvel's multiverse finale opens Christmas week. The group outing everyone will want in on.",
      vibes: ["event", "group", "Christmas week"],
      sourceUrl: "https://www.fandango.com/avengers-doomsday-2026-237176/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/avengers-doomsday-2026-400.webp", credit: "Official poster" } }),
    row({ id: "dune-part-three-2026", title: "Dune: Part Three", rating: "NR", runtimeMin: null, releaseDate: "2026-12-18", status: "coming_soon", through: null,
      why: "Villeneuve closes the trilogy. See it big, see it loud, Christmas week.",
      vibes: ["epic", "IMAX", "Christmas week"],
      sourceUrl: "https://www.fandango.com/dune-part-three-2026-244800/movie-overview", verifiedOn: "2026-10-28", art: { src: "/movies/dune-part-three-2026-400.webp", credit: "Official poster" } }),
  ]),
});

export const MOVIES_RAIL_DEFS = Object.freeze({
  fall: Object.freeze({ title: "Movies in Theaters Now", deck: "Cozy, heartfelt and family friendly big screen nights." }),
  halloween: Object.freeze({ title: "Scary Movies in Theaters", deck: "Jump scares or witchy fun for your crew." }),
  christmas: Object.freeze({ title: "Holiday Movies in Theaters", deck: "Holiday classics and big openings on screen." }),
});

export const MOVIE_COLLECTIONS = Object.freeze(Object.keys(SEASONAL_MOVIES));

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Pure resolver over any row list: coming_soon flips to now_playing on release day and a row past
// its "through" date drops. today = YYYY-MM-DD (siteTodayStr()).
export function resolveMovieRows(rows, today) {
  if (!Array.isArray(rows) || !ISO.test(String(today || ""))) return [];
  return rows
    .filter((m) => !(m.through && m.through < today))
    .map((m) => ({ ...m, vibes: [...m.vibes], status: m.status === "coming_soon" && m.releaseDate <= today ? "now_playing" : m.status }));
}

export function moviesForCollection(collection, today) {
  return resolveMovieRows(Object.hasOwn(SEASONAL_MOVIES, collection) ? SEASONAL_MOVIES[collection] : null, today);
}

// The ONE ticket path every movie card sells: the movie's OWN Fandango page
// (the row's sourceUrl), reached through /api/commerce/go with provider
// "fandango" and offerId = the movie's registry id, wrapped in the CJ
// dlg deep link (lib/deals.js fandangoRawPathDeepLink, verified 302 ->
// cj.dotomi.com on 2026-10-30). A tap therefore opens THAT movie to buy
// tickets for it. Until 2026-10-30 every card instead sold the generic
// Undercover Tourist chain voucher (wf_deals id 11) — a discounted ticket
// good at AMC/Regal/Cinemark for any film — so a Resident Evil tap landed
// on a generic Regal/AMC voucher page, not the movie. That deal still
// exists on the deals/coupons surfaces where a generic voucher is honest;
// it is no longer what a movie card's Get tickets button sells.
export const MOVIE_TICKET_OFFER = Object.freeze({ provider: "fandango", merchant: "Fandango" });

// Resolve a registry movie id to its Fandango destination. Returns null
// for anything unknown — the commerce gate then refuses, never guesses.
export function movieDestinationById(id) {
  for (const rows of Object.values(SEASONAL_MOVIES)) {
    for (const m of rows) if (m.id === id) return m.sourceUrl || null;
  }
  return null;
}

const TINTS = {
  fall: "linear-gradient(160deg,#4A2A10,#1E1207)",
  halloween: "linear-gradient(160deg,#3B1A5C,#160A24)",
  christmas: "linear-gradient(160deg,#5C1A1F,#240A0C)",
};
// Same {icon,label,tint} shape EventPlaceholderTile renders.
export function moviePlaceholderTile(collection, status) {
  return { icon: "🎬", label: status === "coming_soon" ? "Coming soon" : "Now playing", tint: TINTS[collection] || TINTS.fall };
}
