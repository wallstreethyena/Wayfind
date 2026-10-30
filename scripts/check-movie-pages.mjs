#!/usr/bin/env node
// scripts/check-movie-pages.mjs: the Wayfind movie page (/movies/<id>) contract.
// EXECUTES the real pieces: lib/moviePages.js, the page module (generateStaticParams, generateMetadata,
// the rendered page via scripts/lib/jsxLoad.mjs), the real app/sitemap.js function, the OG share card
// model, and the rail card source for its tap target / share URL. Off-box is never contacted (global
// fetch is a thrower). NOT verified here: the live OG image bytes (see the screenshot step in the PR)
// and the partner redirect itself.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

process.env.WF_SUPPRESS_ANALYTICS = "1";
const REPO = fileURLToPath(new URL("..", import.meta.url));
globalThis.fetch = async () => { throw new Error("check-movie-pages must not make network requests"); };
let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\"'`])\/\/.*$/gm, "$1");
const dashy = (s) => /[—–]/.test(s) || / - /.test(s);
const PARTNER = /undercovertourist|anrdoezrs|dpbolvw|tkqlhce|jdoqocy|kqzyfj/i;

const mp = await import("../lib/moviePages.js");
const { SEASONAL_MOVIES, MOVIE_COLLECTIONS } = await import("../lib/seasonalMovies.js");
const { siteTodayStr } = await import("../lib/siteTime.js");
const { SITE_URL } = await import("../lib/site.js");
const today = siteTodayStr();
const registryIds = MOVIE_COLLECTIONS.flatMap((c) => SEASONAL_MOVIES[c].map((m) => m.id));

// controls
ok(PARTNER.test("https://www.undercovertourist.com/x") && PARTNER.test("https://www.anrdoezrs.net/x") && !PARTNER.test("/movies/a"), "control: partner probe");
ok(dashy("a — b") && dashy("a - b") && !dashy("PG-13"), "control: dash probe");
ok(mp.movieIsoDuration(116) === "PT1H56M" && mp.movieIsoDuration(60) === "PT1H" && mp.movieIsoDuration(45) === "PT45M" && mp.movieIsoDuration(null) === null, "control: ISO duration");

// 1. every registry id has a page param
// next/navigation is not resolvable in plain node: point it at a stub whose notFound() THROWS a
// NEXT_NOT_FOUND error like Next's own (same onGraph rewrite test-partner-rail-render uses).
const navStub = fileURLToPath(new URL(`../.movie-nav-${process.pid}.mjs`, import.meta.url));
fs.writeFileSync(navStub, "export function notFound() { const e = new Error('NEXT_NOT_FOUND'); e.digest = 'NEXT_NOT_FOUND'; throw e; }\n");
process.on("exit", () => { try { fs.rmSync(navStub, { force: true }); } catch {} });
let rewrote = 0;
const page = await loadComponent(fileURLToPath(new URL("../app/movies/[slug]/page.js", import.meta.url)), REPO, {
  onGraph(graph) {
    for (const output of graph.values()) {
      const src = fs.readFileSync(output, "utf8");
      if (src.includes('from "next/navigation"')) { fs.writeFileSync(output, src.replaceAll('from "next/navigation"', `from ${JSON.stringify(navStub)}`)); rewrote++; }
    }
  },
});
ok(rewrote > 0, "the page graph imports next/navigation and the stub replaced it");
const params = page.generateStaticParams().map((p) => p.slug);
ok(registryIds.length >= 10 && new Set(registryIds).size === registryIds.length, "registry has unique ids: " + registryIds.length);
for (const id of registryIds) ok(params.includes(id), `${id}: has a generateStaticParams entry`);
ok(params.length === registryIds.length, "no extra params beyond the registry");

