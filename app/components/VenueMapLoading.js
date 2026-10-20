"use client";

import MapCategoryPin from "./MapCategoryPin.js";

// The loading and live map share their category row, frame and responsive
// height. Loading only the frame moved every detail section below it when
// the browser-only map added its controls.
export const VENUE_MAP_SHELL_CSS = `
.wfev-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;align-items:stretch}
.wfev-cats{display:flex;gap:6px;min-width:0;overflow-x:auto;overscroll-behavior-x:contain;padding:7px;border-radius:16px;background:#0F1520;border:1px solid rgba(148,163,184,.2);-webkit-overflow-scrolling:touch;scrollbar-width:none}.wfev-cats::-webkit-scrollbar{display:none}
.wfev-cat{display:flex;align-items:center;gap:8px;width:auto;min-width:0;min-height:44px;flex:0 0 auto;margin:0;padding:9px 10px;border-radius:11px;border:1px solid transparent;background:transparent;color:#94A3B8;font:inherit;font-size:13px;font-weight:750;text-align:left;white-space:nowrap;cursor:pointer}
.wfev-cat:focus-visible{outline:2px solid #FDBA74;outline-offset:-2px}
.wfev-cat:hover{background:rgba(148,163,184,.08);color:#CBD5E1}.wfev-cat[aria-pressed="true"]{border-color:rgba(249,115,22,.45);background:rgba(249,115,22,.12);color:#FDBA74}
.wfev-cat i{display:grid;place-items:center;width:19px;flex:0 0 19px;font-size:15px;font-style:normal}.wfev-cat span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wfev-cat b{margin-left:auto;color:#F8FAFC;font-variant-numeric:tabular-nums}
.wfev{position:relative;border-radius:20px;overflow:hidden;border:1px solid rgba(148,163,184,.2);background:#0F1520;box-shadow:0 24px 60px rgba(0,0,0,.45),0 0 0 1px rgba(249,115,22,.08);isolation:isolate}
.wfev-canvas{position:absolute;inset:0}.wfev-h{height:clamp(340px,52vw,460px)}
`;

export default function VenueMapLoading() {
  return <div className="wfev-grid" aria-hidden="true">
    <style dangerouslySetInnerHTML={{ __html: VENUE_MAP_SHELL_CSS }} />
    <div className="wfev-cats">
      <button type="button" className="wfev-cat" disabled tabIndex={-1}><MapCategoryPin /><span>All places</span></button>
    </div>
    <div className="wfev wfev-h" style={{ background: "linear-gradient(145deg,#17212E 0%,#0A111B 72%)" }}>
      <div style={{ position: "absolute", left: 12, top: 12, padding: "9px 13px", borderRadius: 999, background: "rgba(10,15,23,.82)", border: "1px solid rgba(148,163,184,.28)", color: "#94A3B8", fontSize: 13, fontWeight: 800 }}>Loading Apple map…</div>
    </div>
  </div>;
}
