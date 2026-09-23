// scripts/check-ios-device-family.mjs
//
// THE INVARIANT: the App target ships iPhone ONLY
// (TARGETED_DEVICE_FAMILY = "1") in EVERY build configuration.
//
// ── A PRODUCT DECISION WITH A NAMED OWNER, NOT A DEFAULT ─────────────────
// Owner decision, 2026-09-23, verbatim: "For v1, prioritize iPhone launch
// speed and approval quality. Configure the first release as iPhone only
// rather than shipping a mediocre iPad experience. We can expand afterward."
//
// This REVERSES the 2026-08-05 decision this same guard used to assert
// ("1,2", ship iPad) — recorded here, not deleted, so nobody reads the git
// history and "corrects" this back on the strength of the old comment. The
// tradeoff the owner is declining this time: Wayfind is a remote-URL
// Capacitor shell around a layout designed and verified at 390px, so an iPad
// build would be JUDGED on iPad, need its own screenshot set, and give a
// reviewer a second surface on which to find a stretched phone layout —
// guideline 4.2 territory for a wrapped site. Shipping iPhone-only trades a
// second listed device class for a cleaner, faster first approval.
//
// UISupportedInterfaceOrientations~ipad in Info.plist is REMOVED alongside
// this change (asserted below) — with TARGETED_DEVICE_FAMILY "1" it would
// never be read by iOS, and a dead, unread key is exactly the kind of stale
// config that quietly reactivates on the next "helpful" device-family flip.
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
  ok(v !== undefined, `${c.name}: TARGETED_DEVICE_FAMILY is set EXPLICITLY. An absent setting would fall back to Xcode's own default (currently iPhone+iPad), which is not this submission's build regardless of what it defaults to.`);
  ok(String(v) === "1", `${c.name}: TARGETED_DEVICE_FAMILY is "1" (iPhone only), got ${JSON.stringify(v)}. Owner decision 2026-09-23 — "1,2" would silently ship an unjudged iPad listing this submission is built to avoid.`);
  declared += 1;
}
ok(declared === configs.length, `every one of the ${configs.length} configurations was checked, not just the first`);

// And the raw-text count, as a second, independent read. If the object-graph walk
// ever silently resolved fewer configurations than exist, this catches it.
const raw = readFileSync(PBXPROJ, "utf8");
const all = raw.match(/TARGETED_DEVICE_FAMILY = "[^"]*";/g) || [];
ok(all.length === declared, `the raw file contains exactly ${declared} TARGETED_DEVICE_FAMILY settings, matching the ${declared} resolved through the object graph (got ${all.length}: ${all.join(" ")}) — a mismatch means one is hiding somewhere the graph walk does not reach`);
const bad = all.filter((s) => !/= "1";$/.test(s));
ok(bad.length === 0, `every configuration declares iPhone only (offending: ${bad.join(" ")})`);

// ── RELEASE SIGNING IS AUTOMATIC AND UNPINNED ────────────────────────────
// Owner decision 2026-08-05. Release was CODE_SIGN_STYLE = Manual pinned to
// PROVISIONING_PROFILE_SPECIFIER = "Wayfind App Store" while Debug was
// Automatic — a split that fails only at ARCHIVE time, which is the one build
// nobody runs until submission day because every simulator and device build
// uses Debug and looks perfectly healthy.
//
// It was doubly wrong by then: associated-domains and production APNs had been
// added underneath it, so even if that profile existed it predated both and
// could not carry them. A hand-pinned profile must be regenerated every time an
// entitlement changes; Automatic lets Xcode do it.
//
// ── WHY THIS LIVES HERE AND NOT ONLY IN check-auth ───────────────────────
// check-auth asserts the CONTRACT — distribution identity, WAYFIND LLC team —
// with whole-file includes(), which cannot say WHICH configuration is wrong and
// would be satisfied by the right string sitting in Debug alone. This file
// already resolves each configuration through the pbxproj object graph, so it
// asserts the STRUCTURE per config. Different questions, no overlap: do not
// collapse them.
const relCfg = configs.find((c) => c.name === "Release");
ok(!!relCfg, "control: a Release configuration resolves by name");
const relStyle = (relCfg.buildSettings || {}).CODE_SIGN_STYLE;
ok(relStyle === "Automatic",
   `Release CODE_SIGN_STYLE is Automatic (got ${JSON.stringify(relStyle)}). Manual signing fails the archive — the one build nobody runs until submission day.`);

