#!/usr/bin/env node
/**
 * seed-fall-ticket-deals-2026 — the three Undercover Tourist EVENT-TICKET rows
 * the fall rail was missing (owner, 2026-09-03: "every single event that is
 * eligible for affiliation needs to be deep linked").
 *
 * WHY THESE THREE DID NOT EXIST. lib/fallPool.js FALL_EVENT_TICKET_DEALS refused
 * to hook HHN and both Howl-O-Screams because the only UT rows on file were
 * PARK-ADMISSION products (deal 6 Universal, 15 Busch Gardens, 7 SeaWorld) and
 * those events are separately ticketed — a reader landing on a day ticket for a
 * night event is a trust bug wearing a commission. That rule was right. What
 * changed is that UT now sells the event's OWN ticket, verified BY PAGE BODY on
 * 2026-09-03 (H1 quoted on each row below), so the product-integrity rule and
 * the commission now point at the same URL.
 *
 * VERIFIED BEFORE WRITTEN. The script fetches each CJ deep link with redirects
 * disabled and requires the documented first hop (302 -> cj.dotomi.com /
 * emjcd.com — the attribution hop, lib/deals.js). A link that does not forward
 * is not written as link_ok, ever. UT's own page returns 403 to bots (Cloudflare)
 * and that is NOT a dead signal — the deals-health cron already knows this.
 *
 * ends_at is the event's last night so the cron's expiry sweep retires the row
 * itself; nothing has to remember to turn it off in November.
 *
 * Idempotent on dest_url. wf_deals.id is GENERATED ALWAYS, so the id is read
 * back after insert and printed — lib/fallPool.js pins THAT number.
 *   node scripts/seed-fall-ticket-deals-2026.mjs --dry
 *   node scripts/seed-fall-ticket-deals-2026.mjs
 */
import { readFileSync } from "node:fs";
import { rawPathDeepLink, hasCjPid, affiliateForwards } from "../lib/deals.js";

