#!/usr/bin/env node
// scripts/test-planner-host-voice.mjs — calls the REAL /api/planner route with a
// stubbed network (zero spend, hermetic) and proves the 2026-11-13 host chat
// contract:
//   - a visitor with no city gets ONE in-character model reply (OpenAI for
//     Santa and Anthropic for the other hosts), cleaned of dashes;
//   - the shared spend gate blocks both providers when shut, and each host
//     uses its own metered lane when open;
//   - when the model is unavailable the reply is a hand written in-character
//     line and the response names the reason and the deterministic source;
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

for (const k of [
  "ANTHROPIC_API_KEY", "LLM_API_KEY", "ANTHROPIC_MONTHLY_REQUEST_CAP",
  "OPENAI_API_KEY", "OPENAI_MONTHLY_REQUEST_CAP", "WAYFIND_GATE",
  "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN",
]) delete process.env[k];
process.env.NEXT_PUBLIC_POSTHOG_DISABLED = "1";

// ── network stub: counts provider calls, answers the spend ledger ──────────
const net = { anthropic: 0, openai: [], ledger: [], ledgerGrant: true, anthropicReply: null, openaiReply: null };
function resetCalls() {
  net.anthropic = 0;
  net.openai.length = 0;
  net.ledger.length = 0;
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url && url.url ? url.url : url);
  if (/api\.anthropic\.com/.test(u)) {
    net.anthropic += 1;
    return net.anthropicReply();
  }
  if (/api\.openai\.com/.test(u)) {
    net.openai.push(JSON.parse(init.body));
    return net.openaiReply();
  }
  if (/\/rpc\/wf_spend_take/.test(u)) {
    net.ledger.push(JSON.parse(init.body));
    return Response.json(net.ledgerGrant);
  }
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
};
const claudeReply = (text) => () => Response.json({ content: [{ type: "text", text }] });
const openAiReply = (content) => () => Response.json({ choices: [{ message: { content } }] });

const route = await loadComponent(path.join(REPO, "app/api/planner/route.js"), REPO);
let ipN = 0;
async function post(body) {
  ipN += 1; // fresh IP per call so the per-IP limiter never decides a test
  const res = await route.POST(new Request("https://www.gowayfind.com/api/planner", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://www.gowayfind.com", "x-forwarded-for": `203.0.113.${ipN}` },
    body: JSON.stringify(body),
  }));
  return { status: res.status, json: await res.json() };
}
const { plannerPersona } = await import("../lib/plannerPersona.js");
const santa = plannerPersona("santa");

// 1. No key at all: hand written Santa line, labelled, zero provider calls.
{
  resetCalls();
  const r = await post({ message: "hi santa!", voice: "santa" });
  ok(r.status === 200 && r.json.mode === "clarify", "no city -> clarify");
  ok(santa.clarifyCity.includes(r.json.reply), "no key: the reply is one of Santa's hand written lines");
  ok(r.json.source === "deterministic" && r.json.fallbackReason === "not_configured", `no key: labelled deterministic + not_configured (got ${r.json.source}/${r.json.fallbackReason})`);
  ok(net.openai.length === 0 && net.anthropic === 0 && net.ledger.length === 0, "no key: zero grants or provider calls");
}

// Provide valid fixture credentials so gate tests cannot pass due to a missing key or cap.
process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
process.env.OPENAI_API_KEY = "sk-openai-fixture";
process.env.OPENAI_MONTHLY_REQUEST_CAP = "7";
process.env.WAYFIND_GATE = "shut";
process.env.ANTHROPIC_MONTHLY_REQUEST_CAP = "5";
process.env.SUPABASE_URL = "https://stub.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-key";
net.openaiReply = openAiReply("Ho ho ho — a fellow cookie fan! 🍪 Which Florida city, and what dates?");
net.anthropicReply = claudeReply("Boo! Which city and when?");

