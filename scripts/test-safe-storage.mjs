#!/usr/bin/env node
// Sentry WAYFIND-W: "SecurityError: Failed to read the 'localStorage' property
// from 'Window'" on /florida-events/:slug (private mode / blocked storage / some
// in-app webviews). Reading the PROPERTY throws, so every `window.localStorage`
// must sit inside try/catch or go through lib/safeStorage.js.
//   1. EXECUTES the helper with throwing localStorage/sessionStorage getters.
//   2. AST-scans the event page closure plus the root layout closure (client
//      components included) for storage property reads outside a try block with
//      a catch, in the same function. Positive control: a fixture with a bare
//      read must be flagged; negative control: a guarded read must not be.
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];

// ---- 1. executable helper test
const throwing = () => { const e = new Error("Failed to read the 'localStorage' property from 'Window': Access is denied for this document."); e.name = "SecurityError"; throw e; };
Object.defineProperty(globalThis, "localStorage", { configurable: true, get: throwing });
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get: throwing });
let threwRaw = false; try { void globalThis.localStorage; } catch { threwRaw = true; }
if (!threwRaw) fails.push("test setup: throwing getter did not throw");
const h = await import("../lib/safeStorage.js");
if (h.safeLocalStorage() !== null) fails.push("safeLocalStorage() must be null when the getter throws");
if (h.safeSessionStorage() !== null) fails.push("safeSessionStorage() must be null when the getter throws");
if (h.safeGet("k") !== null) fails.push("safeGet must return null");
if (h.safeGet("k", h.safeSessionStorage()) !== null) fails.push("safeGet(session) must return null");
try { if (h.safeSet("k", "v") !== false) fails.push("safeSet must return false"); } catch { fails.push("safeSet threw"); }
try { if (h.safeRemove("k") !== false) fails.push("safeRemove must return false"); } catch { fails.push("safeRemove threw"); }
// working store still works (control)
const mem = new Map();
const fake = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => fake });
if (h.safeLocalStorage() !== fake) fails.push("control: working localStorage must be returned");
h.safeSet("a", "1"); if (h.safeGet("a") !== "1") fails.push("control: set/get roundtrip");
h.safeRemove("a"); if (h.safeGet("a") !== null) fails.push("control: remove");
delete globalThis.localStorage; delete globalThis.sessionStorage;

// ---- 2. static scan
const NAMES = new Set(["localStorage", "sessionStorage"]);
function unguardedReads(fileName, src) {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const out = [];
  const visit = (n) => {
    if (ts.isIdentifier(n) && NAMES.has(n.text)) {
      const p = n.parent;
      const isDeclKey = (ts.isPropertyAssignment(p) && p.name === n) || ts.isImportSpecifier(p) || (ts.isBindingElement(p) && p.propertyName === n);
      if (!isDeclKey) {
        let a = n.parent, guarded = false;
        while (a && !ts.isFunctionLike(a)) {
          if (ts.isTryStatement(a) && a.catchClause) {
            let c = n; while (c && c !== a.tryBlock && c !== a) c = c.parent;
            if (c === a.tryBlock) { guarded = true; break; }
          }
          a = a.parent;
        }
        if (!guarded) out.push(sf.getLineAndCharacterOfPosition(n.getStart()).line + 1);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
// controls
if (unguardedReads("x.js", "export const f = () => window.localStorage.getItem('a');").length !== 1) fails.push("positive control: bare window.localStorage read not flagged");
if (unguardedReads("x.js", "export function f(){ return typeof sessionStorage !== 'undefined'; }").length !== 1) fails.push("positive control: bare typeof sessionStorage not flagged");
if (unguardedReads("x.js", "export function f(){ try { return window.localStorage.getItem('a'); } catch (e) { return null; } }").length !== 0) fails.push("negative control: guarded read flagged");

const entries = ["app/florida-events/[slug]/page.js", "app/layout.js"];
const imp = /(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g;
const seen = new Set(); const queue = [...entries];
while (queue.length) {
  const f = queue.pop(); if (seen.has(f)) continue; seen.add(f);
  let s; try { s = readFileSync(path.join(root, f), "utf8"); } catch { continue; }
  for (const m of s.matchAll(imp)) {
    const p = path.normalize(path.join(path.dirname(f), m[1]));
    for (const c of [p, p + ".js", p + "/index.js"]) { const abs = path.join(root, c); if (existsSync(abs) && statSync(abs).isFile()) { queue.push(c); break; } }
  }
}
if (seen.size < 100) fails.push(`closure suspiciously small (${seen.size} files); import walk broke`);
for (const f of ["app/components/PostHogProvider.js", "app/components/RemindMe.js", "app/components/ShareButton.js", "app/components/EventDetailShell.js", "app/florida-events/[slug]/SaveEventButton.js"]) {
  if (!seen.has(f)) fails.push(`closure must include ${f}`);
}
for (const f of [...seen].sort()) {
  if (f === "lib/safeStorage.js") continue;
  let s; try { s = readFileSync(path.join(root, f), "utf8"); } catch { continue; }
  if (!/localStorage|sessionStorage/.test(s)) continue;
  for (const line of unguardedReads(f, s)) fails.push(`${f}:${line} reads localStorage/sessionStorage outside try/catch (use lib/safeStorage.js)`);
}
const ph = readFileSync(path.join(root, "app/components/PostHogProvider.js"), "utf8");
if (!/from\s+"\.\.\/\.\.\/lib\/safeStorage\.js"/.test(ph)) fails.push("PostHogProvider must import lib/safeStorage.js");

if (fails.length) { console.error("FAIL test-safe-storage:\n" + fails.join("\n")); process.exit(1); }
console.log(`ok test-safe-storage: helper returns null/false under a throwing getter; ${seen.size} files of the event page + layout closure have no unguarded storage reads`);
