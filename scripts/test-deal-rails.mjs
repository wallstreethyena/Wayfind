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
  { id: 2, provider: "undercover_tourist", subcategory: "theme_parks", title: "Disney", affiliate_url: "https://anrdoezrs.net/links/101643573/type/dlg/sid/y/https://u/", quality10: 9.4, discount_text: "Discount tickets", badge: "Best seller", image_url: null, gradient: "linear-gradient(1)" },
];
const providers = { undercover_tourist: { label: "Undercover Tourist", disclosure: "Affiliate link…" } };
const rails = buildRails(rows, providers);
ok(rails.length === 2, "one rail per subcategory");
ok(rails[0].subcategory === "theme_parks" && rails[1].subcategory === "seasonal_events", "rails are in the fixed priority order (theme_parks before seasonal_events)");
ok(rails[0].label === "Theme-park tickets", "rail carries a human label");
const disney = rails[0].items[0];
ok(disney.href === rows[1].affiliate_url, "the affiliate link is passed through VERBATIM (never rebuilt)");
ok(disney.href.includes("101643573"), "the rendered link carries our CJ PID");
ok(disney.providerLabel === "Undercover Tourist", "provider display_name resolved for the disclosure chip");
ok(disney.discount === "Discount tickets" && disney.badge === "Best seller", "discount + badge carried through");
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
ok(/function UTDealsRail/.test(home), "UTDealsRail component exists");
ok(/browseCat === "attractions" && <UTDealsRail category="attractions"/.test(home), "UT deal rail rendered on Things-to-do (attractions)");
ok(/browseCat === "hotels" && <UTDealsRail category="stays"/.test(home), "UT hotel rail rendered on Stays");
ok(/href={d\.href}/.test(home) && /rel="noopener sponsored"/.test(home), "rail links render href verbatim with sponsored rel");
ok(/kind: "ut_deal_rail"/.test(home), "outbound clicks are logged as ut_deal_rail");
ok(/import AffiliateChip(?:, \{[^}]*\})? from "\.\/components\/AffiliateChip"/.test(home) && /<AffiliateChip provider={d\.provider}/.test(home), "the disclosure chip is imported and rendered on each deal card");

// ── the chip itself ──
const chip = read("app/components/AffiliateChip.js");
ok(/via \{name\}/.test(chip), "chip shows 'via {partner}'");
ok(/NEXT_PUBLIC_WF_SHOW_AFFILIATE_AUDIT/.test(chip) && /No affiliate/.test(chip), "owner-audit mode surfaces a 'No affiliate' chip");
ok(/if \(!AUDIT\) return null/.test(chip), "in production a null-provider card shows NO chip (never surface a gap to users)");

console.log(`test-deal-rails: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
