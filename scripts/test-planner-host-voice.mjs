#!/usr/bin/env node
// scripts/test-planner-host-voice.mjs — calls the REAL /api/planner route with a
// stubbed network (zero spend, hermetic) and proves the 2026-11-13 host chat
// contract:
//   - a visitor with no city gets ONE in-character model reply (exactly one
//     provider call), cleaned of dashes;
//   - when the model is unavailable the reply is a hand written in-character
//     line and the response says WHY (fallbackReason): not_configured (no key),
//     gate_shut (AI spend cap reached / ledger refused the grant), or the
//     provider failure kind (billing, quota...). A fallback is never labelled
//     source "claude";
//   - the host remembers earlier turns (recent) and stops asking for what was
//     already said;
//   - the voice follows the host (santa | boo | wayfind), unknown -> wayfind.
// Every env var this guard depends on is set here, never read from the shell.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const fails = [];
const ok = (cond, msg) => { n += 1; if (!cond) fails.push(msg); };

for (const k of ["ANTHROPIC_API_KEY", "LLM_API_KEY", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "WAYFIND_GATE", "ANTHROPIC_MONTHLY_REQUEST_CAP", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) delete process.env[k];
process.env.NEXT_PUBLIC_POSTHOG_DISABLED = "1";

// ── network stub: counts provider calls, answers the spend ledger ──────────
const net = { anthropic: 0, ledgerGrant: true, anthropicReply: null };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url && url.url ? url.url : url);
  if (/api\.anthropic\.com/.test(u)) {
    net.anthropic += 1;
    return net.anthropicReply();
  }
  if (/\/rpc\/wf_spend_take/.test(u)) return new Response(JSON.stringify(net.ledgerGrant), { status: 200, headers: { "content-type": "application/json" } });
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
};
const textReply = (text) => () => new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status: 200, headers: { "content-type": "application/json" } });

