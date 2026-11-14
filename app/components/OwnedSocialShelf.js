"use client";
// "Seen on Wayfind": the Reels and carousels Wayfind publishes on Instagram,
// first shelf under TRENDING NOW (owner, 2026-11-12: every eligible Reel or
// carousel must appear under Trending, zero silent misses).
//
// Own shelf, never a slot on the five earned shelves. The catalog is unlimited
// but arrives in pages of 12 (/api/owned-social?offset=): the next page loads
// only when the visitor swipes near the end, so a phone never downloads the
// whole library. A failed or empty read renders nothing and leaves the other
// Trending shelves untouched.
//
// Tapping plays the post inside Wayfind (native dialog, the CreatorVideoAction
// pattern: focus containment, Escape, focus return, and the iframe unmounts on
// close so audio stops), with a clear path to the original post on
// @gowayfind.app and to the matching Wayfind page when there is one.
//
// Funnel (PostHog): owned_social_impression -> owned_social_open ->
// owned_social_player_loaded -> owned_social_instagram_open /
// owned_social_wayfind_open. "player_loaded" is the honest name: Instagram's
// embed reports no play event to the page, so a loaded player is the closest
// signal we can measure.
import { useCallback, useEffect, useRef, useState } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import RailHeading from "./RailHeading";
import CreatorVideoPlayer from "./CreatorVideoPlayer";
import { safeUrl } from "../../lib/links";
import { captureOrQueue } from "../../lib/browserAnalytics";

export const OWNED_SHELF_TITLE = "Seen on Wayfind";
export const OWNED_HANDLE_URL = "https://www.instagram.com/gowayfind.app/";
const FORMAT_LABEL = { reel: "Wayfind Reel", carousel: "Wayfind Carousel" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function logEvent(name, props) {
  try { if (typeof window !== "undefined") captureOrQueue(window, name, props || {}); } catch (e) {}
}

function shortDate(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : null;
}

/** The one line under the title: where, and when it is good until or was posted. */
export function ownedTake(item) {
  const when = item.relevant_until ? "Through " + shortDate(item.relevant_until) : (item.published_at ? "Posted " + shortDate(item.published_at) : null);
  return [item.city, when].filter(Boolean).join(" · ") || null;
}

/** Presentational shelf: given served items, one card per post. */
export function OwnedSocialCards({ items, total, onOpen, railRef }) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;
  const railId = "trending-seen-on-wayfind";
  const count = Math.max(list.length, Number(total) || 0);
  return (
    <section aria-label={OWNED_SHELF_TITLE} style={{ marginTop: 22 }} data-trending-rail="seen-on-wayfind">
      <RailHeading title={OWNED_SHELF_TITLE} description="Our newest Reels and carousels from @gowayfind.app. Tap to watch here.">
        <RailNav railId={railId} count={list.length} total={count} loaded={list.length} unit={count === 1 ? "post" : "posts"} />
      </RailHeading>
      <div ref={railRef} className="wf-rail wf-rail-exploding" data-rail={railId} tabIndex={0} role="region" aria-label={OWNED_SHELF_TITLE}>
        {list.map((item, index) => (
          <RailCard key={item.shortcode} className="wf-exploding-primary"
            photo={item.cover || null} photoFallbackCategory="Activities"
            title={item.title || "Wayfind post"} eyebrow={FORMAT_LABEL[item.format] || "Wayfind post"}
            rank={index + 1} take={ownedTake(item)} cta={null}
            ariaLabel={`Watch ${item.title || "this Wayfind post"} in Wayfind`}
            onOpen={onOpen ? () => onOpen(item, index + 1) : undefined} />
        ))}
      </div>
      {list.length > 1 ? <RailDots railId={railId} count={list.length} /> : null}
    </section>
  );
}

