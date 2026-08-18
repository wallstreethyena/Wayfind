// scripts/test-deal-rails.mjs — locks the UT deal rails (spec §1/§3) + the
// per-card affiliate disclosure chip (§2): rows are shaped + grouped by
// subcategory in a fixed order, the link is rendered VERBATIM, the rail reads
// server-side (service role, not the anon client), and the chip discloses the
// partner.
import { readFileSync } from "fs";
import { buildRails, SUBCAT_LABEL } from "../lib/dealsData.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

// ── grouping / shaping (pure) ──
const rows = [
  { id: 1, provider: "undercover_tourist", subcategory: "seasonal_events", title: "Halloween", affiliate_url: "https://anrdoezrs.net/links/101643573/type/dlg/sid/x/https://u/", quality10: 8.6 },
  { id: 2, provider: "undercover_tourist", subcategory: "theme_parks", title: "Disney", affiliate_url: "https://anrdoezrs.net/links/101643573/type/dlg/sid/y/https://u/", quality10: 9.4, discount_text: "Discount tickets", badge: "Best seller", image_url: null, photo_ref: "GOOG_REF_123", gradient: "linear-gradient(1)" },
];
const providers = { undercover_tourist: { label: "Undercover Tourist", disclosure: "Affiliate link…" } };
const rails = buildRails(rows, providers);
ok(rails.length === 2, "one rail per subcategory");
ok(rails[0].subcategory === "theme_parks" && rails[1].subcategory === "seasonal_events", "rails are in the fixed priority order (theme_parks before seasonal_events)");
ok(rails[0].label === "Theme-park tickets", "rail carries a human label");
const disney = rails[0].items[0];
// ── TRANSLATED 2026-07-30 (bot-click fix), assertion by assertion ───────────
// The two checks below used to read the RENDERED href. They cannot any more: the
// rail deliberately no longer puts the partner URL in the DOM, because a crawler
// following it was a billable CJ click (~144/day, 0% conversion — the click-fraud
// shape). The PROTECTIONS are unchanged and now assert one layer deeper.
//
//   was: rendered href === row.affiliate_url  ("passed through VERBATIM")
//   now: the rendered href is OUR redirect path carrying the row id, and the
//        SERVER hands back that same affiliate_url verbatim at click time.
//   was: rendered href includes the CJ PID     ("attribution survives")
//   now: the provider REFUSES to redirect a row whose URL lost the PID
//        (track() + requireTracking), which is strictly stronger than a substring
//        check on a string we rendered ourselves.
ok(disney.href === "/api/commerce/go?provider=undercover_tourist&offer=" + rows[1].id + "&surface=deal_rail&content=" + rows[1].id,
  "the rail href is OUR redirect path, keyed to the row id (the partner URL is no longer in crawlable DOM)");
ok(!/anrdoezrs|dpbolvw|tkqlhce|jdoqocy|kqzyfj|emjcd|dotomi|qksrv/.test(disney.href),
  "no CJ domain survives into the rendered item, even though the input row carries one");
{
  const { PROVIDERS } = await import("../lib/commerceProviders.js");
  const ut = PROVIDERS.undercover_tourist;
  ok(ut.table === "wf_deals" && ut.idColumn === "id" && ut.urlColumn === "affiliate_url",
    "the redirect resolves that id back to the SAME wf_deals.affiliate_url — verbatim, just server-side now");
  ok(ut.track(rows[1].affiliate_url) === rows[1].affiliate_url,
    "…and hands it back UNCHANGED (never rebuilt) — the original VERBATIM protection, one layer deeper");
  ok(ut.track("https://www.anrdoezrs.net/links/999/type/dlg/sid/x/https://www.undercovertourist.com/x") === null && ut.requireTracking === true,
    "a row that lost our CJ PID is REFUSED rather than redirected for free — the attribution protection, strengthened");
}
ok(disney.providerLabel === "Undercover Tourist", "provider display_name resolved for the disclosure chip");
ok(disney.discount === "Discount tickets" && disney.badge === "Best seller", "discount + badge carried through");
ok(disney.photoRef === "GOOG_REF_123", "photo_ref carried through (Google photo fallback when no image_url)");
ok(read("app/home.js").includes("/api/photo?ref=${encodeURIComponent(d.photoRef)}"), "the rail renders the Google photo via /api/photo when image_url is absent");
ok(read("lib/dealsData.js").includes("mergePhotoRefs"), "serveDeals merges photo_ref from the base table (the ranked view omits it)");
ok(buildRails([], {}).length === 0 && buildRails(null, null).length === 0, "empty / null input → no rails (renders nothing)");
ok(SUBCAT_LABEL.theme_park_hotels === "Theme-park hotels & packages", "stays rail label present");

