import assert from "node:assert/strict";
import { canShareNatively, queueShareChooser, shareOut } from "../lib/shareOut.js";
import { shareMessage } from "../lib/shareChooser.js";

class FakeElement {
  constructor(tag, doc) { this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.attrs = {}; this.listeners = {}; this.parentNode = null; this.textContent = ""; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(name, value) { this.attrs[name] = String(value); if (name === "id") this.id = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter((x) => x !== this); this.parentNode = null; }
  focus() { this.ownerDocument.activeElement = this; }
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

  let failedLoads = 0;
  assert.equal(queueShareChooser(payload, null, () => { failedLoads++; return Promise.reject(new Error("transient chunk failure")); }), true);
  assert.equal(await waitFor(() => failedLoads === 1), true);
  await Promise.resolve();

  setGlobal("navigator", { share: () => Promise.reject(Object.assign(new Error("refused"), { name: "NotAllowedError" })), clipboard: { writeText: async () => { throw new Error("must not silently copy"); } } });
  assert.equal(shareOut(payload), "native", "a promise-returning Web Share attempt starts on the original tap");
  assert.equal(await waitFor(() => document.getElementById("wf-share-out-chooser")), true);
  assert.ok(document.getElementById("wf-share-out-chooser"), "a refused native share retries after a transient chunk failure and opens the chooser");
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
  assert.equal(await waitFor(() => doc.getElementById("wf-share-out-chooser")), true, "fallback module loads and mounts its real dialog");
  assert.equal(shareOut(payload, () => { copiedCalls++; }), "chooser");
  assert.equal(await waitFor(() => (doc.listeners.keydown || []).length === 1), true);
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
  console.log("share-out-chooser PASS: native Web Share, text/email targets, explicit copy, dialog semantics, Escape and focus return");
} finally {
  for (const [name, value] of Object.entries(original)) {
    if (value === undefined) delete globalThis[name]; else setGlobal(name, value);
  }
}
