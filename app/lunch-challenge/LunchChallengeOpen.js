"use client";

import { useEffect } from "react";

export default function LunchChallengeOpen() {
  useEffect(() => {
    window.location.replace("/?go=lunch&challenged=1");
  }, []);
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#06080D", color: "#FFFFFF", fontFamily: "var(--wf-sans)" }}>
      <section style={{ width: "min(100%, 430px)", padding: "28px 24px", borderRadius: 24, border: "1px solid rgba(249,115,22,.7)", background: "linear-gradient(145deg,#151A23,#081126)", boxShadow: "0 22px 60px rgba(0,0,0,.55)", textAlign: "center" }}>
        <div style={{ display: "inline-flex", padding: "6px 11px", borderRadius: 999, background: "#F97316", color: "#10151B", fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>YOU’VE BEEN CHALLENGED</div>
        <h1 style={{ margin: "16px 0 8px", fontSize: 34, lineHeight: 1, letterSpacing: "-1px" }}>Lunch in My City</h1>
        <p style={{ margin: "0 auto 20px", maxWidth: 330, color: "#CBD5E1", fontSize: 16, lineHeight: 1.5 }}>Tap the question block and let Wayfind choose one standout lunch near you.</p>
        <a href="/?go=lunch&challenged=1" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 50, padding: "0 20px", borderRadius: 14, border: "2px solid #F8D447", background: "linear-gradient(135deg,#F97316,#FBBF24)", color: "#10151B", textDecoration: "none", fontWeight: 900 }}>Accept the challenge</a>
      </section>
    </main>
  );
}
