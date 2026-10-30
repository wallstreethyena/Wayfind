// Group Vote on a shared tour: sharing a Viator tour must start the vote on
// that exact tour (never the place picker), and the server must read the tour
// and its alternatives from wf_experiences only. No network, no paid provider.
import assert from "node:assert/strict";
import { groupPlanHref, groupSubjectId, experienceGroupId, isExperienceGroupId, concreteSharePlaceId } from "../lib/shareContext.js";
import { createGroupPlaceData, shapeGroupExperience } from "../lib/groupPlanPlaceData.js";
import { readFileSync } from "node:fs";

let n = 0;
const check = (fn) => { fn(); n++; };

// Client: the share subject.
check(() => assert.equal(experienceGroupId("89837P9"), "vx_89837P9"));
check(() => assert.equal(experienceGroupId("ChIJabc"), ""));
check(() => assert.equal(experienceGroupId("12/P3"), ""));
check(() => assert.equal(experienceGroupId("5467OHEP"), "vx_5467OHEP"));
check(() => assert.equal(experienceGroupId("3088_1D_UO"), "vx_3088_1D_UO"));
check(() => assert.equal(experienceGroupId("ab12"), ""));
check(() => assert.equal(isExperienceGroupId("vx_89837P9"), true));
check(() => assert.equal(isExperienceGroupId("vx_ChIJabc"), false));
check(() => assert.equal(groupSubjectId({ type: "experience", id: "5583387P3" }), "vx_5583387P3"));
check(() => assert.equal(groupSubjectId({ type: "event", id: "5583387P3" }), ""));
check(() => assert.equal(groupSubjectId({ type: "experience", id: "guide:x" }), ""));
check(() => assert.equal(groupSubjectId({ type: "event", id: "e1", placeId: "ChIJvenue" }), "ChIJvenue"));
check(() => assert.equal(concreteSharePlaceId("vx_89837P9"), "vx_89837P9"));
check(() => assert.equal(new URL(groupPlanHref("vx_89837P9", "Clear Kayak Tour", true), "https://x.test").searchParams.get("place"), "vx_89837P9"));
check(() => assert.equal(groupPlanHref("", "Trending near Tampa", true), "/group-plans/new?pick=1"));

