"use client";
import { useEffect, useRef, useState } from "react";
import { loadAppleMapKit } from "../../lib/appleMapsRuntime.js";
import { createCreatorAppleMap } from "../../lib/creatorAppleMap.js";

export default function CreatorAppleMap({ places, onSelect }) {
  const host = useRef(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let dead = false;
    let controller;
    setStatus("loading");
    loadAppleMapKit(process.env.NEXT_PUBLIC_APPLE_MAPS_TOKEN).then(mapkit => {
      if (dead || !host.current) return;
      controller = createCreatorAppleMap({ mapkit, container: host.current, places, onSelect: id => selectRef.current?.(id) });
      setStatus("ready");
    }).catch(() => { if (!dead) setStatus("error"); });
    return () => { dead = true; controller?.destroy(); };
  }, [places, attempt]);
  return <>
    <div ref={host} aria-label="Apple map of reviewed places" style={{ position: "absolute", inset: 0 }} />
    {status !== "ready" ? <div role="status" style={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", padding: 28, textAlign: "center", background: "#142022", color: "#dce5df" }}>
      <p>{status === "error" ? "Apple Maps is unavailable right now. Explore every reviewed place in the collection below." : "Opening Cindy’s places in Apple Maps…"}</p>
      {status === "error" ? <button type="button" onClick={() => setAttempt(a => a + 1)} style={{ padding: 12, borderRadius: 20, cursor: "pointer" }}>Retry map</button> : null}
    </div> : null}
  </>;
}
