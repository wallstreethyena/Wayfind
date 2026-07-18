// scripts/test-experiences-v3.mjs — locks Experiences v3 (Viator bookable rail,
// table-backed via wf_experiences). Pins the LIVE-VERIFIED taxonomy (2026-07-17),
// the affiliate isolation (never touches Score/ranking, never hand-builds a
// product URL), the fail-soft serve, the guard, and the fail-closed cron. The
// FTC-disclosure + pid-wrapping assertions for the rail UI are in the UI section
// at the bottom (added once app/home.js renders the rail).
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { DESTS, CATEGORIES, CATEGORY_BY_KEY, DISPLAY_CHIPS, SELLING_OUT_KEY, metroToDest, destsWithin, productToRow, rankExperiences, isSellingOut, milesBetween } from "../lib/experiencesData.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = (m) => { console.error("test-experiences-v3: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src) => src.split("\n").filter((l) => { const t = l.trimStart(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); }).join("\n");

// ── 1. Verified taxonomy (pinned to the live 2026-07-17 facts) ───────────────
ok(DESTS.length === 5, "exactly 5 Viator markets (Venice FL/Bradenton/Kissimmee are NOT their own Viator dests)");
for (const id of ["25738", "5403", "22457", "666", "663"]) ok(DESTS.map((d) => d.destId).includes(id), `market dest ${id} present`);
ok(CATEGORIES.length === 11, "11 experience catalogs");
ok(CATEGORY_BY_KEY.kayaking.tag === 12047, "kayaking uses the ground-truthed tag 12047 (13298 returns 0 products)");
ok(CATEGORY_BY_KEY.private.tag === 11938, "private&luxury uses tag 11938");
ok(CATEGORIES.every((c) => Number.isInteger(c.tag) && c.key && c.label && c.icon), "every catalog has key/label/icon/int-tag");

// ── 2. Folds: the 3 non-Viator cities resolve to their parent market ─────────
ok(metroToDest("Venice").destId === "25738", "Venice FL folds into Sarasota 25738");
ok(metroToDest("Bradenton").destId === "25738", "Bradenton folds into Sarasota 25738");
ok(metroToDest("Kissimmee").destId === "663", "Kissimmee folds into Orlando 663");
ok(metroToDest("Sarasota").destId === "25738" && metroToDest("Orlando").destId === "663", "direct metros resolve");
ok(metroToDest("Nowhere") === null, "unknown metro -> null (serve then falls back to all markets)");

// ── 3. productToRow: pure map, passes product_url straight through ───────────
const sample = { productCode: "263521P1", title: "Dolphin Tour", productUrl: "https://www.viator.com/x", images: [{ variants: [{ width: 400, url: "https://img/x.jpg" }] }], reviews: { combinedAverageRating: 5, totalReviews: 40 }, pricing: { summary: { fromPrice: 475 } }, duration: { fixedDurationInMinutes: 120 }, flags: ["LIKELY_TO_SELL_OUT"] };
const row = productToRow(sample, "25738", "Sarasota");
ok(row.product_code === "263521P1", "row keyed by productCode");
ok(row.product_url === sample.productUrl, "product_url passed straight through — never reconstructed");
ok(row.rating === 5 && row.reviews === 40 && row.from_price === 475 && row.duration_min === 120, "numeric fields mapped");
ok(row.selling_out === true, "LIKELY_TO_SELL_OUT -> selling_out true");
ok(productToRow({ title: "no code" }, "25738", "Sarasota") === null, "product without code/url is dropped");
ok(isSellingOut(["LIKELY_TO_SELL_OUT"]) === true && isSellingOut(["FREE_CANCELLATION"]) === false, "isSellingOut gates on the flag only");

// ── 4. rank + distance rungs ────────────────────────────────────────────────
ok(rankExperiences([{ rating: 4, reviews: 10 }, { rating: 5, reviews: 100 }, { rating: 4.5, reviews: 5 }])[0].rating === 5, "rank is rating-first (5-star/100-review wins)");
ok(Math.round(milesBetween({ lat: 27.336, lng: -82.531 }, { lat: 28.538, lng: -81.379 })) > 60, "Sarasota->Orlando > 60mi (rung excludes at 60, includes at 120)");
ok(destsWithin({ lat: 27.336, lng: -82.531 }, 15).length >= 1, "a tight radius still returns the home market (never empty)");
ok(destsWithin({ lat: 27.336, lng: -82.531 }, 120).includes("663"), "120mi radius from Sarasota reaches Orlando");

// ── 5. Chips: All + 11 catalogs + a demand chip (hide-empty is a render step) ─
ok(DISPLAY_CHIPS[0].key === "all", "first chip is All (the default selection)");
ok(DISPLAY_CHIPS.some((c) => c.key === SELLING_OUT_KEY), "a demand ('Selling out') chip exists");
ok(DISPLAY_CHIPS.length === 13, "13 chips = All + 11 + Selling out (owner spec)");

// ── 6. Isolation: Score/ranking never see experiences; no source builds a product URL ──
for (const f of ["lib/score.js", "lib/ranking.js"]) ok(!/experiences/i.test(read(f)), `${f} must not reference experiences (affiliate never reaches Score/placement)`);
for (const f of ["lib/experiencesData.js", "lib/experiencesServe.js", "app/api/cron/experiences/route.js", "app/api/experiences/route.js"]) {
  ok(!/viator\.com\/tours\//.test(codeOnly(read(f))), `${f} contains no literal viator.com/tours/ product URL (URLs are runtime data)`);
}

// ── 7. No server secret in a client-reachable module ────────────────────────
ok(!/VIATOR_API_KEY|SERVICE_ROLE/.test(read("lib/experiencesData.js")), "lib/experiencesData.js (client-reachable) references no server secret");

// ── 8. Fail-soft serve + same-origin guard + fail-closed cron ───────────────
ok(/dark:\s*true/.test(read("lib/experiencesServe.js")), "serve fails soft to { dark: true } (never 500) when the table is absent/empty");
ok(/select=\*/.test(read("lib/experiencesServe.js")), "serve uses select=* (never names a maybe-absent column) so an old table can't 500 it");
ok(read("middleware.js").includes('"/api/experiences"'), "/api/experiences is same-origin guarded in the middleware matcher");
const cron = read("app/api/cron/experiences/route.js");
ok(/CRON_SECRET/.test(cron) && /unauthorized/.test(cron) && /!secret \|\|/.test(cron), "cron is fail-CLOSED (unset CRON_SECRET is never public)");
ok(/on_conflict=product_code/.test(cron) && /merge-duplicates/.test(cron), "cron upserts merge-duplicates on product_code (one row per product)");

// ── 9. UI: FTC disclosure + pid-wrapping on the rail (added with the UI) ─────
const home = read("app/home.js");
if (/experiencesData|EXPERIENCE_RAIL|_expItems/.test(home)) {
  ok(home.includes("at no extra cost to you. It never changes our scores or rankings"), "the experiences rail renders the required FTC commission disclosure (proximate to the earning cards)");
  ok(/viatorDirectUrl\s*\(/.test(home), "experience card hrefs are pid-wrapped via viatorDirectUrl (never the raw product_url)");
  ok(!/VIATOR_API_KEY|SERVICE_ROLE_KEY/.test(home), "no server secret is referenced in the client bundle");
} else {
  console.log("   (experiences rail not yet wired into app/home.js — UI assertions deferred)");
}

console.log(`test-experiences-v3: OK — ${pass} assertions (verified taxonomy, folds, pure map, isolation, fail-soft, guard, fail-closed cron)`);
