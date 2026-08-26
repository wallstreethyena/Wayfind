#!/usr/bin/env node
// test-place-page-book-click-id.mjs
//
// Trust 2026-08-25 after #947 (dfeba86): Shell Key Book is the kayak SKU
// 173028P1, but the painted /places href was
//   /api/commerce/go?provider=viator&offer=173028P1&surface=place_page&content=ChIJ…
// with no client click_id. A same-tab hop therefore could not join
// provider_redirect_started. /api/commerce/go also dropped non-UUID ids
// (the documented mintClickId `wf-` fallback) and reminted.
//
// ASSERT ON THE CALL. A grep for click_id would pass if the name appeared
// in a comment. Every money claim below invokes placePageBookHref,
// withClickId, sanitizeClientClickId, or the real GET handler.

process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = "e2e-placeholder-not-a-real-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://e2eplaceholder.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "e2e-placeholder-anon-key-not-real";
process.env.NEXT_PUBLIC_VIATOR_PID = "P_TEST_000000";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { commerceHref, mintClickId, placePageBookHref, sanitizeClientClickId } from "../lib/commerce.js";
import { withClickId } from "../lib/hubConversion.js";
import { placePartnerPick } from "../lib/placePartnerPicks.js";
import { resolveDetailCta } from "../lib/detailCta.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const SKU = "173028P1";
const FERRY = "237533P2";
const PLACE = "Shell Key Preserve";
const PLACE_ID = "ChIJ5_NkHLUcw4gRndvLQGe_Ox8";
const CLICK = "wf-trustjoin1";

const captured = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes("us.i.posthog.com/capture/")) {
    try { captured.push(JSON.parse(init?.body || "{}")); } catch {}
    return { ok: true, status: 200 };
  }
  if (typeof originalFetch === "function") return originalFetch(url, init);
  return { ok: false, status: 599, json: async () => ({}) };
};
delete process.env.WF_SUPPRESS_ANALYTICS;
process.env.NEXT_PUBLIC_POSTHOG_KEY = "test-key-not-real";