// 2. Shared gate shuts off paid model calls for both hosts. Open mode keeps each on its own provider and ledger.
{
  resetCalls();
  const santaClosed = await post({ message: "do you like cookies", voice: "santa" });
  ok(santaClosed.json.source === "deterministic" && santaClosed.json.fallbackReason === "gate_shut", `gate shut: Santa uses deterministic fallback (got ${santaClosed.json.source}/${santaClosed.json.fallbackReason})`);
  const booClosed = await post({ message: "hey boo", voice: "boo" });
  ok(booClosed.json.source === "deterministic" && booClosed.json.fallbackReason === "gate_shut", "gate shut: Boo uses deterministic fallback");
  ok(net.openai.length === 0 && net.anthropic === 0 && net.ledger.length === 0, "gate shut: neither host requests a grant or calls a provider");

  process.env.WAYFIND_GATE = "open";
  const r = await post({ message: "do you like cookies", voice: "santa" });
  ok(r.json.mode === "clarify" && r.json.source === "openai", `Santa model path: source openai (got ${r.json.source}/${r.json.fallbackReason})`);
  ok(r.json.reply === "Ho ho ho, a fellow cookie fan! 🍪 Which Florida city, and what dates?", `model reply used and cleaned (got ${JSON.stringify(r.json.reply)})`);
  ok(!("fallbackReason" in r.json), "a generated reply carries no fallbackReason");
  ok(net.openai.length === 1 && net.anthropic === 0, "gate open: Santa makes exactly one OpenAI call");
  ok(net.ledger.length === 1 && net.ledger[0].p_sku === "openai_santa_planner" && net.ledger[0].p_cap === 7, "Santa uses exactly one grant with the configured cap on its dedicated lane");
  ok(net.openai[0]?.model === "gpt-6.2-sol" && net.openai[0]?.reasoning_effort === "low", "Santa clarification uses GPT-6.2 Sol with low reasoning effort");

  resetCalls();
  const booOpen = await post({ message: "hey boo", voice: "boo" });
  ok(booOpen.json.source === "claude" && net.openai.length === 0 && net.anthropic === 1
    && net.ledger.length === 1 && net.ledger[0].p_sku === "anthropic_requests", "Boo still uses exactly one Anthropic call and its own grant when the shared gate is open");
}

// 3. Santa still requires a budget and the ledger's permission.
{
  resetCalls();
  delete process.env.OPENAI_MONTHLY_REQUEST_CAP;
  const missingBudget = await post({ message: "what's up", voice: "santa" });
  ok(missingBudget.json.source === "deterministic" && missingBudget.json.fallbackReason === "missing_openai_request_cap"
    && net.openai.length === 0 && net.anthropic === 0 && net.ledger.length === 0, "an open gate cannot spend without a configured cap");
  process.env.OPENAI_MONTHLY_REQUEST_CAP = "7";
  net.ledgerGrant = false;
  const r = await post({ message: "what's up", voice: "santa" });
  ok(r.json.source === "deterministic" && r.json.fallbackReason === "monthly_request_cap_reached_or_ledger_unavailable", `Santa cap reached: labelled ledger refusal (got ${r.json.fallbackReason})`);
  ok(santa.clarifyCity.includes(r.json.reply), "cap reached: Santa still answers in character");
  ok(net.openai.length === 0 && net.anthropic === 0 && net.ledger.length === 1 && net.ledger[0].p_sku === "openai_santa_planner", "cap reached: only the Santa ledger is called");
  net.ledgerGrant = true;
}

// 4. Garbage model output falls back, labelled unusable_reply.
{
  resetCalls();
  net.openaiReply = openAiReply("{\"oops\":true}");
  const r = await post({ message: "yo", voice: "santa" });
  ok(r.json.source === "deterministic" && r.json.fallbackReason === "unusable_reply", `junk output: labelled unusable_reply (got ${r.json.fallbackReason})`);
}

// 5. Provider failure (billing): one attempt, labelled with the failure kind, no retry.
{
  resetCalls();
  net.anthropicReply = () => new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }), { status: 400, headers: { "content-type": "application/json" } });
  const r = await post({ message: "hello there", voice: "boo" });
  ok(r.json.source === "deterministic" && /billing|quota|http_error/.test(String(r.json.fallbackReason)), `provider failure: labelled with its kind (got ${r.json.fallbackReason})`);
  ok(plannerPersona("boo").clarifyCity.includes(r.json.reply), "provider failure: Boo answers in Boo's voice");
  ok(net.anthropic === 1, `provider failure: exactly one attempt, no retry (got ${net.anthropic})`);
}

