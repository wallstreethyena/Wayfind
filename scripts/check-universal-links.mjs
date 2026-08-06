// scripts/check-universal-links.mjs
//
// Universal Links are a FOUR-hop chain, and every hop is silent when it breaks.
// A wrong team id, a missing entitlement, a redirect on the document — none of
// them error anywhere. The link just opens in Safari forever, exactly as it did
// before anyone tried to fix it.
//
//   1. the AASA document is served at the exact path, as JSON, without a redirect
//   2. its appID matches the real TEAMID.BUNDLEID of the built app
//   3. the app claims those domains via the associated-domains entitlement
//   4. the app can actually DO something with the incoming link
//
// Hop 4 is the one static analysis usually skips, and this repo has been burned
// by exactly that: "an entry point exists" is not "the surface can be opened"
// (CLAUDE.md — reachability is transitive; one hop is not proof). So the
// receiving chain is asserted too, all the way to the JS listener.
//
// ── THIS GUARD CALLS THE ROUTE HANDLER ────────────────────────────────────
// A regex over route.js would pass on a handler that returns the right-looking
// object with the wrong Content-Type, or a 404. GET() is invoked and the real
// Response is inspected — status, headers, parsed body. CLAUDE.md: assert on
// the call, not the string.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = (m) => { console.error("check-universal-links: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(REPO, p), "utf8");
const AASA_PATH = "/.well-known/apple-app-site-association";

// ── 1. THE DOCUMENT, BY CALLING THE HANDLER ──────────────────────────────
const route = await import("../app/api/aasa/route.js");
ok(typeof route.GET === "function", "app/api/aasa/route.js exports a GET handler");

const res = await route.GET();
ok(res && typeof res.status === "number", "GET() returns a real Response");
ok(res.status === 200, `the document is served 200 (got ${res.status}) — Apple treats anything else as no association`);

const ctype = res.headers.get("content-type") || "";
ok(/^application\/json/.test(ctype),
   `Content-Type is application/json (got "${ctype}"). This is THE reason the document is a route handler: an extensionless file in public/ is served as application/octet-stream and Apple rejects it.`);

const body = JSON.parse(await res.text());
ok(body && body.applinks && Array.isArray(body.applinks.details) && body.applinks.details.length >= 1,
   "the body parses as JSON and carries applinks.details");

const detail = body.applinks.details[0];
ok(Array.isArray(detail.appIDs) && detail.appIDs.length >= 1, `applinks.details[0].appIDs is a non-empty array (got ${JSON.stringify(detail.appIDs)})`);

// ── 2. THE APP ID MATCHES THE APP THAT WILL ACTUALLY BE BUILT ────────────
// Read out of the pbxproj rather than trusted, because a bundle-id change is
// the kind of edit that happens for unrelated reasons and breaks this silently.
const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
const teams = [...new Set([...pbx.matchAll(/DEVELOPMENT_TEAM = ([A-Z0-9]+);/g)].map((m) => m[1]))];
const bundles = [...new Set([...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1].trim().replace(/^"|"$/g, "")))];
ok(teams.length === 1, `control: the project declares exactly one development team (got ${JSON.stringify(teams)}) — more than one and "the" app id is ambiguous`);
ok(bundles.length === 1, `control: the project declares exactly one bundle identifier (got ${JSON.stringify(bundles)})`);

const expected = `${teams[0]}.${bundles[0]}`;
ok(detail.appIDs.includes(expected),
   `the AASA appID is ${expected} — TEAMID.BUNDLEID read from the pbxproj. Declared: ${JSON.stringify(detail.appIDs)}. A mismatch here throws no error anywhere; the link simply opens in Safari forever.`);
ok(route.APP_ID === expected, `the route's exported APP_ID constant agrees with the pbxproj (${route.APP_ID} vs ${expected})`);

// ── 3. COMPONENTS: EXCLUSIONS MUST PRECEDE THE CATCH-ALL ─────────────────
// First match wins. A catch-all placed first makes every exclusion below it
// dead config that reads as though it works.
const comps = detail.components || [];
ok(comps.length >= 2, `components are declared (got ${comps.length})`);
const catchAllAt = comps.findIndex((c) => c["/"] === "/*" && !c.exclude);
ok(catchAllAt > -1, "a catch-all component opens ordinary Wayfind pages in the app");
const excludes = comps.map((c, i) => ({ i, c })).filter(({ c }) => c.exclude);
ok(excludes.length >= 1, `at least one exclusion is declared (got ${excludes.length})`);
for (const { i, c } of excludes) {
  ok(i < catchAllAt, `the exclusion "${c["/"]}" sits BEFORE the /* catch-all (index ${i} vs ${catchAllAt}) — first match wins, so an exclusion after the catch-all never fires`);
}
const excluded = excludes.map(({ c }) => c["/"]);
ok(excluded.includes("/api/*"),
   `/api/* is excluded (got ${JSON.stringify(excluded)}) — /api/commerce/go and /api/eats/go are 302s to partner domains, and a partner checkout belongs in Safari with its own cookie jar, not in our WebView`);
ok(excluded.includes("/.well-known/*"), "/.well-known/* is excluded — the app should not be asked to open the document that decides what the app opens");

