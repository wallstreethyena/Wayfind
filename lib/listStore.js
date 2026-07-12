// Immutable per-snapshot store for generated lists (v5.71). THE SNAPSHOT RULE:
// an image someone already shared must never change. A list is identified by a
// slug; every snapshot is keyed by (slug, v) where v = generated_at epoch
// seconds, and is never rewritten. getLatestSnapshot() returns the current live
// list; getSnapshot(slug, v) returns the exact frozen one a share points at.
//
// Backed by the Supabase `wf_lists` table (see supabase/lists.sql). Fail-soft
// everywhere: no Supabase or any error returns null, and callers degrade (the
// image serves the branded sample, the /l page falls back to the app redirect).
const mem = new Map(); // "slug|v" -> snapshot ; "latest|slug" -> snapshot

function sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:/i, "https:") : "https://" + raw) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

// A url-safe, human-legible slug. "Sarasota" + "Hot Dogs" -> "sarasota-hot-dogs".
export function slugify(s) {
  return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
export function listSlug(city, listTypeLabel) {
  return [slugify(city), slugify(listTypeLabel)].filter(Boolean).join("-");
}
// v = generated_at epoch SECONDS (matches the brief's ?v=1752268440 form).
export function versionOf(generatedAt) {
  const t = Date.parse(generatedAt);
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}
// A shown card is stale when the live list has re-ranked to a newer version.
export function isStale(shownV, latestV) {
  const s = Number(shownV), l = Number(latestV);
  return Number.isFinite(s) && s > 0 && Number.isFinite(l) && l > s;
}

// Freeze a validated list + its card payload into an immutable snapshot.
export function buildSnapshot({ slug, city, list_type, list, card }) {
  const v = versionOf(list && list.generated_at);
  return { slug, v, generated_at: (list && list.generated_at) || null, city: city || "", list_type: list_type || "", card: card || null, list: list || null };
}

async function sbGet(path) {
  const s = sb(); if (!s) return null;
  try {
    const r = await fetch(`${s.url}/rest/v1/${path}`, { headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

// Flatten a stored row (jsonb `data` holds {card, list}) into the same shape
// buildSnapshot produces, so consumers read snap.card / snap.list either way.
function normalizeRow(row) {
  if (!row) return null;
  const d = row.data || {};
  return { slug: row.slug, v: Number(row.v), generated_at: row.generated_at || null, city: row.city || "", list_type: row.list_type || "", card: d.card || null, list: d.list || null };
}

export async function getLatestSnapshot(slug) {
  const sl = slugify(slug); if (!sl) return null;
  const hit = mem.get("latest|" + sl);
  if (hit) return hit;
  const rows = await sbGet(`wf_lists?slug=eq.${encodeURIComponent(sl)}&select=*&order=v.desc&limit=1`);
  const snap = normalizeRow(rows && rows[0]);
  if (snap) mem.set("latest|" + sl, snap);
  return snap;
}

export async function getSnapshot(slug, v) {
  const sl = slugify(slug); const vn = Number(v);
  if (!sl || !Number.isFinite(vn) || vn <= 0) return null;
  const hit = mem.get(sl + "|" + vn);
  if (hit) return hit;
  const rows = await sbGet(`wf_lists?slug=eq.${encodeURIComponent(sl)}&v=eq.${vn}&select=*&limit=1`);
  const snap = normalizeRow(rows && rows[0]);
  if (snap) mem.set(sl + "|" + vn, snap); // immutable — safe to cache forever
  return snap;
}

// Write a snapshot (idempotent on (slug, v)). Refreshes the mem "latest" pointer.
export async function putSnapshot(snap) {
  if (!snap || !snap.slug || !snap.v) return false;
  mem.set(snap.slug + "|" + snap.v, snap);
  const prev = mem.get("latest|" + snap.slug);
  if (!prev || Number(prev.v) <= Number(snap.v)) mem.set("latest|" + snap.slug, snap);
  const s = sb(); if (!s) return false;
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_lists`, {
      method: "POST",
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ slug: snap.slug, v: snap.v, generated_at: snap.generated_at, city: snap.city, list_type: snap.list_type, data: { card: snap.card, list: snap.list } }),
    });
    return r.ok;
  } catch (e) { return false; }
}