/** Fetches the shelf a page at a time while Trending is open, then renders it. */
export default function OwnedSocialShelf({ active = true }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState(0);
  const [current, setCurrent] = useState(null);
  const loading = useRef(false);
  const seen = useRef(false);
  const dialogRef = useRef(null);
  const railRef = useRef(null);

  const loadPage = useCallback((offset) => {
    if (offset == null || loading.current) return;
    loading.current = true;
    fetch(`/api/owned-social?offset=${offset}`)
      .then((r) => r.json())
      .then((body) => {
        if (!body || body.ok !== true || !Array.isArray(body.items)) { setNext(null); return; }
        setItems((prev) => {
          const have = new Set(prev.map((i) => i.shortcode));
          return prev.concat(body.items.filter((i) => i && i.shortcode && !have.has(i.shortcode)));
        });
        setTotal(Number(body.total) || 0);
        setNext(body.next_offset == null ? null : body.next_offset);
      })
      .catch(() => setNext(null))
      .finally(() => { loading.current = false; });
  }, []);

  useEffect(() => { if (active && !items.length) loadPage(0); }, [active, items.length, loadPage]);

  // Next page only when the visitor swipes near the end of what is loaded.
  useEffect(() => {
    const el = railRef.current;
    if (!el || next == null || !next) return undefined;
    const onScroll = () => { if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 600) loadPage(next); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [items.length, next, loadPage]);

  // One impression per mount, when the shelf is actually on screen.
  useEffect(() => {
    const el = railRef.current;
    if (!el || seen.current || !items.length || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver((entries) => {
      if (seen.current || !entries.some((e) => e.isIntersecting)) return;
      seen.current = true;
      logEvent("owned_social_impression", { shown: items.length, total });
      io.disconnect();
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [items.length, total]);

  const close = () => { dialogRef.current?.close(); setCurrent(null); };
  const open = (item, rank) => {
    logEvent("owned_social_open", { shortcode: item.shortcode, format: item.format, rank });
    setCurrent(item);
    dialogRef.current?.showModal();
  };
  const label = current ? `${current.title || "Wayfind post"} on Instagram` : "Wayfind post";
  const source = current ? safeUrl(current.permalink) : null;
  const links = current && Array.isArray(current.links) ? current.links : [];
  const linkStyle = { display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 14px", borderRadius: 99, fontSize: 13, fontWeight: 800, textDecoration: "none" };
  return <>
    <OwnedSocialCards items={items} total={total} onOpen={open} railRef={railRef} />
    <dialog ref={dialogRef} aria-label={label} onCancel={close} onClose={() => setCurrent(null)} onClick={(event) => { if (event.target === event.currentTarget) close(); }} style={{ padding: 0, width: "min(440px, calc(100vw - 24px))", maxHeight: "90dvh", border: "1px solid #26303B", borderRadius: 16, background: "#0D1117", color: "#F1F5F9", overflowY: "auto" }}>
      <div onClick={(event) => event.stopPropagation()}>
        <div style={{ position: "sticky", top: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 14px", background: "#0D1117" }}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>{current && current.title ? current.title : "Watch in Wayfind"}</span>
            <a href={OWNED_HANDLE_URL} target="_blank" rel="noopener" style={{ fontSize: 12, color: "#9BA6B4" }}>@gowayfind.app</a>
          </span>
          <button type="button" autoFocus onClick={close} aria-label="Close post" style={{ minWidth: 44, minHeight: 44, border: 0, borderRadius: 99, background: "#161B22", color: "#fff", cursor: "pointer", fontSize: 22 }}>×</button>
        </div>
        {current ? <CreatorVideoPlayer platform="instagram" url={current.permalink} label={label}
          onLoad={() => logEvent("owned_social_player_loaded", { shortcode: current.shortcode, format: current.format })} /> : null}
        {current ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "6px 14px 16px" }}>
          {links.map((l) => <a key={l.href} href={l.href} onClick={() => logEvent("owned_social_wayfind_open", { shortcode: current.shortcode, href: l.href })} style={{ ...linkStyle, background: "#FF9B50", color: "#0D1117" }}>See {l.label} on Wayfind</a>)}
          {source ? <a href={source} target="_blank" rel="noopener" onClick={() => logEvent("owned_social_instagram_open", { shortcode: current.shortcode, format: current.format })} style={{ ...linkStyle, border: "1px solid #3A4654", color: "#F1F5F9" }}>Watch on Instagram ↗</a> : null}
        </div> : null}
      </div>
    </dialog>
  </>;
}
