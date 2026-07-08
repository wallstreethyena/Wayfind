// Gate: execute lib modules the way Next's prerender does, so undefined
// identifiers and runtime errors fail HERE, not on Vercel. Copies libs to a
// temp dir as .mjs (repo package.json has no "type": "module") and calls
// every export that guide/culture prerendering calls.
import { mkdtempSync, copyFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "wf-libs-"));
for (const f of ["affiliates", "culture", "guides", "site", "tags"]) {
  copyFileSync(`lib/${f}.js`, join(tmp, `${f}.mjs`));
}
const aff = await import(join(tmp, "affiliates.mjs"));
const { CULTURE, CAT_NOTES, TOWN_NOTES } = await import(join(tmp, "culture.mjs"));
const { GUIDES } = await import(join(tmp, "guides.mjs"));
await import(join(tmp, "site.mjs"));
await import(join(tmp, "tags.mjs"));

let calls = 0;
const tryCall = (fn, ...args) => { if (typeof fn === "function") { fn(...args); calls++; } };
tryCall(aff.experienceSearchUrl, "airboat tour", "Orlando");
tryCall(aff.hotelSearchUrl, "Contemporary Resort Orlando");
tryCall(aff.viatorDirectUrl, "https://www.viator.com/tours/Orlando/x/d663-1");
tryCall(aff.experienceGoUrl, "airboat tour", "Orlando");
tryCall(aff.hotelUrl, { name: "Test Hotel", types: ["lodging"], address: "Orlando" });

// walk every culture + guide item through the same link builders prerender uses
for (const [metro, c] of Object.entries(CULTURE)) {
  for (const x of c.do || []) {
    if (x.viatorUrl) tryCall(aff.viatorDirectUrl, x.viatorUrl);
    if (x.query) tryCall(aff.experienceSearchUrl, x.query, c.title);
  }
  if (!Array.isArray(c.eat) || !Array.isArray(c.say)) throw new Error(`culture ${metro} shape`);
}
for (const [m, cats] of Object.entries(CAT_NOTES || {})) {
  for (const [k, n] of Object.entries(cats)) {
    if (!n.line) throw new Error(`catNotes ${m}.${k} missing line`);
    for (const x of n.items || []) { if (x.viatorUrl) tryCall(aff.viatorDirectUrl, x.viatorUrl); if (x.query) tryCall(aff.experienceSearchUrl, x.query, m); }
  }
}
for (const [t, cats] of Object.entries(TOWN_NOTES || {})) {
  for (const [k, n] of Object.entries(cats)) {
    if (!n.line) throw new Error(`townNotes ${t}.${k} missing line`);
    for (const x of n.items || []) { if (x.viatorUrl) tryCall(aff.viatorDirectUrl, x.viatorUrl); if (x.query) tryCall(aff.experienceSearchUrl, x.query, t); }
  }
}
for (const [slug, g] of Object.entries(GUIDES)) {
  for (const p of g.picks || []) {
    if (p.viatorUrl) tryCall(aff.viatorDirectUrl, p.viatorUrl);
    if (p.bookQuery) tryCall(aff.experienceSearchUrl, p.bookQuery, g.region || "Orlando");
    if (p.hotel) tryCall(aff.hotelSearchUrl, p.name);
  }
  if (!g.title || !g.description) throw new Error(`guide ${slug} missing metadata`);
}
console.log(`check-libs: OK — ${calls} link-builder calls executed, ${Object.keys(CULTURE).length} metros, ${Object.keys(GUIDES).length} guides`);
