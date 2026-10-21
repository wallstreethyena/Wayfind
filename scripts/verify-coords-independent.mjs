#!/usr/bin/env node
// scripts/verify-coords-independent.mjs — 2026-10-21 GOOGLE-FREE re-verification
// of the 247 coordinates PR #1809 holds behind counsel Q1 (192 Wikidata rows in
// supabase/migrations/20261015180000_*, 55 Census rows in 20261015180100_*).
// Decision logic + rules: scripts/lib/independentVerify.mjs (read its header).
//
// Never calls Google, never connects to the database, never touches the held
// files. Steps:
//   1. node scripts/verify-coords-independent.mjs export > q.sql
//      Run READ-ONLY; save the single json_agg value as JSON (keyed list).
//   2. node scripts/verify-coords-independent.mjs harvest <q.json> <cacheDir> <snapshot.json>
//      Keyless, polite calls only: www.wikidata.org (entities + search),
//      the venues' own websites (robots.txt honoured, 1 request/s per host),
//      geocoding.geo.census.gov (CSV batch endpoint). Every response is cached
//      in <cacheDir> so a re-run is offline.
//   3. node scripts/verify-coords-independent.mjs emit <snapshot.json> <stamp>
//      Writes ONE pending migration for the VERIFIED_INDEPENDENT rows, its
//      reverse in supabase/data-fixes/, and the audit CSV
//      docs/audits/coords-independent-verification-2026-10-21.csv.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  VERIFIED, classifyWikidataRow, classifyCensusRow, bestNameMatch, NAME_MATCH_FLOOR, siteDomain, isGoogleUrl,
  extractAddresses, jsonLdAddresses, htmlToText, pageStatesAddress, parseOneLine, haversineM, agreementLimitM, validLatLng,
  evidenceHasGoogle,
} from "./lib/independentVerify.mjs";
import { forwardSql, reverseSql, OFFICIAL_ADDRESS_SOURCE_TYPES } from "./lib/independentCoords.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const HELD = {
  wikidata: "supabase/migrations/20261015180000_wf_inventory_wikidata_coords.sql",
  census: "supabase/migrations/20261015180100_wf_inventory_official_address_coords_corroborated.sql",
};
export const AUDIT_CSV = "docs/audits/coords-independent-verification-2026-10-21.csv";
const UA = "WayfindBot/1.0 (+https://www.gowayfind.com; hello@gowayfind.com)";

export function parseHeld(rel) {
  const t = readFileSync(path.join(ROOT, rel), "utf8");
  return [...t.matchAll(/^ {2}\('([^']+)', '(.*)'::jsonb\)[,;]?$/gm)].map((m) => ({ place_id: m[1], entry: JSON.parse(m[2].replace(/''/g, "'")) }));
}

// Wayfind-owned names keyed by place_id: Atlas owner sheet + editorial picks.
export function wayfindOwnedNames() {
  const out = new Map();
  const add = (pid, basis, name, ref, extra = {}) => { if (!out.has(pid)) out.set(pid, []); out.get(pid).push({ basis, name, ref, ...extra }); };
  const tsv = readFileSync(path.join(ROOT, "data/atlas/atlas-590.tsv"), "utf8").split(/\r?\n/).slice(1);
  for (const line of tsv) {
    const [, name, address, pid] = line.split("\t");
    if (pid) add(pid.trim(), "atlas-owner-sheet", name, "data/atlas/atlas-590.tsv", { address: /^\d/.test(address || "") ? address : null });
  }
  const files = ["guides.js", "guidesGulfCoast2026.js", "guidesSummer2026.js", "guidesPintosFarm2026.js", "guidesCoverage2026.js", "guidesFallOrlando2026.js", "guidesFoodCities2026.js", "localPicks.js", "chefPicks.js", "culture.js", "summerUniverse.js", "birthdayUniverse.js", "wayfindAwards.js"];
  for (const f of files) {
    const p = path.join(ROOT, "lib", f);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, "utf8");
    for (const m of src.matchAll(/\bname:\s*"([^"]+)"[^{}]{0,600}?\bplaceId:\s*"(ChIJ[\w-]+)"/g)) add(m[2], "editorial-pick", m[1], `lib/${f}`);
    for (const m of src.matchAll(/\bplaceId:\s*"(ChIJ[\w-]+)"[^{}]{0,600}?\bname:\s*"([^"]+)"/g)) add(m[1], "editorial-pick", m[2], `lib/${f}`);
  }
  return out;
}


