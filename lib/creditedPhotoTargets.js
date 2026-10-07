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
