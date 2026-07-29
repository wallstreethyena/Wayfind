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
    <>
    <style dangerouslySetInnerHTML={{ __html: `
      .wf-open-app-cta{
        position:fixed;right:22px;bottom:calc(env(safe-area-inset-bottom,0px) + 18px);
        z-index:2147483000;display:inline-flex;align-items:center;gap:7px;
        background:rgba(246,120,34,.94);color:#0D1117;font-weight:850;font-size:13px;
        padding:10px 15px;border-radius:999px;text-decoration:none;
        box-shadow:0 10px 28px rgba(0,0,0,.38),0 0 0 1px rgba(255,255,255,.16);
        backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
        max-width:calc(100vw - 28px);white-space:nowrap;
        transition:transform .18s ease,box-shadow .18s ease;
      }
      .wf-open-app-cta:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(0,0,0,.43),0 0 0 1px rgba(255,255,255,.2)}
      .wf-open-app-mark{font-size:14px;font-weight:900;letter-spacing:-.3px}
      @media(max-width:760px){
        .wf-open-app-cta{right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);font-size:12px;padding:9px 13px}
        .wf-open-app-mark{display:none}
        .wf-open-app-dot{display:none}
      }
      @media(prefers-reduced-motion:reduce){.wf-open-app-cta{transition:none}}
    ` }} />
    <a
      href={to}
      aria-label={label}
      className="wf-open-app-cta"
    >
      <span className="wf-open-app-mark">wayfind</span>
      <span className="wf-open-app-dot" style={{ opacity: 0.7 }}>·</span>
      <span>{label} →</span>
    </a>
    </>
  );
}
