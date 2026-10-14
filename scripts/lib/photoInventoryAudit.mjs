// scripts/lib/photoInventoryAudit.mjs — PURE classification + counting for the
// photo inventory audit (scripts/photo-inventory-audit.mjs). No I/O, no network,
// no Google. Definitions are documented in docs/PHOTO_AUDIT.md.
import { PHOTO_REF_RX } from "../../lib/placePhotoServe.js";

/** A photo_ref is "present" when it has non-whitespace content. */
export function hasRef(ref) {
  return typeof ref === "string" && ref.trim() !== "";
}

/** Present but not in the repo's PHOTO_REF_RX shape (can never be served). */
export function isMalformedRef(ref) {
  return hasRef(ref) && !PHOTO_REF_RX.test(ref.trim());
}

/** published = not coalesce(excluded,false) and status = 'OPERATIONAL' */
export function isPublished(row) {
  return !!row && row.excluded !== true && row.status === "OPERATIONAL";
}

/**
 * rows: [{place_id, photo_ref, excluded, status}]; activeIds: Set of place_ids with an
 * ACTIVE wf_place_photo row.
 */
export function classifyInventory(rows, activeIds) {
  const active = activeIds instanceof Set ? activeIds : new Set(activeIds || []);
  const c = { published: 0, has_ref: 0, no_ref: 0, malformed_ref: 0, has_active_owned_photo: 0, hard_gap: 0, hard_gap_ids: [] };
  for (const r of rows || []) {
    if (!isPublished(r)) continue;
    c.published++;
    const ref = hasRef(r.photo_ref);
    const own = active.has(r.place_id);
    if (ref) c.has_ref++; else c.no_ref++;
    if (isMalformedRef(r.photo_ref)) c.malformed_ref++;
    if (own) c.has_active_owned_photo++;
    if (!ref && !own) { c.hard_gap++; c.hard_gap_ids.push(r.place_id); }
  }
  return c;
}

