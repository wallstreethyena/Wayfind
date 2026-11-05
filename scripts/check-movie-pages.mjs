#!/usr/bin/env node
// scripts/check-movie-pages.mjs: the Wayfind movie page (/movies/<id>) contract.
// EXECUTES the real pieces: lib/moviePages.js, the page module (generateStaticParams, generateMetadata,
// the rendered page via scripts/lib/jsxLoad.mjs), the real app/sitemap.js function, the OG share card
// model, the rail card source for its tap target / share URL, and mounted page/rail ticket clicks. Off-box is never contacted (global
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

ok(mp.movieBuyHref("not-a-movie") === null, "unknown movie has no ticket href");

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
  const buy = new RegExp(`href="(/api/commerce/go\\?provider=fandango&amp;offer=${id}[^"]*)"`).exec(html);
  ok(!!buy, `${id}: buy button goes through /api/commerce/go?provider=fandango&offer=${id}`);
  // Owner rule (2026-09-23): the commission line lives in the site footer only, never repeated on pages.
  ok(!/may earn a commission/i.test(html), `${id}: no repeated commission line on the movie page`);
  ok(html.includes("Tickets at Fandango"), `${id}: button text "Tickets at Fandango"`);
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
// 6. The real mounted button must finish attribution before native anchor navigation.
// flushSync works with both production and development React; act() is test-only.
{
  const { JSDOM } = await import("jsdom");
  const { flushSync } = await import("react-dom");
  const { createRoot } = await import("react-dom/client");
  const { commerceHref, emitCommerce, mintClickId } = await import("../lib/commerce.js");
  const dom = new JSDOM('<div id="movie-click-test"></div>', { url: SITE_URL + "/movies/" + registryIds[0] });
  const prior = ["window", "document", "CustomEvent"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent });
  const captured = [];
  dom.window.posthog = { capture: (event, props) => captured.push({ event, props }) };
  const { default: Button } = await loadComponent(fileURLToPath(new URL("../app/movies/[slug]/MovieTicketButton.js", import.meta.url)), REPO);
  const uiRoot = createRoot(document.getElementById("movie-click-test"));
  const id = registryIds[0];
  const props = { href: mp.movieBuyHref(id), label: "Tickets at Fandango", movieId: id, provider: "fandango", merchant: "Fandango", offerId: id, surface: "movie_page" };
  function activate(modifiers = {}) {
    const anchor = document.querySelector("#movie-click-test a");
    captured.length = 0;
    let snapshot;
    const beforeNavigation = (event) => {
      snapshot = { href: anchor.href, prevented: event.defaultPrevented, events: captured.slice() };
      event.preventDefault(); // jsdom cannot navigate; observe first, then stop its default action.
    };
    document.getElementById("movie-click-test").addEventListener("click", beforeNavigation, { once: true });
    anchor.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, ...modifiers }));
    return snapshot;
  }
  const attributed = (snapshot) => {
    const url = new URL(snapshot.href);
    const event = snapshot.events.find((entry) => entry.event === "commerce_cta_clicked");
    return !snapshot.prevented && !!url.searchParams.get("click_id") && event
      && event.props.click_id === url.searchParams.get("click_id")
      && url.searchParams.get("offer") === id && url.searchParams.get("content") === id
      && event.props.provider === "fandango" && event.props.merchant === "Fandango";
  };
  try {
    // Positive control: the observation point sees synchronous href mutation and real telemetry.
    flushSync(() => uiRoot.render(createElement("a", { href: props.href, onClick: (event) => {
      const clickId = mintClickId();
      event.currentTarget.href = commerceHref({ ...props, contentId: id, clickId });
      emitCommerce("commerce_cta_clicked", { provider: "fandango", merchant: "Fandango", offer_id: id, content_id: id, surface: "movie_page", click_id: clickId });
    } }, "Control")));
    ok(attributed(activate()), "control: the handoff probe observes a synchronous click id matching actual commerce telemetry");
    flushSync(() => uiRoot.render(createElement(Button, props)));
    for (const [name, modifiers] of [["plain", {}], ["Control", { ctrlKey: true }], ["Command", { metaKey: true }], ["Shift", { shiftKey: true }]]) {
      ok(attributed(activate(modifiers)), `${name} movie page click: the native handoff synchronously carries the same per-movie click id as telemetry without preventing native navigation`);
    }
    const railModule = await loadComponent(fileURLToPath(new URL("../app/components/SeasonalMoviesRail.js", import.meta.url)), REPO, {
      onGraph(graph) {
        const source = fileURLToPath(new URL("../app/components/SeasonalMoviesRail.js", import.meta.url));
        const emitted = graph.get(source);
        assert.ok(emitted, "the actual rail module is compiled");
        fs.appendFileSync(emitted, "\nexport { movieCta as movieCtaForGuard };\n");
      },
    });
    const { default: RailCard } = await loadComponent(fileURLToPath(new URL("../app/components/RailCard.js", import.meta.url)), REPO);
    const cta = railModule.movieCtaForGuard({ id, title: "Fixture movie", ticket: { href: props.href, provider: "fandango", merchant: "Fandango", offerId: id } }, "fall", null);
    flushSync(() => uiRoot.render(createElement(RailCard, { title: "Fixture movie", cta })));
    for (const [name, modifiers] of [["plain", {}], ["Control", { ctrlKey: true }], ["Command", { metaKey: true }], ["Shift", { shiftKey: true }]]) {
      const snapshot = activate(modifiers);
      ok(attributed(snapshot) && document.querySelector("#movie-click-test a").target === "_blank" && new URL(snapshot.href).searchParams.get("surface") === "fall_movies_rail", `${name} rail click: the real RailCard CTA synchronously carries matching attribution and keeps native new-tab behavior`);
    }
  } finally {
    flushSync(() => uiRoot.unmount());
    dom.window.close();
    for (const [key, descriptor] of prior) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
}
console.log(`check-movie-pages: OK, ${pass} assertions over ${registryIds.length} movies (page, metadata, JSON-LD, real sitemap fn, share card model, rail card source, mounted page/rail ticket clicks). Live OG bytes and the partner redirect are not exercised here.`);
