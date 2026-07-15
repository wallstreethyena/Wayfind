"use client";
// v6.24 — GLOBAL "never lose the user" rule, part 2. A first-time visitor who
// lands on a static SSR page (an event/guide/culture page from Google or a
// texted link) has no app chrome and no obvious way into the live Wayfind app —
// so they bounce. This is a persistent floating pill that drops them straight
// into the app. (External links already open in a NEW TAB app-wide, so we never
// replace Wayfind; this handles the other direction — getting INTO the app.)
import { useEffect, useState } from "react";

export default function OpenAppCTA({ to = "/", label = "Open Wayfind" }) {
  const [hidden, setHidden] = useState(false);
  // Never show inside the app shell itself (only on standalone content pages).
  useEffect(() => {
    try { if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) setHidden(true); } catch (e) {}
  }, []);
  if (hidden) return null;
  return (
    <a
      href={to}
      aria-label={label}
      style={{
        position: "fixed", left: "50%", transform: "translateX(-50%)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)", zIndex: 2147483000,
        display: "inline-flex", alignItems: "center", gap: 9,
        background: "#F98626", color: "#0D1117", fontWeight: 800, fontSize: 15,
        padding: "13px 22px", borderRadius: 999, textDecoration: "none",
        boxShadow: "0 10px 30px rgba(0,0,0,.5), 0 0 0 1px rgba(0,0,0,.25)",
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
        maxWidth: "calc(100vw - 32px)", whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.3px" }}>wayfind</span>
      <span style={{ opacity: 0.85 }}>·</span>
      <span>{label} →</span>
    </a>
  );
}
