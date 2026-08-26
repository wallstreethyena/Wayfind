#!/usr/bin/env node
/**
 * test-guide-search-as-book — search dests must not paint as Book.
 *
 * Live evidence (2026-08-26), swim-with-manatees-crystal-river:
 *   painted: /api/viator/go?q=Crystal%20River%20manatee%20swim%20tour&…&intent=search
 *   landed:  https://www.viator.com/searchResults/all?text=Crystal%20River%20manatee%20swim%20tour&…
 *
 * bookQuery is a search query, not a product. A Book / Tickets / Viator CTA
 * must NEVER paint when the dest is a search (intent=search, /searchResults,
 * or q= without a product code). Hide the CTA. Do not pin a Crystal River SKU.
 * HOLD-SKU 236862P2 and 22211P1 stay denied. First-commission pin stays
 * Shell Key 173028P1 only.
 *
 * ASSERT ON THE CALL. A grep for "intent=search" would pass the moment the
 * string appeared in a comment. guidePrimaryCta + paintGuideCta +
 * isSearchAsBookHref + a rendered GuideConversion are the paint.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { GUIDES } from "../lib/guides.js";
import { guidePrimaryCta, guideIntent, paintGuideCta } from "../lib/guideCta.js";
import { isSearchAsBookHref, isDeniedViatorSku } from "../lib/viatorDenylist.js";
import { placePartnerPick } from "../lib/placePartnerPicks.js";
import { siteTodayStr } from "../lib/siteTime.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const today = siteTodayStr();
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const CR_SLUG = "swim-with-manatees-crystal-river";
const LIVE_LEAK =
  "/api/viator/go?q=Crystal%20River%20manatee%20swim%20tour&city=Crystal%20River&kind=entertainment&placeId=guide%3ASwim%20with%20the%20manatees%20in%20Kings%20Bay&intent=search";
const SEARCH_RESULTS =
  "https://www.viator.com/searchResults/all?text=Crystal%20River%20manatee%20swim%20tour&pid=P00308545&mcid=42383&medium=link";
const GATORLAND_PRODUCT =
  "https://www.viator.com/tours/Orlando/Gatorland-General-Admission-Ticket/d663-3458ENTRY";
const GATORLAND_GO =
  "/api/viator/go?product=" + encodeURIComponent(GATORLAND_PRODUCT) +
  "&city=Orlando&kind=guide&surface=guide";

// ── 1. The detector, CALLED ──────────────────────────────────────────────
ok(isSearchAsBookHref(LIVE_LEAK) === true,
  "the live Crystal River painted href is search-as-Book");
ok(isSearchAsBookHref(SEARCH_RESULTS) === true,
  "the live Viator searchResults landing is search-as-Book");
ok(isSearchAsBookHref("/api/viator/go?q=Crystal%20River%20manatee%20swim%20tour") === true,
  "q= without a product code is search-as-Book even without intent=");
ok(isSearchAsBookHref(GATORLAND_GO) === false,
  "positive control: a curated product go hop is Book, not search");
ok(isSearchAsBookHref(null) === false && isSearchAsBookHref("") === false,
  "empty href is not search-as-Book — absence is not a dest");
ok(isSearchAsBookHref(LIVE_LEAK) !== isSearchAsBookHref(GATORLAND_GO),
  "PROBE BROKEN: the detector must be capable of both answers");

// ── 2. paintGuideCta, CALLED ─────────────────────────────────────────────
const leakCta = {
  kind: "tour", href: LIVE_LEAK, label: "Find tours in Crystal River",
  sponsored: true, monetized: true, deal: null, place: "Swim with the manatees in Kings Bay", exact: false,
};
const hidden = paintGuideCta(leakCta);
ok(hidden.kind === "none" && hidden.href == null && hidden.monetized === false,
  `paintGuideCta hides the live leak (got kind=${hidden.kind} href=${hidden.href})`);
ok(paintGuideCta({ ...leakCta, exact: true }).kind === "none",
  "intent=search stays hidden even if someone stamps exact:true");
const exactKept = paintGuideCta({
  kind: "tour", href: GATORLAND_GO, label: "See tickets for Gatorland",
  sponsored: true, monetized: true, deal: null, place: "Gatorland", exact: true,
});
ok(exactKept.kind === "tour" && exactKept.href === GATORLAND_GO,
  "paintGuideCta keeps an exact product Book CTA");

// ── 3. Crystal River guide, CALLED ───────────────────────────────────────
const cr = GUIDES[CR_SLUG];
ok(!!cr, `GUIDES[${CR_SLUG}] is loadable`);
ok(guideIntent(cr) === "tour",
  "Crystal River stays tour-intent — bookQuery is still editorial");
ok((cr.picks || []).some((p) => p && p.bookQuery === "Crystal River manatee swim tour"),
  "the leaking bookQuery string still exists as editorial — we hid the paint, we did not delete the pick");
ok(!(cr.picks || []).some((p) => p && p.viatorUrl),
  "Crystal River must not gain a guessed viatorUrl");
ok(!/\b236862P2\b/.test(JSON.stringify(cr)) && !/\b22211P1\b/.test(JSON.stringify(cr)),
  "Crystal River must not gain HOLD-SKU 236862P2 or 22211P1");

const crCta = guidePrimaryCta(cr, today);
ok(crCta.kind !== "tour",
  `Crystal River must not paint a tour Book CTA (got kind=${crCta.kind} href=${crCta.href})`);
ok(!isSearchAsBookHref(crCta.href),
  `Crystal River painted href must not be search-as-Book (got ${crCta.href})`);
ok(!/intent=search/i.test(String(crCta.href || "")),
  "Crystal River href must not carry intent=search");
ok(!/Book|Tickets|Viator|Find tours/i.test(String(crCta.label || "")),
  `Crystal River must not label a hidden dest as Book/Tickets/Viator (got "${crCta.label}")`);

// ── 4. EVERY guide pick / primary CTA ────────────────────────────────────
const slugs = Object.keys(GUIDES);
ok(slugs.includes(CR_SLUG), "positive control: Crystal River is in the registry this loop walks");
let paintedSearch = 0;
for (const slug of slugs) {
  const g = GUIDES[slug];
  const cta = guidePrimaryCta(g, today);
  if (isSearchAsBookHref(cta.href) || (cta.kind === "tour" && !cta.exact)) {
    paintedSearch++;
    fail.push(`${slug}: painted search-as-Book (${cta.kind} exact=${cta.exact} href=${cta.href})`);
  } else {
    pass++;
  }
  for (const p of g.picks || []) {
    if (!p) continue;
    ok(!/\b236862P2\b/.test(JSON.stringify(p)) && !/\b22211P1\b/.test(JSON.stringify(p)),
      `${slug} pick "${p.name}" must not carry HOLD-SKU 236862P2 or 22211P1`);
  }
}
ok(paintedSearch === 0, `search-as-Book must not paint on any guide (got ${paintedSearch})`);

const gator = guidePrimaryCta(GUIDES["gatorland-vs-wild-florida"], today);
ok(gator.kind === "tour" && gator.exact === true && !isSearchAsBookHref(gator.href),
  `positive control: Gatorland still paints an exact product Book CTA (got ${gator.kind} ${gator.href})`);

// ── 5. GuideConversion RENDER — the paint, not the source ────────────────
const convMod = await loadComponent(REPO + "app/guides/[slug]/GuideConversion.js", REPO);
const GuideConversion = convMod.default;
ok(typeof GuideConversion === "function", "GuideConversion has a default export");

const leakHtml = renderToStaticMarkup(createElement(GuideConversion, {
  slug: CR_SLUG, region: "Crystal River", cta: leakCta, next: null, social: null, socialStatus: "no-match",
}));
ok(!/intent=search/i.test(leakHtml),
  "GuideConversion must not paint the live leak href (intent=search)");
ok(!/Crystal%20River%20manatee%20swim%20tour/.test(leakHtml),
  "GuideConversion must not paint the live leak q=");
ok(!/>Find tours in Crystal River/.test(leakHtml) && !/>Book/.test(leakHtml) && !/>Tickets/.test(leakHtml),
  "GuideConversion must not paint a Book/Tickets/Find-tours label for a search dest");
ok(/Nothing to book here/.test(leakHtml),
  "a hidden search dest renders the no-book empty state — hide, do not invent a SKU");

const exactHtml = renderToStaticMarkup(createElement(GuideConversion, {
  slug: "gatorland-vs-wild-florida", region: "Orlando",
  cta: { kind: "tour", href: GATORLAND_GO, label: "See tickets for Gatorland", sponsored: true, monetized: true, deal: null, place: "Gatorland", exact: true },
  next: null, social: null, socialStatus: "no-match",
}));
ok(/See tickets for Gatorland/.test(exactHtml) && /href="\/api\/viator\/go\?product=/.test(exactHtml),
  "positive control: an exact product still paints through GuideConversion");
ok(!/intent=search/.test(exactHtml),
  "the exact Gatorland paint is not a search hop");

// ── 6. HOLD + founder pin stay put ───────────────────────────────────────
ok(isDeniedViatorSku("236862P2") === true && isDeniedViatorSku("22211P1") === true,
  "HOLD-SKU 236862P2 and 22211P1 stay denied");
ok(isDeniedViatorSku("173028P1") === false,
  "Shell Key 173028P1 is not on the HOLD denylist");
const shell = placePartnerPick({ name: "Shell Key Preserve" });
ok(shell && shell.offerId === "173028P1",
  `first-commission pin stays Shell Key 173028P1 only (got ${shell && shell.offerId})`);
ok(!placePartnerPick({ name: "Swim with the manatees in Kings Bay" }),
  "Crystal River manatee pick is not a placePick — we did not invent a CR product");

if (fail.length) {
  console.error("test-guide-search-as-book: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(
  `test-guide-search-as-book: OK — ${pass} assertions (isSearchAsBookHref + paintGuideCta + ` +
  `guidePrimaryCta CALLED on ${slugs.length} guides; Crystal River leak href hidden; ` +
  `GuideConversion RENDERED; Gatorland exact kept; HOLD-SKU 236862P2/22211P1 denied; ` +
  `Shell Key 173028P1 still the founder pin)`
);