function exportSql() {
  const ids = [...new Set([...parseHeld(HELD.wikidata), ...parseHeld(HELD.census)].map((r) => r.place_id))];
  // Deliberately NOT selected: wf_inventory.name / lat / lng (Google content).
  console.log(`with ids(place_id) as (select unnest(array[${ids.map((i) => `'${i}'`).join(",")}])),
inv as (select i.place_id, i.source, i.category, i.status, coalesce(i.excluded,false) excluded from public.wf_inventory i join ids using(place_id)),
ev as (select e.place_id, json_agg(json_build_object('event_id',e.event_id,'venue',e.venue,'address',e.address,'city',e.city,'source_type',e.source_type,'source_url',e.source_url,'official_event_url',e.official_event_url) order by e.event_id) evs from public.wf_events e join ids using(place_id) group by 1),
pm as (select place_id, json_agg(json_build_object('op',verified_operator,'url',product_url)) pms from public.wf_place_products_manual join ids using(place_id) group by 1)
select json_agg(json_build_object('p',inv.place_id,'src',inv.source,'cat',inv.category,'st',inv.status,'ex',inv.excluded,'ev',ev.evs,'pm',pm.pms)) from inv left join ev using(place_id) left join pm using(place_id);`);
}

// ── polite cached HTTP ──────────────────────────────────────────────────────
let CACHE = null;
const lastHit = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function cacheFile(key) { return path.join(CACHE, createHash("sha1").update(key).digest("hex") + ".json"); }
async function cachedFetch(url, { method = "GET", body = null, headers = {}, gap = 1000, timeout = 25000, maxBytes = 3_000_000 } = {}) {
  const key = method + " " + url + (body ? " " + createHash("sha1").update(typeof body === "string" ? body : JSON.stringify(body)).digest("hex") : "");
  const f = cacheFile(key);
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  if (isGoogleUrl(url)) throw new Error("refusing a Google URL: " + url);
  let host; try { host = new URL(url).host; } catch { return { status: 0, error: "bad-url", body: "" }; }
  let res = { status: 0, error: null, body: "", finalUrl: url };
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = (lastHit.get(host) || 0) + gap - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());
    try {
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeout);
      const r = await fetch(url, { method, body, headers: { "user-agent": UA, "api-user-agent": UA, accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.5", ...headers }, redirect: "follow", signal: ac.signal });
      let text = await r.text(); clearTimeout(t);
      if (text.length > maxBytes) text = text.slice(0, maxBytes);
      res = { status: r.status, error: null, body: text, finalUrl: r.url };
      if (r.status === 429 || r.status >= 500) { await sleep(3000 * (attempt + 1)); continue; }
      break;
    } catch (e) { res = { status: 0, error: String(e && e.message || e), body: "", finalUrl: url }; await sleep(1500 * (attempt + 1)); }
  }
  if (res.finalUrl && isGoogleUrl(res.finalUrl)) res = { status: 0, error: "redirected-to-google", body: "", finalUrl: res.finalUrl };
  writeFileSync(f, JSON.stringify(res));
  return res;
}

