// scripts/check-trend-sources.mjs — the live trend-signal sources guard.
//
// ASSERTS ON THE CALL, not the string (CLAUDE.md): every pure function in
// lib/trendSources is EXECUTED against known inputs with positive AND negative
// controls, and the fetch adapter is executed against a stub transport so the
// token-hygiene contract (header-only, host-pinned, never in a URL) is proven
// by observation rather than by reading the source.
//
// Also holds the bundle boundary: nothing under app/ outside app/api may
// import trendSources (the token would ride into a client bundle), with the
// cron route as the positive control that the probe can find real imports.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let failures = 0;
const ok = (m) => console.log("  ok:", m);
const fail = (m) => { failures++; console.error("  FAIL:", m); };
const assert = (cond, m) => (cond ? ok(m) : fail(m));

// ── 1. keyword -> concept matcher, executed ─────────────────────────────────
const { conceptForKeyword, allConceptAliases } = await import("../lib/trendSources/keywordMatch.js");
{
  const exact = conceptForKeyword("smash burger");
  assert(exact.key === "smash_burgers" && exact.confidence === 1, "exact alias -> concept at confidence 1.0");
  const phrase = conceptForKeyword("best smash burger near me");
  assert(phrase.key === "smash_burgers" && phrase.confidence === 0.7, "phrase containment -> concept at 0.7");
  const boundary = conceptForKeyword("thai food");
  assert(boundary.key === null, "negative control: unrelated keyword maps to nothing");
  // The taxonomy's banned defect: a loose token must not leak through the
  // phrase layer. "park" is not an alias, so "dog park ideas" maps to nothing.
  assert(conceptForKeyword("dog park ideas").key === null, "no loose-token matching (park-class defect stays dead)");
  assert(conceptForKeyword("").key === null, "empty keyword rejected with reason");
  const aliases = allConceptAliases();
  assert(Array.isArray(aliases) && aliases.length > 100, `alias export carries the registry (${aliases.length})`);
}

// ── 2. Pinterest adapter: both payload shapes + token hygiene, executed ─────
const pin = await import("../lib/trendSources/pinterestTrends.js");
{
  const modern = pin.normalizeTrendRows({ trends: [{ keyword: "smash burger", pct_growth_wow: 12, pct_growth_mom: 40, pct_growth_yoy: 180, time_series: { "2026-08-01": 60, "2026-08-08": 90 } }] });
  assert(modern.length === 1 && modern[0].growthYoy === 180 && modern[0].demandIndex === 1, "modern payload shape normalizes (growth + demandIndex)");
  const legacy = pin.normalizeTrendRows({ keywords: [{ keyword: "puppy yoga", data: [{ date: "2026-08-01", value: 50 }, { date: "2026-08-08", value: 25 }] }] });
  assert(legacy.length === 1 && legacy[0].demandIndex === 0.5, "legacy payload shape normalizes (latest/peak)");
  assert(pin.normalizeTrendRows(null).length === 0 && pin.normalizeTrendRows({}).length === 0, "malformed payloads yield empty, never throw");

  const sigs = pin.conceptSignalsFromRows(modern, { observedAt: "2026-08-11T00:00:00Z" });
  assert(sigs.length === 1 && sigs[0].source === "pinterest" && sigs[0].conceptKey === "smash_burgers", "rows -> concept signals (matched only)");
  assert(pin.conceptSignalsFromRows([{ keyword: "nfl scores" }]).length === 0, "unmatched keywords drop, not guess");

  // Token hygiene BY OBSERVATION: stub transport captures what would be sent.
  const saved = process.env.PINTEREST_ACCESS_TOKEN;
  process.env.PINTEREST_ACCESS_TOKEN = "guard-token-XYZ";
  let seenUrl = null, seenHeaders = null;
  const stub = async (u, opts) => { seenUrl = u; seenHeaders = (opts && opts.headers) || {}; return { ok: true, status: 200, json: async () => ({ trends: [] }) }; };
  const res = await pin.fetchPinterestTrends({ trendType: "growing", includeKeywords: ["smash burger"], fetchImpl: stub });
  assert(res.ok === true, "adapter executes against stub transport");
  assert(seenUrl && seenUrl.startsWith(pin.PINTEREST_API_HOST + "/v5/trends/keywords/US/top/growing"), "request is pinned to the API host + trends path");
  assert(seenHeaders.Authorization === "Bearer guard-token-XYZ", "token travels ONLY as an Authorization header");
  assert(!seenUrl.includes("guard-token-XYZ"), "token never appears in the URL");
  process.env.PINTEREST_ACCESS_TOKEN = "";
  const unconfigured = await pin.fetchPinterestTrends({ fetchImpl: stub });
  assert(unconfigured.ok === false && unconfigured.error === "unconfigured", "missing token -> degraded result, no throw, no call");
  if (saved == null) delete process.env.PINTEREST_ACCESS_TOKEN; else process.env.PINTEREST_ACCESS_TOKEN = saved;
}

