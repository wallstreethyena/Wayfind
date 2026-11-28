#!/usr/bin/env node
/**
 * test-evergreen-photo-only — an evergreen town flagged `photoOnly`
 * (lib/evergreenCities.js; Gainesville since 2026-11-28) ranks ONLY places
 * that already hold a real, rights-cleared photo, so no card on its pages
 * falls back to the monogram tile (owner bar 2026-11-28: "premium and nothing
 * missing"). Proven by CALLING the code:
 *
 *   1. keepPhotoReady keeps owned-photo rows and ready ids, drops the rest.
 *   2. storedPhotoIds reads wf_place_photo (active, credited) and
 *      wf_google_photo_store (ready + stored), drops an uncredited licensed
 *      row, THROWS on a failed configured read, answers {} unconfigured.
 *   3. landingRanked(things-to-do/gainesville) ranks only photo-ready places;
 *      with 7 ready the page is below the 8-card floor (honest 404), with 9
 *      it qualifies. CONTROL: naples (not photoOnly) ranks every fixture with
 *      the identical readiness answer, so the filter is town-scoped.
 *   4. The flag is exactly Gainesville's, and Gainesville publishes only the
 *      pairs that clear the floor on real photo coverage.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0, asserts = 0;
const ok = (cond, msg) => { asserts++; if (!cond) { failures++; console.error("  FAIL: " + msg); } };

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "GOOGLE_MAPS_SERVER_KEY"]) delete process.env[k];
const realFetch = globalThis.fetch;
let google = 0;
globalThis.fetch = async (u) => {
  if (/googleapis\.com/.test(String(u))) google++;
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
};

const pr = await import("../lib/landingPhotoReady.js");
const ev = await import("../lib/evergreenCities.js");

// ── 1. keepPhotoReady ────────────────────────────────────────────────────────
{
  const rows = [
    { id: "ChIJownedPhotoRow0001", photos: ["/place-photos/a/b.jpg"] },
    { id: "ChIJownedPhotoUrl0002", photo_url: "https://upload.wikimedia.org/x.jpg" },
    { id: "ChIJreadyLicensed0003" },
    { id: "ChIJnoPhotoAtAll00004" },
  ];
  let asked = null;
  const kept = await pr.keepPhotoReady(rows, { photoReadyIds: async (ids) => { asked = ids; return new Set(["ChIJreadyLicensed0003"]); } });
  ok(JSON.stringify(kept.map((p) => p.id)) === JSON.stringify(["ChIJownedPhotoRow0001", "ChIJownedPhotoUrl0002", "ChIJreadyLicensed0003"]), `keeps owned + ready, drops the photo-less row (got ${kept.map((p) => p.id).join(",")})`);
  ok(JSON.stringify(asked) === JSON.stringify(["ChIJreadyLicensed0003", "ChIJnoPhotoAtAll00004"]), "asks the database only about rows without an owned photo");
  ok((await pr.keepPhotoReady([], {})).length === 0 && (await pr.keepPhotoReady(null, {})).length === 0, "empty input answers []");
}

// ── 2. storedPhotoIds ────────────────────────────────────────────────────────
{
  const env = { url: "https://sb.photo-only.invalid", key: "k" };
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    if (url.includes("/wf_place_photo?")) {
      return new Response(JSON.stringify([
        { place_id: "ChIJlicensedCredited01", license: "cc-by-sa-4.0", attribution_text: "Author, CC BY-SA 4.0, via Wikimedia Commons", image_url: "https://upload.wikimedia.org/a.jpg" },
        { place_id: "ChIJlicensedNoCredit02", license: "cc-by-sa-4.0", attribution_text: "", image_url: "https://upload.wikimedia.org/b.jpg" },
      ]), { status: 200 });
    }
    if (url.includes("/wf_google_photo_store?")) return new Response(JSON.stringify([{ place_id: "ChIJstoredGooglePh03" }]), { status: 200 });
    return new Response("[]", { status: 200 });
  };
  const ready = await pr.storedPhotoIds(["ChIJlicensedCredited01", "ChIJlicensedNoCredit02", "ChIJstoredGooglePh03", "ChIJnothingHere000004", "bad id"], { env, fetchImpl });
  ok(ready.has("ChIJlicensedCredited01") && ready.has("ChIJstoredGooglePh03"), "a credited licensed photo and a stored photo count as ready");
  ok(!ready.has("ChIJlicensedNoCredit02"), "a licensed row with no attribution is NOT ready (it could not be credited)");
  ok(!ready.has("ChIJnothingHere000004") && ready.size === 2, `nothing else is ready (size ${ready.size})`);
  ok(seen.length === 2 && seen.some((u) => /wf_place_photo\?place_id=in\.\(.*\)&status=eq\.active/.test(u)) && seen.some((u) => /wf_google_photo_store\?place_id=in\.\(.*\)&state=eq\.ready&storage_path=not\.is\.null/.test(u)), "reads exactly the two tables with the active / ready filters");
  ok(!seen.join(" ").includes("bad%20id") && !seen.join(" ").includes("bad id"), "a malformed id never reaches the query");
  let threw = false;
  try { await pr.storedPhotoIds(["ChIJlicensedCredited01"], { env, fetchImpl: async () => new Response("err", { status: 500 }) }); } catch { threw = true; }
  ok(threw, "a failed configured read THROWS (ISR keeps the last good page instead of publishing an empty market)");
  ok((await pr.storedPhotoIds(["ChIJlicensedCredited01"], {})).size === 0, "unconfigured answers an empty set, no throw");
}

// ── 3. Ranking: Gainesville ranks only photo-ready places; Naples is untouched ─
const landing = await loadComponent(path.join(ROOT, "lib/landing.js"), ROOT);
{
  const fixture = (city, slug, n) => Array.from({ length: n }, (_, i) => {
    const id = ("ChIJPhoto" + slug.replace(/[^a-z]/g, "").slice(0, 8) + "Q" + String(i).padStart(3, "0")).slice(0, 27);
    return {
      place_id: id, id, name: `Photo fixture ${slug} ${i}`, rating: 4.3 + (i % 5) / 10, userRatingCount: 400 + i * 37,
      formattedAddress: `${i + 1} Main St, ${city.name}, FL`, businessStatus: "OPERATIONAL",
      location: { latitude: city.lat + (i * 0.2) / 69, longitude: city.lng },
      photoRef: null, types: ["museum", "tourist_attraction", "point_of_interest"], primaryType: "museum", category: "attractions",
    };
  });
  const gnv = landing.landingPair("things-to-do", "gainesville");
  ok(gnv && gnv.evergreen === true, "things-to-do/gainesville is a published evergreen pair");
  const rows = fixture(gnv.city, "gainesville", 12);
  const readyFirst = (n) => async (ids) => new Set(ids.slice(0, n));
  const nine = await landing.landingRanked("things-to-do", "gainesville", { inventoryRows: rows, photoReadyIds: readyFirst(9) });
  const nineIds = new Set(rows.slice(0, 9).map((r) => r.id));
  ok(Array.isArray(nine) && nine.length > 0 && nine.every((p) => nineIds.has(p.id)), `Gainesville ranks only the 9 photo-ready places (got ${nine && nine.length})`);
  ok(landing.landingEligibility(gnv, nine).eligible, `9 photo-ready places clear the 8-card floor (count ${landing.landingEligibility(gnv, nine).count})`);
  const seven = await landing.landingRanked("things-to-do", "gainesville", { inventoryRows: rows, photoReadyIds: readyFirst(7) });
  ok(!landing.landingEligibility(gnv, seven).eligible && landing.landingEligibility(gnv, seven).count === 7, "7 photo-ready places stay below the floor (the page 404s honestly, never pads with monogram tiles)");
  const none = await landing.landingRanked("things-to-do", "gainesville", { inventoryRows: rows, photoReadyIds: readyFirst(0) });
  ok(Array.isArray(none) && none.length === 0, "no photo-ready place ranks nothing");

  const nap = landing.landingPair("things-to-do", "naples");
  const napRows = fixture(nap.city, "naples", 12);
  let napAsked = false;
  const ctl = await landing.landingRanked("things-to-do", "naples", { inventoryRows: napRows, photoReadyIds: async (ids) => { napAsked = true; return new Set(ids.slice(0, 0)); } });
  ok(Array.isArray(ctl) && ctl.length >= 8 && !napAsked, `CONTROL: Naples (not photoOnly) ranks its fixtures without asking about photos (${ctl && ctl.length} ranked)`);
}

// ── 4. Membership ────────────────────────────────────────────────────────────
{
  const flagged = Object.keys(ev.EVERGREEN_CITIES).filter((s) => ev.evergreenPhotoOnly(s));
  ok(JSON.stringify(flagged) === JSON.stringify(["gainesville"]), `only Gainesville is photoOnly (got ${flagged.join(",")})`);
  ok(JSON.stringify(ev.EVERGREEN_CITIES.gainesville.cats) === JSON.stringify(["things-to-do"]), "Gainesville publishes things-to-do (photo coverage measured 2026-11-28)");
  ok(JSON.stringify([...ev.EVERGREEN_WITHHELD.gainesville].sort()) === JSON.stringify(["beaches", "nightlife", "restaurants"]), "restaurants and nightlife stay withheld until their places carry real photos; beaches have no inventory");
  ok(ev.evergreenPhotoOnly("not-a-town") === false && ev.evergreenPhotoOnly("__proto__") === false, "unknown slugs are never photoOnly");
}

ok(google === 0, `zero googleapis calls (${google})`);
globalThis.fetch = realFetch;
if (failures) { console.error(`test-evergreen-photo-only: ${failures} of ${asserts} assertions FAILED`); process.exit(1); }
console.log(`test-evergreen-photo-only: OK (${asserts} assertions — owned/licensed/stored readiness, fail-loud read, Gainesville photo-only ranking with 7/9 floor, Naples control)`);
