// v5.22 — Insider Content Engine (server-only). Generates each place's
// insider card ONCE with Claude Haiku, stores it in the shared Supabase
// cache for 30 days, and serves from cache forever after — the LLM is never
// in the critical path of browsing (cache miss = one background generation;
// every later view is a cache read). Used by /api/insider (detail sheets)
// and by the SSR landing pages at ISR time, so the same content doubles as
// indexable SEO.
//
// HONESTY CONTRACT (same house rule as blurbs/insight): the model may only
// state things it reliably knows about THIS specific, often-famous place, or
// general-but-true guidance derived from the place's type and stats. It is
// hard-forbidden from inventing named dishes, staff, rooms, prices, events,
// or history. Fail-soft everywhere: any failure returns null and the UI
// simply doesn't render the card.
const getKey = () => ((process.env["ANTHROPIC_API_KEY"] || process.env["LLM_API_KEY"] || "").trim());

const mem = new Map();
const TTL = 30 * 24 * 3600 * 1000;

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

// Approximate cost visibility: every real model call logs an events row.
export async function logLlmCall(route) {
  const s = sb();
  if (!s) return;
  try {
    await fetch(`${s.url}/rest/v1/events`, { method: "POST", headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "llm_call", place_id: null, place_name: null, device_id: "server", user_id: null, meta: { route } }) });
  } catch (e) {}
}

export async function claudeJson(system, user, maxTokens) {
  const key = getKey();
  if (!key) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: maxTokens || 500, system, messages: [{ role: "user", content: user }] }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    let text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    text = text.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    try { return JSON.parse(text); } catch { return null; }
  } catch (e) { return null; } finally { clearTimeout(timer); }
}

const _nn = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// One insider card per place, cache-first. `p` = { id, name, city, type,
// rating, reviews, price }. Returns { tip, bestTime, dontMiss, funFact,
// special } or null.
export async function getInsider(p) {
  if (!p || !p.name) return null;
  const ck = "ins1|" + (_nn(p.id) || _nn(p.name) + "|" + _nn(p.city));
  const hit = await cacheGet(ck);
  if (hit) return hit.none ? null : hit;
  const system =
    "You write the 'insider intel' card for Wayfind, a local discovery app whose brand is HONESTY. For the ONE place provided, return ONLY valid JSON (no markdown) with keys: " +
    'tip (what a local regular would tell a friend, max 20 words), bestTime (the smartest time/day to go and why, max 16 words), dontMiss (for food: what kind of thing to order; for attractions: the highlight; max 16 words), funFact (a true, interesting angle, max 20 words), special (one line on what makes it different, max 14 words). ' +
    "HARD RULES: If you reliably know this specific place, use that knowledge. If you do NOT, write genuinely useful general-but-true guidance from its type, rating, review count, and price — and NEVER invent named dishes, menu items, staff names, room names, prices, events, awards, or history. Never use empty hype words. If you cannot write an honest funFact, set it to null rather than inventing one. Sound like a sharp local friend.";
  const out = await claudeJson(system, JSON.stringify({ name: p.name, city: p.city || "", type: p.type || "", rating: p.rating ?? null, reviews: p.reviews ?? 0, price: p.price || "" }), 450);
  await logLlmCall("insider");
  if (!out || typeof out !== "object" || (!out.tip && !out.special)) { await cacheSet(ck, { none: true }); return null; }
  const clean = {};
  for (const k of ["tip", "bestTime", "dontMiss", "funFact", "special"]) { const v = out[k]; if (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null") clean[k] = v.trim().slice(0, 200); }
  if (!Object.keys(clean).length) { await cacheSet(ck, { none: true }); return null; }
  await cacheSet(ck, clean);
  return clean;
}
