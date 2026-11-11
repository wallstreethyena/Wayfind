// Shared recovery view for event pages that no longer resolve (ended, removed,
// malformed slug). Rendered inside the Next not-found boundary, so the HTTP
// status stays a real 404. Pure static markup: no data fetching, no cookies or
// headers, internal links only.
const CARDS = [
  { href: "/christmas-in-florida", emoji: "🎄", title: "Christmas in Florida", sub: "Holiday events with tickets", accent: true },
  { href: "/events", emoji: "🎟️", title: "Events near you", sub: "Live events happening now" },
  { href: "/tonight", emoji: "🌙", title: "Tonight", sub: "Ideas for tonight near you" },
  { href: "/things-to-do", emoji: "🧭", title: "Things to do", sub: "Top rated places to go" },
];

export default function EventNotFoundRecovery() {
  return (
    <div style={{ background: "#0D1117", minHeight: "70vh", color: "#CBD5E1", fontFamily: "var(--wf-sans)", padding: "40px 16px 56px" }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#F1F5F9", margin: 0, lineHeight: 1.25 }}>This event has wrapped or moved</h1>
        <p style={{ fontSize: 15, color: "#94A3B8", margin: "10px 0 20px", lineHeight: 1.55 }}>See what's on now</p>
        <div style={{ display: "grid", gap: 12 }}>
          {CARDS.map((c) => (
            <a
              key={c.href}
              href={c.href}
              style={{
                display: "flex", alignItems: "center", gap: 14, minHeight: 76, boxSizing: "border-box",
                padding: "14px 16px", borderRadius: 16, textDecoration: "none",
                background: c.accent ? "#F97316" : "#161B22",
                border: c.accent ? "1px solid #F97316" : "1px solid #2A3441",
                color: c.accent ? "#0D1117" : "#F1F5F9",
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 30, lineHeight: 1, flex: "0 0 auto" }}>{c.emoji}</span>
              <span style={{ display: "block", flex: "1 1 auto", minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 17, fontWeight: 800 }}>{c.title}</span>
                <span style={{ display: "block", fontSize: 13, marginTop: 2, color: c.accent ? "#1F1308" : "#94A3B8" }}>{c.sub}</span>
              </span>
              <span aria-hidden="true" style={{ fontSize: 20, fontWeight: 800, flex: "0 0 auto" }}>›</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
