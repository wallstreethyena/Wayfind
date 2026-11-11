#!/usr/bin/env node
// scripts/test-christmas-cached-page.mjs (2026-11-11)
//
// /christmas-in-florida is the landing page for paid Meta and Google ads.
// Every Meta ad click carries a unique ?fbclid=, and the page read
// searchParams, so every visit was a fresh server build (x-vercel-cache MISS,
// 0.9 to 2.8 s before the first byte, measured from 8 regions). It is now ONE
// cached copy for every visitor, refreshed in the background. This locks:
//   1. the page reads no searchParams and stays a cached (ISR) page,
//   2. its independent reads run side by side,
//   3. a failed read during a refresh throws (the CDN keeps the last good page)
//      instead of caching a page without events or partner buttons,
//   4. shared filter links still filter, now in the browser,
//   5. the deals read retries once and reports whether it worked.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { christmasBrowseFacets } from "../lib/christmasBrowse.js";
import { fetchChristmasTicketDeals, readChristmasTicketDeals } from "../lib/christmasTickets.js";
import { CHRISTMAS_TICKET_DEAL_IDS } from "../lib/christmasPool.js";
import { CJ_PID } from "../lib/deals.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const equal = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
// Code only: comments and string contents never satisfy a structural check.
const code = (rel) => readFileSync(path.join(root, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1 to 3. The page source ─────────────────────────────────────────────────
{
  const page = code("app/christmas-in-florida/page.js");
  ok(/export default async function Page\(\)\s*\{/.test(page), "Page takes no props, so it never reads searchParams");
  ok(!/searchParams/.test(page), "the page never mentions searchParams (any read makes every ad click a fresh build)");
  ok(!/\b(?:headers|cookies|connection|unstable_noStore|noStore)\s*\(/.test(page) && !/export const dynamic\s*=/.test(page), "no request-time API keeps the page dynamic");
  ok(/export const revalidate = 600;/.test(page), "the cached page refreshes every 10 minutes, the same freshness as /api/christmas/browse");
  ok(/export const fetchCache = "force-cache";/.test(page), "force-cache stops the live (no-store) Supabase reads from opting the page out of the cache");
  ok(/await Promise\.all\(\[\s*christmasBrowseCached\(query, today,[\s\S]{0,200}readChristmasTicketDeals\(\),\s*\]\)/.test(page), "the browse and the deals read run side by side");
  ok(/\[tickets, first\] = await Promise\.all\(\[[\s\S]{0,400}withChristmasTicketPhotos\([\s\S]{0,400}withBrowseTicketPhotos\(/.test(page), "the two photo passes run side by side");
  ok(/if \(!building && \(browse\.error \|\| !dealRead\.ok\)\) throw /.test(page), "a refresh with a failed browse or deals read throws, so the last good page stays");
  ok(/if \(!building\) throw error;/.test(page), "a refresh with a failed ticket photo pass throws too, so the featured cards never vanish for 10 minutes");
  ok(/fetchCuratedEvents\(\{ signal: AbortSignal\.timeout\(4000\), buildRead: true \}\)/.test(page), "next build reads the real events with a short timeout instead of shipping an empty build");
  const curated = code("lib/curatedEvents.js");
  ok(/if \(isSsgBuild\(\) && !buildRead\) return \[\];/.test(curated), "every other build-time caller still skips the events read");
}

// ── 4. Shared filter links filter in the browser ───────────────────────────
{
  const { christmasUrlQuery, default: ChristmasBrowse } = await loadComponent(path.join(root, "app/components/ChristmasBrowse.js"), root);
  ok(typeof ChristmasBrowse === "function" && typeof christmasUrlQuery === "function", "the browse exports its URL reader");
  const facets = { ...christmasBrowseFacets(), pills: [{ id: "free", label: "Free" }] };
  const region = facets.regions[0];
  const category = facets.categories[0].id;
  const when = facets.dates[0].id;
  equal(christmasUrlQuery("?fbclid=IwZXh0bgNhZW0&utm_source=meta&utm_medium=paid_social&utm_campaign=christmas_fl_santa_reel", facets), {}, "an ad click with only marketing params applies no filter (the cached default page is the answer)");
  equal(christmasUrlQuery(`?region=${encodeURIComponent(region)}&category=${category}&when=${when}&fbclid=abc`, facets), { region, category, when }, "a shared link with filters applies exactly those filters");
  equal(christmasUrlQuery("?category=free", facets), { category: "free" }, "a pill id is a valid category");
  equal(christmasUrlQuery("?region=Atlantis&category=bogus&when=someday&price=x&audience=y", facets), {}, "values the filter does not offer are dropped");
  equal(christmasUrlQuery("?date=2026-12-12&undated=1&q=" + "x".repeat(80), facets), { date: "2026-12-12", undated: true, q: "x".repeat(60) }, "date, undated and a capped search carry over");
  equal(christmasUrlQuery("?date=12/12&undated=yes", facets), {}, "a malformed date or flag is dropped");
  equal(christmasUrlQuery("?lat=27.336&lng=-82.531", facets), { lat: "27.336", lng: "-82.531" }, "a Florida location carries over");
  equal(christmasUrlQuery("?lat=40.7&lng=-74", facets), {}, "a location outside Florida is dropped, like the server parser");
  equal(christmasUrlQuery(null, {}), {}, "no search and no facets is an empty query, never a crash");
  const src = code("app/components/ChristmasBrowse.js");
  ok(/useEffect\(\(\) => \{\s*const fromUrl = christmasUrlQuery\(window\.location\.search, facets\);\s*if \(Object\.keys\(fromUrl\)\.length\) setQuery\(/.test(src), "the browse applies URL filters once after load");
}

// ── 5. The deals read ───────────────────────────────────────────────────────
{
  ok(CHRISTMAS_TICKET_DEAL_IDS.length > 0, "there are Christmas deals to read (else the checks below prove nothing)");
  const servable = { id: CHRISTMAS_TICKET_DEAL_IDS[0], affiliate_url: "https://www.anrdoezrs.net/click-" + CJ_PID + "-1", active: true, link_ok: true, provider: "undercover_tourist" };
  const client = (answers) => {
    let calls = 0;
    const c = {
      calls: () => calls,
      from: () => ({ select: () => ({ in: () => ({ abortSignal: async () => {
        const next = answers[Math.min(calls, answers.length - 1)];
        calls += 1;
        if (next instanceof Error) throw next;
        return next;
      } }) }) }),
    };
    return c;
  };
  const flaky = client([new Error("timeout"), { data: [servable], error: null }]);
  const read = await readChristmasTicketDeals({ client: flaky });
  ok(read.ok === true && flaky.calls() === 2 && read.deals.get(servable.id)?.affiliate_url === servable.affiliate_url, "one timeout is retried once and the second answer supplies the deal");
  const down = client([{ data: null, error: { message: "down" } }]);
  const failed = await readChristmasTicketDeals({ client: down });
  ok(failed.ok === false && failed.deals.size === 0 && down.calls() === 2, "a read that keeps failing says so after two tries");
  ok((await readChristmasTicketDeals({ client: null })).ok === false, "no Supabase client is a failed read, not an empty healthy one");
  const once = client([new Error("timeout"), { data: [servable], error: null }]);
  const legacy = await fetchChristmasTicketDeals({ client: once });
  ok(legacy instanceof Map && legacy.size === 0 && once.calls() === 1, "fetchChristmasTicketDeals (the API route) keeps its one try and empty map");
}

console.log(`test-christmas-cached-page: OK, ${checks} checks (no searchParams, cached page, side by side reads, failed refresh keeps the last page, URL filters in the browser, deals retry)`);
