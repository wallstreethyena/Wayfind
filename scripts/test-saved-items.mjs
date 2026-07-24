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
ok(/<BookableExpRail[^>]*onSave={saveMonetizedItem}/.test(home), "the Viator experience rail gets the save handler");
ok(/<UTDealsRail category="attractions" onSave={saveMonetizedItem}/.test(home), "the UT deal rail gets the save handler");
ok(/item_type: "experience"/.test(home) && /item_type: "deal"/.test(home), "experience + deal cards call onSave with the right item_type");
ok(/provider: "viator"/.test(home), "saved experiences carry their provider");

// ── Saved tab reads BOTH stores ──
const saved = read("app/components/screens/Saved.js");
ok(/fetchSavedItems\(user\.id\)/.test(saved), "Saved tab loads wf_saved_items for the user");
ok(/Saved experiences & deals/.test(saved), "Saved tab renders the experiences/deals section (alongside place lists)");
ok(/removeSavedItem\(user\.id/.test(saved), "saved items can be removed");
ok(/PlaceCard /.test(saved), "the place lists (saved_places) still render — both stores coexist");

console.log(`test-saved-items: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