const strip = (s) => String(s || "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/gm, "$1 ");
const read = (p) => readFileSync(join(REPO, p), "utf8");

// ── 1. CALL: hydrated Shell Key /places Book href carries click_id ────────
const pick = placePartnerPick({ name: PLACE, id: PLACE_ID });
ok(!!pick && pick.offerId === SKU, `positive control: Shell Key pin is still ${SKU}`);
ok(pick && pick.offerId !== FERRY, "positive control: pin is never the ferry");

ok(placePageBookHref({ provider: pick.provider, offerId: pick.offerId, contentId: PLACE_ID }) === null,
  "placePageBookHref is fail-closed without a client click_id — that is the Trust smoke");
ok(placePageBookHref({ provider: pick.provider, offerId: pick.offerId, contentId: PLACE_ID, clickId: "short" }) === null,
  "a too-short click_id cannot paint — sanitizeClientClickId must refuse it");

const href = placePageBookHref({
  provider: pick.provider,
  offerId: pick.offerId,
  contentId: PLACE_ID,
  clickId: CLICK,
});
ok(typeof href === "string" && href.startsWith("/api/commerce/go?"),
  `hydrated Book is our go route (got ${String(href).slice(0, 80)})`);
{
  const q = new URLSearchParams(String(href).split("?")[1] || "");
  ok(q.get("click_id") === CLICK, `Book href carries the client click_id (got ${q.get("click_id")})`);
  ok(q.get("offer") === SKU, `Book href is the kayak ${SKU} (got ${q.get("offer")})`);
  ok(q.get("offer") !== FERRY, "Book href is never the ferry");
  ok(q.get("provider") === "viator", "Book href names provider=viator");
  ok(q.get("surface") === "place_page", `Book href stays surface=place_page (got ${q.get("surface")})`);
  ok(q.get("content") === PLACE_ID, "Book href keeps the place id as content");
}
ok(!/searchResults|viator\.com/i.test(String(href)),
  "Book href is never search-as-Book and never a partner host");

const staticPlace = commerceHref({
  provider: pick.provider,
  offerId: pick.offerId,
  surface: "place_page",
  contentId: PLACE_ID,
});
ok(staticPlace && !new URLSearchParams(staticPlace.split("?")[1] || "").has("click_id"),
  "positive control: commerceHref without clickId still omits it — SSR/hydration match");
ok(withClickId(staticPlace, CLICK).includes("click_id=" + CLICK),
  "withClickId stamps the same client id onto the SSR place_page href");

// ── 2. CALL: sanitizer accepts what the client mints, refuses junk ────────
ok(sanitizeClientClickId("11111111-2222-3333-4444-555555555555") === "11111111-2222-3333-4444-555555555555",
  "a UUID click_id is accepted");
ok(sanitizeClientClickId(CLICK) === CLICK, "the documented wf- fallback is accepted");
ok(sanitizeClientClickId(mintClickId()) !== null, "the id mintClickId() actually returns is accepted");
ok(sanitizeClientClickId("has space") === null, "punctuation is refused");
ok(sanitizeClientClickId("short") === null, "too-short ids are refused");

// ── 3. CALL: /api/commerce/go persists a supplied click_id ────────────────
const { GET } = await import("../app/api/commerce/go/route.js");
const go = async (qs, ua) => GET(new Request("https://wayfind.test/api/commerce/go?" + qs, {
  headers: { "user-agent": ua || "Mozilla/5.0 (Wayfind Trust smoke)" },
}));

async function echoClickId(label, clickId) {
  const before = captured.length;
  const res = await go("provider=unknown&offer=" + SKU + "&surface=place_page&content=" + encodeURIComponent(PLACE_ID) + "&click_id=" + encodeURIComponent(clickId));
  ok(res.status === 302, `${label}: fail-soft 302 (got ${res.status})`);
  const ev = captured.slice(before).find((b) => b.event === "provider_redirect_failed" || b.event === "provider_redirect_started");
  ok(!!ev, `${label}: emitted a redirect event (got ${captured.slice(before).map((b) => b.event).join(",") || "none"})`);
  ok(ev && ev.properties && ev.properties.click_id === clickId,
    `${label}: /api/commerce/go persisted click_id=${clickId} (got ${ev && ev.properties && ev.properties.click_id})`);
}

await echoClickId("UUID", "11111111-2222-3333-4444-555555555555");
await echoClickId("wf- fallback", CLICK);

{
  const before = captured.length;
  const res = await go("provider=unknown&offer=" + SKU + "&click_id=" + encodeURIComponent("bad id;drop"));
  ok(res.status === 302, "garbage click_id still fail-soft 302s");
  const ev = captured.slice(before).find((b) => b.event === "provider_redirect_failed" || b.event === "provider_redirect_started");
  ok(ev && ev.properties && ev.properties.click_id, "garbage click_id is reminted, never null");
  ok(ev && ev.properties && ev.properties.click_id !== "bad id;drop",
    "garbage click_id is not persisted — the sanitizer is a real gate");
}

// ── 4. CALL: the island renders; PlacePage mounts it ──────────────────────
{
  const { default: PlacePageBookLink } = await loadComponent(join(REPO, "app/components/PlacePageBookLink.js"), REPO);
  ok(typeof PlacePageBookLink === "function", "PlacePageBookLink default export loads");
  const html = renderToStaticMarkup(createElement(PlacePageBookLink, {
    provider: "viator",
    offerId: SKU,
    contentId: PLACE_ID,
    merchant: "Viator",
    style: {},
  }));
  ok(/<a/.test(html), "PlacePageBookLink rendered an anchor (not a hole)");
  const painted = ((html.match(/href="([^"]+)"/) || [])[1] || "").replace(/&amp;/g, "&");
  ok(painted.startsWith("/api/commerce/go?"),
    `SSR island href is /api/commerce/go (got ${painted.slice(0, 80)})`);
  ok(new URLSearchParams(painted.split("?")[1] || "").get("offer") === SKU,
    `SSR island href is the kayak offer (got ${painted})`);
  ok(!/237533P2/.test(painted), "SSR island href is never the ferry");
}

const placePage = strip(read("lib/placePage.js"));
ok(/<PlacePageBookLink[\s/>]/.test(placePage),
  "PlacePage renders <PlacePageBookLink> — the island that stamps click_id after hydration");
ok(!/commerceHref\(/.test(placePage),
  "PlacePage no longer paints commerceHref itself — that was the unattributed Book href");

const island = strip(read("app/components/PlacePageBookLink.js"));
ok(/placePageBookHref\(/.test(island), "the island CALLs placePageBookHref after hydration");
ok(/withClickId\(/.test(island), "the island also stamps via withClickId — same helper as BookingCTA");
ok(/mintClickId\(/.test(island), "the island mints the client click_id");
ok(!/target\s*=\s*["_']_blank["_']/.test(island),
  "place-page Book is same-tab (founder P0) — no target=_blank");

// ── 5. CALL: in-app exact pin stamps the same id, never remints ───────────
const liveCta = resolveDetailCta({
  detail: { id: PLACE_ID, name: PLACE, types: ["park", "natural_feature", "tourist_attraction"] },
  kind: "nature",
  viaTours: {},
  locName: "Tierra Verde, FL",
  offers: {},
  openState: false,
});
ok(liveCta && liveCta.exact === true && liveCta.offerId === SKU,
  "positive control: the sheet exact pin is still the kayak");
const stamped = withClickId(liveCta.href, CLICK);
ok(/[?&]click_id=wf-trustjoin1/.test(stamped),
  "the sheet exact-pin href becomes joinable once withClickId stamps it");

const detail = strip(read("app/components/sheets/Detail.js"));
const exactStart = detail.indexOf("primaryCta.exact");
const exactEnd = detail.indexOf("DETAIL_CTA_TYPES.tickets");
ok(exactStart > 0 && exactEnd > exactStart, "positive control: the exact-pin branch is still in Detail.js");
const exactBlock = detail.slice(exactStart, exactEnd);
ok(/withClickId\(/.test(exactBlock),
  "exact-pin Book stamps click_id via withClickId on the painted href (not only on click)");
ok(!/target\s*=\s*["_']_blank["_']/.test(exactBlock),
  "exact-pin Book is same-tab — Trust saw target=_blank and no click_id");
ok(!/mintClickId\(/.test(exactBlock),
  "exact-pin Book must not remint on click — that orphans the painted href");

if (fail.length) {
  console.error("test-place-page-book-click-id: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`test-place-page-book-click-id: OK — ${pass} assertions (placePageBookHref CALLED with Shell Key ${SKU}; click_id on the Book href; /api/commerce/go persists UUID + wf- ids; PlacePage mounts <PlacePageBookLink>; exact-pin sheet stamps, never remints, never target=_blank)`);
