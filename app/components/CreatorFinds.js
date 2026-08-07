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
//
// v6.98 — COVERAGE. The row was built to render nothing when empty, which is
// right. It was not built for ONE. A reader in Parrish got a single orphan card
// with dead space to the right of it, which reads as a broken feature rather
// than as thin coverage — the owner's own report, and fair.
//
// The limit is not the creator library, it is the PLACE POOL: `videoPlaces` can
// only contain places Google already loaded near the reader (17 mi by default),
// so curated spots 30 miles up the road are invisible even though they exist.
//
// RANKING_AND_FEATURING_SPEC.md §4 already ruled on this: "Below threshold
// (< 3 qualifying places in radius), do not render a thin local list — offer
// the nearest covered metro ('worth the drive')... A thin list teaches someone
// the ranking is bad; an honest empty state teaches them it is careful."
// This is that rule, applied to the one surface that never got it.
import { PLATFORM } from "../../lib/creatorVideos";
import { CREATOR_FINDS_MAX, CREATOR_FINDS_MIN, CREATOR_BRIDGE_MAX_MI, orderFinds, bridgeCity, scoutedSpots } from "../../lib/creatorFinds";
import { C, TYPE } from "./kit";

// Re-exported so existing importers keep working; the logic itself lives in
// lib/creatorFinds.js so a guard can EXECUTE it instead of grepping for it.
export { CREATOR_FINDS_MAX, CREATOR_FINDS_MIN, CREATOR_BRIDGE_MAX_MI, orderFinds, bridgeCity, scoutedSpots };

export default function CreatorFinds({ items, byCity, onOpenPlace, onBrowse, onLog }) {
  const rows = orderFinds(items).slice(0, CREATOR_FINDS_MAX);
  const bridge = bridgeCity(byCity, rows.length);
  // 2026-08-07 (owner: "I don't see creators on Sarasota"). When the loaded
  // Google pool surfaced NO creator-video place — so `rows` is empty — the row
  // used to show only a single "More finds in {city}" arrow, which reads as
  // absence. But the registry DOES hold that city's scouted spots
  // (spotsByCity → byCity); they were simply not in the pool Google loaded
  // nearby. Render them directly as cards (name + creator + platform) so the
  // differentiator is visible. Photos need a placeId backfill that is blocked
  // on the service key, so these cards are photoless for now — the same honest
  // shape the browse sheet already uses. Tapping opens the browse sheet.
  const scouted = scoutedSpots(byCity, bridge, rows.length, CREATOR_FINDS_MAX);
  // Nothing local, no registry spots, AND nowhere to point them. Render NOTHING
  // rather than an empty shelf — an empty "your differentiator" row advertises
  // the absence.
  if (!rows.length && !scouted.length && !bridge) return null;
  // "Local" is a claim. With no local find at all, the heading names the place
  // the finds are actually in, rather than calling another city's spots yours.
  const heading = rows.length ? "Finds from local creators" : `Creators in ${bridge.city}`;
  return (
    <section aria-label="Finds from local creators" style={{ marginBottom: 12 }}>
      <div style={{ ...TYPE.eyebrow, fontSize: 10, color: C.muted, marginBottom: 8 }}>{heading}</div>
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
        {/* Registry-hydrated cards when the pool surfaced nothing: the city's
            actual scouted spots, name + creator + platform, photoless for now.
            Tapping opens the browse sheet where the reel plays. */}
        {scouted.map((s, i) => {
          const v = s && s.video;
          const plat = v && PLATFORM[v.platform];
          return (
            <button key={s.key || i} onClick={() => { try { onLog && onLog("creator_find_open", { id: s.key, name: s.name }, { pos: i, creator: (v && v.creator) || null, hydrated: "registry" }); } catch (e) {} if (onBrowse) onBrowse(); }}
              style={{ flexShrink: 0, width: 132, textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
              <span style={{ display: "flex", width: 132, height: 96, borderRadius: 11, alignItems: "center", justifyContent: "center", background: C.card, border: `1px solid ${C.border}`, position: "relative" }}>
                {plat ? (
                  <span style={{ position: "absolute", top: 6, left: 6, display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 6, background: "rgba(0,0,0,.62)", fontSize: 9.5, fontWeight: 800, color: plat.color }}>
                    <span style={{ width: 5, height: 5, borderRadius: 3, background: plat.color, display: "inline-block" }} />{plat.label}
                  </span>
                ) : null}
                <span aria-hidden="true" style={{ fontSize: 26, lineHeight: 1 }}>📍</span>
              </span>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: C.text, marginTop: 6, lineHeight: 1.28 }}>{s.name}</span>
              {v && v.creator ? <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 2 }}>@{v.creator}</span> : null}
            </button>
          );
        })}
        {bridge && !scouted.length ? (
          <button onClick={() => { try { onLog && onLog("creator_find_bridge_open", null, { city: bridge.city, spots: bridge.count, local: rows.length }); } catch (e) {} if (onBrowse) onBrowse(); }}
            style={{ flexShrink: 0, width: 132, textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
            <span style={{ display: "flex", width: 132, height: 96, borderRadius: 11, alignItems: "center", justifyContent: "center", background: C.card, border: `1px solid ${C.border}` }}>
              <span aria-hidden="true" style={{ fontSize: 22, color: C.accent, lineHeight: 1 }}>→</span>
            </span>
            <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: C.text, marginTop: 6, lineHeight: 1.28 }}>More finds in {bridge.city}</span>
            <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 2 }}>{bridge.count} spots scouted</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
