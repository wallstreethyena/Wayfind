// Guardrail: the first screen must never be blank, and the events rail must
// never again wait on a Google Places search to appear.
//
// THE INCIDENT (measured on production 2026-07-21, Pixel 7 / 4x CPU / 1.6Mbps):
// the "Happening near you" rail was gated on `suggested !== null` — a CLIENT-SIDE
// Places search. LCP candidates were:
//     @   300ms  size  4,676   the "open now first…" subtitle
//     @ 6,692ms  size 11,618   the intro modal greeting
//     @12,776ms  size 68,178   a Ticketmaster image (resourceLoadDelay 11,342ms)
// i.e. ~6.4 seconds where nothing meaningful painted. The rail could not help,
// because it was waiting on a network round trip it did not need.
//
// The fix: render the rail's skeleton immediately, swap in events when they
// arrive, and let Places fill in independently. Re-adding the `suggested` gate,
// or dropping the skeleton, restores a blank first screen — so it fails here.
import { readFileSync } from "node:fs";

let passed = 0;
const fail = (m) => { console.error("test-first-screen: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const src = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const code = src.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");

// 1. The skeleton component exists and is actually rendered.
ok(/function EventsRailSkeleton\(\)/.test(code), "EventsRailSkeleton is gone — the first screen would render blank while events load");
ok(/foryouEvents === null && <EventsRailSkeleton \/>/.test(code),
  "the skeleton must render exactly when foryouEvents is null (the loading state); without it the rail area is empty until the network returns");

// 2. THE CORE RULE: no events-rail branch may depend on `suggested`.
//    `suggested` is the client-side Places result — gating the rail on it is the
//    bug this test exists to prevent.
for (const line of code.split("\n")) {
  if (!line.includes("foryouEvents")) continue;
  if (/suggested\s*!==\s*null/.test(line) || /suggested\s*&&/.test(line)) {
    fail(`an events-rail branch depends on \`suggested\` again:\n    ${line.trim().slice(0, 170)}\n  The rail must not wait on a Google Places search. That gate is what produced 6.4s of blank first screen.`);
  }
}
passed++;

// 3. All three states are handled, so the section is never silently absent.
ok(/foryouEvents === null/.test(code), "loading state (null) not handled");
ok(/Array\.isArray\(foryouEvents\) && foryouEvents\.length === 0/.test(code), "empty state (loaded, no events) not handled — that honest fallback must stay");
ok(/foryouEvents && foryouEvents\.length > 0/.test(code), "populated state not handled");

// 4. Geometry is reserved from SHARED constants, so skeleton and live rail
//    cannot drift apart and the swap stays shift-free.
ok(/const EV_HERO_H = \d+/.test(code), "EV_HERO_H constant missing");
ok(/const EV_RAIL_MIN_H = \d+/.test(code), "EV_RAIL_MIN_H constant missing");
const skel = code.slice(code.indexOf("function EventsRailSkeleton()"), code.indexOf("function HooksBanner"));
ok(skel.includes("height: EV_HERO_H"), "skeleton must reserve the hero height from EV_HERO_H");
ok(skel.includes("EV_RAIL_MIN_H"), "skeleton must reserve the card-row height from EV_RAIL_MIN_H");
// the LIVE rail must read the same constants, never a re-hardcoded number
ok(/position: "relative", height: EV_HERO_H, borderRadius: 18/.test(code),
  "the live hero must use EV_HERO_H — a hardcoded height here silently desyncs it from the skeleton and re-introduces a shift");
ok(/aria-label="Events near you"[^\n]*minHeight: EV_RAIL_MIN_H/.test(code),
  "the live card scroller must reserve minHeight: EV_RAIL_MIN_H to match the skeleton");

// 4b. ALL THREE states must reserve the same floor. Reserving only on the
//     loading state relocates the shift instead of removing it: measured
//     2026-07-21, a sparse market where events resolved to [] collapsed the
//     ~312px skeleton into a ~130px empty state and moved the feed up 200px —
//     one 0.1281 shift. With the shared floor the same run measures 0.0054.
ok(/const EV_SECTION_MIN_H = EV_HERO_H \+ EV_RAIL_MIN_H \+ \d+/.test(code),
  "EV_SECTION_MIN_H must be derived from the hero + rail constants, not hardcoded separately");
const floors = (code.match(/minHeight: EV_SECTION_MIN_H/g) || []).length;
ok(floors >= 3, `all three rail states must reserve minHeight: EV_SECTION_MIN_H — found ${floors} of 3. Whichever state omits it becomes the shift.`);

// 5. The skeleton must be announced, not just drawn (screen readers get a
//    shimmering grey box otherwise).
ok(/role="status"/.test(skel) && /aria-busy="true"/.test(skel), "skeleton must expose role=status + aria-busy so assistive tech knows content is loading");
ok(/aria-hidden="true"/.test(skel), "the decorative shimmer blocks must be aria-hidden");
ok(/Happening near you/.test(skel), "skeleton must show the real section heading — a section of grey boxes with no label reads as broken, not loading");

// 6. Motion respects the reduced-motion preference (repo-wide rule).
const cssM = code.match(/const WF_LAYOUT_CSS = `([^`]*)`/);
ok(!!cssM, "WF_LAYOUT_CSS missing");
ok(/\.wf-sk\{/.test(cssM[1]), "the .wf-sk shimmer style is missing");
ok(/prefers-reduced-motion:reduce\)\{\.wf-sk\{animation:none\}/.test(cssM[1].replace(/\s/g, "")),
  "the shimmer must be disabled under prefers-reduced-motion");

console.log(`test-first-screen: OK — ${passed} assertions (rail renders immediately with a reserved-geometry skeleton; never gated on the Places search; all three states handled; reduced-motion respected)`);