const DRY = process.argv.includes("--dry");
function env() {
  const out = { ...process.env };
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}
const E = env();
const SUPA = E.NEXT_PUBLIC_SUPABASE_URL || E.SUPABASE_URL;
const KEY = E.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !KEY) { console.error("seed-fall-ticket-deals-2026: missing Supabase env"); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const SEASONAL_GRADIENT = "radial-gradient(120% 120% at 50% 20%,#ff8038,#8a2f6a 60%,#2a1633)";

// photo_ref is borrowed from the PARK-ADMISSION row for the same park (6, 15, 7):
// the deal art is the park, which is exactly what those rows already show.
const ROWS = [
  {
    artFrom: 6, sid: "coupon_hhn",
    title: "Halloween Horror Nights — Single Night Ticket",
    subtitle: "Universal Orlando's own HHN night ticket, select nights Aug 28 – Nov 1",
    dest_url: "https://www.undercovertourist.com/orlando/halloween-horror-nights-sunday-saturday-ticket/",
    maps_to: "universal studios florida",
    ends_at: "2026-11-02T03:59:00+00:00",
    // Verified 2026-09-03, page H1: "Halloween Horror Nights Single Night Ticket (Universal Orlando)" — from $94.10, select nights Aug 28–Nov 1 2026, event begins 6:30pm.
  },
  {
    artFrom: 15, sid: "coupon_hos_tampa",
    title: "Howl-O-Scream Tampa — Single Night Ticket",
    subtitle: "Busch Gardens' own Howl-O-Scream night ticket, select nights Sep 11 – Oct 31",
    dest_url: "https://www.undercovertourist.com/orlando/busch-gardens-tampa-howl-o-scream-single-night-ticket/",
    maps_to: "busch gardens tampa bay",
    ends_at: "2026-11-01T03:59:00+00:00",
    // Verified 2026-09-03, page H1: "Busch Gardens Tampa: Howl-O-Scream Single Night Dated Ticket + FREE $20 DiningDollars.com Credit" — from $42.99, select nights Sep 11–Oct 31 2026, park access 5pm, event 7pm.
  },
  {
    artFrom: 7, sid: "coupon_hos_seaworld",
    title: "Howl-O-Scream Orlando — Single Night Ticket",
    subtitle: "SeaWorld Orlando's own Howl-O-Scream night ticket, select nights Sep 11 – Oct 31",
    dest_url: "https://www.undercovertourist.com/orlando/seaworld-orlando-howl-o-scream-single-night-ticket/",
    maps_to: "seaworld orlando",
    ends_at: "2026-11-01T03:59:00+00:00",
    // Verified 2026-09-03, page H1: "SeaWorld Orlando: Howl-O-Scream Single Night Dated Ticket + FREE $20 DiningDollars.com Credit" — from $48.98, select nights Sep 11–Oct 31 2026, gates 6:30pm, event 7pm.
  },
];

// Existing row 8 (Not-So-Scary) had no ends_at, so the sweep could never
// retire it. Its last party is Oct 31.
const PATCH_8 = { id: 8, ends_at: "2026-11-01T03:59:00+00:00" };

async function firstHop(url) {
  const r = await fetch(url, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (Wayfind link check)" } });
  return { status: r.status, location: r.headers.get("location") || "" };
}

const art = await fetch(`${SUPA}/rest/v1/wf_deals?select=id,photo_ref&id=in.(${ROWS.map((r) => r.artFrom).join(",")})`, { headers: H }).then((r) => r.json());
const artById = new Map((Array.isArray(art) ? art : []).map((r) => [r.id, r.photo_ref]));

const out = [];
for (const row of ROWS) {
  const affiliate_url = rawPathDeepLink(row.dest_url, row.sid);
  if (!affiliate_url || !hasCjPid(affiliate_url)) { console.error(`${row.sid}: could not build an attributed deep link`); process.exit(1); }
  const hop = await firstHop(affiliate_url);
  const forwards = affiliateForwards(hop.status, hop.location);
  console.log(`${row.sid}: first hop ${hop.status} -> ${hop.location.slice(0, 60)} ${forwards ? "FORWARDS" : "DEAD"}`);
  if (!forwards) { console.error(`${row.sid}: CJ link does not forward — refusing to write a dead affiliate row`); process.exit(1); }
  const { artFrom, sid, ...rest } = row;
  out.push({
    ...rest, provider: "undercover_tourist", category: "attractions", subcategory: "seasonal_events",
    image_url: null, gradient: SEASONAL_GRADIENT, discount_text: "Event tickets", badge: "Seasonal",
    affiliate_url, starts_at: null, active: true, link_ok: true, http_status: hop.status,
    last_checked_at: new Date().toISOString(), fail_count: 0, quality10: null,
    photo_ref: artById.get(artFrom) || null, scope: "local",
  });
}

if (DRY) { console.log(JSON.stringify(out.map(({ photo_ref, ...r }) => ({ ...r, photo_ref: photo_ref ? "(borrowed)" : null })), null, 1)); console.log("DRY — nothing written"); process.exit(0); }

const existing = await fetch(`${SUPA}/rest/v1/wf_deals?select=id,dest_url&dest_url=in.(${out.map((r) => `"${r.dest_url}"`).join(",")})`, { headers: H }).then((r) => r.json());
const haveByDest = new Map((Array.isArray(existing) ? existing : []).map((r) => [r.dest_url, r.id]));
const fresh = out.filter((r) => !haveByDest.has(r.dest_url));
let inserted = [];
if (fresh.length) {
  const res = await fetch(`${SUPA}/rest/v1/wf_deals`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(fresh),
  });
  const text = await res.text();
  if (!res.ok) { console.error(`seed-fall-ticket-deals-2026: FAIL ${res.status} — ${text}`); process.exit(1); }
  inserted = JSON.parse(text);
}
for (const r of [...inserted, ...(Array.isArray(existing) ? existing : [])]) console.log(`deal id ${r.id} -> ${r.dest_url}`);
const patch = await fetch(`${SUPA}/rest/v1/wf_deals?id=eq.${PATCH_8.id}`, {
  method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" },
  body: JSON.stringify({ ends_at: PATCH_8.ends_at }),
});
if (!patch.ok) { console.error(`seed-fall-ticket-deals-2026: PATCH 8 FAIL ${patch.status}`); process.exit(1); }
console.log(`seed-fall-ticket-deals-2026: OK — ${inserted.length} inserted, ${haveByDest.size} already present, row 8 given its ends_at`);
