// scripts/test-plist-parse.mjs — the parsers in scripts/lib/plistParse.mjs are
// hand-written. This is what makes them safe to depend on.
//
// FOUR iOS guards resolve facts out of plists: the privacy manifest's contents,
// membership of Copy Bundle Resources, membership of the Sources compile phase,
// TARGETED_DEVICE_FAMILY per build configuration. All four used to shell out to
// `plutil` and all four FAILED THE VERCEL BUILD, because plutil is a macOS
// binary and Vercel builds on Linux:
//
//     Error: spawnSync plutil ENOENT
//
// Skipping those guards where plutil is missing would have been strictly worse
// than deleting them — green on CI while checking nothing.
//
// ── THE DIFFERENTIAL IS THE POINT ─────────────────────────────────────────
// A parser tested only against the files it was written for proves nothing
// except that it is self-consistent. So where plutil EXISTS (any Mac, including
// every developer machine in this project), both parsers are diffed against it
// on every plist in the repo and must agree EXACTLY.
//
// Where plutil does not exist, this says so out loud and falls back to
// structural invariants. That is a weaker check and is labelled as one, rather
// than printing the same confident line in both cases.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseXmlPlist, parsePbxproj, readPlist } from "./lib/plistParse.mjs";

let pass = 0;
const fail = (m) => { console.error("test-plist-parse: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ── 1. FIXTURES — the shapes Apple emits, parsed by CALLING the parser ───
// These run everywhere, plutil or not.
const xml = parseXmlPlist(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>flagTrue</key><true/>
  <key>flagFalse</key><false/>
  <key>str</key><string>hello</string>
  <key>empty</key><string></string>
  <key>selfEmpty</key><string/>
  <key>escaped</key><string>a &amp; b &lt;c&gt; &quot;d&quot;</string>
  <key>num</key><integer>42</integer>
  <key>arr</key><array><string>one</string><string>two</string></array>
  <key>emptyArr</key><array/>
  <key>nested</key><dict><key>inner</key><array><dict><key>deep</key><true/></dict></array></dict>
</dict>
</plist>`);
ok(xml.flagTrue === true && xml.flagFalse === false, "XML: <true/> and <false/> become real booleans, not strings");
ok(xml.str === "hello", "XML: a string is its text");
ok(xml.empty === "" && xml.selfEmpty === "", "XML: both empty-string forms parse to \"\"");
ok(xml.escaped === 'a & b <c> "d"', `XML: entities decode, and &amp; resolves LAST so &amp;lt; does not become < (got ${JSON.stringify(xml.escaped)})`);
ok(xml.num === 42, "XML: <integer> is a number");
ok(Array.isArray(xml.arr) && xml.arr.length === 2 && xml.arr[1] === "two", "XML: arrays keep order");
ok(Array.isArray(xml.emptyArr) && xml.emptyArr.length === 0, "XML: <array/> is an empty array, not undefined");
ok(xml.nested.inner[0].deep === true, "XML: dict -> array -> dict -> bool nests correctly");
ok(Object.keys(xml).length === 10, `XML: every key survived (got ${Object.keys(xml).length})`);

const pbx = parsePbxproj(`// !$*UTF8*$!
{
  archiveVersion = 1;
  classes = { };
  objects = {
    AAA111 /* thing.swift in Sources */ = {isa = PBXBuildFile; fileRef = BBB222 /* thing.swift */; };
    CCC333 = {
      isa = PBXGroup;
      children = (
        AAA111 /* thing.swift */,
        BBB222 /* other.swift */,
      );
      path = "App With Spaces";
      quoted = "semi; colon and = equals inside";
    };
  };
  rootObject = ZZZ999 /* Project object */;
}`);
ok(pbx.archiveVersion === "1", "pbxproj: scalars are strings (the format carries no type info, and plutil renders them the same way)");
ok(typeof pbx.classes === "object" && Object.keys(pbx.classes).length === 0, "pbxproj: `{ }` is an empty dict");
ok(pbx.objects.AAA111.isa === "PBXBuildFile", "pbxproj: an object id keys into a dict, and its /* comment */ is discarded");
ok(pbx.objects.AAA111.fileRef === "BBB222", "pbxproj: a trailing /* comment */ after a value is not part of the value");
ok(Array.isArray(pbx.objects.CCC333.children) && pbx.objects.CCC333.children.length === 2, "pbxproj: `( ... )` is an array and the trailing comma does not add a phantom element");
ok(pbx.objects.CCC333.children[0] === "AAA111", "pbxproj: array entries drop their comments too");
ok(pbx.objects.CCC333.path === "App With Spaces", "pbxproj: a quoted string keeps its spaces and loses its quotes");
ok(pbx.objects.CCC333.quoted === "semi; colon and = equals inside", "pbxproj: structural characters inside quotes are text, not syntax — this is what a naive split would get wrong");
ok(pbx.rootObject === "ZZZ999", "pbxproj: the top-level dict parses");

// A comment containing the sequence that ends a comment, and a bare `//` in a
// value — both are real in Xcode files and both break a careless skipper.
const tricky = parsePbxproj(`{ a = /* one */ 1; b = "http://example.com/x"; c = 3; }`);
ok(tricky.a === "1" && tricky.c === "3", "pbxproj: an inline /* comment */ between = and the value is skipped");
ok(tricky.b === "http://example.com/x", "pbxproj: `//` inside a QUOTED string is text, not a comment — a skipper that ran before quote handling would truncate this URL");

// ── 2. THE DIFFERENTIAL, WHERE plutil EXISTS ─────────────────────────────
let plutil = true;
try { execFileSync("plutil", ["-help"], { stdio: "ignore" }); } catch (e) { plutil = false; }

const FILES = [
  "ios/App/App.xcodeproj/project.pbxproj",
  "ios/App/App/Info.plist",
  "ios/App/App/App.entitlements",
  "ios/App/App/PrivacyInfo.xcprivacy",
].filter((f) => existsSync(path.join(REPO, f)));

ok(FILES.length >= 2, `control: found real plists in the repo to check (got ${FILES.length}: ${FILES.join(", ")}) — an empty list would make this whole section vacuous`);

if (plutil) {
  let compared = 0;
  for (const f of FILES) {
    const abs = path.join(REPO, f);
    const truth = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", abs], { encoding: "utf8" }));
    const mine = readPlist(abs);
    // Key order is not meaningful in a plist; sort before comparing so an
    // ordering difference is not reported as a content difference.
    const canon = (v) => {
      if (Array.isArray(v)) return v.map(canon);
      if (v && typeof v === "object") {
        const o = {};
        for (const k of Object.keys(v).sort()) o[k] = canon(v[k]);
        return o;
      }
      return v;
    };
    const a = JSON.stringify(canon(truth));
    const b = JSON.stringify(canon(mine));
    ok(a.length > 40, `control: plutil returned real content for ${f} (${a.length} chars)`);
    // Point at the first divergence rather than dumping two huge blobs. Built
    // eagerly so the ASSERTION below is a real comparison — an `if (a !== b)
    // fail(...)` followed by `ok(true, ...)` reads the same and cannot fail,
    // which is what scripts/check-guards-can-fail.mjs exists to reject.
    let d = 0;
    while (d < a.length && a[d] === b[d]) d += 1;
    ok(a === b, `${f}: our parser must agree with plutil EXACTLY, but diverges at offset ${d}\n  plutil: …${a.slice(Math.max(0, d - 60), d + 60)}…\n  ours:   …${b.slice(Math.max(0, d - 60), d + 60)}…`);
    compared += 1;
  }
  ok(compared === FILES.length, `every plist in the repo was diffed against plutil (${compared}/${FILES.length})`);
  console.log(`test-plist-parse: OK — ${pass} assertions (fixtures cover booleans, entities, empty forms, nesting, quoted structural characters and // inside a URL; DIFFERENTIAL against plutil on all ${compared} real plists: byte-identical canonical JSON)`);
} else {
  // Honest about being weaker. The real verification happens on any Mac.
  for (const f of FILES) {
    const parsed = readPlist(path.join(REPO, f));
    ok(parsed && typeof parsed === "object", `${f}: parses into an object`);
    ok(Object.keys(parsed).length > 0, `${f}: yields a non-empty result — an empty parse would silently pass every downstream guard's existence checks as "absent"`);
  }
  const proj = readPlist(path.join(REPO, "ios/App/App.xcodeproj/project.pbxproj"));
  ok(proj.objects && Object.keys(proj.objects).length > 10, `the pbxproj yields a populated objects map (${Object.keys(proj.objects || {}).length} objects)`);
  ok(Object.values(proj.objects).some((o) => o && o.isa === "PBXNativeTarget"), "…including a PBXNativeTarget, which is what the iOS guards resolve targets from");
  console.log(`test-plist-parse: OK — ${pass} assertions (fixtures full; plutil is NOT available on this platform, so the differential did NOT run — this is the weaker structural check. The byte-for-byte comparison against plutil runs on any Mac.)`);
}
