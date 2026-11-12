"use client";
// "Seen on Wayfind": the Reels and carousels Wayfind publishes on Instagram,
// first shelf under TRENDING NOW (owner, 2026-11-12: every eligible Reel or
// carousel must appear under Trending, zero silent misses).
//
// Own shelf, never a slot on the five earned shelves, so Wayfind's posts can
// neither starve nor crowd out earned trends. Every live post, newest first,
// no cap (lib/ownedSocial.js). Tapping plays the post inside Wayfind (the
// same native dialog pattern as CreatorVideoAction: focus containment, Escape,
// focus return, and the iframe unmounts on close so audio stops).
import { useEffect, useRef, useState } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import RailHeading from "./RailHeading";
import CreatorVideoPlayer from "./CreatorVideoPlayer";
import { safeUrl } from "../../lib/links";

export const OWNED_SHELF_TITLE = "Seen on Wayfind";
const FORMAT_LABEL = { reel: "Wayfind Reel", carousel: "Wayfind Carousel" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
export function OwnedSocialCards({ items, onOpen }) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;
  const railId = "trending-seen-on-wayfind";
  return (
    <section aria-label={OWNED_SHELF_TITLE} style={{ marginTop: 22 }} data-trending-rail="seen-on-wayfind">
      <RailHeading title={OWNED_SHELF_TITLE} description="Our newest Reels and carousels. Tap to watch here.">
        <RailNav railId={railId} count={list.length} total={list.length} loaded={list.length} unit={list.length === 1 ? "post" : "posts"} />
      </RailHeading>
      <div className="wf-rail wf-rail-exploding" data-rail={railId} tabIndex={0} role="region" aria-label={OWNED_SHELF_TITLE}>
        {list.map((item, index) => (
          <RailCard key={item.shortcode} className="wf-exploding-primary"
            photo={item.cover || null} photoFallbackCategory="Activities"
            title={item.title || "Wayfind post"} eyebrow={FORMAT_LABEL[item.format] || "Wayfind post"}
            rank={index + 1} take={ownedTake(item)} cta={null}
            ariaLabel={`Watch ${item.title || "this Wayfind post"} in Wayfind`}
            onOpen={onOpen ? () => onOpen(item) : undefined} />
        ))}
      </div>
      {list.length > 1 ? <RailDots railId={railId} count={list.length} /> : null}
    </section>
  );
}

/** Fetches the served shelf once while Trending is open, then renders it. */
export default function OwnedSocialShelf({ active = true }) {
  const [items, setItems] = useState([]);
  const [current, setCurrent] = useState(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    fetch("/api/owned-social")
      .then((r) => r.json())
      .then((body) => { if (live && body && body.ok === true && Array.isArray(body.items)) setItems(body.items); })
      .catch(() => {});
    return () => { live = false; };
  }, [active]);
  const close = () => { dialogRef.current?.close(); setCurrent(null); };
  const open = (item) => { setCurrent(item); dialogRef.current?.showModal(); };
  const label = current ? `${current.title || "Wayfind post"} on Instagram` : "Wayfind post";
  const source = current ? safeUrl(current.permalink) : null;
  return <>
    <OwnedSocialCards items={items} onOpen={open} />
    <dialog ref={dialogRef} aria-label={label} onCancel={close} onClose={() => setCurrent(null)} onClick={(event) => { if (event.target === event.currentTarget) close(); }} style={{ padding: 0, width: "min(440px, calc(100vw - 24px))", maxHeight: "90dvh", border: "1px solid #26303B", borderRadius: 16, background: "#0D1117", color: "#F1F5F9", overflowY: "auto" }}>
      <div onClick={(event) => event.stopPropagation()}>
        <div style={{ position: "sticky", top: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 14px", background: "#0D1117" }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{current && current.title ? current.title : "Watch in Wayfind"}</span>
          <button type="button" autoFocus onClick={close} aria-label="Close post" style={{ minWidth: 44, minHeight: 44, border: 0, borderRadius: 99, background: "#161B22", color: "#fff", cursor: "pointer", fontSize: 22 }}>×</button>
        </div>
        {current ? <CreatorVideoPlayer platform="instagram" url={current.permalink} label={label} /> : null}
        {current && source ? <a href={source} target="_blank" rel="noopener" style={{ display: "inline-block", padding: "4px 14px 16px", fontSize: 12.5, color: "#FF9B50" }}>Open on Instagram ↗</a> : null}
      </div>
    </dialog>
  </>;
}
