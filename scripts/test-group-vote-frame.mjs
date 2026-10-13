// Group Vote frame + sign-in resume. Calls the real validator, renders the real
// GroupFrame / GroupPlanClient through jsxLoad; no browser or network.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { validateAuthReturn, signInUrlWithReturn, rememberAuthReturn, consumeAuthReturn, AUTH_RETURN_KEY } from "../lib/authReturn.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// Open-redirect controls
const good = ["/group-plans", "/group-plans/", "/group-plans/abc", "/group-plans/new?place=ChIJ123", "/group-plans?x=1", "/group-plans/new?place=a%20b"];
for (const g of good) ok(validateAuthReturn(g) === g, "accepts " + g);
const bad = ["//evil.com", "//evil.com/group-plans", "https://evil.com", "https://evil.com/group-plans", "/\\evil.com", "/group-plans\\..\\evil", "/group-plans/\\evil",
  "/%2Fevil.com", "%2F%2Fevil.com", "/group-plans%2F%2Fevil.com", "/group-plans/%2f/evil.com", "/group-plans/%5Cevil", "/group-plans//evil.com", "/group-plansX", "/group-plans-evil", "/favorites", "/", "",
  "javascript:alert(1)", "/group-plans/\nSet-Cookie:x", "/group-plans/%0d%0a", "/group-plans#evil", "/group-plans/..%2f..%2fevil", "/group-plans/%252f", " /group-plans", "/group-plans/a b\u0000", null, undefined, 5, {}, "/group-plans/" + "a".repeat(600)];
for (const b of bad) ok(validateAuthReturn(b) === null, "rejects " + JSON.stringify(b));
ok(validateAuthReturn("/group-plans/../evil") === null, "dot-dot cannot normalise outside /group-plans");

// storage helpers
const store = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), m }; };
let st = store();
ok(rememberAuthReturn(st, "//evil.com") === null && !st.m.has(AUTH_RETURN_KEY), "evil path never stored");
ok(rememberAuthReturn(st, "/group-plans/new?place=p1") === "/group-plans/new?place=p1" && st.m.get(AUTH_RETURN_KEY) === "/group-plans/new?place=p1", "good path stored under wf_auth_return");
ok(consumeAuthReturn(st) === "/group-plans/new?place=p1" && !st.m.has(AUTH_RETURN_KEY), "consume returns and removes");
ok(consumeAuthReturn(st) === null, "second consume is empty");
st.setItem(AUTH_RETURN_KEY, "https://evil.com"); ok(consumeAuthReturn(st) === null && !st.m.has(AUTH_RETURN_KEY), "tampered stored value rejected and cleared");
ok(consumeAuthReturn(null) === null, "no storage is safe");
ok(signInUrlWithReturn("/group-plans/new?place=p1") === "/favorites?return=" + encodeURIComponent("/group-plans/new?place=p1"), "sign-in url encodes return");
ok(signInUrlWithReturn("//evil.com") === "/favorites", "bad return falls back to plain /favorites");

// Frame
const UI = await loadComponent(path.join(ROOT, "app/group-plans/GroupPlanClient.js"), ROOT, {});
const html = renderToStaticMarkup(React.createElement(UI.GroupFrame, { children: "x" }));
ok(/<a[^>]*class="gp-mark"[^>]*href="\/"|<a[^>]*href="\/"[^>]*class="gp-mark"/.test(html), "logo links to /");
ok(/<img[^>]*alt="Wayfind"/.test(html) && /<img[^>]*src="\/brand\//.test(html), "logo img alt Wayfind from /brand");
ok(!/>wayfind</.test(html), "old text wordmark gone");
const css = UI.GROUP_PLAN_CSS;
ok(/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css), "reduced-motion block");
ok(/var\(--wf-sans\)/.test(css) && !/--font-body/.test(css), "uses --wf-sans");
ok(/prefers-color-scheme:\s*light/.test(css), "light override present");
const secs = [...css.matchAll(/(?:transition|animation)(?:-duration)?:[^;}]*/g)].flatMap(m => [...m[0].matchAll(/(\d*\.?\d+)(ms|s)\b/g)].map(d => (d[2] === "ms" ? +d[1] / 1000 : +d[1])));
ok(secs.length > 0 && secs.every(v => v <= 0.6), "durations <= .6s: " + secs.join(","));
ok(!/overflow-x:\s*scroll/.test(css), "no forced horizontal scroll");

// signInBlock link (real render, signed-out, mode new)
const sign = renderToStaticMarkup(UI.signInBlock("/group-plans/new?place=p1"));
const a = sign.match(/<a [^>]*>Sign in to Wayfind<\/a>/)?.[0] || "";
ok(a.length > 0, "sign-in link rendered");
ok(!/target=/.test(a), "no target (same tab)");
ok(a.includes('href="/favorites?return=' + encodeURIComponent("/group-plans/new?place=p1") + '"'), "href carries encoded return path");
console.log(`test-group-vote-frame: ${n} assertions passed`);
