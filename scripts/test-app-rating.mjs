// scripts/test-app-rating.mjs — the rating prompt: when it fires, and that it
// can fire at all.
//
// A rating prompt is unusually unforgiving. StoreKit gives back NOTHING — no
// callback, no error, no signal of whether the sheet appeared — and allows at
// most three per year. So every mistake here is invisible in production and
// expensive: ask too early and you collect one-star "stop asking me" reviews,
// ask too often and you burn the annual budget on people who already declined,
// wire it up wrongly and nothing ever happens and nobody finds out.
//
// Which makes this a guard about three separate things:
//   1. WHEN — decide() is CALLED, gate by gate, not read.
//   2. WHETHER IT CAN — the plugin name agreed on both sides of the bridge, and
//      the Swift file actually in the compile phase.
//   3. WHETHER IT IS REACHED — the trigger at a real, user-visible call site.
//
// Item 2 is the one that would otherwise ship broken in silence. registerPlugin
// takes a STRING; if it does not equal the Swift plugin's jsName, the proxy
// resolves to nothing, requestReview() rejects into a catch, and the JS reports
// "plugin-unavailable" forever. Nothing errors at build time. So the two names
// are read out of the two files and compared.
// PARSED IN-PROCESS, not via `plutil`. plutil is a macOS binary and Vercel
// builds on Linux, so shelling out to it failed the build outright with
// `spawnSync plutil ENOENT`. scripts/lib/plistParse.mjs parses both plist
// formats in JS and scripts/test-plist-parse.mjs proves it byte-identical to
// plutil wherever plutil exists. Skipping this check off-Mac would have been
// strictly worse than deleting it: green on CI while verifying nothing.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPlist } from "./lib/plistParse.mjs";
import { decide, readState, MIN_MOMENTS, COOLDOWN_DAYS, STORAGE_KEY } from "../lib/appRating.js";