// 2. metadata + rendered page per movie
const SKIP_NEXT = (fn) => { try { return fn(); } catch (e) { if (e && (e.digest === "NEXT_NOT_FOUND" || /NEXT_NOT_FOUND/.test(String(e.message)))) return "NOT_FOUND"; throw e; } };
for (const id of registryIds) {
  const meta = await page.generateMetadata({ params: { slug: id } });
  const url = `https://www.gowayfind.com/movies/${id}`;
  ok(meta.alternates && meta.alternates.canonical === url, `${id}: canonical ${url}`);
  ok(/ in Theaters \| Wayfind$/.test(meta.title) && !dashy(meta.title), `${id}: title "<Movie> in Theaters | Wayfind": ${meta.title}`);
  const og = meta.openGraph.images[0];
  ok(og.url === `https://www.gowayfind.com/api/og/movie?id=${id}` && og.width === 1200 && og.height === 630, `${id}: og image 1200x630`);
  ok(meta.twitter.card === "summary_large_image" && meta.twitter.images[0] === og.url, `${id}: twitter large image`);
  ok(meta.description && !dashy(meta.description), `${id}: description from the why line`);
  const html = renderToStaticMarkup(page.default({ params: { slug: id } }));
  const hit = mp.movieById(id, today);
  ok(html.includes(hit.movie.title.replace(/'/g, "&#x27;")) || html.includes(hit.movie.title), `${id}: title rendered`);
  ok(html.includes(hit.movie.art.src), `${id}: self-hosted poster rendered`);
  ok(html.includes(hit.movie.status === "coming_soon" ? "Opens " + mp.movieShortDate(hit.movie.releaseDate) : "Now playing"), `${id}: When fact (Now playing / Opens date)`);
  const buy = new RegExp('href="(/api/commerce/go\\?provider=undercover_tourist&amp;offer=11[^"]*)"').exec(html);
  ok(!!buy, `${id}: buy button goes through /api/commerce/go?provider=undercover_tourist&offer=11`);
  // Owner rule (2026-09-23): the commission line lives in the site footer only, never repeated on pages.
  ok(!/may earn a commission/i.test(html), `${id}: no repeated commission line on the movie page`);
  ok(html.includes("Save on movie tickets"), `${id}: button text "Save on movie tickets"`);
  ok(html.includes(mp.MOVIE_BUY_NOTE), `${id}: honest line under the button`);
  ok(html.includes("Other movies in theaters"), `${id}: other movies row`);
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  ok(!hrefs.some((h) => PARTNER.test(h)), `${id}: no raw partner URL anywhere on the page`);
  const others = hrefs.filter((h) => /^\/movies\//.test(h));
  ok(others.length === registryIds.length - 1 && !others.includes("/movies/" + id), `${id}: links to every other movie page, not itself`);
  ok(!/\$\s?\d/.test(html), `${id}: no prices`);
  const visible = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ");
  ok(!dashy(visible), `${id}: no dashes in user facing copy`);
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
  ok(ld["@type"] === "Movie" && ld.name === hit.movie.title && ld.url === url && ld.datePublished === hit.movie.releaseDate && ld.image === SITE_URL + hit.movie.art.src, `${id}: Movie JSON-LD name/url/datePublished/image`);
  ok(hit.movie.runtimeMin ? ld.duration === mp.movieIsoDuration(hit.movie.runtimeMin) : !("duration" in ld), `${id}: JSON-LD duration ISO 8601 (or absent when unknown)`);
  ok(hit.movie.rating === "NR" ? !("contentRating" in ld) : ld.contentRating === hit.movie.rating, `${id}: JSON-LD contentRating`);
}
ok(SKIP_NEXT(() => page.default({ params: { slug: "not-a-movie" } })) === "NOT_FOUND", "unknown slug calls notFound()");

// 3. sitemap: the REAL function lists every movie URL
{
  const sm = await loadComponent(fileURLToPath(new URL("../app/sitemap.js", import.meta.url)), REPO);
  const rows = await sm.default();
  const urls = new Set(rows.map((r) => r.url));
  for (const id of registryIds) ok(urls.has(`${SITE_URL}/movies/${id}`), `sitemap lists /movies/${id}`);
}

// 4. share card model
{
  const { movieCardModel } = await import("../lib/movieShareCard.js");
  for (const id of registryIds) {
    const { movie, collection } = mp.movieById(id, today);
    const m = movieCardModel(movie, collection, "data:image/jpeg;base64,AA==");
    ok(m.variant === "rail" && m.poster && m.lines.length >= 1 && m.lines.join(" ").replace(/\.\.\.|…/g, "").length > 3 && !dashy(m.foot + m.lines.join(" ")), `${id}: share card model has poster, title lines, clean foot`);
  }
  ok(movieCardModel(mp.movieById(registryIds[0], today).movie, "fall", null).poster === null, "control: no poster bytes -> null poster (route falls back)");
}

// 5. rail card: tap target and share URL (role based, comments stripped)
{
  const comp = strip(fs.readFileSync(new URL("../app/components/SeasonalMoviesRail.js", import.meta.url), "utf8"));
  const card = /<RailCard[\s\S]*?ariaLabel=\{movie\.title\}\s*\/>/.exec(comp);
  ok(!!card, "found the <RailCard ...> element");
  const c = card[0];
  ok(/\bhref=\{"\/movies\/" \+ movie\.id\}/.test(c) && !/\bexternal\b/.test(c.replace(/cta=\{[^}]*\}/, "")), "card tap target (href) is /movies/<id>, in app");
  const ai = /actionItem=\{\{([^}]*)\}\}/.exec(c);
  ok(!!ai && /url:\s*SITE_URL \+ "\/movies\/" \+ movie\.id/.test(ai[1]) && !/ticket/.test(ai[1]), "share url is the Wayfind page, not the ticket href");
  ok(!PARTNER.test(c), "card element names no partner host");
  ok(/cta=\{movieCta\(/.test(c) && /href:\s*movie\.ticket\.href/.test(comp), "buy button still carries the /api/commerce/go ticket href");
  ok(/SITE_URL/.test(comp) && /import \{ SITE_URL \} from/.test(comp), "SITE_URL imported");
}
console.log(`check-movie-pages: OK, ${pass} assertions over ${registryIds.length} movies (page, metadata, JSON-LD, real sitemap fn, share card model, rail card source). Live OG bytes and the partner redirect are not exercised here.`);
