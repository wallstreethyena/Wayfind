#!/usr/bin/env node
// scripts/test-insider-tips-preview.mjs — locks the insider-tips mockup's
// honesty and spend rules (lib/insiderTipsPreview.js, app/preview/insider-tips).
//   1. A witty rewrite that adds a number, a price or a proper name that is not
//      in Wayfind's own source text is rejected (the verified tip shows instead).
//   2. Gemini runs only through lib/paidGemini.js on the capped preview lane.
//   3. No key -> the verified tips, verbatim, and no request at all.
//   4. Bad model JSON or an off-list id never invents a card.
//   5. The page is noindex and the route is behind the middleware guard.
import { readFileSync } from "node:fs";
import {
  lineStaysTrue, metroForQuery, chooseGeminiModel, answerInsiderQuestion, plainAnswerFrom, geminiModelChoices, thinkingFor,
  __resetInsiderPreviewMemo, INSIDER_PREVIEW_SKU, INSIDER_PREVIEW_MONTHLY_CAP,
} from "../lib/insiderTipsPreview.js";

let n = 0;
const ok = (cond, msg) => { if (!cond) { console.error("test-insider-tips-preview: FAIL — " + msg); process.exit(1); } n++; };

// 1 — fact check on rewrites (positive control first).
const src = "Madame Tussauds Orlando attractions 90-plus wax celebrities. Buy the ICON Park bundle — doing Tussauds, the Eye, and SEA LIFE separately costs noticeably more.";
ok(lineStaysTrue("Grab the ICON Park bundle. Doing Tussauds, the Eye and SEA LIFE solo costs more.", src), "faithful rewrite must pass");
ok(lineStaysTrue("Meet 90-plus wax celebrities, then bundle up.", src), "a number that IS in the source passes");
ok(!lineStaysTrue("Grab the ICON Park bundle and save $20.", src), "an invented price is rejected");
ok(!lineStaysTrue("Bundle up at ICON Park, then hit Disney.", src), "an invented proper name is rejected");
ok(!lineStaysTrue("Open till 10, so bundle up.", src), "an invented time is rejected");
ok(!lineStaysTrue("x".repeat(171), src), "an over-long line is rejected");

// 2 — metro words.
ok(metroForQuery("rainy day in Tampa") === "tampa", "Tampa maps to tampa");
ok(metroForQuery("Siesta Key beach") === "manatee-sarasota", "Siesta maps to Sarasota");
ok(metroForQuery("key west") === "key-west", "longest match wins (key west over keys)");
ok(metroForQuery("pizza") === null, "no town -> no metro");

// 3 — model choice: owner pick > "neon" > newest pro > newest flash; never lite/image.
const listing = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview", "gemini-3.1-flash-image-preview", "text-embedding-004"];
__resetInsiderPreviewMemo();
let m = await chooseGeminiModel({ apiKey: "k", env: {}, listImpl: async () => listing });
ok(m === "gemini-3-pro-preview", "picks the newest pro (most capable), got " + m);
ok(!geminiModelChoices().some((n) => /image|embedding/.test(n)), "model choices list text models only");
__resetInsiderPreviewMemo();
m = await chooseGeminiModel({ apiKey: "k", env: {}, listImpl: async () => [...listing, "gemini-3-neon-preview"] });
ok(m === "gemini-3-neon-preview", "a model named neon wins, got " + m);
__resetInsiderPreviewMemo();
m = await chooseGeminiModel({ apiKey: "k", env: { INSIDER_GEMINI_MODEL: "gemini-2.5-pro" }, listImpl: async () => [...listing, "gemini-3-neon-preview"] });
ok(m === "gemini-2.5-pro", "the owner's explicit pick wins when reachable, got " + m);
__resetInsiderPreviewMemo();
m = await chooseGeminiModel({ apiKey: "k", env: { INSIDER_GEMINI_MODEL: "gemini-9-pro" }, listImpl: async () => listing });
ok(m === "gemini-3-pro-preview", "an unreachable owner pick is ignored, got " + m);
__resetInsiderPreviewMemo();
ok((await chooseGeminiModel({ apiKey: "k", env: {}, listImpl: async () => [] })) === "gemini-2.5-flash", "empty listing falls back to the default model");
ok(thinkingFor("gemini-3-pro-preview", "high").config.thinkingLevel === "high" && thinkingFor("gemini-2.5-pro", "low").config.thinkingBudget === 512 && thinkingFor("gemini-2.0-flash", "high") === null, "thinking settings by model family");

