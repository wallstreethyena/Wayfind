#!/usr/bin/env node
// scripts/test-runway-reel.mjs — locks the Runway Dev place-reel path:
//   1. lib/runwayReel.buildReelRequest emits only bodies that match the
//      per-model image_to_video contract (docs.dev.runwayml.com/api.md) and
//      refuses anything else — asserted by CALLING it, not grepping it.
//   2. scripts/runway-place-reel.mjs never spends without --confirm: the dry
//      run and the no-secret --confirm run both exit with fetch poisoned, so
//      any network call would crash the child and fail this guard.
//   3. @runwayml/sdk (and the secret it reads) stays out of app/, lib/,
//      middleware.js and components — operator scripts only.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildReelRequest, isAcceptableImageUri, reelPrompt, reelSlug, REEL_MODELS, REEL_DEFAULTS } from "../lib/runwayReel.js";

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error(`  ✗ ${msg}`); } };
const throws = (fn, rx, msg) => {
  try { fn(); ok(false, `${msg} (did not throw)`); } catch (e) { ok(rx.test(e.message), `${msg} (threw "${e.message}")`); }
};

// ── 1. request builder ──────────────────────────────────────────────────────
const IMG = "https://example.com/photo.jpg";
const def = buildReelRequest({ imageUri: IMG, place: "Mai-Kai", city: "Fort Lauderdale" });
ok(def.model === "gen4.5" && def.ratio === "720:1280" && def.duration === 5, "defaults are gen4.5 / 720:1280 / 5s");
ok(Array.isArray(def.promptImage) && def.promptImage.length === 1 && def.promptImage[0].uri === IMG && def.promptImage[0].position === "first", "promptImage is [{uri, position:first}]");
ok(def.promptText.includes("Mai-Kai, Fort Lauderdale"), "prompt names the place");
ok(/Do not add people, objects, text/.test(def.promptText), "default prompt carries the honesty clause");
ok(!("seed" in def), "seed omitted unless given");
ok(Object.keys(def).sort().join() === "duration,model,promptImage,promptText,ratio", `no stray fields (${Object.keys(def).join()})`);
ok(buildReelRequest({ imageUri: IMG, seed: 0 }).seed === 0, "seed 0 is kept");
ok(buildReelRequest({ imageUri: IMG, model: "gen4_turbo", duration: 10, ratio: "960:960" }).model === "gen4_turbo", "gen4_turbo accepted");
for (const [m, spec] of Object.entries(REEL_MODELS)) {
  ok(spec.ratios.includes(REEL_DEFAULTS.ratio), `${m} supports the default ratio`);
  for (const r of spec.ratios) ok(buildReelRequest({ imageUri: IMG, model: m, ratio: r }).ratio === r, `${m} accepts ${r}`);
}
throws(() => buildReelRequest({ imageUri: IMG, model: "gen3a_turbo" }), /unknown model/, "retired model refused");
throws(() => buildReelRequest({ imageUri: IMG, ratio: "1080:1920" }), /ratio/, "ratio outside the model's set refused");
throws(() => buildReelRequest({ imageUri: IMG, duration: 11 }), /duration/, "duration 11 refused");
throws(() => buildReelRequest({ imageUri: IMG, duration: 1 }), /duration/, "duration 1 refused");
throws(() => buildReelRequest({ imageUri: IMG, duration: 4.5 }), /duration/, "fractional duration refused");
throws(() => buildReelRequest({ imageUri: IMG, promptText: "x".repeat(1001) }), /1000/, "1001-char prompt refused");
throws(() => buildReelRequest({ imageUri: IMG, seed: -1 }), /seed/, "negative seed refused");
throws(() => buildReelRequest({ imageUri: "http://example.com/a.jpg" }), /imageUri/, "plain http refused");
throws(() => buildReelRequest({}), /imageUri/, "missing image refused");
ok(isAcceptableImageUri("runway://abc") && isAcceptableImageUri("data:image/png;base64,AAAA"), "runway:// and data:image accepted");
ok(!isAcceptableImageUri("file:///etc/passwd") && !isAcceptableImageUri("data:text/html;base64,AA") && !isAcceptableImageUri("javascript:alert(1)"), "file/data:text/javascript refused");
ok(reelPrompt({ motion: "a slow orbit" }).startsWith("A slow orbit on this photo."), "motion override capitalised");
ok(reelSlug("Mai-Kai Fort Lauderdale!") === "mai-kai-fort-lauderdale" && reelSlug("") === "reel", "slug");

// ── 2. CLI never spends without --confirm / a secret ───────────────────────
const dir = mkdtempSync(path.join(tmpdir(), "rw-reel-"));
const poison = path.join(dir, "poison.mjs");
writeFileSync(poison, "globalThis.fetch = () => { throw new Error('NETWORK CALL IN GUARD'); };\n");
const env = { ...process.env };
delete env.RUNWAYML_API_SECRET;
const run = (...args) => spawnSync(process.execPath,
  ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--import", poison, "scripts/runway-place-reel.mjs", ...args],
  { env, encoding: "utf8" });

const dry = run("--image", IMG, "--place", "Mai-Kai");
ok(dry.status === 0 && /DRY RUN — nothing submitted/.test(dry.stdout), `dry run exits 0 without submitting (status ${dry.status}: ${dry.stderr.trim()})`);
const noKey = run("--image", IMG, "--confirm");
ok(noKey.status === 1 && /RUNWAYML_API_SECRET is not set/.test(noKey.stderr), `--confirm without a secret refuses (status ${noKey.status})`);
ok(!/NETWORK CALL/.test(dry.stderr + noKey.stderr), "no network call on either path");
const bad = run("--image", IMG, "--duration", "99");
ok(bad.status === 2 && /duration/.test(bad.stderr), "invalid request exits 2 before anything else");
// Positive control: prove the poison actually fires in a child, or the
// "no network" assertion above proves nothing.
const ctl = spawnSync(process.execPath, ["--import", poison, "-e", "fetch('https://example.com')"], { encoding: "utf8" });
ok(ctl.status !== 0 && /NETWORK CALL IN GUARD/.test(ctl.stderr), "positive control: poisoned fetch throws in a child");

// ── 3. SDK stays out of shipped code ───────────────────────────────────────
const SDK = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']@runwayml\/sdk["']/;
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
let scanned = 0;
const offenders = [];
const walk = (p) => {
  const st = statSync(p);
  if (st.isDirectory()) { for (const f of readdirSync(p)) if (f !== "node_modules" && !f.startsWith(".")) walk(path.join(p, f)); return; }
  if (!/\.(?:m?js|jsx|ts|tsx)$/.test(p)) return;
  scanned++;
  if (SDK.test(strip(readFileSync(p, "utf8")))) offenders.push(p);
};
for (const root of ["app", "lib", "middleware.js", "instrumentation.js"]) walk(root);
ok(SDK.test(strip(readFileSync("scripts/runway-place-reel.mjs", "utf8"))), "positive control: probe finds the SDK import in the operator script");
ok(offenders.length === 0, `@runwayml/sdk imported from shipped code: ${offenders.join(", ")}`);
ok(scanned > 100, `scanned only ${scanned} shipped files — walk is broken`);

if (failures) {
  console.error(`test-runway-reel: FAIL — ${failures} assertion(s)`);
  process.exit(1);
}
console.log(`test-runway-reel: OK — builder contract (${Object.keys(REEL_MODELS).length} models), dry/no-secret CLI paths made 0 network calls, SDK absent from ${scanned} shipped files`);
