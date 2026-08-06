// scripts/check-ios-device-family.mjs
//
// THE INVARIANT: the App target ships iPhone-only (TARGETED_DEVICE_FAMILY = "1")
// in EVERY build configuration.
//
// WHY. Declaring iPad support is a promise the app has to keep. Wayfind is a
// remote-URL Capacitor shell around a layout designed and verified at 390px; an
// iPad build is judged on iPad, needs its own screenshots, and gives a reviewer
// a second surface on which to find a stretched phone layout — which is
// guideline 4.2 territory for a wrapped site. iPhone-only costs nothing: an
// iPhone app still installs and runs on iPad in compatibility mode, it simply
// is not graded there.
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
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = (m) => { console.error("check-ios-device-family: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PBXPROJ = path.join(REPO, "ios/App/App.xcodeproj/project.pbxproj");
const proj = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", PBXPROJ], { encoding: "utf8" }));
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
  ok(v !== undefined, `${c.name}: TARGETED_DEVICE_FAMILY is set (absent means Xcode's default, which is iPhone+iPad)`);
  ok(String(v) === "1", `${c.name}: TARGETED_DEVICE_FAMILY is "1" (iPhone only), got ${JSON.stringify(v)}. "1,2" promises an iPad build that is judged on iPad and needs its own screenshots.`);
  declared += 1;
}
ok(declared === configs.length, `every one of the ${configs.length} configurations was checked, not just the first`);

// And the raw-text count, as a second, independent read. If the object-graph walk
// ever silently resolved fewer configurations than exist, this catches it.
const raw = execFileSync("/bin/cat", [PBXPROJ], { encoding: "utf8" });
const all = raw.match(/TARGETED_DEVICE_FAMILY = "[^"]*";/g) || [];
ok(all.length === declared, `the raw file contains exactly ${declared} TARGETED_DEVICE_FAMILY settings, matching the ${declared} resolved through the object graph (got ${all.length}: ${all.join(" ")}) — a mismatch means one is hiding somewhere the graph walk does not reach`);
const bad = all.filter((s) => !/= "1";$/.test(s));
ok(bad.length === 0, `no configuration still declares iPad support (offending: ${bad.join(" ")})`);

console.log(`check-ios-device-family: OK — ${pass} assertions (all ${declared} App-target build configurations [${names.join(", ")}] resolved through the pbxproj object graph declare TARGETED_DEVICE_FAMILY = "1"; counted, not matched, because includes() cannot tell 1 changed from 2)`);
