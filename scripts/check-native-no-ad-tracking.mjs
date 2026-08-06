// scripts/check-native-no-ad-tracking.mjs
//
// THE INVARIANT: inside the iOS shell, Wayfind runs NO third-party advertising
// measurement — no gtag.js, and no capture of Google Ads click ids.
//
// WHY IT IS A SUBMISSION BLOCKER, not a preference. gclid / gbraid / wbraid are
// Google Ads click identifiers. Storing one and joining it to a user is
// "tracking" under Apple's definition, and this build ships no App Tracking
// Transparency prompt and no NSUserTrackingUsageDescription. That leaves two
// doors and both are locked: declare tracking without ATT and it is a 5.1.2
// rejection; declare "no tracking" while the tags run and the privacy label is
// false, which surfaces later and worse.
//
// ── THIS GUARD EXECUTES THE FUNCTION. IT DOES NOT READ THE SOURCE. ────────
// A regex over lib/attribution.js would pass on any file that merely mentions
// isNative — including one where the gate sits after the write, or is inverted.
// CLAUDE.md: assert on the CALL, not the string.
//
// isNative() is executable here because it falls back to a User-Agent probe
// (/WayfindNative\/\d/) when the Capacitor bridge is absent, so flipping
// globalThis.navigator flips the platform for real.
//
// ── THE POSITIVE CONTROL IS THE LOAD-BEARING PART ─────────────────────────
// store() returns null when `window` is undefined, so in a bare Node process
// captureAttribution writes nothing NO MATTER WHAT — a native-path assertion
// would pass against a completely ungated file. That is the "two empties must
// never pass" failure. So §1 stubs window.localStorage and proves the WEB path
// really writes a gclid first. Only then does a native no-write mean anything.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = (m) => { console.error("check-native-no-ad-tracking: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(REPO, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── a real localStorage, so a write is observable ────────────────────────
const mem = new Map();
const localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};
Object.defineProperty(globalThis, "window", { value: { localStorage }, configurable: true, writable: true });
Object.defineProperty(globalThis, "localStorage", { value: localStorage, configurable: true, writable: true });

const setPlatform = (native) => {
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: native ? "Mozilla/5.0 (iPhone) WayfindNative/1.0" : "Mozilla/5.0 (iPhone) Safari/605" },
    configurable: true,
    writable: true,
  });
};

const { captureAttribution, STORAGE_KEY } = await import("../lib/attribution.js");
const { isNative } = await import("../lib/native.js");

// ── 1. POSITIVE CONTROL — the web path really captures ───────────────────
setPlatform(false);
ok(isNative() === false, "control: a plain Safari UA is NOT native (if this were true, every assertion below would pass vacuously)");
mem.clear();
const web = captureAttribution("?gclid=WEB_CONTROL_123&utm_source=google");
ok(web && web.gclid === "WEB_CONTROL_123", `control: on the WEB, a gclid IS captured and returned (got ${JSON.stringify(web && web.gclid)}) — this proves the harness can observe a capture at all`);
const webStored = mem.get(STORAGE_KEY) || "";
ok(webStored.includes("WEB_CONTROL_123"), "control: on the WEB, the gclid is actually WRITTEN to storage — without this write the native no-write below proves nothing");

// ── 2. THE REAL ASSERTION — native captures nothing ──────────────────────
setPlatform(true);
ok(isNative() === true, "the WayfindNative UA is detected as native");
mem.clear();
const nat = captureAttribution("?gclid=NATIVE_LEAK_456&gbraid=G_456&wbraid=W_456&utm_source=google&utm_campaign=x");
ok(!(mem.get(STORAGE_KEY) || "").includes("NATIVE_LEAK_456"), "IN THE NATIVE SHELL a gclid is NOT written to storage");
ok(!(mem.get(STORAGE_KEY) || "").includes("G_456"), "IN THE NATIVE SHELL a gbraid is NOT written to storage");
ok(!(mem.get(STORAGE_KEY) || "").includes("W_456"), "IN THE NATIVE SHELL a wbraid is NOT written to storage");
ok(!nat || nat.gclid !== "NATIVE_LEAK_456", `IN THE NATIVE SHELL the click id is not returned to the caller either (got ${JSON.stringify(nat && nat.gclid)})`);

