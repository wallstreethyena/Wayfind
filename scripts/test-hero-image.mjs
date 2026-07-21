// Guardrail: the events hero must not download a poster-sized image into a
// phone-sized slot, and its data must reach the initial HTML.
//
// MEASURED ON PRODUCTION 2026-07-21 (Pixel 7 / 4x CPU / 1.6Mbps):
//   the mobile LCP element was the "Happening near you" hero image at 12,776ms,
//   with resourceLoadDelay 11,342ms — the URL was not even KNOWN until a
//   client-side /api/events call resolved, so its fetchpriority="high" was
//   decorative. You cannot prioritise an element that does not exist yet.
//
// Two independent causes, two independent guards below:
//
//   1. NOT IN THE HTML. Fixed by server-fetching events in app/page.js at ISR
//      regeneration and seeding them into state. After the fix the rail's text
//      paints at ~250ms instead of 6,692ms (measured locally).
//
//   2. WILDLY OVERSIZED. The Ticketmaster picker sorted 16:9 images
//      widest-first and took [0] — a 2048x1152 / 503KB JPEG for a slot that is
//      388px wide on mobile and ~780px on desktop. The 1024x576 variant is
//      ~168KB: a 67% saving with no visible difference at those sizes.
import { readFileSync } from "node:fs";

let passed = 0;
const fail = (m) => { console.error("test-hero-image: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const route = readFileSync(new URL("../app/api/events/route.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");

// ---- 1. right-sized hero image -------------------------------------------
ok(/const HERO_MIN_W = (\d+)/.test(route), "HERO_MIN_W is gone — the hero image size is unbounded again");
const minW = Number(route.match(/const HERO_MIN_W = (\d+)/)[1]);
ok(minW >= 640 && minW <= 1280, `HERO_MIN_W=${minW} is outside a sane range for a 388-780px slot (expected 640..1280)`);

// The picker must sort ASCENDING and take the first variant that covers the
// slot. The old code sorted descending and took [0] — that is the bug.
ok(/\.sort\(\(a, b\) => \(a\.width \|\| 0\) - \(b\.width \|\| 0\)\)/.test(route),
  "16:9 images must be sorted ASCENDING by width; sorting descending and taking [0] is what shipped the 503KB hero");
ok(/wide\.find\(\(i\) => \(i\.width \|\| 0\) >= HERO_MIN_W\)/.test(route),
  "must select the smallest variant that still covers HERO_MIN_W");
ok(!/16_9"\)\.sort\(\(a, b\) => \(b\.width \|\| 0\) - \(a\.width \|\| 0\)\)/.test(route),
  "the widest-first sort is back — that is the exact regression this test exists for");

// Behavioural check on the documented semantics, with the real variant sizes
// Ticketmaster serves (2048x1152=503KB, 1024x576=168KB, 640x360=78KB).
const pick = (imgs) => {
  const wide = imgs.filter((i) => i.ratio === "16_9").sort((a, b) => (a.width || 0) - (b.width || 0));
  return (wide.find((i) => (i.width || 0) >= minW) || wide[wide.length - 1] || imgs[0]).url;
};
const TM = [
  { ratio: "16_9", width: 2048, url: "LARGE" },
  { ratio: "16_9", width: 1024, url: "TABLET" },
  { ratio: "16_9", width: 640, url: "RETINA" },
  { ratio: "3_2", width: 4000, url: "WRONG_RATIO" },
];
ok(pick(TM) === "TABLET", `expected the 1024px variant, got ${pick(TM)} — the smallest that covers the slot must win`);
ok(pick([{ ratio: "16_9", width: 640, url: "SMALL" }]) === "SMALL", "when nothing reaches HERO_MIN_W the largest available must still be used, never null");
ok(pick([{ ratio: "1_1", width: 100, url: "ONLY" }]) === "ONLY", "must fall back to images[0] when no 16:9 variant exists");

// ---- 2. events reach the initial HTML ------------------------------------
ok(/async function initialEventsForFirstPaint/.test(page), "app/page.js no longer server-fetches events — the hero URL goes back to being unknown until a client fetch resolves");
ok(/<Home initialEvents=\{initialEvents\} \/>/.test(page), "initialEvents is not passed to <Home>");
ok(/export default async function Page/.test(page), "app/page.js must be async to await the events fetch");
ok(/useState\(initialEvents\)/.test(home), "foryouEvents must be seeded from the server prop, not reset to null on the client");

// TTFB protection: deriving the origin from headers() opts the route into
// dynamic rendering, which would put a live aggregation on the critical path of
// every visit. It must stay static/ISR.
// (code only — the explanatory comment above the fetch names headers() on
//  purpose, to say why it is NOT used, and must not trip its own guard)
const pageCode = page.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");
ok(!/headers\(\)/.test(pageCode), "app/page.js must not call headers() — that forces dynamic rendering and puts the events aggregation in every request's TTFB");
ok(/export const revalidate = \d+/.test(page), "revalidate is gone — the events fetch would run per request instead of per regeneration");

// Fail-soft: no server events must degrade to the skeleton, never to a crash
// or an empty rail.
ok(/return null;/.test(page.slice(page.indexOf("initialEventsForFirstPaint"))), "the server fetch must fail soft to null");

console.log(`test-hero-image: OK — ${passed} assertions (hero image right-sized to the slot; events reach the initial HTML; page stays static so TTFB is untouched)`);
