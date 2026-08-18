// scripts/check-one-main.mjs — one <main> landmark on the routes that shipped two.
//
// Audit: coupons / best-of / policy rendered two <main>s (layout + page/screen)
// and two H1s. The shared layout already owns the document landmark (id="wf-main").
// Nested page/screen <main>s become a second landmark. Demote those.
// Other article routes still use their own <main> historically; this guard locks
// the audited surfaces rather than rewriting the whole site.
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

let pass = 0;
const fail = (m) => { console.error("check-one-main: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const lay = read("app/layout.js");
ok((lay.match(/<main\b/g) || []).length === 1, "layout owns exactly one <main>");
ok(lay.includes('id="wf-main"'), "the document landmark stays id=wf-main");
ok(!lay.includes("<h1"), "layout still has no H1 — pages own the content H1");

const noNestedMain = [
  "app/editorial-policy/page.js",
  "app/about/page.js",
  "app/how-wayfind-ranks/page.js",
  "app/coupons/page.js",
  "app/events/page.js",
  "app/map/page.js",
  "app/best-of/page.js",
  "app/components/screens/Coupons.js",
  "app/components/RankedExperiencePage.js",
];
for (const rel of noNestedMain) {
  const src = read(rel);
  ok(!/<main\b/.test(src), `${rel} does not declare a second <main>`);
}

for (const rel of ["app/editorial-policy/page.js", "app/about/page.js", "app/how-wayfind-ranks/page.js", "app/coupons/page.js", "app/events/page.js", "app/map/page.js"]) {
  const n = (read(rel).match(/<h1\b/g) || []).length;
  ok(n === 1, `${rel} has exactly one content H1 (found ${n})`);
}

ok((read("app/components/EditorialLandingHero.js").match(/<h1\s/g) || []).length === 1,
  "intent/best-of hero has one H1");
ok(/<h1\b/.test(read("app/components/screens/Events.js")),
  "Events screen has a content H1, not only the global brand H1");
ok(/<h1\b/.test(read("app/components/screens/Coupons.js")),
  "Coupons screen keeps its content H1");

const events = read("app/events/page.js");
const coupons = read("app/coupons/page.js");
const map = read("app/map/page.js");
ok(events.includes('canonical: "https://www.gowayfind.com/events"'), "/events self-canonical stays");
ok(coupons.includes('canonical: "https://www.gowayfind.com/coupons"'), "/coupons self-canonical stays");
ok(map.includes('canonical: "https://www.gowayfind.com/map"'), "/map self-canonical stays");
ok(!/canonical:\s*["']\/["']/.test(events + coupons + map), "events/coupons/map do not canonical to /");

const best = read("app/best-of/page.js");
ok(!/canonical:\s*["']\/["']/.test(best), "best-of does not inherit a forced homepage canonical from this change");

const home = read("app/home.js");
ok(/document\.title = titles\[screen\]/.test(home), "SPA events/coupons/map set route-specific document titles");
ok(home.includes('events: "Events near you · Wayfind"'), "events title is not the homepage title");
ok(home.includes('coupons: "Local coupons & deals · Wayfind"'), "coupons title is not the homepage title");
ok(home.includes('map: "Map · Wayfind"'), "map title is not the homepage title");

console.log(`check-one-main: OK — ${pass} assertions (layout landmark only on audited routes; one content H1; self-canonicals; route titles)`);
