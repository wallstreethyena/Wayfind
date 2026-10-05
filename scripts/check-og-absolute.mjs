#!/usr/bin/env node
/**
 * check-og-absolute — every share preview resolves on the PRODUCTION origin.
 *
 * THE REPORTED SYMPTOM (owner, 2026-07-31): a link shared into iMessage previewed
 * with the host "localhost". A dev-server share reached a real thread with an
 * unopenable link.
 *
 * THE DIAGNOSIS IN THE BRIEF WAS "metadataBase is unset in app/layout.js". It is
 * not, and was not — see the audit note at the bottom of this file. metadataBase
 * has been set to SITE_URL since before this change, and SITE_URL is
 * `process.env.NEXT_PUBLIC_SITE_URL || "https://www.gowayfind.com"` with the env
 * var unset everywhere, so it is the production origin even on a dev server.
 * Fixing metadataBase would not have fixed the reported bug.
 *
 * The localhost came from the SHARE URL BUILDER, not from metadata: three
 * surfaces built the shared link from `window.location.href`, which on a dev
 * server IS localhost. That is fixed in lib/site.canonicalShareUrl and locked
 * below.
 *
 * This guard covers BOTH halves, because both can put a dead link in a thread:
 *   A. no route may hand a scraper a relative or non-production OG image URL
 *   B. no current-origin or relative URL may escape into a share composer/native sink
 *
 * WHY IT PARSES RATHER THAN GREPS: a route can be correct in four different
 * shapes (absolute literal, SITE_URL + path, a helper call, metadataBase
 * inheritance). Grepping for "https://" would pass a route that hardcodes a
 * STAGING origin, and would fail a correct route that relies on metadataBase.
 * So the check classifies each og image expression and judges it, and it states
 * what it could not classify rather than counting that as a pass.
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = process.cwd();
const PROD = "https://www.gowayfind.com";

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = path.join(dir, e);
    statSync(p).isDirectory() ? walk(p, acc) : (/\bpage\.js$/.test(e) && acc.push(p));
  }
  return acc;
}

const pages = walk(path.join(ROOT, "app")).filter((f) => readFileSync(f, "utf8").includes("generateMetadata"));
const fails = [];
const notes = [];
let absolute = 0, viaBase = 0, unclassified = 0, twitterOk = 0, twitterMissing = 0;

for (const f of pages) {
  const rel = path.relative(ROOT, f).split(path.sep).join("/");
  const src = readFileSync(f, "utf8");

  // ── A. the OG image URL ───────────────────────────────────────────────────
  // Grab every images entry inside an openGraph block.
  const ogImgs = [...src.matchAll(/images:\s*\[\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const bare = [...src.matchAll(/images:\s*\[\s*([A-Za-z_$][\w$]*)\s*\]/g)].map((m) => m[1]);

  if (!ogImgs.length && !bare.length) {
    notes.push(`${rel}: no openGraph.images found (inherits the layout default) — allowed`);
  }
  for (const body of ogImgs) {
    const url = (body.match(/url:\s*([^,\n]+)/) || [])[1];
    if (!url) { unclassified++; fails.push(`${rel}: an openGraph image entry has no url field`); continue; }
    let u = url.trim();
    // RESOLVE ONE LEVEL OF INDIRECTION. Every route in this repo writes
    // `images: [{ url: og, ... }]` where `og` is a const built above. Reading
    // the property value alone classifies literally every route as "unknown",
    // which is what the positive control caught on the first run of this guard.
    if (/^[A-Za-z_$][\w$]*$/.test(u)) {
      const decl = new RegExp("(?:const|let|var)\\s+" + u + "\\s*=\\s*([^;]+);", "m").exec(src);
      if (decl) u = decl[1].trim();
      else { unclassified++; notes.push(`${rel}: og image variable \`${u}\` has no visible declaration — UNKNOWN, not a pass`); continue; }
    }
    if (/^["'`]https:\/\/www\.gowayfind\.com/.test(u)) { absolute++; continue; }
    if (/^["'`]https?:\/\//.test(u)) {
      fails.push(`${rel}: openGraph image points at a NON-PRODUCTION absolute origin: ${u.slice(0, 60)}`);
      continue;
    }
    // SITE_URL/SITE + path, or a helper that returns one — both resolve to prod.
    if (/\bSITE(_URL)?\b/.test(u) || /\bogUrl\b|\babsUrl\b|\bcanonical/i.test(u)) { absolute++; continue; }
    // A relative path is legal ONLY because metadataBase resolves it. That is
    // true today, but it is the fragile shape the owner asked to eliminate:
    // a scraper that ignores metadataBase (several do) gets a relative path.
    if (/^["'`]\//.test(u)) { viaBase++; fails.push(`${rel}: openGraph image is RELATIVE (${u.slice(0, 46)}) — scrapers do not resolve relative paths; build it on SITE_URL`); continue; }
    unclassified++;
    notes.push(`${rel}: could not classify og image expression ${u.slice(0, 50)} — treated as UNKNOWN, not as a pass`);
  }

  // The SITE_URL import must RESOLVE. A first pass at this fix inserted
  // `../lib/site` into ten routes that needed `../../lib/site`; every og url was
  // textually correct and the build failed with ten module-not-found errors.
  // This guard checked the URL SHAPE and would have reported green — so it now
  // checks the thing the shape depends on.
  const imp = /import \{[^}]*\bSITE_URL\b[^}]*\} from "([^"]+)"/.exec(src);
  if (imp) {
    const target = path.resolve(path.dirname(f), imp[1] + ".js");
    if (!existsSync(target)) fails.push(`${rel}: imports SITE_URL from "${imp[1]}" which does not resolve (expected ${path.relative(ROOT, target)})`);
  } else if (/\bSITE_URL\b/.test(src) && !/const SITE_URL/.test(src)) {
    fails.push(`${rel}: uses SITE_URL without importing it`);
  }

  // ── B. twitter card ───────────────────────────────────────────────────────
  if (/twitter:\s*\{/.test(src)) {
    if (/card:\s*["']summary_large_image["']/.test(src)) twitterOk++;
    else { twitterMissing++; fails.push(`${rel}: has a twitter block but not card:"summary_large_image" — X renders the small square and the 1200x630 layout is wasted`); }
  } else if (ogImgs.length || bare.length) {
    twitterMissing++;
    fails.push(`${rel}: defines an openGraph image but NO twitter block — X falls back to the small square card`);
  }
}

// ── C. shared transport is proved, while genuine bypasses still fail ──────
// The source census follows real import targets across app AND lib. Merely
// seeing the word shareOut in a file is not evidence of canonicalization.
// The actual shareFlow -> shareOut -> SMS/Email/Copy/native boundary is driven
// below with relative, local and preview URLs, preserving query + capability
// fragment. The AST also distinguishes a URL share from coupon-code copying.
const MUTATION = process.argv.includes("--unsafe-relative-mutation")
  || process.argv.includes("--boundary-removal-mutation");
const BOUNDARY_MUTATION = process.argv.includes("--boundary-removal-mutation");
let runtimeAssertions = 0;
const ok = (condition, message) => { runtimeAssertions++; if (!condition) fails.push(message); };
process.env.NEXT_PUBLIC_SITE_URL = PROD; // explicit fixture, never ambient verdict
process.env.NEXT_PUBLIC_GROUP_PLANS_ENABLED = "0";

class ShareNode {
  constructor(tag, doc) { this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.attrs = {}; this.events = {}; this.style = {}; this._text = ""; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(" "); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(name, value) { this.attrs[name] = String(value); if (name === "id") this.id = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
  dispatchEvent(event) { for (const fn of this.events[event.type] || []) fn(event); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((n) => n !== this); this.parentNode = null; }
  focus() { this.doc.activeElement = this; }
  querySelectorAll() { return descendants(this).filter((n) => n.tagName === "BUTTON" || n.tagName === "INPUT" || (n.tagName === "A" && n.href)); }
  querySelector() { return this.querySelectorAll()[0] || null; }
  click() { this.dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} }); }
}
const descendants = (node) => node.children.flatMap((child) => [child, ...descendants(child)]);
class ShareDocument {
  constructor() { this.body = new ShareNode("body", this); this.head = new ShareNode("head", this); this.events = {}; }
  createElement(tag) { return new ShareNode(tag, this); }
  getElementById(id) { return [...descendants(this.body), ...descendants(this.head)].find((n) => n.id === id) || null; }
  addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.events[type] = (this.events[type] || []).filter((f) => f !== fn); }
}
const priorGlobals = Object.fromEntries(["document", "window", "navigator"].map((key) => [key, globalThis[key]]));
const setGlobal = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
const homeFile = path.join(ROOT, "app/home.js");
const homeSource = readFileSync(homeFile, "utf8");
const homeAst = ts.createSourceFile(homeFile, homeSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JSX);
const shellDeclaration = homeAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "shareLink");
let shellAdapterVerified = false;
let transportGraph;
const flow = await loadComponent(path.join(ROOT, "lib/shareFlow.js"), ROOT, { onGraph(graph) {
  transportGraph = graph;
  if (BOUNDARY_MUTATION) {
    const file = graph.get(path.join(ROOT, "lib/shareOut.js"));
    const code = readFileSync(file, "utf8");
    const normalizer = /const p = canonicalSharePayload\(payload\);/g;
    if ((code.match(normalizer) || []).length < 2) throw new Error("boundary mutation cannot find both real transport normalization calls");
    // The mutation changes only the loader's transient executable copy, never
    // product source. A removed lower-level boundary must turn this guard red.
    writeFileSync(file, code.replace(normalizer, "const p = payload || {};"));
  }
} });
const transport = await import(pathToFileURL(transportGraph.get(path.join(ROOT, "lib/shareOut.js"))).href);
const policyFailuresBefore = fails.length;
try {
  const doc = new ShareDocument();
  const copies = [], native = [];
  setGlobal("document", doc);
  setGlobal("window", { location: { origin: "http://localhost:3111", href: "http://localhost:3111/current" } });
  setGlobal("navigator", { share(data) { native.push(data); return Promise.resolve(); }, clipboard: { writeText(value) { copies.push(value); return Promise.resolve(); } } });
  const fixtures = [
    "/p/fixture?loc=Tampa#invite=fixture-capability",
    "http://localhost:3111/guides/fixture?img=owned-ref#section",
    "https://preview-fixture.vercel.app/group-plans/fixture?view=final#final=fixture-capability",
  ];
  for (const input of fixtures) {
    const parsed = new URL(input, PROD);
    const expected = PROD + parsed.pathname + parsed.search + parsed.hash;
    const payload = { title: "Fixture share", text: "Use this link", url: input };
    const result = transport.shareOut(payload);
    ok(result === "chooser", "the real shared transport must open a visible chooser for valid URL input");
    const chooser = doc.getElementById("wf-share-out-chooser");
    const all = chooser ? descendants(chooser) : [];
    const sms = all.find((n) => n.tagName === "A" && n.textContent === "Text message");
    const email = all.find((n) => n.tagName === "A" && n.textContent === "Email");
    const message = sms ? decodeURIComponent(sms.href.split("body=")[1] || "") : "";
    const emailMessage = email ? new URL(email.href).searchParams.get("body") : "";
    ok(message === "Use this link " + expected, "runtime SMS payload URL must be absolute on production, preserving query/fragment");
    ok(emailMessage === "Use this link " + expected, "runtime Email payload must retain the same canonical capability URL");
    const copy = all.find((n) => n.tagName === "BUTTON" && n.textContent === "Copy link");
    copy?.click();
    await Promise.resolve(); await Promise.resolve();
    ok(copies.at(-1) === expected, "runtime explicit Copy must write the absolute canonical URL");
    const nativeResult = transport.shareNatively(payload);
    ok(nativeResult === "native" && native.at(-1)?.url === expected, "the real direct native-choice boundary must canonicalize URLs before navigator.share");
  }
  for (const invalid of ["javascript:alert(1)", "data:text/plain,fixture", "https://[broken", "https://user:password@localhost/private"]) {
    const beforeNative = native.length, beforeCopies = copies.length;
    ok(transport.shareOut({ url: invalid }) === "failed", "malformed, credential-bearing or non-HTTPS share results must fail closed");
    ok(transport.shareNatively({ url: invalid }) === "failed", "a direct native choice cannot bypass malformed/non-HTTPS rejection");
    ok(native.length === beforeNative && copies.length === beforeCopies, "a refused URL must trigger no native or clipboard action");
  }
  const flowInput = "http://localhost:3111/p/fixture?loc=Tampa#invite=fixture-capability";
  ok(flow.openShareFlow({ title: "Fixture place", url: flowInput }) === "menu", "the real shared flow must open its intent menu");
  const justShare = descendants(doc.body).find((n) => n.tagName === "BUTTON" && n.textContent.startsWith("Just share it"));
  justShare?.click();
  const flowSms = descendants(doc.body).find((n) => n.tagName === "A" && n.textContent === "Text message");
  ok(!!flowSms && decodeURIComponent(flowSms.href).includes(PROD + "/p/fixture?loc=Tampa#invite=fixture-capability"), "shareFlow must actually delegate a canonical URL through its selected plain-share callback");
  const beforeShell = fails.length;
  ok(!!shellDeclaration, "the real home shell shareLink adapter must exist before testing ctx consumers");
  if (shellDeclaration) {
    const context = await import(pathToFileURL(transportGraph.get(path.join(ROOT, "lib/shareContext.js"))).href);
    const shell = Function("shareOut", "openShareFlow", "inShareChoice", "_sharePath", "isNative", "noteHighPointAndMaybeAsk",
      shellDeclaration.getText(homeAst) + "; return shareLink;")(
      transport.shareOut, flow.openShareFlow, context.inShareChoice, () => {}, () => false, () => {},
    );
    const relative = "/group-plans/fixture?view=final#final=fixture-capability";
    const insideChoice = context.runShareChoice(() => shell("Fixture", relative, null, "Use this link"));
    const choiceSms = descendants(doc.body).find((n) => n.tagName === "A" && n.textContent === "Text message");
    ok(insideChoice === true && !!choiceSms && decodeURIComponent(choiceSms.href).includes(PROD + relative), "the actual ctx shareLink selected-choice branch must retain the canonical capability URL");
    const outsideChoice = shell("Fixture", "http://localhost:3111" + relative, null, "Use this link");
    const shellPlain = descendants(doc.body).find((n) => n.tagName === "BUTTON" && n.textContent.startsWith("Just share it"));
    shellPlain?.click();
    const plainSms = descendants(doc.body).find((n) => n.tagName === "A" && n.textContent === "Text message");
    ok(outsideChoice === true && !!plainSms && decodeURIComponent(plainSms.href).includes(PROD + relative), "the actual ctx shareLink top-level menu branch must also retain the canonical URL");
  }
  shellAdapterVerified = fails.length === beforeShell;

} finally {
  for (const [key, value] of Object.entries(priorGlobals)) { if (value === undefined) delete globalThis[key]; else setGlobal(key, value); }
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.NEXT_PUBLIC_GROUP_PLANS_ENABLED;
}
const policyVerified = fails.length === policyFailuresBefore;

const SHARED_EXPORTS = new Map([
  [path.join(ROOT, "lib/shareFlow.js"), new Set(["openShareFlow"])],
  [path.join(ROOT, "lib/shareOut.js"), new Set(["shareOut", "shareNatively"])],
]);
const CORE = new Set(["lib/shareFlow.js", "lib/shareOut.js", "lib/shareChooser.js", "lib/native.js"]);
const clientFiles = [];
function collectClients(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) collectClients(file);
    else if (/\.(?:js|jsx)$/.test(name)) clientFiles.push(file);
  }
}
collectClients(path.join(ROOT, "app")); collectClients(path.join(ROOT, "lib"));

// Trace the tested shell adapter through its actual ctx object and JSX lazy
// imports. A named ctx.shareLink contract is not a per-file exemption: if the
// producer, component wiring, or exercised adapter disappears, it is unproven.
const shellVariables = new Map(), shellImports = new Map(), shellElements = [];
function readShell(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) shellVariables.set(node.name.text, node.initializer);
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause?.name) shellImports.set(node.importClause.name.text, node.moduleSpecifier.text);
  if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) shellElements.push(node);
  ts.forEachChild(node, readShell);
}
readShell(homeAst);
function componentImports(node, seen = new Set()) {
  if (!node || seen.has(node)) return []; seen.add(node);
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) return [node.arguments[0].text];
  if (ts.isIdentifier(node)) {
    if (shellImports.has(node.text)) return [shellImports.get(node.text)];
    if (shellVariables.has(node.text)) return componentImports(shellVariables.get(node.text), seen);
  }
  const targets = []; ts.forEachChild(node, (child) => { targets.push(...componentImports(child, seen)); }); return targets;
}
const ctxConsumers = new Set();
if (shellAdapterVerified) for (const element of shellElements) {
  const attr = element.attributes.properties.find((prop) => ts.isJsxAttribute(prop) && prop.name.text === "ctx");
  const expression = attr?.initializer && ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : null;
  const object = expression && ts.isIdentifier(expression) ? shellVariables.get(expression.text) : null;
  if (!object || !ts.isObjectLiteralExpression(object)) continue;
  const adapter = object.properties.find((prop) => (ts.isShorthandPropertyAssignment(prop) || ts.isPropertyAssignment(prop)) && prop.name.getText(homeAst) === "shareLink");
  if (!adapter || (ts.isPropertyAssignment(adapter) && adapter.initializer.getText(homeAst) !== "shareLink")) continue;
  const name = element.tagName.getText(homeAst);
  const target = shellVariables.get(name) || (shellImports.has(name) ? ts.factory.createIdentifier(name) : null);
  for (const spec of componentImports(target)) if (spec.startsWith(".")) ctxConsumers.add(path.resolve(path.dirname(homeFile), /\.jsx?$/.test(spec) ? spec : spec + ".js"));
}
for (const expected of ["app/components/sheets/Detail.js", "app/components/sheets/Menu.js"]) {
  ok(ctxConsumers.has(path.join(ROOT, expected)), `${expected}: its actual home ctx producer must remain connected to the exercised shared adapter`);
}

// Parse actual call sites and local binding initializers. Source strings and
// comments containing navigator.share are never sinks. The AST preserves
// https:// literals, which the old // comment stripper accidentally erased.
function scanShareSource(file, source) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, /\.jsx$/.test(file) ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
  const shared = new Set(), canonical = new Set(), declarations = [], calls = [];
  const scope = (node) => { for (let p = node.parent; p; p = p.parent) if (ts.isFunctionLike(p) || ts.isBlock(p) || ts.isSourceFile(p)) return p; return ast; };
  const ancestor = (outer, inner) => { for (let p = inner; p; p = p.parent) if (p === outer) return true; return false; };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const target = spec.startsWith(".") ? path.resolve(path.dirname(file), /\.jsx?$/.test(spec) ? spec : spec + ".js") : "";
      for (const entry of node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) ? node.importClause.namedBindings.elements : []) {
        const imported = entry.propertyName?.text || entry.name.text;
        if (SHARED_EXPORTS.get(target)?.has(imported)) shared.add(entry.name.text);
        if (target === path.join(ROOT, "lib/site.js") && imported === "canonicalShareUrl") canonical.add(entry.name.text);
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && ts.isIdentifier(node.initializer) && node.initializer.text === "ctx" && ctxConsumers.has(file) && shellAdapterVerified) {
      for (const binding of node.name.elements) if ((binding.propertyName?.getText(ast) || binding.name.getText(ast)) === "shareLink" && ts.isIdentifier(binding.name)) shared.add(binding.name.text);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations.push(node);
    if (ts.isCallExpression(node)) calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (SHARED_EXPORTS.has(file)) for (const name of SHARED_EXPORTS.get(file)) shared.add(name);
  if (file === homeFile && shellAdapterVerified) shared.add("shareLink");
  const resolve = (node, use, seen = new Set()) => {
    if (!node || seen.has(node)) return { kind: "unknown" };
    seen.add(node);
    if (ts.isParenthesizedExpression(node) || ts.isAwaitExpression(node)) return resolve(node.expression, use, seen);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { kind: "literal", value: node.text };
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && canonical.has(node.expression.text)) return { kind: "canonical" };
    if (/window\.location\.(?:href|origin)/.test(node.getText(ast))) return { kind: "window" };
    if (ts.isIdentifier(node)) {
      const decl = declarations.filter((d) => d.name.text === node.text && d.pos <= use.pos && ancestor(scope(d), use)).sort((a, b) => b.pos - a.pos)[0];
      if (decl) return resolve(decl.initializer, use, seen);
    }
    return { kind: "unknown", node };
  };
  const payloadUrl = (node, use, seen = new Set()) => {
    if (!node || seen.has(node)) return null; seen.add(node);
    if (ts.isObjectLiteralExpression(node)) {
      for (const prop of node.properties) {
        if ((ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) && prop.name.getText(ast).replace(/["']/g, "") === "url") return ts.isShorthandPropertyAssignment(prop) ? prop.name : prop.initializer;
      }
      return null;
    }
    if (ts.isIdentifier(node)) {
      const decl = declarations.filter((d) => d.name.text === node.text && d.pos <= use.pos && ancestor(scope(d), use)).sort((a, b) => b.pos - a.pos)[0];
      if (decl) return payloadUrl(decl.initializer, use, seen);
    }
    return null;
  };
  let sinks = 0, protectedSinks = 0, builders = 0, canonicalBuilders = 0;
  const issues = [], unknown = [];
  for (const call of calls) {
    const name = call.expression.getText(ast);
    const delegated = ts.isIdentifier(call.expression) && shared.has(call.expression.text);
    const nativeSink = /^(?:navigator\.share|Share\.share|nativeShare|nativeShareResult)$/.test(name);
    const shellSink = name === "shareLink";
    const copySink = /(?:^|\.)clipboard\.writeText$/.test(name);
    const chooserSink = name === "openShareChooser";
    if (!delegated && !nativeSink && !shellSink && !copySink && !chooserSink) continue;
    sinks++;
    if (delegated && policyVerified) { protectedSinks++; continue; }
    const url = shellSink ? call.arguments[1] : copySink ? call.arguments[0] : payloadUrl(call.arguments[0], call);
    if (!url) continue; // e.g. an explicit files-only image export is not a URL
    const result = resolve(url, call);
    // A coupon-code clipboard write is ordinary text, not a URL builder.
    if (copySink && result.kind === "unknown" && !/\burl\b/i.test(url.getText(ast))) continue;
    builders++;
    if (result.kind === "canonical") { canonicalBuilders++; continue; }
    if (result.kind === "literal") {
      let parsed;
      try { parsed = new URL(result.value); } catch {}
      if (parsed?.origin === PROD && parsed.protocol === "https:" && !parsed.username && !parsed.password) { canonicalBuilders++; continue; }
      issues.push(`${rel}: ${name} bypasses the shared transport with a relative/non-production share URL (${result.value.slice(0, 90)})`);
      continue;
    }
    if (result.kind === "window") {
      issues.push(`${rel}: ${name} bypasses canonicalShareUrl/shared transport with a URL derived from the current window origin`);
      continue;
    }
    if (CORE.has(rel) && policyVerified) { protectedSinks++; continue; } // actual runtime payload checks above prove this boundary
    unknown.push(`${rel}: ${name} URL provenance was not classified; not counted as canonical`);
  }
  return { sinks, protectedSinks, builders, canonicalBuilders, issues, unknown };
}
let shareFilesChecked = 0, shareFilesCanonical = 0, shareSinksChecked = 0, unclassifiedShares = 0;
for (const file of clientFiles) {
  const result = scanShareSource(file, readFileSync(file, "utf8"));
  if (!result.sinks) continue;
  shareFilesChecked++; shareSinksChecked += result.sinks;
  if (result.protectedSinks || result.canonicalBuilders) shareFilesCanonical++;
  fails.push(...result.issues); unclassifiedShares += result.unknown.length;
  notes.push(...result.unknown);
}
ok(shareFilesChecked > 0 && shareSinksChecked > 0, "the real app+lib share-sink census must be non-empty");
for (const relative of ["app/components/IntentPageClient.js", "app/components/TrendingNowClient.js", "lib/shareOut.js", "lib/shareFlow.js", "lib/shareChooser.js"]) {
  ok(scanShareSource(path.join(ROOT, relative), readFileSync(path.join(ROOT, relative), "utf8")).sinks > 0, `${relative}: the actual shared flow/native chooser sink must remain visible to the census`);
}
const fixtureFile = path.join(ROOT, "app/fixture-share-control.js");
const healthySource = `import { openShareFlow } from "../lib/shareFlow.js"; const url = "/p/fixture"; openShareFlow({url});`;
const relativeBypass = `const url = "/p/relative-regression"; navigator.share({url});`;
const hiddenBypass = `import { canonicalShareUrl } from "../lib/site.js"; const healthy = canonicalShareUrl("/good"); const url = window.location.href; navigator.share({url});`;
const absoluteSource = `const url = "https://www.gowayfind.com/p/fixture"; navigator.share({url});`;
ok(scanShareSource(fixtureFile, healthySource).protectedSinks === 1 && scanShareSource(fixtureFile, healthySource).issues.length === 0, "relative inputs are safe only when the exercised real shared boundary canonicalizes them");
ok(scanShareSource(fixtureFile, relativeBypass).issues.length === 1, "the AST must catch a real relative share URL reaching a direct native sink");
ok(scanShareSource(fixtureFile, hiddenBypass).issues.length === 1, "an unrelated canonicalShareUrl elsewhere in the file must not bless a raw-origin bypass");
ok(scanShareSource(fixtureFile, absoluteSource).canonicalBuilders === 1, "the same AST probe must find a healthy direct production URL");
if (process.argv.includes("--unsafe-relative-mutation")) fails.push(...scanShareSource(fixtureFile, relativeBypass).issues);
if (!MUTATION && fails.length === 0) {
  for (const [flag, expected] of [["--unsafe-relative-mutation", "relative/non-production share URL"], ["--boundary-removal-mutation", "runtime SMS payload URL"]]) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), flag], { cwd: ROOT, encoding: "utf8" });
    ok(child.status === 1 && child.stderr.includes(expected), `${flag}: a real relative bypass or removed normalization boundary must make the child process fail for the intended reason`);
  }
}

// POSITIVE CONTROL: the probe must find a known-good absolute URL, or a zero
// from it means nothing (the git-grep-counted-nothing failure class).
if (absolute === 0) {
  console.error("check-og-absolute: FAIL — classified ZERO absolute OG image urls across the whole app.");
  console.error("  That is not a clean repo, it is a broken parser. Fix the classifier before trusting a pass.");
  process.exit(1);
}

if (fails.length) {
  console.error(`check-og-absolute: FAIL — ${fails.length} issue(s) across ${pages.length} metadata routes:\n`);
  for (const f of fails) console.error("  · " + f);
  if (notes.length) { console.error("\n  notes:"); for (const n of notes.slice(0, 8)) console.error("  – " + n); }
  console.error(`\n  Every share preview must resolve on ${PROD}. Build og image urls as SITE_URL + path`);
  console.error("  (lib/site.js), set twitter.card = \"summary_large_image\", and build shared links with");
  console.error("  canonicalShareUrl() so a dev or preview host can never reach a real thread.");
  process.exit(1);
}

console.log(`check-og-absolute: OK — ${pages.length} metadata routes scanned; ${absolute} absolute OG image url(s) on the production origin, ${twitterOk} route(s) with summary_large_image, ${unclassified} unclassified (reported, never counted as passes); ${shareFilesCanonical}/${shareFilesChecked} share-sink file(s) covered by exercised canonical policy or direct absolute URLs; ${shareSinksChecked} actual app+lib sinks, ${unclassifiedShares} unknown provenance call(s) not counted as canonical; ${runtimeAssertions} runtime/negative controls`);
