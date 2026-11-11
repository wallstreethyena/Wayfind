#!/usr/bin/env node
// /florida-events/[slug] is ISR (revalidate = 3600). Any fetch with
// cache:"no-store" on its render path makes Next throw "Page changed from
// static to dynamic at runtime" (Vercel runtime errors / Sentry WAYFIND-N on
// the Halloween haunt event pages, 2026-09-11 .. 2026-10-31). This guard
// EXECUTES the page's photo data path with a recording global fetch and asserts
// no recorded request carries cache:"no-store" (or next.revalidate 0).
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-key";

const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), cache: init.cache, revalidate: init.next && init.next.revalidate });
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
};
const isLive = (c) => c.cache === "no-store" || c.revalidate === 0;

const { halloweenHauntModel } = await import("../lib/halloweenHauntVault.js");
const { loadEventDetailPhotos } = await import("../lib/placeDetailGallery.js");
const { readVaultedPlacePhotos } = await import("../lib/halloweenHauntPhotos.js");
const { CHRISTMAS_EVENT_PLACE } = await import("../lib/christmasPlacePhotos.js");

// Positive control: the raw vault reader with no injected fetch IS no-store,
// so the recorder can see the failure this guard exists to catch.
calls.length = 0;
await readVaultedPlacePhotos("ChIJcontrolcontrol", {});
assert.ok(calls.length >= 1 && calls.every(isLive) && calls.some((c) => /wf_inventory\?/.test(c.url)),
  "positive control: raw readVaultedPlacePhotos must issue no-store wf_inventory/wf_place_photo reads (recorder is blind otherwise)");
const controlCount = calls.length;

const hrefs = halloweenHauntModel({ now: "2026-10-20T12:00:00-04:00" }).haunts.map((h) => h.eventHref).filter(Boolean);
assert.ok(hrefs.length >= 5, "expected the Halloween haunt event hrefs, got " + hrefs.length);
const christmas = Object.keys(CHRISTMAS_EVENT_PLACE);
assert.ok(christmas.length >= 3, "expected Christmas event slugs");

calls.length = 0;
for (const href of hrefs) await loadEventDetailPhotos(href, { name: "x" });
for (const slug of christmas) await loadEventDetailPhotos("/florida-events/" + slug, { name: "x", placeId: CHRISTMAS_EVENT_PLACE[slug] });
await loadEventDetailPhotos("/florida-events/some-ordinary-event-2026", { name: "x", placeId: "ChIJordinaryplace1" });
assert.ok(calls.length > 0, "the event page photo path issued no reads at all, so this guard proves nothing");
assert.ok(calls.some((c) => /wf_inventory\?/.test(c.url)), "haunt path never reached the wf_inventory read the Sentry trace names");
const bad = calls.filter(isLive);
assert.equal(bad.length, 0, "static event page path issued no-store reads:\n" + bad.map((c) => c.url).join("\n"));
console.log("event page static reads ok: " + hrefs.length + " haunt + " + christmas.length + " christmas pages, " + calls.length + " recorded reads, 0 no-store (control issued " + controlCount + ")");
