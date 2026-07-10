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

export async function POST(req) {
  try {
    const body = await req.json();
    const intent = String(body.intent || "").slice(0, 30);
    const wx = String(body.wx || "").slice(0, 40);      // e.g. "clear-92"
    const tb = String(body.tb || "").slice(0, 20);       // e.g. "sat-evening"
    const city = String(body.city || "").slice(0, 60);
    const cands = (Array.isArray(body.candidates) ? body.candidates : []).slice(0, 12)
      .map((p) => ({ id: String(p.id || "").slice(0, 80), name: String(p.name || "").slice(0, 90), type: String(p.type || "").slice(0, 40), rating: p.rating ?? null, reviews: p.reviews ?? 0, distMi: p.distMi != null ? Math.round(p.distMi * 10) / 10 : null, openNow: p.openNow !== false, price: String(p.price || "").slice(0, 8) }))
      .filter((p) => p.id && p.name);
    if (!intent || cands.length < 3) return Response.json({ picks: [] });
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
    return Response.json({ picks: [] });
  } catch (e) { return Response.json({ picks: [] }); }
}
