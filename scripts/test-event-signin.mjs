#!/usr/bin/env node
// scripts/test-event-signin.mjs - event pages carry a working "Sign in"
// (premium polish pass, 2026-11-27).
//
// Both event routes are server pages with no member context and had no sign
// in door. EventSignIn (compiled and rendered here) puts the homepage's pill
// in the page header, linking to /favorites?return=<event path>; the app shell
// signs the reader in and lib/authReturn.js (executed here) sends them back.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { validateAuthReturn, signInUrlWithReturn } from "../lib/authReturn.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
let pass = 0; const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

// ---- return paths: event pages pass, everything else stays rejected -------
const good = ["/florida-events/busch-gardens-christmas-town-2026", "/florida-events/a", "/events/tampa/taylor-swift--G5vYZ9%3A1", "/events/sarasota/jazz-night--12345"];
for (const g of good) ok(validateAuthReturn(g) === g, "accepts " + g);
const bad = ["/florida-events/", "/florida-events/../evil", "/florida-events/x?next=//evil.com", "/florida-events/x#y", "/florida-events/X", "/florida-events/a/b",
  "/florida-events/%2f%2fevil.com", "//evil.com/florida-events/x", "https://evil.com/florida-events/x", "/events/tampa/..", "/events/tampa/../x", "/events/tampa/a%2Fb",
  "/events/tampa/a%5Cb", "/events/tampa/a%252F", "/events/tampa/a%0d", "/events//x", "/events/tampa/", "/events/tampa/a//b", "/events/tampa/a\\b", "/events/tampa/x?y=1", "/eventsX/a/b"];
for (const b of bad) ok(validateAuthReturn(b) === null, "rejects " + JSON.stringify(b));
ok(validateAuthReturn("/group-plans/new") === "/group-plans/new" && validateAuthReturn("/trips/3f2b6a1e-1111-4222-8333-944455556666") !== null, "existing Group Vote and Live Trip returns still pass");
ok(signInUrlWithReturn("/florida-events/busch-gardens-christmas-town-2026") === "/favorites?return=" + encodeURIComponent("/florida-events/busch-gardens-christmas-town-2026"), "the sign in link carries the event path");
ok(signInUrlWithReturn("/florida-events/../x") === "/favorites", "a bad path still yields a working sign in link, without a return");

// ---- the component, executed ----------------------------------------------
const mod = await loadComponent(path.join(REPO, "app/components/EventSignIn.js"), REPO);
const html = renderToStaticMarkup(createElement(mod.default, { returnPath: "/florida-events/control-event-2026" }));
ok(/class="wf-signin-button"/.test(html), "the signed-out pill carries .wf-signin-button (EventLogVisit's sign in door)");
ok(html.includes('href="/favorites?return=%2Fflorida-events%2Fcontrol-event-2026"'), "the pill links to /favorites with the event as the return path");
ok(/>Sign in<\/a>$/.test(html) && html.includes('aria-label="Sign in"') && html.includes("<svg"), "the pill reads Sign in with the person icon, like the homepage header");
const badHtml = renderToStaticMarkup(createElement(mod.default, { returnPath: "//evil.com" }));
ok(badHtml.includes('href="/favorites"'), "an unusable return path still renders a working Sign in");
const src = strip(read("app/components/EventSignIn.js"));
ok(/^"use client";/.test(read("app/components/EventSignIn.js")) && !/from "\.\/kit"/.test(src), "EventSignIn is a client island that does not pull kit.js into event pages");
ok(/onAuthStateChange/.test(src) && /href="\/favorites"[^>]*>[\s\S]*Your saves/.test(src), "signed in, the pill becomes Your saves and follows auth changes");

// ---- both event routes mount it in the header ------------------------------
const curated = strip(read("app/florida-events/[slug]/page.js"));
const brand = curated.slice(curated.indexOf('className="wf-event-brand"'), curated.indexOf("<EventSectionNav"));
ok(brand.length > 50 && /<EventSignIn returnPath=\{"\/florida-events\/" \+ e\.slug\} \/>/.test(brand), "/florida-events/[slug] renders EventSignIn in its brand header");
// alignment: a pill-level bottom margin on the back links pushed the Sign in
// pill off center in the wrapped row; the space must live on the row itself.
const backStyle = curated.slice(curated.indexOf("  back: {"), curated.indexOf("},", curated.indexOf("  back: {")));
const rowStyle = (curated.match(/backRow: \{[^}]*\}/) || [""])[0];
ok(backStyle.length > 40 && !/margin/i.test(backStyle) && /marginBottom: 18/.test(rowStyle), "the back pills carry no margin of their own, so Sign in lines up with them (space sits on backRow)");
const provider = strip(read("app/events/[city]/[slug]/page.js"));
const nav = provider.slice(provider.indexOf('<a href="/" aria-label="Wayfind home"'), provider.indexOf("</nav>"));
ok(nav.length > 50 && /<EventSignIn returnPath=\{`\/events\/\$\{encodeURIComponent\(params\.city\)\}\/\$\{encodeURIComponent\(params\.slug\)\}`\} \/>/.test(nav), "/events/[city]/[slug] renders EventSignIn in its header nav");

if (fail.length) { console.error("test-event-signin: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`test-event-signin: OK - ${pass} assertions (${good.length} good and ${bad.length} bad return paths executed; component rendered)`);