// 5b. Boo's billing breaker stops its retries while Santa's provider remains available.
{
  resetCalls();
  const r = await post({ message: "still there?", voice: "boo" });
  ok(r.json.fallbackReason === "breaker_open" && net.anthropic === 0, `breaker open: no retry storm, labelled breaker_open (got ${r.json.fallbackReason}, ${net.anthropic} calls)`);
  net.openaiReply = openAiReply("Ho ho! Which Florida city, and what dates?");
  const santaOpen = await post({ message: "still there?", voice: "santa" });
  ok(santaOpen.json.source === "openai" && net.openai.length === 1 && net.anthropic === 0, "Boo's breaker does not block Santa's separate provider");
}

// 6. Memory: "Tampa please" then "this weekend, two adults, christmas lights" (no
//    city in the second turn) is NOT asked for a city again.
{
  resetCalls();
  net.openaiReply = openAiReply("not json, the plan path will fall back");
  const control = await post({ message: "this weekend, two adults, christmas lights", voice: "santa", recent: [] });
  ok(control.json.mode === "clarify", "control: the second turn alone has no city, so on its own it is asked for one");
  const r = await post({ message: "this weekend, two adults, christmas lights", voice: "santa", recent: ["Tampa please"] });
  ok(r.json.mode !== "clarify", `with the earlier "Tampa" turn the host remembers the city and does not ask again (got ${r.json.mode})`);
}

// A complex plan uses medium reasoning and only accepted data reaches chat.
{
  resetCalls();
  net.openaiReply = () => {
    const { CANDIDATES, plannedDays } = JSON.parse(net.openai.at(-1).messages[1].content);
    const used = new Set();
    const days = plannedDays.map((date) => {
      const candidate = CANDIDATES.find((entry) => entry.validDays.includes(date) && !used.has(entry.id));
      if (!candidate) return { date, stops: [] };
      used.add(candidate.id);
      return { date, stops: [{ id: candidate.id }] };
    });
    return openAiReply(JSON.stringify({ title: "Invented Title", reply: "Go to Outside Catalog Grill", days }))();
  };
  const r = await post({ message: "Plan 2 days in Tampa with Christmas lights and food", voice: "santa" });
  ok(r.json.source === "openai" && r.json.mode === "propose_trip" && net.openai.length === 1
    && net.openai[0]?.reasoning_effort === "medium" && net.openai[0]?.response_format?.type === "json_object",
    "a two-day Santa plan uses one OpenAI GPT-6.2 Sol structured request with medium reasoning");
  ok(r.json.proposedPlan?.title === "Tampa Itinerary" && !r.json.reply.includes("Outside Catalog Grill"),
    "the model cannot describe an unsupported stop or show an invented title in the finished plan");
}

// 7. Known city, no dates phrase that asks for dates -> clarifyDates line, no provider call.
{
  resetCalls();
  const r = await post({ message: "plan a florida christmas trip to Tampa", voice: "santa" });
  ok(r.json.mode === "clarify" ? r.json.fallbackReason === "not_needed" && net.openai.length === 0 && net.anthropic === 0 && /Tampa/.test(r.json.reply) : r.json.mode !== "clarify",
    `city known: either the dates question names Tampa and costs no AI call, or planning starts (got ${r.json.mode}/${r.json.fallbackReason})`);
}

// 8. Voice normalisation.
{
  resetCalls();
  const r = await post({ message: "hey", voice: "grinch" });
  ok(r.json.voice === "wayfind", "unknown voice -> wayfind");
}

globalThis.fetch = realFetch;
if (fails.length) {
  for (const f of fails) console.error("test-planner-host-voice: FAIL: " + f);
  process.exit(1);
}
console.log(`test-planner-host-voice: OK, ${n} assertions (real /api/planner route, network stubbed: separate metered Santa OpenAI and Boo Anthropic paths; fallbacks, memory, and voice normalization)`);
