"use client";

import { useEffect, useState } from "react";

export default function EventStory({ eventId, initialStory }) {
  const [story, setStory] = useState(initialStory);
  useEffect(() => {
    let alive = true;
    fetch("/api/events/story", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: eventId }),
    }).then((r) => r.ok ? r.json() : null).then((data) => {
      if (alive && data && data.story) setStory(data.story);
    }).catch(() => {});
    return () => { alive = false; };
  }, [eventId]);
  if (!story) return null;
  return (
    <section aria-label="Why this event may fit your plans" style={{ marginTop: 16, padding: "18px", borderRadius: 16, border: "1px solid #2B374A", background: "linear-gradient(145deg,#172130 0%,#101720 100%)", boxShadow: "0 14px 34px rgba(0,0,0,.22)" }}>
      <div style={{ color: "#2EC9A6", fontSize: 11, fontWeight: 900, letterSpacing: ".14em", textTransform: "uppercase" }}>{story.eyebrow}</div>
      <p style={{ margin: "9px 0 0", color: "#F1F5F9", fontSize: 16, fontWeight: 700, lineHeight: 1.48 }}>{story.whyGo}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 9, marginTop: 15 }}>
        <div style={{ minWidth: 0, padding: "11px 12px", borderRadius: 12, background: "rgba(255,255,255,.035)", border: "1px solid #2B374A" }}>
          <div style={{ color: "#94A3B8", fontSize: 9.5, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>Best for</div>
          <div style={{ color: "#E2E8F0", fontSize: 12.5, fontWeight: 800, lineHeight: 1.35, marginTop: 5 }}>{story.bestFor}</div>
        </div>
        <div style={{ minWidth: 0, padding: "11px 12px", borderRadius: 12, background: "rgba(255,255,255,.035)", border: "1px solid #2B374A" }}>
          <div style={{ color: "#94A3B8", fontSize: 9.5, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>What to expect</div>
          <div style={{ color: "#E2E8F0", fontSize: 12.5, fontWeight: 800, lineHeight: 1.35, marginTop: 5 }}>{story.expect}</div>
        </div>
      </div>
    </section>
  );
}
