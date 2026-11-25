#!/usr/bin/env node
// scripts/test-ci-monitor.mjs — the competitor watch (scripts/ci-monitor.mjs),
// proved on hand-written fixtures under scripts/fixtures/ci-monitor/. No network:
// global fetch is replaced with a thrower before anything runs, and the fixture
// transport answers from files. Zero dependencies, so the scheduled workflow can
// run it before `npm ci` would ever be needed.
//
// Covers: robots.txt disallow (for WayfindBot and for *), robots first, the exact
// User-Agent with no '@', the 3 second per-host gap, the 10 second timeout, the
// page cap, login redirects, bot walls recorded as blocked, discount extraction
// (10% threshold, no invented number), new seasonal guide detection, hash dedupe,
// fuzzy match + the two-competitor gap rule, the chain/MLM filter, closed events,
// the source list's own rules, and an end-to-end CLI dry run that writes the brief.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIX = path.join(root, "scripts/fixtures/ci-monitor");
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

globalThis.fetch = async (u) => { throw new Error("network is forbidden in this test: " + String(u)); };

const M = await import("./ci-monitor.mjs");
const { COMPETITORS, enabledSources, disabledSources } = await import("../lib/competitorSources.js");

// ── User-Agent ───────────────────────────────────────────────────────────────
eq(M.USER_AGENT, "WayfindBot/1.0 (https://gowayfind.com)", "the User-Agent is exact");
ok(!M.USER_AGENT.includes("@"), "the User-Agent carries no email");
for (const rel of ["scripts/ci-monitor.mjs", "lib/competitorSources.js", ".github/workflows/ci-monitor.yml"]) {
  const src = readFileSync(path.join(root, rel), "utf8");
  ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(src), `${rel} contains no email address`);
}
ok(M.REQUEST_TIMEOUT_MS === 10000 && M.MIN_HOST_INTERVAL_MS === 3000 && M.MAX_PAGES_PER_SOURCE > 0 && M.MAX_PAGES_PER_SOURCE <= 10, "10 s timeout, 3 s host gap, a small page cap");

// ── robots.txt ───────────────────────────────────────────────────────────────
const robots = M.parseRobots(readFileSync(path.join(FIX, "alpha-robots.txt"), "utf8"));
eq(robots.sitemaps, ["https://www.alpha.example/sitemap_index.xml", "https://cdn.other.example/sitemap.xml"], "robots sitemaps are read");
ok(M.robotsAllows(robots, "/2026/11/post/"), "an ordinary path is allowed");
ok(!M.robotsAllows(robots, "/private/feed.xml"), "a path disallowed for * is skipped");
ok(M.robotsAllows(robots, "/private/press"), "the longer Allow rule wins for an exact $ match");
ok(!M.robotsAllows(robots, "/private/press/more"), "the $ anchor only allows the exact path");
ok(!M.robotsAllows(robots, "/members/deals"), "a path disallowed only for WayfindBot is skipped");
ok(!M.robotsAllows(robots, "https://www.alpha.example/post/?replytocom=5"), "a * wildcard rule matches the query");
ok(M.robotsAllows(M.parseRobots("User-agent: *\nDisallow:\n"), "/anything"), "an empty Disallow allows everything");
ok(!M.robotsAllows(M.parseRobots("User-agent: wayfindbot\nDisallow: /\n\nUser-agent: *\nAllow: /\n"), "/x"), "a WayfindBot Disallow / is honoured even when * allows");
ok(!M.robotsAllows(M.parseRobots("User-agent: Googlebot\nAllow: /\n\nUser-agent: *\nDisallow: /\n"), "/x"), "another bot's Allow never applies to us");
ok(!M.robotsAllows(null, "/"), "no robots answer means no fetch");
ok(M.robotsAllows(M.parseRobots("User-agent: Googlebot\nDisallow: /\n"), "/x"), "CONTROL: a rule for another bot does not block us");

