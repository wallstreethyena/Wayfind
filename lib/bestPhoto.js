"use client";
// lib/bestPhoto.js — pick the best card photo: the most Instagrammable shot that
// does NOT prominently feature people (owner: no human faces on cards). Scores
// candidate photos via /api/image-score (vision, cached 30d server-side + here),
// NON-BLOCKING: the card shows its primary photo instantly and only swaps to a
// better one once verdicts arrive. Only ref-based Google photos (/api/photo?ref=,
// a stable id) are scored; anything else is left as-is.
import { useEffect, useRef, useState } from "react";

// ── v7.21: ONE REQUEST PER FRAME, NOT ONE PER PHOTO ───────────────────────
// THE BUG THIS FIXES, measured on production: tapping a category asked for 85
// verdicts. This module sent one POST per ref with a concurrency cap of 3, i.e.
// ~29 sequential waves, and the last response landed 13.3 SECONDS after the tap.
// Every verdict was already cached server-side — the scoring was never the slow
// part, the per-item round-trip was. That is why the fix is batching and not a
// bigger concurrency cap: 85 parallel requests would only move the queue into
// the browser's own socket pool and hammer the function 85 times.
//
// React renders a whole rail in one tick, so every card asks within the same
// few milliseconds. A ~40ms coalescing window turns that burst into ONE request
// carrying every ref, which the route answers with a single batched cache read.
//
// THREE LAYERS, cheapest first, so the common case never touches the network:
//   1. `mem`   — this tab, this session. Already existed.
//   2. `store` — localStorage, 30 days. A verdict for a photo ref never changes,
//                so a returning visitor pays nothing at all. This is what makes
//                the SECOND category tap free rather than merely fast.
//   3. batched POST for whatever is genuinely unknown.
const mem = new Map(); // ref -> { people, aesthetic }

const LS_KEY = "wf_imgscore_v1";
const LS_TTL = 30 * 24 * 60 * 60 * 1000;
const LS_MAX = 600; // bounded so this can never grow into a storage-quota bug
let store = null;
function loadStore() {
  if (store) return store;
  store = {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const cut = Date.now() - LS_TTL;
      for (const k in parsed) if (parsed[k] && parsed[k].t > cut) store[k] = parsed[k];
    }
  } catch (e) { store = {}; }
  return store;
}
let saveTimer = null;
function saveStore() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const s = loadStore();
      const keys = Object.keys(s);
      // Evict oldest first if we are over the cap — writing an unbounded object
      // to localStorage is how a "harmless cache" becomes a QuotaExceededError.
      if (keys.length > LS_MAX) {
        keys.sort((a, b) => s[a].t - s[b].t).slice(0, keys.length - LS_MAX).forEach((k) => delete s[k]);
      }
      localStorage.setItem(LS_KEY, JSON.stringify(s));
    } catch (e) { /* private mode / full quota — the memory layer still works */ }
  }, 1200);
}
function remember(ref, v) {
  mem.set(ref, v);
  try { loadStore()[ref] = { v, t: Date.now() }; saveStore(); } catch (e) {}
}

const BATCH_MS = 40;
const BATCH_MAX = 60;
// A rail does not always mount in ONE commit — data streams in, so refs can
// arrive over several frames. A fixed 40ms timer started by the first ref would
// then cut the batch in half for no reason. The window instead EXTENDS while
// refs keep arriving (debounce), with a hard ceiling so a steadily-arriving feed
// can never postpone the request indefinitely.
const BATCH_MAX_WAIT_MS = 160;
let pending = new Map(); // ref -> [resolve]
let batchTimer = null;
let batchOpenedAt = 0;
function arm() {
  const now = Date.now();
  if (!batchTimer) { batchOpenedAt = now; batchTimer = setTimeout(flush, BATCH_MS); return; }
  if (now - batchOpenedAt >= BATCH_MAX_WAIT_MS) return; // ceiling reached — let it fire
  clearTimeout(batchTimer);
  batchTimer = setTimeout(flush, BATCH_MS);
}

