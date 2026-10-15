#!/usr/bin/env node
/**
 * guide-visual-monitor — "can readers SEE the places we recommend?" on a clock.
 * Scheduled by .github/workflows/guide-visual-monitor.yml (every 6 hours).
 *
 * WHY. 142 guide picks and 394 blog picks went text-only on 2026-10-08 (#1697
 * removed cached Google photos) and nobody noticed for a week, because nothing
 * was broken: no 500, no failing guard, no broken-image icon. Only a reader
 * scrolling the page could see it. This reads the LIVE pages the way a reader
 * gets them and sorts every recommendation into the owner's three states:
 *
 *   A  photo exists and renders (server <img> that loads, with its "Photo:" credit,
 *      or the live credited rung for a place Google has photos of)
 *   B  photo exists but Wayfind fails to show it  -> ENGINEERING FAILURE
 *      (image URL does not load, image shown with no credit, a pick the code
 *       says is photographed renders with no photo and no live rung)
 *   C  no verified/licensed image is available (documented exception or a
 *      place Google has no photo for) -> sourcing backlog, never an alarm
 *
 * READ ONLY, NO SPEND: page GETs, image HEADs and Supabase REST reads. It never
 * calls /api/photo, so it can never take a photos grant.
 *
 * PULSE CONTRACT (lib/jobPulse.js): succeeded = 0 when B > 0, so two
 * consecutive runs with an engineering failure become a job-watch incident
 * (email). C never pages. A non-zero EXIT means the instrument could not run.
 *
 *   node scripts/guide-visual-monitor.mjs [--base-url https://www.gowayfind.com] [--blog-url https://blog.gowayfind.com] [--json out.json] [--no-pulse]
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDES } from "../lib/guides.js";
import { recordPulse } from "../lib/jobPulse.js";
import { parseGuidePicks, parseDedicatedGuide, parseBlogItems, classify } from "../lib/guideVisualMonitor.js";
export { parseGuidePicks, parseBlogItems, classify };

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : d; };
const BASE = opt("--base-url", "https://www.gowayfind.com").replace(/\/+$/, "");
const BLOG = opt("--blog-url", "https://blog.gowayfind.com").replace(/\/+$/, "");
const UA = "WayfindGuideVisualMonitor/1.0 (+https://gowayfind.com/about)";
const SB_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, { method = "GET", tries = 2 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { method, headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20000) });
      if (r.status < 500 || i === tries - 1) return r;
    } catch (e) { if (i === tries - 1) return { ok: false, status: 0, error: String(e).slice(0, 80) }; }
    await sleep(1500);
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

async function googleRefs(placeIds) {
  const ids = [...new Set(placeIds.filter(Boolean))];
  const have = new Map();
  if (!SB_URL || !SB_KEY || !ids.length) return have;
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    try {
      const r = await fetch(`${SB_URL}/rest/v1/wf_inventory?select=place_id,photo_ref&place_id=in.(${chunk.map(encodeURIComponent).join(",")})`, { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY }, signal: AbortSignal.timeout(15000) });
      if (r.ok) for (const row of await r.json()) have.set(row.place_id, !!row.photo_ref);
    } catch {}
  }
  return have;
}

async function main() {
  const { classifyPick } = await import("./check-guide-visual-completeness.mjs");
  const { GUIDE_PICK_PHOTOS } = await import("../lib/guidePickPhotoManifest.js");
  const { buildPlacePhotoIndex } = await import("../lib/guidePickPhotos.js");
  const { guideContextPhoto } = await import("../lib/guideContextPhotos.js");
  const contextFor = (slug, pick, guide) => guideContextPhoto(slug, pick, guide, { usedSrc: new Set() });
  const placeIndex = buildPlacePhotoIndex(GUIDE_PICK_PHOTOS);
  const guides = Array.isArray(GUIDES) ? GUIDES : Object.entries(GUIDES).map(([slug, g]) => ({ slug, ...g }));
  const gapsFor = (slug) => { const f = path.join(ROOT, "data/guide-pick-photos", slug + ".json"); return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).gaps || {} : {}; };

  const pages = await pool(guides, 4, async (g) => {
    const r = await get(`${BASE}/guides/${g.slug}`);
    return { g, status: r?.status || 0, html: r?.ok ? await r.text() : "" };
  });
  const loadErrors = pages.filter((p) => !p.html).map((p) => `${p.g.slug} HTTP ${p.status}`);
  if (loadErrors.length > guides.length / 2) throw new Error("most guide pages failed to load: " + loadErrors.slice(0, 5).join(", "));

  // Blog posts (separate site). Listing needs the database; skip the blog section without it.
  let posts = [];
  if (SB_URL && SB_KEY) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/wf_blog_posts?select=slug&order=published_at.desc&limit=500`, { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } });
      if (r.ok) posts = await r.json();
    } catch {}
  }
  const blogPages = await pool(posts, 4, async (p) => { const r = await get(`${BLOG}/${p.slug}`); return { slug: p.slug, status: r?.status || 0, html: r?.ok ? await r.text() : "" }; });
  for (const b of blogPages) if (!b.html) loadErrors.push(`blog/${b.slug} HTTP ${b.status}`);

  // Parse everything first, then check each unique image URL once.
  const guideRows = [];
  for (const { g, html } of pages) {
    if (!html) continue;
    const dedicated = parseDedicatedGuide(html);
    if (dedicated) { guideRows.push({ surface: "guide", page: g.slug, placeId: null, ...dedicated, expectPhoto: true, documented: false }); continue; }
    const parsed = parseGuidePicks(html);
    const gaps = gapsFor(g.slug);
    (g.picks || []).forEach((pick, i) => {
      const p = parsed.find((x) => x.n === i + 1) || { imgs: [], credited: false, live: false };
      const { cls } = classifyPick(g.slug, pick, { manifest: GUIDE_PICK_PHOTOS, placeIndex, contextFor, guide: g });
      // curated, reused and labelled context photos are all server rendered,
      // so a pick that shows none of them is an engineering failure (B).
      guideRows.push({ surface: "guide", page: g.slug, name: pick.name, placeId: pick.placeId || null, ...p, expectPhoto: cls !== "missing", documented: !!gaps[pick.name] });
    });
  }
  const blogRows = [];
  for (const b of blogPages) if (b.html) for (const it of parseBlogItems(b.html)) blogRows.push({ surface: "blog", page: b.slug, ...it, expectPhoto: false, documented: false });
  const rows = [...guideRows, ...blogRows];
  const abs = (s) => (/^https?:\/\//.test(s) ? s : (s.startsWith("/") ? BASE + s : null));
  const urls = [...new Set(rows.flatMap((r) => r.imgs.map((s) => (r.surface === "blog" && s.startsWith("/") ? BLOG + s : abs(s)))).filter(Boolean))];
  const okMap = new Map();
  await pool(urls, 6, async (u) => {
    let r = await get(u, { method: "HEAD" });
    if (!r?.ok || !/^image\//.test(r.headers?.get?.("content-type") || "")) r = await get(u);
    okMap.set(u, !!(r?.ok && /^image\//.test(r.headers?.get?.("content-type") || "")));
  });
  const refs = await googleRefs(rows.filter((r) => r.live && r.placeId).map((r) => r.placeId));
  const tally = { A: 0, "A-context": 0, "A-live": 0, B: 0, C: 0 };
  const failures = [];
  const backlog = [];
  for (const r of rows) {
    const imgOk = r.imgs.every((s) => okMap.get(r.surface === "blog" && s.startsWith("/") ? BLOG + s : abs(s)) !== false);
    const [state, why] = classify({ ...r, imgOk, hasGoogleRef: r.placeId && refs.has(r.placeId) ? refs.get(r.placeId) : undefined });
    tally[state]++;
    if (state === "B") failures.push(`${r.surface}/${r.page} :: ${r.name} :: ${why}`);
    if (state === "C") backlog.push(`${r.surface}/${r.page} :: ${r.name} :: ${why}`);
  }
  const report = { checkedAt: new Date().toISOString(), base: BASE, blog: BLOG, guides: pages.length, blogPosts: blogPages.length, recommendations: rows.length, tally, engineeringFailures: failures, sourcingBacklog: backlog, pageLoadErrors: loadErrors };
  const out = opt("--json", null);
  if (out) writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`guide-visual-monitor: ${rows.length} recommendations on ${pages.length} guides + ${blogPages.length} blog posts | A ${tally.A} | A-context ${tally["A-context"]} | A-live ${tally["A-live"]} | B ${tally.B} | C ${tally.C} | page errors ${loadErrors.length}`);
  for (const f of failures.slice(0, 40)) console.log("  B  " + f);
  for (const e of loadErrors.slice(0, 10)) console.log("  !  " + e);
  if (!argv.includes("--no-pulse")) {
    const bad = failures.length + loadErrors.length;
    await recordPulse("guide-visual-monitor", {
      attempted: rows.length,
      succeeded: bad ? 0 : tally.A + tally["A-context"] + tally["A-live"],
      note: (`visual: A=${tally.A} ctx=${tally["A-context"]} live=${tally["A-live"]} B=${tally.B} C=${tally.C} pageErr=${loadErrors.length}` + (failures[0] ? ` | first B: ${failures[0]}` : "")).slice(0, 200),
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error("guide-visual-monitor: instrument failed:", e && e.message); process.exit(1); });
}