// ── feeds, sitemaps, titles ──────────────────────────────────────────────────
const feed = M.parseFeed(readFileSync(path.join(FIX, "gamma-feed.xml"), "utf8"));
eq(feed.map((f) => f.title), ["Orlando Holiday Lights Guide & Map", "Best brunch spots", "Winter Wonderland Lights returns"], "RSS titles decode (CDATA, &amp;)");
const atom = M.parseFeed('<feed><entry><title>Atom &amp; item</title><link rel="alternate" href="https://x.example/a"/><updated>2026-11-01</updated></entry></feed>');
eq(atom, [{ url: "https://x.example/a", title: "Atom & item", published: "2026-11-01" }], "Atom entries parse");
const idx = M.parseSitemap(readFileSync(path.join(FIX, "alpha-sitemap-index.xml"), "utf8"));
eq(idx.type, "index", "a sitemap index is recognised");
eq(M.pickSitemapChildren(idx.entries).map((e) => e.loc), ["https://www.alpha.example/event-sitemap.xml", "https://www.alpha.example/post-sitemap.xml"], "children: event/post style, newest first, capped at 2");
const set = M.parseSitemap(readFileSync(path.join(FIX, "alpha-post-sitemap.xml"), "utf8"));
ok(set.type === "urlset" && set.entries[0].lastmod >= set.entries[1].lastmod, "urlset entries sort newest first");
ok(set.entries.some((e) => e.title === "Where to watch New Year's Eve fireworks"), "news:title is used when present");
eq(M.titleFromUrl("https://www.eventbrite.com/e/winter-lights-tickets-123456789"), "winter lights tickets", "slug titles drop long ids");

// ── discounts: 10% threshold, never an invented number ───────────────────────
const d = (t) => M.extractDiscount(t);
eq(d("Save 25% on Winter Lights tickets").pct, 25, "save N%");
eq(d("10% off ZooTampa lights").pct, 10, "N% off");
eq(d("Holiday Sale: save $15 off $50 admission"), { pct: 30, price: null, basis: "save-amount-off-base" }, "save $X off $Y gives X/Y");
eq(d("Theme park tickets: was $120, now $96"), { pct: 20, price: 96, basis: "was-now" }, "was $Y now $X gives the stated price");
eq(d("Dinner show deal -15% for December").pct, 15, "a -N% badge");
eq(d("$20 off your second ticket"), null, "$X off with no base price is NOT a percentage");
eq(d("Open 10am to 10pm, 100% fun"), null, "a % that is not a discount is ignored");
eq(d("Rated 4.8 by 1,200 guests"), null, "no number is invented from ratings");
eq(d("save $60 off $50"), null, "an amount off larger than the base is refused");
ok(M.qualifiesAsPromo(d("10% off")) && !M.qualifiesAsPromo(d("9.5% off")) && !M.qualifiesAsPromo(null), "the promo threshold is 10% inclusive");
const blocks = M.extractPromoBlocks(readFileSync(path.join(FIX, "beta-tampa.html"), "utf8"));
ok(!blocks.some((b) => /script must be ignored/.test(b.line)), "text inside <script> never becomes a promo");
ok(blocks.find((b) => /save \$15 off \$50/.test(b.line))?.banner === true, "inline <strong> stays on the banner line");
eq(blocks.filter((b) => M.qualifiesAsPromo(b.discount)).map((b) => b.discount.pct).sort((a, b) => a - b), [10, 25, 30], "only stated discounts of 10% or more qualify");