async function flush() {
  batchTimer = null;
  const take = [...pending.keys()].slice(0, BATCH_MAX);
  if (!take.length) return;
  const waiters = take.map((r) => pending.get(r));
  take.forEach((r) => pending.delete(r));
  if (pending.size && !batchTimer) { batchOpenedAt = Date.now(); batchTimer = setTimeout(flush, BATCH_MS); }

  let scores = {};
  try {
    const r = await fetch("/api/image-score", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ refs: take }),
    });
    const j = r.ok ? await r.json() : null;
    if (j && j.ok && j.scores) scores = j.scores;
  } catch (e) { /* fail-soft below */ }

  take.forEach((ref, i) => {
    const raw = scores[ref];
    // NO VERDICT IS NOT A VERDICT. The route deliberately returns fewer scores
    // than asked when a cold batch would need too many metered vision calls, so
    // an absent score must NOT be cached as the neutral default — that would
    // permanently pin a card to a photo nobody ever rated. Resolve neutral for
    // this render (the card keeps its primary, which is the existing behaviour)
    // and leave the ref unknown so a later batch can still score it.
    if (raw && typeof raw === "object") {
      const v = { people: !!raw.people, aesthetic: Number(raw.aesthetic) || 0 };
      remember(ref, v);
      waiters[i].forEach((fn) => fn(v));
    } else {
      waiters[i].forEach((fn) => fn({ people: false, aesthetic: 0.5 }));
    }
  });
}
export function refOf(url) {
  try { const m = String(url || "").match(/[?&]ref=([^&]+)/); return m ? decodeURIComponent(m[1]) : null; } catch { return null; }
}
function scoreRef(ref) {
  if (mem.has(ref)) return Promise.resolve(mem.get(ref));
  if (typeof window !== "undefined") {
    const hit = loadStore()[ref];
    if (hit && hit.v) { mem.set(ref, hit.v); return Promise.resolve(hit.v); }
  }
  return new Promise((resolve) => {
    const waiters = pending.get(ref);
    if (waiters) { waiters.push(resolve); return; }   // same ref twice in one tick
    pending.set(ref, [resolve]);
    arm();
  });
}

// Given a place's primary photo url + candidate urls, return the url to show.
// Starts as the primary; upgrades to the best no-people / highest-aesthetic
// candidate as scores land. Never blocks; falls back to the primary if scoring
// is unavailable or there are no stable refs.
export function useBestPhoto(primary, candidates) {
  const [best, setBest] = useState(primary || null);
  const startedRef = useRef("");
  useEffect(() => { setBest(primary || null); }, [primary]);
  useEffect(() => {
    const primaryRef = refOf(primary);
    if (!primaryRef) return; // no stable ref → leave the primary as-is
    if (startedRef.current === primaryRef) return;
    startedRef.current = primaryRef;
    let dead = false;
    (async () => {
      // PRIMARY-FIRST: score just the primary. If it's a clean, decent shot, stop
      // (1 call per card). Only a photo WITH people or a poor shot pays for
      // scoring the alternates — so we bound the vision cost.
      const pv = await scoreRef(primaryRef);
      if (dead) return;
      if (!pv.people && pv.aesthetic >= 0.45) return; // primary is fine — keep it
      const alts = (Array.isArray(candidates) ? candidates : [])
        .map((u) => ({ url: u, ref: refOf(u) })).filter((x) => x.ref && x.ref !== primaryRef);
      if (!alts.length) return;
      const rated = await Promise.all(alts.map((x) => scoreRef(x.ref).then((v) => ({ ...x, ...v }))));
      if (dead) return;
      const ranked = rated.slice().sort((a, b) => (Number(a.people) - Number(b.people)) || (b.aesthetic - a.aesthetic));
      const winner = ranked[0];
      // swap only to a genuinely better, people-free shot
      if (winner && !winner.people && winner.url !== primary) setBest(winner.url);
    })();
    return () => { dead = true; };
  }, [primary, Array.isArray(candidates) ? candidates.join("|") : ""]);
  return best;
}

