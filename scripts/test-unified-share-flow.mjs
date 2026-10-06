import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { groupPlanHref, placeSharePreview, concreteSharePlaceId, inShareChoice, runShareChoice, isShareCancellation } from "../lib/shareContext.js";
import { shareOut } from "../lib/shareOut.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
class Element {
  constructor(tag, doc) { this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.attrs = {}; this.events = {}; this.style = {}; this._text = ""; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((n) => n.textContent).join(" "); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === "id") this.id = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  appendChild(n) { n.parentNode = this; this.children.push(n); return n; }
  addEventListener(k, fn) { (this.events[k] ||= []).push(fn); }
  removeEventListener(k, fn) { this.events[k] = (this.events[k] || []).filter((f) => f !== fn); }
  dispatchEvent(e) { for (const fn of this.events[e.type] || []) fn(e); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((n) => n !== this); this.parentNode = null; }
  focus() { this.doc.activeElement = this; }
  querySelectorAll(selector) { return walk(this).filter((n) => selector.includes("input") ? ["BUTTON", "INPUT"].includes(n.tagName) : n.tagName === "BUTTON" || (n.tagName === "A" && n.href)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  click() { this.dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} }); }
}
const walk = (n) => n.children.flatMap((c) => [c, ...walk(c)]);
class Document {
  constructor() { this.body = new Element("body", this); this.head = new Element("head", this); this.events = {}; }
  createElement(tag) { return new Element(tag, this); }
  getElementById(id) { return [...walk(this.body), ...walk(this.head)].find((n) => n.id === id) || null; }
  addEventListener(k, fn) { (this.events[k] ||= []).push(fn); }
  removeEventListener(k, fn) { this.events[k] = (this.events[k] || []).filter((f) => f !== fn); }
  key(key, shiftKey = false) { for (const fn of [...(this.events.keydown || [])]) fn({ key, shiftKey, preventDefault() {} }); }
  execCommand() { return false; }
}
const original = Object.fromEntries(["window", "document", "navigator"].map((k) => [k, globalThis[k]]));
const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });
const find = (label, root = document.body) => walk(root).find((n) => n.tagName === "BUTTON" && n.textContent.startsWith(label));
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
let assertions = 0;
const check = (fn) => { fn(); assertions++; };
try {
  const { openShareFlow, sharePlaceId } = await loadComponent(path.join(ROOT, "lib/shareFlow.js"), ROOT);
  const doc = new Document(); set("document", doc);
  const nav = []; const location = { origin: "https://www.gowayfind.com" };
  Object.defineProperty(location, "href", { set(value) { nav.push(value); assert.equal(document.getElementById("wf-share-intent"), null, "group navigation must happen after closing the menu"); } });
  set("window", { location });
  let copied = 0, nativeCalls = 0;
  set("navigator", { share: () => { nativeCalls++; return Promise.resolve(); }, clipboard: { writeText: async () => { copied++; } } });
  const payload = { title: "Ulele", text: "Want to try Ulele?", url: "https://www.gowayfind.com/p/ChIJfixture", city: "Tampa" };
  const trigger = doc.createElement("button"); doc.body.appendChild(trigger); trigger.focus();

  check(() => assert.equal(sharePlaceId(payload), "ChIJfixture"));
  for (const url of ["/guides/a-guide", "/florida-events/a-festival", "/places", "/p/", "bad:"]) check(() => assert.equal(sharePlaceId({ url }), ""));
  for (const id of [null, "", " ", "../x", "https://x", "a?b", "a b", "a\\b"]) check(() => assert.equal(concreteSharePlaceId(id), ""));
  check(() => assert.equal(groupPlanHref("ChIJfixture", "Ulele", false), null));
  check(() => assert.equal(groupPlanHref("", "Ulele", true), null));
  check(() => assert.equal(new URL(groupPlanHref("ChIJfixture", "Ulele", true), location.origin).searchParams.get("place"), "ChIJfixture"));
  const preview = new URL(placeSharePreview("ChIJfixture", "Ulele", "Tampa"), location.origin);
  check(() => assert.equal(preview.pathname, "/api/og/hero"));
  check(() => assert.equal(preview.searchParams.get("id"), "ChIJfixture"));
  check(() => assert.equal(preview.searchParams.has("src"), false));
  check(() => assert.equal(preview.searchParams.has("r"), false));
  check(() => assert.equal(placeSharePreview("", "Ulele"), null));

  for (const disabled of ["0", "true", "2"]) {
    process.env.NEXT_PUBLIC_GROUP_PLANS_ENABLED = disabled;
    openShareFlow(payload);
    check(() => assert.equal(find("Organize a group"), undefined, "only the exact configured value 1 enables group planning"));
    doc.key("Escape");
  }
  delete process.env.NEXT_PUBLIC_GROUP_PLANS_ENABLED;
  check(() => assert.equal(openShareFlow(payload), "menu"));
  check(() => assert.equal(find("Organize a group"), undefined));
  doc.key("Escape");
  process.env.NEXT_PUBLIC_GROUP_PLANS_ENABLED = "1";
  openShareFlow({ ...payload, url: "/guides/uleles-guide" });
  check(() => assert.equal(find("Organize a group"), undefined, "a title/content ID alone is not concrete place identity"));
  doc.key("Escape");
  openShareFlow(payload);
  const menu = document.getElementById("wf-share-intent");
  const buttons = walk(menu).filter((n) => n.tagName === "BUTTON");
  check(() => assert.deepEqual(buttons.slice(0, 3).map((b) => b.textContent.split(" ").slice(0, 3).join(" ")), ["Just share it", "I’m asking someone", "Organize a group"]));
  check(() => assert.match(find("Organize a group").textContent, /Pick a place\. Find a time\./));
  const image = walk(menu).find((n) => n.tagName === "IMG");
  check(() => assert.equal(image.src, placeSharePreview("ChIJfixture", "Ulele", "Tampa")));
  image.dispatchEvent({ type: "error" });
  check(() => assert.equal(walk(menu).some((n) => n.tagName === "IMG"), false, "photo failure cannot leave a broken preview"));
  find("Organize a group").click();
  check(() => assert.match(nav[0], /^\/group-plans\/new\?place=ChIJfixture&name=Ulele$/));
  check(() => assert.equal(copied + nativeCalls, 0, "group navigation does not send or copy anything"));

  openShareFlow(payload);
  find("Just share it").click();
  check(() => assert.equal(document.getElementById("wf-share-intent"), null));
  const chooser = document.getElementById("wf-share-out-chooser");
  check(() => assert.ok(chooser));
  check(() => assert.equal(copied + nativeCalls, 0, "opening text-first choices consumes no share/copy activation"));
  const links = walk(chooser).filter((n) => n.tagName === "A");
  check(() => assert.equal(links[0].textContent, "Text message"));
  check(() => assert.match(decodeURIComponent(links[0].href), /Want to try Ulele\? https:\/\/www\.gowayfind\.com\/p\/ChIJfixture/));
  check(() => assert.match(links[0].getAttribute("style"), /#F97316/));
  find("More share options").click();
  check(() => assert.equal(nativeCalls, 1, "native share starts synchronously in its choice’s click"));
  check(() => assert.equal(copied, 0));
  await settle();
  check(() => assert.equal(document.getElementById("wf-share-out-chooser"), null));

  set("navigator", { share: () => Promise.reject(Object.assign(new Error("cancelled"), { name: "AbortError" })), clipboard: { writeText: async () => { copied++; } } });
  shareOut(payload); find("More share options").click(); await settle();
  check(() => assert.equal(document.getElementById("wf-share-out-chooser"), null, "cancel must not open another composer or silently copy"));
  check(() => assert.equal(copied, 0));
  set("navigator", { share: () => { throw Object.assign(new Error("refused"), { name: "NotAllowedError" }); } });
  shareOut(payload); find("More share options").click();
  check(() => assert.ok(document.getElementById("wf-share-out-chooser"), "synchronous refusal must leave visible choices"));
  doc.key("Escape");
  set("navigator", { share: () => Promise.reject(Object.assign(new Error("refused"), { name: "NotAllowedError" })) });
  shareOut(payload); find("More share options").click(); await settle();
  check(() => assert.ok(document.getElementById("wf-share-out-chooser"), "asynchronous refusal must reopen explicit choices"));
  doc.key("Escape");

  let composerChoice = null;
  shareOut(payload, null, { onComposerChosen: (channel) => { composerChoice = channel; } });
  check(() => assert.equal(composerChoice, null, "opening choices does not earn a handoff metric"));
  walk(document.getElementById("wf-share-out-chooser")).find((n) => n.tagName === "A" && n.textContent === "Text message").click();
  check(() => assert.equal(composerChoice, "sms", "the metric names a user-selected composer, never delivery"));
  let falseCopies = 0;
  set("navigator", { clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
  shareOut({ title: "Your reply", text: "Yes, let’s go!" }, () => { falseCopies++; }, { textOnly: true });
  check(() => assert.ok(find("Copy message"), "a text-only reply has no invented URL"));
  find("Copy message").click(); await settle();
  check(() => assert.equal(falseCopies, 0));
  check(() => assert.match(document.getElementById("wf-share-out-chooser").textContent, /Couldn’t copy/));
  doc.key("Escape");
  check(() => assert.equal(shareOut({ text: "reply" }), "failed", "text-only mode is explicit"));
  check(() => assert.equal(inShareChoice(), false));
  try { runShareChoice(() => { assert.equal(inShareChoice(), true); throw new Error("control"); }); } catch {}
  check(() => assert.equal(inShareChoice(), false, "failed callbacks cannot leak the no-nested-menu context"));
  check(() => assert.equal(isShareCancellation(new Error("Share canceled")), true));
  check(() => assert.equal(isShareCancellation(new Error("Error sharing item")), false));

  // Whole-source-family fuse: no new text-share transport may bypass policy.
  const files = [];
  const collect = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) collect(full); else if (/\.jsx?$/.test(entry.name)) files.push(full); } };
  collect(path.join(ROOT, "app")); collect(path.join(ROOT, "lib"));
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const clipboardCallers = files.filter((f) => /navigator\.clipboard\.writeText\s*\(/.test(strip(readFileSync(f, "utf8")))).map((f) => path.relative(ROOT, f)).sort();
  check(() => assert.deepEqual(clipboardCallers, ["app/home.js", "lib/shareChooser.js"], "only explicit chooser copy and coupon-code copy may write clipboard"));
  const home = strip(readFileSync(path.join(ROOT, "app/home.js"), "utf8"));
  check(() => assert.equal((home.match(/navigator\.clipboard\.writeText\s*\(/g) || []).length, 1));
  check(() => assert.match(home, /function copyCouponCode\(code\)[\s\S]{0,160}navigator\.clipboard\.writeText\(code\)/));
  const shareCallers = files.filter((f) => /navigator\.share\s*\(/.test(strip(readFileSync(f, "utf8")))).map((f) => path.relative(ROOT, f)).sort();
  check(() => assert.deepEqual(shareCallers, ["app/ask/AskClient.js", "lib/shareOut.js"]));
  const ask = strip(readFileSync(path.join(ROOT, "app/ask/AskClient.js"), "utf8"));
  check(() => assert.equal((ask.match(/navigator\.share\s*\(/g) || []).length, 1, "Ask’s sole transport exception is its explicit image-file export"));
  check(() => assert.match(ask, /navigator\.share\(\{ files: \[file\] \}\)/));
  check(() => assert.doesNotMatch(ask, /setSent\("sent"\)|Sent — they know|clipboard\.writeText/));
  console.log(`unified-share-flow PASS: ${assertions} runtime/negative/source assertions; group gating, preview identity, text-first choices, fresh native activation, cancellation, failed copy and image-export exception`);
} finally {
  for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else set(key, value); }
  delete process.env.NEXT_PUBLIC_GROUP_PLANS_ENABLED;
}