// 4 — answers. Fake data via the memo: load once through a fake Supabase.
const rows = [
  { id: "A1", name: "Quick Point Nature Preserve", metro: "manatee-sarasota", town: "Longboat Key", category: "attractions", hook: "Mangrove boardwalks on Sarasota Bay.", tip: "Look for red mangroves nearest open water; their arching prop roots are the giveaway.", photo: "https://x.supabase.co/a.jpg", credit: "Someone, CC BY-SA 4.0" },
  { id: "B2", name: "Margaret Pace Park", metro: "miami-dade", town: "Miami", category: "attractions", hook: "Park with a dog park.", tip: "Dogs are allowed on leash in the park.", photo: "https://x.supabase.co/b.jpg", credit: "" },
];
const plain = plainAnswerFrom(rows, "sarasota");
ok(plain.cards.length === 1 && plain.cards[0].line === rows[0].tip && plain.cards[0].ai === false, "plain answer shows the verified tip verbatim, filtered to the metro");

const realFetch = globalThis.fetch;
const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service" };
globalThis.fetch = async (url) => {
  const u = String(url);
  const json = (v) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
  if (u.includes("/wf_place_photo")) return json(rows.map((r) => ({ place_id: r.id, storage_path: r.id + "/p.jpg", attribution_text: r.credit })));
  if (u.includes("/wf_editorial_servable")) return json(rows.map((r) => ({ place_id: r.id, hook: r.hook, local_tip: r.tip })));
  if (u.includes("/wf_inventory")) return json(rows.map((r) => ({ place_id: r.id, name: r.name, metro: r.metro, locality: r.town, category: r.category, status: "OPERATIONAL" })));
  throw new Error("unexpected fetch " + u);
};
try {
  // No Gemini key -> plain, and no Gemini request made.
  __resetInsiderPreviewMemo();
  delete process.env.GEMINI_API_KEY; delete process.env.GOOGLE_AI_API_KEY;
  let calls = 0;
  const noKey = await answerInsiderQuestion("", { env, geminiRequestImpl: async () => { calls++; throw new Error("must not call"); }, listImpl: async () => [] });
  ok(noKey.reason === "gemini_not_configured" && calls === 0 && noKey.cards.every((c) => !c.ai), "no key -> verified tips, zero Gemini calls");

  // With a key: lane must be the capped preview lane; invented line rejected; off-list id ignored.
  __resetInsiderPreviewMemo();
  process.env.GEMINI_API_KEY = "test-key";
  let lane = null;
  const reply = { intro: "Florida, unfiltered.", picks: [
    { id: "A1", line: "Spot red mangroves by the open water. Their prop roots give it away." },
    { id: "B2", line: "Bring the pup, leash on, open until 9." },
    { id: "ZZZ", line: "A place we made up." },
  ] };
  const ai = await answerInsiderQuestion("", {
    env,
    listImpl: async () => ["gemini-2.5-flash"],
    geminiRequestImpl: async (req, l) => { lane = l; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }), { status: 200 }); },
  });
  ok(lane && lane.sku === INSIDER_PREVIEW_SKU && lane.cap === INSIDER_PREVIEW_MONTHLY_CAP && INSIDER_PREVIEW_MONTHLY_CAP <= 300, "Gemini runs on the capped preview lane");
  ok(ai.ai === true && ai.model === "gemini-2.5-flash", "AI answer names the model");
  const a1 = ai.cards.find((c) => c.id === "A1"); const b2 = ai.cards.find((c) => c.id === "B2");
  ok(a1 && a1.ai === true && /mangroves/.test(a1.line), "faithful rewrite is used");
  ok(b2 && b2.ai === false && b2.line === rows[1].tip, "rewrite with an invented time falls back to the verified tip");
  ok(!ai.cards.some((c) => c.id === "ZZZ") && ai.cards.length === 2, "an id that is not a real candidate never becomes a card");

  // Thinking ladder: deep first; a 400 gets ONE lighter retry; never a third call.
  __resetInsiderPreviewMemo();
  const sent = [];
  const okBody = new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ intro: "Hi.", picks: [{ id: "A1", line: rows[0].tip }] }) }] } }] }), { status: 200 });
  const lad = await answerInsiderQuestion("", { env, listImpl: async () => ["gemini-3-pro-preview"], geminiRequestImpl: async (req) => {
    sent.push(req.body.generationConfig.thinkingConfig);
    return sent.length === 1 ? new Response(JSON.stringify({ error: { status: "INVALID_ARGUMENT" } }), { status: 400 }) : okBody;
  } });
  ok(sent.length === 2 && sent[0].thinkingLevel === "high" && sent[1].thinkingLevel === "low", "deep thinking first, one light retry after a 400");
  ok(lad.ai === true && lad.thinking === "low" && lad.model === "gemini-3-pro-preview", "answer reports the model and thinking level used");
  __resetInsiderPreviewMemo();
  let capCalls = 0;
  const capped = await answerInsiderQuestion("", { env, listImpl: async () => ["gemini-3-pro-preview"], geminiRequestImpl: async () => { capCalls++; return new Response(JSON.stringify({ error: "gemini_request_blocked", reason: "monthly_request_cap_reached_or_ledger_unavailable" }), { status: 503 }); } });
  ok(capCalls === 1 && capped.reason.startsWith("monthly") && capped.cards.every((c) => !c.ai), "a reached cap is final: one call, verified tips shown");

  // Bad JSON -> plain.
  __resetInsiderPreviewMemo();
  const bad = await answerInsiderQuestion("miami", { env, listImpl: async () => [], geminiRequestImpl: async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }), { status: 200 }) });
  ok(bad.reason === "gemini_bad_json" && bad.cards.length === 1 && !bad.cards[0].ai, "bad JSON falls back to verified tips");
} finally {
  globalThis.fetch = realFetch;
  delete process.env.GEMINI_API_KEY;
}