// Client wiring: content cards hand their subject to the share sheet, and the
// sheet uses it only for Group Vote, never for the invite or preview.
const content = readFileSync(new URL("../lib/contentCardActions.js", import.meta.url), "utf8");
check(() => assert.match(content, /groupId: groupSubjectId\(item\)/));
const sheet = readFileSync(new URL("../app/components/shareIntentSheet.js", import.meta.url), "utf8");
check(() => assert.match(sheet, /groupPlanHref\(opt\.groupId \|\| opt\.id, name\)/));
check(() => assert.match(sheet, /encodeInvite\(\{ place: name, city: opt\.city, id: opt\.id,/));
const flow = readFileSync(new URL("../lib/shareFlow.js", import.meta.url), "utf8");
check(() => assert.match(flow, /groupId, kind:/));

// Search: a one-word plural with no match retries its singular ("Bars" -> "bar"),
// and words that only look plural are left alone.
const { pluralFallbackQuery } = await import("../lib/searchRank.js");
for (const [q, want] of [["Bars", "bar"], ["pubs", "pub"], ["tacos", "taco"], ["breweries", "brewery"], ["bus", ""], ["gas", ""], ["news", ""], ["glass", ""], ["coffee shops", ""], ["bar", ""]]) {
  check(() => assert.equal(pluralFallbackQuery(q), want, q));
}
const route = readFileSync(new URL("../app/api/search/route.js", import.meta.url), "utf8");
check(() => assert.match(route, /pluralFallbackQuery\(query\)/));
check(() => assert.match(route, /result\.reason !== "unsupported_location"/));

// Picker: category searches return place cards, which must count as results.
const client = readFileSync(new URL("../app/group-plans/GroupPlanClient.js", import.meta.url), "utf8");
check(() => assert.match(client, /data\?\.cards/));
check(() => assert.doesNotMatch(client, /not one single place/));

// Server: tour shaping.
const NOW = Date.parse("2026-10-30T20:00:00Z");
const times = [{ id: "t1", startsAt: "2026-11-02T22:00:00Z", endsAt: null }];
const row = (code, rating, reviews, extra = {}) => ({ product_code: code, dest_id: "666", city: "Tampa", categories: ["water"], title: "Tour " + code,
  image: "https://media.tacdn.com/x.jpg", rating, reviews, duration_min: 120, link_ok: true, refreshed_at: "2026-10-25T00:00:00Z", ...extra });
const shaped = shapeGroupExperience(row("11P1", 4.6, 300), times, NOW);
check(() => assert.equal(shaped.id, "vx_11P1"));
check(() => assert.equal(shaped.kind, "experience"));
check(() => assert.equal(shaped.status, "OPERATIONAL"));
check(() => assert.deepEqual(shaped.unverifiedTimeIds, ["t1"]));
check(() => assert.equal(shaped.hoursStatus, "unverified"));
check(() => assert.equal(shaped.placeUrl, null));
check(() => assert.equal(shapeGroupExperience(row("11P1", 4.6, 300, { image: "http://insecure/x.jpg" }), times, NOW).photo, null));
check(() => assert.equal(shapeGroupExperience(row("11P1", 4.6, 300, { link_ok: false }), times, NOW).status, "UNAVAILABLE"));

// Server: prepare + hydrate read wf_experiences only.
const rows = [row("11P1", 4.5, 200), row("22P2", 4.9, 2000), row("33P3", 4.8, 900), row("44P4", 4.0, 50), row("55P5", 5, 3000, { link_ok: false })];
const seen = [];
const fetchImpl = async (url) => {
  const u = String(url); seen.push(u);
  assert.match(u, /\/rest\/v1\/wf_experiences\?/, "only wf_experiences is read for a tour");
  const sp = new URL(u).searchParams;
  let out = rows;
  const pc = sp.get("product_code");
  if (pc) { const codes = pc.replace(/^in\.\(|\)$/g, "").split(","); out = rows.filter((r) => codes.includes(r.product_code)); }
  if (sp.get("link_ok") === "is.true") out = out.filter((r) => r.link_ok);
  return { ok: true, json: async () => out };
};
const data = createGroupPlaceData({ url: "https://db.test", key: "k" }, { fetchImpl, env: {}, photoResolver: async () => { throw new Error("no photo lookup for tours"); } });
const prepared = await data.prepare("vx_11P1", times, NOW);
check(() => assert.deepEqual(prepared.places.map((p) => p.id), ["vx_11P1", "vx_22P2", "vx_33P3"]));
check(() => assert.equal(prepared.alternativesStatus, "verified"));
check(() => assert.ok(seen.some((u) => /dest_id=eq\.666/.test(u) && /categories=ov\.\{water\}/.test(u))));
const hydrated = await data.hydrate(["vx_22P2", "vx_11P1", "vx_99P9"], times, NOW);
check(() => assert.equal(hydrated[0].name, "Tour 22P2"));
check(() => assert.equal(hydrated[1].comparisonReasons[0], "Same kind of tour in Tampa"));
check(() => assert.equal(hydrated[2].unavailable, true));
await assert.rejects(() => data.prepare("vx_55P5", times, NOW), /not available/); n++;
await assert.rejects(() => data.prepare("vx_77P7", times, NOW), /not available/); n++;

// Real JSX: a tour ballot renders the shared tour as the homepage tour card,
// with its own credited photo, "Vote for this tour", and the alternatives.
{
  const path = (await import("node:path")).default;
  const { fileURLToPath } = await import("node:url");
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { loadComponent } = await import("./lib/jsxLoad.mjs");
  const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const UI = await loadComponent(path.join(ROOT, "app/group-plans/GroupPlaceOptions.js"), ROOT);
  const plan = { organizerName: "Gabe Pereira", originalPlaceId: "vx_11P1", timeZone: "America/New_York", places: prepared.places };
  const html = renderToStaticMarkup(React.createElement(UI.GroupPlaceOptions, { plan, selected: "vx_11P1", onSelect() {} }));
  check(() => assert.match(html, /Gabe’s pick/));
  check(() => assert.match(html, /Tour 11P1/));
  check(() => assert.match(html, /Tour 22P2/));
  check(() => assert.match(html, /media\.tacdn\.com\/x\.jpg/));
  check(() => assert.match(html, /Vote for this tour/));
  check(() => assert.doesNotMatch(html, /Vote for this place/));
  check(() => assert.match(html, /Tour availability isn’t checked/));
  const place = renderToStaticMarkup(React.createElement(UI.GroupPlaceOptions, { plan: { ...plan, originalPlaceId: "p1", places: [{ id: "p1", name: "Ulele", lat: 27.96, lng: -82.46, category: "food", score: 90 }] }, selected: "", onSelect() {} }));
  check(() => assert.match(place, /Vote for this place/));
}

console.log(`group-vote-tours PASS: ${n} assertions; tours start Group Vote on the shared tour, read only wf_experiences, picker counts category results`);
