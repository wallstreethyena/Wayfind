#!/usr/bin/env node
// scripts/test-search-understand-backup.mjs — the OpenAI backup for the search
// filter (lib/searchUnderstand.js, owner yes 2026-11-27).
//
// CALLS understandSearch with stub providers. Proves: OpenAI runs only when
// Gemini could not answer for a reason that is not slowness; it spends through
// paidOpenAiRequest on its own capped lane; its answer goes through the same
// allowlist parser (a model that names a place is refused); good answers are
// cached. Hermetic: no network, no real keys.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  understandSearch, SEARCH_OPENAI_SKU, SEARCH_OPENAI_MONTHLY_CAP, SEARCH_OPENAI_MODEL,
} from "../lib/searchUnderstand.js";
import { paidOpenAiRequest } from "../lib/paidOpenAi.js";

let n = 0;
const ok = (cond, msg) => { n++; assert.ok(cond, msg); };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

const QUERY = "kid friendly museum rainy";
const CITY = { slug: "orlando" };
const baseEnv = { WAYFIND_SEARCH_UNDERSTAND: "on", SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service" };

function harness({ env, gemini, openai }) {
  const calls = { gemini: 0, openai: 0, lane: null, body: null, cacheWrites: [] };
  const fetchImpl = async (url, init = {}) => {
    if (String(url).includes("wf_search_understand_cache")) {
      if ((init.method || "GET") === "POST") { calls.cacheWrites.push(JSON.parse(init.body)); return json({}, 201); }
      return json([]);
    }
    throw new Error("unexpected fetch " + url);
  };
  const geminiRequestImpl = async () => { calls.gemini++; return gemini(); };
  const openaiRequestImpl = async (req, lane) => { calls.openai++; calls.lane = lane; calls.body = req.body; calls.model = req.model; return openai(); };
  return { calls, run: () => understandSearch({ query: QUERY, city: CITY, requestCountry: "US", env: { ...baseEnv, ...env }, fetchImpl, geminiRequestImpl, openaiRequestImpl, nowMs: Date.parse("2026-11-27T12:00:00Z") }) };
}
const openaiSays = (content) => () => json({ choices: [{ message: { role: "assistant", content } }] });
const GOOD = JSON.stringify({ city: "orlando", category: "attractions", price: null, when: null, kid_friendly: true, keywords: ["museum", "kids", "rainy"] });
const geminiOk = () => json({ candidates: [{ content: { parts: [{ text: GOOD }] } }] });

// 1. No Gemini key → the OpenAI backup answers, on its own lane, cached.
{
  const h = harness({ env: { OPENAI_API_KEY: "sk-test" }, gemini: geminiOk, openai: openaiSays(GOOD) });
  const r = await h.run();
  ok(r.reason === "ok_openai" && r.filters && r.filters.kid_friendly === true && r.filters.keywords.includes("museum"), `1a backup answered (${r.reason})`);
  ok(h.calls.gemini === 0 && h.calls.openai === 1, "1b Gemini without a key is not called; OpenAI once");
  ok(h.calls.lane && h.calls.lane.sku === SEARCH_OPENAI_SKU && h.calls.lane.cap === SEARCH_OPENAI_MONTHLY_CAP && SEARCH_OPENAI_MONTHLY_CAP <= 5000, "1c own capped lane");
  ok(h.calls.model === SEARCH_OPENAI_MODEL && /mini/.test(SEARCH_OPENAI_MODEL), "1d cheap model");
  ok(h.calls.body.max_tokens <= 200 && h.calls.body.temperature === 0 && h.calls.body.response_format.type === "json_object", "1e short, deterministic JSON request");
  const sent = h.calls.body.messages.map((m) => m.content).join("\n");
  ok(sent.includes("search_terms") && !sent.includes("kid friendly museum rainy"), "1f only the public terms are sent, not the raw query");
  ok(h.calls.cacheWrites.length === 1 && h.calls.cacheWrites[0].filters.kid_friendly === true, "1g the answer is cached");
}
// 2. Gemini answered → OpenAI never runs.
{
  const h = harness({ env: { GEMINI_API_KEY: "g", OPENAI_API_KEY: "sk-test" }, gemini: geminiOk, openai: openaiSays(GOOD) });
  const r = await h.run();
  ok(r.reason === "ok" && h.calls.openai === 0, "2 Gemini answer stands; no OpenAI spend");
}
// 3. Gemini at its cap → backup runs.
{
  const h = harness({ env: { GEMINI_API_KEY: "g", OPENAI_API_KEY: "sk-test" }, gemini: () => json({ error: "gemini_request_blocked", reason: "monthly_request_cap_reached_or_ledger_unavailable" }, 503), openai: openaiSays(GOOD) });
  const r = await h.run();
  ok(r.reason === "ok_openai" && h.calls.openai === 1, "3 Gemini cap → backup");
}
// 4. A model that names a place or adds a key is refused, and nothing is cached.
{
  const h = harness({ env: { OPENAI_API_KEY: "sk-test" }, gemini: geminiOk, openai: openaiSays(JSON.stringify({ city: "orlando", category: "attractions", keywords: ["museum"], place: "Orlando Science Center" })) });
  const r = await h.run();
  ok(r.filters === null && h.calls.cacheWrites.length === 0, `4a extra key refused (${r.reason})`);
  const h2 = harness({ env: { OPENAI_API_KEY: "sk-test" }, gemini: geminiOk, openai: openaiSays(JSON.stringify({ city: "orlando", keywords: ["Orlando Science Center"] })) });
  const r2 = await h2.run();
  ok(r2.filters === null, "4b keyword outside the allowlist refused");
}
// 5. No OpenAI key either → no filter, normal search answers.
{
  const h = harness({ env: {}, gemini: geminiOk, openai: openaiSays(GOOD) });
  const r = await h.run();
  ok(r.filters === null && r.reason === "not_configured" && h.calls.openai === 0, "5 no keys → no spend, no filter");
}
// 6. Flag off or a non-US request → nothing runs.
{
  const h = harness({ env: { WAYFIND_SEARCH_UNDERSTAND: "off", OPENAI_API_KEY: "sk-test" }, gemini: geminiOk, openai: openaiSays(GOOD) });
  ok((await h.run()).reason === "flag_off" && h.calls.openai === 0, "6 flag off → no spend");
}
// 7. The real paidOpenAiRequest accepts the lane (not "invalid_lane") and still
// fails closed without a ledger.
{
  const saved = { gate: process.env.WAYFIND_GATE, url: process.env.SUPABASE_URL, pub: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.WAYFIND_GATE = "open";
  delete process.env.SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await paidOpenAiRequest({ model: SEARCH_OPENAI_MODEL, apiKey: "sk-test", body: { max_tokens: 120, messages: [{ role: "user", content: "x" }] } }, { sku: SEARCH_OPENAI_SKU, cap: SEARCH_OPENAI_MONTHLY_CAP, timeoutMs: 1500 });
  const body = await r.json();
  ok(!r.ok && body.reason === "monthly_request_cap_reached_or_ledger_unavailable", `7 lane accepted, fails closed without a ledger (${body.reason})`);
  for (const [k, v] of Object.entries({ WAYFIND_GATE: saved.gate, SUPABASE_URL: saved.url, NEXT_PUBLIC_SUPABASE_URL: saved.pub, SUPABASE_SERVICE_ROLE_KEY: saved.key })) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}
// 8. Wiring: the backup spends only through paidOpenAiRequest, never api.openai.com directly.
{
  const src = readFileSync(new URL("../lib/searchUnderstand.js", import.meta.url), "utf8").replace(/\/\/[^\n]*/g, "");
  ok(!/api\.openai\.com/.test(src) && /openaiRequestImpl = paidOpenAiRequest/.test(src), "8 spends only through paidOpenAiRequest");
  ok(/OPENAI_BACKUP_REASONS\s*=\s*new Set\(\["not_configured", "cap", "blocked", "failed"\]\)/.test(src), "8b a slow Gemini (timeout) never triggers a second paid call");
}

console.log(`test-search-understand-backup: OK — ${n} assertions (OpenAI backs up Gemini only on no-key/cap/blocked/failed, own ${SEARCH_OPENAI_MONTHLY_CAP}/month lane on ${SEARCH_OPENAI_MODEL}, public terms only, allowlist parser refuses place names, answers cached, fails closed)`);
