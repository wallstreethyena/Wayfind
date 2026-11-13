#!/usr/bin/env node
// StubHub options on pinned Christmas shows ship DARK (lib/stubhub.js): with no
// valid STUBHUB_PARTNERIZE_CAMREF no StubHub option exists anywhere; with a
// valid one (faked in-process) options appear only for shows in the reviewed
// map (lib/christmasStubhub.js), only when pinned, and only through
// /api/stubhub/go. The production map holds exact reviewed event pages only.
import assert from "node:assert/strict";
import { christmasBrowseListings } from "../lib/christmasBrowse.js";
import { ticketAction } from "../lib/christmasTickets.js";
import { CHRISTMAS_STUBHUB, christmasStubhubOption } from "../lib/christmasStubhub.js";
import { isStubhubUrl } from "../lib/stubhub.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const KEY = "STUBHUB_PARTNERIZE_CAMREF";
const days = ["2026-11-12", "2026-11-29", "2026-12-03", "2026-12-11", "2026-12-17", "2026-12-21"];
const allStubhub = (day) => christmasBrowseListings([], day, [], []).flatMap((c) => { const a = ticketAction(c, new Map(), day); return ((a && a.options) || []).filter((o) => o.provider === "stubhub"); });

// 1. Dark: unset, empty, placeholder, malformed.
for (const v of [undefined, "", "[SENSITIVE]", "bad value!"]) {
  if (v === undefined) delete process.env[KEY]; else process.env[KEY] = v;
  for (const d of days) ok(allStubhub(d).length === 0, "camref " + JSON.stringify(v) + " on " + d + ": zero StubHub options");
}
delete process.env[KEY];

// 2. Every production map row is an exact StubHub event page with a date.
for (const [id, rows] of Object.entries(CHRISTMAS_STUBHUB)) for (const r of rows) {
  ok(isStubhubUrl(r.url) && /\/event\/\d+/.test(r.url) && /^\d{4}-\d{2}-\d{2}$/.test(r.date), id + " row is an exact StubHub event page");
}
ok(Object.isFrozen(CHRISTMAS_STUBHUB), "the reviewed map is frozen");

// 3. Live with a fake camref: only mapped, pinned shows get an option.
process.env[KEY] = "FAKE123abc";
const day = "2026-12-03";
const cards = christmasBrowseListings([], day, [], []);
const target = cards.find((c) => c.id === "van-wezel-dave-koz-and-friends-christmas-tour-2026");
ok(!!target, "fixture show exists");
const fake = Object.freeze({ [target.id]: [{ date: "2026-12-03", url: "https://www.stubhub.com/dave-koz-sarasota-tickets-12-3-2026/event/9000001" }] });
const opt = christmasStubhubOption(target, day, "christmas_tickets", fake);
ok(opt && opt.provider === "stubhub" && opt.label === "StubHub" && /^\/api\/stubhub\/go\?/.test(opt.href), "mapped show gets a StubHub option through our redirect");
ok(new URL(opt.href, "https://x.test").searchParams.get("url") === fake[target.id][0].url, "redirect carries the mapped page");
ok(!/prf\.hn|stubhub\.com\//.test(opt.href.split("?")[0]), "the option href is never a raw StubHub or Partnerize URL");
const other = cards.find((c) => c.id !== target.id);
ok(christmasStubhubOption(other, day, "s", fake) === null, "an unmapped show gets nothing");
ok(christmasStubhubOption(target, "2026-12-04", "s", fake) === null, "after its night passes, nothing");
ok(christmasStubhubOption(target, day, "s", Object.freeze({ [target.id]: [{ date: day, url: "https://www.stubhub.com/performer/123" }] })) === null, "a performer page (not an event page) is refused");
ok(christmasStubhubOption(target, day, "s", Object.freeze({ [target.id]: [{ date: day, url: "https://evil.io/event/1" }] })) === null, "a non StubHub host is refused");
process.env[KEY] = "";
ok(christmasStubhubOption(target, day, "s", fake) === null, "camref removed: dark again");

delete process.env[KEY]; // this process exits next; nothing is read back from the shell
console.log("test-christmas-stubhub-dark: " + n + " assertions OK (production map has " + Object.keys(CHRISTMAS_STUBHUB).length + " verified shows)");
