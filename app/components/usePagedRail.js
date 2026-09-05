"use client";

// app/components/usePagedRail.js — the shared client half of the WO11
// paging contract (server half: lib/railPage.js).
//
// Owner, 2026-09-02: "load the top ten based on the Wayfind score, and as
// they scroll left, as they pass the seventh card, start loading 10 more
// cards, and 10 more, instead of loading everything at once. Have everything
// there in the library and just stream it in 10 at a time."
//
// THE SENTINEL RULE, PINNED IN SOURCE (scripts/check-rail-paging-contract.mjs
// asserts this literal formula): the card that arms the next fetch sits at
// index (loaded − 3) of whatever is currently mounted — the 8th card of an
// initial ten. A caller renders the card at `sentinelIndex` with
// `domRef={sentinelRef}` (RailCard forwards it straight onto its root
// `<article>`, the same node `.wf-rail>.wf-rail-card` sizes) and the hook
// fetches page N+1 the moment that ONE card intersects the viewport.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";
import { RAIL_PAGE_SIZE, pageOf, seedSignature } from "../../lib/railPage.js";

export const RAIL_LOAD_MORE_OFFSET = 3;

function idOf(item, getId) {
  if (getId) return getId(item);
  return item && (item.id ?? item.place_id ?? item.event_id ?? null);
}

/**
 * @param {string} endpoint       e.g. "/api/night-out" or "/api/rails"
 * @param {object} params         query params EXCLUDING page/size (lat, lng,
 *                                 band, rail, …) — null/"" values are dropped
 * @param {object} [opts]
 * @param {number}  [opts.size]       page size (default RAIL_PAGE_SIZE = 10)
 * @param {boolean} [opts.enabled]    false suppresses every fetch (e.g. no origin yet)
 * @param {string}  [opts.itemsKey]   "places" (default) or "cards" (Fall Intent)
 * @param {func}    [opts.getId]      item -> stable id, for dedupe
 * @param {any[]}   [opts.seedItems]  already-known page 0 (skips the first network call —
 *                                     DaypartRail seeds this from data it already fetched
 *                                     in the homepage's one bulk /api/rails response)
 * @param {number}  [opts.seedTotal]  total that goes with seedItems
 * @param {any[]}   [opts.source]     LOCAL mode: the full already-loaded, already-ranked
 *                                     list (e.g. DaypartRail's shown.places[selected], which
 *                                     /api/rails already delivered in full — no per-rail cap
 *                                     exists in that response by design, see
 *                                     lib/railSelect.js). When given, `endpoint` is never
 *                                     called: paging slices this array in memory instead of
 *                                     over the network, but keeps the exact same page size,
 *                                     sentinel index and observer contract as every networked
 *                                     rail, so "top ten, then ten more on scroll" is ONE
 *                                     mechanism whether the data arrived in one response or
 *                                     many.
 */