// No configuration may pin a profile, named per config so the failure says which.
for (const c of configs) {
  const spec = (c.buildSettings || {}).PROVISIONING_PROFILE_SPECIFIER;
  ok(!spec, `${c.name} pins no PROVISIONING_PROFILE_SPECIFIER (got ${JSON.stringify(spec)}). A named profile has to be regenerated by hand on every entitlement change, and this app's entitlements now include associated-domains and production APNs.`);
}

// The half that must NOT be lost while removing the pin: Release still signs as
// App Store distribution for the Wayfind team. Removing a manual pin is only
// safe if the build is still distribution-grade.
ok((relCfg.buildSettings || {}).CODE_SIGN_IDENTITY === "Apple Distribution",
   `Release still signs with the Apple Distribution identity (got ${JSON.stringify((relCfg.buildSettings || {}).CODE_SIGN_IDENTITY)}) — Automatic must not have quietly become a development-signed build`);
ok((relCfg.buildSettings || {}).DEVELOPMENT_TEAM === "VZGMT57ND7",
   `Release is signed for the WAYFIND LLC team VZGMT57ND7 (got ${JSON.stringify((relCfg.buildSettings || {}).DEVELOPMENT_TEAM)})`);

// ── THE IPHONE-ONLY DECISION MUST HOLD IN Info.plist TOO ─────────────────
// TARGETED_DEVICE_FAMILY "1" is the setting that actually stops iOS from
// installing on an iPad, but three Info.plist keys are the OTHER half of the
// same decision, and none of them are enforced by the pbxproj alone: a stale
// ~ipad orientation key, a landscape orientation the 390px layout was never
// built for, or a 32-bit armv7 capability would all sit there unread today
// and become live again the instant a future change touches device family.
// Asserted structurally (array contents, not a substring) per CLAUDE.md —
// includes() cannot tell "exactly Portrait" from "Portrait plus Landscape".
const INFO_PLIST = path.join(REPO, "ios/App/App/Info.plist");
const info = readPlist(INFO_PLIST);
ok(info && typeof info === "object", "Info.plist parses");

ok(!Object.prototype.hasOwnProperty.call(info, "UISupportedInterfaceOrientations~ipad"),
   `Info.plist has no UISupportedInterfaceOrientations~ipad key (got ${JSON.stringify(info["UISupportedInterfaceOrientations~ipad"])}). TARGETED_DEVICE_FAMILY "1" means iOS never reads it, but a key sitting there unread is exactly the kind of stale config that reactivates on the next device-family change nobody re-reads this file for.`);

const orientations = info.UISupportedInterfaceOrientations;
ok(Array.isArray(orientations), `control: UISupportedInterfaceOrientations is an array (got ${JSON.stringify(orientations)}) — a non-array would make the next assertion vacuous`);
ok(orientations && orientations.length === 1 && orientations[0] === "UIInterfaceOrientationPortrait",
   `UISupportedInterfaceOrientations is EXACTLY ["UIInterfaceOrientationPortrait"] (got ${JSON.stringify(orientations)}). The layout is built and verified at 390px only; a landscape entry left behind would ship a device rotation nothing in the app has ever been designed for.`);

const caps = info.UIRequiredDeviceCapabilities;
ok(Array.isArray(caps), `control: UIRequiredDeviceCapabilities is an array (got ${JSON.stringify(caps)})`);
ok(caps && caps.length === 1 && caps[0] === "arm64",
   `UIRequiredDeviceCapabilities is EXACTLY ["arm64"] (got ${JSON.stringify(caps)}). "armv7" is a 32-bit-era leftover no device running this app's iOS 15+ deployment target can be; arm64 is the real, current requirement.`);

console.log(`check-ios-device-family: OK — ${pass} assertions (all ${declared} App-target build configurations [${names.join(", ")}] resolved through the pbxproj object graph declare TARGETED_DEVICE_FAMILY = "1" [iPhone only, owner decision 2026-09-23]; counted, not matched, because includes() cannot tell 1 changed from 2; Release signing resolved per-config as Automatic, unpinned, Apple Distribution, team VZGMT57ND7; Info.plist carries no ~ipad orientation key, exactly Portrait orientations, and exactly [arm64] required device capabilities)`);