/** Histogram of rows by a key function. Returns a plain object with sorted keys. */
export function histogram(rows, keyFn) {
  const out = {};
  for (const r of rows || []) {
    const k = String(keyFn(r));
    out[k] = (out[k] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

// ── wf_photo_outcome_daily classes ─────────────────────────────────────────
// ok                 delivered a photo
// genuine-no-photo   the source really has no (usable) photo: nothing to fix operationally
// operational        we failed to fetch one we could have (ledger/quota/network/...): fixable
// nonprod            preview:/dev: namespaced classes: not production traffic
// other              a class this audit does not know yet (kept visible, never hidden)
const GENUINE = new Set(["fresh-nophoto", "stale-heal-nophoto", "unowned", "legacy-miss"]);
// A free photo of the place already exists, so the paid take was skipped on purpose. Served, not failed.
const FREE_SERVED = new Set(["free-photo-preferred"]);
const OPERATIONAL_RX = /^(ledger[a-z0-9_-]*|denied|denied-ceiling:.+|quota[a-z0-9_-]*|key-denied|fresh-failed:.+|stale-heal-.+|stale|gate-shut|owned-miss|network|server|client|badjson|redirect|refunded|place-lookup-.+)$/;

export function classifyOutcome(cls) {
  const c = String(cls || "").trim();
  if (!c) return "other";
  if (/^(preview|dev|development|staging|test|other):/.test(c)) return "nonprod";
  if (c === "ok" || FREE_SERVED.has(c)) return "ok";
  if (GENUINE.has(c)) return "genuine-no-photo";
  if (OPERATIONAL_RX.test(c)) return "operational";
  return "other";
}

/** rows: [{class, n}] -> { ok, "genuine-no-photo", operational, nonprod, other, total, byClass } */
export function summarizeOutcomes(rows) {
  const s = { ok: 0, "genuine-no-photo": 0, operational: 0, nonprod: 0, other: 0, total: 0, byClass: {} };
  for (const r of rows || []) {
    const n = Number(r.n) || 0;
    const b = classifyOutcome(r.class);
    s[b] += n;
    s.total += n;
    s.byClass[r.class] = { n: (s.byClass[r.class] ? s.byClass[r.class].n : 0) + n, bucket: b };
  }
  return s;
}

// ── guides ─────────────────────────────────────────────────────────────────
/**
 * Which rung of lib/guideCardPhoto.js a guide reaches. `cardPhoto` is the REAL
 * guideCardPhoto function (injected so this module stays pure and testable).
 * Rungs: hero, pick, illustrative-hero, place, monogram. "No real card image" =
 * monogram.
 */
export function guideRungs(guides, cardPhoto) {
  const counts = { hero: 0, pick: 0, "illustrative-hero": 0, place: 0, monogram: 0 };
  const monogramSlugs = [];
  let total = 0;
  for (const [slug, g] of Object.entries(guides || {})) {
    total++;
    const r = cardPhoto({ ...g, slug }).rung || "monogram";
    counts[r] = (counts[r] || 0) + 1;
    if (r === "monogram") monogramSlugs.push(slug);
  }
  return { total, counts, monogramSlugs, noRealCardImage: monogramSlugs.length };
}

/** Valid hero = guideHero(slug) is a record with a string src (kind not "unavailable"). */
export function guideHeroCoverage(guides, heroOf) {
  let withHero = 0;
  const without = [];
  for (const slug of Object.keys(guides || {})) {
    const h = heroOf(slug);
    if (h && typeof h.src === "string" && h.src && h.kind !== "unavailable") withHero++;
    else without.push(slug);
  }
  return { total: Object.keys(guides || {}).length, withHero, withoutHero: without.length, withoutHeroSlugs: without };
}

// ── blogs ──────────────────────────────────────────────────────────────────
/**
 * resolution: output of creditedPhotoTargets.blogTargets ({ids: Map, stats}).
 * refOf(placeId) -> photo_ref|undefined ; activeIds Set.
 * A resolved pick is "image-resolvable" when its place has a ref or an active owned photo.
 */
export function blogPhotoResolution(resolution, refOf, activeIds) {
  const active = activeIds instanceof Set ? activeIds : new Set(activeIds || []);
  let resolvable = 0;
  const unresolvable = [];
  for (const [id, v] of resolution.ids) {
    if (hasRef(refOf(id)) || active.has(id)) resolvable++;
    else unresolvable.push({ place_id: id, name: v.name });
  }
  return { ...resolution.stats, resolvableVenues: resolvable, unresolvableVenues: unresolvable.length, unresolvable };
}

// ── events ─────────────────────────────────────────────────────────────────
export function eventImageKinds(rows) {
  return histogram(rows, (r) => {
    if (r.hero_image_kind) return r.hero_image_kind;
    return hasRef(r.hero_image) ? "(unclassified)" : "(no image)";
  });
}

// ── static surface blind spots ─────────────────────────────────────────────
const IMPORT_SIGNALS = [
  ["CardPhoto", /\bimport\b[^;]*\bCardPhoto\b/],
  ["cardPhotoRequest", /\bcardPhotoRequest\b/],
  ["railPhotoSrc", /\brailPhotoSrc\b/],
  ["FallbackImg", /\bFallbackImg\b/],
  ["SafeImg", /\bSafeImg\b/],
  ["<img", /<img\b/],
];
const FALLBACK_RX = /FallbackImg|SafeImg|PhotoFallbackTile|onError|monogram|imageState|<CardPhoto\b|<RailCard\b|<IconicPlaceCard\b/;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

/** @returns {string[]} the image-rendering signals found in code (comments stripped) */
export function imageSignals(src) {
  const code = stripComments(String(src || ""));
  return IMPORT_SIGNALS.filter(([, rx]) => rx.test(code)).map(([n]) => n);
}

/** Does the file mention a designed fallback path (heuristic, comments stripped)? */
export function hasDesignedFallback(src) {
  return FALLBACK_RX.test(stripComments(String(src || "")));
}

/**
 * files: [{rel, src}], registered: Set of repo-relative paths in PHOTO_SURFACES components.
 * Returns every image-rendering file with registry coverage and fallback status,
 * and the blind spots = rendering files NOT covered by the registry.
 */
export function surfaceAudit(files, registered) {
  const rows = [];
  for (const f of files || []) {
    const sig = imageSignals(f.src);
    if (!sig.length) continue;
    rows.push({ rel: f.rel, signals: sig, registered: registered.has(f.rel), fallback: hasDesignedFallback(f.src) });
  }
  rows.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  return {
    rendering: rows.length,
    registered: rows.filter((r) => r.registered).length,
    blindSpots: rows.filter((r) => !r.registered),
    noFallback: rows.filter((r) => !r.fallback),
    rows,
  };
}

/** Deltas between two flat numeric maps. */
export function compareFlat(cur, prev) {
  const out = {};
  for (const k of Object.keys(cur || {})) {
    if (typeof cur[k] !== "number") continue;
    const p = prev && typeof prev[k] === "number" ? prev[k] : null;
    out[k] = { cur: cur[k], prev: p, delta: p === null ? null : cur[k] - p };
  }
  return out;
}

/** The flat headline numbers (used for --compare and the markdown table). */
export function headline(report) {
  const h = {};
  const i = report.inventory || {};
  for (const k of ["published", "has_ref", "no_ref", "malformed_ref", "has_active_owned_photo", "hard_gap"]) if (typeof i[k] === "number") h[`inventory.${k}`] = i[k];
  const o = report.outcomes14d || {};
  for (const k of ["ok", "genuine-no-photo", "operational", "nonprod", "other", "total"]) if (typeof o[k] === "number") h[`outcomes14d.${k}`] = o[k];
  const g = report.guides || {};
  if (g.rungs) { h["guides.total"] = g.rungs.total; h["guides.no_real_card_image"] = g.rungs.noRealCardImage; for (const [k, v] of Object.entries(g.rungs.counts)) h[`guides.rung.${k}`] = v; }
  if (g.hero) { h["guides.with_hero"] = g.hero.withHero; h["guides.without_hero"] = g.hero.withoutHero; }
  const b = report.blogs || {};
  if (typeof b.posts === "number") { h["blogs.posts"] = b.posts; h["blogs.resolvable_venues"] = b.resolvableVenues; h["blogs.unresolvable_venues"] = b.unresolvableVenues; }
  const s = report.surfaces || {};
  if (typeof s.rendering === "number") { h["surfaces.rendering"] = s.rendering; h["surfaces.blind_spots"] = s.blindSpots.length; }
  return h;
}
