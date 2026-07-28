// scripts/check-app-viewport.mjs — v6.44 THE LANDING JUMP guardrail.
//
// THE LESSON (July 2026, owner-reported with a photo): "Look at how it looks
// when it lands — it's not right." The app landed with its own header and
// search field sitting BEHIND Safari's translucent status bar and URL bar, the
// events rail clipped, and a dead black strip above the tab bar.
//
// Nothing was wrong with the app's own layout. The DOCUMENT was too tall:
//   - <html style="height:100%"> and <body style="height:100%"> resolve against
//     the initial containing block, which on iOS is the LARGE viewport (URL bar
//     hidden) — i.e. 100vh — while the app shell in app/home.js is 100dvh (the
//     SMALL viewport, URL bar visible). One URL-bar-height of scroll, for free.
//   - <main style="min-height:100vh"> repeated the same mistake.
//   - the shared server footer rendered below the app added several hundred
//     more pixels of it.
// Document scroll on a 100dvh app UI does not scroll content — it drags the
// entire application up under the browser chrome, and Safari restores that
// offset on a return visit, so the app can land already wrong.
//
// The fix is a contract between two files, and BOTH halves have to hold or the
// jump comes straight back. This file keeps both shut.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const p = (rel) => fileURLToPath(new URL(rel, root));

let pass = 0;
const fail = (m) => { console.error("check-app-viewport: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const layout = readFileSync(p("app/layout.js"), "utf8");
const home = readFileSync(p("app/home.js"), "utf8");
const veil = readFileSync(p("app/components/FooterVeil.js"), "utf8");

// ─── 1. the document may not be forced taller than the visual viewport ───────
ok(!/<html lang="en"[^>]*height:/.test(layout),
  "<html> must carry NO height. height:100% there resolves to the LARGE viewport (100vh) while the "
  + "app shell is 100dvh, which is one URL-bar-height of document scroll on every iPhone.");
const bodyTag = layout.match(/<body style=\{\{[^}]*\}\}/);
ok(!!bodyTag, "the <body> style object moved or changed shape — re-point this assertion before shipping.");
ok(/minHeight: "100dvh"/.test(bodyTag[0]),
  "<body> must use minHeight:100dvh — min-height so document routes (/terms, guides) still scroll, "
  + "dvh so the app route matches the shell exactly.");
ok(!/[^n] height: "100%"/.test(bodyTag[0]) && !/\{ height:/.test(bodyTag[0]),
  "<body> must not set a fixed height — a fixed height cannot grow for the article routes that share "
  + "this layout, and 100% reintroduces the 100vh/100dvh mismatch.");
ok(/<main id="wf-main" style=\{\{ minHeight: "100dvh" \}\}>/.test(layout),
  "<main> must be min-height:100dvh, not 100vh — on \"/\" it wraps the 100dvh app shell, so every extra "
  + "pixel here is document scroll that drags the app under the browser chrome.");

// ─── 2. the shell is what the document is being matched TO ───────────────────
ok(/const shell = \{[^}]*height: "100dvh"/.test(home),
  "the app shell must stay 100dvh. If it ever becomes 100vh the mismatch flips sign — the app would be "
  + "TALLER than the document and the tab bar would sit below the fold.");

// ─── 3. nothing may be rendered below the app on the app route ───────────────
ok(/<FooterVeil>/.test(layout) && /<\/FooterVeil>/.test(layout),
  "the server footer must be wrapped in FooterVeil. It is the one remaining below-the-app block on \"/\" "
  + "and it is worth several hundred pixels of document scroll on a phone.");
ok(/import FooterVeil from "\.\/components\/FooterVeil"/.test(layout),
  "FooterVeil import missing from the layout.");
ok(/pathname === "\/"/.test(veil),
  "FooterVeil must veil on the app route ONLY. /guides, /culture, /about and /terms are documents — "
  + "they need a real, visible footer.");
ok(/el\.removeAttribute\("aria-hidden"\)/.test(veil),
  "FooterVeil must UNveil when the route changes, or a client-side nav from \"/\" to a guide leaves that "
  + "guide with no footer.");
ok(/useEffect\(/.test(veil) && /\[pathname\]\)/.test(veil),
  "the veil must be applied in an effect keyed on pathname — doing it during render would change the "
  + "first client render and produce a hydration mismatch (see ProofVeil).");

// ─── 4. the footer stays in the DOM: this is a veil, not a deletion ──────────
ok(!/display: ?"none"/.test(veil) && !/\.remove\(\)/.test(veil),
  "the footer must remain rendered and crawlable — visually hidden, never display:none'd or removed. "
  + "Its links are the site's internal linking graph.");

// ─── 5. the app's own chrome still respects the notch ────────────────────────
ok(/paddingTop: screen === "map" \? "max\(8px, env\(safe-area-inset-top\)\)" : "max\(12px, env\(safe-area-inset-top\)\)"/.test(home),
  "the topbar must keep its safe-area padding. In an installed PWA (statusBarStyle black-translucent) "
  + "the inset is ~59px and the header lands under the clock without it.");

console.log("check-app-viewport: OK — " + pass + " assertions (the home document is exactly as tall as the app shell; nothing below the app can drag it under the browser chrome)");