// ── classification: guides, chains, closed, metro ────────────────────────────
ok(M.isSeasonalGuide("Best Christmas lights", "https://x.example/a"), "christmas title is a seasonal guide");
ok(M.isSeasonalGuide("", "https://x.example/2026/12/new-years-eve-parties/"), "a new-years path is a seasonal guide");
ok(!M.isSeasonalGuide("New coffee shop opens", "https://x.example/2026/11/new-coffee-shop/"), "an ordinary post is not");
ok(M.isChainOrMlm("MLM business opportunity night") && M.isChainOrMlm("Dave & Buster's Holiday Party") && M.isChainOrMlm("Passive Income Wealth Seminar"), "chain and MLM listings are filtered");
ok(!M.isChainOrMlm("Winter Wonderland Lights"), "CONTROL: a real event passes the chain filter");
ok(M.isClearlyClosed({ title: "Jazz", status: "EventCancelled" }, "2026-11-25") && M.isClearlyClosed({ title: "Pumpkins", endDate: "2026-11-01" }, "2026-11-25"), "cancelled and past events are closed");
ok(!M.isClearlyClosed({ title: "Lights", startDate: "2026-11-28" }, "2026-11-25"), "CONTROL: an upcoming event is open");
eq([M.metroFromText("Best lights in St. Pete"), M.metroFromText("Kissimmee parade"), M.metroFromText("Lakewood Ranch market"), M.metroFromText("Boston")], ["tampa", "orlando", "sarasota", null], "city words map to metros");
ok(M.isLoginUrl("https://x.example/login?next=/a") && M.isLoginUrl("https://x.example/my-account/") && M.isLoginUrl("https://x.example/checkout") && !M.isLoginUrl("https://x.example/events/lights"), "login, account and checkout paths are recognised");

// ── fuzzy match and the gap rule ─────────────────────────────────────────────
ok(M.titlesMatch("Winter Wonderland Lights 2026", "winter wonderland lights") && M.jaccard("Tampa Bay Holiday Market 2026", "Holiday Market Tampa Bay") === 1, "normalised token Jaccard ignores years, case, order");
ok(!M.titlesMatch("ZooTampa Christmas Lights", "Winter Wonderland Lights"), "a shared word alone is not a match");
const wayfind = M.shapeWayfindEvents(JSON.parse(readFileSync(path.join(FIX, "wayfind-events.json"), "utf8")));
eq(wayfind.map((w) => w.metro), ["tampa", "tampa", "other-st-johns"], "Wayfind metros come from wf_events.county");
const disc = (competitor, title, metro = "tampa", extra = {}) => ({ competitor, title, metro, ...extra });
const g1 = M.computeGaps([disc("alpha", "Winter Wonderland Lights"), disc("beta", "winter wonderland lights 2026")], wayfind);
eq(g1.gaps.map((g) => [g.title, g.competitors]), [["Winter Wonderland Lights", ["alpha", "beta"]]], "two competitors, zero Wayfind matches: a gap");
eq(M.computeGaps([disc("alpha", "Winter Wonderland Lights"), disc("alpha", "Winter Wonderland Lights 2026")], wayfind).gaps, [], "one competitor listing twice is not a gap");
eq(M.computeGaps([disc("alpha", "Holiday Market Tampa Bay"), disc("beta", "Tampa Bay Holiday Market")], wayfind).gaps, [], "two competitors but Wayfind has it: not a gap");
eq(M.computeGaps([disc("alpha", "Winter Wonderland Lights"), disc("beta", "Winter Wonderland Lights", "orlando")], wayfind).gaps, [], "different metros never cluster");
eq(M.computeGaps([disc("alpha", "MLM business opportunity night"), disc("beta", "MLM Business Opportunity Night")], wayfind).gaps, [], "chain/MLM listings never become gaps");
eq(M.computeGaps([disc("alpha", "Rooftop Jazz", "tampa", { status: "EventCancelled" }), disc("beta", "Rooftop Jazz")], wayfind, { today: "2026-11-25" }).gaps, [], "a cancelled listing does not count toward the two");

