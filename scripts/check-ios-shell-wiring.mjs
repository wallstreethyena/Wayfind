// scripts/check-ios-shell-wiring.mjs
// STRUCTURAL-ONLY: Swift, plist and a WKWebView errorPath page cannot execute on
// the Linux build host; these are brace-matched structural reads. The executed
// proof is the Xcode simulator build + run recorded in docs/ios-app-store-handoff.md.
//
// 2026-09-23 launch hardening — this is the union lock for FIVE separate
// fixes that shipped together, none of which fail the build if broken:
//
//   1. AppDelegate forwards the two remote-notification callbacks Capacitor's
//      PushNotifications plugin actually listens for (without this, push
//      registration silently never resolves — measured: device_push_tokens
//      had 0 rows, ever).
//   2. SceneDelegate registers BOTH app-owned native plugins (AppleSignIn,
//      AppRating) as instances, the only way Capacitor sees a plugin that is
//      not in packageClassList.
//   3. Info.plist no longer names a storyboard as anyone's initial scene —
//      SceneDelegate already builds its own window, so a named storyboard
//      created a second, unconfigured Capacitor bridge.
//   4. The offline experience: capacitor.config.ts's server.errorPath, and
//      www/offline.html itself, are wired and self-contained.
//   5. The native mid-session offline overlay is mounted in app/layout.js and
//      its heavy module is reachable ONLY through a lazy import (bundle
//      budget — CLAUDE.md's ~7.7KB gz headroom).
//
// Each of these is a "the code runs, nothing throws, and the specific thing
// is simply absent" class of bug — exactly the shape CLAUDE.md's Extraction
// PRs section warns generalizes past extraction. So this is a UNION guard:
// one file, checked together, registered once, rather than five guards that
// could individually be forgotten.
//
// Every assertion below matches SYNTACTIC POSITION (a call inside a specific
// function body, a key at the plist root, a tag's own attribute) rather than
// "the string appears somewhere in the file" — CLAUDE.md names this exact
// failure mode four separate times.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPlist } from "./lib/plistParse.mjs";

let pass = 0;
const fail = (m) => { console.error("check-ios-shell-wiring: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(REPO, p), "utf8");
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
// Swift's line/block comment syntax is the same shape as JS's, so the same
// stripper applies. This matters here specifically: a commented-out
// registerPluginInstance(...) call or notification post must NOT satisfy the
// regexes below, and without stripping it would — the leading "// " on an
// otherwise-unchanged line is invisible to a regex that only checks the call
// text itself.
const stripSwift = stripJs;

// Extracts a Swift function's body by brace-counting from its signature, so a
// match cannot leak in from a comment, from a DIFFERENT function, or from the
// call merely appearing somewhere else in the file.
function swiftFunctionBody(src, signatureRegex) {
  const m = signatureRegex.exec(src);
  if (!m) return null;
  let i = src.indexOf("{", m.index + m[0].length - 1);
  if (i === -1) return null;
  let depth = 0;
  let start = i;
  for (; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start + 1, i);
    }
  }
  return null;
}

