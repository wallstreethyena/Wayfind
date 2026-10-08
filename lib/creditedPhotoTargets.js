// lib/creditedPhotoTargets.js — WHICH venues the credited-photo warm refreshes.
//
// PURE except loadBlogTargets(), which only READS (Supabase REST, no Google).
// The target list is deterministic: same posts + same inventory + same guide
// data = the same sorted place ids, so a dry run and a real run agree.
//
//   1. BLOG venues: every pick of every published wf_blog_posts row, resolved
//      by the BLOG's own identity rule (blog.gowayfind.com lib/photos.js,
//      copied here on purpose, keep them in sync): exact normName match in a
//      wf_inventory row inside the post's metro circle, and exactly ONE spot
//      (rows within 300 m of each other are one venue). A chain / shared name
//      (more than one spot) is skipped: the blog fails closed on it, and
//      warming every spot would only make it ambiguous. One place id per spot
//      (the inventory row with the most reviews).
//   2. GUIDE venues: every guide pick that carries a placeId AND is allowed to
//      resolve a place card (guidePickMayResolvePlaceCard), plus the curated
//      place-rail items (lib/guidePlaceRails.js). Exact ids, no name guessing.
//
// NEVER CALLS GOOGLE.

export const PLACE_ID_RX = /^[A-Za-z0-9_-]{16,200}$/;

// Metro circles. Inventory's metro label is unreliable, identity is by distance.
export const METRO_AREAS = {
  "manatee-sarasota": { lat: 27.34, lng: -82.53, km: 60 },
  tampa: { lat: 27.95, lng: -82.55, km: 70 },
  orlando: { lat: 28.5, lng: -81.3, km: 85 },
};

export function normName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

