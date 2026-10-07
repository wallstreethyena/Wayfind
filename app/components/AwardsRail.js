// app/components/AwardsRail.js — the permanent "Awards & recognition" rail on
// the place detail page (owner, 2026-10-06). One tile per Wayfind award the
// place holds, newest first. A place with no awards renders NOTHING: no
// header, no empty box.
import AwardBadge from "./AwardBadge";
import { wayfindAwardsFor } from "../../lib/wayfindAwards.js";

const TEXT = "#F1F5F9";
const MUTED = "#94A3B8";

export default function AwardsRail({ place, awards, colors }) {
  const list = Array.isArray(awards) ? awards : wayfindAwardsFor(place);
  if (!list || !list.length) return null;
  const c = colors || {};
  const text = c.text || TEXT;
  const muted = c.muted || MUTED;
  return (
    <section className="wf-awards-rail" aria-label="Awards and recognition" style={{ margin: "0 0 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: text }}>Awards &amp; recognition</h3>
        <span style={{ fontSize: 12, color: muted }}>{list.length === 1 ? "1 award" : list.length + " awards"}</span>
      </div>
      <div
        role="list"
        tabIndex={0}
        aria-label="Awards"
        className="wf-awards-rail-scroll"
        style={{ display: "flex", gap: 10, overflowX: "auto", overscrollBehaviorX: "contain", scrollSnapType: "x mandatory", scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
      >
        {list.map((a) => (
          <div
            key={a.id}
            role="listitem"
            aria-label={a.ariaLabel}
            style={{ flex: "0 0 236px", width: 236, boxSizing: "border-box", scrollSnapAlign: "start", display: "flex", alignItems: "center", gap: 10, border: "1px solid rgba(252,110,9,.65)", background: "linear-gradient(120deg, rgba(252,110,9,.16), rgba(252,110,9,.02) 70%)", borderRadius: 16, padding: "10px 12px 10px 8px" }}
          >
            <AwardBadge variant="sticker" year={a.year} label={a.ariaLabel} style={{ width: 62, flex: "0 0 62px", height: "auto" }} />
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".2em", color: "#FC6E09" }}>{a.year} WINNER</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: text, lineHeight: 1.2 }}>{a.name}</span>
              <span style={{ fontSize: 12, color: muted, lineHeight: 1.3 }}>{a.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
