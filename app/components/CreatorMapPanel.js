"use client";

// Categories and Apple pins share the inventory classification. All places is the default.
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { pinFamily } from "../../lib/mapPinGlyph.js";

const CreatorAppleMap = dynamic(() => import("./CreatorAppleMap"), { ssr: false });

const FAMILY_LABEL = {
  cafe: "Coffee & cafés",
  food: "Food",
  drinks: "Drinks",
  shows: "Shows",
  outdoors: "Outdoors",
  water: "On the water",
  culture: "Culture",
  stay: "Stays",
  shop: "Shopping",
  other: "Everything else",
};

// No /* */ inside the template below — that is the lesson check-css-comment-bytes
// was written for (prose inside a template literal is not minified and ships to
// every visitor). The rationale lives here in a JS comment instead.
//
// The layout INVERTS at 760px rather than shrinking. A 220px rail beside a map
// is unusable on a phone, so below that breakpoint the categories become a
// horizontal chip row above the map — the same control, the same counts, and
// no horizontal squeeze on either half.
const CSS = `
.wfcm-grid{display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:14px;align-items:stretch}
.wfcm-side{background:#0F1520;border:1px solid rgba(148,163,184,.18);border-radius:16px;padding:10px;min-width:0}
.wfcm-row{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:9px 11px;margin-bottom:4px;border-radius:11px;border:1px solid transparent;background:transparent;color:#94A3B8;font:inherit;font-size:13.5px;font-weight:700;text-align:left;cursor:pointer}
.wfcm-row:hover{background:rgba(148,163,184,.08);color:#CBD5E1}
.wfcm-row[aria-pressed="true"]{border-color:rgba(249,115,22,.45);background:rgba(249,115,22,.12);color:#FDBA74}
.wfcm-row>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wfcm-row>b{color:#F8FAFC;font-variant-numeric:tabular-nums}
.wfcm-map{position:relative;min-height:420px;border-radius:16px;overflow:hidden;border:1px solid rgba(148,163,184,.18);min-width:0;background:#0F1520}
@media(max-width:759px){
.wfcm-grid{grid-template-columns:1fr}
.wfcm-side{display:flex;gap:8px;overflow-x:auto;overscroll-behavior-x:contain;padding:8px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.wfcm-side::-webkit-scrollbar{display:none}
.wfcm-row{width:auto;flex:0 0 auto;margin-bottom:0;white-space:nowrap}
.wfcm-map{min-height:340px}
}
`;

export default function CreatorMapPanel({ handle, places = [], intro = "" }) {
  const [active, setActive] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const rows = useMemo(
    () => (places || []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    [places],
  );

  // Total over garbage, same rule lib/mapPinGlyph.js follows: an unclassifiable
  // place lands in one honest bucket rather than throwing inside a render.
  const famOf = (p) => { try { return pinFamily(p) || "other"; } catch (e) { return "other"; } };

  // Counts are computed from the SAME rows the map draws, never from the
  // curated list — so the number beside a category is the number of pins the
  // reader can actually see and click. A count that promises a pin the map does
  // not have is the defect this shape exists to avoid.
  const groups = useMemo(() => {
    const by = new Map();
    for (const p of rows) {
      const fam = famOf(p);
      by.set(fam, (by.get(fam) || 0) + 1);
    }
    return Array.from(by, ([fam, n]) => ({ fam, label: FAMILY_LABEL[fam] || FAMILY_LABEL.other, n }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shown = useMemo(() => (active ? rows.filter((p) => famOf(p) === active) : rows), [rows, active]);

  const selected = useMemo(
    () => (selectedId ? shown.find((p) => String(p.id) === String(selectedId)) || null : null),
    [shown, selectedId],
  );

  if (!rows.length) return null;

  return (
    <section aria-label={`@${handle}'s map`} style={{ margin: "30px 0 8px" }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <h2 style={{ margin: "0 0 5px", fontSize: 21, fontWeight: 850, letterSpacing: "-.4px", color: "#F8FAFC" }}>
        @{handle}&apos;s map
      </h2>
      <p style={{ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.55, color: "#94A3B8", maxWidth: 640 }}>
        Every pin is a place @{handle} filmed herself — not a list of what happens to be nearby.
        {intro ? " " + intro : ""}
      </p>

      <div className="wfcm-grid">
        <div className="wfcm-side">
          <button type="button" className="wfcm-row" aria-pressed={active === null} onClick={() => { setActive(null); setSelectedId(null); }}>
            <span>All places</span><b>{rows.length}</b>
          </button>
          {groups.map((g) => (
            <button
              key={g.fam}
              type="button"
              className="wfcm-row"
              aria-pressed={active === g.fam}
              onClick={() => { setActive(active === g.fam ? null : g.fam); setSelectedId(null); }}
            >
              <i aria-hidden="true" style={{ fontStyle: "normal" }}>{({ cafe: "☕", food: "🍽", drinks: "🍸", culture: "🏛", outdoors: "🌳", water: "🌊", shop: "🛍", stay: "🛏", shows: "🎭" })[g.fam] || "📍"}</i><span>{g.label}</span><b>{g.n}</b>
            </button>
          ))}
        </div>

        <div className="wfcm-map">
          <CreatorAppleMap places={shown} onSelect={setSelectedId} />
        </div>
      </div>

      {/* A tapped pin has to GO somewhere. Without this the map is a picture:
          the reader finds the cafe she liked, taps it, and the pin turns orange
          and nothing else happens. The two links are the two things they can
          want next — the place in Wayfind (hours, directions, what to pair it
          with) and the creator's own video. */}
      {selected ? (
        <div style={{ marginTop: 12, padding: "12px 14px", background: "#0F1520", border: "1px solid rgba(249,115,22,.35)", borderRadius: 14 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: "#F8FAFC" }}>{selected.name}</div>
          <div style={{ fontSize: 12.5, color: "#8B949E", marginTop: 2 }}>
            {[selected.city, selected.rating ? `${selected.rating.toFixed(1)}★${selected.reviews ? ` · ${selected.reviews.toLocaleString()} reviews` : ""}` : null].filter(Boolean).join(" · ")}
          </div>
          <div style={{ marginTop: 9 }}>
            <a href={`https://maps.apple.com/?daddr=${selected.lat},${selected.lng}&dirflg=d`} target="_blank" rel="noopener" style={{ color: "#eed4a6", marginRight: 16, fontWeight: 800 }}>Directions ↗</a>
            <a href={`/p/${encodeURIComponent(selected.id)}`} style={{ fontSize: 13.5, fontWeight: 800, color: "#F97316", textDecoration: "none", marginRight: 16 }}>
              Open in Wayfind →
            </a>
            {selected.videoUrl ? (
              <a href={selected.videoUrl} target="_blank" rel="noopener" style={{ fontSize: 13.5, fontWeight: 800, color: "#CBD5E1", textDecoration: "none" }}>
                Watch @{handle}&apos;s video ↗
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <p style={{ marginTop: 10, fontSize: 12.5, color: "#6E7681" }}>Tap a pin to open the place, or pick a category to filter the map.</p>
      )}
    </section>
  );
}