const route = await loadComponent(path.join(REPO, "app/api/planner/route.js"), REPO);
let ipN = 0;
async function post(body) {
  ipN += 1; // fresh IP per call so the per-IP limiter never decides a test
  const res = await route.POST(new Request("https://www.gowayfind.com/api/planner", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${ipN}` },
    body: JSON.stringify(body),
  }));
  return { status: res.status, json: await res.json() };
}
const { plannerPersona } = await import("../lib/plannerPersona.js");
const santa = plannerPersona("santa");

// 1. No key at all: hand written Santa line, labelled, zero provider calls.
{
  net.anthropic = 0;
  const r = await post({ message: "hi santa!", voice: "santa" });
  ok(r.status === 200 && r.json.mode === "clarify", "no city -> clarify");
  ok(santa.clarifyCity.includes(r.json.reply), "no key: the reply is one of Santa's hand written lines");
  ok(r.json.source === "deterministic" && r.json.fallbackReason === "not_configured", `no key: labelled deterministic + not_configured (got ${r.json.source}/${r.json.fallbackReason})`);
  ok(net.anthropic === 0, "no key: zero provider calls");
}

// Configure a working (stubbed) provider path: key + gate open + cap + ledger.
process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
process.env.WAYFIND_GATE = "open";
process.env.ANTHROPIC_MONTHLY_REQUEST_CAP = "5";
process.env.SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-key";

// 2. Real model path: exactly one call, reply used, dashes cleaned.
{
  net.anthropic = 0;
  net.ledgerGrant = true;
  net.anthropicReply = textReply("Ho ho ho — a fellow cookie fan! 🍪 Which Florida city, and what dates?");
  const r = await post({ message: "do you like cookies", voice: "santa" });
  ok(r.json.mode === "clarify" && r.json.source === "claude", `model path: source claude (got ${r.json.source}/${r.json.fallbackReason})`);
  ok(r.json.reply === "Ho ho ho, a fellow cookie fan! 🍪 Which Florida city, and what dates?", `model reply used and cleaned (got ${JSON.stringify(r.json.reply)})`);
  ok(!("fallbackReason" in r.json), "a generated reply carries no fallbackReason");
  ok(net.anthropic === 1, `model path: exactly one provider call per turn (got ${net.anthropic})`);
}

// 3. Monthly AI cap reached (ledger refuses the grant): no provider call, labelled gate_shut.
{
  net.anthropic = 0;
  net.ledgerGrant = false;
  const r = await post({ message: "what's up", voice: "santa" });
  ok(r.json.source === "deterministic" && r.json.fallbackReason === "gate_shut", `cap reached: labelled gate_shut (got ${r.json.fallbackReason})`);
  ok(santa.clarifyCity.includes(r.json.reply), "cap reached: Santa still answers in character");
  ok(net.anthropic === 0, "cap reached: zero provider calls");
  net.ledgerGrant = true;
}

// 4. Garbage model output falls back, labelled unusable_reply.
{
  net.anthropic = 0;
  net.anthropicReply = textReply("{\"oops\":true}");
  const r = await post({ message: "yo", voice: "santa" });
  ok(r.json.source === "deterministic" && r.json.fallbackReason === "unusable_reply", `junk output: labelled unusable_reply (got ${r.json.fallbackReason})`);
}

// 5. Provider failure (billing): one attempt, labelled with the failure kind, no retry.
{
  net.anthropic = 0;
  net.anthropicReply = () => new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }), { status: 400, headers: { "content-type": "application/json" } });
  const r = await post({ message: "hello there", voice: "boo" });
  ok(r.json.source === "deterministic" && /billing|quota|http_error/.test(String(r.json.fallbackReason)), `provider failure: labelled with its kind (got ${r.json.fallbackReason})`);
  ok(plannerPersona("boo").clarifyCity.includes(r.json.reply), "provider failure: Boo answers in Boo's voice");
  ok(net.anthropic === 1, `provider failure: exactly one attempt, no retry (got ${net.anthropic})`);
}

// 5b. After a billing failure the breaker is open: no further provider calls, labelled breaker_open.
{
  net.anthropic = 0;
  const r = await post({ message: "still there?", voice: "santa" });
  ok(r.json.fallbackReason === "breaker_open" && net.anthropic === 0, `breaker open: no retry storm, labelled breaker_open (got ${r.json.fallbackReason}, ${net.anthropic} calls)`);
}

// 6. Memory: "Tampa please" then "this weekend, two adults, christmas lights" (no
//    city in the second turn) is NOT asked for a city again.
{
  net.anthropic = 0;
  net.anthropicReply = textReply("not json, the plan path will fall back");
  const control = await post({ message: "this weekend, two adults, christmas lights", voice: "santa", recent: [] });
  ok(control.json.mode === "clarify", "control: the second turn alone has no city, so on its own it is asked for one");
  const r = await post({ message: "this weekend, two adults, christmas lights", voice: "santa", recent: ["Tampa please"] });
  ok(r.json.mode !== "clarify", `with the earlier "Tampa" turn the host remembers the city and does not ask again (got ${r.json.mode})`);
}

// 7. Known city, no dates phrase that asks for dates -> clarifyDates line, no provider call.
{
  net.anthropic = 0;
  const r = await post({ message: "plan a florida christmas trip to Tampa", voice: "santa" });
  ok(r.json.mode === "clarify" ? r.json.fallbackReason === "not_needed" && net.anthropic === 0 && /Tampa/.test(r.json.reply) : r.json.mode !== "clarify",
    `city known: either the dates question names Tampa and costs no AI call, or planning starts (got ${r.json.mode}/${r.json.fallbackReason})`);
}

// 8. Voice normalisation.
{
  net.anthropic = 0;
  net.anthropicReply = textReply("Hey! Which city and when?");
  const r = await post({ message: "hey", voice: "grinch" });
  ok(r.json.voice === "wayfind", "unknown voice -> wayfind");
}

globalThis.fetch = realFetch;
if (fails.length) {
  for (const f of fails) console.error("test-planner-host-voice: FAIL: " + f);
  process.exit(1);
}
console.log(`test-planner-host-voice: OK, ${n} assertions (real /api/planner route, network stubbed: model reply = 1 call; no key / cap / provider failure / junk each labelled and in character; memory across turns; voice normalised)`);
