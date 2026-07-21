// Guardrail: the field Core Web Vitals reporter must keep its ATTRIBUTION wiring.
//
// Why this exists: the reporter shipped for a long time on the plain "web-vitals"
// build, so field p75s (CLS 0.263 desktop, LCP 4090ms mobile) were real numbers
// with no way to act on them — no element, no shift source. Swapping the import
// back to "web-vitals" would silently re-create that blind spot: every metric
// still reports, the panel still renders, and nobody notices the debug fields
// went missing until the next regression is un-diagnosable.
//
// It also pins the two invariants that make the payload safe and the panel stable:
// primitives only (never DOM nodes / PerformanceEntry objects), and the original
// base properties preserved so the command-center panel keeps reading them.
import { readFileSync } from "node:fs";

let passed = 0;
const fail = (m) => { console.error("test-vitals-attribution: FAIL — " + m); process.exit(1); };
const ok = (cond, m) => { if (!cond) fail(m); passed++; };

const src = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");

// The reporter block: from the dynamic web-vitals import to its .catch tail.
const start = src.indexOf('import("web-vitals');
ok(start !== -1, "the web-vitals reporter is gone from app/home.js entirely");
const block = src.slice(start, src.indexOf(".catch(() => {});", start));

// 1. The attribution build, not the plain one.
ok(/import\("web-vitals\/attribution"\)/.test(block),
  'reporter must import "web-vitals/attribution" — the plain "web-vitals" build ' +
  "reports values with no element/shift attribution, which is what made the " +
  "4090ms mobile LCP un-diagnosable in the first place");

// 2. It must actually read m.attribution.
ok(/m\.attribution/.test(block), "reporter never reads m.attribution — the attribution build is imported but unused");

// 3. LCP: the element plus the four sub-parts that sum to LCP. These are the
//    v5 field names (v3 called them element/resourceLoadTime) — pinned so a
//    future dependency bump that renames them fails here, not silently in prod.
for (const [prop, field] of [
  ["lcp_target", "target"],
  ["lcp_url", "url"],
  ["lcp_ttfb", "timeToFirstByte"],
  ["lcp_resource_load_delay", "resourceLoadDelay"],
  ["lcp_resource_load_duration", "resourceLoadDuration"],
  ["lcp_element_render_delay", "elementRenderDelay"],
]) {
  ok(block.includes(prop), `LCP attribution property ${prop} missing from the payload`);
  ok(block.includes(field), `LCP attribution reads a.${field} — missing (v5 field name)`);
}

// 4. CLS: which node moved, and by how much.
for (const [prop, field] of [
  ["cls_target", "largestShiftTarget"],
  ["cls_largest_shift", "largestShiftValue"],
  ["cls_shift_time", "largestShiftTime"],
  ["cls_load_state", "loadState"],
]) {
  ok(block.includes(prop), `CLS attribution property ${prop} missing from the payload`);
  ok(block.includes(field), `CLS attribution reads a.${field} — missing`);
}

// 5. INP guarded too (the work order's "guard INP" — don't regress it while fixing LCP/CLS).
for (const prop of ["inp_target", "inp_type", "inp_input_delay", "inp_processing", "inp_presentation"]) {
  ok(block.includes(prop), `INP attribution property ${prop} missing from the payload`);
}

// 6. PRIMITIVES ONLY. attribution also carries live DOM nodes and PerformanceEntry
//    objects; handing those to posthog.capture serializes to junk or blows the
//    payload size. None of them may be referenced inside the reporter.
//    Scanned against CODE ONLY — the reporter's own comment names these fields to
//    explain why they are excluded, and that must not trip the guard.
const code = block.replace(/^\s*\/\/.*$/gm, "");
for (const banned of ["lcpEntry", "largestShiftEntry", "navigationEntry", "lcpResourceEntry", "largestShiftSource", "longAnimationFrameEntries", "processedEventEntries"]) {
  ok(!code.includes(banned),
    `reporter references a.${banned} — that is a DOM node / PerformanceEntry and must ` +
    "never reach posthog.capture; use the string/number attribution fields instead");
}

// 7. The base payload the command-center panel already reads must survive.
for (const base of ["metric:", "value:", "rating:", "route:", "device:", "loc_permission:", "signed_in:", "build:"]) {
  ok(block.includes(base), `base web_vitals property ${base} was dropped — the command-center panel reads it`);
}
ok(/capture\("web_vitals"/.test(block), 'the event name must stay "web_vitals" — dashboards and the panel key off it');

// 8. Still fail-soft: instrumentation must never break the app.
ok(/catch \(e\) \{\}/.test(block), "reporter lost its try/catch — telemetry must never throw into the UI");
ok(/if \(!window\.posthog\) return;/.test(block), "reporter lost its posthog guard");

// 9. The installed dependency must actually expose the attribution entrypoint,
//    so a downgrade fails the build instead of the import silently rejecting.
const wv = JSON.parse(readFileSync(new URL("../node_modules/web-vitals/package.json", import.meta.url), "utf8"));
ok(wv.exports && wv.exports["./attribution"], "installed web-vitals does not expose ./attribution");
ok(parseInt(wv.version, 10) >= 5, `web-vitals must be >=5 for these field names (found ${wv.version})`);

console.log(`test-vitals-attribution: OK — ${passed} assertions (attribution build wired, LCP/CLS/INP debug fields present, primitives only, base payload + event name preserved)`);
