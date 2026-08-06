// scripts/check-ios-privacy-manifest.mjs
//
// TWO FACTS, AND EITHER ONE ALONE IS A REJECTED UPLOAD:
//   1. ios/App/App/PrivacyInfo.xcprivacy exists and is a valid, complete manifest.
//   2. It is a member of the App target's COPY BUNDLE RESOURCES phase.
//
// Fact 2 is the one that gets missed. A file added to the Xcode navigator but
// not to the resources phase looks completely correct in the IDE — it is right
// there in the file list, next to Info.plist — and simply is not copied into
// the .app. The upload then fails with ITMS-91053 exactly as if the file had
// never been written.
//
// ── SO THIS GUARD WALKS THE OBJECT GRAPH, IT DOES NOT GREP ────────────────
// `grep 'PrivacyInfo.xcprivacy in Resources'` passes on a project where that
// PBXBuildFile is declared and then never listed in any phase's `files` array —
// which IS the failure above. CLAUDE.md: assert the syntactic position, not the
// substring. plutil converts the pbxproj to JSON, and this resolves
// target -> buildPhases -> PBXResourcesBuildPhase -> files[] -> fileRef -> path.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = (m) => { console.error("check-ios-privacy-manifest: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MANIFEST = path.join(REPO, "ios/App/App/PrivacyInfo.xcprivacy");
const PBXPROJ = path.join(REPO, "ios/App/App.xcodeproj/project.pbxproj");

const plistJson = (p) => JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", p], { encoding: "utf8" }));

// ── 1. THE FILE EXISTS AND PARSES ────────────────────────────────────────
ok(existsSync(MANIFEST), "ios/App/App/PrivacyInfo.xcprivacy exists — without it every upload is rejected with ITMS-91053 before a reviewer sees the build");
const m = plistJson(MANIFEST);
ok(m && typeof m === "object", "the manifest is a valid plist (Xcode does not validate this file at build time; App Store Connect does, after the upload)");

// ── 2. IT IS IN COPY BUNDLE RESOURCES — RESOLVED, NOT GREPPED ────────────
const proj = plistJson(PBXPROJ);
const objects = proj.objects;
ok(objects && typeof objects === "object", "the pbxproj parsed into an object graph");

const targets = Object.values(objects).filter((o) => o.isa === "PBXNativeTarget");
ok(targets.length > 0, `control: found at least one native target (got ${targets.length}) — zero would make every check below vacuous`);
const appTarget = targets.find((t) => t.name === "App") || targets[0];
ok(!!appTarget, "the App target exists");

const resPhases = (appTarget.buildPhases || [])
  .map((id) => objects[id])
  .filter((o) => o && o.isa === "PBXResourcesBuildPhase");
ok(resPhases.length === 1, `the App target has exactly one Copy Bundle Resources phase (got ${resPhases.length})`);

// Resolve every build file in the phase to the PATH of the file it references.
const bundled = [];
for (const phase of resPhases) {
  for (const bfId of phase.files || []) {
    const bf = objects[bfId];
    if (!bf) continue;
    const ref = objects[bf.fileRef];
    if (!ref) continue;
    bundled.push(ref.path || ref.name || "");
  }
}
ok(bundled.length >= 5, `control: the phase resolves a real list of bundled resources (got ${bundled.length}: ${bundled.join(", ")}) — an empty list would let the next assertion pass for the wrong reason`);
ok(bundled.includes("Assets.xcassets"), "control: a known-bundled resource resolves through the same code path (if Assets.xcassets cannot be found this way, a negative result about the manifest proves nothing)");
ok(bundled.includes("PrivacyInfo.xcprivacy"), `PrivacyInfo.xcprivacy is a RESOLVED member of Copy Bundle Resources, not merely declared — bundled: ${bundled.join(", ")}`);

// ── 3. THE MANIFEST IS COMPLETE ──────────────────────────────────────────
ok(m.NSPrivacyTracking === false, "NSPrivacyTracking is false");
ok(Array.isArray(m.NSPrivacyTrackingDomains) && m.NSPrivacyTrackingDomains.length === 0,
   "NSPrivacyTrackingDomains is empty — a domain listed here is blocked by the system without an ATT grant, and there is no ATT prompt in this build");

ok(Array.isArray(m.NSPrivacyAccessedAPITypes) && m.NSPrivacyAccessedAPITypes.length >= 1,
   "at least one required-reason API is declared — this is the specific omission ITMS-91053 names");