let pass = 0;
const fail = (m) => { console.error("test-app-rating: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(REPO, p), "utf8");
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const DAY = 86400000;
const NOW = Date.parse("2026-08-05T12:00:00.000Z");
const ago = (d) => new Date(NOW - d * DAY).toISOString();

// ── 1. THE GATES, BY CALLING decide() ────────────────────────────────────
ok(MIN_MOMENTS >= 2, `a first-time sharer is never asked (MIN_MOMENTS = ${MIN_MOMENTS})`);
ok(COOLDOWN_DAYS >= 30, `the cooldown is a real one (${COOLDOWN_DAYS} days)`);
ok(COOLDOWN_DAYS < 365, `…and shorter than StoreKit's own 365-day window (${COOLDOWN_DAYS}), so our gate is the mechanism and Apple's is the backstop, not the other way round`);

// Below the threshold: never.
for (let m = 0; m < MIN_MOMENTS - 1; m += 1) {
  const v = decide({ moments: m, lastPromptAt: null }, NOW);
  ok(v.prompt === false, `share #${m + 1} of a required ${MIN_MOMENTS} does not prompt (reason: ${v.reason})`);
  ok(v.next.moments === m + 1, `…but the moment is still COUNTED (${v.next.moments}) — a gate that forgets never opens`);
  ok(v.next.lastPromptAt === null, "…and no cooldown is started by a prompt that did not happen");
}

// At the threshold: yes. This is the positive control — without it every
// assertion above is satisfied by a decide() that returns false unconditionally.
const first = decide({ moments: MIN_MOMENTS - 1, lastPromptAt: null }, NOW);
ok(first.prompt === true, `share #${MIN_MOMENTS} DOES prompt (reason: ${first.reason}) — the control that stops a permanently-false decide() from passing everything above`);
ok(first.next.lastPromptAt === new Date(NOW).toISOString(), "…and stamps the cooldown at the moment of prompting");

// Cooldown, both directions.
const inside = decide({ moments: 99, lastPromptAt: ago(COOLDOWN_DAYS - 1) }, NOW);
ok(inside.prompt === false && inside.reason === "cooldown", `a prompt ${COOLDOWN_DAYS - 1} days ago blocks a new one (got ${inside.reason})`);
ok(inside.next.lastPromptAt === ago(COOLDOWN_DAYS - 1), "…and a blocked prompt does NOT slide the cooldown forward — otherwise a frequent sharer could never be asked again");
const outside = decide({ moments: 99, lastPromptAt: ago(COOLDOWN_DAYS + 1) }, NOW);
ok(outside.prompt === true, `a prompt ${COOLDOWN_DAYS + 1} days ago allows a new one — the cooldown expires rather than being permanent`);

// Fail closed on corrupt state. This is the one that would silently become
// "prompt on every single share" if it were treated as "never prompted".
const corrupt = decide({ moments: 99, lastPromptAt: "not-a-date" }, NOW);
ok(corrupt.prompt === false && corrupt.reason === "unreadable-timestamp",
   `an unparseable timestamp fails CLOSED (got ${corrupt.reason}) — read as "never prompted" it would prompt on every share forever`);
for (const junk of [null, undefined, {}, { moments: -5, lastPromptAt: 12345 }]) {
  const v = decide(junk, NOW);
  ok(typeof v.prompt === "boolean" && v.next.moments >= 1, `decide(${JSON.stringify(junk)}) returns a sane verdict rather than throwing`);
}

// readState survives a missing window (server render) rather than throwing.
const s0 = readState();
ok(s0 && s0.moments === 0 && s0.lastPromptAt === null, "readState() with no window returns a neutral state instead of throwing");
ok(typeof STORAGE_KEY === "string" && STORAGE_KEY.startsWith("wf_"), `state is stored under a namespaced key (${STORAGE_KEY})`);

// ── 2. THE BRIDGE NAMES AGREE ────────────────────────────────────────────
const swift = read("ios/App/App/AppRatingPlugin.swift");
const jsName = (swift.match(/public let jsName\s*=\s*"([^"]+)"/) || [])[1];
ok(!!jsName, "control: the Swift plugin declares a jsName");
const js = stripJs(read("lib/appRating.js"));
const registered = (js.match(/registerPlugin\(\s*"([^"]+)"\s*\)/) || [])[1];
ok(!!registered, "control: the JS registers a plugin by name");
ok(jsName === registered,
   `the JS registerPlugin("${registered}") matches the Swift jsName "${jsName}". A mismatch resolves to a proxy that rejects into the catch and reports "plugin-unavailable" forever, with nothing failing at build time.`);

const method = (swift.match(/CAPPluginMethod\(name:\s*"([^"]+)"/) || [])[1];
ok(!!method, "the Swift plugin exposes a method");
ok(new RegExp(`\\.${method}\\(`).test(js), `the JS calls the method the plugin actually exposes (${method})`);
ok(/CAPBridgedPlugin/.test(swift), "the plugin conforms to CAPBridgedPlugin — Capacitor 6+ will not see its methods otherwise");
ok(/SKStoreReviewController\.requestReview\(in:/.test(swift),
   "it uses the in-app StoreKit sheet, not a link out to the App Store — a link ejects the user from the app to write a review, which converts far worse");

// ── 3. IT IS ACTUALLY COMPILED ───────────────────────────────────────────
// A Swift file in the navigator but not in the Sources phase is never built.
// The plugin then does not exist at runtime, and the failure is indistinguishable
// from a name mismatch. Resolved through the object graph, not grepped —
// the same trap as Copy Bundle Resources.
const proj = readPlist(path.join(REPO, "ios/App/App.xcodeproj/project.pbxproj"));
const objects = proj.objects;
const target = Object.values(objects).find((o) => o.isa === "PBXNativeTarget" && o.name === "App")
  || Object.values(objects).find((o) => o.isa === "PBXNativeTarget");
ok(!!target, "control: the App target resolves");
const sourcePhases = (target.buildPhases || []).map((id) => objects[id]).filter((o) => o && o.isa === "PBXSourcesBuildPhase");
ok(sourcePhases.length === 1, `the target has one Sources phase (got ${sourcePhases.length})`);
const compiled = [];
for (const ph of sourcePhases) {
  for (const bfId of ph.files || []) {
    const bf = objects[bfId];
    const ref = bf && objects[bf.fileRef];
    if (ref) compiled.push(ref.path || ref.name || "");
  }
}
ok(compiled.includes("AppDelegate.swift"), `control: a known-compiled file resolves through this code path (compiled: ${compiled.join(", ")})`);
ok(compiled.includes("AppRatingPlugin.swift"), `AppRatingPlugin.swift is in the Sources build phase — in the navigator but not compiled, the plugin simply does not exist at runtime and looks exactly like a name mismatch. Compiled: ${compiled.join(", ")}`);

// ── 4. IT IS REACHED, FROM A REAL MOMENT ─────────────────────────────────
// Reachability is transitive — a trigger nothing calls is the "All experiences"
// sheet again (CLAUDE.md). So this walks to the user-visible action.
const home = stripJs(read("app/home.js"));
ok(/import\s*\{\s*noteHighPointAndMaybeAsk\s*\}\s*from/.test(home),
   "app/home.js imports the trigger — an unbound call would ReferenceError at render");
const call = home.indexOf("noteHighPointAndMaybeAsk()");
ok(call > -1, "…and calls it");

// Execute the real shell callback adapter against the real shared transport.
// Native success is now an onShared callback, not an inline Capacitor marker;
// Copy/composer selection must never become a StoreKit high point.
const MUTATION = process.argv.includes("--neutral-moment-mutation-child");
const homeAst = ts.createSourceFile("home.js", read("app/home.js"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.JSX);
const declaration = homeAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "shareLink");
ok(!!declaration, "control: the real shell shareLink declaration is extracted before testing its callbacks");
let adapterSource = declaration.getText(homeAst);
if (MUTATION) {
  const marker = '_sharePath(how);';
  ok(adapterSource.includes(marker), "neutral-moment mutation must find the actual share-opening return path");
  adapterSource = adapterSource.replace(marker, 'noteHighPointAndMaybeAsk(); ' + marker);
}
process.env.NEXT_PUBLIC_SITE_URL = "https://www.gowayfind.com";
const { shareOut } = await import("../lib/shareOut.js");
class Node {
  constructor(tag, doc) { this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.events = {}; this.style = {}; this._text = ""; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((n) => n.textContent).join(" "); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(name, value) { if (name === "id") this.id = String(value); }
  addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((n) => n !== this); this.parentNode = null; }
  focus() { this.doc.activeElement = this; }
  querySelectorAll() { return nodes(this).filter((n) => n.tagName === "BUTTON" || n.tagName === "A"); }
  click() { for (const fn of this.events.click || []) fn({ preventDefault() {}, stopPropagation() {} }); }
}
const nodes = (node) => node.children.flatMap((child) => [child, ...nodes(child)]);
class Document {
  constructor() { this.body = new Node("body", this); this.events = {}; }
  createElement(tag) { return new Node(tag, this); }
  getElementById(id) { return nodes(this.body).find((n) => n.id === id) || null; }
  addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.events[type] = (this.events[type] || []).filter((f) => f !== fn); }
}
const original = Object.fromEntries(["document", "window", "navigator"].map((key) => [key, globalThis[key]]));
const setGlobal = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
try {
  for (const outcome of ["success", "cancelled", "failed", "copy", "composer", "web-success", "rating-throws"]) {
    const doc = new Document();
    const native = outcome !== "web-success";
    let ratingCalls = 0, nativeCalls = 0, creditedShares = 0, resolve, reject;
    const completion = new Promise((a, b) => { resolve = a; reject = b; });
    setGlobal("document", doc); setGlobal("window", { location: { origin: "https://www.gowayfind.com" } });
    setGlobal("navigator", { share() { nativeCalls++; return completion; }, clipboard: { writeText() { return Promise.resolve(); } } });
    const paths = [];
    const adapter = Function("shareOut", "openShareFlow", "inShareChoice", "_sharePath", "isNative", "noteHighPointAndMaybeAsk", adapterSource + "; return shareLink;")(
      shareOut, () => { throw new Error("fixture runs from the actual intent-choice callback"); }, () => true,
      (value) => paths.push(value), () => native, () => { ratingCalls++; if (outcome === "rating-throws") throw new Error("fixture StoreKit failure"); },
    );
    const opened = adapter("Fixture place", "/p/fixture", null, "Use this link", () => { creditedShares++; });
    ok(opened === true && !!doc.getElementById("wf-share-out-chooser"), `${outcome}: the real adapter opens the shared chooser before a native attempt`);
    ok(ratingCalls === 0 && nativeCalls === 0, `${outcome}: merely opening share choices must not become a rating moment`);
    const choice = nodes(doc.body).find((n) => outcome === "copy" ? n.textContent === "Copy link" : outcome === "composer" ? n.tagName === "A" && n.textContent === "Text message" : n.textContent === "More share options");
    ok(!!choice, `${outcome}: the exercised transport actually exposes its intended user choice`);
    choice.click();
    if (outcome === "cancelled") reject(Object.assign(new Error("cancelled"), { name: "AbortError" }));
    else if (outcome === "failed") reject(Object.assign(new Error("refused"), { name: "NotAllowedError" }));
    else if (outcome !== "copy" && outcome !== "composer") resolve();
    await settle();
    const completedNative = outcome === "success" || outcome === "rating-throws";
    ok(ratingCalls === (completedNative ? 1 : 0), `${outcome}: only completed native-wrapper sharing can reach the rating trigger`);
    ok(creditedShares === (["success", "rating-throws", "web-success", "copy", "composer"].includes(outcome) ? 1 : 0), `${outcome}: success/copy/composer share-credit semantics remain distinct from cancellation or refusal`);
    if (outcome === "failed") ok(!!doc.getElementById("wf-share-out-chooser"), "native refusal leaves visible alternatives without a rating prompt");
    if (outcome === "cancelled") ok(!doc.getElementById("wf-share-out-chooser"), "native cancellation stays inert instead of opening another chooser or rating prompt");
    if (completedNative) ok(paths.includes("native_ok"), `${outcome}: actual native completion reaches the adapter's successful path`);
  }
} finally {
  for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else setGlobal(key, value); }
  delete process.env.NEXT_PUBLIC_SITE_URL;
}
if (!MUTATION) {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--neutral-moment-mutation-child"], { cwd: REPO, encoding: "utf8" });
  ok(child.status === 1 && child.stderr.includes("merely opening share choices must not become a rating moment"), "moving the real trigger onto a neutral opening must make the child process fail for the intended reason");
}

// And it must not be able to break the thing it rides on.
const around = home.slice(call - 90, call + 40);
ok(/try\s*\{[^}]*noteHighPointAndMaybeAsk\(\)/.test(around),
   "the call is wrapped in try — a rating prompt must never be able to fail a share");
ok(!/await\s+noteHighPointAndMaybeAsk/.test(home),
   "it is not awaited — the share path must not wait on a StoreKit round trip");

console.log(`test-app-rating: OK — ${pass} assertions (decide() CALLED across every gate: below-threshold silent but counting, at-threshold prompts, cooldown blocks without sliding forward and expires after ${COOLDOWN_DAYS}d, corrupt state fails closed; bridge names "${jsName}" agree across Swift and JS; AppRatingPlugin.swift resolved INTO the Sources phase alongside ${compiled.length - 1} other files; real completed/cancelled/failed/copy/composer/web branches executed; neutral-moment trigger mutation rejected; trigger remains wrapped and un-awaited)`);
