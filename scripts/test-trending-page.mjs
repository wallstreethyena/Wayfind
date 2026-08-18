// scripts/test-trending-page.mjs — locks the Trending page (owner: the hero
// must open a RANKED page, not one detail).
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
// v8 (2026-08-15): the Trending HERO SLIDE became the Trending RAIL, and the
// rule it enforced — open a RANKED page, never one place's detail — is now
// structural rather than conventional. The rail cannot open a detail sheet: its
// destination is a static `href` in lib/rails.js, and picking it drops a row of
// ranked place cards in place. The upgrade is that the destination is a real
// <a href> to the INDEXABLE /trending rather than a window.location.assign() to
// the noindex, personal /trending-now — so a crawler reading the homepage
// follows it, which it never could before.
{
  const rails = readFileSync(new URL("../lib/rails.js", import.meta.url), "utf8");
  const trending = (rails.match(/\{ id: "trending"[\s\S]*?\},/) || [""])[0];
  ok(/href: "\/trending"/.test(trending), "the trending rail must open the ranked page");
  ok(!/openDetail/.test(trending), "…never a single place's detail sheet");
  ok(!/window\.location\.assign\("\/trending/.test(home), "the old assign()-based hero open is back — a crawler cannot follow it");
}
const cli = readFileSync(new URL("../app/components/TrendingNowClient.js", import.meta.url), "utf8");
ok(cli.includes('supabase.rpc("wf_buzz_picks"'), "the page reads the real popularity RPC");
ok(cli.includes('fetch("/api/buzz/why"'), "each row's editorial is written by the LLM in the Wayfind voice");
ok(cli.includes('(r.sources_count || 0) >= 1'), "only places with a real signal appear — honest gating");
ok(cli.includes("IconicPlaceCard") && cli.includes("CollectionFilter") && cli.includes("RankedExperiencePage"), "trending uses the editorial shell, shared filter and canonical place cards");
ok(cli.includes("never door counts or paid placement"), "the footnote states the honest measure");
const pg = readFileSync(new URL("../app/trending-now/page.js", import.meta.url), "utf8");
ok(/robots: \{ index: false/.test(pg), "the personal/dynamic page is noindex");
console.log(`test-trending-page: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