const REASON = /^[A-Z0-9]{4,5}\.\d$/;
for (const a of m.NSPrivacyAccessedAPITypes) {
  ok(typeof a.NSPrivacyAccessedAPIType === "string" && a.NSPrivacyAccessedAPIType.startsWith("NSPrivacyAccessedAPICategory"),
     `each accessed-API entry names a real category (got ${a.NSPrivacyAccessedAPIType})`);
  ok(Array.isArray(a.NSPrivacyAccessedAPITypeReasons) && a.NSPrivacyAccessedAPITypeReasons.length >= 1,
     `${a.NSPrivacyAccessedAPIType} carries at least one reason code — an empty reasons array is rejected`);
  for (const r of a.NSPrivacyAccessedAPITypeReasons) {
    ok(REASON.test(r), `reason code "${r}" is well formed (e.g. CA92.1) — a typo here fails validation after upload, not before`);
  }
}

// Every collected type needs ALL FOUR keys. A missing Tracking or Linked key is
// not read as false; the entry is rejected.
const REQUIRED = ["NSPrivacyCollectedDataType", "NSPrivacyCollectedDataTypeLinked", "NSPrivacyCollectedDataTypeTracking", "NSPrivacyCollectedDataTypePurposes"];
const types = m.NSPrivacyCollectedDataTypes || [];
ok(Array.isArray(types) && types.length >= 5,
   `the manifest declares the data this app really collects (got ${types.length}) — this app takes an email and name via Apple Sign In, a user id, location, photos and product analytics, so a near-empty list would be an under-declaration`);
for (const t of types) {
  const name = t.NSPrivacyCollectedDataType || "(unnamed)";
  for (const k of REQUIRED) {
    ok(Object.prototype.hasOwnProperty.call(t, k), `${name} declares ${k} — a missing key is rejected, not defaulted`);
  }
  ok(typeof t.NSPrivacyCollectedDataTypeLinked === "boolean", `${name}: Linked is a real boolean`);
  ok(typeof t.NSPrivacyCollectedDataTypeTracking === "boolean", `${name}: Tracking is a real boolean`);
  ok(Array.isArray(t.NSPrivacyCollectedDataTypePurposes) && t.NSPrivacyCollectedDataTypePurposes.length >= 1,
     `${name}: at least one purpose — an empty purposes array is rejected`);
  // The whole-file claim must hold per entry, or NSPrivacyTracking:false is a lie.
  ok(t.NSPrivacyCollectedDataTypeTracking === false,
     `${name}: Tracking is false. If any entry were true, NSPrivacyTracking:false above would be self-contradictory AND the build would need an ATT prompt it does not have.`);
}

// The things this app demonstrably does must be declared. Named individually so
// a future entry that is quietly dropped fails here rather than in review.
const declared = new Set(types.map((t) => t.NSPrivacyCollectedDataType));
const MUST = [
  ["NSPrivacyCollectedDataTypeEmailAddress", "AppleSignInPlugin.swift requests the .email scope"],
  ["NSPrivacyCollectedDataTypeUserID", "posthog.identify() is called with the Supabase user id"],
  ["NSPrivacyCollectedDataTypePreciseLocation", "getCurrentPosition() feeds the nearby ranking"],
  ["NSPrivacyCollectedDataTypePhotosorVideos", "nativePickPhoto() hands a File to the upload pipeline"],
  ["NSPrivacyCollectedDataTypeProductInteraction", "PostHog records saves, taps and sheet opens"],
];
for (const [k, why] of MUST) ok(declared.has(k), `${k} is declared — ${why}`);

// ── 4. THE CLAIM THIS FILE MAKES MUST STAY TRUE IN THE CODE ──────────────
// NSPrivacyTracking:false is not a setting, it is an assertion about runtime
// behaviour. It holds only because no Google Ads click id is captured in the
// shell. If that gate is removed, this manifest silently becomes a false
// statement to Apple — and nothing else in the repo would notice.
const attribution = readFileSync(path.join(REPO, "lib/attribution.js"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok(/if\s*\(\s*isNative\(\)\s*\)/.test(attribution),
   "lib/attribution.js still refuses to capture gclid/gbraid/wbraid in the native shell — NSPrivacyTracking:false above depends on it. See scripts/check-native-no-ad-tracking.mjs, which proves the behaviour by execution; this is the cross-link so that removing the gate breaks the manifest's own guard too.");

console.log(`check-ios-privacy-manifest: OK — ${pass} assertions (manifest present and valid; membership of Copy Bundle Resources RESOLVED through the pbxproj object graph alongside ${bundled.length - 1} other bundled resources, not grepped; ${types.length} collected data types each complete and non-tracking; ${m.NSPrivacyAccessedAPITypes.length} required-reason API declared; NSPrivacyTracking:false cross-linked to the native ad-tracking gate)`);