// ── polite fetching: rate limit, timeout, robots first, redirects, walls ─────
{
  const clock = M.virtualClock(0);
  const lim = M.createRateLimiter({ now: clock.now, sleep: clock.sleep });
  await lim.wait("a.example"); await lim.wait("a.example"); await lim.wait("b.example"); await lim.wait("a.example");
  eq(lim.log.map((l) => [l.host, l.at]), [["a.example", 0], ["a.example", 3000], ["b.example", 3000], ["a.example", 6000]], "one request per host per 3 s; other hosts are not delayed");
}
{
  const fetcher = M.createFetcher({
    // AbortSignal.timeout's timer is unref'd, so a ref'd timer keeps the loop alive until the abort lands.
    fetchImpl: (url, init) => new Promise((resolve, reject) => { const keep = setTimeout(() => resolve(new Response("late", { status: 200 })), 5000); init.signal.addEventListener("abort", () => { clearTimeout(keep); reject(init.signal.reason); }); }),
    limiter: M.createRateLimiter({ minIntervalMs: 0 }), timeoutMs: 30,
  });
  eq((await fetcher.get("https://slow.example/page")).status, "error", "a request that outlives the timeout is aborted (robots unreachable, nothing fetched)");
}
{
  const seen = [];
  const fetcher = M.createFetcher({
    fetchImpl: async (url, init) => { seen.push([url, init.headers["user-agent"], init.redirect]); return url.endsWith("/robots.txt") ? new Response("", { status: 404 }) : new Response("<p>ok</p>", { status: 200 }); },
    limiter: M.createRateLimiter({ minIntervalMs: 0 }),
  });
  const sources = [{ id: "cap", competitor: "cap", tier: 1, metro: "tampa", urls: Array.from({ length: 9 }, (_, i) => ({ kind: "listing", url: `https://cap.example/p${i}` })) }];
  const r = await M.runMonitor({ sources, fetcher, state: { seen: new Map(), blocks: new Map() }, wayfind: [], today: "2026-11-25" });
  eq(r.perSource[0].pages, M.MAX_PAGES_PER_SOURCE, "the page cap binds");
  ok(r.perSource[0].notes.some((n) => /page cap/.test(n)), "a binding cap says so");
  eq(seen[0][0], "https://cap.example/robots.txt", "robots.txt is the first request to a host");
  ok(seen.every(([, ua, redirect]) => ua === M.USER_AGENT && redirect === "manual"), "every request sends the exact UA and never auto-follows redirects");
}

// ── the fixture world, in process ────────────────────────────────────────────
const fixtureSources = JSON.parse(readFileSync(path.join(FIX, "sources.json"), "utf8"));
const state0 = M.stateFromJson(JSON.parse(readFileSync(path.join(FIX, "state.json"), "utf8")));
const clock = M.virtualClock(0);
const fetcher = M.createFetcher({ fetchImpl: M.fixtureFetch(FIX), limiter: M.createRateLimiter({ now: clock.now, sleep: clock.sleep }) });
const run1 = await M.runMonitor({ sources: enabledSources(fixtureSources), fetcher, state: state0, wayfind, today: "2026-11-25" });

ok(!fetcher.requests.includes("https://www.alpha.example/private/feed.xml"), "a URL robots disallows for * is never requested");
ok(!fetcher.requests.includes("https://www.alpha.example/members/deals"), "a URL robots disallows for WayfindBot is never requested");
ok(!fetcher.requests.some((u) => /\/login/.test(u)), "a redirect to a login is never followed");
ok(!fetcher.requests.some((u) => u.includes("cdn.other.example")), "an off-site sitemap named in robots.txt is ignored");
ok(!fetcher.requests.includes("https://delta.example/events"), "after robots.txt answers 403, nothing else on that host is requested");
for (const host of new Set(fetcher.requests.map((u) => new URL(u).host))) {
  const firstOnHost = fetcher.requests.find((u) => new URL(u).host === host);
  ok(firstOnHost === `https://${host}/robots.txt`, `robots.txt is requested first on ${host}`);
  const times = fetcher.limiter.log.filter((l) => l.host === host).map((l) => l.at);
  ok(times.every((t, i) => i === 0 || t - times[i - 1] >= 3000), `requests to ${host} are at least 3 s apart`);
}
eq(run1.blocked.map((b) => [b.id, b.reason]), [["delta-miami", "robots.txt answered 403"], ["epsilon-sarasota", "bot check or CAPTCHA page"]], "403 and CAPTCHA walls are recorded as blocked, not retried");
eq(fetcher.requests.filter((u) => u.startsWith("https://epsilon.example/sarasota")).length, 1, "a bot wall is requested once and never retried");

