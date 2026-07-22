// RankedExperiencePage — THE standard shell for hero-card destination pages
// (owner, 2026-07-21: /best-beaches is the visual standard; date-night,
// family, and everything after stamp from this). Pure presentational, no
// hooks — usable from server and client pages alike. No logo box over the
// photo (a quiet wordmark link instead); medals top-3; green Scores;
// metric-honest why-lines arrive from the caller.
const C = { bg: "#040810", card: "#0B0E15", border: "rgba(255,255,255,.08)", text: "#F1F5F9", muted: "#8b93a1", accent: "#F97316", gold: "#E8C97A", green: "#3ee08a" };
const MEDAL = ["#E8C97A", "#C7CCD6", "#B8804A"];

export function Trophy({ i }) {
  if (i > 2) return <span style={{ fontSize: 14, fontWeight: 800, color: C.muted }}>{i + 1}</span>;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={MEDAL[i]} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label={"Rank " + (i + 1)}>
      <path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" /><path d="M7 6H4a1 1 0 0 0-1 1c0 2.2 1.8 4 4 4" /><path d="M17 6h3a1 1 0 0 1 1 1c0 2.2-1.8 4-4 4" />
    </svg>
  );
}

export function RankedRow({ i, href, img, title, score, why, editorial }) {
  return (
    <li style={{ borderTop: "1px solid " + C.border }}>
      <a href={href} style={{ display: "flex", gap: 14, padding: "16px 0", alignItems: "flex-start", textDecoration: "none", color: "inherit" }}>
        <div style={{ width: 30, flexShrink: 0, textAlign: "center", paddingTop: 2 }}><Trophy i={i} /></div>
        {img ? <img src={img} alt="" loading="lazy" style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", flexShrink: 0, border: "1px solid " + C.border }} /> : null}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 17, fontWeight: 750, color: C.text }}>{title}</span>
            {score != null ? <span style={{ fontSize: 14, fontWeight: 800, color: C.green }}>{score}</span> : null}
          </div>
          {why ? <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, margin: "4px 0 0" }}>{why}</p> : null}
          {editorial ? <p style={{ fontSize: 12.5, color: "rgba(241,245,249,.75)", lineHeight: 1.5, margin: "5px 0 0" }}>{editorial}</p> : null}
        </div>
        <span aria-hidden="true" style={{ alignSelf: "center", color: "rgba(255,255,255,.3)", fontSize: 18, flexShrink: 0 }}>›</span>
      </a>
    </li>
  );
}

export default function RankedExperiencePage({ eyebrow, titleTop, titleBottom, subtitle, heroImg, accent, children, footNote, topLeft }) {
  return (
    <main style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <header style={{ position: "relative", height: 300, overflow: "hidden" }}>
        {heroImg && <img src={heroImg} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(4,8,16,.25) 0%, rgba(4,8,16,.55) 55%, #040810 100%)" }} />
        {topLeft || null}
        <a href="/" aria-label="Wayfind home" style={{ position: "absolute", top: 18, left: 0, right: 0, display: "block", maxWidth: 680, margin: "0 auto", padding: "0 20px", fontSize: 21, fontWeight: 800, color: "rgba(241,245,249,.95)", textDecoration: "none", textShadow: "0 1px 6px rgba(0,0,0,.7)", letterSpacing: "-0.3px" }}>way<span style={{ position: "relative", display: "inline-block" }}>f<span style={{ position: "relative", display: "inline-block" }}>ı<span aria-hidden="true" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: "-0.14em", width: "0.24em", height: "0.24em", borderRadius: "50%", background: C.accent }} /></span></span>nd</a>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 18 }}>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", color: accent || C.gold }}>{eyebrow}</div>
            <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.8px", lineHeight: 1.05, margin: "8px 0 6px", textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>{titleTop}{titleBottom ? <><br />{titleBottom}</> : null}</h1>
            <p style={{ fontSize: 13.5, color: "rgba(241,245,249,.85)", margin: 0, maxWidth: 430 }}>{subtitle}</p>
          </div>
        </div>
      </header>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "18px 20px 60px" }}>
        {children}
        {footNote ? <p style={{ fontSize: 11, color: C.muted, marginTop: 26, lineHeight: 1.5 }}>{footNote}</p> : null}
      </div>
    </main>
  );
}
