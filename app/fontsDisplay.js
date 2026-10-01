// app/fontsDisplay.js — Wayfind's display face (Fraunces, --wf-display), scoped
// to the routes that set it and PRELOADED there (2026-10-01, the "Right now"
// font jump).
//
// HISTORY. Fraunces used to be declared in app/fonts.js, which the root layout
// imports. v7.29 turned its preload off because that put a 67KB font at top
// fetch priority on every route, including the home page, which renders no
// Fraunces glyph. But with preload off, the routes that DO set it discover the
// file only after CSS and layout, so it lands after first paint and the swap
// reflows the page under the reader. Measured on production (slow-4G model,
// 390px, Orlando guide): requested at ~4.8s, applied ~0.9s after first paint,
// "Right now" moved 42px on an Android-class fallback; preloaded, it arrived
// before first paint and nothing moved, on either platform.
//
// So the font is declared HERE, with preload:true, and this module is imported
// only by the four route trees that set --wf-display:
//   app/guides/layout.js        every /guides route (hub, [slug], bespoke)
//   app/culture/layout.js       /culture/[metro] (+ its ExploreBridge)
//   app/go/florida/layout.js    /go/florida
//   app/command-center/layout.js the owner dashboard
// next/font emits <link rel=preload> for exactly those routes; the home page
// and every other route neither preload nor fetch it. Each layout wraps its
// children in <DisplayFontScope>, which puts --wf-display in scope without a
// box of its own (display: contents), so no layout changes.
//
// display:"swap" over "optional" on purpose: this face carries the headline, and
// a headline that silently never upgrades to the brand face on a slow
// connection is the failure app/fonts.js exists to fix. For a swap that still
// lands late (a slow or failed font request), the fallback chain is metric
// matched: next/font's Times New Roman face, then "Fraunces Fallback Noto"
// (app/fontFallbacks.css) where Times is missing (Android).
//
// scripts/test-font-fallback-metrics.mjs locks: the options, the fallback chain,
// that every file setting --wf-display renders under one of those layouts, and
// that nothing outside them imports this module. tests/e2e/font-fallback-swap.spec.js
// measures the swap on the real build.
import { Fraunces } from "next/font/google";
import "./fontFallbacks.css";

export const displayFont = Fraunces({
  subsets: ["latin"],
  display: "swap",
  preload: true,
  // Only the normal style: nothing in the repo sets an italic --wf-display, so
  // an italic instance would be ~73KB fetched to render zero characters (v7.29).
  style: ["normal"],
  variable: "--wf-display",
  // NO `weight` key on purpose: an explicit list fetches STATIC instances (one
  // file per weight) and makes `axes` illegal. Omitted, the variable font
  // carries every weight this codebase uses in one file, and opsz stays
  // available so large headlines get display-size contrast.
  axes: ["opsz"],
  // "Fraunces Fallback Noto" sits right after the Times-based face next/font
  // prepends, so it is only reached where Times New Roman is missing (Android).
  fallback: ["Fraunces Fallback Noto", "Georgia", "Times New Roman", "serif"],
});

// Puts --wf-display in scope for a route tree. display:contents renders no box,
// so wrapping changes no layout; custom properties still inherit through it.
export function DisplayFontScope({ children }) {
  return <div className={displayFont.variable} style={{ display: "contents" }}>{children}</div>;
}
