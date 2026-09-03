// scripts/check-owned-library-no-rebuy.mjs — THE NO-RE-BUY LAW, locked.
//
// Owner, 2026-09-03: "the whole point was not to re-buy — it was to keep it at
// no cost because we created our own enriched library." The law is written in
// lib/ownedLibrary.js. This guard makes each clause fail loudly if a future
// session (or a helpful refactor) quietly re-opens a re-buy path, ages the
// library out, or drops the owned-signal fill. By CALL wherever the thing can
// be executed; structurally, with an applied-mutation red-prove, where not.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { rankInventory } from "../lib/inventoryServe.js";
import { mergeOwnedSignals, ownedLookupIds, REBUY_PATHS_OFF_IN_FREE_MODE } from "../lib/ownedLibrary.js";

let pass = 0; const fail = [];
const ok = (c, m) => (c ? pass++ : fail.push(m));
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. The library is permanent: age is NOT a serving predicate (by call) ──
const NOW = Date.now();
const row = (id, ageDays, extra = {}) => ({
  place_id: id, name: id, lat: 27.34, lng: -82.53, status: "OPERATIONAL", category: "food",
  refreshed_at: new Date(NOW - ageDays * 86400000).toISOString(),
  signals: { rating: 4.6, reviews: 1200 }, ...extra,
});
const ranked = rankInventory([row("fresh-2d", 2), row("old-400d", 400), row("old-45d", 45)], 27.34, -82.53, 27000, 10);
const ids = ranked.map((r) => r.id || r.place_id);
ok(ids.includes("old-400d") && ids.includes("old-45d") && ids.includes("fresh-2d"),
  `rankInventory serves a 400-day-old owned row exactly like a 2-day-old one — the library never ages out (got ${JSON.stringify(ids)})`);
// Positive control — the serving law still refuses what it must refuse, so the
// assertion above is not "everything passes":
const refused = rankInventory([row("closed", 1, { status: "CLOSED_PERMANENTLY" }), row("unrated", 1, { signals: {} })], 27.34, -82.53, 27000, 10);
ok(refused.length === 0, "control: a closed or unrated row is still refused (age is not the gate; status and rating are)");
const inv = strip(read("lib/inventoryServe.js"));
ok(!/refreshed_at/.test(inv.slice(inv.indexOf("export function rankInventory"), inv.indexOf("export async function serveFromInventory"))),
  "rankInventory's body contains no refreshed_at predicate");

// ── 2. Owned signals fill what the free tier leaves out (by call) ────────
const lean = [
  { id: "ChIJowned1", name: "Owned One" },                       // owned, lean → filled
  { id: "ChIJowned2", name: "Owned Two", rating: 4.1 },          // Google supplied rating → kept
  { id: "ChIJunknown", name: "Not Ours" },                       // not owned → stays lean
  { id: "ChIJclosed", name: "Owned Closed", businessStatus: "OPERATIONAL" },
];
const owned = [
  { place_id: "ChIJowned1", status: "OPERATIONAL", signals: { rating: 4.7, reviews: 812 } },
  { place_id: "ChIJowned2", status: "OPERATIONAL", signals: { rating: 3.2, reviews: 40 } },
  { place_id: "ChIJclosed", status: "CLOSED_TEMPORARILY", signals: { rating: 4.0, reviews: 9 } },
];
const n = mergeOwnedSignals(lean, owned);
ok(lean[0].rating === 4.7 && lean[0].userRatingCount === 812 && lean[0].businessStatus === "OPERATIONAL", "an owned lean place receives our rating, review count and status");
ok(lean[1].rating === 4.1 && lean[1].userRatingCount === 40, "a value Google supplied on this call is never overwritten by the owned one; the missing count is still filled");
ok(lean[2].rating === undefined && lean[2].userRatingCount === undefined, "a place we do not own stays lean — an honest blank, never an invented number");
ok(lean[3].businessStatus === "OPERATIONAL" && lean[3].rating === 4.0, "a status Google supplied is kept; owned rating still fills");
ok(n === 3, `mergeOwnedSignals reports how many places it touched (expected 3, got ${n})`);
ok(mergeOwnedSignals([], owned) === 0 && mergeOwnedSignals(lean, null) === 0, "empty inputs are a no-op, never a throw");
ok(ownedLookupIds([{ id: "ChIJok_1-2" }, { id: "bad id;drop" }, { id: 7 }, null]).join() === "ChIJok_1-2", "only Google-shaped ids reach the PostgREST in.() list");