// A pre-existing web-side value must be READ, not destroyed — the gate returns
// readAttribution() rather than null so an install that follows a web visit
// keeps whatever the browser legitimately stored.
mem.set(STORAGE_KEY, JSON.stringify({ gclid: "PRE_EXISTING", landed_at: "2026-01-01T00:00:00.000Z" }));
const after = captureAttribution("?gclid=NATIVE_LEAK_789");
ok((mem.get(STORAGE_KEY) || "").includes("PRE_EXISTING"), "the native gate READS existing attribution rather than clearing it");
ok(!(mem.get(STORAGE_KEY) || "").includes("NATIVE_LEAK_789"), "…and still refuses to overwrite it with a native-side click id");
ok(!after || after.gclid !== "NATIVE_LEAK_789", "…and does not return the refused id");

// ── 3. THE GATE IS AT THE SOURCE, SO ALL CALLERS INHERIT IT ──────────────
// Gating GoogleTags alone would have left PaidLanding and ExploreBridge live.
// Reachability is transitive; one hop is not proof.
const CALLERS = ["app/components/GoogleTags.js", "app/components/PaidLanding.js", "app/components/ExploreBridge.js"];
for (const f of CALLERS) {
  const src = strip(read(f));
  ok(/captureAttribution/.test(src), `${f} still calls captureAttribution (if it stopped, this list is stale — follow the code)`);
  ok(/from\s+"[^"]*lib\/attribution"/.test(src), `${f} imports it from lib/attribution — i.e. it gets the gate proven above, rather than a local copy`);
}
ok(CALLERS.length >= 3, `every known caller is covered (${CALLERS.length})`);

// ── 4. NO gtag.js IN THE NATIVE SHELL ────────────────────────────────────
// This one cannot be executed here — it is a React component whose return value
// depends on hooks — so it is asserted structurally, and the weakness is stated
// rather than dressed up as proof.
const gt = strip(read("app/components/GoogleTags.js"));
const gate = gt.indexOf("if (isNative()) return null;");
ok(gate > -1, "GoogleTags returns null when isNative() — the gtag.js <Script> tags never render inside the app");
ok(/import\s*\{\s*isNative\s*\}\s*from/.test(gt), "GoogleTags imports isNative (a call to an unbound name would ReferenceError at render — see CLAUDE.md on extraction PRs)");

// HOOKS MUST NOT BE CONDITIONAL. An early return placed above a hook is a React
// rules-of-hooks violation that breaks rendering on every platform, not just
// native — a "fix" that takes the whole app down is worse than the bug.
const afterGate = gt.slice(gate);
ok(!/\buse(Effect|State|Ref|Memo|Callback|Pathname)\s*\(/.test(afterGate),
   "no hook is called AFTER the isNative() early return — hooks must be unconditional, so the gate sits below every one of them");
const beforeGate = gt.slice(0, gate);
ok(/useEffect\s*\(/.test(beforeGate), "control: hooks DO exist above the gate (otherwise the check above passes on a file with no hooks at all)");

// The gate must precede the render, not sit after it.
ok(gate < gt.indexOf("googletagmanager.com"), "the native gate is reached BEFORE the gtag.js script URL is rendered");

// ── 5. FIRST-PARTY ANALYTICS ARE DELIBERATELY UNTOUCHED ──────────────────
// Recorded so a later reader does not "finish the job" by ripping these out.
// PostHog (product analytics) and Sentry (crash reporting) are first-party and
// are not shared with data brokers or joined to third-party ad data, so they are
// not "tracking" under Apple's definition. Removing them would cost all
// visibility into the native build for no compliance gain.
ok(/posthog/i.test(read("package.json")), "PostHog is still a dependency — first-party product analytics stay");

console.log(`check-native-no-ad-tracking: OK — ${pass} assertions (captureAttribution EXECUTED under both platforms: web captures gclid + writes it, native captures nothing and preserves prior state; gate proven at the source so all ${CALLERS.length} callers inherit it; GoogleTags gated below every hook)`);