const guides = run1.signals.filter((s) => s.type === "new_guide").map((s) => s.title).sort();
eq(guides, ["Orlando Holiday Lights Guide & Map", "Where to watch New Year's Eve fireworks", "best christmas lights tampa bay"], "new seasonal guides: new URL + seasonal words, fresh lastmod");
ok(!guides.some((t) => /boat parade/.test(t)), "a guide URL already seen is not new");
ok(!guides.some((t) => /2024/.test(t)), "a stale lastmod is not a new guide");
ok(!guides.some((t) => /offsite/.test(t)), "an off-site URL in a sitemap is ignored");
const promoPcts = run1.promos.map((p) => p.discount.pct).sort((a, b) => a - b);
eq(promoPcts, [10, 15, 20, 25, 30], "promos of 10% or more, each a stated number");
ok(run1.signals.some((s) => s.type === "sale_banner") && run1.signals.some((s) => s.type === "discount"), "sale banners and ticket discounts are told apart");
const shift = run1.signals.find((s) => s.type === "affiliate_shift");
ok(shift && !shift.baseline && /prev=0000000000000000/.test(shift.summary), "a changed promo block hash is an affiliate shift");
eq(run1.gaps.map((g) => [g.title, g.metro, g.competitors]), [["Winter Wonderland Lights", "tampa", ["alpha", "beta"]]], "the fixture gap: on alpha and beta in Tampa, not on Wayfind");
const newEvents = run1.signals.filter((s) => s.type === "new_event");
ok(!newEvents.some((s) => /mlm|dave|jazz|pumpkin/i.test(s.title)), "chain, MLM, cancelled and past events are not recorded");
ok(newEvents.find((s) => /holiday market/i.test(s.title))?.matchRef === "tampa-holiday-market", "a matched event carries Wayfind's ref");

// ── rows: hashes only, short text, dedupe ────────────────────────────────────
const rows1 = M.buildRows(run1);
ok(rows1.intel.length > 0 && rows1.promos.length === 5, "rows are built for intel and promos");
for (const r of rows1.intel) {
  ok(/^[a-f0-9]{64}$/.test(r.source_url_hash) && r.title.length <= 160 && r.diff_summary.length <= 400 && M.SIGNAL_TYPES.includes(r.signal_type), `intel row is hash + short text (${r.signal_type})`);
  ok(!Object.values(r).some((v) => typeof v === "string" && /<\/?[a-z][^>]*>/i.test(v)), "no HTML ever reaches a row");
}
for (const p of rows1.promos) ok(p.discount_pct >= 10 && p.discount_pct <= 100 && p.subject.length <= 160 && /^[a-f0-9]{64}$/.test(p.source_url_hash), "promo row bounds hold");
const doubled = M.buildRows({ signals: [...run1.signals, ...run1.signals], promos: [...run1.promos, ...run1.promos] });
eq([doubled.intel.length, doubled.promos.length], [rows1.intel.length, rows1.promos.length], "the same signal twice is one row (hash dedupe)");
// A second run that knows the first run's rows reports nothing new.
const state1 = { seen: new Map(state0.seen), blocks: new Map(state0.blocks) };
for (const s of run1.signals) {
  if (s.type === "new_guide" || s.type === "new_event") { if (!state1.seen.has(s.competitor)) state1.seen.set(s.competitor, new Set()); state1.seen.set(s.competitor, new Set([...state1.seen.get(s.competitor), s.urlHash])); }
  if (s.pageKey) state1.blocks.set(s.pageKey, s.stateHash);
}
const run2 = await M.runMonitor({ sources: enabledSources(fixtureSources), fetcher: M.createFetcher({ fetchImpl: M.fixtureFetch(FIX), limiter: M.createRateLimiter({ now: M.virtualClock().now, sleep: M.virtualClock().sleep }) }), state: state1, wayfind, today: "2026-11-25" });
eq(run2.signals.filter((s) => ["new_guide", "new_event", "affiliate_shift"].includes(s.type)).length, 0, "a rerun with the same pages finds no new guide, event or shift");
// Baseline: a competitor with no history writes rows but reports nothing as new.
const baseRun = await M.runMonitor({ sources: enabledSources(fixtureSources).filter((s) => s.competitor === "alpha"), fetcher: M.createFetcher({ fetchImpl: M.fixtureFetch(FIX), limiter: M.createRateLimiter({ minIntervalMs: 0 }) }), state: { seen: new Map(), blocks: new Map() }, wayfind, today: "2026-11-25" });
const baseBrief = M.buildBrief(baseRun, { mode: "test", today: "2026-11-25" });
ok(baseRun.signals.length > 0 && baseBrief.json.newGuides.length === 0 && baseBrief.json.competitors.alpha.baseline === true, "a first run is a baseline: rows yes, 'new' claims no");

