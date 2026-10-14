#!/usr/bin/env node
// scripts/test-photo-inventory-audit.mjs — hermetic test of the PURE functions behind
// scripts/photo-inventory-audit.mjs (classification + counts over a fixture).
// No network, no Supabase, no Google. Has positive AND negative controls.
import { readFileSync } from "node:fs";
import {
  hasRef, isMalformedRef, isPublished, classifyInventory, histogram, classifyOutcome, summarizeOutcomes,
  guideRungs, guideHeroCoverage, blogPhotoResolution, eventImageKinds, imageSignals, hasDesignedFallback,
  surfaceAudit, compareFlat, headline,
} from "./lib/photoInventoryAudit.mjs";
import { guideCardPhoto } from "../lib/guideCardPhoto.js";

let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

const GOOD = "places/ChIJabc_123/photos/AeJ-xyz_9";
const inv = [
  { place_id: "p1", photo_ref: GOOD, excluded: false, status: "OPERATIONAL" },           // ref
  { place_id: "p2", photo_ref: "https://evil/x.jpg", excluded: null, status: "OPERATIONAL" }, // malformed
  { place_id: "p3", photo_ref: "", excluded: false, status: "OPERATIONAL" },             // no ref, owned
  { place_id: "p4", photo_ref: null, excluded: false, status: "OPERATIONAL" },           // hard gap
  { place_id: "p5", photo_ref: "   ", excluded: false, status: "OPERATIONAL" },          // whitespace = no ref, hard gap
  { place_id: "p6", photo_ref: GOOD, excluded: true, status: "OPERATIONAL" },            // excluded: not published
  { place_id: "p7", photo_ref: GOOD, excluded: false, status: "CLOSED_PERMANENTLY" },    // closed: not published
  { place_id: "p8", photo_ref: "places/a/photos/b/c", excluded: false, status: "OPERATIONAL" }, // malformed (extra segment)
];
const c = classifyInventory(inv, new Set(["p3", "p1", "p6"]));
eq(c.published, 6, "published count");
eq(c.has_ref, 3, "has_ref");
eq(c.no_ref, 3, "no_ref");
eq(c.malformed_ref, 2, "malformed_ref");
eq(c.has_active_owned_photo, 2, "owned among published (p6 excluded does not count)");
eq(c.hard_gap, 2, "hard gap");
eq(c.hard_gap_ids, ["p4", "p5"], "hard gap ids");
eq(c.has_ref + c.no_ref, c.published, "has_ref + no_ref = published");
// negative controls
ok(!isPublished({ excluded: true, status: "OPERATIONAL" }), "excluded is not published");
ok(!isPublished({ excluded: false, status: "CLOSED_TEMPORARILY" }), "non-OPERATIONAL is not published");
ok(!isPublished(null), "null row is not published");
ok(isPublished({ excluded: null, status: "OPERATIONAL" }), "excluded null counts as not excluded (coalesce)");
ok(hasRef(GOOD) && !hasRef("") && !hasRef(null) && !hasRef(" "), "hasRef");
ok(!isMalformedRef(GOOD), "well-formed ref is not malformed");
ok(!isMalformedRef(""), "empty ref is no_ref, not malformed");
ok(isMalformedRef("places/x/photos/"), "empty photo segment is malformed");
eq(classifyInventory([], new Set()).published, 0, "empty inventory");
eq(histogram([{ s: "b" }, { s: "a" }, { s: "b" }], (r) => r.s), { a: 1, b: 2 }, "histogram");

// outcomes
const cases = {
  ok: "ok", "fresh-nophoto": "genuine-no-photo", unowned: "genuine-no-photo", "stale-heal-nophoto": "genuine-no-photo",
  "ledger-denied": "operational", "quota-open": "operational", "fresh-failed:quota": "operational", "owned-miss": "operational",
  network: "operational", client: "operational", "denied-ceiling:950": "operational", "key-denied": "operational",
  "preview:ledger-denied": "nonprod", "dev:ok": "nonprod", "never-seen-class": "other", "": "other",
};
for (const [k, v] of Object.entries(cases)) eq(classifyOutcome(k), v, `outcome ${JSON.stringify(k)}`);
const so = summarizeOutcomes([{ class: "ok", n: 10 }, { class: "ledger-denied", n: "5" }, { class: "unowned", n: 2 }, { class: "dev:ok", n: 1 }, { class: "zzz", n: 3 }]);
eq([so.ok, so.operational, so["genuine-no-photo"], so.nonprod, so.other, so.total], [10, 5, 2, 1, 3, 21], "outcome summary");

// guides (uses the REAL guideCardPhoto with an injected index)
const idx = {
  a: { hero: { src: "/h.webp", kind: "documentary" } },
  b: { hero: { src: "/i.webp", kind: "illustrative" }, pick: { src: "/p.webp" } },
  c: { hero: { src: "/i2.webp", kind: "illustrative" } },
};
const guides = { a: {}, b: {}, c: {}, d: {}, e: { placeIds: ["ChIJabcdefghijklmnop"] } };
const gr = guideRungs(guides, (g) => guideCardPhoto(g, null, idx));
eq(gr.counts, { hero: 1, pick: 1, "illustrative-hero": 1, place: 1, monogram: 1 }, "guide rungs");
eq(gr.monogramSlugs, ["d"], "monogram slug is the no-real-image guide");
eq(gr.noRealCardImage, 1, "noRealCardImage");
const gh = guideHeroCoverage({ a: 1, d: 1, x: 1 }, (s) => (s === "a" ? { src: "/a.webp", kind: "documentary" } : s === "x" ? { kind: "unavailable", src: null } : null));
eq([gh.withHero, gh.withoutHero, gh.withoutHeroSlugs], [1, 2, ["d", "x"]], "hero coverage");

