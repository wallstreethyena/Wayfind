#!/usr/bin/env node
// Controls for scripts/lib/clientBufferScan.mjs (the browser no-Buffer gate in
// check-bundle). Offline: no build needed. Proves the scan flags an unguarded
// use and passes each guard form the app actually ships, and that the source
// files with browser paths still guard theirs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unguardedBufferUsesIn, BUFFER_POLYFILL_PROBE } from "./lib/clientBufferScan.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

// Positive: an unguarded use is flagged.
ok(unguardedBufferUsesIn("function f(a){return Buffer.from(a).toString(\"base64\")}").length === 1, "an unguarded Buffer.from is flagged");
ok(unguardedBufferUsesIn("let n=Buffer.byteLength(s)").length === 1, "the old eventReminder fallback shape is flagged");
// Negative: each guard form shipping today passes (minified shapes).
ok(unguardedBufferUsesIn("if(\"undefined\"!=typeof Buffer)return Buffer.from(e).toString(\"base64\");").length === 0, "typeof Buffer guard (storage-js, adClickCookie)");
ok(unguardedBufferUsesIn("if(\"function\"==typeof atob){let t=atob(e)}else n=Buffer.from(e,\"base64\").toString(\"utf8\")").length === 0, "typeof atob guard (appleMapsToken)");
// Not the global: properties and longer names are ignored.
ok(unguardedBufferUsesIn("e.arrayBuffer.byteLength;t.paintVertexBuffer;x.Buffer;ArrayBuffer.isView(a)").length === 0, "properties and longer identifiers are not the global");
// A guard far away does not count.
ok(unguardedBufferUsesIn("typeof Buffer;" + " ".repeat(500) + "Buffer.from(a)").length === 1, "a guard 500 characters away does not cover a use");

// The probe is a real polyfill string (check-bundle repeats this at build time).
ok(readFileSync(new URL("../node_modules/next/dist/compiled/buffer/index.js", import.meta.url), "utf8").includes(BUFFER_POLYFILL_PROBE), "the probe occurs in Next's compiled buffer polyfill");

// Source side: the client paths keep their guards, and eventReminder has no
// Buffer at all (comments stripped first).
const code = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
ok(!/\bBuffer\b/.test(code("lib/eventReminder.js")), "lib/eventReminder.js does not name Buffer");
ok(unguardedBufferUsesIn(code("lib/adClickCookie.js")).length === 0, "lib/adClickCookie.js guards Buffer");
ok(unguardedBufferUsesIn(code("lib/appleMapsToken.js")).length === 0, "lib/appleMapsToken.js guards Buffer");
// The config hook exists and targets the client ProvidePlugin only.
const cfg = code("next.config.js");
ok(/webpack\s*\(\s*config\s*,\s*\{\s*isServer\s*,\s*nextRuntime\s*\}\s*\)/.test(cfg) && /!isServer\s*&&\s*nextRuntime\s*!==\s*"edge"/.test(cfg) && /delete plugin\.definitions\.Buffer/.test(cfg), "next.config.js drops Buffer from the client ProvidePlugin only");

console.log(`test-client-buffer-scan: OK — ${checks} assertions (flags unguarded use, passes the shipped guard forms, probe matches Next's polyfill, sources guarded)`);
