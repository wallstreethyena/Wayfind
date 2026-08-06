"use client";
// app/components/CreatorFinds.js — "Finds from local creators".
//
// v6.97. The owner's note on the approved mockup: "Your differentiator, and the
// one thing no competitor has. It keeps its own row."
//
// It did not have a row. app/home.js has been COMPUTING this list on every
// render — dedupe the nearby pool, keep the places with a curated creator
// video, sort by score, take eight — and passing it into BestNearby as
// `videoPlaces`, where the only thing that reads it is the "Local trends"
// section, which is switched off (`SHOW_TRENDS = false`). So the work was done
// and the result was thrown away on every render. This renders it.
//
// What each card shows is deliberately narrow: the place's OWN photo, the
// creator's handle, and the platform. Never the creator's video thumbnail —
// that is the never-re-host rule from CREATOR_VIDEO_SPEC.md, and it is why the
// detail sheet has always used the place photo too.
import { PLATFORM } from "../../lib/creatorVideos";
import { creatorBoostFor } from "../../lib/creatorBoost";
import { C, TYPE } from "./kit";

export const CREATOR_FINDS_MAX = 8;

/**
 * Order the row. Places the creator boost actually MOVED come first, strongest
 * boost first, because that is the same judgement the ranked list above made —
 * two surfaces on one screen disagreeing about which creator pick matters most
 * is the drift this codebase keeps having to fix. Places below the quality
 * floor still appear (her work is still shown) but sort after.
 */
export function orderFinds(items) {
  return (Array.isArray(items) ? items.slice() : []).sort((a, b) => {
    const ba = creatorBoostFor(a && a.p) || 0;
    const bb = creatorBoostFor(b && b.p) || 0;
    if (ba !== bb) return bb - ba;
    return ((b.p && b.p.wfScore) || 0) - ((a.p && a.p.wfScore) || 0);
  });
}

export default function CreatorFinds({ items, onOpenPlace, onLog }) {
  const rows = orderFinds(items).slice(0, CREATOR_FINDS_MAX);
  // No creators near this reader yet. Render NOTHING rather than an empty
  // shelf — an empty "your differentiator" row advertises the absence.
  if (!rows.length) return null;
  return (
    <section aria-label="Finds from local creators" style={{ marginBottom: 12 }}>
      <div style={{ ...TYPE.eyebrow, fontSize: 10, color: C.muted, marginBottom: 8 }}>Finds from local creators</div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
        {rows.map(({ p, videos }, i) => {
          const v = (videos || [])[0];
          const plat = v && PLATFORM[v.platform];
          return (
            <button key={p.id} onClick={() => { try { onLog && onLog("creator_find_open", { id: p.id, name: p.name }, { pos: i, creator: (v && v.creator) || null }); } catch (e) {} if (onOpenPlace) onOpenPlace(p); }}
              style={{ flexShrink: 0, width: 132, textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
              <span style={{ display: "block", width: 132, height: 96, borderRadius: 11, overflow: "hidden", background: C.card, position: "relative" }}>
                {p.photo ? <img src={p.photo} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                {plat ? (
                  <span style={{ position: "absolute", top: 6, left: 6, display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 6, background: "rgba(0,0,0,.62)", fontSize: 9.5, fontWeight: 800, color: plat.color }}>
                    <span style={{ width: 5, height: 5, borderRadius: 3, background: plat.color, display: "inline-block" }} />{plat.label}
                  </span>
                ) : null}
              </span>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: C.text, marginTop: 6, lineHeight: 1.28 }}>{p.name}</span>
              {v && v.creator ? <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 2 }}>@{v.creator}</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
