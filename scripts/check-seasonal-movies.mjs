// Seasonal "Movies in Theaters" registry + Undercover Tourist ticket handoff + /api/movies/seasonal.
// Calls the real modules, the real resolver and the real route handler (no regex over source for
// the contract). Off-box (CJ, Undercover Tourist, Supabase) is never contacted: global fetch is a
// thrower, and the wf_deals row 11 lookup is served by an injected fake fetch/env (resolveOffer deps),
// so the live DB row itself is NOT verified here (static + resolver parts only; row 11 serves per the
// owner's 2026-10-28 check, link_ok null).
import assert from "node:assert/strict";
import fs from "node:fs";
process.env.WF_SUPPRESS_ANALYTICS = "1";
const reg = await import("../lib/seasonalMovies.js");
const { PROVIDERS, resolveOffer } = await import("../lib/commerceProviders.js");
const { partnerTicketLabel } = await import("../lib/partnerCopy.js");
const { siteTodayStr } = await import("../lib/siteTime.js");
const { GET } = await import("../app/api/movies/seasonal/route.js");
const { SEASONAL_MOVIES, MOVIES_RAIL_DEFS, MOVIE_COLLECTIONS, MOVIE_TICKET_OFFER, moviesForCollection, resolveMovieRows, moviePlaceholderTile } = reg;

let pass = 0;
let total = 0;
const ok = (c, label) => { assert.ok(c, label); pass++; };
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("check-seasonal-movies must not make network requests"); };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validIso = (s) => ISO.test(s) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
// U+2014 em dash, U+2013 en dash, and a spaced hyphen are all banned in user facing strings.
const dashy = (s) => /[—–]/.test(s) || / - /.test(s);
const RATINGS = new Set(["G", "PG", "PG-13", "R", "NR"]);
const STATUSES = new Set(["now_playing", "coming_soon"]);
const today = siteTodayStr();