// Pick the best people-free, decent shot from a PRIORITY-ORDERED list of photo
// refs — the same "no human faces" rule cards use (owner), applied to hero /
// share surfaces that pick a photo in an effect (not a hook). Scores each ref
// via the same cached vision verdict, returns the FIRST clean+decent ref (honors
// priority), else the best people-free ref, else the first ref (a hero always
// shows something), else null. Bounded by `max`. Fail-soft: when scoring is
// unavailable scoreRef yields {people:false, aesthetic:0.5}, so the first
// candidate wins — i.e. exactly the pre-vision "top place's primary photo".
export async function pickPeopleFreeRef(refs, opts) {
  const max = (opts && opts.max) || 5;
  const minAesthetic = opts && opts.minAesthetic != null ? opts.minAesthetic : 0.45;
  const seen = new Set();
  const list = (Array.isArray(refs) ? refs : [])
    .filter((r) => typeof r === "string" && r && !seen.has(r) && seen.add(r))
    .slice(0, max);
  if (!list.length) return null;
  const rated = [];
  for (const ref of list) {
    let v;
    try { v = await scoreRef(ref); } catch { v = { people: false, aesthetic: 0.5 }; }
    if (!v.people && v.aesthetic >= minAesthetic) return ref; // first clean, decent shot wins
    rated.push({ ref, ...v });
  }
  const clean = rated.filter((x) => !x.people).sort((a, b) => b.aesthetic - a.aesthetic);
  return clean.length ? clean[0].ref : list[0];
}

// Build a people-free hero photo ref from a Google /api/places/search result,
// applying a quality floor (rating / reviews). The homepage hero surfaces
// (family, date-night, hidden gems) all pick "the area's best place's photo" and
// USED to blindly take photos[0] — which surfaced human faces (owner: none on
// cards). They now share this: rank qualifying places, offer the top place's
// first few shots + each runner-up's primary as candidates, and let
// pickPeopleFreeRef choose the best people-free one (fail-soft to the top shot).
const HERO_PHOTO_REF = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
export async function heroRefFromPlaces(places, opts) {
  const o = opts || {};
  const minRating = o.minRating != null ? o.minRating : 4.5;
  const minReviews = o.minReviews != null ? o.minReviews : 500;
  const maxReviews = o.maxReviews != null ? o.maxReviews : Infinity;
  const ranked = (Array.isArray(places) ? places : [])
    .map((pp) => ({
      refs: (Array.isArray(pp.photos) ? pp.photos : []).map((ph) => ph && ph.name).filter((n) => n && HERO_PHOTO_REF.test(n)),
      rating: Number(pp.rating) || 0,
      reviews: Number(pp.userRatingCount != null ? pp.userRatingCount : pp.reviews) || 0,
    }))
    .filter((x) => x.refs.length && x.rating >= minRating && x.reviews >= minReviews && x.reviews <= maxReviews)
    .sort((a, b) => b.rating * Math.log(b.reviews + 1) - a.rating * Math.log(a.reviews + 1));
  if (!ranked.length) return null;
  // DAY-ROTATE which top place leads the hero (owner: the hero showed the same
  // place every day). Cycles through the top few qualifying places by the date —
  // all pass the quality floor, so it's variety, not a quality drop.
  const rot = Number(o.dayRotate);
  if (Number.isFinite(rot) && ranked.length > 1) {
    const span = Math.min(ranked.length, 5);
    const off = ((rot % span) + span) % span;
    if (off) ranked.push(...ranked.splice(0, off));
  }
  const cands = [];
  ranked[0].refs.slice(0, 3).forEach((n) => cands.push(n));
  ranked.slice(1, 5).forEach((x) => cands.push(x.refs[0]));
  return pickPeopleFreeRef(cands, { max: 6 });
}
