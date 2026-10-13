// scripts/test-detail-open-once.mjs — detail_open fires once per genuine opening.
// Week 10-06..10-13: 47.7% of detail_open fired <2s after a prior one for the same
// session+place, all on /p/{id}: the deep-link effect in app/home.js re-runs when
// supabaseReady flips and calls openDetail() a second time for one opening.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const ok = (c, m) => { if (!c) { console.error("test-detail-open-once: FAIL — " + m); failures++; } };

const { createDetailOpenGate } = await import("../lib/detailOpenGate.js");

// Simulated openDetail(): same gate call + emit as app/home.js.
const mk = () => { const g = createDetailOpenGate(); const ev = []; return { ev, open: (id) => { if (g.shouldEmit(id)) ev.push(id); }, close: () => g.close() }; };

{ const s = mk(); s.open("A"); ok(s.ev.length === 1, "1 open -> exactly 1 event"); }
{ const s = mk(); s.open("A"); s.open("A"); s.open("A"); ok(s.ev.length === 1, "repeat openDetail calls / re-renders while open -> still 1 event"); }
{ const s = mk(); s.open("A"); s.close(); s.open("A"); ok(s.ev.length === 2, "open-close-open same place -> 2 events"); }
{ const s = mk(); s.open("A"); s.open("B"); ok(s.ev.length === 2 && s.ev[1] === "B", "open A then B -> 2 events"); }
{ const s = mk(); s.open("A"); s.open("B"); s.open("A"); ok(s.ev.length === 3, "A,B,A without close -> 3 events (A is a new opening)"); }
{ const s = mk(); s.close(); s.close(); s.open("A"); ok(s.ev.length === 1, "close while closed is harmless"); }
{ const s = mk(); s.open(null); s.open(null); ok(s.ev.length === 1, "missing id still deduped while open"); }

// Wiring: home.js must gate the single detail_open emit and reset the gate on close.
const home = readFileSync(join(ROOT, "app/home.js"), "utf8");
const emits = home.match(/logEvent\("detail_open"/g) || [];
ok(emits.length === 1, "app/home.js has exactly one detail_open emit point (found " + emits.length + ")");
ok(/shouldEmit\(p && p\.id\)\)\s*\{[^]{0,200}logEvent\("detail_open"/.test(home), "detail_open emit is guarded by the open-transition gate");
ok(/if \(!detail\) \{[^}]*detailOpenGateRef\.current\.close\(\)/.test(home), "gate resets when detail closes");
ok(/import \{ createDetailOpenGate \} from "\.\.\/lib\/detailOpenGate\.js"/.test(home), "home.js imports the gate");

if (failures) { console.error("test-detail-open-once: " + failures + " failure(s)"); process.exit(1); }
console.log("test-detail-open-once: OK");
