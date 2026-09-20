"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation.js";
import CommunityFooter from "./CommunityFooter";

// An allowlist keeps account, operational, and future private routes out of
// this public-page control. Home already has feedback beside search/footer.
const PUBLIC_ROUTES = new Set([
  "guides", "p", "places", "restaurants", "nightlife", "things-to-do",
  "eat", "culture", "beaches", "best-beaches", "beach-conditions",
  "best-of", "hidden-gems", "date-night", "family", "tonight", "budget",
  "worth-the-drive", "seasonal", "summer-picks", "quick-bite", "nearby",
  "trending", "trending-now", "events", "florida-events", "florida",
  "creators", "partners", "go", "r", "l", "s", "about",
  "how-wayfind-ranks", "editorial-policy",
]);

export function feedbackPathname(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  const path = value.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  return PUBLIC_ROUTES.has(path.split("/")[1]) ? path : null;
}

const CSS = `
.wf-site-feedback-trigger{position:fixed;right:max(10px,env(safe-area-inset-right));bottom:calc(104px + env(safe-area-inset-bottom));z-index:950;min-height:36px;padding:8px 12px;border:1px solid #2D3748;border-radius:999px;background:#161B22;color:#CBD5E1;font:700 12px var(--wf-sans,sans-serif);box-shadow:0 3px 14px rgba(0,0,0,.2);cursor:pointer}
.wf-site-feedback-trigger:focus-visible,.wf-site-feedback-close:focus-visible{outline:2px solid #F97316;outline-offset:3px}
.wf-site-feedback-panel{position:fixed;right:max(10px,env(safe-area-inset-right));bottom:calc(104px + env(safe-area-inset-bottom));z-index:951;width:min(390px,calc(100vw - 20px - env(safe-area-inset-left) - env(safe-area-inset-right)));max-height:calc(100dvh - 132px - env(safe-area-inset-top) - env(safe-area-inset-bottom));overflow:auto;overscroll-behavior:contain;box-sizing:border-box;padding:12px;border:1px solid #2D3748;border-radius:16px;background:#161B22;color:#F1F5F9;box-shadow:0 10px 38px rgba(0,0,0,.4);font-family:var(--wf-sans,sans-serif)}
.wf-site-feedback-panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:4px;padding-left:4px}
.wf-site-feedback-panel-head h2{margin:0;font-size:14px;font-weight:700}
.wf-site-feedback-close{min-width:36px;min-height:36px;padding:5px;background:none;border:0;border-radius:8px;color:#CBD5E1;font:inherit;font-size:20px;cursor:pointer}
.wf-site-feedback-panel input,.wf-site-feedback-panel textarea{font-size:16px!important}
@media(max-width:480px){.wf-site-feedback-trigger{min-height:40px}.wf-site-feedback-panel{padding:9px}}
`;

// Exported separately so a guard renders the real shared form in its open
// state. It is a nonmodal panel: no backdrop, scroll lock, or focus trap.
export function SiteFeedbackPanel({ pathname, onClose, panelId = "wf-site-feedback-panel" }) {
  const path = feedbackPathname(pathname);
  if (!path) return null;
  return (
    <section id={panelId} role="region" aria-labelledby={panelId + "-title"} className="wf-site-feedback-panel" data-feedback-path={path}>
      <div className="wf-site-feedback-panel-head">
        <h2 id={panelId + "-title"}>Share feedback</h2>
        <button type="button" className="wf-site-feedback-close" aria-label="Close feedback" onClick={onClose}>×</button>
      </div>
      <CommunityFooter compact initialOpen hideTrigger path={path} onClose={onClose} />
    </section>
  );
}

function FeedbackControl({ pathname }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelId = useId();
  function closeFeedback() {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeFeedback(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
  return <>
    <style>{CSS}</style>
    <button ref={triggerRef} type="button" className="wf-site-feedback-trigger" aria-expanded={open} aria-controls={panelId} onClick={() => open ? closeFeedback() : setOpen(true)} style={open ? { visibility: "hidden" } : undefined}>Feedback</button>
    {open && <SiteFeedbackPanel pathname={pathname} panelId={panelId} onClose={closeFeedback} />}
  </>;
}

export default function SiteFeedback() {
  const pathname = feedbackPathname(usePathname());
  // The key discards the prior page's open panel/draft on navigation. The
  // form aborts its request on unmount; no old path leaks into a new page.
  return pathname ? <FeedbackControl key={pathname} pathname={pathname} /> : null;
}
