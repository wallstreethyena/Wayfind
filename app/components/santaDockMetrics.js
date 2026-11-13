// Santa's dock height, in a plain module (no "use client") so the root layout can read it.
//
// WHY the height lives on <html> from the first byte (2026-11-13). SantaDock used to declare
// --wf-santa-dock under html.wf-santa-docked, so the variable APPEARED on the root element
// the moment the dock mounted. A custom property inherits, so that one class change made
// the browser re-style every element on the page (333 to 386 ms for the 15,000-element home
// feed on a 4x-throttled phone, measured on production). Declared here and rendered by
// app/layout.js with the document, the value never changes after first paint: adding the
// class then costs about 20 ms. Nothing reads the variable unless Santa is docked.
export const DOCK_H = 64; // px, the dock's height above the safe area (phones)
export const DOCK_H_WIDE = 68; // px, from 720px wide
export const SANTA_DOCK_ROOT_CSS = `html{--wf-santa-dock:${DOCK_H}px}@media(min-width:720px){html{--wf-santa-dock:${DOCK_H_WIDE}px}}`;
