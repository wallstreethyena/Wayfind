// Drive the real earning handoffs without following any network redirect.
import assert from "node:assert/strict";
process.env.WF_SUPPRESS_ANALYTICS = "1";
const { CJ_PARTNERS, CJ_PARTNER_OFFERS, cjPartnerDeepLink } = await import("../lib/cjPartners.js");
const { PROVIDERS, resolveOffer } = await import("../lib/commerceProviders.js");
const { vrboUrl } = await import("../lib/affiliates.js");
const { vrboMarketOfferId } = await import("../lib/vrboMarkets.js");
const { guideVacationRentalCta, GUIDE_VRBO_SURFACE } = await import("../lib/guideCta.js");
const { GET } = await import("../app/api/commerce/go/route.js");
let pass = 0;
const ok = (condition, label) => { assert.ok(condition, label); pass++; };
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Static earning routes must not make network requests"); };
try {
  const expected = { ticketsmarter: "15735296", epicpass: "17171490", vrbo: "10697641" };
  ok(Object.keys(CJ_PARTNERS).length === 3, "all three verified CJ advertisers registered");
  ok(Object.keys(CJ_PARTNER_OFFERS).length === 7, "all verified CJ offers exercised");
  for (const [id, row] of Object.entries(CJ_PARTNER_OFFERS)) {
    const cfg = PROVIDERS[row.provider];
    ok(cfg?.requireTracking === true, `${id}: tracking mandatory`);
    const resolved = await resolveOffer(row.provider, id, { subId: "integration_check" });
    ok(!resolved.error && !!resolved.dest, `${id}: real resolver succeeds`);
    const dest = new URL(resolved.dest);
    ok(dest.pathname === `/click-101643573-${expected[row.provider]}`, `${id}: verified CJ PID and advertiser creative`);
    ok(dest.searchParams.get("url") === row.destination, `${id}: exact registered destination`);
    ok(dest.searchParams.get("sid") === "integration_check", `${id}: reporting surface preserved`);
    const response = await GET(new Request(`https://www.gowayfind.com/api/commerce/go?provider=${row.provider}&offer=${id}&surface=integration_check`, { headers: { "user-agent": "Mozilla/5.0" } }));
    ok(response.status === 302 && response.headers.get("location") === resolved.dest, `${id}: actual handler emits attributed URL`);
    ok(response.headers.get("cache-control")?.includes("no-store"), `${id}: per-click redirect never cached`);
    ok((await resolveOffer(row.provider, "https://evil.example/")).error === "offer-not-found", `${id}: arbitrary requested destination refused`);
    const track = cfg.track;
    try {
      cfg.track = () => null;
      ok((await resolveOffer(row.provider, id)).error === "tracking-failed", `${id}: failed attribution cannot fall back to the merchant`);
    } finally { cfg.track = track; }
    const crawler = await GET(new Request(`https://www.gowayfind.com/api/commerce/go?provider=${row.provider}&offer=${id}`, { headers: { "user-agent": "Googlebot" } }));
    ok(crawler.headers.get("location") === "https://www.gowayfind.com/", `${id}: crawler cannot receive an earning redirect`);
  }
  for (const [key, p] of Object.entries(CJ_PARTNERS)) {
    for (const raw of ["", "javascript:alert(1)", `http://${p.host}/`, `https://${p.host}.evil.example/`, `https://evil.example/?u=https://${p.host}/`, `https://${p.host}@evil.example/`, `https://user@${p.host}/`, `https://${p.host}:444/`]) {
      ok(cjPartnerDeepLink(key, raw) === null, `${key}: hostile or malformed destination refused`);
    }
    for (const other of Object.keys(CJ_PARTNERS).filter((k) => k !== key)) {
      ok(cjPartnerDeepLink(key, `https://${CJ_PARTNERS[other].host}/`) === null, `${key}: cannot pay the wrong advertiser for another brand`);
    }
  }
  for (const city of ["Orlando", "Tampa", "Sarasota", "Siesta Key", "Miami"]) {
    const id = vrboMarketOfferId(city + ", FL");
    ok(CJ_PARTNER_OFFERS[id]?.provider === "vrbo", `${city}: client ID has a server destination`);
    const href = vrboUrl(city + ", Florida, United States");
    ok(href?.startsWith("/api/commerce/go?"), `${city}: first-party client link`);
    const u = new URL(href, "https://www.gowayfind.com");
    ok(u.searchParams.get("provider") === "vrbo" && u.searchParams.get("offer") === id, `${city}: exact client/server offer agreement`);
  }
  {
    const guide = guideVacationRentalCta("best-hotels-near-magic-kingdom");
    const gu = new URL(guide.href, "https://www.gowayfind.com");
    ok(gu.searchParams.get("surface") === GUIDE_VRBO_SURFACE && gu.searchParams.get("offer") === "vrbo-orlando", "Magic Kingdom guide uses the Orlando Vrbo offer and its own surface");
    const response = await GET(new Request(new URL(guide.href, "https://www.gowayfind.com"), { headers: { "user-agent": "Mozilla/5.0" } }));
    const location = response.headers.get("location") || "";
    const dest = new URL(location);
    ok(response.status === 302 && dest.pathname === "/click-101643573-10697641" && dest.searchParams.get("url") === "https://www.vrbo.com/vacation-rentals/usa/florida/central-disney-orlando/orlando", "guide Vrbo click 302s through CJ PID 101643573 onto the Orlando market");
    ok(dest.searchParams.get("sid") === GUIDE_VRBO_SURFACE, "guide redirect sid is the guide surface");
  }
  for (const city of ["", "Paris", "Orlando, CA", "Tampa, Kansas", "constructor", "__proto__", "toString"]) {
    ok(vrboMarketOfferId(city) === null && vrboUrl(city) === null, `${city || "empty"}: no unsupported market link`);
  }
  for (const key of ["constructor", "__proto__", "unknown"]) {
    ok(cjPartnerDeepLink(key, "https://www.vrbo.com/") === null, `${key}: inherited or unknown advertiser refused`);
  }
} finally { globalThis.fetch = originalFetch; }
console.log(`check-earning-integrations: OK — ${pass} assertions; real CJ resolver/handler, tracking refusal, crawler refusal and client market routing`);