// ── the source list's own rules ──────────────────────────────────────────────
const names = COMPETITORS.map((c) => c.name);
for (const n of ["Fever", "Secret Miami", "Secret Orlando", "UNATION", "Creative Loafing Tampa Bay", "Orlando Weekly", "Sarasota Magazine", "Visit Tampa Bay", "Visit Sarasota County", "Undercover Tourist", "Eventbrite Florida"]) ok(names.includes(n), `${n} is watched`);
eq(COMPETITORS.find((c) => c.slug === "fever").sources.map((s) => s.metro), ["miami", "tampa", "orlando", "sarasota"], "Fever covers Miami, Tampa, Orlando, Sarasota");
eq(COMPETITORS.find((c) => c.slug === "unation").sources.map((s) => s.metro), ["tampa", "orlando"], "UNATION covers Tampa Bay and Orlando");
for (const s of enabledSources()) {
  ok(s.urls.length > 0 || s.discover === "robots-sitemaps", `${s.id} has something to read`);
  ok(!s.discover || /^[a-z0-9.-]+$/.test(s.host || ""), `${s.id} discovery has a host`);
  for (const u of s.urls) ok(/^https:\/\//.test(u.url) && !M.isLoginUrl(u.url) && ["feed", "sitemap", "listing", "promo", "calendar"].includes(u.kind), `${s.id}: ${u.url} is a public https page of a known kind`);
  ok([1, 2, 3].includes(s.tier) && ["miami", "tampa", "orlando", "sarasota", "florida"].includes(s.metro), `${s.id} has a tier and a Wayfind metro`);
}
for (const s of disabledSources()) ok(typeof s.reason === "string" && s.reason.length > 20, `${s.id} is disabled with a reason`);
ok(new Set(enabledSources().map((s) => s.id)).size === enabledSources().length, "source ids are unique");

// ── environment: absent configuration fails loudly ───────────────────────────
assert.throws(() => M.supabaseConfig({}), /SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/); checks += 1;
assert.throws(() => M.supabaseConfig({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "  " }), /SUPABASE_SERVICE_ROLE_KEY/); checks += 1;
assert.throws(() => M.parseArgs(["--fixtures", FIX]), /only runs with --dry-run/); checks += 1;

// ── Supabase REST: bounded read-only events, service-role upserts, loud errors ─
{
  const calls = [];
  const thrower = globalThis.fetch;
  const sb = M.supabaseConfig({ SUPABASE_URL: "https://fixture.supabase.invalid/", SUPABASE_SERVICE_ROLE_KEY: "fixture-only" });
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", headers: init.headers || {}, body: init.body || null });
    if (String(url).includes("/wf_events?")) return new Response(JSON.stringify([{ event_id: "e1", event_name: "Holiday Market Tampa Bay", county: "Hillsborough" }]), { status: 200 });
    if (String(url).includes("/wf_competitor_promos?")) return new Response("relation does not exist", { status: 404 });
    return new Response(init.method === "POST" ? "" : "[]", { status: init.method === "POST" ? 201 : 200 });
  };
  try {
    const ev = await M.loadWayfindEvents(sb, "2026-11-25");
    eq(ev.length, 1, "wf_events read returns rows");
    const q = decodeURIComponent(calls[0].url);
    ok(calls[0].method === "GET" && /\/rest\/v1\/wf_events\?select=event_id,slug,event_name,short_title,city,county,start_date,end_date,event_status&/.test(q), "wf_events is read with a narrow select, GET only");
    ok(/event_status=in\.\(scheduled,sold_out\)/.test(q) && /start_date=lte\.2027-03-25/.test(q) && /limit=1000/.test(q) && /end_date\.gte\.2026-11-25/.test(q), "the events read is a bounded upcoming window");
    ok(calls[0].headers.apikey === "fixture-only" && calls[0].headers.authorization === "Bearer fixture-only", "service role headers are sent");
    const st = await M.loadState(sb, "2026-11-25");
    ok(st.seen instanceof Map && st.blocks instanceof Map, "state loads (empty)");
    calls.length = 0;
    await M.upsertRows(sb, "wf_competitor_intel", rows1.intel, "competitor,source_url_hash,signal_type", "merge-duplicates");
    ok(calls.length >= 1 && calls.every((c) => c.method === "POST" && c.url.endsWith("/wf_competitor_intel?on_conflict=competitor,source_url_hash,signal_type") && /resolution=merge-duplicates/.test(c.headers.prefer)), "intel upserts on the unique key");
    const sent = JSON.parse(calls[0].body);
    ok(sent.every((r) => !("detected_at" in r) && !("id" in r)), "an upsert never overwrites detected_at or id (first sighting is kept)");
    await assert.rejects(() => M.upsertRows(sb, "wf_competitor_promos", rows1.promos, "competitor,source_url_hash,subject", "ignore-duplicates"), /wf_competitor_promos answered 404/);
    checks += 1;
    ok(!calls.some((c) => /fixture-only/.test(c.url)), "the key never travels in a URL");
  } finally {
    globalThis.fetch = thrower;
  }
}

