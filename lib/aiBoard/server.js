// lib/aiBoard/server.js — the AI team board's storage and check-in round.
//
// Server-only. Every read and write uses the Supabase SERVICE ROLE against the
// three RLS-locked wf_ai_board_* tables (no anon/auth grants, no policies — see
// supabase/migrations/20261125130000_wf_ai_board.sql). Callers MUST already be
// authorized: the owner route runs requireOwner() first, the cron route checks
// CRON_SECRET first. Nothing in this file decides who may call it.
//
// SPEND. Each AI that is online gets ONE request per round through its existing
// fail-closed paid gate (lib/paidAi.js, lib/paidGemini.js, lib/paidOpenAi.js),
// so the board spends inside the SAME monthly caps as everything else and stops
// the moment WAYFIND_GATE is shut or a cap is used up. A round is at most three
// requests; the cron runs once a day and Gabe's "ask now" button is limited to
// one round per hour (OWNER_RUN_GAP_MS), checked against the runs table.
//
// An AI with no key, no cap, an open billing breaker, or (Grok) no connection
// built yet is shown "offline" with the plain reason and skipped. It never errors.

import { sbEnv } from "../serverCache.js";
import { aiKey } from "../aiKey.js";
import { geminiKey } from "../geminiKey.js";
import { openaiKey } from "../openaiKey.js";
import { gateMode } from "../spendGate.js";
import { paidAnthropicRequest } from "../paidAi.js";
import { paidGeminiRequest, geminiMonthlyCap, extractGeminiText, GEMINI_DEFAULT_MODEL } from "../paidGemini.js";
import { paidOpenAiRequest, openaiMonthlyCap, extractOpenAiText, OPENAI_DEFAULT_MODEL } from "../paidOpenAi.js";
import { breakerOpen, tripBreaker, classifyProviderFailure } from "../providerHealth.js";
import { siteTodayStr } from "../siteTime.js";
import { AI_PROVIDERS, buildTurnPrompt, parseTurnReply, enforceBoardLimits } from "./core.js";

export const OWNER_RUN_GAP_MS = 60 * 60 * 1000;
const ROUND_LOCK_MS = 5 * 60 * 1000;
const CLAUDE_MODEL = "claude-haiku-5-5";
const MAX_OUT_TOKENS = 700;
const BREAKER_NAME = { claude: "anthropic", gemini: "gemini", openai: "openai" };

const OFFLINE_TEXT = {
  not_built: "Not connected to Wayfind yet",
  no_key: "No key saved for it in Vercel",
  no_cap: "No monthly limit set for it, so it stays off",
  gate_shut: "All paid AI is switched off right now",
  breaker_open: "Its account refused the last request (often out of credit)",
};

function validCap(raw) {
  const s = String(raw || "").trim();
  return /^[1-9]\d*$/.test(s) && Number.isSafeInteger(Number(s)) ? Number(s) : null;
}

/** Which AIs can take a turn right now, and why the others cannot. */
export async function providerStatus(deps = {}) {
  const env = deps.env || process.env;
  const isBreakerOpen = deps.breakerOpen || breakerOpen;
  const gateShut = (deps.gateMode || gateMode)() === "shut";
  const keys = deps.keys || { claude: aiKey(), gemini: geminiKey(), openai: openaiKey() };
  const caps = deps.caps || {
    claude: validCap(env.ANTHROPIC_MONTHLY_REQUEST_CAP),
    gemini: geminiMonthlyCap(),
    openai: openaiMonthlyCap(),
  };
  const out = {};
  for (const p of AI_PROVIDERS) {
    let reason = "ready";
    if (p === "grok") reason = "not_built";
    else if (!keys[p]) reason = "no_key";
    else if (!caps[p]) reason = "no_cap";
    else if (gateShut) reason = "gate_shut";
    else {
      let open = null;
      try { open = await isBreakerOpen(BREAKER_NAME[p]); } catch { open = null; }
      if (open) reason = "breaker_open";
    }
    out[p] = { online: reason === "ready", reason, text: reason === "ready" ? "Online" : OFFLINE_TEXT[reason] };
  }
  return out;
}

// ── storage (service role, PostgREST) ──────────────────────────────────────
function sb(deps) {
  const s = (deps && deps.sb) || sbEnv();
  if (!s) throw new Error("supabase_not_configured");
  return s;
}

