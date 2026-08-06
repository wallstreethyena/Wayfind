// scripts/check-ios-device-family.mjs
//
// THE INVARIANT: the App target ships iPhone + iPad
// (TARGETED_DEVICE_FAMILY = "1,2") in EVERY build configuration.
//
// ── A PRODUCT DECISION WITH A NAMED OWNER, NOT A DEFAULT ─────────────────
// Owner decision, 2026-08-05: ship iPad. An earlier version of this guard
// asserted "1" (iPhone-only) on the strength of a work order that recommended
// it. That was the wrong call to make on a work order's say-so — it is a
// product decision — and the owner's actual choice is iPad.
//
// The tradeoff is recorded so nobody "helpfully" flips it back: declaring iPad
// support is a promise the app has to keep. Wayfind is a remote-URL Capacitor
// shell around a layout designed and verified at 390px, so an iPad build is
// JUDGED on iPad, needs its own screenshot set, and gives a reviewer a second
// surface on which to find a stretched phone layout — guideline 4.2 territory
// for a wrapped site. That is the cost the owner accepted in exchange for being
// listed as an iPad app.
//
// UISupportedInterfaceOrientations~ipad in Info.plist becomes LIVE again with
// this setting. It was deliberately left in place when the target was
// iPhone-only for exactly this reason.
//
// If this is revisited, it is revisited by the OWNER, and this comment and the
// assertion below change together.
//
// ── WHY THIS COUNTS INSTEAD OF MATCHING ───────────────────────────────────
// The setting appears TWICE, once per build configuration (Debug, Release).
// `src.includes('TARGETED_DEVICE_FAMILY = "1"')` goes green the moment ONE of
// them changes — and the one left behind is exactly as likely to be Release as
// Debug. CLAUDE.md names this failure directly: a value that exists N times must
// be COUNTED, because includes() cannot tell 1 from 2.
//
// This is not hypothetical for this repo. The identical shape ("there were two
// defaults; one changed, the other still matched") is one of the four recorded
// false greens that motivated the rule.
// PARSED IN-PROCESS, not via `plutil`. plutil is a macOS binary and Vercel
// builds on Linux, so shelling out to it failed the build outright with
// `spawnSync plutil ENOENT`. scripts/lib/plistParse.mjs parses both plist
// formats in JS and scripts/test-plist-parse.mjs proves it byte-identical to
// plutil wherever plutil exists. Skipping this check off-Mac would have been
// strictly worse than deleting it: green on CI while verifying nothing.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPlist } from "./lib/plistParse.mjs";

let pass = 0;
const fail = (m) => { console.error("check-ios-device-family: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PBXPROJ = path.join(REPO, "ios/App/App.xcodeproj/project.pbxproj");
const proj = readPlist(PBXPROJ);
const objects = proj.objects;

// Resolve the App target's own build configurations through the object graph,
// rather than sweeping every XCBuildConfiguration in the file — the project also
// holds PROJECT-level configurations, and counting those would change the
// expected total silently if one were ever added.
const targets = Object.values(objects).filter((o) => o.isa === "PBXNativeTarget");
ok(targets.length >= 1, `control: native targets found (got ${targets.length}) — zero would make everything below vacuous`);
const appTarget = targets.find((t) => t.name === "App") || targets[0];
ok(!!appTarget, "the App target exists");

const list = objects[appTarget.buildConfigurationList];
ok(list && list.isa === "XCConfigurationList", "the App target has a configuration list");
const configs = (list.buildConfigurations || []).map((id) => objects[id]).filter(Boolean);
ok(configs.length >= 2, `control: the App target has at least two build configurations (got ${configs.length}: ${configs.map((c) => c.name).join(", ")}) — this is the whole reason the check counts`);

const names = configs.map((c) => c.name).sort();
ok(names.includes("Debug") && names.includes("Release"), `both Debug and Release are present (got ${names.join(", ")})`);

// EVERY configuration, named individually so the failure says which one.
let declared = 0;
for (const c of configs) {
  const v = c.buildSettings && c.buildSettings.TARGETED_DEVICE_FAMILY;
  ok(v !== undefined, `${c.name}: TARGETED_DEVICE_FAMILY is set EXPLICITLY. Xcode's default happens to be iPhone+iPad too, so an absent setting would give the right build for the wrong reason — and would flip silently if that default ever changed.`);
  ok(String(v) === "1,2", `${c.name}: TARGETED_DEVICE_FAMILY is "1,2" (iPhone + iPad), got ${JSON.stringify(v)}. Owner decision 2026-08-05 — "1" would silently drop the iPad listing this submission is built around.`);
  declared += 1;
}
ok(declared === configs.length, `every one of the ${configs.length} configurations was checked, not just the first`);

// And the raw-text count, as a second, independent read. If the object-graph walk
// ever silently resolved fewer configurations than exist, this catches it.
const raw = readFileSync(PBXPROJ, "utf8");
const all = raw.match(/TARGETED_DEVICE_FAMILY = "[^"]*";/g) || [];
ok(all.length === declared, `the raw file contains exactly ${declared} TARGETED_DEVICE_FAMILY settings, matching the ${declared} resolved through the object graph (got ${all.length}: ${all.join(" ")}) — a mismatch means one is hiding somewhere the graph walk does not reach`);
const bad = all.filter((s) => !/= "1,2";$/.test(s));
ok(bad.length === 0, `every configuration declares iPhone + iPad (offending: ${bad.join(" ")})`);

console.log(`check-ios-device-family: OK — ${pass} assertions (all ${declared} App-target build configurations [${names.join(", ")}] resolved through the pbxproj object graph declare TARGETED_DEVICE_FAMILY = "1,2"; counted, not matched, because includes() cannot tell 1 changed from 2)`);
