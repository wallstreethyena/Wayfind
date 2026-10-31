#!/usr/bin/env node
// The Claude search filter is off unless WAYFIND_SEARCH_UNDERSTAND is exactly
// "on", and that branch can only spend through lib/paidAi.js. The unified
// index migration keeps RLS on and does not rank by a commercial column.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchUnderstandEnabled, UNDERSTAND_MODEL, UNDERSTAND_TIMEOUT_MS } from "../lib/searchUnderstand.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const codeOnly = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
let failed = 0;
const ok = (condition, message) => {
  if (!condition) {
    failed++;
    console.error("FAIL " + message);
  }
};

ok(searchUnderstandEnabled({}) === false, "absent flag is off");
ok(searchUnderstandEnabled({ WAYFIND_SEARCH_UNDERSTAND: "on" }) === true, "exact on is the only enable");
ok(UNDERSTAND_MODEL === "claude-haiku-5-5", "the filter model is claude-haiku-5-5");
ok(UNDERSTAND_TIMEOUT_MS === 1500, "the filter times out at 1.5s");

const understand = read("lib/searchUnderstand.js");
const understandCode = codeOnly(understand);
ok(!/api\.anthropic\.com/.test(understandCode), "the filter does not call Anthropic except through paidAi");
ok(/paidAnthropicRequest/.test(understandCode), "the filter spends through paidAnthropicRequest");
ok(/ANTHROPIC_MONTHLY_REQUEST_CAP/.test(understand) || /paidAnthropicRequest/.test(understandCode), "the monthly cap stays on the paidAi path");
ok(/WAYFIND_SEARCH_UNDERSTAND/.test(understandCode), "the flag is read from WAYFIND_SEARCH_UNDERSTAND");

const rank = codeOnly(read("lib/searchRank.js"));
ok(/\b(affiliate|commission|sponsored|offerId|offer_id)\b/.test("sponsored offerId"),
  "positive control: the commercial-field probe matches a commercial token");
ok(!/\b(affiliate|commission|sponsored|offerId|offer_id)\b/.test(rank), "search ranking code does not read a commercial field");

const migration = read("supabase/migrations/20261022233000_wf_unified_search.sql");
const migrationCode = migration.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
ok(/enable row level security/.test(migration), "the new tables enable RLS");
ok(/tsvector/.test(migration), "the index stores a tsvector");
ok(/generated always/.test("search_vector tsvector generated always as"),
  "positive control: the generated-column probe matches a generated column");
ok(!/search_vector tsvector generated always/.test(migrationCode), "search_vector is a plain column, not a generated expression");
ok(/before insert or update on public\.wf_search_documents/i.test(migrationCode)
  && /function public\.wf_search_documents_vector\(/.test(migrationCode),
  "a before trigger writes the search vector");
ok(/gin_trgm_ops/.test(migration), "the index has a trigram title index");
ok(/function public\.wf_search_refresh\(/.test(migration), "refresh upserts the index");
ok(/wf_search_events_sync/.test(migration), "event writes keep the index current");
ok(!/\b(affiliate|commission|sponsored)\b/i.test(migrationCode), "the migration has no commercial ranking column");

const home = read("app/home.js");
ok(!/searchUnderstand|ANTHROPIC_API_KEY|claude-haiku/.test(home), "the search box does not import the model or the key");
ok(/s\.secondary \|\| "Explore this city"/.test(home), "non-place rows reuse the existing suggestion secondary line");

const route = codeOnly(read("app/api/search/route.js"));
ok(/searchLibrary/.test(route), "the search route attaches library results");
ok(/unsupported_location/.test(route), "an unsupported city keeps the owned-search response shape");

if (failed) {
  console.error(`check-search-understand: FAIL — ${failed}`);
  process.exit(1);
}
console.log("check-search-understand: OK — flag defaults off, cap stays on paidAi, index migration has RLS, tsvector, and trigram");
