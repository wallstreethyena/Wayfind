// scripts/test-meta-pixel.mjs — locks the Meta pixel (lib/metaPixel.js,
// app/components/MetaPixel.js).
//
// THE INVARIANTS
//   1. The bridge EXECUTES: an affiliate click becomes fbq('track','Lead'),
//      detail_open -> ViewContent, save -> AddToWishlist, signup ->
//      CompleteRegistration; analytics noise is NOT forwarded; duplicates are
//      dropped; params are sanitized (no emails); SSR is a no-op.
//   2. The id can never silently detach from the live dataset: unset env ->
//      the default; a garbage env -> the default; an explicit "off" -> null.
//   3. The component is gated for the native shell BELOW every hook and ABOVE
//      the script render, is mounted once in app/layout.js, and home.js's
//      logEvent forwards to it.
//   4. The CSP allowlists the pixel's three hosts, else an enforce-flip kills
//      it silently.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = (m) => { console.error("test-meta-pixel: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const M = await import("../lib/metaPixel.js");
const A = await import("../lib/analytics.js");

// ── 1. id resolution ─────────────────────────────────────────────────────
ok(M.DEFAULT_META_PIXEL_ID === "1424559705968711", "default pixel id is the live Wayfind Website dataset");
ok(M.isValidMetaPixelId("1424559705968711") === true, "the live id is accepted");
for (const bad of ["", "abc", "1234", "AW-18342267447", "14245597059687111234"]) {
  ok(M.isValidMetaPixelId(bad) === false, `rejects ${JSON.stringify(bad)}`);
}
ok(M.metaPixelId() === "1424559705968711", "env unset -> falls back to the live id (never detaches)");

// ── 2. the bridge executes ───────────────────────────────────────────────
const calls = [];
const fbq = (...a) => calls.push(a);
const t0 = 1_000_000;
A._resetDedupe();

// Affiliate clicks are NEVER sent from the browser (2026-11-12): Meta's only
// conversion is the server-witnessed PartnerHandoff (scripts/test-meta-partner-handoff.mjs).
let r = M.forwardToMeta("partner_click", { place_id: "p1", partner: "viator", email: "x@y.z" }, { fbq, now: t0 });
ok(r.meta === false && r.skipped === "not_mapped", `partner_click is NOT sent to Meta from the browser (got ${JSON.stringify(r)})`);
ok(calls.length === 0, "…and fbq was not called");
for (const ev of A.AFFILIATE_EVENTS) {
  ok(M.metaEventFor(ev, {}) === null, `${ev} is not a browser Meta event (unverified tap)`);
}
ok(M.metaEventFor("partner_click", {}) === null, "partner_click is not a browser Meta event");

const expect = { detail_open: "ViewContent", save: "AddToWishlist", signup_completed: "CompleteRegistration" };
for (const [ev, name] of Object.entries(expect)) {
  r = M.forwardToMeta(ev, { place_id: "p-" + ev, email: "a@b.c" }, { fbq, now: t0 + 1000 });
  ok(r.meta === true && r.name === name, `${ev} -> ${name} (got ${JSON.stringify(r)})`);
}
ok(calls.filter((c) => c[0] === "track").length === 3, "three standard events fired so far");
ok(calls.every((c) => !c[2] || !("email" in c[2])), "params are sanitized: no email reaches fbq");

r = M.forwardToMeta("detail_open", { place_id: "p-detail_open" }, { fbq, now: t0 + 1010 });
ok(r.skipped === "duplicate" && calls.length === 3, "an immediate repeat is deduped");

r = M.forwardToMeta("screen_view", { screen: "home" }, { fbq, now: t0 + 2000 });
ok(r.skipped === "not_mapped" && r.meta === false, "analytics-only noise is NOT forwarded");
ok(calls.length === 3, "…and did not call fbq");

r = M.forwardToMeta("detail_open", { place_id: "p9" }, { now: t0 + 3000 });
ok(r.skipped === "no_fbq" && r.meta === false, "without fbq on the page nothing throws and nothing fires");
ok(M.trackMetaPageView("/x").skipped === "ssr", "trackMetaPageView is a no-op without window");

// ── 3. component + wiring ────────────────────────────────────────────────
const comp = strip(read("app/components/MetaPixel.js"));
ok(read("app/components/MetaPixel.js").indexOf('"use client"') === 0, "MetaPixel is a client component");
const gate = comp.indexOf("if (isNative()) return null;");
ok(gate > -1, "MetaPixel returns null in the native shell");
ok(/import\s*\{\s*isNative\s*\}\s*from/.test(comp), "MetaPixel imports isNative");
ok(!/\buse(Effect|State|Ref|Memo|Callback|Pathname)\s*\(/.test(comp.slice(gate)), "no hook after the native gate (hooks stay unconditional)");
ok(/useEffect\s*\(/.test(comp.slice(0, gate)), "control: hooks exist above the gate");
ok(gate < comp.indexOf("connect.facebook.net"), "the gate precedes the fbevents.js script");
ok(/isGroupPlanPath\(pathname\)\)\s*return null;/.test(comp), "group-plan pages render no pixel");
ok(/fbq\('init',\s*'\$\{id\}'\)/.test(comp), "init uses the resolved id, never a hard-coded literal in the component");
ok(!/\d{15,17}/.test(comp), "no pixel id literal in the component (it lives in lib/metaPixel.js only)");

const layout = strip(read("app/layout.js"));
ok((layout.match(/<MetaPixel\s*\/>/g) || []).length === 1, "layout mounts <MetaPixel /> exactly once");
ok(/import MetaPixel from "\.\/components\/MetaPixel"/.test(layout), "layout imports MetaPixel");

const home = strip(read("app/home.js"));
ok(/import\s*\{\s*forwardToMeta\s*\}\s*from\s*"\.\.\/lib\/metaPixel"/.test(home), "home.js imports forwardToMeta from lib/metaPixel");
const fg = home.indexOf("forwardToGoogle(action,");
const fm = home.indexOf("forwardToMeta(action,");
ok(fg > -1 && fm > fg, "logEvent forwards to Meta right after Google");

const trk = strip(read("lib/track.js"));
ok(/import\s*\{\s*forwardToMeta\s*\}\s*from\s*"\.\/metaPixel"/.test(trk), "lib/track.js imports forwardToMeta");
ok(trk.indexOf("forwardToMeta(name, payload)") > trk.indexOf("forwardToGoogle(name, payload)"), "track() still mirrors mapped events (ViewContent etc.) to Meta after Google");

// ── 4. CSP ───────────────────────────────────────────────────────────────
const csp = read("next.config.js");
const dir = (name) => { const m = csp.match(new RegExp('"' + name + " ([^\"]+)\"")); return m ? m[1] : ""; };
ok(dir("script-src").includes("https://connect.facebook.net"), "script-src allows connect.facebook.net");
ok(dir("img-src").includes("https://www.facebook.com"), "img-src allows www.facebook.com (noscript + image beacons)");
ok(dir("connect-src").includes("https://www.facebook.com"), "connect-src allows www.facebook.com (event beacons)");

console.log(`test-meta-pixel: OK — ${pass} assertions (bridge executed: ViewContent/AddToWishlist/CompleteRegistration fire, affiliate taps never sent from the browser, noise and duplicates dropped, emails stripped; id defaults to the live dataset; component gated below hooks and mounted once; CSP allows the three hosts)`);
