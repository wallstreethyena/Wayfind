"use client";
// v6.44 — THE LANDING JUMP.
//
// Owner-reported, with a photo: on iPhone the app lands with its own topbar
// (logo, city, weather) and the search field sitting BEHIND Safari's
// translucent status bar and URL bar, an events rail clipped at the bottom,
// and a dead black strip above the tab bar.
//
// Cause: the home route's document was TALLER than the app. The app shell is
// exactly 100dvh (app/home.js), but the shared server footer below it — which
// exists for crawlers, not for a phone screen — added several hundred pixels
// of real document height. Every one of those pixels is document scroll, and
// document scroll on a 100dvh app UI does not scroll CONTENT, it drags the
// whole application up under the browser chrome. Safari also restores that
// scroll offset on a return visit, which is why it looked wrong ON LANDING
// without anyone touching it.
//
// This is the exact problem app/components/ProofVeil.js already solved in
// v6.26 for the SSR proof block ("no layout, no scroll reach, no bleed-
// through"), applied to the one other below-the-app server block that was
// left behind. Same technique, same reasoning:
//   - SSR and the first client render are IDENTICAL (no hydration mismatch)
//   - the footer stays in the rendered DOM, so its SEO value is untouched
//   - it is veiled ONLY on "/" — the single route that renders the app shell.
//     /guides, /culture, /about, /terms and every article route keep a normal,
//     fully visible footer, because those are documents and they scroll.
//
// The in-app legal links (app/home.js Privacy / Terms) are what a phone user
// reaches on "/", so nothing is stranded by the veil.
//
// Pair with app/layout.js: <html> carries no forced height and <body>/<main>
// are min-height:100dvh, so with the footer veiled the home document is
// exactly as tall as the app and CANNOT scroll. scripts/check-app-viewport.mjs
// keeps both halves of that contract shut.
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// The visually-hidden recipe from ProofVeil, kept byte-identical so the two
// veils can never drift into two different definitions of "hidden".
const VEIL = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  pointerEvents: "none",
};

export default function FooterVeil({ children }) {
  const ref = useRef(null);
  const pathname = usePathname();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // "/" is the ONLY route that renders the app shell; /events, /map,
    // /coupons, /favorites and /itinerary are plain documents that redirect
    // into it (app/components/GoScreen.js).
    if (pathname === "/" || (pathname && pathname.startsWith("/p/"))) {
      el.setAttribute("aria-hidden", "true");
      for (const k of Object.keys(VEIL)) el.style[k] = VEIL[k];
    } else {
      // Client-side navigation OFF the app route must give the footer back.
      el.removeAttribute("aria-hidden");
      for (const k of Object.keys(VEIL)) el.style[k] = "";
    }
  }, [pathname]);
  return <div ref={ref}>{children}</div>;
}
