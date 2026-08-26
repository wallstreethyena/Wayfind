#!/usr/bin/env node
/**
 * qa-verified-ingest-2026-08-26 — the acceptance tests for the 2026-08-26
 * verified-location batch, EXECUTED against the live database and the live
 * site (never against the ingest script's own intentions).
 *
 * One-shot verification, not a permanent guard: it needs the service key and
 * live production, so it stays out of scripts/guards.txt by design (guards
 * must be hermetic — check-guard-hermeticity). Run it after
 * ingest-verified-2026-08-26.mjs --commit.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SVC = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const H = { apikey: SVC, Authorization: `Bearer ${SVC}` };
const SITE = "https://www.gowayfind.com";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log("  ✓ " + m)) : (fail++, console.log("  ✗ FAIL: " + m)); };
const rows = async (table, filter) => fetch(`${URL_}/rest/v1/${table}?${filter}`, { headers: H }).then((r) => r.json());
const miles = (a, b) => { const dx = (a.lng - b.lng) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180), dy = a.lat - b.lat; return Math.sqrt(dx * dx + dy * dy) * 69; };

// The six approved places, their canonical city centers, and the first words
// of each attached editorial (asserting the RIGHT editorial sits on the RIGHT
// physical entity — acceptance #9).
const PLACES = [
  { name: "Johnny Cubano", like: "Johnny%20Cubano*", city: { lat: 30.2549, lng: -81.5225, label: "Gate Pkwy, Jacksonville" }, edStart: "Johnny Cubano is a strong pick" },
  { name: "AVA MediterrAegean", like: "AVA%20Mediterr*", city: { lat: 28.5977, lng: -81.3510, label: "Winter Park" }, edStart: "AVA MediterrAegean turns dinner" },
  { name: "Sesame Bakery", like: "Sesame%20Bakery*", city: { lat: 25.9096, lng: -80.1499, label: "Sole Mia, North Miami" }, edStart: "Sesame Bakery is where" },
  { name: "Lady and the Mug", like: "Lady%20and%20the%20Mug*", city: { lat: 27.9420, lng: -82.4696, label: "Tampa" }, edStart: "Lady & The Mug is a Tampa coffee stop" },
  { name: "Café Rialto", like: "*Rialto*", metroEq: "tampa", city: { lat: 27.9600, lng: -82.4590, label: "Tampa Heights" }, edStart: "Café Rialto gives Tampa coffee drinkers" },
  { name: "Sus Hi Eatstation", like: "Sus%20Hi*", city: { lat: 28.0547, lng: -82.4383, label: "E Fowler Ave, Tampa" }, edStart: "Sus Hi Eatstation is built" },
];

console.log("— places —");
for (const p of PLACES) {
  const f = `name=ilike.${p.like}&select=place_id,name,lat,lng,metro,category,editorial,last_verified_at,source,signals,status` + (p.metroEq ? `&metro=eq.${p.metroEq}` : "");
  const r = await rows("wf_inventory", f);
  ok(Array.isArray(r) && r.length === 1, `${p.name}: exactly ONE canonical row (got ${Array.isArray(r) ? r.length : "error"})` + (p.name === "Café Rialto" ? " — the commented-twice dedupe requirement" : ""));
  const row = r && r[0];
  if (!row) continue;
  ok(row.lat != null && row.lng != null, `${p.name}: verified coordinates present`);
  const d = row.lat != null ? miles(row, p.city) : 999;
  ok(d < 25, `${p.name}: coordinates resolve to the claimed area (${d.toFixed(1)} mi from ${p.city.label})`);
  ok(typeof row.editorial === "string" && row.editorial.startsWith(p.edStart), `${p.name}: the SUPPLIED editorial sits on THIS entity`);
  ok(row.source === "owner-verified" && !!row.last_verified_at, `${p.name}: provenance (source=owner-verified) + verification timestamp stored`);
  ok(row.signals && typeof row.signals.rating === "number" && row.signals.rating > 0, `${p.name}: rating signal present — the card law can render it`);
  // The wf_place_ids allowlist row — the gate the canonical page checks. Missing
  // index row = 404 with a perfect inventory row (the first QA run's exact failure).
  const idxRow = await rows("wf_place_ids", `place_id=eq.${encodeURIComponent(row.place_id)}&select=place_id`);
  ok(Array.isArray(idxRow) && idxRow.length === 1, `${p.name}: wf_place_ids index row present (the /places gate)`);
  // The canonical Wayfind place route serves this entity (acceptance #1/#7).
  // /places/[id] is the indexable per-place page, gated by the wf_place_ids
  // allowlist (app/places/[id]/page.js) — NOT /p/[id], which is the share shell
  // whose title comes from the ?t= query param, so its body proves nothing.
  const page = await fetch(`${SITE}/places/${encodeURIComponent(row.place_id)}`, { redirect: "follow" }).then((x) => x.ok ? x.text() : null).catch(() => null);
  const nameCore = row.name.split(/[^A-Za-z0-9 ]/)[0].trim().slice(0, 18);
  ok(!!page && page.includes(nameCore.slice(0, 12)), `${p.name}: /places/${row.place_id.slice(0, 10)}… serves the canonical page (body names the place)`);
}

console.log("— multi-branch + holds —");
{
  const cil = await rows("wf_inventory", "name=ilike.*Cilantrillo*&select=name,editorial");
  ok(cil.length === 1, `El Cilantrillo: still exactly the pre-existing Florida Mall row (${cil.length}) — no branch was guessed`);
  ok(!cil.some((r) => String(r.editorial || "").includes("Central Florida destination for Puerto Rican food")), "El Cilantrillo: the held editorial is NOT attached anywhere (BRANCH_UNRESOLVED)");
  const garden = await rows("wf_inventory", "name=ilike.*Garden%20Brunch*&select=place_id");
  ok(garden.length === 0, "The Garden Brunch Café (Barcelona) has NOT leaked into inventory");
  const smackd = await rows("wf_inventory", "name=ilike.*Smack*&select=place_id,name");
  ok(smackd.length === 0, "Smack'd Goods has no fabricated storefront row");
}

console.log("— events —");
{
  const hhn = (await rows("wf_events", "event_id=eq.hhn-orlando-2026&select=start_date,end_date,editorial_summary,place_id,last_verified_at"))[0];
  ok(!!hhn && hhn.start_date === "2026-08-28" && hhn.end_date === "2026-11-01", "HHN35: verified dates Aug 28 → Nov 1, 2026 (expiry law: displayable() retires it past end_date)");
  ok(!!hhn && String(hhn.editorial_summary || "").startsWith("Halloween Horror Nights 35 is one of Orlando"), "HHN35: supplied editorial attached to the EXISTING canonical event (no duplicate created)");
  const hhnCount = await rows("wf_events", "event_name=ilike.*Halloween%20Horror%20Nights*&year=eq.2026&select=event_id");
  ok(hhnCount.length === 1, `HHN: exactly one 2026 event row (${hhnCount.length})`);
  const ss = (await rows("wf_events", "event_id=eq.sideshow-obscura-hhn35-2026&select=start_date,end_date,place_id,verify_note,editorial_summary"))[0];
  ok(!!ss && ss.start_date === "2026-08-26", "Sideshow Obscura: created with the verified Aug 26 opening");
  ok(!!ss && ss.end_date === null && /no published end date/i.test(ss.verify_note || ""), "Sideshow Obscura: NO fabricated end date; verify_note records why");
  ok(!!ss && !!hhn && ss.place_id === hhn.place_id, "Sideshow Obscura: same canonical Universal Studios Florida venue as HHN (one entity, homepage and map agree)");
}

console.log(`\nqa-verified-ingest: ${fail ? "FAIL" : "OK"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
