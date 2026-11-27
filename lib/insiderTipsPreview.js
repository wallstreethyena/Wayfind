// lib/insiderTipsPreview.js — SERVER-ONLY. Data + AI for the insider-tips
// homepage MOCKUP (app/preview/insider-tips, noindex, owner review only).
//
// WHAT IS REAL. Every card is a real Wayfind place that has BOTH:
//   - a verified Wayfind editorial row with a local tip (wf_editorial_servable,
//     verified = true), and
//   - an active, licensed photo of that exact place in Wayfind's own photo
//     vault (wf_place_photo, status = 'active'), served from our Supabase
//     storage with its credit line.
// Nothing here invents a place, a tip or a photo.
//
// WHAT THE AI DOES. Gemini only (a) picks which of those real tips best answer
// the visitor's "Where are you headed?" text and (b) rewrites a tip in a short,
// witty, plain voice. The rewrite is checked: any number or proper name that is
// not in Wayfind's own source text for that place rejects the line, and the
// verified tip is shown word for word instead. No key, gate shut, cap reached,
// timeout or bad JSON all fall back to the verified tips; the page never breaks.
//
// SPEND. Every Gemini call goes through lib/paidGemini.js on its own capped
// ledger lane (INSIDER_PREVIEW_SKU, INSIDER_PREVIEW_MONTHLY_CAP), answers are
// cached per normalized question in memory and at the CDN by the route, and
// the route sits behind the same-origin + per-IP guard in middleware.js.
import { paidGeminiRequest, extractGeminiText, listGeminiModels, GEMINI_DEFAULT_MODEL } from "./paidGemini.js";
import { geminiKey } from "./geminiKey.js";
import { vaultPublicUrl } from "./photoVault.js";

export const INSIDER_PREVIEW_SKU = "gemini_insider_preview";
export const INSIDER_PREVIEW_MONTHLY_CAP = 300; // at most two calls per fresh question; answers cached 6h per question
const PICKS = 6;
const CANDIDATES_FOR_AI = 28;
const DATA_TTL_MS = 60 * 60 * 1000;
const ANSWER_TTL_MS = 6 * 60 * 60 * 1000;
const MODEL_TTL_MS = 6 * 60 * 60 * 1000;
const AI_TIMEOUT_MS = 45_000; // deep thinking on a pro model can take a while; the page shows verified tips meanwhile

// Florida metros only; the inventory also holds out-of-state test rows.
export const FL_METROS = Object.freeze({
  orlando: { label: "Orlando", words: ["orlando", "kissimmee", "winter park", "lake buena vista", "celebration", "sanford"] },
  tampa: { label: "Tampa", words: ["tampa", "ybor", "brandon", "riverview", "plant city"] },
  "st-pete": { label: "St. Pete & Clearwater", words: ["st pete", "st. pete", "saint pete", "st petersburg", "st. petersburg", "clearwater", "dunedin", "gulfport", "madeira", "treasure island", "tarpon springs", "pinellas"] },
  "manatee-sarasota": { label: "Sarasota & Bradenton", words: ["sarasota", "bradenton", "anna maria", "longboat", "siesta", "venice", "lakewood ranch", "parrish", "manatee", "palmetto", "lido", "holmes beach"] },
  "miami-dade": { label: "Miami", words: ["miami", "coral gables", "coconut grove", "wynwood", "little havana", "key biscayne", "homestead", "brickell", "south beach"] },
  broward: { label: "Fort Lauderdale", words: ["fort lauderdale", "ft lauderdale", "ft. lauderdale", "lauderdale", "hollywood", "pompano", "broward", "dania"] },
  "palm-beach": { label: "Palm Beach", words: ["palm beach", "west palm", "boca", "delray", "jupiter", "boynton", "lake worth"] },
  jacksonville: { label: "Jacksonville", words: ["jacksonville", "jax", "amelia", "fernandina", "ponte vedra", "neptune beach"] },
  "jacksonville-fl": { label: "Jacksonville", words: [] },
  "key-west": { label: "Key West", words: ["key west"] },
  keys: { label: "the Keys", words: ["keys", "key largo", "islamorada", "marathon", "big pine"] },
  "st-augustine-fl": { label: "St. Augustine", words: ["st augustine", "st. augustine", "saint augustine"] },
  "ocala-fl": { label: "Ocala", words: ["ocala"] },
  "panama-city-florida": { label: "Panama City", words: ["panama city", "pcb"] },
  "spring-hill-fl": { label: "Spring Hill", words: ["spring hill", "weeki wachee"] },
  florida: { label: "Florida", words: [] },
});

