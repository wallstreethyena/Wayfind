// scripts/check-rail-position-counter.mjs
//
// A rail's "N of M" counter is a POSITION. It used to print the LOADED count, so
// the Christmas "Lights & Glowing Gardens" rail read "28 OF 28" on card 1 and
// never moved (owner-reported, iPhone). This guard CALLS the real position
// function (lib/railPosition.js, imported by RailNav) against a rail geometry
// shaped like that phone rail, and renders the real RailNav for its first paint.
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { railPosition } from "../lib/railPosition.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

const fail = (m) => { console.error("check-rail-position-counter: FAIL — " + m); process.exit(1); };
let pass = 0;
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

// 28 full-width cards on a 390px rail (card pitch 358 = 346 card + 12 gap).
const N = 28, PITCH = 358, W = 390;
const cardOffsets = Array.from({ length: N }, (_, i) => i * PITCH);
const scrollWidth = (N - 1) * PITCH + 346;
const at = (scrollLeft) => railPosition({ scrollLeft, clientWidth: W, scrollWidth, cardOffsets });

ok(at(0) === 1, `first card reads 1 of ${N} (got ${at(0)}) — the reported bug read ${N}`);
ok(at(PITCH * 13) === 14, `a middle card (index 13) reads 14 (got ${at(PITCH * 13)})`);
ok(at(PITCH * 13 + 40) === 14, "mid-swipe, 40px past card 14, still reads 14 (nearest card)");
ok(at(PITCH * 13 + 200) === 15, "past the halfway point it advances to 15");
ok(at(scrollWidth - W) === N, `scrolled to the end reads ${N} of ${N} (got ${at(scrollWidth - W)})`);
ok(at(PITCH * 20) !== at(0), "position changes as the rail scrolls (a static count cannot satisfy this)");

// Several cards per screen (desktop): the last card never aligns left, end still reads N.
const dOff = Array.from({ length: 12 }, (_, i) => i * 300);
const dSw = 11 * 300 + 288;
ok(railPosition({ scrollLeft: 0, clientWidth: 1000, scrollWidth: dSw, cardOffsets: dOff }) === 1, "desktop: first card reads 1");
ok(railPosition({ scrollLeft: dSw - 1000, clientWidth: 1000, scrollWidth: dSw, cardOffsets: dOff }) === 12, "desktop: end of rail reads 12 of 12");
// Controls / degenerate input.
ok(railPosition({ scrollLeft: 0, clientWidth: 390, scrollWidth: 390, cardOffsets: [0] }) === 1, "a one-card, non-overflowing rail reads 1");
ok(railPosition({}) === 1 && railPosition({ cardOffsets: [] }) === 1, "empty or missing geometry falls back to 1, never NaN");
ok(railPosition({ scrollLeft: -50, clientWidth: W, scrollWidth, cardOffsets }) === 1, "overscroll bounce (negative scrollLeft) reads 1");

// The real RailNav, first paint: position 1 of the TRUE total, never the loaded count.
const REPO = fileURLToPath(new URL("..", import.meta.url));
const { RailNav } = await loadComponent(fileURLToPath(new URL("../app/components/RailCard.js", import.meta.url)), REPO);
const html = renderToStaticMarkup(createElement(RailNav, { railId: "r", count: 28, total: 28, loaded: 28, unit: "ranked options" }));
ok(html.includes("<b>1</b> of <b>28</b>"), `RailNav first paint reads "1 of 28" with all 28 loaded (got ${html})`);
const partial = renderToStaticMarkup(createElement(RailNav, { railId: "r", count: 130, total: 130, loaded: 10, unit: "spots" }));
ok(partial.includes("<b>1</b> of <b>130</b>"), "a partially loaded rail still reads 1 of the TRUE total");
const src = (await import("node:fs")).readFileSync(new URL("../app/components/RailCard.js", import.meta.url), "utf8");
ok(/import \{ railPosition \} from "\.\.\/\.\.\/lib\/railPosition\.js"/.test(src) && /railPosition\(\{/.test(src), "RailNav imports and CALLS the shared railPosition (no private copy of the logic)");

console.log(`check-rail-position-counter: OK — ${pass} assertions (railPosition called on 28-card phone and 12-card desktop geometry; RailNav rendered; false-positive surface: counter in RailNav only)`);