async function rest(deps, path, init = {}) {
  const s = sb(deps);
  const f = (deps && deps.fetch) || fetch;
  const r = await f(`${s.url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { apikey: s.key, authorization: "Bearer " + s.key, "content-type": "application/json", ...(init.headers || {}) },
  });
  return r;
}

async function restJson(deps, path, init) {
  const r = await rest(deps, path, init);
  if (!r.ok) throw new Error(`board_store_http_${r.status}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

const POST_COLS = "id,author,kind,title,body,to_provider,parent_id,claim_key,status,run_id,created_at,decided_at";

export async function readBoard(deps = {}, { limit = 120 } = {}) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 120));
  const [lanes, posts, runs] = await Promise.all([
    restJson(deps, "wf_ai_board_lanes?select=provider,display_name,owns,focus,updated_at&order=provider.asc"),
    restJson(deps, `wf_ai_board_posts?select=${POST_COLS}&order=id.desc&limit=${lim}`),
    restJson(deps, "wf_ai_board_runs?select=id,trigger,started_at,finished_at,results&order=id.desc&limit=5"),
  ]);
  // Open claims and pending proposals can be older than the window: fetch them too.
  const sticky = await restJson(deps, `wf_ai_board_posts?select=${POST_COLS}&or=(and(kind.eq.claim,status.eq.open),and(kind.eq.proposal,status.eq.pending),and(kind.eq.help,status.eq.open))&order=id.desc&limit=60`);
  const seen = new Set((posts || []).map((p) => p.id));
  const merged = [...(posts || []), ...((sticky || []).filter((p) => !seen.has(p.id)))].sort((a, b) => b.id - a.id);
  return { lanes: lanes || [], posts: merged, runs: runs || [] };
}

/** Insert one post. Returns { ok, post } or { ok:false, conflict } on a taken claim. */
export async function insertPost(deps, post) {
  const r = await rest(deps, "wf_ai_board_posts", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify(post) });
  if (r.status === 409) return { ok: false, conflict: true };
  if (!r.ok) throw new Error(`board_store_http_${r.status}`);
  const rows = await r.json();
  return { ok: true, post: Array.isArray(rows) ? rows[0] : rows };
}

export async function updatePostStatus(deps, id, status, { onlyIf } = {}) {
  const filter = `id=eq.${Number(id)}` + (onlyIf ? `&kind=eq.${onlyIf.kind}&status=eq.${onlyIf.status}` : "");
  const rows = await restJson(deps, `wf_ai_board_posts?${filter}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ status, decided_at: new Date().toISOString() }),
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function setFocus(deps, provider, text) {
  await restJson(deps, `wf_ai_board_lanes?provider=eq.${provider}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ focus: text, updated_at: new Date().toISOString() }),
  });
}

// ── one AI's turn ──────────────────────────────────────────────────────────
async function askProvider(provider, prompt, deps) {
  if (deps.ask) return deps.ask(provider, prompt);
  if (provider === "claude") {
    const r = await paidAnthropicRequest({
      method: "POST",
      headers: { "x-api-key": aiKey(), "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: MAX_OUT_TOKENS, system: prompt.system, messages: [{ role: "user", content: prompt.user }] }),
    });
    const raw = await r.text();
    if (!r.ok) return { ok: false, status: r.status, raw };
    let data = null; try { data = JSON.parse(raw); } catch {}
    const text = data && Array.isArray(data.content) ? data.content.filter((b) => b && b.type === "text").map((b) => b.text).join("") : "";
    return { ok: !!text, status: r.status, text };
  }
  if (provider === "gemini") {
    const r = await paidGeminiRequest({
      model: GEMINI_DEFAULT_MODEL,
      apiKey: geminiKey(),
      body: {
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: "user", parts: [{ text: prompt.user }] }],
        generationConfig: { maxOutputTokens: MAX_OUT_TOKENS, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
      },
    });
    const raw = await r.text();
    if (!r.ok) return { ok: false, status: r.status, raw };
    let data = null; try { data = JSON.parse(raw); } catch {}
    const text = extractGeminiText(data);
    return { ok: !!text, status: r.status, text };
  }
  if (provider === "openai") {
    const r = await paidOpenAiRequest({
      model: OPENAI_DEFAULT_MODEL,
      apiKey: openaiKey(),
      body: {
        max_tokens: MAX_OUT_TOKENS,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
      },
    });
    const raw = await r.text();
    if (!r.ok) return { ok: false, status: r.status, raw };
    let data = null; try { data = JSON.parse(raw); } catch {}
    const text = extractOpenAiText(data);
    return { ok: !!text, status: r.status, text };
  }
  return { ok: false, status: 0, raw: "not_built" };
}

