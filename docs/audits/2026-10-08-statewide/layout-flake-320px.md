# check-place-card-standard 320px flake: findings (2026-10-09)
Cause: partner CTA "Tickets at Undercover Tourist ↗" (.wf-place-card-book.wf-rail-card-cta, richFall card) at 320px.
Text box 143.23px vs 143px content box (4px padding): fit only via padding allowance (sw=cw=151). U+2197 is in no UI sans font,
so width comes from a host-chosen fallback font. Forced via @font-face local()+unicode-range U+2197 (scratch probe force2.mjs):
text fonts 140.6-145.4px -> sw<=152 fit; Noto Color Emoji 147.72px -> sw=154, cw=151 -> original assertion (sw<=cw+1) FAILS, 320 only
(360: cw=189 fits; 390: 216 fits). Same class as the heart-glyph fix. Fonts: fixture has no web fonts (document.fonts.status loaded, size 0)
so font-load timing, hydration (static HTML), viewport (innerWidth==width at load), image decode (fixed-size photo column) ruled out:
6 fresh-browser runs + 3 cold-fontconfig-cache runs: 0 failures, atLoad == settled.
Fix: css.js .wf-rail-card-cta font-variant-emoji:text + padding-inline:2px at <=340px (content box 147, slack 3.77).
Forced Noto Color Emoji after fix: tw=143.23 fit (3 runs). Guard: added fonts.ready + 2 rAF + status/innerWidth probe, real text-box<=content-box probe,
CDP getPlatformFontsForNode no-emoji probe. Red-prove: old CSS -> new probe fails (143.23 vs 143.00).
Caveat: CI's actual fallback font was not observed; emoji-font is the reproduced sufficient cause, not proven to be what CI had.