export function usePagedRail(endpoint, params, {
  size = RAIL_PAGE_SIZE,
  enabled = true,
  itemsKey = "places",
  getId,
  seedItems = null,
  seedTotal = null,
  source = null,
} = {}) {
  const local = Array.isArray(source);
  // v8.97 — THE SEED IS PART OF THE KEY, BY CONTENT.
  //
  // The seed was captured once per key, and the key was endpoint + params. That
  // is correct against a fresh ARRAY IDENTITY carrying the same content (the
  // case the comment below still protects). It is wrong against a fresh
  // CONTENT, and NightOutRails does exactly that: it mounts every rail against
  // a client-side fail-soft fallback and then swaps in the real /api/night-out
  // payload — same endpoint, same params, same key. The hook therefore stayed
  // pinned to the fallback for the life of the rail.
  //
  // Measured on production, Parrish, 2026-09-05: Bars, Cocktails & Rooftops
  // rendered 5 cards while the network had delivered 188, and Date-Night Dining
  // rendered 1 of 7. Worse, hasMore was computed from the frozen seed
  // (1 < 1 = false), so the rail could not even heal by being scrolled — the
  // reader was locked out of data the browser had already received.
  //
  // The signature is the seed's LENGTH, TOTAL and ITEM IDS — not its identity.
  // Same content therefore still yields the same key and still does not re-seed
  // a reader who has scrolled past page 0; different content yields a new key
  // and re-seeds. Both halves are what the original comment wanted.
  // seedSignature lives in lib/railPage.js so a guard can CALL it rather than
  // read this file — the rule that "a structural regex tells you the code looks
  // right; a call tells you it behaves right".
  const seedSig = useMemo(
    () => (local ? "" : seedSignature(seedItems, seedTotal, getId)),
    [local, seedItems, seedTotal, getId],
  );
  const key = enabled && (local || endpoint) ? `${local ? "local" : endpoint}|${JSON.stringify(params || {})}|${seedSig}` : "";
  // Seed is captured once per key so a parent re-render with a fresh array
  // identity (but the same content) does not re-seed a rail the reader has
  // already scrolled past page 0 of.
  const seedRef = useRef({ key: "", items: seedItems, total: seedTotal });
  if (seedRef.current.key !== key) seedRef.current = { key, items: seedItems, total: seedTotal };

  const hasSeed = !!(seedItems && seedItems.length) || local;
  // LOCAL mode's "page 0" is available synchronously (it is already in
  // memory), so it is computed straight into the initial render — a
  // DaypartRail poster never shows a loading flash for data it already had.
  const localPage0 = local ? pageOf(source || [], { page: 0, size }) : null;
  const [items, setItems] = useState(() => (local ? localPage0.places : hasSeed ? seedItems.slice() : []));
  const [total, setTotal] = useState(() => (local ? localPage0.total : hasSeed ? seedTotal : null));
  const [hasMore, setHasMore] = useState(() => (local ? localPage0.hasMore : hasSeed ? (seedTotal == null || seedItems.length < seedTotal) : true));
  const [loading, setLoading] = useState(!hasSeed);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const nextPageRef = useRef(hasSeed ? 1 : 0);
  const askedKeyRef = useRef("");
  const currentKeyRef = useRef(key);
  const fetchingRef = useRef(false);
  const sourceRef = useRef(source);
  currentKeyRef.current = key;
  sourceRef.current = source;

  const load = useCallback((pageToLoad, isFirst, requestKey) => {
    if (!requestKey) return;
    if (local) {
      // Already in memory — page it synchronously, no fetch, no loading flash.
      const paged = pageOf(sourceRef.current || [], { page: pageToLoad, size });
      setItems((prev) => {
        const base = pageToLoad === 0 ? [] : prev;
        const seen = new Set(base.map((it) => idOf(it, getId)).filter((id) => id != null));
        const merged = base.slice();
        for (const it of paged.places) {
          const id = idOf(it, getId);
          if (id != null && seen.has(id)) continue;
          if (id != null) seen.add(id);
          merged.push(it);
        }
        return merged;
      });
      setTotal(paged.total);
      setHasMore(paged.hasMore);
      nextPageRef.current = pageToLoad + 1;
      setLoading(false); setLoadingMore(false); setError(false);
      return;
    }
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (isFirst) { setLoading(true); setError(false); } else setLoadingMore(true);
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) if (v != null && v !== "") q.set(k, String(v));
    q.set("page", String(pageToLoad));
    q.set("size", String(size));
    fetchJsonWithDeadline(`${endpoint}?${q.toString()}`)
      .then((body) => {
        // A location/rail change while this request was in flight must not
        // splice a stale rail's cards into the new one.
        if (currentKeyRef.current !== requestKey) return;
        const incoming = Array.isArray(body?.[itemsKey]) ? body[itemsKey] : [];
        setItems((prev) => {
          const base = pageToLoad === 0 ? [] : prev;
          const seen = new Set(base.map((it) => idOf(it, getId)).filter((id) => id != null));
          const merged = base.slice();
          for (const it of incoming) {
            const id = idOf(it, getId);
            if (id != null && seen.has(id)) continue;
            if (id != null) seen.add(id);
            merged.push(it);
          }
          return merged;
        });
        setTotal(Number.isFinite(body?.total) ? body.total : null);
        setHasMore(!!body?.hasMore);
        nextPageRef.current = pageToLoad + 1;
        setError(false);
      })
      .catch(() => { if (currentKeyRef.current === requestKey) setError(true); })
      .finally(() => {
        fetchingRef.current = false;
        if (currentKeyRef.current === requestKey) { setLoading(false); setLoadingMore(false); }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, endpoint, JSON.stringify(params), size, itemsKey, getId]);

  useEffect(() => {
    if (!key || askedKeyRef.current === key) return;
    askedKeyRef.current = key;
    const seed = seedRef.current;
    if (seed.items && seed.items.length) {
      setItems(seed.items.slice());
      setTotal(seed.total);
      setHasMore(seed.total == null || seed.items.length < seed.total);
      setLoading(false);
      setError(false);
      nextPageRef.current = 1;
    } else {
      setItems([]); setTotal(null); setHasMore(true); nextPageRef.current = 0;
      load(0, true, key);
    }
  }, [key, load]);

  const fetchMore = useCallback(() => {
    if (!hasMore || fetchingRef.current || loading || !key) return;
    load(nextPageRef.current, false, key);
  }, [hasMore, loading, load, key]);

  // ONE IntersectionObserver, fully rebuilt on every (re)attach rather than
  // tracked as an observe/unobserve pair — the sentinel card changes exactly
  // once per page fetch (never per scroll frame), so a rebuild is cheap and
  // it sidesteps any ordering hazard between React detaching the OLD
  // sentinel's ref and attaching the NEW one in the same commit.
  const observerRef = useRef(null);
  const fetchMoreRef = useRef(fetchMore);
  fetchMoreRef.current = fetchMore;

  const sentinelRef = useCallback((el) => {
    if (!el) return;
    if (observerRef.current) observerRef.current.disconnect();
    if (typeof IntersectionObserver !== "function") return;
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) fetchMoreRef.current();
    }, { rootMargin: "0px", threshold: 0 });
    observerRef.current.observe(el);
  }, []);

  useEffect(() => () => { if (observerRef.current) observerRef.current.disconnect(); }, [key]);

  // THE SENTINEL RULE — index (loaded − 3). Clamped at 0 so a rail shorter
  // than 3 cards never throws; hasMore is already false in that case, so
  // nothing observes it into firing anyway.
  const sentinelIndex = Math.max(0, items.length - RAIL_LOAD_MORE_OFFSET);

  return { items, total, hasMore, loading, loadingMore, error, sentinelIndex, sentinelRef, fetchMore };
}
