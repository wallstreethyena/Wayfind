// scripts/test-affiliate-chip.mjs — locks the per-card affiliate disclosure
// (spec §2): the right partner is inferred per card, explicit provider tags win,
// unaffiliated cards resolve to null (→ no chip in production), and the chip is
// actually rendered on the browse PlaceCard.
import { readFileSync } from "fs";
import { cardAffiliateProvider } from "../lib/cardAffiliate.js";
import { PROVIDER_LABELS, providerLabel } from "../lib/providerLabels.js";
import { PROVIDERS } from "../lib/commerceProviders.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

// ── provider inference ──
ok(cardAffiliateProvider({ types: ["museum"] }) === "viator", "a ticketed attraction (museum) → Viator");
ok(cardAffiliateProvider({ types: ["aquarium"] }) === "viator", "aquarium → Viator");
ok(cardAffiliateProvider({ types: ["lodging"] }) === "stay22", "a hotel/lodging → Stay22");
ok(cardAffiliateProvider({ category: "hotels" }) === "stay22", "a card categorized 'hotels' → Stay22");
ok(cardAffiliateProvider({ types: ["restaurant"] }) === null, "a restaurant has no affiliate → null (no chip in prod)");
ok(cardAffiliateProvider({ types: ["natural_feature", "tourist_attraction"], category: "beach" }) === null, "a beach is NOT bookable → null (never a Viator chip on free sand)");
ok(cardAffiliateProvider({ affiliate_provider: "klook", types: ["museum"] }) === "klook", "an explicit affiliate_provider tag wins over inference");
ok(cardAffiliateProvider({ provider: "undercover_tourist" }) === "undercover_tourist", "a wf_deals row's provider wins");
ok(cardAffiliateProvider(null) === null, "null place → null (no crash)");

// ── labels ────────────────────────────────────────────────────────────────
// 2026-08-02 — was a source-read of AffiliateChip.js ("the component is JSX so
// it can't be imported here"), which was true while the map lived inside the
// component. It now lives in lib/providerLabels.js precisely so BOTH disclosure
// paths share one list — the chip and dealSheet's "Wayfind earns a commission
// via X" line — so it can be imported and CALLED.
ok(providerLabel("viator") === "Viator", "viator resolves to its display name");
ok(providerLabel("undercover_tourist") === "Undercover Tourist", "undercover_tourist resolves to its display name");
ok(providerLabel("stay22") === "Stay22", "stay22 resolves to its display name");
// Every provider the commerce redirect can reach must be nameable, or a card
// monetized through it renders with no network in its disclosure.
for (const p of Object.keys(PROVIDERS)) {
  ok(PROVIDER_LABELS[p], `redirect provider "${p}" has a display name, so its disclosure can name the network`);
}
ok(providerLabel("not-a-provider") === "not-a-provider", "an unknown key falls back to itself rather than going null (a nameless network would drop the disclosure)");
// The component must still USE the shared map, not shadow it with its own.
const chipSrc = read("app/components/AffiliateChip.js");
ok(/from "\.\.\/\.\.\/lib\/providerLabels"/.test(chipSrc), "the chip reads the shared label map instead of defining a second one");
ok(!/^\s*export const PROVIDER_LABELS = \{/m.test(chipSrc), "the chip does not re-declare its own PROVIDER_LABELS object (two maps drift)");

// ── the chip is wired onto the browse card ──
const home = read("app/home.js");
ok(/import AffiliateChip, \{ AFFILIATE_AUDIT \} from "\.\/components\/AffiliateChip"/.test(home), "home imports the chip + audit flag");
ok(/import \{ cardAffiliateProvider \} from "\.\.\/lib\/cardAffiliate"/.test(home), "home imports the provider resolver");
ok(/cardAffiliateProvider\(p\)/.test(home) && /<AffiliateChip provider=\{_prov\}/.test(home), "PlaceCard renders the disclosure chip");
ok(/_prov \|\| AFFILIATE_AUDIT/.test(home), "an unaffiliated card shows the chip ONLY in owner-audit mode");

// ── chip component honesty ──
const chip = read("app/components/AffiliateChip.js");
ok(/PROVIDER_LABELS\[provider\]/.test(chip), "chip resolves a label from the provider key");
ok(/if \(!AUDIT\) return null/.test(chip), "no-affiliate chip is hidden from real users");

console.log(`test-affiliate-chip: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