// ── end to end: the CLI in fixture mode writes the brief ─────────────────────
{
  const dir = mkdtempSync(path.join(tmpdir(), "wf-ci-monitor-"));
  try {
    const r = spawnSync(process.execPath, [path.join(root, "scripts/ci-monitor.mjs"), "--dry-run", "--fixtures", FIX, "--today", "2026-11-25"], { cwd: dir, encoding: "utf8", env: { NODE_ENV: "test" } });
    eq(r.status, 0, `fixture dry run exits 0 (${r.stderr})`);
    ok(existsSync(path.join(dir, "ci-monitor-brief.md")) && existsSync(path.join(dir, "ci-monitor-brief.json")), "the brief is written as .md and .json");
    const brief = JSON.parse(readFileSync(path.join(dir, "ci-monitor-brief.json"), "utf8"));
    eq(brief.rows.written, false, "dry run writes nothing to the database");
    eq(brief.topGaps.map((g) => g.title), ["Winter Wonderland Lights"], "brief: top gaps");
    eq(brief.blocked.map((b) => b.id), ["delta-miami", "epsilon-sarasota"], "brief: blocked sources");
    ok(brief.promos.every((p) => p.discountPct >= 10) && brief.promos.length === 5, "brief: promos of 10% or more");
    eq(brief.disabled.map((x) => x.id), ["zeta-miami"], "brief: disabled sources");
    const md = readFileSync(path.join(dir, "ci-monitor-brief.md"), "utf8");
    ok(/## Top gaps/.test(md) && /Winter Wonderland Lights \(tampa\): alpha, beta/.test(md), "the markdown brief lists the gap");
    const noEnv = spawnSync(process.execPath, [path.join(root, "scripts/ci-monitor.mjs"), "--dry-run"], { cwd: dir, encoding: "utf8", env: { NODE_ENV: "test" } });
    ok(noEnv.status === 1 && /missing required environment variable\(s\): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/.test(noEnv.stderr), "a live run without Supabase credentials stops loudly before any fetch");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`test-ci-monitor: ${checks} checks passed`);
