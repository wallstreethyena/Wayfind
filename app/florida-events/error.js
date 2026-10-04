"use client";

export default function FloridaEventsError({ reset }) {
  const action = { display: "inline-flex", justifyContent: "center", padding: "12px 18px", borderRadius: 12, border: "1px solid #F97316", background: "#F97316", color: "#111827", font: "inherit", fontWeight: 800, textDecoration: "none", cursor: "pointer" };
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px", color: "#E6EDF3", fontFamily: "var(--wf-sans)", minHeight: "70vh" }}>
      <a href="/" aria-label="Wayfind home"><img src="/brand/wayfind-official-white.png" width="145" height="42" alt="Wayfind" /></a>
      <h1>We couldn’t load this event</h1>
      <p>The event details are temporarily unavailable. Try again or head back to Wayfind.</p>
      <nav aria-label="Event recovery" style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
        <button type="button" onClick={reset} style={action}>Try again</button>
        <a href="/" style={{ ...action, background: "transparent", color: "#FDBA74" }}>Back to Wayfind</a>
        <a href="/florida-events" style={{ ...action, background: "transparent", color: "#FDBA74" }}>Florida Events</a>
      </nav>
    </main>
  );
}
