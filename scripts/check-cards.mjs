// Guardrail: the revenue hero cards' contract. Locks the behaviors Gabe has
// had to re-fix repeatedly. Any change that breaks these fails the build.
import { readFileSync } from "fs";
import { shellSrc } from "./lib/shellSrc.mjs";
const s = shellSrc(); // G0: greps the whole home shell (home.js + kit + screens + sheets)
const fail = (m) => { console.error("check-cards: FAIL — " + m); process.exit(1); };

// 1. The five revenue cards exist as a single protected list.
if (!s.includes('const REVENUE_EXP_KEYS = ["family", "entertainment", "stays", "shows", "budget"]')) fail("REVENUE_EXP_KEYS missing or changed");
if (!s.includes("function revenueExpMeta(key, city)")) fail("revenueExpMeta (single source of card copy) missing");

// 2. Card copy must be location-neutral — city is a parameter, never hardcoded.
const metaStart = s.indexOf("function revenueExpMeta");
const metaBlock = s.slice(metaStart, s.indexOf("return M[key]", metaStart));
if (/Orlando|Sarasota|Parrish|Tampa|LEGOLAND|Gatorland|Blue Man/i.test(metaBlock)) fail("revenue card copy hardcodes a market — must stay location-neutral");

// 3. Revenue keys open the themed Best-of style sheet, never the legacy screen.
if (!/REVENUE_EXP_KEYS\.includes\(key\)\) \{ openExpSheet\(key\); return; \}/.test(s)) fail("openExperience no longer routes revenue keys to the themed sheet");
if (!s.includes("function openExpSheet(key)")) fail("openExpSheet missing");

// 4. The sheet keeps its places override and the wide-radius fetch.
if (!s.includes("hookDetail.places || placesForHook(hookDetail, allSrc)")) fail("sheet places override removed");
if (!/hd\.fetchKey/.test(s) || !s.includes("110000")) fail("wide-radius sheet fetch missing");

// 5. The v4.46 null-place crash guard stays.
if (!s.includes("avail.filter((a) => !heroPlace || !a.place || a.place.id !== heroPlace.id)")) fail("null-place guard on restExp removed (v4.46 crash)");
if (!s.includes("if (!a.place) {")) fail("mkHook place-less early return removed");

// 6. The five cards are guaranteed on the home feed.
if (!s.includes('const GUARANTEED = ["family", "entertainment", "stays", "shows", "budget"]')) fail("GUARANTEED home cards list changed");

// 7. Labels follow the user's location everywhere (module-safe helper).
if (!s.includes("function cityFixM(s)")) fail("cityFixM helper missing");
if (!s.includes("CITY_NOW = cityNow;")) fail("city mirror into module scope missing");
if (!s.includes("cityFix(a.e.label)")) fail("cityFix not applied to hero labels");
if (s.includes("{b.icon} {b.label}")) fail("raw badge label render reappeared — must use cityFixM");

// 8. The sort control is ALWAYS visible inside the themed sheet (no hidden
// toggle), and quality-first ("Top rated" = Bayesian blend) is the default
// everywhere the dropdown exists (v4.97 audit rule: rank by quality, not
// raw distance — a 0-review nursery must never outrank a 4.8★ preserve).
if (!s.includes("SortControl sortBy={hkSort}")) fail("sheet filter (SortControl) missing");
if (s.includes("hkFilterOpen")) fail("hidden Filters toggle reappeared — sort control must be always visible");
if (!s.includes('const [hkSort, setHkSort] = useState("rated")')) fail("sheet sort must default to quality-first (rated)");
if (!s.includes('const [sortBy, setSortBy] = useState("rated")')) fail("browse sort must default to quality-first (rated)");

// 9. AI insight meta-commentary can never reach the user.
if (!s.includes("function insightSane(")) fail("insightSane guard missing");
if (!s.includes("const S = (v) => insightSane(v)")) fail("insight render not routed through insightSane");

// 10. v6.15 — the Favorites-heart bug class: EVERY <PlaceCard> must pass the
// `saved` prop so the heart reflects real Favorites membership. A folder card
// that omits it (Saved.js Liked/Shared) renders an empty heart on a saved
// place, and tapping then toggles it OFF ("Removed from Favorites"). The prop
// must also derive from live state (isSaved(...)), never a hardcoded literal.
for (const m of s.matchAll(/<PlaceCard\b[^>]*?\/?>/g)) {
  const tag = m[0];
  if (!/\bsaved[=}]/.test(tag) && !/\bsaved\s/.test(tag)) fail("a <PlaceCard> omits the `saved` prop — the heart won't reflect Favorites (Saved.js folder-card class)");
  if (/\bsaved(\s|\/|>)/.test(tag) && !/saved=/.test(tag)) fail("a <PlaceCard> hardcodes `saved` (always-on) instead of saved={isSaved(p.id)} — derive from live Favorites");
}
console.log("check-cards: OK — revenue cards protected (location copy, sheet style, wide fetch, crash guards, filter, PlaceCard saved-prop)");
