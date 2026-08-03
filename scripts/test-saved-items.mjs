// scripts/test-saved-items.mjs — locks Save/Share for experiences + deals
// (spec §5): the helper upserts to wf_saved_items on the unique key, is
// signed-in-gated + fail-soft, and the rails + Saved tab are wired to it.
import { readFileSync } from "fs";
import { saveItem, removeSavedItem, fetchSavedItems } from "../lib/savedItems.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

// ── helper: fail-soft, never throws (supabase is null in this env) ──
ok((await saveItem(null, { item_id: "x", item_type: "deal" })) === false, "saveItem with no userId → false (never throws)");
ok((await saveItem("u", null)) === false, "saveItem with no item → false");
ok((await saveItem("u", { item_type: "deal" })) === false, "saveItem with no item_id → false");
ok(Array.isArray(await fetchSavedItems(null)) && (await fetchSavedItems(null)).length === 0, "fetchSavedItems(null) → []");
ok((await removeSavedItem(null, "deal", "x")) === false, "removeSavedItem with no userId → false");

const sav = read("lib/savedItems.js");
ok(/onConflict:\s*"user_id,item_type,item_id"/.test(sav), "upsert targets the (user_id,item_type,item_id) unique key — idempotent saves");
ok(/from\("wf_saved_items"\)/.test(sav), "writes to wf_saved_items (not saved_places — that's for places)");

// ── home: handler + rails wired ──
const home = read("app/home.js");
ok(/async function saveMonetizedItem\(item\)/.test(home) && /requireAuth\(/.test(home.slice(home.indexOf("saveMonetizedItem"))), "home has a signed-in-gated save handler");
ok(/<UnifiedBrowseCommerceRail[^>]*onSave={saveMonetizedItem}/.test(home), "the mixed-provider rail gets the save handler");
ok(/categories=\{\["attractions",\s*"more"\]\}/.test(home), "the mixed rail includes attraction and discount inventory");
// 2026-08-02 — this required the LITERAL `item_type: "experience"`, which only
// ever existed in BookableExpRail (deleted: zero mount sites). The surviving
// unified rail always passed `item_type: card.kind`, so the assertion was
// green because of a dead component and would have stayed green if the LIVE
// rail's save had been broken. Asserted as a chain now: the save reads the
// card's own kind, and the rail demonstrably produces both kinds — which is
// what "the right item_type" actually means.
ok(/item_type: card\.kind/.test(home), "the mixed rail's save passes the card's own kind as item_type");
ok(/kind: "experience"/.test(home) && /kind: "deal"/.test(home), "the mixed rail builds BOTH experience and deal cards, so card.kind resolves to both saved item types");
ok(/item_type: "deal"/.test(home), "the deal rail's own save still names its item type");
ok(/provider: "viator"/.test(home), "saved experiences carry their provider");

// ── Saved tab reads BOTH stores ──
const saved = read("app/components/screens/Saved.js");
ok(/fetchSavedItems\(user\.id\)/.test(saved), "Saved tab loads wf_saved_items for the user");
ok(/Saved experiences & deals/.test(saved), "Saved tab renders the experiences/deals section (alongside place lists)");
ok(/removeSavedItem\(user\.id/.test(saved), "saved items can be removed");
ok(/PlaceCard /.test(saved), "the place lists (saved_places) still render — both stores coexist");
ok(/className="wf-saved-hero"/.test(saved) && /Keep the places worth remembering/.test(saved), "Saved opens with the premium collection hero and clear user benefit");
ok(/className="wf-saved-list-grid"/.test(saved) && /className="wf-saved-list-card"/.test(saved), "personal lists render as visual collection cards");
ok(/className="wf-saved-activity-grid"/.test(saved) && /Your taste, remembered/.test(saved), "automatic folders are framed as understandable taste memory");
ok(/prefers-reduced-motion:reduce/.test(saved), "Saved premium motion honors reduced-motion preferences");

console.log(`test-saved-items: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
