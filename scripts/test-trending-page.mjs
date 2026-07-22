// scripts/test-trending-page.mjs — locks the Trending page (owner: the hero
// must open a RANKED page, not one detail).
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(home.includes('window.location.assign("/trending-now?lat='), "the Trending hero must open the ranked page, not openDetail");
ok(!/buzz_hero_open"[\s\S]{0,120}openDetail\(\{ id: buzzPick/.test(home), "the old single-detail open is gone");
const cli = readFileSync(new URL("../app/components/TrendingNowClient.js", import.meta.url), "utf8");
ok(cli.includes('supabase.rpc("wf_buzz_picks"'), "the page reads the real popularity RPC");
ok(cli.includes('fetch("/api/buzz/why"'), "each row's editorial is written by the LLM in the Wayfind voice");
ok(cli.includes('(r.sources_count || 0) >= 1'), "only places with a real signal appear — honest gating");
ok(cli.includes("RankedRow") && cli.includes("RankedExperiencePage"), "same /best-beaches standard shell + rows");
ok(cli.includes("never door counts or paid placement"), "the footnote states the honest measure");
const pg = readFileSync(new URL("../app/trending-now/page.js", import.meta.url), "utf8");
ok(/robots: \{ index: false/.test(pg), "the personal/dynamic page is noindex");
console.log(`test-trending-page: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