// blogs
const res = { ids: new Map([["p1", { name: "A" }], ["p3", { name: "B" }], ["p4", { name: "C" }]]), stats: { picks: 5, resolved: 3, ambiguous: 1, notInInventory: 1, distinct: 3 } };
const br = blogPhotoResolution(res, (id) => ({ p1: GOOD })[id], new Set(["p3"]));
eq([br.resolvableVenues, br.unresolvableVenues, br.unresolvable[0].place_id, br.ambiguous], [2, 1, "p4", 1], "blog resolution");

// events
eq(eventImageKinds([{ hero_image_kind: "event", hero_image: "x" }, { hero_image: "y" }, { hero_image: "" }, { hero_image_kind: "venue" }]), { "(no image)": 1, "(unclassified)": 1, event: 1, venue: 1 }, "event kinds");

// static surfaces
const SRC_IMG = `export default function X(){ return <img src="/a.jpg" alt=""/>; }`;
const SRC_FB = `import FallbackImg from "./FallbackImg.js"; export default function Y(){ return <FallbackImg src="/a"/>; }`;
const SRC_COMMENT = `// uses <img> and FallbackImg in a comment only\nexport default function Z(){ return <div/>; }`;
const SRC_OK = `export default function R(){ return <RailCard/>; }`;
eq(imageSignals(SRC_IMG), ["<img"], "img signal");
eq(imageSignals(SRC_FB), ["FallbackImg"], "FallbackImg signal");
eq(imageSignals(SRC_COMMENT), [], "comment-only mention is not a signal (negative control)");
ok(hasDesignedFallback(SRC_FB) && !hasDesignedFallback(SRC_IMG), "fallback heuristic");
const sa = surfaceAudit(
  [{ rel: "app/a.js", src: SRC_IMG }, { rel: "app/b.js", src: SRC_FB }, { rel: "app/c.js", src: SRC_COMMENT }, { rel: "app/d.js", src: SRC_IMG }],
  new Set(["app/b.js"])
);
eq(sa.rendering, 3, "rendering files");
eq(sa.blindSpots.map((r) => r.rel), ["app/a.js", "app/d.js"], "blind spots = rendering and unregistered");
eq(sa.noFallback.length, 2, "files with no fallback");
eq(surfaceAudit([{ rel: "app/b.js", src: SRC_FB }], new Set(["app/b.js"])).blindSpots.length, 0, "registered file is not a blind spot (negative control)");

// compare + headline
eq(compareFlat({ a: 5, b: 2 }, { a: 3 }), { a: { cur: 5, prev: 3, delta: 2 }, b: { cur: 2, prev: null, delta: null } }, "compare");
const h = headline({ inventory: c, outcomes14d: so, guides: { rungs: gr, hero: gh }, blogs: { posts: 1, resolvableVenues: 2, unresolvableVenues: 1 }, surfaces: sa });
ok(h["inventory.hard_gap"] === 2 && h["guides.no_real_card_image"] === 1 && h["surfaces.blind_spots"] === 2 && h["outcomes14d.total"] === 21, "headline keys");

// zero-spend static lock on the tool itself (code only, comments stripped)
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
  const tool = strip(readFileSync(new URL("./photo-inventory-audit.mjs", import.meta.url), "utf8"));
  ok(!/spendGate/.test(tool), "tool must never import lib/spendGate.js");
  ok(!/googleapis|places\.googleapis|maps\.googleapis/.test(tool), "tool must never call Google");
  ok(!/\/api\/photo/.test(tool), "tool must never request /api/photo");
  ok(!/method\s*:\s*["'](POST|PUT|PATCH|DELETE)/i.test(tool), "tool must be GET only");
  const sql = strip(readFileSync(new URL("../supabase/sql/photo_audit.sql", import.meta.url), "utf8").replace(/^--.*$/gm, ""));
  ok(!/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(sql.replace(/'[^']*'/g, "")), "photo_audit.sql must be SELECT-only");
  ok(/\bselect\b/i.test(sql), "photo_audit.sql positive control: contains SELECTs");
  const doc = readFileSync(new URL("../docs/PHOTO_AUDIT.md", import.meta.url), "utf8");
  ok(doc.includes(readFileSync(new URL("../supabase/sql/photo_audit.sql", import.meta.url), "utf8")), "docs/PHOTO_AUDIT.md must contain supabase/sql/photo_audit.sql verbatim");
}

if (fails.length) { console.error(`test-photo-inventory-audit: ${fails.length} FAILED\n- ` + fails.join("\n- ")); process.exit(1); }
console.log(`test-photo-inventory-audit: ${pass} assertions passed`);