// ── 3. The search route uses the shared merge on the free-mode paid path ──
const search = strip(read("app/api/places/search/route.js"));
ok(/import \{ mergeOwnedSignals, ownedLookupIds \} from "[^"]*lib\/ownedLibrary";/.test(search)
  && /return mergeOwnedSignals\(places, await r\.json\(\)\);/.test(search)
  && /if \(freeMode && places\.length\) await enrichFromInventory\(places\);/.test(search),
  "the free-mode search buys lean, then fills from the owned library via lib/ownedLibrary.mergeOwnedSignals before caching or serving");
ok(/const rich = await cget\(kRich, \{ staleMs: STALE_MAX_MS \}\);/.test(search)
  && search.indexOf("const rich = await cget(kRich") < search.indexOf('await spendAllow("text_pro")'),
  "the rich v1 cache (fresh or stale within the ToS cap) is read BEFORE the ledger is consulted — zero-spend answers come first");

// ── 4. Scheduled re-buys stay OFF in free mode, on purpose ───────────────
for (const p of REBUY_PATHS_OFF_IN_FREE_MODE) {
  const src = strip(read(p));
  const handler = src.indexOf("export async function GET");
  const gate = src.indexOf("gateFree()", handler);
  const firstFetch = src.indexOf("await fetch(", handler);
  ok(handler >= 0 && gate > handler && (firstFetch < 0 || gate < firstFetch) && /if \(gateShut\(\) \|\| gateFree\(\)\) return/.test(src.slice(handler)),
    `${p}: the handler short-circuits on gateFree() before any fetch — a scheduled re-buy cannot happen in free mode`);
}
ok(REBUY_PATHS_OFF_IN_FREE_MODE.length === 3, "the law names exactly the three re-buy paths (refresh-ahead worker, inventory-refresh, atlas-build)");

// ── 5. Red-proves: each structural clause fails on the sabotage it exists for ─
{ const m = search.replace(/if \(freeMode && places\.length\) await enrichFromInventory\(places\);/, "");
  ok(m !== search && !/await enrichFromInventory\(places\);/.test(m), "red-prove: dropping the owned-signal fill is detected"); }
{ const src = strip(read(REBUY_PATHS_OFF_IN_FREE_MODE[0]));
  const m = src.replace(/if \(gateShut\(\) \|\| gateFree\(\)\) return/, "if (gateShut()) return");
  ok(m !== src && !/if \(gateShut\(\) \|\| gateFree\(\)\) return/.test(m.slice(m.indexOf("export async function GET"))), "red-prove: re-opening the refresh-ahead worker in free mode is detected"); }
{ // by-call red-prove of clause 1: an age predicate WOULD drop the 400-day row
  const aged = (rows) => rows.filter((r) => NOW - Date.parse(r.refreshed_at) < 30 * 86400000);
  const would = rankInventory(aged([row("fresh-2d", 2), row("old-400d", 400)]), 27.34, -82.53, 27000, 10).map((r) => r.id || r.place_id);
  ok(!would.includes("old-400d") && would.includes("fresh-2d"), "red-prove: the by-call assertion is sensitive — an age predicate upstream visibly drops the old row"); }

// ── 6. The law is where a future reader will find it ─────────────────────
const law = read("lib/ownedLibrary.js");
ok(/THE NO-RE-BUY LAW/.test(law) && /Do not "fix" it by letting the\s*\/\/\s*worker take a ledger grant/.test(law) && /terms-of-service question for the owner and counsel/.test(law),
  "lib/ownedLibrary.js carries the law, the do-not-fix warning for the refresh worker, and the ToS caveat");
const claude = read("CLAUDE.md");
ok(/## 🏛️ The owned library never re-buys/.test(claude), "CLAUDE.md carries the section so the next session reads it before touching cache or spend code");

// ── 7. Hermetic: the by-call checks above do not depend on the shell env ──
{ const r = spawnSync(process.execPath, ["--input-type=module", "-e", 'import("./lib/ownedLibrary.js").then((m) => console.log(m.mergeOwnedSignals([{id:"a"}], [{place_id:"a", signals:{rating:4}}])))'], { cwd: new URL("..", import.meta.url), env: {}, encoding: "utf8" });
  ok(r.status === 0 && r.stdout.trim() === "1", "lib/ownedLibrary imports cleanly with an EMPTY environment (no env, no network, no Supabase)"); }

if (fail.length) { console.error("check-owned-library-no-rebuy: FAIL"); for (const m of fail) console.error("  - " + m); process.exit(1); }
console.log(`check-owned-library-no-rebuy: OK — ${pass} assertions; the library never ages out, owned signals fill lean results, the rich cache answers before the ledger, and all three scheduled re-buy paths stay off in free mode`);