export function km(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// In-metro, non-excluded rows whose name is this pick, grouped into spots.
export function venueClusters(name, metro, rows) {
  const area = METRO_AREAS[metro];
  const key = normName(name);
  if (!area || !key) return [];
  const hits = (rows || []).filter(
    (r) => !r.excluded && normName(r.name) === key && Number.isFinite(r.lat) && Number.isFinite(r.lng) && km(area, r) <= area.km
  );
  const clusters = [];
  for (const r of hits) {
    const c = clusters.find((cl) => km(cl[0], r) <= 0.3);
    if (c) c.push(r);
    else clusters.push([r]);
  }
  return clusters;
}

// One place id for a spot: most reviews, then the smallest id (deterministic).
export function spotRepresentative(cluster) {
  const ok = (cluster || []).filter((r) => PLACE_ID_RX.test(r.place_id || ""));
  ok.sort((a, b) => (Number(b.rv) || 0) - (Number(a.rv) || 0) || (a.place_id < b.place_id ? -1 : 1));
  return ok[0] ? ok[0].place_id : null;
}

// posts: [{slug, metro, items:[{name}]}], rows: wf_inventory rows.
export function blogTargets(posts, rows) {
  const ids = new Map(); // placeId -> { name, slugs:Set }
  let picks = 0, resolved = 0, ambiguous = 0, notInInventory = 0;
  for (const post of posts || []) {
    for (const it of Array.isArray(post.items) ? post.items : []) {
      if (!it || !it.name) continue;
      picks++;
      const clusters = venueClusters(it.name, post.metro, rows);
      if (!clusters.length) { notInInventory++; continue; }
      if (clusters.length > 1) { ambiguous++; continue; }
      const id = spotRepresentative(clusters[0]);
      if (!id) { notInInventory++; continue; }
      resolved++;
      const cur = ids.get(id) || { name: it.name, slugs: new Set() };
      cur.slugs.add(post.slug);
      ids.set(id, cur);
    }
  }
  return { ids, stats: { picks, resolved, ambiguous, notInInventory, distinct: ids.size } };
}

// guides: the GUIDES map; rails: GUIDE_PLACE_RAILS; mayResolve: guidePickMayResolvePlaceCard.
export function guideTargets(guides, rails, mayResolve) {
  const ids = new Map();
  const add = (id, name, slug) => {
    if (!PLACE_ID_RX.test(String(id || ""))) return;
    const cur = ids.get(id) || { name, slugs: new Set() };
    cur.slugs.add(slug);
    ids.set(id, cur);
  };
  let picks = 0, withId = 0, blocked = 0;
  for (const [slug, g] of Object.entries(guides || {})) {
    for (const p of Array.isArray(g.picks) ? g.picks : []) {
      picks++;
      if (!p || !p.placeId) continue;
      withId++;
      if (typeof mayResolve === "function" && !mayResolve(p)) { blocked++; continue; }
      add(p.placeId, p.name, slug);
    }
  }
  for (const [slug, rail] of Object.entries(rails || {})) {
    for (const m of Array.isArray(rail.markets) ? rail.markets : []) {
      for (const it of Array.isArray(m.items) ? m.items : []) add(it.placeId, it.name, slug);
    }
  }
  return { ids, stats: { picks, withId, blocked, distinct: ids.size } };
}

// Merge into one sorted, de-duplicated list.
export function mergeTargets(blog, guide) {
  const all = new Map();
  for (const [src, m] of [["blog", blog], ["guide", guide]]) {
    for (const [id, v] of m) {
      const cur = all.get(id) || { placeId: id, name: v.name, sources: new Set() };
      cur.sources.add(src);
      all.set(id, cur);
    }
  }
  return [...all.values()]
    .map((t) => ({ placeId: t.placeId, name: t.name, sources: [...t.sources].sort() }))
    .sort((a, b) => (a.placeId < b.placeId ? -1 : 1));
}

// VIEWED FIRST (owner, 2026-10-08: "prioritize missing photos on places people
// actually view"). The worker walks targets in order and stops at its per-run cap,
// Google's daily quota or the month ceiling, so ORDER decides who gets a photo when
// the budget cannot cover everyone. `views` maps placeId -> how many times a REAL
// reader recently failed to see this place's photo (wf_photo_repair_queue.detections;
// probe and automated traffic never write that table). Most-viewed first; ties and
// never-viewed places keep the existing deterministic placeId order. Pure.
export function viewedFirst(targets, views) {
  const v = (id) => Number((views && views.get && views.get(id)) || 0);
  return [...targets].sort((a, b) => (v(b.placeId) - v(a.placeId)) || (a.placeId < b.placeId ? -1 : a.placeId > b.placeId ? 1 : 0));
}

// BUDGET-AWARE SCOPE (owner, 2026-10-08: "if the forecast indicates early
// exhaustion, safely pause or reduce optional backfill and prioritize the most
// viewed places"). The backfill and everyday visitors draw on the SAME monthly
// photos ceiling. Before each run: if what is left this month does not cover the
// everyday reserve (EVERYDAY_PHOTOS_PER_DAY x days left in the month), the
// backfill shrinks to places a real reader recently failed to see. Places nobody
// is looking at wait; the moment a reader opens one, its miss lands in
// wf_photo_repair_queue and it becomes eligible, and when a month has headroom
// above the reserve the full list runs again. Unknown ledger = viewed-only (fail
// safe). Never raises a cap and never adds work: it only removes targets.
// 125/day = observed paid photo grants for real visitors on the uncapped days
// Oct 4-6 2026 (136/132/148 total, about 20/day of it Meta's crawler).
export const EVERYDAY_PHOTOS_PER_DAY = 125;
export function backfillScope({ used, cap, now = Date.now(), perDay = EVERYDAY_PHOTOS_PER_DAY } = {}) {
  const d = new Date(now);
  const monthEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const daysLeft = Math.max(0, (monthEnd - d.getTime()) / 86400000);
  const reserve = Math.ceil(daysLeft * perDay);
  const u = used == null || used === "" ? NaN : Number(used), c = cap == null || cap === "" ? NaN : Number(cap);
  if (!Number.isFinite(u) || !Number.isFinite(c) || c <= 0 || u < 0) return { viewedOnly: true, headroom: null, reserve, daysLeft };
  const headroom = Math.max(0, c - u);
  return { viewedOnly: headroom <= reserve, headroom, reserve, daysLeft };
}

// READ-ONLY. This month's `photos` ledger usage, or null when unreadable.
export async function loadPhotosUsed({ url, key, fetchImpl = fetch, now = Date.now() }) {
  const month = new Date(now).toISOString().slice(0, 7);
  const r = await fetchImpl(`${url}/rest/v1/wf_spend_ledger?select=used&month=eq.${month}&sku=eq.photos`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!r.ok) return null;
  const rows = await r.json();
  if (!Array.isArray(rows)) return null;
  return rows.length ? Number(rows[0].used) : 0;
}

// READ-ONLY. Recent reader-miss counts for these place ids (last 30 days).
export async function loadReaderViews(placeIds, { url, key, fetchImpl = fetch, now = Date.now() }) {
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const since = new Date(now - 30 * 86400000).toISOString();
  const out = new Map();
  const ids = [...new Set(placeIds)].filter((id) => PLACE_ID_RX.test(id));
  for (let i = 0; i < ids.length; i += 80) {
    const list = ids.slice(i, i + 80).join(",");
    const r = await fetchImpl(`${url}/rest/v1/wf_photo_repair_queue?select=place_id,detections&place_id=in.(${list})&last_seen_at=gte.${encodeURIComponent(since)}`, { headers, cache: "no-store" });
    if (!r.ok) throw new Error("supabase " + r.status + " wf_photo_repair_queue");
    for (const row of await r.json()) out.set(row.place_id, (out.get(row.place_id) || 0) + (Number(row.detections) || 0));
  }
  return out;
}

// Same candidate-fetch idea as the blog: a broad ilike fetch, identity decided
// afterwards by the exact normName match above.
export function namePattern(n) {
  const raw = String(n || "").normalize("NFC");
  const words = raw.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!words.length) return "";
  const lead = /^[A-Za-z0-9]/.test(raw) ? "" : "*";
  const trail = /[A-Za-z0-9]$/.test(raw) ? "" : "*";
  return lead + words.join("*") + trail;
}

// READ-ONLY. env: { url, key } (service role in the route, publishable in the CLI).
export async function loadBlogTargets({ url, key, fetchImpl = fetch, now = Date.now() }) {
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async (path) => {
    const r = await fetchImpl(`${url}/rest/v1/${path}`, { headers, cache: "no-store" });
    if (!r.ok) throw new Error("supabase " + r.status + " " + path.split("?")[0]);
    return r.json();
  };
  const posts = await get(`wf_blog_posts?select=slug,metro,items&published_at=lte.${encodeURIComponent(new Date(now).toISOString())}&limit=500`);
  const names = [...new Set(posts.flatMap((p) => (Array.isArray(p.items) ? p.items : []).map((i) => i && i.name).filter(Boolean)))];
  const pats = [...new Set(names.map(namePattern))].filter(Boolean);
  const rows = [];
  for (let i = 0; i < pats.length; i += 20) {
    const or = pats.slice(i, i + 20).map((p) => `name.ilike.${p}`).join(",");
    rows.push(...(await get(`wf_inventory?select=place_id,name,lat,lng,excluded,rv:signals->>reviews&or=(${encodeURIComponent(or)})&limit=1000`)));
  }
  return { posts, rows, ...blogTargets(posts, rows) };
}
