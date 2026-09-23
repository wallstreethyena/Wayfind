#!/usr/bin/env node
// scripts/test-bookable-highlights-30.mjs — expand the existing Bookable
// highlights rail to 30 qualified unique products when the market has them.
//
// Asserts on CALLS and RENDERED markup, not on a 12→30 substring swap.
// Caps live in lib/intentPartnerPicks.js; this file proves they play their
// role: candidate fetch, qualification, evidence order, geo isolation.

import { fileURLToPath } from "node:url";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { DESTS, experienceWayfindScore } from "../lib/experiencesData.js";
import {
  OWNED_EXPERIENCE_DEST_IDS,
  PARTNER_INVENTORY_CANDIDATE_COUNT,
  PARTNER_RAIL_RENDER_LIMIT,
  canReadOwnedExperienceCache,
  fetchPartnerInventory,
  partnerInventoryFetchPlan,
  partnerInventoryRequest,
  qualifyPartnerInventory,
  resolvedIntentPartnerPicks,
} from "../lib/intentPartnerPicks.js";

let pass = 0;
const fail = (m) => { console.error("test-bookable-highlights-30: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mod = await loadComponent(fileURLToPath(new URL("../app/components/IntentPartnerPick.js", import.meta.url)), REPO);
const Rail = mod && (mod.default || mod);
ok(typeof Rail === "function", "IntentPartnerPick compiles and exports a component");

ok(PARTNER_INVENTORY_CANDIDATE_COUNT >= 40 && PARTNER_INVENTORY_CANDIDATE_COUNT <= 50,
  `candidate window is 40–50 so filtering can still leave 30 (got ${PARTNER_INVENTORY_CANDIDATE_COUNT})`);
ok(PARTNER_RAIL_RENDER_LIMIT === 30, `render cap is 30 qualified cards (got ${PARTNER_RAIL_RENDER_LIMIT})`);
ok(OWNED_EXPERIENCE_DEST_IDS.join(",") === DESTS.map((d) => d.destId).join(","),
  "owned experience dest ids stay lockstep with experiencesData.DESTS — a drift would skip the cache or dump every Florida market");
ok(canReadOwnedExperienceCache("25738") && canReadOwnedExperienceCache("663"),
  "Sarasota 25738 and Orlando 663 are owned cache dests");
ok(!canReadOwnedExperienceCache("687") && !canReadOwnedExperienceCache(null),
  "NYC 687 and missing dest ids never read /api/experiences (that route falls through to all Florida dests)");

const sarasotaReq = partnerInventoryRequest("Sarasota", "best-of");
ok(sarasotaReq?.destId === "25738" && sarasotaReq.searchCity === "Sarasota",
  "Sarasota maps to Viator dest 25738 (Sarasota / Bradenton / Anna Maria / Lakewood Ranch / Venice)");
ok(partnerInventoryRequest("Siesta Key", "best-of")?.destId === "25738",
  "Siesta Key stays inside the Sarasota-market dest, not a nationwide search");
ok(partnerInventoryRequest("Longboat Key", "best-of")?.destId === "25738",
  "Longboat Key stays inside the Sarasota-market dest");
ok(partnerInventoryRequest("Anna Maria Island", "best-of")?.destId === "25738",
  "Anna Maria Island stays inside the Sarasota-market dest");

const sarasotaPlan = partnerInventoryFetchPlan("Sarasota", "best-of");
ok(!!sarasotaPlan.experiencesUrl && /[?&]city=Sarasota\b/.test(sarasotaPlan.experiencesUrl) && /[?&]limit=48\b/.test(sarasotaPlan.experiencesUrl),
  `Sarasota reads owned wf_experiences for 48 candidates (got ${sarasotaPlan.experiencesUrl})`);
ok(/[?&]destId=25738\b/.test(sarasotaPlan.toursUrl) && /[?&]count=12\b/.test(sarasotaPlan.toursUrl) && /[?&]mode=city\b/.test(sarasotaPlan.toursUrl),
  "Sarasota live search stays dest-scoped and does not enlarge the paid 12-result fanout when the cache can fill the rail");

const orlandoPlan = partnerInventoryFetchPlan("Orlando", "best-of");
ok(orlandoPlan.request.destId === "663" && /[?&]destId=663\b/.test(orlandoPlan.toursUrl),
  "Orlando live search uses dest 663, not Sarasota 25738");
ok(/[?&]city=Orlando\b/.test(orlandoPlan.experiencesUrl) && !/25738|Sarasota/.test(orlandoPlan.experiencesUrl + orlandoPlan.toursUrl),
  "Orlando owned-cache read is Orlando-only — Sarasota inventory cannot leak through the fetch plan");

const boisePlan = partnerInventoryFetchPlan("Boise, ID", "family");
ok(boisePlan.experiencesUrl === null && !boisePlan.toursUrl.includes("destId="),
  "an unseeded city never borrows Florida dest ids or the all-Florida experiences dump");
ok(/[?&]count=48\b/.test(boisePlan.toursUrl),
  "an unseeded city asks the live search for the candidate window because it has no owned cache");

const nycPlan = partnerInventoryFetchPlan("New York City", "best-of");
ok(nycPlan.request.destId === "687" && nycPlan.experiencesUrl === null,
  "NYC 687 is not an owned experiences dest, so the rail does not call /api/experiences");

function harborWalk(n, extras = {}) {
  return {
    code: `25738P${n}`,
    title: `Harbor walk ${n}`,
    image: `https://images.example.test/s${n}.jpg`,
    rating: Number((4.95 - n * 0.01).toFixed(2)),
    reviews: 900 - n * 12,
    link_ok: true,
    ...extras,
  };
}

const valid40 = Array.from({ length: 40 }, (_, i) => harborWalk(i + 1));
const dirtyPool = [
  ...valid40,
  harborWalk(101, { link_ok: false, title: "Dead mangrove tour" }),
  harborWalk(102, { link_ok: false, title: "Retired sunset sail" }),
  harborWalk(103, { image: "", title: "No artwork kayak" }),
  harborWalk(104, { image: "not-a-url", title: "Placeholder panel" }),
  { ...harborWalk(1), code: "25738P201", title: "Harbor walk 1" },
  { ...harborWalk(2), code: "25738P1", title: "Duplicate code of #1" },
];

const qualified = qualifyPartnerInventory(dirtyPool);
ok(qualified.length === 40, `qualification keeps the 40 live unique imaged products and drops the rest (got ${qualified.length})`);
ok(!qualified.some((row) => row.link_ok === false), "dead links (link_ok === false) are excluded");
ok(qualified.every((row) => /^https:\/\//.test(row.image)), "products without a real image are excluded");
ok(new Set(qualified.map((row) => row.code)).size === 40 && new Set(qualified.map((row) => row.title.toLowerCase())).size === 40,
  "duplicate product codes and duplicate titles are removed");

ok(qualifyPartnerInventory([{ code: "X1", title: "Live unchecked", image: "https://images.example.test/x.jpg", link_ok: null }]).length === 1,
  "unchecked inventory (link_ok null) still qualifies — the sweep decides, not the reader");
ok(qualifyPartnerInventory([]).length === 0 && qualifyPartnerInventory(null).length === 0,
  "empty/missing inventory qualifies to zero — never filler");

const resolved = resolvedIntentPartnerPicks("Sarasota", "best-of", qualified, PARTNER_INVENTORY_CANDIDATE_COUNT);
ok(resolved.length >= 30, `Sarasota best-of resolves at least 30 candidates from 40 valid rows (got ${resolved.length})`);
ok(resolved.length <= PARTNER_INVENTORY_CANDIDATE_COUNT,
  `selector never exceeds the candidate window (got ${resolved.length})`);

const fetchedUrls = [];
const fetched = await fetchPartnerInventory("Sarasota", "best-of", {
  fetch: async (url) => {
    fetchedUrls.push(String(url));
    if (String(url).includes("/api/experiences")) {
      return { ok: true, json: async () => ({ items: dirtyPool, dark: false }) };
    }
    if (String(url).includes("/api/viator/tours")) {
      return { ok: true, json: async () => ({ items: valid40.slice(0, 12) }) };
    }
    if (String(url).includes("/api/viator/curated")) {
      return { ok: true, json: async () => ({ items: [] }) };
    }
    throw new Error("unexpected fetch " + url);
  },
});
ok(fetchedUrls.some((url) => url.includes("/api/experiences?") && url.includes("city=Sarasota") && url.includes("limit=48")),
  "fetchPartnerInventory actually requests the owned Sarasota cache");
ok(fetchedUrls.some((url) => url.includes("/api/viator/tours?") && url.includes("destId=25738")),
  "fetchPartnerInventory still dest-scopes the live search");
ok(fetched.length === 40, `fetch qualifies the dirty 46-row payload down to 40 unique live cards (got ${fetched.length})`);
ok(!fetched.some((row) => row.link_ok === false || !row.image), "fetched inventory has no dead links and no imageless rows");

const orlandoUrls = [];
await fetchPartnerInventory("Orlando", "best-of", {
  fetch: async (url) => {
    orlandoUrls.push(String(url));
    return { ok: true, json: async () => ({ items: [] }) };
  },
});
ok(orlandoUrls.some((url) => url.includes("destId=663") || url.includes("city=Orlando")),
  "Orlando fetch talks to Orlando endpoints");
ok(!orlandoUrls.some((url) => url.includes("25738") || url.includes("Sarasota")),
  "Orlando fetch never requests Sarasota dest 25738 or a Sarasota city cache");

const render = (props) => renderToStaticMarkup(createElement(Rail, props));
const offerIds = (html) => [...html.matchAll(/data-offer-id="([^"]+)"/g)].map((m) => m[1]);
const ranks = (html) => [...html.matchAll(/data-rank="(\d+)"/g)].map((m) => Number(m[1]));

const fullHtml = render({ city: "Sarasota", intent: "best-of", inventory: valid40, lat: 27.336, lng: -82.531 });
const fullIds = offerIds(fullHtml);
ok(fullHtml.includes("data-intent-partner-rail") && fullHtml.includes("Bookable highlights near Sarasota"),
  "Sarasota best-of still mounts the existing horizontal rail, not a second rail");
ok(fullIds.length === 30, `Sarasota renders exactly 30 cards when 40 valid inventory records exist (got ${fullIds.length})`);
ok(ranks(fullHtml).join(",") === Array.from({ length: 30 }, (_, i) => i + 1).join(","),
  "rendered cards keep a 1..30 rank, not a vertical restack");
ok((fullHtml.match(/loading="lazy"/g) || []).length === 30 && !(fullHtml.match(/loading="eager"/g) || []).length,
  "all 30 images stay lazy-loaded — the rail does not eagerly download 30 full-resolution images");
ok((fullHtml.match(/decoding="async"/g) || []).length === 30, "all 30 images decode asynchronously");
ok((fullHtml.match(/flex:0 0 200px/g) || []).length === 30 && fullHtml.includes("overflow-x:auto"),
  "cards stay the compact horizontal swipe rail (200px), not a 30-card vertical list");
ok(fullHtml.includes("/api/commerce/go?"), "affiliate routing still goes through Wayfind");
ok(fullIds.every((id) => fullHtml.includes("offer=" + encodeURIComponent(id))),
  "every rendered card carries its opaque offer id on the Wayfind redirect");
ok(!/https?:\/\/(?:www\.)?(?:viator\.com|tiqets\.com)/.test(fullHtml),
  "rendered markup exposes no raw affiliate destination URL");
ok(!/earn a commission/i.test(fullHtml),
  "no inline commission disclosure renders on the rail (one footer disclosure plus one on true detail pages is the law now)");

const byId = new Map(valid40.map((row) => [row.code, row]));
const renderedScores = fullIds
  .filter((id) => byId.has(id))
  .map((id) => experienceWayfindScore(byId.get(id)));
ok(renderedScores.length >= 29, `almost every rendered card is from the evidence-bearing fixture (got ${renderedScores.length} scored of ${fullIds.length})`);
ok(renderedScores.every((score, i) => !i || renderedScores[i - 1] >= score),
  "cards remain ordered by evidence score (strongest first)");

const dirtyHtml = render({ city: "Sarasota", intent: "best-of", inventory: dirtyPool, lat: 27.336, lng: -82.531 });
const dirtyIds = offerIds(dirtyHtml);
ok(dirtyIds.length === 30, `dirty pool still renders 30 after excluding dead/imageless/duplicate rows (got ${dirtyIds.length})`);
ok(!dirtyIds.includes("25738P101") && !dirtyIds.includes("25738P102"), "dead-link offer ids never render");
ok(!dirtyHtml.includes("No artwork kayak") && !dirtyHtml.includes("Placeholder panel"),
  "imageless products never render");
ok(!dirtyIds.includes("25738P201"), "a duplicate title does not take a second slot");

const eight = valid40.slice(0, 8);
const shortHtml = render({ city: "Sarasota", intent: "best-of", inventory: eight, lat: 27.336, lng: -82.531 });
const shortIds = offerIds(shortHtml);
ok(shortIds.length >= 8 && shortIds.length < 30,
  `fewer than 30 valid products renders however many exist, never filler (got ${shortIds.length})`);
ok(shortHtml.includes("Harbor walk 1") && shortHtml.includes("Harbor walk 8"),
  "the short rail still shows the legitimate products it has");

const orlandoHtml = render({
  city: "Orlando",
  intent: "best-of",
  inventory: Array.from({ length: 12 }, (_, i) => ({
    code: `663P${i + 1}`,
    title: `Orlando harbor walk ${i + 1}`,
    image: `https://images.example.test/o${i + 1}.jpg`,
    rating: 4.6,
    reviews: 80,
    link_ok: true,
  })),
  lat: 28.538,
  lng: -81.379,
});
ok(offerIds(orlandoHtml).every((id) => id.startsWith("663P") || id.startsWith("orlando-")),
  "Orlando cards come from Orlando inventory / Orlando curated picks, not Sarasota 25738P* codes");
ok(!orlandoHtml.includes("Harbor walk 1") && !orlandoHtml.includes("25738P"),
  "other guide cities are not accidentally flooded with Sarasota fixture inventory");

const emptyHtml = render({ city: "Sarasota", intent: "best-of", inventory: dirtyPool.filter((row) => row.link_ok === false || !/^https:\/\//.test(String(row.image || ""))), lat: 27.336, lng: -82.531 });
ok(!emptyHtml.includes("data-offer-id="),
  "a pool of only dead or imageless rows renders nothing rather than inventing cards");

console.log(`test-bookable-highlights-30: OK — ${pass} assertions (candidate ${PARTNER_INVENTORY_CANDIDATE_COUNT} / qualified 40 / rendered 30; providers in the Sarasota best-of fixture: viator. Caps traced: fetchPartnerInventory 12→owned 48 + live 12, resolvedIntentPartnerPicks 12→48, rail slice 30. Orlando/Boise/NYC plans stay dest-isolated.)`);