const QUICK_PICKS = ["Orlando", "Tampa", "St. Pete", "Sarasota", "Miami", "Key West"];
export function quickPicks() { return QUICK_PICKS.slice(); }

function supabaseConfig(env = process.env) {
  const raw = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

async function rest(config, pathAndQuery) {
  const res = await fetch(`${config.url}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: config.key, Authorization: "Bearer " + config.key },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error("supabase " + res.status);
  return res.json();
}

const clean = (s, max = 400) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

let dataMemo = { at: 0, rows: null };

/** Real places with a verified local tip and an active licensed vault photo. */
export async function loadInsiderTips({ env = process.env, nowMs = Date.now() } = {}) {
  if (dataMemo.rows && nowMs - dataMemo.at < DATA_TTL_MS) return dataMemo.rows;
  const config = supabaseConfig(env);
  if (!config) return [];
  const photos = await rest(config, "wf_place_photo?status=eq.active&storage_path=not.is.null&select=place_id,storage_path,attribution_text,license,width,height&limit=5000");
  const photoById = new Map();
  for (const p of Array.isArray(photos) ? photos : []) {
    if (p && p.place_id && p.storage_path && !photoById.has(p.place_id)) photoById.set(p.place_id, p);
  }
  const ids = [...photoById.keys()];
  const eds = new Map();
  const inv = new Map();
  for (const part of chunk(ids, 120)) {
    const list = part.map((id) => `"${String(id).replace(/"/g, "")}"`).join(",");
    const [edRows, invRows] = await Promise.all([
      rest(config, `wf_editorial_servable?verified=is.true&local_tip=not.is.null&place_id=in.(${encodeURIComponent(list)})&select=place_id,hook,local_tip`),
      rest(config, `wf_inventory?place_id=in.(${encodeURIComponent(list)})&select=place_id,name,metro,locality,postal_city,category,status,excluded`),
    ]);
    for (const e of Array.isArray(edRows) ? edRows : []) if (e && clean(e.local_tip)) eds.set(e.place_id, e);
    for (const r of Array.isArray(invRows) ? invRows : []) if (r) inv.set(r.place_id, r);
  }
  const rows = [];
  for (const [id, e] of eds) {
    const r = inv.get(id);
    const p = photoById.get(id);
    if (!r || !p || r.excluded === true) continue;
    if (!FL_METROS[r.metro]) continue;
    if (/closed/i.test(String(r.status || ""))) continue;
    const name = clean(r.name, 120);
    const tip = clean(e.local_tip, 300);
    if (!name || tip.length < 12) continue;
    rows.push({
      id,
      name,
      metro: r.metro,
      town: clean(r.locality || r.postal_city, 60) || FL_METROS[r.metro].label,
      category: clean(r.category, 40),
      hook: clean(e.hook, 220),
      tip,
      photo: vaultPublicUrl(p.storage_path, config.url, { width: 640 }),
      credit: clean(p.attribution_text, 160),
    });
  }
  dataMemo = { at: nowMs, rows };
  return rows;
}

// ── Matching the visitor's words to real tips (no AI needed) ────────────────

