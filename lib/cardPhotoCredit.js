// lib/cardPhotoCredit.js — SERVER-ONLY. Which Google photo may a place card show,
// and whose credit goes with it? (owner, 2026-10-08)
//
// WHY. Google's Places policy: "You must always credit the author when displaying
// photos", and the credit must be "clearly associated with the author's photo".
// A credit that an API can return is not enough; the visitor has to see it next to
// the exact image. City cards showed Google photos with no credit at all.
//
// WHAT THIS DOES. For each card it finds a cached Google photo of THAT place whose
// stored credit belongs to THAT exact image, and returns the photo name to show plus
// the credit. "Exact image" is decided by identity, never by place or by
// photographer: a credit row is keyed by a Google photo name, and it is paired with
// a card only when that name's cache row serves the very same image URI the card
// will display. Two photos of one venue are never interchangeable.
//
//   1. the card's own photo, when its served image has an exact credit;
//   2. otherwise another already-cached photo of the same place that does
//      (the card then shows that photo instead, so image and credit agree).
//   3. otherwise null: the caller shows a licensed photo with its licence
//      credit, or a clean placeholder. Never an uncredited Google photo.
//
// ZERO SPEND, NO NEW STORAGE. Two read-only Supabase queries against rows that
// already exist (the same tables app/api/photo-credits reads). No Google call, no
// write, no TTL touched. It never fetches a photo to make a card look complete.
//
// FAIL CLOSED. Any read failure returns an empty map, so every card falls back to a
// licensed photo or a placeholder rather than an uncredited Google photo.
import { PHOTO_REF_RX, photoCacheKey } from "./placePhotoServe.js";

const PLACE_RX = /^[A-Za-z0-9_-]{10,200}$/;
const CACHE_WIDTH = 640;
// Google photo names are ~400 chars; 15 per `in.(...)` keeps each URL near 6 KB
// (the limit app/api/photo-credits learned on 2026-09-24).
const NAME_BATCH = 15;
const TIMEOUT_MS = 2500;

function sbEnv(env) {
  const raw = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw) : "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

const uriOf = (v) => {
  if (!v) return null;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  const u = v && (v.uri || v.url);
  return typeof u === "string" && /^https:\/\//.test(u) ? u : null;
};

/** The photo name a card would request for this place (its stored ref), or null. */
export function cardPhotoRef(place) {
  const r = place && (place.photoRef || place.photo_ref);
  return typeof r === "string" && PHOTO_REF_RX.test(r) ? r : null;
}

/**
 * Pure pairing step (unit-tested directly). `cacheRows` are wf_places_cache rows
 * {k, v}; `credits` are live wf_photo_credit rows. Returns Map(placeId -> {ref,
 * author, href}). Exported so the guard can prove the exact-image rule without a
 * network.
 */
export function pairCardCredits(places, cacheRows, credits) {
  const asked = new Map();
  for (const p of places || []) if (p && PLACE_RX.test(String(p.id || ""))) asked.set(String(p.id), p);
  // name -> served uri, only for rows of a place we asked about (exact id, not LIKE).
  const nameUri = new Map();
  for (const row of cacheRows || []) {
    const m = /^photo\|(places\/([A-Za-z0-9_-]+)\/photos\/[A-Za-z0-9_-]+)\|640$/.exec(String(row && row.k || ""));
    if (!m || !asked.has(m[2])) continue;
    const u = uriOf(row.v);
    if (u) nameUri.set(m[1], u);
  }
  // uri -> credited name for that uri (same place only).
  const creditByName = new Map();
  for (const c of credits || []) {
    if (!c || typeof c.photo_name !== "string") continue;
    const pid = c.photo_name.split("/")[1];
    if (pid !== c.place_id || !asked.has(pid)) continue; // a credit never crosses places
    if (!String(c.author_name || "").trim()) continue;    // no name, no credit
    creditByName.set(c.photo_name, c);
  }
  const out = new Map();
  for (const [id, p] of asked) {
    const own = cardPhotoRef(p);
    const ownUri = own ? nameUri.get(own) : null;
    let pick = null;
    // 1. the card's own image, credited by whichever name serves exactly that uri
    if (ownUri) {
      for (const [name, c] of creditByName) {
        if (name.split("/")[1] === id && nameUri.get(name) === ownUri) { pick = { ref: own, c }; break; }
      }
    }
    // 2. another cached photo of this same place that carries its own credit
    if (!pick) {
      for (const [name, c] of creditByName) {
        if (name.split("/")[1] === id && nameUri.get(name)) { pick = { ref: name, c }; break; }
      }
    }
    if (pick) {
      out.set(id, {
        ref: pick.ref,
        author: String(pick.c.author_name).trim(),
        href: typeof pick.c.author_uri === "string" && /^https:\/\//.test(pick.c.author_uri) ? pick.c.author_uri : null,
      });
    }
  }
  return out;
}

async function rest(s, path, fetchImpl) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetchImpl(`${s.url}/rest/v1/${path}`, { headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store", signal: ctrl.signal });
    if (!r.ok) throw new Error("supabase " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/**
 * Map(placeId -> { ref, author, href }) for the places whose card may show a
 * credited Google photo. Never throws; any failure is an empty map (fail closed).
 */
export async function resolveCardPhotoCredits(places, deps = {}) {
  try {
    const list = (Array.isArray(places) ? places : []).filter((p) => p && PLACE_RX.test(String(p.id || "")));
    if (!list.length) return new Map();
    const s = sbEnv(deps.env || process.env);
    if (!s) return new Map();
    const fetchImpl = deps.fetchImpl || fetch;
    const nowIso = encodeURIComponent((deps.now ? new Date(deps.now) : new Date()).toISOString());
    const likes = list.map((p) => `k.like."${photoCacheKey(`places/${p.id}/photos/*`, CACHE_WIDTH)}"`).join(",");
    const cacheRows = await rest(s, `wf_places_cache?select=k,v&or=(${encodeURIComponent(likes)})&exp=gt.${nowIso}&limit=2000`, fetchImpl);
    const names = [...new Set((cacheRows || []).map((r) => (/^photo\|(places\/[^|]+)\|640$/.exec(String(r && r.k || "")) || [])[1]).filter(Boolean))];
    const credits = [];
    for (let i = 0; i < names.length; i += NAME_BATCH) {
      const inList = names.slice(i, i + NAME_BATCH).map((n) => `"${n}"`).join(",");
      credits.push(...(await rest(s, `wf_photo_credit?select=photo_name,place_id,author_name,author_uri&photo_name=in.(${encodeURIComponent(inList)})&expires_at=gt.${nowIso}`, fetchImpl)));
    }
    return pairCardCredits(list, cacheRows, credits);
  } catch {
    return new Map();
  }
}
