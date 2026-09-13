"use client";
import { useRef } from "react";

export default function CreatorVideoRail({ label, children, hint = "Swipe to find your next stop" }) {
  const track = useRef(null);
  const move = (direction) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * .85, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return <div style={{ minWidth: 0 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <span style={{ color: "#c3aaa2", fontSize: 12 }}>{hint}</span>
      <div style={{ display: "flex", gap: 8 }}>{[-1, 1].map(direction => <button key={direction} type="button" onClick={() => move(direction)} aria-label={`${direction < 0 ? "Previous" : "Next"} ${label}`} style={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid #65443d", background: "#302021", color: "#f0dcba", cursor: "pointer", fontSize: 20 }}>{direction < 0 ? "←" : "→"}</button>)}</div>
    </div>
    <div ref={track} role="region" aria-label={label} tabIndex={0} style={{ display: "flex", gap: 16, overflowX: "auto", overscrollBehaviorX: "contain", scrollSnapType: "x mandatory", paddingBottom: 18 }}>{children}</div>
  </div>;
}
