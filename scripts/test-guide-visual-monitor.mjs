#!/usr/bin/env node
// test-guide-visual-monitor — the scheduled visual monitor's sorting, executed
// on fixed HTML (hermetic: no network). A monitor that mislabels a broken
// photo as "backlog" never pages, which is the exact silence it exists to end.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGuidePicks, parseBlogItems, classify } from "../lib/guideVisualMonitor.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

const guideHtml = `
<section id="pick-1" class="wf-guide-pick"><h2><a href="/p/x">Siesta Beach</a></h2><figure><img src="/guides/picks/a.webp" alt=""><figcaption>Photo: Someone · CC BY 4.0</figcaption></figure></section>
<section id="pick-2" class="wf-guide-pick"><h2>Coquina Beach</h2><p>text</p></section>
<section id="pick-3" class="wf-guide-pick"><h2>Kaya</h2><span data-guide-live-photo="pending" aria-hidden="true"></span></section>
<section id="pick-4" class="wf-guide-pick"><h2>Uncredited</h2><img src="https://x/y.jpg"></section>
<section id="pick-5" class="wf-guide-pick"><h2>Coquina Beach</h2><figure><img src="/guides/context/beach.webp" alt="Gulf beach; contextual photograph, not a photograph of Coquina Beach"><figcaption><span>Illustrative beach photo.</span> Photo: Someone · CC BY 4.0</figcaption></figure></section>`;
const g = parseGuidePicks(guideHtml);
ok(g.length === 5 && g[0].name === "Siesta Beach" && g[0].imgs[0] === "/guides/picks/a.webp" && g[0].credited, "server photo + credit parsed");
ok(g[1].imgs.length === 0 && !g[1].live, "text-only pick parsed");
ok(g[2].live, "live rung marker parsed");
ok(g[3].imgs.length === 1 && !g[3].credited, "uncredited image parsed");
ok(g[4].illustrative && !g[0].illustrative, "labelled context photo parsed apart from an exact-place photo");

const blogHtml = `<section class="list-item"><h2 id="a"><span class="num">1.</span>Bo's Ice Cream</h2><figure class="item-photo"><img src="https://lh3/x"><figcaption><span class="credit">Photo: A</span></figcaption></figure></section>
<section class="list-item"><h2 id="b"><span class="num">2.</span>Oscura</h2><span data-live-photo="pending"></span></section>`;
const b = parseBlogItems(blogHtml);
ok(b.length === 2 && b[0].name === "Bo's Ice Cream" && b[0].credited && b[1].live, "blog items parsed");

// The owner's three states.
ok(classify({ imgs: ["/a"], credited: true, imgOk: true })[0] === "A", "loading, credited photo = A");
ok(classify({ imgs: ["/a"], credited: true, imgOk: true, illustrative: true })[0] === "A-context", "labelled topic photo = A-context, counted apart from A");
ok(classify({ imgs: ["/a"], credited: false, imgOk: true, illustrative: true })[0] === "B", "context photo without its credit = B");
ok(classify({ imgs: ["/a"], credited: true, imgOk: false })[0] === "B", "photo that stops loading = B (engineering)");
ok(classify({ imgs: ["/a"], credited: false, imgOk: true })[0] === "B", "photo without its credit = B");
ok(classify({ imgs: [], live: false, expectPhoto: true })[0] === "B", "code has a photo, page shows none = B (the Coquina case)");
ok(classify({ imgs: [], live: true, hasGoogleRef: true })[0] === "A-live", "live credited rung = A-live");
ok(classify({ imgs: [], live: true, hasGoogleRef: false })[0] === "C", "Google has no photo = C backlog, never a page");
ok(classify({ imgs: [], live: false, expectPhoto: false, documented: true })[0] === "C", "documented exception = C");

// The monitor can never spend: it must not call the photo endpoint at all.
const src = readFileSync(new URL("./guide-visual-monitor.mjs", import.meta.url), "utf8");
ok(!/\/api\/photo/.test(src.replace(/^\s*\/\/.*$|^\s*\*.*$/gm, "")), "monitor code never requests /api/photo");
ok(/succeeded:\s*bad \? 0/.test(src), "an engineering failure zeroes succeeded so job-watch escalates");

console.log(`test-guide-visual-monitor: OK — ${n} assertions`);
