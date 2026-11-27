#!/usr/bin/env node
// scripts/test-event-ticket-first-screen.mjs — on both event routes the ONE
// ticket button sits right under the facts, above the story (SEO and
// conversion audit, 2026-11-27). It used to be the first thing in the actions
// block, after the notes, hook, summary and "why it's worth going": on a phone,
// three or four paragraphs below the date.
//
//   1. EventDetailShell's real server render puts quickAction after the facts
//      and before the story and the actions block (DOM order, not a grep).
//   2. Both pages hand the ticket control to quickAction, not to actions, so it
//      is moved and never duplicated (one button, one decision line).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(path.join(REPO, f), "utf8");
const strip = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
let n = 0;
const ok = (label, f) => { try { f(); n++; } catch (e) { console.error("test-event-ticket-first-screen: FAIL - " + label + "\n  " + e.message); process.exit(1); } };

const Shell = (await loadComponent(path.join(REPO, "app/components/EventDetailShell.js"), REPO)).default;
const html = renderToStaticMarkup(createElement(Shell, {
  title: "Fixture", facts: [{ label: "When", value: "Dec 12" }],
  quickAction: createElement("a", { href: "/api/commerce/go?x=1", "data-fixture-ticket": "" }, "Get tickets"),
  story: createElement("p", null, "A long reason to go."),
  actions: createElement("button", null, "Save"),
  media: createElement("div", { className: "wf-event-photo" }),
}));
ok("shell order: facts -> quick ticket -> story -> actions", () => {
  const facts = html.indexOf('class="wf-event-summary"');
  const quick = html.indexOf('class="wf-event-quick"');
  const reason = html.indexOf('class="wf-event-reason"');
  const actions = html.indexOf('class="wf-event-actions"');
  assert.ok(facts >= 0 && quick > facts && reason > quick && actions > reason, `order facts=${facts} quick=${quick} reason=${reason} actions=${actions}`);
  assert.ok(html.indexOf("data-fixture-ticket") > quick && html.indexOf("data-fixture-ticket") < reason, "the ticket renders inside the quick slot");
});
ok("no quickAction, no empty slot", () => {
  const bare = renderToStaticMarkup(createElement(Shell, { title: "F", facts: [], actions: null, media: null }));
  assert.ok(!bare.includes("wf-event-quick"));
});

const slot = (src, name) => {
  const i = src.indexOf(name + "={");
  assert.ok(i > 0, "probe: " + name + " prop not found");
  let depth = 0;
  for (let j = i + name.length + 1; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  throw new Error("unbalanced " + name);
};
ok("/florida-events/<slug>: the ticket block is in quickAction, not actions", () => {
  const src = strip(read("app/florida-events/[slug]/page.js"));
  const q = slot(src, "quickAction"); const a = slot(src, "actions");
  assert.match(q, /<div style=\{S\.ticketWrap\}>/);
  assert.match(q, /data-ticket-decision=""/);
  assert.doesNotMatch(a, /S\.ticketWrap|data-ticket-decision/);
  assert.equal((src.match(/style=\{S\.tix\}/g) || []).length, 1, "exactly one ticket button");
});
ok("/events/<city>/<slug>: TicketButton is in quickAction, not actions", () => {
  const src = strip(read("app/events/[city]/[slug]/page.js"));
  const q = slot(src, "quickAction"); const a = slot(src, "actions");
  assert.match(q, /<TicketButton[\s/>]/);
  assert.doesNotMatch(a, /<TicketButton[\s/>]/);
  assert.equal((src.match(/<TicketButton[\s/>]/g) || []).length, 1, "exactly one TicketButton");
});
console.log("test-event-ticket-first-screen: OK - " + n + " checks; one ticket button under the facts on both event routes");