// Minimal robots.txt: groups for our UA token or "*", longest-match Allow/Disallow.
const robotsCache = new Map();
async function robotsAllows(url) {
  let u; try { u = new URL(url); } catch { return false; }
  const origin = u.origin;
  if (!robotsCache.has(origin)) {
    const r = await cachedFetch(origin + "/robots.txt", { gap: 1000 });
    const rules = { mine: [], star: [] };
    if (r.status === 200 && !/<html/i.test(r.body.slice(0, 500))) {
      let groups = [], inRules = false;
      for (const raw of r.body.split(/\r?\n/)) {
        const line = raw.replace(/#.*/, "").trim(); if (!line) continue;
        const [k, ...v] = line.split(":"); const key = k.trim().toLowerCase(), val = v.join(":").trim();
        if (key === "user-agent") { if (inRules) { groups = []; inRules = false; } groups.push(val.toLowerCase()); continue; }
        if (key !== "allow" && key !== "disallow") continue;
        inRules = true;
        for (const g of groups) {
          const tgt = g === "*" ? rules.star : g.includes("wayfindbot") ? rules.mine : null;
          if (tgt) tgt.push({ allow: key === "allow", path: val });
        }
      }
    }
    robotsCache.set(origin, rules.mine.length ? rules.mine : rules.star);
  }
  const rules = robotsCache.get(origin), p = u.pathname + u.search;
  let best = null;
  for (const r of rules) {
    if (!r.path) continue;
    const re = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(p) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

async function fetchPage(url) {
  if (!url || isGoogleUrl(url)) return { ok: false, reason: "google-or-empty" };
  if (!(await robotsAllows(url))) return { ok: false, reason: "robots-disallow" };
  const r = await cachedFetch(url);
  if (r.status !== 200 || !r.body) return { ok: false, reason: r.error || `http-${r.status}` };
  return { ok: true, html: r.body, text: htmlToText(r.body), finalUrl: r.finalUrl };
}

// ── Wikidata ────────────────────────────────────────────────────────────────
async function wikidataEntities(qids) {
  const out = new Map();
  const list = [...new Set(qids)].filter(Boolean);
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    const r = await cachedFetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims%7Clabels%7Caliases&languages=en&ids=${batch.join("%7C")}`, { gap: 1500 });
    let d; try { d = JSON.parse(r.body); } catch { throw new Error("wikidata batch failed " + r.status); }
    for (const q of batch) {
      const e = d.entities && d.entities[q]; if (!e || e.missing != null) { out.set(q, null); continue; }
      const c = e.claims || {};
      const val = (p) => (c[p] || []).filter((s) => s.rank !== "deprecated" && s.mainsnak && s.mainsnak.datavalue).map((s) => ({ v: s.mainsnak.datavalue.value, rank: s.rank }));
      const coords = val("P625").filter((x) => !x.v.globe || x.v.globe === "http://www.wikidata.org/entity/Q2").map((x) => ({ lat: x.v.latitude, lng: x.v.longitude, rank: x.rank }));
      const pref = coords.filter((x) => x.rank === "preferred"); const pool = pref.length ? pref : coords;
      const ambiguous = pool.some((x) => haversineM(x, pool[0]) > 200);
      out.set(q, {
        qid: q, lat: pool.length && !ambiguous ? pool[0].lat : null, lng: pool.length && !ambiguous ? pool[0].lng : null, ambiguous,
        labels: [e.labels && e.labels.en && e.labels.en.value, ...((e.aliases && e.aliases.en) || []).map((a) => a.value)].filter(Boolean),
        website: val("P856").map((x) => x.v).filter((u) => typeof u === "string"),
        street: [...val("P6375").map((x) => x.v && x.v.text), ...val("P969").map((x) => x.v)].filter((s) => typeof s === "string"),
        dissolved: val("P576").length > 0,
      });
    }
  }
  return out;
}
async function wikidataSearch(name) {
  const r = await cachedFetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=7&search=${encodeURIComponent(name)}`, { gap: 1500 });
  try { return (JSON.parse(r.body).search || []).map((s) => s.id); } catch { return []; }
}

// ── Census batch geocoder ───────────────────────────────────────────────────
function csvField(s) { return '"' + String(s || "").replace(/"/g, "'") + '"'; }
function parseCsvLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur); return out;
}
async function censusBatch(addrs) {
  // addrs: Map<id, {street, city, state, zip}> -> Map<id, {lat,lng,matched,tiger}|null>
  const out = new Map();
  const ids = [...addrs.keys()];
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const csv = chunk.map((id) => { const a = addrs.get(id); return [id, csvField(a.street), csvField(a.city), csvField(a.state), csvField(a.zip)].join(","); }).join("\n") + "\n";
    const fd = new FormData();
    fd.append("benchmark", "Public_AR_Current");
    fd.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
    // Direct POST (cached one level up, keyed on the CSV content).
    const resp = await fetch("https://geocoding.geo.census.gov/geocoder/locations/addressbatch", { method: "POST", body: fd, headers: { "user-agent": UA } });
    const body = await resp.text();
    if (resp.status !== 200) throw new Error("census batch failed " + resp.status);
    await sleep(2000);
    for (const line of body.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const f = parseCsvLine(line);
      const id = f[0];
      if (f[2] === "Match" && f[5]) {
        const [lng, lat] = f[5].split(",").map(Number);
        out.set(id, validLatLng(lat, lng) ? { lat, lng, matched: f[4], tiger: f[6] || null, exact: f[3] } : null);
      } else out.set(id, null);
    }
  }
  return out;
}

// Homepage (or the given page) + up to 3 same-host info pages (contact / visit /
// directions / about ...). Returns { docs:[{url,html,text}], pages:[{url,ok,reason}] }.
async function siteDocs(start) {
  const pages = [], docs = [];
  const home = await fetchPage(start);
  pages.push({ url: start, ok: home.ok, reason: home.reason || null });
  if (!home.ok) return { docs, pages };
  const base = home.finalUrl || start;
  docs.push({ url: base, html: home.html, text: home.text });
  const host = new URL(base).host;
  const links = [...home.html.matchAll(/href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,80}?)</gi)]
    .map((m) => { try { return { u: new URL(m[1], base).href, t: m[2] }; } catch { return null; } })
    .filter((x) => x && /^https?:/.test(x.u) && new URL(x.u).host === host && /contact|visit|location|direction|about|plan|hours|find|getting|info|map/i.test(x.u + " " + x.t));
  for (const l of [...new Map(links.map((x) => [x.u, x])).values()].slice(0, 3)) {
    const p = await fetchPage(l.u);
    pages.push({ url: l.u, ok: p.ok, reason: p.reason || null });
    if (p.ok) docs.push({ url: p.finalUrl || l.u, html: p.html, text: p.text });
  }
  return { docs, pages };
}