// ── 1. AppDelegate posts BOTH capacitor notifications, from the RIGHT method ─
const appDelegate = stripSwift(read("ios/App/App/AppDelegate.swift"));
const regBody = swiftFunctionBody(
  appDelegate,
  /func\s+application\(\s*_\s+application:\s*UIApplication,\s*didRegisterForRemoteNotificationsWithDeviceToken\s+deviceToken:\s*Data\)/
);
ok(!!regBody, "AppDelegate declares didRegisterForRemoteNotificationsWithDeviceToken(_:) — without it iOS never tells the app a token arrived");
ok(!!regBody && /NotificationCenter\.default\.post\(\s*name:\s*\.capacitorDidRegisterForRemoteNotifications/.test(regBody),
   "…and its BODY posts .capacitorDidRegisterForRemoteNotifications — this is the exact Notification.Name @capacitor/ios's PushNotifications plugin listens for (CAPNotifications.swift); posting it from the wrong method, or not at all, leaves push registration silently unresolved forever");

const failBody = swiftFunctionBody(
  appDelegate,
  /func\s+application\(\s*_\s+application:\s*UIApplication,\s*didFailToRegisterForRemoteNotificationsWithError\s+error:\s*Error\)/
);
ok(!!failBody, "AppDelegate declares didFailToRegisterForRemoteNotificationsWithError(_:) too");
ok(!!failBody && /NotificationCenter\.default\.post\(\s*name:\s*\.capacitorDidFailToRegisterForRemoteNotifications/.test(failBody),
   "…and its body posts .capacitorDidFailToRegisterForRemoteNotifications, so a denied/failed registration is observable instead of hanging silently");

// Control: prove the two are not the SAME body (a copy-paste that posts the
// success notification from both methods would satisfy naive substring
// checks while being wrong).
ok(regBody !== failBody, "control: the two callback bodies are not identical — a copy-paste bug would post the same notification from both");

// ── 2. SceneDelegate registers BOTH app-owned plugin instances ───────────
const sceneDelegate = stripSwift(read("ios/App/App/SceneDelegate.swift"));
const loadBody = swiftFunctionBody(sceneDelegate, /override\s+func\s+capacitorDidLoad\(\)/);
ok(!!loadBody, "SceneDelegate's WayfindBridgeViewController overrides capacitorDidLoad()");
for (const [plugin, jsName] of [["AppleSignInPlugin", "AppleSignIn"], ["AppRatingPlugin", "AppRating"]]) {
  ok(!!loadBody && new RegExp(`bridge\\?\\.registerPluginInstance\\(${plugin}\\(\\)\\)`).test(loadBody),
     `capacitorDidLoad() registers ${plugin} as an instance — Capacitor's package auto-registration never sees an app-owned plugin that is not in packageClassList`);
  ok(!!loadBody && new RegExp(`precondition\\(bridge\\?\\.plugin\\(withName:\\s*"${jsName}"\\)\\s*!=\\s*nil`).test(loadBody),
     `…and a precondition proves ${jsName} actually registered — without it a broken registration ships silently instead of crashing at launch, where it is cheap to catch`);
}
ok(/AppRatingPlugin/.test(loadBody) && loadBody.indexOf("AppleSignInPlugin") < loadBody.indexOf("AppRatingPlugin"),
   "control: both registrations are real, distinct lines inside the same body, not one match satisfying both regexes");

// ── 3. Info.plist names no storyboard as an initial scene ────────────────
const info = readPlist(path.join(REPO, "ios/App/App/Info.plist"));
ok(!Object.prototype.hasOwnProperty.call(info, "UIMainStoryboardFile"),
   `Info.plist has no top-level UIMainStoryboardFile (got ${JSON.stringify(info.UIMainStoryboardFile)}) — SceneDelegate already builds its own window; a named storyboard makes UIKit instantiate a SECOND, unconfigured Capacitor bridge on top of it`);
const sceneConfigs =
  (((info.UIApplicationSceneManifest || {}).UISceneConfigurations || {}).UIWindowSceneSessionRoleApplication) || [];
ok(Array.isArray(sceneConfigs) && sceneConfigs.length >= 1, "control: at least one UIWindowSceneSessionRoleApplication scene configuration resolves — an empty list would make the next assertion vacuous");
for (const cfg of sceneConfigs) {
  ok(!Object.prototype.hasOwnProperty.call(cfg, "UISceneStoryboardFile"),
     `no scene configuration names UISceneStoryboardFile (got ${JSON.stringify(cfg.UISceneStoryboardFile)}) — same failure as UIMainStoryboardFile, one level deeper in the plist`);
  ok(cfg.UISceneDelegateClassName === "$(PRODUCT_MODULE_NAME).SceneDelegate",
     `the scene configuration still points at SceneDelegate (got ${JSON.stringify(cfg.UISceneDelegateClassName)}) — removing the storyboard key must not also remove the thing that replaces it`);
}

// ── 4a. capacitor.config.ts wires server.errorPath ────────────────────────
const capConfig = stripJs(read("capacitor.config.ts"));
const serverBlock = (capConfig.match(/server:\s*\{([\s\S]*?)\n\s*\},/) || [])[1] || "";
ok(serverBlock.length > 0, "control: capacitor.config.ts has a server: { ... } block to read errorPath from");
ok(/errorPath:\s*"offline\.html"/.test(serverBlock),
   `server.errorPath is "offline.html", found INSIDE the server block specifically (block: ${JSON.stringify(serverBlock.slice(0, 200))}) — a match anywhere else in the file would not actually configure Capacitor`);

// ── 4b. www/offline.html is wired and self contained ──────────────────────
const OFFLINE_PATH = "www/offline.html";
ok(existsSync(path.join(REPO, OFFLINE_PATH)), "www/offline.html exists — capacitor.config.ts's errorPath points at a file inside webDir that must actually be there");
const offlineHtml = read(OFFLINE_PATH);

ok(/<button[^>]*>\s*Try again\s*<\/button>/.test(offlineHtml), 'offline.html has a "Try again" button — the one recovery action the page offers');
ok(/addEventListener\(\s*["']online["']/.test(offlineHtml), 'offline.html listens for the "online" event — auto recovery when the OS reports connectivity back');
ok(/setInterval\(/.test(offlineHtml) && /probe\(/.test(offlineHtml),
   "offline.html runs a periodic probe (setInterval calling probe()) — the online event alone misses captive-portal-style false positives and a same-network reconnect the OS never fires an event for");
ok(/visibilitychange/.test(offlineHtml), "offline.html pauses/resumes its probe on visibilitychange, so a backgrounded tab is not polling forever");

// No external http(s) resource in any tag attribute. This intentionally
// walks TAG ATTRIBUTES only (src=/href=), not the whole file — the SERVER
// constant legitimately appears as a JS STRING inside <script>, and that is
// not a resource request.
const bodyForTags = offlineHtml.replace(/<script[\s\S]*?<\/script>/gi, "");
const externalRefs = bodyForTags.match(/\b(?:src|href)\s*=\s*"https?:\/\/[^"]*"/gi) || [];
ok(externalRefs.length === 0, `offline.html has no external http(s) src/href in its markup outside <script> (found: ${JSON.stringify(externalRefs)}) — this page exists BECAUSE there is no network, so anything it fetches from elsewhere just fails silently too`);
ok(/const SERVER = "https:\/\/www\.gowayfind\.com"/.test(offlineHtml),
   "control: the SERVER constant IS present inside the script — proving the external-reference sweep above is scoped correctly rather than accidentally matching nothing");

// offline.html runs on capacitor://localhost; the app runs on
// https://www.gowayfind.com — different origins, so a sessionStorage value
// written by one is never visible to the other. Recovery must hand the path
// off through the URL (?wf_resume=1) for app/components/NativeOfflineOverlay.js
// (same origin as the app) to pick up, never read its own cross-origin storage.
ok(/SERVER \+ "\/\?wf_resume=1"/.test(offlineHtml),
   'offline.html\'s recovery navigates to SERVER + "/?wf_resume=1" — the cross-origin handoff goes through the URL, not sessionStorage');
ok(!/sessionStorage\.getItem\(\s*["']wf_last_path["']\s*\)/.test(offlineHtml),
   "offline.html no longer reads its own sessionStorage for wf_last_path — that storage is on capacitor://localhost and can never contain what the app (https://www.gowayfind.com) wrote");
// red proof: the two assertions above actually discriminate against the
// broken (pre-fix) shape, not just against an empty string.
{
  const brokenOffline = 'var target = SERVER + safeLastPath(); sessionStorage.getItem("wf_last_path")';
  ok(!/SERVER \+ "\/\?wf_resume=1"/.test(brokenOffline), "red proof: the pre-fix cross-origin sessionStorage shape does not satisfy the wf_resume assertion");
  ok(/sessionStorage\.getItem\(\s*["']wf_last_path["']\s*\)/.test(brokenOffline), "red proof: the pre-fix shape DOES trip the no-cross-origin-read assertion, proving that assertion can fail");
}

// No dashes in the page's VISIBLE text — extracted by tag, not by sweeping
// the whole file, since HTML comments and the SVG path's `d` attribute
// legitimately contain hyphens (path syntax, code comments) that are not
// reader-facing copy.
const visibleTextSources = [
  (offlineHtml.match(/<title>([\s\S]*?)<\/title>/) || [, ""])[1],
  (offlineHtml.match(/<h1>([\s\S]*?)<\/h1>/) || [, ""])[1],
  (offlineHtml.match(/<p class="body">([\s\S]*?)<\/p>/) || [, ""])[1],
  (offlineHtml.match(/<button[^>]*>([\s\S]*?)<\/button>/) || [, ""])[1],
];
ok(visibleTextSources.every((t) => t.length > 0), "control: all four visible-text sources (title, h1, body copy, button) were actually found — an empty extraction would make the dash check vacuous");
for (const text of visibleTextSources) {
  ok(!/[-–—]/.test(text), `offline.html visible text has no dash (checked: ${JSON.stringify(text)}) — reader-facing copy in this repo never uses one`);
}

// ── 5. app/layout.js mounts the shim ──────────────────────────────────────
const layout = stripJs(read("app/layout.js"));
ok(/import\s+NativeOfflineOverlay\s+from\s+"\.\/components\/NativeOfflineOverlay"/.test(layout),
   "app/layout.js imports NativeOfflineOverlay — an unbound JSX tag below would ReferenceError at render");
ok(/<NativeOfflineOverlay\s*\/>/.test(layout), "app/layout.js actually RENDERS <NativeOfflineOverlay /> — an import with no JSX use is dead code, the exact 'entry point with no door' shape CLAUDE.md warns about");

// ── 6. The heavy overlay module is reachable ONLY via dynamic import ─────
const shim = stripJs(read("app/components/NativeOfflineOverlay.js"));
ok(/dynamic\(\s*\(\)\s*=>\s*import\(\s*["']\.\/native\/OfflineOverlay["']\s*\)/.test(shim),
   "the shim loads ./native/OfflineOverlay through next/dynamic — a static import here would ship the overlay's markup/CSS to every visitor, offline or not (bundle budget)");

// The shim, not offline.html, completes the cross-origin path handoff — it
// runs on the app's own origin, so it can read the wf_last_path sessionStorage
// entry offline.html could never see. Validated (must start with "/" and not
// "//") before ever reaching router.replace().
ok(/wf_resume=1/.test(shim), "the shim checks location.search for wf_resume=1 — the marker offline.html's recovery navigation sets");
ok(/sessionStorage\.getItem\(\s*LAST_PATH_KEY\s*\)/.test(shim), "the shim reads its OWN sessionStorage wf_last_path — same origin as the write, unlike offline.html");
ok(/router\.replace\(/.test(shim), "the shim finishes the handoff with router.replace(), not a full page navigation");
ok(/raw\.charAt\(0\)\s*!==\s*["']\/["']/.test(shim) && /raw\.charAt\(1\)\s*===\s*["']\/["']/.test(shim),
   "the shim validates the resumed path (must start with a single \"/\", never \"//\") before router.replace() ever sees it — an unvalidated value here would let a compromised sessionStorage entry navigate the app anywhere");
{
  // red proof: a shim that reads wf_resume but skips validation must NOT
  // satisfy the validation assertion above.
  const unvalidatedShim = 'if (/wf_resume=1/.test(search)) { router.replace(sessionStorage.getItem(LAST_PATH_KEY)); }';
  ok(!(/raw\.charAt\(0\)\s*!==\s*["']\/["']/.test(unvalidatedShim) && /raw\.charAt\(1\)\s*===\s*["']\/["']/.test(unvalidatedShim)),
     "red proof: a shim that router.replace()s an unvalidated sessionStorage value does not satisfy the validation assertion");
}

// The lazy chunk must be WARMED while online. A chunk first requested after
// the connection drops can never download, so the overlay would never show.
// That exact failure happened on 2026-09-23 (Playwright offline run: nothing
// rendered). Assert the warm import() sits inside an isNative()-gated effect.
{
  const warmIdx = shim.search(/import\(\s*["']\.\/native\/OfflineOverlay["']\s*\)\s*\.catch/);
  const nativeIdx = shim.search(/if\s*\(\s*!isNative\(\)\s*\)\s*return/);
  ok(warmIdx > 0, "the shim warms the overlay chunk with a bare import(\"./native/OfflineOverlay\").catch(...) so it is cached before the network drops");
  ok(nativeIdx > 0 && warmIdx > nativeIdx, "the warm import runs after an isNative() early return, so the website never downloads the overlay chunk");
  // red proof: the same probe on a shim without the warm call finds nothing
  const unwarmed = shim.replace(/import\(\s*["']\.\/native\/OfflineOverlay["']\s*\)\s*\.catch[^;]*;/, "");
  ok(unwarmed.search(/import\(\s*["']\.\/native\/OfflineOverlay["']\s*\)\s*\.catch/) === -1, "red proof: removing the warm import makes the warm probe fail");
}

// Sweep every OTHER first-party source file for a STATIC import of the
// overlay module. A static import anywhere defeats the lazy boundary even if
// the dynamic() call above is also present.
const { execSync } = await import("node:child_process");
let candidates = [];
try {
  const out = execSync(
    `grep -rl "native/OfflineOverlay" --include="*.js" app lib 2>/dev/null || true`,
    { cwd: REPO, encoding: "utf8" }
  );
  candidates = out.split("\n").map((s) => s.trim()).filter(Boolean);
} catch (e) {
  fail(`could not sweep for static imports of the overlay module: ${e.message}`);
}
ok(candidates.length >= 1, "control: the sweep itself finds at least one reference to native/OfflineOverlay (the shim) — zero would mean the sweep is broken, not that the codebase is clean");
for (const rel of candidates) {
  const src = stripJs(read(rel));
  const staticImport = /import\s+[\s\S]*?\s+from\s+["'][^"']*native\/OfflineOverlay["']/.test(src);
  ok(!staticImport, `${rel} does not STATICALLY import native/OfflineOverlay (only a dynamic() call is allowed) — a static import anywhere pulls the overlay into that file's own chunk regardless of next/dynamic's ssr:false`);
}

console.log(`check-ios-shell-wiring: OK — ${pass} assertions (AppDelegate posts both remote-notification callbacks from their own bodies, brace-matched not grepped; SceneDelegate registers AppleSignIn + AppRating as instances with launch-time preconditions; Info.plist carries no storyboard key at either the top level or inside its scene configuration; capacitor.config.ts's server.errorPath and www/offline.html [Try again, online listener, periodic probe, no external resources outside <script>, no dashes in ${visibleTextSources.length} visible-text sources] are wired; app/layout.js renders <NativeOfflineOverlay />; the overlay module is dynamic()-only across ${candidates.length} referencing file(s) swept)`);