try {
  // controls: the probes must catch known bad shapes before they are trusted on real data
  ok(dashy("a — b") && dashy("a – b") && dashy("a - b") && !dashy("Daisy Edgar-Jones"), "control: dash probe catches em, en and spaced hyphen, allows a name hyphen");
  ok(validIso("2026-10-23") && !validIso("2026-02-30") && !validIso("10/23/2026"), "control: ISO validator rejects impossible and non ISO dates");
  ok(!/^\/movies\//.test("/evil/x.webp") && /^\/movies\//.test("/movies/x.webp"), "control: art path probe");

  ok(JSON.stringify(MOVIE_COLLECTIONS) === JSON.stringify(["fall", "halloween", "christmas"]), "exactly the three collections");
  const allIds = new Set(); const allUrls = new Set();
  for (const c of MOVIE_COLLECTIONS) {
    const rows = SEASONAL_MOVIES[c];
    ok(rows.length >= 3 && rows.length <= 8, `${c}: 3 to 8 rows (has ${rows.length})`);
    const def = MOVIES_RAIL_DEFS[c];
    ok(def && def.title && def.deck && !dashy(def.title) && !dashy(def.deck), `${c}: rail title and deck present, no dashes`);
    for (const m of rows) {
      total++;
      ok(!allIds.has(m.id) && !allUrls.has(m.sourceUrl), `${m.id}: unique id and url`);
      allIds.add(m.id); allUrls.add(m.sourceUrl);
      ok(!("fandangoUrl" in m), `${m.id}: no fandangoUrl field (renamed sourceUrl)`);
      const u = new URL(m.sourceUrl);
      ok(u.protocol === "https:" && u.hostname === "www.fandango.com" && !u.search && !u.username && u.pathname.endsWith("/movie-overview"), `${m.id}: https www.fandango.com .../movie-overview`);
      ok(validIso(m.releaseDate) && validIso(m.verifiedOn) && m.verifiedOn <= today, `${m.id}: valid dates, verifiedOn not in the future`);
      ok(m.through === null || (validIso(m.through) && m.through >= m.releaseDate), `${m.id}: through null or a valid date after release`);
      ok(RATINGS.has(m.rating), `${m.id}: rating enum`);
      ok(m.runtimeMin === null || (Number.isInteger(m.runtimeMin) && m.runtimeMin > 0), `${m.id}: runtime integer or null`);
      ok(STATUSES.has(m.status), `${m.id}: status enum`);
      ok(m.why && m.why.length <= 110 && !dashy(m.why) && !/\$\s?\d|\bprice|\bcheap|\bdeal\b/i.test(m.why), `${m.id}: why present, <=110 chars, no dashes, no prices`);
      ok(m.title && !dashy(m.title), `${m.id}: title has no dashes`);
      ok(Array.isArray(m.vibes) && m.vibes.length >= 1 && m.vibes.length <= 3 && m.vibes.every((v) => v && !dashy(v)), `${m.id}: 1 to 3 clean vibes`);
      ok(m.art === null || (/^\/movies\/[\w.-]+\.webp$/.test(m.art.src) && m.art.credit && fs.existsSync(new URL("../public" + m.art.src, import.meta.url))), `${m.id}: art null or an existing /movies/ file with credit`);
    }
  }

  // The single offer constant and the real resolver. Row 11 is served by an injected fake table
  // (no network); the assertions are that the resolver asks wf_deals for EXACTLY the configured id
  // and passes the CJ attributed link through, and refuses a row proven dead.
  ok(MOVIE_TICKET_OFFER.provider === "undercover_tourist" && MOVIE_TICKET_OFFER.offerId === 11 && MOVIE_TICKET_OFFER.merchant === "Undercover Tourist", "MOVIE_TICKET_OFFER is undercover_tourist offer 11");
  ok(PROVIDERS.undercover_tourist?.table === "wf_deals" && PROVIDERS.undercover_tourist.requireTracking === true, "undercover_tourist resolves wf_deals and requires tracking");
  ok(!("fandango" in PROVIDERS), "no fandango provider remains in commerceProviders");
  const UT_URL = "https://www.anrdoezrs.net/links/101643573/type/dlg/sid/coupon_movie/https://www.undercovertourist.com/movie-tickets/";
  const asked = [];
  const fakeDeps = (row) => ({ env: () => ({ url: "https://db.invalid", key: "k" }), fetch: async (u) => { asked.push(String(u)); return { ok: true, json: async () => (String(u).includes("id=eq." + MOVIE_TICKET_OFFER.offerId) ? [row] : []) }; } });
  const res11 = await resolveOffer(MOVIE_TICKET_OFFER.provider, MOVIE_TICKET_OFFER.offerId, { subId: "fall_movies_rail", ...fakeDeps({ id: 11, affiliate_url: UT_URL, link_ok: null }) });
  ok(!res11.error && /^https:\/\/www\.anrdoezrs\.net\/links\/101643573\//.test(res11.dest) && res11.dest.includes("undercovertourist.com/movie-tickets/"), "resolveOffer(undercover_tourist, 11) returns the attributed CJ movie tickets link");
  ok(asked.length === 1 && /\/rest\/v1\/wf_deals\?/.test(asked[0]) && asked[0].includes("id=eq.11"), "resolver looked up wf_deals id 11 exactly");
  ok((await resolveOffer("undercover_tourist", 11, fakeDeps({ id: 11, affiliate_url: UT_URL, link_ok: false }))).error === "offer-link-dead", "a row proven dead (link_ok false) refuses, null serves");
  ok((await resolveOffer("undercover_tourist", 11, fakeDeps({ id: 11, affiliate_url: "https://www.undercovertourist.com/movie-tickets/", link_ok: null }))).error, "an unattributed (non CJ) row is refused");
  // card label comes from partnerCopy: honest, sells a discounted theater ticket, not a showtime seat
  const lbl = partnerTicketLabel("Undercover Tourist", { product: "movie-voucher", card: true });
  ok(lbl === "Save on movie tickets ↗" && !dashy(lbl), "card CTA label is exactly: Save on movie tickets ↗");
  ok(!/fandango|showtime|seats?\b/i.test(lbl), "label promises no specific showtime or seat and names no Fandango");

  // status resolution (called, with fixed days)
  const xmas = SEASONAL_MOVIES.christmas;
  const eben = xmas.find((m) => m.id === "ebenezer-2026");
  ok(moviesForCollection("christmas", "2026-10-28").find((m) => m.id === eben.id).status === "coming_soon", "coming_soon before release day");
  ok(moviesForCollection("christmas", eben.releaseDate).find((m) => m.id === eben.id).status === "now_playing", "flips to now_playing on release day");
  ok(moviesForCollection("nope", today).length === 0 && moviesForCollection("fall", "garbage").length === 0, "unknown collection or bad day returns empty");
  const lim = { ...SEASONAL_MOVIES.fall[0], id: "lim", through: "2026-11-05", status: "now_playing" };
  ok(resolveMovieRows([lim], "2026-11-05").length === 1 && resolveMovieRows([lim], "2026-11-06").length === 0, "a row stays through its last day and drops the day after");
  ok(resolveMovieRows(null, today).length === 0, "control: non array input returns empty");
  ok(moviePlaceholderTile("halloween", "coming_soon").label === "Coming soon" && moviePlaceholderTile("fall", "now_playing").label === "Now playing" && moviePlaceholderTile("fall", "now_playing").icon === "🎬", "placeholder tile labels and icon");

  // the real route handler, all three collections
  for (const c of MOVIE_COLLECTIONS) {
    const res = await GET(new Request(`https://www.gowayfind.com/api/movies/seasonal?collection=${c}`));
    const body = await res.json();
    ok(res.status === 200 && body.collection === c, `${c}: route 200`);
    ok(body.movies.length >= 3 && body.movies.length <= 8, `${c}: route returns 3 to 8 movies (${body.movies.length})`);
    ok(body.ctaLive === true, `${c}: ctaLive true (no pending state)`);
    ok(/public, s-maxage=\d+/.test(res.headers.get("cache-control") || ""), `${c}: cacheable`);
    const json = JSON.stringify(body);
    ok(!/fandango/i.test(json) && !/anrdoezrs/i.test(json) && !/kqzyfj/.test(json) && !/"destination"|sourceUrl|linkId|advertiserId|affiliate_url/.test(json), `${c}: no fandango or anrdoezrs (or any destination / CJ id) in the response`);
    for (const m of body.movies) {
      const u = new URL(m.ticket.href, "https://www.gowayfind.com");
      ok(u.pathname === "/api/commerce/go" && u.searchParams.get("provider") === "undercover_tourist" && u.searchParams.get("offer") === "11" && u.searchParams.get("surface") === `${c}_movies_rail` && u.searchParams.get("content") === m.id, `${m.id}: ticket.href goes through /api/commerce/go provider=undercover_tourist offer=11 surface=${c}_movies_rail content=<id>`);
      ok(m.ticket.href === `/api/commerce/go?provider=undercover_tourist&offer=11&surface=${c}_movies_rail&content=${encodeURIComponent(m.id)}` && m.ticket.provider === "undercover_tourist" && m.ticket.offerId === 11, `${m.id}: exact href shape and ticket provider/offerId`);
      const viaHref = await resolveOffer(u.searchParams.get("provider"), u.searchParams.get("offer"), { subId: u.searchParams.get("surface"), ...fakeDeps({ id: 11, affiliate_url: UT_URL, link_ok: null }) });
      ok(!viaHref.error && viaHref.dest.includes("undercovertourist.com/movie-tickets/"), `${m.id}: the real resolver resolves the href's own provider and offer`);
    }
  }
  const bad = await GET(new Request("https://www.gowayfind.com/api/movies/seasonal?collection=summer"));
  ok(bad.status === 400, "unknown collection is 400");
  ok((await GET(new Request("https://www.gowayfind.com/api/movies/seasonal"))).status === 400, "missing collection is 400");
  ok((await GET(new Request("https://www.gowayfind.com/api/movies/seasonal?collection=constructor"))).status === 400, "inherited key is 400");

} finally { globalThis.fetch = originalFetch; }
console.log(`check-seasonal-movies: OK — ${pass} assertions; ${total} movies across 3 collections; real route handler and real resolver executed against an injected fake wf_deals row (the live row 11 is not read here), every ticket is undercover_tourist offer 11, ctaLive true, no fandango or anrdoezrs in any response`);
