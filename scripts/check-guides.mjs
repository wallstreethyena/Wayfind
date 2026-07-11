// Guardrail: the SEO-page contract. Guides and culture pages must carry full
// schema, related internal links, and disclosure near monetized CTAs.
import { readFileSync } from "fs";
const fail = (m) => { console.error("check-guides: FAIL — " + m); process.exit(1); };
const g = readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8");
const c = readFileSync(new URL("../app/culture/[metro]/page.js", import.meta.url), "utf8");
for (const [name, s] of [["guides", g], ["culture", c]]) {
  if (!s.includes('"@type": "Article"')) fail(name + " missing Article schema");
  if (!s.includes('"@type": "BreadcrumbList"')) fail(name + " missing Breadcrumb schema");
  if (!s.includes("alternates: { canonical:")) fail(name + " missing canonical");
  if (!s.includes("may earn a commission")) fail(name + " missing affiliate disclosure");
  if (!s.includes('rel="noreferrer sponsored"')) fail(name + " monetized links missing sponsored rel");
}
if (!g.includes("More Wayfind guides")) fail("guides missing related-guides section");
if (!c.includes("More cities:")) fail("culture missing related-cities links");
const gl = readFileSync(new URL("../lib/guides.js", import.meta.url), "utf8");
if ((gl.match(/appQuery:/g) || []).length < 7) fail("heading-style picks missing appQuery place mappings");
if (!g.includes("pick.appQuery || pick.name")) fail("guide template not using appQuery for app links");
if (!g.includes("pick.appQuery !== null")) fail("non-place picks must hide the app button");
// v5.36 gate: a numbered title is a promise. Any guide whose title starts
// with a count must deliver exactly that many picks — the July 2026 audit
// found "10 Best…" shipping 6. (\d{1,2} so a year like "2026 Guide" can
// never be misread as a count.)
const { GUIDES } = await import(new URL("../lib/guides.js", import.meta.url));
for (const [slug, guide] of Object.entries(GUIDES)) {
  const m = /^(\d{1,2})\s/.exec(guide.title || "");
  if (!m) continue;
  const promised = Number(m[1]);
  const delivered = (guide.picks || []).length;
  if (promised !== delivered) fail(`${slug}: title promises ${promised} items, delivers ${delivered}`);
}
console.log("check-guides: OK — Article + Breadcrumb schema, canonicals, related links, disclosure on both templates; numbered titles match their pick counts");