// ── 3. Google Trends RSS parser, executed ───────────────────────────────────
const goo = await import("../lib/trendSources/googleTrendsRss.js");
{
  const xml = '<rss><channel><item><title><![CDATA[puppy yoga class]]></title><ht:approx_traffic>200K+</ht:approx_traffic><pubDate>Tue, 11 Aug 2026 09:00:00 -0400</pubDate></item><item><title>nfl scores</title><ht:approx_traffic>2M+</ht:approx_traffic></item><item><title></title></item></channel></rss>';
  const items = goo.parseTrendingRss(xml);
  assert(items.length === 2 && items[0].title === "puppy yoga class" && items[0].approxTraffic === 200000, "RSS items parse (CDATA + traffic)");
  assert(goo.parseApproxTraffic("1M+") === 1e6 && goo.parseApproxTraffic("20,000+") === 20000 && goo.parseApproxTraffic("junk") === null, "approx-traffic parser: K/M/commas/junk");
  const sigs = goo.conceptSignalsFromItems(items);
  assert(sigs.length === 1 && sigs[0].source === "google_trends" && sigs[0].conceptKey === "puppy_yoga", "items -> concept signals (matched only)");
  assert(sigs[0].demandIndex > 0.5 && sigs[0].demandIndex < 1, "demand normalizes on the order-of-magnitude scale");
  assert(goo.parseTrendingRss("").length === 0, "empty feed -> empty, never throw");
}

// ── 4. Blend + score end-to-end, executed ───────────────────────────────────
const { blendSignalFactors } = await import("../lib/trendSources/blend.js");
const { trendMomentumScore } = await import("../lib/trendScore.js");
{
  const now = Date.parse("2026-08-11T12:00:00Z");
  const sig = [{ source: "pinterest", growth_yoy: 650, growth_mom: 80, demand_index: 0.9, observed_at: "2026-08-11T10:00:00Z" },
               { source: "google_trends", demand_index: 0.7, observed_at: "2026-08-11T09:00:00Z" }];
  const { factors, sourceCount } = blendSignalFactors({ growth: null, velocity: null, demand: null, freshness: null, confidence: null }, sig, { nowMs: now });
  assert(sourceCount === 2, "corroboration counts DISTINCT sources");
  assert(factors.growth > 0.8 && factors.velocity > 0.2 && factors.demand === 0.9 && factors.freshness === 1, "signals fill absent factors");
  assert(factors.confidence === 0.5, "invented confidence stays bounded at 0.5 without snapshot stability");
  const scored = trendMomentumScore(factors);
  assert(scored && scored.score > 0 && typeof scored.publicLabel === "string", "blended factors score end-to-end");
  const authoritative = blendSignalFactors({ growth: 0.42 }, sig, { nowMs: now });
  assert(authoritative.factors.growth === 0.42, "snapshot-measured factors are NEVER overwritten by signals");
  const empty = blendSignalFactors({}, [], {});
  assert(empty.sourceCount === 0 && trendMomentumScore(empty.factors) === null, "no data -> null score, not a fabricated zero");
}