// ── harvest ─────────────────────────────────────────────────────────────────
async function harvest(dbFile, cacheDir, outFile) {
  CACHE = cacheDir; mkdirSync(CACHE, { recursive: true });
  const verifiedAt = new Date().toISOString();
  const dbRaw = JSON.parse(readFileSync(dbFile, "utf8"));
  const db = new Map((Array.isArray(dbRaw) ? dbRaw : Object.values(dbRaw)).map((d) => [d.p, d]));
  const wdHeld = parseHeld(HELD.wikidata), ceHeld = parseHeld(HELD.census);
  const owned = wayfindOwnedNames();
  const wdQidByPid = new Map(wdHeld.map((r) => [r.place_id, r.entry.ref]));

  // Census rows: Wikidata candidates found by the EDITOR-TYPED venue name.
  const searchQ = new Map();
  for (const r of ceHeld) {
    const ev = ((db.get(r.place_id) || {}).ev || []).find((e) => e.event_id === r.entry.ref) || {};
    const ids = new Set();
    if (ev.venue) for (const q of await wikidataSearch(ev.venue)) ids.add(q);
    if (wdQidByPid.has(r.place_id)) ids.add(wdQidByPid.get(r.place_id));
    searchQ.set(r.place_id, [...ids]);
  }
  const ents = await wikidataEntities([...wdHeld.map((r) => r.entry.ref), ...[...searchQ.values()].flat()]);
  console.error(`wikidata: ${ents.size} entities`);

  // Pages + addresses to geocode.
  const geo = new Map(); // id -> parsed address
  let gid = 0;
  const want = (a) => { const p = a.street ? a : parseOneLine(a.oneline || a); if (!p || !/^\d/.test(p.street)) return null; const id = "a" + (++gid); geo.set(id, p); return id; };

  const wdWork = [];
  for (const r of wdHeld) {
    const d = db.get(r.place_id) || {};
    const wd = ents.get(r.entry.ref) || null;
    const official = [];
    const pages = [];
    // (1) the item's own official website(s) (P856), homepage + up to 3 info pages
    for (const site of (wd && wd.website || []).slice(0, 2)) {
      const sd = await siteDocs(site);
      pages.push(...sd.pages);
      const docs = sd.docs;
      for (const doc of docs) {
        const cands = [...jsonLdAddresses(doc.html), ...extractAddresses(doc.text)];
        for (const s of wd.street || []) if (pageStatesAddress(doc.text, s)) cands.push({ oneline: s, street: null });
        for (const c of cands.slice(0, 15)) {
          const id = want(c.street ? c : (parseOneLine(c.oneline) || { street: c.oneline, city: "", state: "", zip: "" }));
          if (id) official.push({ kind: "official-website", url: doc.url, address: c.oneline, gid: id });
        }
      }
    }
    // (2) editor-linked organiser pages for this place_id (address typed from that page)
    for (const e of d.ev || []) {
      if (!e.address || isGoogleUrl(e.source_url) || /,\s*(USA|United States)\s*$/i.test(e.address) || !OFFICIAL_ADDRESS_SOURCE_TYPES.has(e.source_type)) continue;
      const one = /\b(FL|Florida|[A-Z]{2})\b\s*\d{5}/.test(e.address) ? e.address : [e.address, e.city, "FL"].filter(Boolean).join(", ");
      // Same bar as the Census rows: the organiser page must STILL state it today.
      const pg = await fetchPage(e.source_url);
      pages.push({ url: e.source_url, ok: pg.ok, reason: pg.reason || (pg.ok && !pageStatesAddress(pg.text, e.address) ? "does-not-state-address" : null) });
      if (!pg.ok || !pageStatesAddress(pg.text, e.address)) continue;
      const id = want(parseOneLine(one) || { street: e.address, city: e.city || "", state: "FL", zip: "" });
      if (id) official.push({ kind: "organiser-page-address", url: pg.finalUrl || e.source_url, address: e.address, gid: id, event_id: e.event_id });
    }
    // identity, Wayfind-owned only
    let identity = null;
    const labels = wd ? wd.labels : [];
    for (const e of d.ev || []) {
      const m = bestNameMatch(e.venue, labels);
      const sameSite = wd && wd.website.some((w) => [e.source_url, e.official_event_url].some((u) => u && siteDomain(u) === siteDomain(w)));
      if (m.score >= NAME_MATCH_FLOOR || sameSite) { identity = { basis: "editor-event-link", ref: e.event_id, detail: sameSite ? `organiser page on the item's official site ${siteDomain(e.source_url || e.official_event_url)}` : `editor venue "${e.venue}" ~ "${m.label}" (${m.score.toFixed(2)})` }; break; }
    }
    if (!identity) for (const o of owned.get(r.place_id) || []) {
      const m = bestNameMatch(o.name, labels);
      if (m.score >= NAME_MATCH_FLOOR) { identity = { basis: o.basis, ref: o.ref, detail: `"${o.name}" ~ "${m.label}" (${m.score.toFixed(2)})` }; break; }
    }
    wdWork.push({ place_id: r.place_id, category: d.cat, held: r.entry, wd: wd && !wd.dissolved && validLatLng(wd.lat, wd.lng) ? wd : null, wdRaw: wd, identity, official, pages, src: d.src });
  }

  const ceWork = [];
  for (const r of ceHeld) {
    const d = db.get(r.place_id) || {};
    const evs = d.ev || [];
    const ev = evs.find((e) => e.event_id === r.entry.ref) || { event_id: r.entry.ref, address: r.entry.evidence.address, source_url: r.entry.evidence.source_url, source_type: r.entry.evidence.source_type };
    const pg = await fetchPage(ev.source_url);
    const primary = { url: ev.source_url, fetched: pg.ok, stated: pg.ok && pageStatesAddress(pg.text, ev.address), reason: pg.reason || null, stated_url: null };
    if (primary.stated) primary.stated_url = pg.finalUrl || ev.source_url;
    else {
      // The event page may not repeat the address (JS-rendered, moved, expired):
      // try the same official site's homepage / contact / visit pages, then the
      // official website of a Wikidata item linked by the editor-typed venue.
      const tried = new Set();
      const starts = [];
      try { if (!isGoogleUrl(ev.source_url) && OFFICIAL_ADDRESS_SOURCE_TYPES.has(ev.source_type)) starts.push(new URL(ev.source_url).origin + "/"); } catch { /* bad url */ }
      for (const q of searchQ.get(r.place_id) || []) {
        const w = ents.get(q);
        if (w && bestNameMatch(ev.venue, w.labels).score >= NAME_MATCH_FLOOR) starts.push(...w.website.slice(0, 1));
      }
      for (const st of starts) {
        if (primary.stated || tried.has(siteDomain(st))) continue;
        tried.add(siteDomain(st));
        const sd = await siteDocs(st);
        const hit = sd.docs.find((doc) => pageStatesAddress(doc.text, ev.address));
        primary.fallback = (primary.fallback || []).concat(sd.pages.map((x) => x.url + (x.ok ? "" : " [" + x.reason + "]")));
        if (hit) { primary.stated = true; primary.fetched = true; primary.stated_url = hit.url; }
      }
    }
    const one = /\b(FL|Florida|[A-Z]{2})\b\s*\d{5}/.test(ev.address) ? ev.address : [ev.address, ev.city, "FL"].filter(Boolean).join(", ");
    const gidMain = want(parseOneLine(one) || { street: ev.address, city: ev.city || "", state: "FL", zip: "" });
    // second official page on a DIFFERENT site stating the same address
    const others = [];
    for (const e of evs) for (const u of [e.official_event_url, e.source_url]) {
      if (!u || isGoogleUrl(u) || siteDomain(u) === siteDomain(ev.source_url) || others.some((o) => siteDomain(o) === siteDomain(u))) continue;
      others.push(u);
    }
    const secondPages = [];
    for (const u of others.slice(0, 2)) {
      const p = await fetchPage(u);
      secondPages.push({ url: u, ok: p.ok, stated: p.ok && pageStatesAddress(p.text, ev.address), reason: p.reason || null });
    }
    // Wikidata candidates linked by the editor-typed venue name or the organiser's own site
    const wdCands = [];
    for (const q of searchQ.get(r.place_id) || []) {
      const w = ents.get(q);
      if (!w || w.dissolved || !validLatLng(w.lat, w.lng)) continue;
      const m = bestNameMatch(ev.venue, w.labels);
      const sameSite = w.website.some((x) => siteDomain(x) === siteDomain(ev.source_url));
      if (m.score >= NAME_MATCH_FLOOR || sameSite) wdCands.push({ qid: q, lat: w.lat, lng: w.lng, how: sameSite ? `item official site = organiser site ${siteDomain(ev.source_url)}` : `venue "${ev.venue}" ~ "${m.label}" (${m.score.toFixed(2)})` });
    }
    ceWork.push({ place_id: r.place_id, category: d.cat, held: r.entry, event: ev, primary, gidMain, secondPages, wdCands, src: d.src });
  }

  console.error(`census: geocoding ${geo.size} addresses in batch`);
  const geoRes = await censusBatchCached(geo);

  const rows = [];
  for (const w of wdWork) {
    const official = w.official.map((o) => ({ ...o, census: geoRes.get(o.gid) || null }));
    const c = classifyWikidataRow({ place_id: w.place_id, category: w.category, wd: w.wd, identity: w.identity, official }, verifiedAt);
    rows.push({ ...c, src: w.src, qid: w.held.ref, wd_point: w.wd ? [w.wd.lat, w.wd.lng] : null, wd_labels: w.wdRaw ? w.wdRaw.labels.slice(0, 2) : [], website: w.wdRaw ? w.wdRaw.website : [], pages: w.pages,
      official_found: official.length, official_geocoded: official.filter((o) => o.census).length, identity_detail: w.identity ? w.identity.detail : null });
  }
  for (const w of ceWork) {
    const census = geoRes.get(w.gidMain) || null;
    const second = [];
    // A second page stating the SAME address is not a second coordinate (same
    // geocode); it is recorded in the audit (second_pages) but never counts.
    for (const q of w.wdCands) second.push({ kind: "wikidata", ref: q.qid, url: `https://www.wikidata.org/wiki/${q.qid}`, lat: q.lat, lng: q.lng, how: q.how });
    const c = classifyCensusRow({ place_id: w.place_id, category: w.category, event: w.event, primary: w.primary, census, second }, verifiedAt);
    rows.push({ ...c, src: w.src, event_id: w.event.event_id, venue: w.event.venue || null, address: w.event.address, source_url: w.event.source_url, primary: w.primary, census_now: census, second_pages: w.secondPages, wd_candidates: w.wdCands });
  }
  writeFileSync(outFile, JSON.stringify({ verified_at: verifiedAt, rows }, null, 1) + "\n");
  const tally = {};
  for (const r of rows) { const k = `${r.file}:${r.class}:${r.reasons.join("+") || "ok"}`; tally[k] = (tally[k] || 0) + 1; }
  console.log(JSON.stringify(tally, null, 1));
}