async function takeTurn(provider, runId, online, deps) {
  const board = await readBoard(deps, { limit: 80 });
  const prompt = buildTurnPrompt(provider, board, { online, today: (deps.today || siteTodayStr)() });
  let reply;
  try { reply = await askProvider(provider, prompt, deps); } catch { reply = { ok: false, status: 0, raw: "unreachable" }; }
  if (!reply.ok) {
    const kind = classifyProviderFailure(reply.status, reply.raw);
    if (kind && BREAKER_NAME[provider]) { try { await (deps.tripBreaker || tripBreaker)(BREAKER_NAME[provider], kind, `ai-board ${provider} ${reply.status}`); } catch {} }
    // A blocked gate (cap reached, gate shut) answers with our own JSON reason.
    let reason = kind || `http_${reply.status || 0}`;
    try { const j = JSON.parse(reply.raw || ""); if (j && j.reason) reason = String(j.reason).slice(0, 80); } catch {}
    return { provider, ok: false, reason, posted: 0 };
  }
  const parsed = parseTurnReply(provider, reply.text, board);
  if (!parsed.ok) return { provider, ok: false, reason: "unreadable_reply", posted: 0, dropped: parsed.dropped };
  const limited = enforceBoardLimits(provider, parsed.actions, board);
  let posted = 0;
  const skipped = [...parsed.dropped, ...limited.removed];
  // Releases first, so a release and a new claim in one turn fit under the cap.
  for (const a of limited.actions.filter((x) => x.type === "release")) {
    await updatePostStatus(deps, a.id, "released", { onlyIf: { kind: "claim", status: "open" } });
  }
  for (const a of limited.actions) {
    if (a.type === "focus") { await setFocus(deps, provider, a.text); continue; }
    if (a.type !== "post") continue;
    const res = await insertPost(deps, { ...a.post, run_id: runId });
    if (res.ok) posted++;
    else if (res.conflict) skipped.push("claim_taken");
  }
  return { provider, ok: posted > 0, posted, skipped: skipped.slice(0, 12) };
}

/**
 * One check-in round: every online AI takes ONE turn, in a fixed order, each
 * reading the board after the one before it posted (so they can answer each
 * other in the same round). `trigger` is "cron" or "owner".
 */
export async function runBoardRound(trigger, deps = {}) {
  if (trigger !== "cron" && trigger !== "owner") throw new Error("invalid_trigger");
  const now = (deps.now || Date.now)();
  const last = await restJson(deps, "wf_ai_board_runs?select=id,trigger,started_at,finished_at&order=id.desc&limit=1");
  const prev = Array.isArray(last) && last[0];
  if (prev) {
    const age = now - Date.parse(prev.started_at);
    if (!prev.finished_at && age < ROUND_LOCK_MS) return { ok: false, reason: "round_in_progress" };
    if (trigger === "owner" && age < OWNER_RUN_GAP_MS) return { ok: false, reason: "too_soon", retryAfterMs: OWNER_RUN_GAP_MS - age };
  }
  const status = await providerStatus(deps);
  const online = AI_PROVIDERS.filter((p) => status[p].online);
  const created = await restJson(deps, "wf_ai_board_runs", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify({ trigger }) });
  const runId = Array.isArray(created) && created[0] ? created[0].id : null;
  const turns = [];
  for (const p of AI_PROVIDERS) {
    if (!status[p].online) { turns.push({ provider: p, ok: false, reason: status[p].reason, posted: 0, offline: true }); continue; }
    try { turns.push(await takeTurn(p, runId, online, deps)); }
    catch (e) { turns.push({ provider: p, ok: false, reason: String((e && e.message) || "error").slice(0, 80), posted: 0 }); }
  }
  const results = { turns, online, posted: turns.reduce((n, t) => n + (t.posted || 0), 0) };
  if (runId) {
    await restJson(deps, `wf_ai_board_runs?id=eq.${runId}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ finished_at: new Date().toISOString(), results }) });
  }
  return { ok: true, runId, ...results };
}
