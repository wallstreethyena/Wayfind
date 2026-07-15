"use client";
// v6.26 — the SSR "What Wayfind answers with" proof block (app/page.js) exists
// for crawlers and link previews, and lives BELOW the app in the document. On a
// real device it was reachable by scroll and showed up as a "loose footer"
// under every screen. This keeps it in the rendered DOM (so its SEO value is
// intact) but visually removes it from the interactive view once JS mounts —
// no layout, no scroll reach, no bleed-through. SSR and the first client render
// are identical, so there is no hydration mismatch.
import { useEffect, useRef } from "react";

export default function ProofVeil({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.setAttribute("aria-hidden", "true");
    const s = el.style;
    s.position = "absolute";
    s.width = "1px";
    s.height = "1px";
    s.overflow = "hidden";
    s.clip = "rect(0 0 0 0)";
    s.clipPath = "inset(50%)";
    s.pointerEvents = "none";
  }, []);
  return <div ref={ref}>{children}</div>;
}
