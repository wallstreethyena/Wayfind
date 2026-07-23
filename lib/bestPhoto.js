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