// ── serve module is SERVER-side (service role), not the anon client ──
const dd = read("lib/dealsData.js");
ok(/from "\.\/serverCache\.js"/.test(dd) && /sbEnv\(\)/.test(dd), "serveDeals reads via the service role (sbEnv), server-side");
ok(!/from "\.\/supabase\.js"/.test(dd), "does NOT use the anon browser client (avoids the P0 RLS lockdown)");
ok(/wf_deals_ranked/.test(dd) && /dark:\s*true/.test(dd), "reads the gated wf_deals_ranked view; fail-soft dark");

// ── route ──
const route = read("app/api/deals/route.js");
ok(/serveDeals/.test(route) && /runtime = "nodejs"/.test(route), "route delegates to serveDeals, nodejs runtime");
ok(read("middleware.js").includes('"/api/deals"'), "/api/deals is same-origin guarded in middleware");

// ── render (home.js) ──
const home = read("app/home.js");
ok(/function UnifiedBrowseCommerceRail/.test(home), "the mixed-provider browse rail exists");
ok(/browseCat === "attractions" && center && <UnifiedBrowseCommerceRail[^>]*categories=\{\["attractions",\s*"more"\]\}/.test(home), "Things-to-do renders one geo-scoped mixed-provider rail");
// RE-POINTED v8.13.1 (2026-08-18). #790 (owner-account merge) changed the
// Stays mount on purpose, and shipped scripts/test-session-map-parity.mjs to
// pin the NEW shape — but left this line pinning the OLD one, so main could
// not be green under any tree and four consecutive production deploys ERRORed.
// The new invariant, which the repo's own doctrine backs (trust before
// short-term monetization; an off-axis card is a lie): the Stays rail mounts
// only when organic results exist (`view.length > 0` — no affiliate-only
// screen), and carries stays ONLY — the national car-rental "travel" rail was
// a stand-in for empty hotels, which is off-axis for a tab called Stays.
// WHAT THIS LINE STILL PROTECTS, unchanged: Stays renders exactly one
// geo-scoped mixed-provider rail — gated, category-true, never absent from
// the code and never duplicated (check-unified-commerce-rail owns the
// no-duplicates half).
ok(/browseCat === "hotels" && center && view\.length > 0 && <UnifiedBrowseCommerceRail[^>]*categories=\{\["stays"\]\}/.test(home), "Stays renders one geo-scoped mixed-provider rail (organic-gated, stays-only — #790's invariant)");
// TRANSLATED: same anchor, same protection (the link is marked as paid), plus
// nofollow — which is what was missing when crawlers were following it.
ok(/href={d\.href}/.test(home) && /rel="sponsored nofollow noopener"/.test(home),
  "rail links render our href with rel=\"sponsored nofollow\" — sponsored alone shipped, and non-Google crawlers ignore it entirely");
ok(/kind: "unified_browse_rail"/.test(home), "outbound clicks are logged as unified browse-rail commerce");
ok(/via \{card\.merchant\}/.test(home), "each mixed-provider card names its merchant discreetly on the image");

// ── the chip itself ──
const chip = read("app/components/AffiliateChip.js");
ok(/via \{name\}/.test(chip), "chip shows 'via {partner}'");
ok(/NEXT_PUBLIC_WF_SHOW_AFFILIATE_AUDIT/.test(chip) && /No affiliate/.test(chip), "owner-audit mode surfaces a 'No affiliate' chip");
ok(/if \(!AUDIT\) return null/.test(chip), "in production a null-provider card shows NO chip (never surface a gap to users)");

console.log(`test-deal-rails: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
