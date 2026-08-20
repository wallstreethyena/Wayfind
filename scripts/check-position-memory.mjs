#!/usr/bin/env node
/**
 * check-position-memory — the reader never loses their place.
 *
 * Owner, 2026-08-19: "let's say the user click and goes to google maps, when
 * they go back they go back to the start of the page and they have to go
 * through the taxonomy all over again... there is nothing more annoying than
 * losing your place in the site."
 *
 * WHAT MADE THIS SURVIVE SO LONG. v6.08 built the fix and only wired half of
 * it: on detail-open it wrote the list scroll into an in-memory ref AND into
 * sessionStorage("wf_sc_<key>"), and only the ref was ever read. A ref dies
 * with the page, so the mechanism worked for the one case that never leaves —
 * closing the sheet in-session — and did nothing for the case the owner hit.
 * The stored copy sat unread from the day it shipped. Nothing failed; a write
 * with no reader looks exactly like a working feature in a diff.
 *
 * So this guard asserts READERS, not writers. Every persisted key here must be
 * read back somewhere, and the leave-the-page hook must exist — because the
 * whole complaint is about a navigation that never fires a React cleanup.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
const raw = readFileSync(path.join(REPO, "app/home.js"), "utf8");
const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. EVERY WRITE HAS A READER ────────────────────────────────────────────
// The rule the v6.08 bug broke. Derived from the source, so a NEW persisted key
// is held to it automatically rather than needing this list updated.
{
  const written = new Set([...code.matchAll(/sessionStorage\.setItem\(\s*"([a-zA-Z0-9_]+)"/g)].map((m) => m[1]));
  const writtenPrefix = new Set([...code.matchAll(/sessionStorage\.setItem\(\s*"([a-zA-Z0-9_]+)"\s*\+/g)].map((m) => m[1]));
  const read = code.match(/sessionStorage\.getItem\(\s*"?([a-zA-Z0-9_]+)/g) || [];
  const readBlob = read.join("|");
  for (const key of [...written, ...writtenPrefix]) {
    ok(readBlob.includes(key),
       `app/home.js writes sessionStorage "${key}" and never reads it back — that is the v6.08 shape: a write with no reader looks identical to a working feature`);
  }
  ok(written.size + writtenPrefix.size >= 3, `expected several persisted keys, found ${written.size + writtenPrefix.size} — this guard would prove nothing`);
}

// ── 2. THE POSITION IS REMEMBERED, AND IT IS MORE THAN SCROLL ──────────────
// "Night out > Speakeasy, halfway down" is four taps to rebuild. Scroll alone
// would restore a reader to the right pixel of the wrong list.
{
  ok(/sessionStorage\.setItem\("wf_pos"/.test(code), "nothing records where the reader was");
  ok(/sessionStorage\.getItem\("wf_pos"\)/.test(code), "wf_pos is written and never read — the exact bug this file exists for");
  const write = code.slice(code.indexOf('sessionStorage.setItem("wf_pos"'), code.indexOf('sessionStorage.setItem("wf_pos"') + 420);
  for (const field of ["screen", "cat", "browseCat", "sub", "vibe", "top", "ts"]) {
    ok(new RegExp("\\b" + field + "\\b").test(write), `wf_pos does not record "${field}" — the taxonomy IS the position, not just the scroll offset`);
  }
  const read = code.slice(code.indexOf('sessionStorage.getItem("wf_pos")'), code.indexOf('sessionStorage.getItem("wf_pos")') + 900);
  for (const [field, setter] of [["screen", "setScreen"], ["cat", "setCat"], ["browseCat", "setBrowseCat"], ["sub", "setSub"], ["vibe", "setVibe"]]) {
    ok(read.includes(setter), `wf_pos restores no ${field} — it is stored and then thrown away (${setter} is never called)`);
  }
}

// ── 3. IT MUST FIRE ON LEAVING, NOT ON UNMOUNTING ──────────────────────────
// An outbound navigation to Google Maps runs no React cleanup and no unload in
// a bfcache-eligible browser. pagehide is the event that actually fires.
ok(/addEventListener\("pagehide"/.test(code),
   'nothing listens for "pagehide" — an outbound tap to Google Maps runs no React cleanup, so the position is never written for the trip it exists to survive');
ok(/removeEventListener\("pagehide"/.test(code), "the pagehide listener is never removed — every remount would add another");

// ── 4. IT MUST EXPIRE, AND IT MUST NOT BE A PREFERENCE ────────────────────
// "Where I was a moment ago" is not "what I like". localStorage would raise a
// three-day-old tab state on a fresh visit.
{
  const near = code.slice(Math.max(0, code.indexOf('"wf_pos"') - 700), code.indexOf('"wf_pos"') + 1400);
  ok(!/localStorage\.[gs]etItem\("wf_pos"/.test(code), "wf_pos must live in sessionStorage — it is a position, not a preference");
  ok(/Date\.now\(\) - p\.ts >/.test(near), "the stored position never expires — a stale one is worse than none");
  ok(/removeItem\("wf_pos"\)/.test(near), "an expired position is not cleared, so it is re-parsed on every load forever");
}

// ── 5. THE RESTORE MUST OUTLAST THE RESET IT TRIGGERS ─────────────────────
// app/home.js zeroes the scroll on every [cat, sub, vibe, screen, ...] change —
// including the changes the restore itself makes. Re-applying on the same tick
// would be silently undone.
{
  ok(/requestAnimationFrame\(\(\) => \{\s*b = requestAnimationFrame/.test(code)
     || /requestAnimationFrame\([\s\S]{0,120}requestAnimationFrame/.test(code),
     "the position is applied without waiting a frame — the scroll-reset effect on the taxonomy change would undo it");
  ok(/posRestore/.test(code), "no restore handle, so nothing can survive the reset");
}

if (fails.length) {
  console.error(`check-position-memory: FAIL — ${fails.length}/${n}`);
  for (const f of fails) console.error("  · " + f);
  process.exit(1);
}
console.log(`check-position-memory: OK — ${n} assertions; every persisted key has a reader, the position carries the taxonomy and not just a scroll offset, it is written on pagehide, and it expires`);
