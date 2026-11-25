// /api/command-center/ai-board — the owner-only AI team board (owner order
// 2026-11-25: "make sure that that board is not accessible to scrapers hackers
// anybody from the outside").
//
// Locked three ways, deny by default:
//   1. middleware.js matches this path: same-origin browser request + per-IP
//      rate limit, so a script from anywhere else is refused before this runs.
//   2. requireOwner() (lib/commandCenter/auth.js) runs FIRST on every method:
//      the verified Supabase user id must equal WF_OWNER_USER_ID (or the owner
//      header secret). 401/403/503 bodies carry no board data.
//   3. The tables are RLS-locked with no policies and no anon/auth grants; only
//      this server code, holding the service role, can read or write them.
// Responses are no-store, private, noindex.
//
// GET  -> { ok, lanes, posts, runs, providers }
// POST -> one owner action: decide a proposal, close a claim, post a note to
//         the AIs, or ask the online AIs for an update now (once per hour).
// No action here, and nothing an AI writes, changes the site, its data, flags
// or spend: approving a proposal only records the decision.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { requireOwner } from "../../../../lib/commandCenter/auth.js";
import { jsonNoStore } from "../../../../lib/commandCenter/respond.js";
import { parseOwnerAction } from "../../../../lib/aiBoard/core.js";
import { readBoard, insertPost, updatePostStatus, providerStatus, runBoardRound } from "../../../../lib/aiBoard/server.js";
import { sbEnv } from "../../../../lib/serverCache.js";

export async function GET(req, ctx) {
  const opts = ctx && ctx.opts && typeof ctx.opts === "object" ? ctx.opts : {};
  const gate = await requireOwner(req, opts.authOpts);
  if (!gate.ok) return jsonNoStore(gate.body, gate.status);
  if (!(opts.deps && opts.deps.sb) && !sbEnv()) return jsonNoStore({ ok: false, reason: "storage_not_configured" }, 503);
  try {
    const [board, providers] = await Promise.all([readBoard(opts.deps || {}), providerStatus(opts.deps || {})]);
    return jsonNoStore({ ok: true, ...board, providers, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return jsonNoStore({ ok: false, reason: "board_unavailable" }, 502);
  }
}

export async function POST(req, ctx) {
  const opts = ctx && ctx.opts && typeof ctx.opts === "object" ? ctx.opts : {};
  const gate = await requireOwner(req, opts.authOpts);
  if (!gate.ok) return jsonNoStore(gate.body, gate.status);
  if (!/^application\/json\b/i.test(req.headers.get("content-type") || "")) return jsonNoStore({ ok: false, reason: "json_required" }, 415);
  let body;
  try { body = await req.json(); } catch { return jsonNoStore({ ok: false, reason: "invalid_json" }, 400); }
  const parsed = parseOwnerAction(body);
  if (!parsed.ok) return jsonNoStore({ ok: false, reason: parsed.reason }, 400);
  const deps = opts.deps || {};
  const a = parsed.action;
  try {
    if (a.type === "decide") {
      const row = await updatePostStatus(deps, a.id, a.decision, { onlyIf: { kind: "proposal", status: "pending" } });
      return row ? jsonNoStore({ ok: true, post: row }) : jsonNoStore({ ok: false, reason: "not_a_pending_proposal" }, 409);
    }
    if (a.type === "claim") {
      const row = await updatePostStatus(deps, a.id, a.status, { onlyIf: { kind: "claim", status: "open" } });
      return row ? jsonNoStore({ ok: true, post: row }) : jsonNoStore({ ok: false, reason: "not_an_open_claim" }, 409);
    }
    if (a.type === "note") {
      const res = await insertPost(deps, { author: "owner", kind: "note", title: "", body: a.text, to_provider: a.to });
      return res.ok ? jsonNoStore({ ok: true, post: res.post }) : jsonNoStore({ ok: false, reason: "not_saved" }, 409);
    }
    if (a.type === "run") {
      const out = await runBoardRound("owner", deps);
      return jsonNoStore(out, out.ok ? 200 : 429);
    }
  } catch (e) {
    return jsonNoStore({ ok: false, reason: "board_unavailable" }, 502);
  }
  return jsonNoStore({ ok: false, reason: "unknown_action" }, 400);
}
