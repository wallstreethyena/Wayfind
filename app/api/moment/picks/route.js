// v5.22 — "Perfect right now" reasoning for the mood buttons. The structured
// ranking engine already did the FILTERING (open-now, junk gate, quality
// floor, distance, weather-fit); this route only does interpretation: given
// the top candidates plus live context, Claude Haiku picks the best 3-5 for
// THIS exact moment and writes one grounded "why now" line each. Cached per
// (intent, candidate-set, weather bucket, time bucket) so repeat taps in the
// same conditions never re-bill. Fail-soft: any problem returns {picks: []}
// and the client shows the structured list untouched — the page never waits
// on the model.
export const runtime = "nodejs";
import { claudeJson, logLlmCall } from "../../../../lib/insiderServer";
import { isKnownIntent } from "../../../../lib/momentIntents";

const mem = new Map();
const TTL = 3 * 3600 * 1000;

function sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}
async function cacheGet(k) {
  const m = mem.get(k);
  if (m && m.exp > Date.now()) return m.v;
  const s = sb();
  if (!s) return null;
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_places_cache?k=eq.${encodeURIComponent(k)}&select=v,exp`, { headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store" });
    if (!r.ok) return null;
    const row = (await r.json())[0];
    if (!row || new Date(row.exp).getTime() < Date.now()) return null;
    mem.set(k, { v: row.v, exp: new Date(row.exp).getTime() });
    return row.v;
  } catch { return null; }
}
async function cacheSet(k, v) {
  mem.set(k, { v, exp: Date.now() + TTL });
  const s = sb();
  if (!s) return;
  try {
    await fetch(`${s.url}/rest/v1/wf_places_cache`, { method: "POST", headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ k, v, exp: new Date(Date.now() + TTL).toISOString() }) });
  } catch (e) {}
}

const _nn = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Moment fix (MOMENT_PICKS_DIAGNOSIS.md, Phase 2): the contract is LOUD.
// Malformed input (bad JSON, unknown intent id, misshaped candidates) returns
// 400 with a machine-readable error — never 200 {picks:[]}, which is
// indistinguishable from a real no-match and is exactly how id drift
// (cozy-indoor-day vs cozyindoor) degraded silently. A genuine no-match
// returns 200 with a reason envelope. Every zero-pick outcome is logged with
// the intent + candidate count so a real coverage gap is visible.
function badRequest(error, detail) {
  try { console.log(JSON.stringify({ tag: "moment_picks_400", error, detail })); } catch (e) {}
  return Response.json({ error, detail: detail || null }, { status: 400 });
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch (e) { return badRequest("invalid_json"); }
  if (!body || typeof body !== "object") return badRequest("invalid_body");
  const intent = String(body.intent || "").slice(0, 30);
  if (!intent) return badRequest("missing_intent");
  if (!isKnownIntent(intent)) return badRequest("unknown_intent", intent);
  if (!Array.isArray(body.candidates)) return badRequest("candidates_not_array");
  try {
    const wx = String(body.wx || "").slice(0, 40);      // e.g. "clear-92"
    const tb = String(body.tb || "").slice(0, 20);       // e.g. "sat-evening"
    const city = String(body.city || "").slice(0, 60);
    const cands = body.candidates.slice(0, 12)
      .map((p) => ({ id: String((p && p.id) || "").slice(0, 80), name: String((p && p.name) || "").slice(0, 90), type: String((p && p.type) || "").slice(0, 40), rating: (p && p.rating) ?? null, reviews: (p && p.reviews) ?? 0, distMi: (p && p.distMi) != null ? Math.round(p.distMi * 10) / 10 : null, openNow: !(p && p.openNow === false), price: String((p && p.price) || "").slice(0, 8) }))
      .filter((p) => p.id && p.name);
    // A genuine "not enough candidates to reason over" is a 200 no-match with
    // a reason envelope, distinct from the 400s above.
    if (cands.length < 3) {
      try { console.log(JSON.stringify({ tag: "moment_picks_zero", intent, candidatesReceived: cands.length, reason: "too_few_candidates" })); } catch (e) {}
      return Response.json({ picks: [], reason: "too_few_candidates", candidatesReceived: cands.length });
    }
    const ck = "mp1|" + intent + "|" + tb + "|" + wx + "|" + _nn(cands.map((c) => c.id).join("")).slice(0, 40);
    const hit = await cacheGet(ck);
    if (hit) return Response.json({ picks: hit, cached: true });
    const system =
      "You are Wayfind's moment concierge. From the candidate places (ALL already quality-filtered and open unless marked), choose the 3 to 5 that best fit the user's intent for THIS exact moment, best first, and write one 'why right now' line each (max 16 words), grounded ONLY in the provided fields and context — the time, the weather, the distance, the rating evidence, the type. " +
      "HARD RULES: never invent dishes, events, crowds, waits, views, or any specific not present in the data. Never pick a place marked openNow:false. Warm, specific, decisive — a sharp local friend. " +
      'Return ONLY valid JSON: {"picks":[{"id":"...","why":"..."}]}';
    const out = await claudeJson(system, JSON.stringify({ intent, context: { weather: wx, time: tb, city }, candidates: cands }), 600);
    await logLlmCall("moment");
    const valid = out && Array.isArray(out.picks) ? out.picks.filter((x) => x && x.id && typeof x.why === "string" && cands.some((c) => c.id === x.id && c.openNow)).slice(0, 5).map((x) => ({ id: x.id, why: x.why.trim().slice(0, 140) })) : [];
    if (valid.length >= 3) { await cacheSet(ck, valid); return Response.json({ picks: valid }); }
    try { console.log(JSON.stringify({ tag: "moment_picks_zero", intent, candidatesReceived: cands.length, reason: "model_no_pick" })); } catch (e) {}
    return Response.json({ picks: [], reason: "no_match", candidatesReceived: cands.length });
  } catch (e) {
    // A model/upstream failure is a 200 no-match (the client still shows the
    // structured list) -- but distinguished by reason so telemetry sees it.
    try { console.log(JSON.stringify({ tag: "moment_picks_zero", intent, reason: "exception", error: String((e && e.message) || e).slice(0, 120) })); } catch (e2) {}
    return Response.json({ picks: [], reason: "error" });
  }
}
