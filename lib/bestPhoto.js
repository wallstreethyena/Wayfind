"use client";
// lib/bestPhoto.js — pick the best card photo: the most Instagrammable shot that
// does NOT prominently feature people (owner: no human faces on cards). Scores
// candidate photos via /api/image-score (vision, cached 30d server-side + here),
// NON-BLOCKING: the card shows its primary photo instantly and only swaps to a
// better one once verdicts arrive. Only ref-based Google photos (/api/photo?ref=,
// a stable id) are scored; anything else is left as-is.
import { useEffect, useRef, useState } from "react";

const mem = new Map(); // ref -> { people, aesthetic }
let active = 0; const queue = []; const MAX = 3;
function pump() {
  while (active < MAX && queue.length) { const job = queue.shift(); active++; job().finally(() => { active--; pump(); }); }
}
export function refOf(url) {
  try { const m = String(url || "").match(/[?&]ref=([^&]+)/); return m ? decodeURIComponent(m[1]) : null; } catch { return null; }
}
function scoreRef(ref) {
  if (mem.has(ref)) return Promise.resolve(mem.get(ref));
  return new Promise((resolve) => {
    queue.push(async () => {
      let v = { people: false, aesthetic: 0.5 };
      try {
        const r = await fetch("/api/image-score", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref }) });
        const j = r.ok ? await r.json() : null;
        if (j && j.ok) v = { people: !!j.people, aesthetic: Number(j.aesthetic) || 0 };
      } catch (e) {}
      mem.set(ref, v); resolve(v);
    });
    pump();
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
  const cands = [];
  ranked[0].refs.slice(0, 3).forEach((n) => cands.push(n));
  ranked.slice(1, 5).forEach((x) => cands.push(x.refs[0]));
  return pickPeopleFreeRef(cands, { max: 6 });
}
