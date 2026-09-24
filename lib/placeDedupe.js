// lib/placeDedupe.js — extracted VERBATIM from app/home.js (2026-09-23, WS2
// surface-parity audit follow-up). Zero behavior change: these are the exact
// same three functions that lived inline in home.js, moved here so a
// diagnostic can call the REAL brand-collapse rule instead of restating it
// (the same "identity lives in one place, everything else calls it" rule
// this whole audit is built on). home.js now imports them from here.
//
// Global dedupe: one shared layer every feed runs before rendering, so the
// same place never shows twice and two branches of one brand (e.g. Oak &
// Stone) never sit back to back in a curated feed. Exact place_id duplicates
// always collapse. When collapseBrand is true (general recommendation feeds)
// same-name brands collapse to their single best branch; brand searches pass
// false and keep all.
export function normName(s) {
  let t = String(s || "").toLowerCase();
  const cut = t.search(/\s[-–—|]\s/);
  if (cut > 0) t = t.slice(0, cut);
  return t.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
export function betterPlace(a, b) {
  if (!a) return b; if (!b) return a;
  const oa = a.openNow === true ? 1 : 0, ob = b.openNow === true ? 1 : 0;
  if (oa !== ob) return oa > ob ? a : b;
  const na = a.reviews || 0, nb = b.reviews || 0;
  if (na !== nb) return na > nb ? a : b;
  const ra = a.rating || 0, rb = b.rating || 0;
  if (ra !== rb) return ra > rb ? a : b;
  const pa = a.photo ? 1 : 0, pb = b.photo ? 1 : 0;
  if (pa !== pb) return pa > pb ? a : b;
  return (a.wfScore || 0) >= (b.wfScore || 0) ? a : b;
}
export function dedupePlaces(list, collapseBrand) {
  if (!Array.isArray(list)) return [];
  const out = []; const at = new Map();
  for (const p of list) {
    if (!p) continue;
    const id = p.id || p.placeId || ("n:" + p.name + "|" + (p.address || ""));
    if (at.has(id)) { const i = at.get(id); out[i] = betterPlace(out[i], p); }
    else { at.set(id, out.length); out.push(p); }
  }
  if (!collapseBrand) return out;
  const out2 = []; const nat = new Map();
  for (const p of out) {
    const k = normName(p.name);
    if (!k) { out2.push(p); continue; }
    if (nat.has(k)) { const i = nat.get(k); out2[i] = betterPlace(out2[i], p); }
    else { nat.set(k, out2.length); out2.push(p); }
  }
  return out2;
}
