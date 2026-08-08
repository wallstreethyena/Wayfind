// app/fonts.js — Wayfind's typefaces (v6.67, premium-craft lane).
//
// WHY THIS FILE EXISTS. Until now Wayfind loaded NO webfont at all. Measured on
// production 2026-08-08: `document.fonts.size === 0`, and the display <h1> on
// /best-of computed to `Georgia, "Times New Roman", serif` — i.e. every character
// on the site was whatever the visitor's OS happened to ship. That is the single
// fastest "this is not a premium product" signal a brand can send, and it was
// costing us on the one surface (a warm editorial serif on /best-of) where the
// design was otherwise doing its job.
//
// WHY next/font AND NOT A <link> TO fonts.googleapis.com. next/font downloads the
// files at BUILD time and serves them from our own origin. Three consequences that
// all matter here:
//   1. No render-blocking request to a third party on the critical path, and no
//      extra DNS/TLS handshake before the first glyph can paint.
//   2. It self-hosts, so `font-src 'self'` already covers it. next.config.js's CSP
//      allowlists fonts.gstatic.com today; this file deliberately does not depend
//      on that entry, so tightening the CSP later cannot silently kill our type.
//   3. next/font emits `size-adjust` fallback metrics automatically, so the swap
//      from fallback to webfont does not shift layout. That matters because this
//      repo already fought a 0.4947 CLS incident (see app/components/css.js) and
//      the guard scripts/test-layout-shift.mjs is still the lock on it.
//
// WHY THESE TWO FACES.
//   Fraunces (display) — a variable serif with real warmth and a little wonk. It
//   is the face the /best-of editorial layout was already reaching for with its
//   Georgia fallback, done properly. Used for headlines, place names on editorial
//   surfaces, and the collection heroes. Not for UI chrome.
//   Inter (text) — the workhorse. It is legible at the small sizes this UI uses,
//   and critically it has TABULAR NUMERALS, which the ranked lists need: scores
//   (9.5), distances (19 mi) and prices ($60) sit in vertical columns and jitter
//   badly in a proportional face.
//
// BOTH ARE VARIABLE FONTS, so the whole 400–800 weight range this codebase uses
// (it currently reaches for 740, 750, 820 and 850 in places) costs one file per
// family rather than one per weight.
//
// The CSS variables below are the ONLY sanctioned way to reference a typeface in
// app code. Do not re-introduce a literal system stack — scripts/check-typography.mjs
// fails the build if one appears in a customer-facing surface.
import { Fraunces, Inter } from "next/font/google";

// --wf-display. `display: "swap"` over "optional" on purpose: this face carries
// the headline, and a headline that silently never upgrades to the brand face on
// a slow connection is the exact failure this file exists to fix.
export const displayFont = Fraunces({
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  variable: "--wf-display",
  // NO `weight` key on purpose. Passing an explicit weight list makes next/font
  // fetch STATIC instances, which (a) costs one file per weight and (b) makes
  // `axes` illegal — the build fails with "Axes can only be defined for variable
  // fonts". Omitting weight keeps the variable font, so the full 400-700 range
  // this codebase uses arrives in a single file and the optical-size axis below
  // stays available.
  //
  // Fraunces ships an optical-size axis; next/font needs it named explicitly or
  // it pins to a single opsz and large headlines render with text-sized contrast.
  axes: ["opsz"],
  fallback: ["Georgia", "Times New Roman", "serif"],
});

// --wf-sans. The UI face. Weight range is a span rather than a list because the
// shell uses a lot of intermediate weights inline.
export const textFont = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--wf-sans",
  fallback: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
});

// Applied to <html> in app/layout.js. Both variables must be in scope at the root
// so that every route — including the ones that render outside the home shell,
// like /guides and /events — inherits them.
export const fontVariables = `${displayFont.variable} ${textFont.variable}`;
