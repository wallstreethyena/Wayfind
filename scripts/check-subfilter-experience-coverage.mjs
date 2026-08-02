// scripts/check-subfilter-experience-coverage.mjs
//
// v6.99 (owner: "spa and wellness links make no sense... i need affiliate
// links for the menu they belong to... this needs to be an universal rule").
// Root cause: SUBFILTERS.attractions (lib/google.js) had a "spa" chip with no
// matching entry in SUB_TO_EXP (app/home.js) — that map silently fell back to
// "all", so UnifiedBrowseCommerceRail served the generic all-attractions
// bookable rail (kayak/manatee/dolphin tours) under the Spa & Wellness tab
// instead of anything spa-related, or an honest empty rail.
//
// This is a text-based guard (readFileSync, not import) for the same reason
// as check-map-explorer.mjs and test-subfilters.mjs: app/home.js is a giant
// "use client" component file that pulls in browser-only deps and cannot be
// required from plain node.
//
// It does not require every id to point at a REAL Viator category (spa
// deliberately maps to a key absent from CATEGORY_BY_KEY today, so the
// unknown-category branch in lib/experiencesServe.js returns zero rows and
// UnifiedBrowseCommerceRail's live-search fallback gets a real chance instead
// of a mislabeled generic rail). It only requires that every SUBFILTERS.attractions
// id have SOME entry in SUB_TO_EXP, so a future new chip cannot silently repeat
// this exact bug by being forgotten from the map entirely.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("check-subfilter-experience-coverage: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const google = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");

// Pull just the `attractions: [ ... ],` block out of SUBFILTERS and read every
// `{ id: "xxx", ...` inside it.
const attrBlockMatch = google.match(/attractions:\s*\[([\s\S]*?)\n\s*\],\s*\n\s*beach:/);
ok(!!attrBlockMatch, "SUBFILTERS.attractions block is present and parseable in lib/google.js");
const attrIds = [...attrBlockMatch[1].matchAll(/\{\s*id:\s*"([a-z]+)"/g)].map((m) => m[1]);
ok(attrIds.length >= 8, `found a plausible number of attractions sub ids (got ${attrIds.length})`);

const subToExpMatch = home.match(/const SUB_TO_EXP = \{([^}]*)\};/);
ok(!!subToExpMatch, "SUB_TO_EXP object literal is present and parseable in app/home.js");
const mappedIds = new Set([...subToExpMatch[1].matchAll(/([a-z]+):\s*"/g)].map((m) => m[1]));

for (const id of attrIds) {
  ok(mappedIds.has(id), `SUBFILTERS.attractions id "${id}" has a matching entry in SUB_TO_EXP (else UnifiedBrowseCommerceRail silently falls back to the generic "all" rail for that chip)`);
}

console.log(`check-subfilter-experience-coverage: OK — ${pass} assertions (every attractions sub-chip has a SUB_TO_EXP entry; the "spa" chip -> generic rail bug cannot silently recur)`);