// 5 — wiring.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const page = strip(readFileSync(new URL("../app/preview/insider-tips/page.js", import.meta.url), "utf8"));
ok(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/.test(page), "mockup page is noindex");
const mw = strip(readFileSync(new URL("../middleware.js", import.meta.url), "utf8"));
ok(/"\/api\/preview\/insider-tips"/.test(mw), "route is in the middleware guard matcher");
const route = strip(readFileSync(new URL("../app/api/preview/insider-tips/route.js", import.meta.url), "utf8"));
const plainAt = route.indexOf('searchParams.get("plain") === "1"'), aiAt = route.indexOf("answerInsiderQuestion(q)");
ok(plainAt > 0 && aiAt > plainAt && /plainAnswerFrom\(await loadInsiderTips\(\)/.test(route.slice(plainAt, aiAt)) && !/answerInsiderQuestion/.test(route.slice(plainAt, aiAt)), "plain=1 answers from the verified tips with no Gemini call, before the AI path");
const client = strip(readFileSync(new URL("../app/preview/insider-tips/InsiderTipsClient.js", import.meta.url), "utf8"));
ok(/&plain=1/.test(client) && /Said simply by \{modelName\(answer\.model\)\}/.test(client) && !/color:transparent/.test(client), "a new town shows its verified tips first (readable, never hidden), and the AI line names the model");
const lib = strip(readFileSync(new URL("../lib/insiderTipsPreview.js", import.meta.url), "utf8"));
ok(!/generativelanguage\.googleapis\.com/.test(lib), "no direct Gemini endpoint outside lib/paidGemini.js");

console.log(`test-insider-tips-preview: OK — ${n} assertions (fact check on rewrites, capped Gemini lane, no-key and bad-JSON fallbacks, noindex + guard wiring)`);