async function censusBatchCached(geo) {
  // cache key = the CSV content itself (FormData bodies are opaque)
  const ids = [...geo.keys()];
  const csvKey = ids.map((id) => JSON.stringify(geo.get(id))).join("\n");
  const f = cacheFile("CENSUS-BATCH " + createHash("sha1").update(csvKey).digest("hex"));
  if (existsSync(f)) return new Map(JSON.parse(readFileSync(f, "utf8")));
  const out = await censusBatch(geo);
  writeFileSync(f, JSON.stringify([...out]));
  return out;
}

// ── emit ────────────────────────────────────────────────────────────────────
const NEW_NAME = "wf_inventory_coords_independent_verified";
function csvCell(v) { const s = v == null ? "" : Array.isArray(v) ? v.join(" | ") : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function emit(snapshotFile, stamp) {
  if (!/^\d{14}$/.test(stamp || "")) throw new Error("stamp must be YYYYMMDDHHMMSS");
  const snap = JSON.parse(readFileSync(snapshotFile, "utf8"));
  const writes = snap.rows.filter((r) => r.class === VERIFIED).map((r) => ({ place_id: r.place_id, entry: r.entry }));
  for (const w of writes) if (evidenceHasGoogle(w.entry)) throw new Error("google in evidence: " + w.place_id);
  const wd = writes.filter((w) => w.entry.source === "wikidata"), ce = writes.filter((w) => w.entry.source === "official_venue");
  const header = `-- GOOGLE-FREE RE-VERIFICATION (${snap.verified_at.slice(0, 10)}) of the 247 rows held from PR #1809 (counsel Q1).
-- Generated by scripts/verify-coords-independent.mjs (logic: scripts/lib/independentVerify.mjs).
-- ${writes.length} rows = ${wd.length} Wikidata P625 points + ${ce.length} Census geocodes of official venue addresses,
-- each VERIFIED_INDEPENDENT: two non-Google sources agree AND the place_id identity link is
-- Wayfind-owned (editor wf_events link / Atlas owner sheet / editorial pick), never a Google name.
-- No Google coordinate, name, URL or corroboration appears in any evidence chain
-- (locked by scripts/test-coords-independent-verified.mjs). Audit: ${AUDIT_CSV}.
-- Idempotent, append-only, never touches lat/lng/refreshed_at. The three #1809 files stay ON HOLD.
-- Reverse: supabase/data-fixes/${stamp}_${NEW_NAME}_REVERSE.sql.
`;
  // two source+method pairs -> the shared forwardSql works per row; reverse needs one pair, so emit two reverse blocks.
  // One forward block per source: a place_id can carry BOTH a Wikidata and an
  // official_venue entry, and forwardSql's temp table is keyed on place_id.
  // Blocks run in the same single request (one implicit transaction).
  const fwd = [wd, ce].filter((x) => x.length).map((x, i) => forwardSql(x, { title: `${stamp}_${NEW_NAME}.sql${i ? " — part 2 (official_venue)" : " — part 1 (wikidata)"}`, header: i ? "" : header })).join("\n");
  writeFileSync(path.join(ROOT, "supabase/migrations", `${stamp}_${NEW_NAME}.sql`), fwd);
  const rev = [wd, ce].filter((x) => x.length).map((x, i) => reverseSql(x, { title: `${stamp}_${NEW_NAME}_REVERSE.sql${i ? " (part 2)" : ""}` })).join("\n");
  writeFileSync(path.join(ROOT, "supabase/data-fixes", `${stamp}_${NEW_NAME}_REVERSE.sql`), rev);
  const cols = ["file", "place_id", "class", "reasons", "category", "inventory_source", "identity_basis", "identity_relies_on_google_name", "identity_detail", "wikidata_qid", "wikidata_url", "official_website", "official_address", "official_address_url", "census_matched_address", "second_source", "second_source_url", "distance_m", "limit_m", "event_id", "venue_editor_typed", "event_source_url", "page_states_address", "pages_checked"];
  const lines = [cols.join(",")];
  for (const r of snap.rows) {
    const s = r.second || {};
    const isWd = r.file === "wikidata";
    lines.push([
      r.file, r.place_id, r.class, r.reasons, r.category, r.src, r.identity_basis, r.identity_google_name ? "yes" : "no", isWd ? r.identity_detail : `editor venue "${r.venue || ""}"`,
      isWd ? r.qid : (s.kind === "wikidata" ? s.ref : ""), isWd ? `https://www.wikidata.org/wiki/${r.qid}` : (s.kind === "wikidata" ? s.url : ""),
      isWd ? r.website : "", isWd ? s.address : r.address, isWd ? s.url : r.source_url,
      isWd ? (s.census && s.census.matched) : (r.census_now && r.census_now.matched),
      isWd ? (s.kind || "") : (s.kind || ""), isWd ? "" : (s.url || ""),
      r.distance_m, r.limit_m, isWd ? (s.event_id || "") : r.event_id, isWd ? "" : r.venue, isWd ? "" : r.source_url,
      isWd ? "" : (r.primary && r.primary.stated ? `yes: ${r.primary.stated_url}` : r.primary && r.primary.fetched ? "no" : `unreachable:${r.primary && r.primary.reason}`),
      isWd ? (r.pages || []).map((p) => `${p.url}${p.ok ? "" : " [" + p.reason + "]"}`) : [r.source_url, ...((r.primary && r.primary.fallback) || []), ...(r.second_pages || []).map((p) => `${p.url} (second page${p.stated ? ", states same address" : ""})`)],
    ].map(csvCell).join(","));
  }
  mkdirSync(path.join(ROOT, "docs/audits"), { recursive: true });
  writeFileSync(path.join(ROOT, AUDIT_CSV), lines.join("\n") + "\n");
  console.log(`${stamp}_${NEW_NAME}.sql: ${writes.length} rows (${wd.length} wikidata, ${ce.length} census); audit ${snap.rows.length} rows`);
}

const [mode, ...args] = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  if (mode === "export") exportSql();
  else if (mode === "harvest") await harvest(...args);
  else if (mode === "emit") emit(...args);
  else { console.error("usage: export | harvest <q.json> <cacheDir> <snapshot.json> | emit <snapshot.json> <stamp>"); process.exit(2); }
}
