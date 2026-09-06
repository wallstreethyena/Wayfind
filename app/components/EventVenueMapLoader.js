"use client";

// The map is browser-only (WebGL, geolocation). App Router only allows
// `ssr: false` from a client module, so this thin shim exists to hold it —
// EventWhere stays a server component and both event pages stay SSR.
import dynamic from "next/dynamic";

const EventVenueMap = dynamic(() => import("./EventVenueMap"), {
  ssr: false,
  loading: () => (
    <div className="wfev wfev-h" aria-hidden="true" style={{ position: "relative", borderRadius: 20, overflow: "hidden", border: "1px solid rgba(148,163,184,.2)", background: "linear-gradient(145deg,#17212E 0%,#0A111B 72%)", minHeight: 340 }}>
      <div style={{ position: "absolute", left: 12, top: 12, padding: "9px 13px", borderRadius: 999, background: "rgba(10,15,23,.82)", border: "1px solid rgba(148,163,184,.28)", color: "#94A3B8", fontSize: 13, fontWeight: 800 }}>Loading map…</div>
    </div>
  ),
});

export default function EventVenueMapLoader(props) {
  return <EventVenueMap {...props} />;
}
