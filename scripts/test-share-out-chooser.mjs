import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canShareNatively, shareOut } from "../lib/shareOut.js";
import { shareMessage } from "../lib/shareChooser.js";
import { ACTION_ATTR, PLACE_ATTR, PENDING_ACTIONS_KEY, WAS_ATTR, cardActionBridgeScript } from "../lib/cardActionAttrs.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

class FakeElement {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.attrs = {}; this.listeners = {}; this.parentNode = null; this.textContent = "";
    const names = new Set();
    this.classList = { add: (name) => names.add(name), remove: (name) => names.delete(name), contains: (name) => names.has(name) };
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(name, value) { this.attrs[name] = String(value); if (name === "id") this.id = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  removeAttribute(name) { delete this.attrs[name]; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter((x) => x !== this); this.parentNode = null; }
  focus() { this.ownerDocument.activeElement = this; }
  closest(selector) {
    let node = this;
    const match = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    while (node && match) {
      if (node.hasAttribute(match[1]) && (match[2] === undefined || node.getAttribute(match[1]) === match[2])) return node;
      node = node.parentNode;
    }
    return null;
  }
  querySelectorAll(selector) { return flatten(this).filter((n) => (n.tagName === "A" && !!n.href) || n.tagName === "BUTTON"); }
  click() { for (const fn of this.listeners.click || []) fn({ preventDefault() {}, stopPropagation() {} }); }
}
const flatten = (node) => node.children.flatMap((child) => [child, ...flatten(child)]);
class FakeDocument {
  constructor() { this.listeners = {}; this.body = new FakeElement("body", this); this.head = new FakeElement("head", this); this.activeElement = null; }
  createElement(tag) { return new FakeElement(tag, this); }
  getElementById(id) { return [...flatten(this.body), ...flatten(this.head)].find((n) => n.id === id) || null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((x) => x !== fn); }
  key(key, extra = {}) { for (const fn of this.listeners.keydown || []) fn({ key, shiftKey: false, preventDefault() {}, ...extra }); }
}

const waitFor = async (predicate) => {
  for (let i = 0; i < 30; i++) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return false;
};

const original = { document: globalThis.document, window: globalThis.window, navigator: globalThis.navigator };
const setGlobal = (name, value) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
try {
  const payload = { title: "Tampa Riverfest", text: "Want to go to Tampa Riverfest?", url: "https://www.gowayfind.com/florida-events/tampa-riverfest" };
  assert.equal(shareMessage(payload), payload.text + " " + payload.url);

  let nativePayload = null;
  setGlobal("window", { matchMedia: () => ({ matches: false }) });
  setGlobal("navigator", { share: (value) => { nativePayload = value; return Promise.resolve(); } });
  setGlobal("document", new FakeDocument());
  assert.equal(canShareNatively(), true, "Web Share availability must not be rejected just because the pointer is fine");
  assert.equal(shareOut(payload), "native");
  assert.deepEqual(nativePayload, payload);
  assert.equal(document.getElementById("wf-share-out-chooser"), null);

  setGlobal("navigator", { share: () => Promise.reject(Object.assign(new Error("refused"), { name: "NotAllowedError" })), clipboard: { writeText: async () => { throw new Error("must not silently copy"); } } });
  assert.equal(shareOut(payload), "native", "a promise-returning Web Share attempt starts on the original tap");
  assert.equal(await waitFor(() => document.getElementById("wf-share-out-chooser")), true);
  assert.ok(document.getElementById("wf-share-out-chooser"), "a refused native share opens the chooser");
  document.key("Escape");

  setGlobal("navigator", { share: () => { throw Object.assign(new Error("blocked"), { name: "NotAllowedError" }); } });
  assert.equal(shareOut(payload), "chooser", "a synchronous Web Share refusal falls back during the original click");
  assert.ok(document.getElementById("wf-share-out-chooser"), "the chooser must already exist when shareOut reports chooser");
  document.key("Escape");

  setGlobal("navigator", { share: () => Promise.reject(Object.assign(new Error("cancelled"), { name: "AbortError" })) });
  assert.equal(shareOut(payload), "native");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(document.getElementById("wf-share-out-chooser"), null, "cancelling native share must not trigger another action");

  const doc = new FakeDocument();
  const trigger = doc.createElement("button");
  doc.body.appendChild(trigger);
  trigger.focus();
  let copied = null, copiedCalls = 0;
  setGlobal("document", doc);
  setGlobal("navigator", { clipboard: { writeText: async (value) => { copied = value; } } });
  assert.equal(shareOut(payload, () => { copiedCalls++; }), "chooser");
  assert.ok(doc.getElementById("wf-share-out-chooser"), "a browser without Web Share gets visible fallback UI during the original click");
  assert.equal(shareOut(payload, () => { copiedCalls++; }), "chooser");
  assert.equal((doc.listeners.keydown || []).length, 1, "replacing a chooser must remove its old keyboard listener");
  const dialog = doc.getElementById("wf-share-out-chooser");
  assert.ok(dialog, "fallback chooser must be mounted");
  assert.equal(dialog.getAttribute("role"), "dialog");
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  const choices = flatten(dialog);
  const sms = choices.find((n) => n.textContent === "Text message");
  const email = choices.find((n) => n.textContent === "Email");
  const copy = choices.find((n) => n.textContent === "Copy link");
  assert.ok(sms.href.startsWith("sms:?&body="));
  assert.equal(decodeURIComponent(sms.href.split("body=")[1]), shareMessage(payload));
  assert.ok(email.href.startsWith("mailto:?subject="));
  assert.ok(copy, "chooser must expose Copy link explicitly");
  assert.equal(copied, null, "opening the chooser must not silently copy");
  copy.click();
  assert.equal(await waitFor(() => doc.getElementById("wf-share-out-chooser") === null), true, "a successful asynchronous copy closes the chooser");
  assert.equal(copied, payload.url);
  assert.equal(copiedCalls, 1);
  assert.equal(doc.activeElement, trigger, "closing restores focus to the Share button");

  let falseSuccess = 0;
  setGlobal("navigator", { clipboard: { writeText: async () => { throw new Error("denied"); } } });
  assert.equal(shareOut(payload, () => { falseSuccess++; }), "chooser");
  assert.equal(await waitFor(() => doc.getElementById("wf-share-out-chooser")), true);
  doc.getElementById("wf-share-out-chooser").querySelectorAll("a[href],button:not([disabled])").find((n) => n.textContent === "Copy link").click();
  assert.equal(await waitFor(() => {
    const active = doc.getElementById("wf-share-out-chooser");
    return active && flatten(active).some((n) => n.getAttribute("role") === "status" && /Couldn’t copy the link/.test(n.textContent));
  }), true, "a failed copy exposes a visible live status");
  assert.equal(falseSuccess, 0, "failed clipboard and legacy copy must not announce success");
  const failedDialog = doc.getElementById("wf-share-out-chooser");
  assert.ok(failedDialog, "a failed copy keeps the chooser open so the user can choose another path");
  assert.equal(flatten(failedDialog).find((n) => n.textContent === "Copy link")?.disabled, false, "a failed copy restores the Copy link control");

  assert.equal(shareOut(payload), "chooser");
  assert.equal(await waitFor(() => doc.getElementById("wf-share-out-chooser")), true);
  doc.key("Escape");
  assert.equal(doc.getElementById("wf-share-out-chooser"), null, "Escape closes the chooser");

  setGlobal("window", { location: { origin: "https://www.gowayfind.com" } });
  setGlobal("navigator", {});
  const { drainPendingActions, shareCard } = await loadComponent(path.join(ROOT, "lib/cardActions.js"), ROOT);
  assert.equal(shareCard({ id: "nearby-place", name: "Nearby Place" }, { surface: "event_nearby" }), "chooser");
  const cardDialog = doc.getElementById("wf-share-out-chooser");
  assert.ok(cardDialog, "the real IconicPlaceCard store fallback opens the shared chooser");
  const cardEmail = flatten(cardDialog).find((n) => n.textContent === "Email");
  assert.match(decodeURIComponent(cardEmail.href), /https:\/\/www\.gowayfind\.com\/p\/nearby-place/, "the real fallback shares the place URL");
  doc.key("Escape");

  const earlyDoc = new FakeDocument();
  setGlobal("document", earlyDoc);
  setGlobal("window", { location: { origin: "https://www.gowayfind.com" } });
  // The bridge is deliberately an inline script in app/layout.js. Evaluating
  // the generated production string proves its early capture behavior rather
  // than testing a second handwritten model of it.
  Function("window", "document", cardActionBridgeScript())(window, document);
  const card = earlyDoc.createElement("article");
  const earlyShare = earlyDoc.createElement("button");
  earlyShare.setAttribute(ACTION_ATTR, "share");
  earlyShare.setAttribute(PLACE_ATTR, "nearby-place");
  card.appendChild(earlyShare);
  earlyDoc.body.appendChild(card);
  const capture = (target) => {
    let prevented = 0, stopped = 0;
    for (const fn of earlyDoc.listeners.click || []) fn({ target, preventDefault() { prevented++; }, stopPropagation() { stopped++; } });
    return { prevented, stopped };
  };
  assert.deepEqual(capture(earlyShare), { prevented: 1, stopped: 1 }, "an early Share tap cannot leak into card navigation");
  assert.deepEqual(window[PENDING_ACTIONS_KEY], [{ k: "share:nearby-place", action: "share", id: "nearby-place" }], "an early Share tap queues the real action");
  assert.equal(earlyShare.hasAttribute(WAS_ATTR), false, "Share is not painted as a reversible pressed state");
  assert.equal(earlyShare.hasAttribute("aria-pressed"), false, "Share does not gain toggle semantics while queued");
  capture(earlyShare);
  assert.equal(window[PENDING_ACTIONS_KEY].length, 1, "a second early Share tap keeps one replay instead of cancelling it");
  const replayed = [];
  assert.equal(drainPendingActions("nearby-place", (action) => {
    replayed.push(action);
    if (action === "share") shareCard({ id: "nearby-place", name: "Nearby Place" }, { surface: "event_nearby" });
  }), 1, "hydration drains the queued Share once");
  assert.deepEqual(replayed, ["share"]);
  assert.deepEqual(window[PENDING_ACTIONS_KEY], []);
  assert.ok(earlyDoc.getElementById("wf-share-out-chooser"), "the replay reaches the real card share fallback and produces visible UI");
  earlyDoc.key("Escape");

  const earlySave = earlyDoc.createElement("button");
  earlySave.setAttribute(ACTION_ATTR, "save");
  earlySave.setAttribute(PLACE_ATTR, "stay-place");
  card.appendChild(earlySave);
  capture(earlySave);
  assert.equal(earlySave.getAttribute("aria-pressed"), "true", "existing state actions retain their optimistic paint");
  assert.equal(earlySave.classList.contains("is-active"), true);
  capture(earlySave);
  assert.equal(earlySave.getAttribute("aria-pressed"), "false", "a second state-action tap still toggles the queued intent off");
  assert.equal(earlySave.classList.contains("is-active"), false);
  assert.deepEqual(window[PENDING_ACTIONS_KEY], []);
  console.log("share-out-chooser PASS: native Web Share, text/email targets, explicit copy, dialog semantics, Escape and focus return");
} finally {
  for (const [name, value] of Object.entries(original)) {
    if (value === undefined) delete globalThis[name]; else setGlobal(name, value);
  }
}