// ── 5. Bundle boundary: trendSources stays server-side ──────────────────────
{
  const offenders = [];
  let routeImports = false;
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      const st = statSync(p);
      if (st.isDirectory()) { if (e !== "node_modules" && e !== ".next") walk(p); continue; }
      if (!/\.(js|jsx|mjs)$/.test(e)) continue;
      const src = readFileSync(p, "utf8");
      if (!src.includes("trendSources")) continue;
      if (p.includes(path.join("app", "api") + path.sep)) { routeImports = true; continue; }
      offenders.push(p);
    }
  };
  walk("app");
  assert(routeImports, "positive control: the cron route imports trendSources (the probe can find real imports)");
  assert(offenders.length === 0, offenders.length ? `client-reachable trendSources import: ${offenders.join(", ")}` : "no client-reachable file imports trendSources");
}

// ── 6. Provider anonymity: this pipeline writes no public copy ──────────────
// "Model the scope, do not approximate it" (CLAUDE.md): a regex comment-strip
// eats //-shaped URL tails inside strings, and raw-source greps trip on the
// guard's own comments. So: a minimal real lexer that separates STRING
// LITERALS from CODE from COMMENTS, and each check reads only the layer the
// invariant lives in. Copy lives in string literals; imports live in code.
function lex(source) {
  const literals = []; let code = "";
  let i = 0, n = source.length;
  while (i < n) {
    const c = source[i], d = source[i + 1];
    if (c === "/" && d === "/") { while (i < n && source[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      let buf = ""; i++;
      while (i < n && source[i] !== c) {
        if (source[i] === "\\") { buf += source[i] + (source[i + 1] || ""); i += 2; continue; }
        // ${...} inside a template literal is CODE (an identifier reference),
        // not copy — skip the interpolation, keep only the literal text.
        if (c === "`" && source[i] === "$" && source[i + 1] === "{") {
          i += 2; let depth = 1;
          while (i < n && depth > 0) { if (source[i] === "{") depth++; else if (source[i] === "}") depth--; i++; }
          buf += " EXPR "; continue;
        }
        buf += source[i]; i++;
      }
      i++; literals.push(buf); code += " STR "; continue;
    }
    code += c; i++;
  }
  return { literals, code };
}
{
  const route = lex(readFileSync("app/api/cron/trend-signals/route.js", "utf8"));
  assert(!route.code.includes("public_explanation") && !route.literals.some((s) => s.includes("public_explanation")),
    "the signals route never writes public_explanation (lexer-checked)");
  // Sanity that the lexer itself works — a probe that reports 0 for everything
  // is broken, not clean (positive control doctrine).
  const probe = lex('a = "x // not a comment"; // real comment "quoted"\nb(`t`)');
  assert(probe.literals.length === 2 && probe.literals[0] === "x // not a comment" && !probe.code.includes("real comment"),
    "lexer positive control: string-internal // survives, comments drop");
  for (const f of ["keywordMatch.js", "pinterestTrends.js", "googleTrendsRss.js", "blend.js"]) {
    const { literals } = lex(readFileSync(`lib/trendSources/${f}`, "utf8"));
    const offending = literals
      .filter((s) => s !== "pinterest" && s !== "google_trends")
      .filter((s) => !/^https?:/.test(s))
      .filter((s) => /Pinterest|Google\s*Trends/i.test(s));
    assert(offending.length === 0, offending.length
      ? `lib/trendSources/${f}: provider name in string literal: ${JSON.stringify(offending[0])}`
      : `lib/trendSources/${f}: no provider-named copy in string literals`);
  }
  const libOffenders = [];
  for (const e of readdirSync("lib")) {
    const p2 = path.join("lib", e);
    if (statSync(p2).isDirectory()) continue;
    const { code, literals } = lex(readFileSync(p2, "utf8"));
    if (code.includes("trendSources") || literals.some((s) => s.includes("trendSources"))) libOffenders.push(p2);
  }
  assert(libOffenders.length === 0, libOffenders.length ? `lib file imports trendSources: ${libOffenders.join(", ")}` : "no top-level lib file imports trendSources");
}

console.log(failures ? `check-trend-sources: ${failures} FAILURE(S)` : "check-trend-sources: all green — 2 sources executed against stub transports, matcher + blend + score asserted on the call, bundle boundary held (positive control: cron route)");
process.exit(failures ? 1 : 0);