export function normalizeQuery(q) {
  return String(q || "").toLowerCase().replace(/[^a-z0-9 .'&-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function metroForQuery(q) {
  const n = " " + normalizeQuery(q) + " ";
  let best = null;
  for (const [slug, m] of Object.entries(FL_METROS)) {
    for (const w of m.words) {
      if (n.includes(" " + w + " ") || n.includes(" " + w + ",") || n.includes(" " + w)) {
        if (!best || w.length > best.len) best = { slug, len: w.length };
      }
    }
  }
  return best ? best.slug : null;
}

const SAME_METRO = { jacksonville: ["jacksonville", "jacksonville-fl"], "jacksonville-fl": ["jacksonville", "jacksonville-fl"], keys: ["keys", "key-west"], "key-west": ["key-west", "keys"] };

function words(s) { return normalizeQuery(s).split(" ").filter((w) => w.length > 2); }

// Deterministic variety: spread across metros and categories, stable per day.
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function candidatesFor(rows, query, { daySeed = "" } = {}) {
  const metro = metroForQuery(query);
  const pool = metro ? rows.filter((r) => (SAME_METRO[metro] || [metro]).includes(r.metro)) : rows.slice();
  const qWords = words(query).filter((w) => !(metro && FL_METROS[metro].words.some((m) => m.includes(w))));
  const scored = pool.map((r) => {
    const hay = (r.name + " " + r.hook + " " + r.tip + " " + r.category + " " + r.town).toLowerCase();
    const hits = qWords.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
    return { r, s: hits * 10 + (hashStr(daySeed + r.id) % 1000) / 1000 };
  }).sort((a, b) => b.s - a.s);
  // Without a metro, keep the mix broad: at most 3 per metro in the first pass.
  const out = [];
  const perMetro = new Map();
  for (const { r } of scored) {
    const n = perMetro.get(r.metro) || 0;
    if (!metro && n >= 3) continue;
    perMetro.set(r.metro, n + 1);
    out.push(r);
  }
  for (const { r } of scored) if (!out.includes(r)) out.push(r);
  return { metro, list: out };
}

// ── The witty voice, checked against the source ──────────────────────────────

const VOICE = [
  "You write for Wayfind, a Florida local-discovery site.",
  "Voice: witty, warm, really simple. Short sentences. Plain words a 10 year old gets. One light joke at most. No hashtags, no emoji, no dashes.",
  "Never tell people what to do in a bossy way; offer the tip like a friend would.",
  "STRICT FACT RULE: use only facts that appear in the place's own text below. Do not add any number, price, time, date, name, menu item or claim that is not in that text. If unsure, stay closer to the original wording.",
].join("\n");

function buildPrompt(query, metro, list) {
  const places = list.map((r) => ({ id: r.id, name: r.name, town: r.town, category: r.category, what_it_is: r.hook, insider_tip: r.tip }));
  return {
    system: VOICE,
    user: [
      `The visitor typed: "${query || "surprise me"}"${metro ? ` (area: ${FL_METROS[metro].label})` : ""}.`,
      `Pick the ${PICKS} places that best fit what they typed (all of them are real Wayfind places). Give variety.`,
      `For each pick, rewrite its insider_tip as ONE witty line, 18 words or fewer, keeping the tip's real meaning.`,
      `Also write "intro": one witty sentence, 14 words or fewer, reacting to what they typed. No numbers in the intro.`,
      `Return JSON only: {"intro": string, "picks": [{"id": string, "line": string}]}`,
      `Places: ${JSON.stringify(places)}`,
    ].join("\n"),
  };
}

const ALWAYS_OK = new Set(["i", "florida", "wayfind", "locals", "local", "pro", "tip"]);

/** True when `line` adds no number or proper name absent from `source`. */
export function lineStaysTrue(line, source) {
  const text = String(line || "").trim();
  if (!text || text.length > 170) return false;
  if (/[–—]|#|https?:/i.test(text)) return false;
  const src = String(source || "").toLowerCase();
  for (const num of text.match(/\d+(?:[.,:]\d+)?/g) || []) {
    if (!src.includes(num.toLowerCase())) return false;
  }
  if (/\$/.test(text) && !/\$/.test(src)) return false;
  const tokens = text.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9']+$/g, "");
    if (!raw || !/^[A-Z]/.test(raw)) continue;
    const prev = i === 0 ? "." : tokens[i - 1];
    if (/[.!?:]["')]?$/.test(prev)) continue; // sentence start
    const w = raw.toLowerCase().replace(/'s$/, "");
    if (ALWAYS_OK.has(w)) continue;
    if (!src.includes(w)) return false;
  }
  return true;
}

function fallbackIntro(query, metro) {
  if (metro) return `${FL_METROS[metro].label}? Good call. Here's what the locals keep quiet about.`;
  if (normalizeQuery(query)) return "Here's what the locals would tell you, if you asked nicely.";
  return "Florida, minus the tourist traps. Tips straight from the locals.";
}

function card(r, line, ai) {
  return { id: r.id, name: r.name, town: r.town, category: r.category, tip: r.tip, line: line || r.tip, ai: !!(ai && line), photo: r.photo, credit: r.credit, href: `/p/${encodeURIComponent(r.id)}` };
}

/** The no-AI answer: real tips, verbatim, for first paint and every fallback. */
export function plainAnswerFrom(rows, query, { nowMs = Date.now(), reason = "plain" } = {}) {
  const q = normalizeQuery(query);
  const { metro, list } = candidatesFor(rows, q, { daySeed: new Date(nowMs).toISOString().slice(0, 10) });
  return { metro, metroLabel: metro ? FL_METROS[metro].label : "Florida", ai: false, model: null, reason, intro: fallbackIntro(q, metro), cards: list.slice(0, PICKS).map((r) => card(r, null, false)) };
}

let modelMemo = { at: 0, model: null, available: [] };

function versionOf(name) {
  const m = /^gemini-(\d+)(?:\.(\d+))?-/.exec(name);
  return m ? Number(m[1]) + Number(m[2] || 0) / 10 : 0;
}

const NOT_TEXT = /embedding|image|tts|live|audio|aqa|robotics|computer-use|native|veo|imagen|banana/;
const byNewest = (a, b) => versionOf(b) - versionOf(a) || (a.includes("preview") ? 1 : 0) - (b.includes("preview") ? 1 : 0) || a.length - b.length;

/** Text models this key can reach, newest first (names only, never the key). */
export function geminiModelChoices() { return modelMemo.available.slice(); }

/**
 * Which Gemini model answers the box, in order:
 *   1. INSIDER_GEMINI_MODEL, when the key can reach it (owner's explicit pick);
 *   2. a model whose name contains "neon" (the owner asked for "Gemini Neon");
 *   3. the newest pro model (most capable), else the newest flash model;
 *   4. GEMINI_MODEL, else the repo default.
 */
export async function chooseGeminiModel({ apiKey, env = process.env, nowMs = Date.now(), listImpl = listGeminiModels } = {}) {
  if (modelMemo.model && nowMs - modelMemo.at < MODEL_TTL_MS) return modelMemo.model;
  let pick = null;
  let available = [];
  try {
    available = (await listImpl({ apiKey }) || []).filter((n) => /^gemini-/.test(n) && !NOT_TEXT.test(n)).sort(byNewest);
    const wanted = String(env.INSIDER_GEMINI_MODEL || "").trim();
    const neon = available.filter((n) => /neon/.test(n));
    const tier = (kind) => available.filter((n) => new RegExp("^gemini-\\d+(\\.\\d+)?-" + kind + "(-preview(-[0-9a-z-]+)?|-latest)?$").test(n) && !/lite|thinking|exp/.test(n));
    // Most capable first (owner, 2026-11-27: "maximize the model's capability").
    pick = (wanted && available.includes(wanted) ? wanted : null) || neon[0] || tier("pro")[0] || tier("flash")[0] || null;
  } catch { /* keep the fallback */ }
  const fallback = String(env.GEMINI_MODEL || "").trim() || GEMINI_DEFAULT_MODEL;
  modelMemo = { at: nowMs, model: pick || fallback, available: available.slice(0, 40) };
  return modelMemo.model;
}

/** Thinking settings by model family (Gemini 3+ uses levels, 2.5 uses budgets). */
export function thinkingFor(model, depth) {
  const v = versionOf(String(model || ""));
  if (v >= 3) return { label: depth, config: { thinkingLevel: depth === "high" ? "high" : "low" } };
  if (v >= 2.5) return { label: depth, config: { thinkingBudget: depth === "high" ? 2560 : 512 } };
  return null;
}

const answerMemo = new Map();

/**
 * The answer for one "Where are you headed?" question.
 * Always resolves: { intro, cards[], metro, ai, model, reason }.
 */
export async function answerInsiderQuestion(query, { env = process.env, nowMs = Date.now(), geminiRequestImpl = paidGeminiRequest, listImpl = listGeminiModels } = {}) {
  const q = normalizeQuery(query);
  const key = q || "__home__";
  const hit = answerMemo.get(key);
  if (hit && nowMs - hit.at < ANSWER_TTL_MS) return { ...hit.value, cached: true };

  const rows = await loadInsiderTips({ env, nowMs }).catch(() => []);
  const { metro, list } = candidatesFor(rows, q, { daySeed: new Date(nowMs).toISOString().slice(0, 10) });
  const base = { metro, metroLabel: metro ? FL_METROS[metro].label : "Florida", ai: false, model: null };
  const plain = (reason) => ({ ...base, reason, intro: fallbackIntro(q, metro), cards: list.slice(0, PICKS).map((r) => card(r, null, false)) });
  if (!list.length) return plain("no_tips");

  const apiKey = geminiKey();
  if (!apiKey) return plain("gemini_not_configured");
  const model = await chooseGeminiModel({ apiKey, env, nowMs, listImpl });
  const candidates = list.slice(0, CANDIDATES_FOR_AI);
  const prompt = buildPrompt(q, metro, candidates);
  // Most capable settings the model accepts, inside lib/paidGemini.js's
  // 4,096 output token ceiling (thinking counts toward it): deep thinking
  // first; a model that rejects the setting, or runs out of room before the
  // JSON, gets ONE retry with light thinking. Never more than two paid calls.
  const ladder = [thinkingFor(model, "high"), thinkingFor(model, "low")];
  let parsed = null;
  let lastReason = "gemini_failed";
  let thinking = null;
  for (const t of ladder) {
    const body = {
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: [{ role: "user", parts: [{ text: prompt.user }] }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.8, responseMimeType: "application/json", ...(t ? { thinkingConfig: t.config } : {}) },
    };
    let res;
    try {
      res = await geminiRequestImpl({ model, apiKey, body, signal: AbortSignal.timeout(AI_TIMEOUT_MS) }, { sku: INSIDER_PREVIEW_SKU, cap: INSIDER_PREVIEW_MONTHLY_CAP, timeoutMs: AI_TIMEOUT_MS });
    } catch {
      lastReason = "gemini_failed";
      break;
    }
    if (!res || !res.ok) {
      lastReason = "gemini_failed";
      try { const b = await res.json(); if (b && typeof b.reason === "string") lastReason = b.reason; else if (b && b.error && b.error.status) lastReason = "gemini_" + String(b.error.status).toLowerCase(); } catch { /* ignore */ }
      // Only a request the model refused (400) is worth one lighter retry;
      // a cap, gate or outage answer is final.
      if (!res || res.status !== 400 || /^(monthly|gate|missing|invalid)/.test(lastReason)) break;
      continue;
    }
    try { parsed = JSON.parse(extractGeminiText(await res.json()).replace(/^```(?:json)?|```$/g, "").trim()); } catch { parsed = null; }
    if (parsed && Array.isArray(parsed.picks)) { thinking = t ? t.label : "default"; break; }
    parsed = null;
    lastReason = "gemini_bad_json";
  }
  if (!parsed) return { ...plain(lastReason), model, modelChoices: geminiModelChoices() };

  const byId = new Map(candidates.map((r) => [r.id, r]));
  const cards = [];
  let rewritten = 0;
  for (const p of parsed.picks) {
    const r = p && byId.get(String(p.id));
    if (!r || cards.some((c) => c.id === r.id)) continue;
    const line = clean(p.line, 200);
    const ok = lineStaysTrue(line, `${r.name} ${r.town} ${r.category} ${r.hook} ${r.tip}`);
    if (ok) rewritten++;
    cards.push(card(r, ok ? line : null, ok));
    if (cards.length >= PICKS) break;
  }
  for (const r of candidates) { if (cards.length >= PICKS) break; if (!cards.some((c) => c.id === r.id)) cards.push(card(r, null, false)); }
  const introRaw = clean(parsed.intro, 140);
  const introOk = introRaw && !/\d/.test(introRaw) && lineStaysTrue(introRaw, `${query} ${base.metroLabel} ${cards.map((c) => c.name + " " + c.town).join(" ")}`);
  const value = { ...base, ai: true, model, thinking, modelChoices: geminiModelChoices(), reason: "ok", rewritten, intro: introOk ? introRaw : fallbackIntro(q, metro), cards };
  answerMemo.set(key, { at: nowMs, value });
  if (answerMemo.size > 300) answerMemo.delete(answerMemo.keys().next().value);
  return value;
}

/** Test hook: forget memoized data, answers and model. */
export function __resetInsiderPreviewMemo() { dataMemo = { at: 0, rows: null }; modelMemo = { at: 0, model: null, available: [] }; answerMemo.clear(); }