// ── 4. IT IS A REWRITE, NOT A REDIRECT, ON THE EXACT PATH ────────────────
// Apple does not follow redirects for this document.
const require_ = createRequire(import.meta.url);
const nextConfig = require_(path.join(REPO, "next.config.js"));
ok(typeof nextConfig.rewrites === "function", "next.config.js defines rewrites()");
const rewrites = await nextConfig.rewrites();
const list = Array.isArray(rewrites) ? rewrites : [...(rewrites.beforeFiles || []), ...(rewrites.afterFiles || []), ...(rewrites.fallback || [])];
const aasaRewrite = list.find((r) => r.source === AASA_PATH);
ok(!!aasaRewrite, `a rewrite exists for exactly "${AASA_PATH}" (sources: ${list.map((r) => r.source).join(", ")}). The path must be exact — no file extension, no trailing segment.`);
ok(aasaRewrite.destination === "/api/aasa", `it rewrites to the route handler (got ${aasaRewrite.destination})`);
ok(!aasaRewrite.permanent && aasaRewrite.statusCode === undefined, "it is a rewrite, not a redirect — Apple does not follow redirects for this document");

// And no REDIRECT may claim the path. A redirect here is the classic silent
// failure: the file is served, curl looks fine to a human following the 301,
// and Apple sees a 301 and gives up.
const redirects = typeof nextConfig.redirects === "function" ? await nextConfig.redirects() : [];
for (const r of redirects) {
  const unconditional = !r.has && !r.missing;
  ok(!(unconditional && new RegExp("^" + String(r.source).replace(/:[^/]+\*?/g, ".*") + "$").test(AASA_PATH)),
     `no unconditional redirect claims ${AASA_PATH} (offender: ${r.source} -> ${r.destination})`);
}
ok(redirects.length >= 1, `control: redirects() returned a real list (got ${redirects.length}) — an empty list would make the loop above vacuous`);

// ── 5. MIDDLEWARE MUST NOT GUARD IT ──────────────────────────────────────
// middleware.js same-origin-blocks the metered API proxies. Apple's fetch
// carries no Origin header, so if /api/aasa were ever added to that matcher the
// document would 403 for Apple while working perfectly in a browser.
const mw = read("middleware.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const matcherBlock = (mw.match(/matcher:\s*\[([\s\S]*?)\]/) || [])[1] || "";
ok(matcherBlock.length > 50, `control: the middleware matcher list was found and is non-trivial (${matcherBlock.length} chars) — an empty read would make the next assertion vacuous`);
ok(!/["']\/api\/aasa["']/.test(matcherBlock) && !/["']\/\.well-known/.test(matcherBlock),
   "neither /api/aasa nor /.well-known is in the middleware matcher — those paths same-origin-block, and Apple's fetch sends no Origin header, so it would 403 for Apple while looking fine in a browser");

// ── 6. THE ENTITLEMENT CLAIMS THE SAME DOMAINS ───────────────────────────
const ent = read("ios/App/App/App.entitlements");
ok(/com\.apple\.developer\.associated-domains/.test(ent), "the associated-domains entitlement exists — without it iOS never fetches the document at all");
const claimed = [...ent.matchAll(/<string>applinks:([^<]+)<\/string>/g)].map((m) => m[1].trim());
ok(claimed.length >= 1, `at least one applinks domain is claimed (got ${JSON.stringify(claimed)})`);
const served = route.APPLINK_DOMAINS;
ok(Array.isArray(served) && served.length >= 1, "the route exports the domains it is written for");
for (const d of served) ok(claimed.includes(d), `the entitlement claims ${d}, which is the host serving this document`);
for (const d of claimed) {
  ok(served.includes(d), `the entitlement claims no domain the document was not written for (${d} is unexpected). A claimed domain whose AASA 301s fails silently while LOOKING configured — which is why the apex is deliberately not claimed.`);
}
// The canonical host must be among them, or shared links do not open the app.
const site = read("lib/site.js");
const canonical = (site.match(/https:\/\/([a-z0-9.-]*gowayfind\.com)/i) || [])[1];
ok(!!canonical, "control: the canonical host was read out of lib/site.js");
ok(claimed.includes(canonical), `the canonical share host (${canonical}, from lib/site.js SITE_URL) is claimed — it is the host Wayfind's own share links use, so if it were missing no shared link would ever open the app`);

// ── 7. HOP 4 — THE APP CAN ACTUALLY ACT ON THE LINK ──────────────────────
// Entitlement + document only get iOS to hand the URL to the app. Something has
// to receive it. Both halves already existed before this change; asserted here
// so a later cleanup cannot quietly remove them and leave a chain that opens
// the app onto the home screen and loses the destination.
const scene = read("ios/App/App/SceneDelegate.swift");
ok(/func scene\([^)]*continue userActivity[^)]*\)/.test(scene),
   "SceneDelegate implements scene(_:continue:) — the callback iOS uses to hand over a universal link");
ok(/SceneDelegateProxy\.shared\.scene\(\s*scene,\s*continue:/.test(scene),
   "…and forwards it to Capacitor's SceneDelegateProxy, which is what turns it into an appUrlOpen event");
const nativeJs = read("lib/native.js");
ok(/addListener\(\s*"appUrlOpen"/.test(nativeJs), "lib/native.js listens for appUrlOpen");
ok(/onDeepLink\(\s*\(?url\.pathname/.test(nativeJs),
   "…and routes the incoming pathname to onDeepLink, so the app NAVIGATES to the shared page rather than merely opening");

console.log(`check-universal-links: OK — ${pass} assertions (GET() CALLED: 200, application/json, appID ${expected} cross-checked against the pbxproj; ${excludes.length} exclusion(s) proven to precede the catch-all; served by rewrite not redirect on the exact path, unguarded by middleware; entitlement claims exactly ${claimed.join(", ")} incl. the canonical host; receiving chain asserted through SceneDelegate -> Capacitor -> appUrlOpen -> onDeepLink)`);
