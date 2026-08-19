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
  // v6.71 — the guide page's monetized link moved into the client conversion
  // block (ONE primary CTA per guide, replacing the per-pick link wall), so the
  // rel lives there now. The RULE is unchanged: a monetized link carries
  // rel=sponsored. Follow the component rather than loosening the assertion —
  // deleting it would re-open the FTC gap it was written for.
  //
  // 2026-07-31: the culture page's monetized links made the same move. Its
  // per-item offer link is now app/components/TrackedOfferLink.js and its one
  // primary CTA is app/components/HubConversion.js — both added because
  // /culture/[metro] measured 0.0 engagement events per session while shipping live
  // affiliate CTAs. Assert on the UNION of the plausible hosts rather than one
  // path: a guard pinned to a single file goes GREEN the moment the code leaves
  // it, and green-on-move is the FTC gap, not red-on-move.
  const relHost = name === "guides"
    ? readFileSync(new URL("../app/guides/[slug]/GuideConversion.js", import.meta.url), "utf8")
    : s
      + readFileSync(new URL("../app/components/TrackedOfferLink.js", import.meta.url), "utf8")
      + readFileSync(new URL("../app/components/HubConversion.js", import.meta.url), "utf8");
  const hasRel = relHost.includes('rel="noreferrer sponsored"') || relHost.includes('rel: "noreferrer sponsored"');
  if (!hasRel) fail(name + " monetized links missing sponsored rel");
  if (name === "guides") {
    // ...and it must be CONDITIONAL on the resolver marking the CTA sponsored, so
    // the non-monetized Directions terminal is not falsely tagged as paid.
    //
    // 2026-08-19: earning go-route Book is SAME-TAB (no target=_blank) so a
    // popup block cannot fire the click with no leave. The FTC rule is
    // unchanged — monetized links carry rel=sponsored; Directions must not.
    // Pinning to `cta.sponsored ? { target` went red on the correct shape:
    //   cta.sponsored ? (earningGo ? { rel: "noreferrer sponsored" }
    //                              : { target: "_blank", rel: "noreferrer sponsored" })
    //                 : {}
    // Assert the GATE and the empty false branch, not the inner target.
    // Strip comments first — a raw scan would match the explanatory note
    // and miss an unconditional rel in the code (CLAUDE.md role-vs-substring).
    const guideConv = relHost
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    const relHits = guideConv.match(/rel:\s*"noreferrer sponsored"/g) || [];
    if (!relHits.length) fail("guides monetized links missing sponsored rel");
    const gated = /\{\.\.\.\s*\(\s*cta\.sponsored\s*\?([\s\S]*?):\s*\{\s*\}\s*\)/.exec(guideConv);
    if (!gated) fail("guides sponsored rel is not gated on cta.sponsored");
    const trueBranch = gated[1];
    const trueRels = trueBranch.match(/rel:\s*"noreferrer sponsored"/g) || [];
    if (!trueRels.length) fail("guides sponsored rel is not gated on cta.sponsored");
    if (trueRels.length !== relHits.length) {
      fail("guides sponsored rel is not gated on cta.sponsored");
    }

    // ONE primary CTA: the per-pick book/rates wall must stay gone.
    const code = s.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    if (/experienceGoUrl\(|hotelSearchUrl\(/.test(code)) fail("guides still resolve booking hrefs directly — that is the parallel path bookingResolve replaced");
    if (/Check tours &amp; tickets|Check rates/.test(code)) fail("the per-pick link wall is back");
    if (!/Open in Wayfind/.test(code)) fail("Open in Wayfind must SURVIVE as the non-monetized navigation affordance");
  }
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
// v8.22 (owner, live /guides: "there is nothing on this page that makes it
// easy to go back to the main page"). Both guide templates render OUTSIDE the
// app shell, so each must carry its own visible door home — asserted as a
// rendered anchor (an <a> to "/"), never a bare substring.
{
  const hub = readFileSync(new URL("../app/guides/page.js", import.meta.url), "utf8");
  if (!/<a href="\/"[^>]*>‹ Back to Wayfind<\/a>/.test(hub)) fail("guides hub: missing the rendered back-to-home anchor");
  if (!/<a href="\/"[^>]*>‹ Back to Wayfind<\/a>/.test(g)) fail("guide detail: missing the rendered back-to-home anchor");
  // v8.23 — EITHER FORM COUNTS. The up-link used to be a literal anchor in this
  // file AND a backHref on the hero, which rendered "All guides" twice on every
  // guide page, stacked (owner: "lets get rid of these buttons that dont serve a
  // purpose"). The breadcrumb kept "‹ Back to Wayfind" and the hero chrome kept
  // the hub link, so the anchor this used to grep for now lives in
  // PremiumIntentHero. The property is unchanged: a guide can always reach the
  // hub. Asserting WHERE the markup is written was the mistake.
  if (!/<a href="\/guides"[^>]*>All guides<\/a>/.test(g) && !/backHref="\/guides"/.test(g)) {
    fail("guide detail: missing the up-link to the guides hub (no anchor, and the hero is not given backHref)");
  }
}
console.log("check-guides: OK — Article + Breadcrumb schema, canonicals, related links, disclosure on both templates; numbered titles match their pick counts; both templates carry a visible door back to the app");
