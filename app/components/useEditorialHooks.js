"use client";
// useEditorialHooks — resolve the editorial line for a list of PLACES.
//
// This is the #687 pattern, lifted out of BestNearby.js so every place-based
// surface resolves the line the same way instead of nine near-copies drifting
// apart. TWO SOURCES, IN THIS PRECEDENCE — the same precedence the main feed
// has always used:
//
//   1. /api/known-for — researched copy about THIS place (what it is known
//      for): the owner's Atlas card first, then a verified wf_editorial hook.
//      No model is called; the route returns copy written and checked for that
//      specific place, or nothing for it. WINS where it exists.
//   2. /api/blurbs with cacheOnly:true — the validated "Known for" line from the
//      shared 30-day pool. RENDER-SAFE: reads only what the pool already holds
//      and never generates while the reader waits. This is a hard contract, not
//      an optimisation — check-no-llm-in-render-path walks every client
//      component looking for a caller that forgot it, because one did.
//
// Both calls fail SOFT. On any error the surface keeps whatever it had; a card
// must never LOSE text because a lookup blinked.
//
// EVENTS ARE EXCLUDED, PERMANENTLY — ON LIST SURFACES. An event is not a
// place: it has no wf_editorial row, no "what it's known for", and asking
// this hook about one returns nothing forever while spending a request to
// find that out. Callers pass places only. check-editorial-everywhere
// asserts no event LIST surface calls this.
//
// DETAIL is the exception (owner, 2026-08-20): an opened event-shaped card
// fetches /api/editorial and paints WayfindTakeRail when a sourced field
// exists. That path lives in sheets/Detail.js, not here.
import { useEffect, useRef, useState } from "react";
import { hookTextOf } from "../../lib/editorialHook";

// /api/known-for caps at 40 ids per request (MAX_IDS in its route) and drops
// the rest without saying so. So we CHUNK rather than truncate: BestNearby
// alone asks about ~60 places (10 eat + 10 things-to-do + 40 Top 40), and a
// surface whose tail silently loses its editorial line is the exact failure
// this whole PR exists to fix.
const BATCH = 40;
const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

export default function useEditorialHooks(items) {
  const [hooks, setHooks] = useState({});
  // Accumulates across location changes: a place already resolved stays
  // resolved, so scrolling back to a warm row never re-blanks it.
  const seen = useRef({});

  // Dedupe by id — callers pass unions (eat + things-to-do + Top 40) and the
  // same place legitimately appears in more than one of them.
  const list = [];
  const byId = new Set();
  for (const p of Array.isArray(items) ? items : []) {
    const id = p && (p.id || p.place_id);
    if (!id || byId.has(id)) continue;
    byId.add(id);
    list.push(p);
  }
  const key = list.map((p) => p.id || p.place_id).join(",");

  useEffect(() => {
    if (!key) return;
    const payload = list.map((p) => ({
      id: p.id || p.place_id,
      name: p.name || "",
      type: p.type || p.primary_type || "",
      rating: p.rating,
      reviews: p.reviews,
    }));
    const ids = payload.map((p) => p.id);
    // Only ask about ids we have not already answered. A warm surface makes
    // zero requests.
    const need = ids.filter((id) => !seen.current[id]);
    if (!need.length) return;
    const needSet = new Set(need);
    const needPayload = payload.filter((p) => needSet.has(p.id));
    let dead = false;
    (async () => {
      const next = {};
      for (const batch of chunk(needPayload, BATCH)) {
        const bIds = batch.map((p) => p.id);
        // 1) Researched editorial hook — wins where it exists.
        try {
          const r = await fetch("/api/known-for", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ids: bIds }),
          });
          const d = await r.json();
          if (d && d.lines && typeof d.lines === "object") {
            for (const id of bIds) if (d.lines[id]) next[id] = d.lines[id];
          }
        } catch (e) {}
        // 2) Validated generated "Known for" line from the shared pool. cacheOnly
        //    keeps this off the generation path — a page view never waits on a
        //    model. Only fills ids the editorial hook did not already answer.
        try {
          const r = await fetch("/api/blurbs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cacheOnly: true, city: "", places: batch }),
          });
          const d = await r.json();
          if (d && d.blurbs && typeof d.blurbs === "object") {
            // NORMALISE. /api/blurbs returns EITHER a string or a validated
            // { card_line_1, card_line_2 } CARD_SUMMARY. Storing the object raw
            // sends it into toHookLine, whose String() renders it as the literal
            // "[object Object]" on the card. BestNearby's original resolver did
            // this normalisation inline; lifting the resolver out dropped it,
            // and check-editorial-everywhere caught it by CALLING the compressor.
            for (const id of bIds) if (!next[id] && d.blurbs[id]) { const t = hookTextOf(d.blurbs[id]); if (t) next[id] = t; }
          }
        } catch (e) {}
        if (dead) return;
      }
      if (dead) return;
      // Mark every id ASKED, not just the ones answered — otherwise a place
      // with no editorial is re-requested on every render forever.
      for (const id of need) seen.current[id] = true;
      if (!Object.keys(next).length) return;
      setHooks((prev) => ({ ...prev, ...next }));
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return hooks;
}
