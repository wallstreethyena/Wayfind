// Drive the real earning handoffs without following any network redirect.
import assert from "node:assert/strict";
process.env.WF_SUPPRESS_ANALYTICS = "1";
const { CJ_PARTNERS, CJ_PARTNER_OFFERS, cjPartnerDeepLink, cjPartnerOfferById } = await import("../lib/cjPartners.js");
const { PROVIDERS, resolveOffer } = await import("../lib/commerceProviders.js");
const { vrboUrl } = await import("../lib/affiliates.js");
const { vrboMarketOfferId } = await import("../lib/vrboMarkets.js");
const { guideVacationRentalCta, GUIDE_VRBO_SURFACE } = await import("../lib/guideCta.js");
const { GET } = await import("../app/api/commerce/go/route.js");
let pass = 0;
const ok = (condition, label) => { assert.ok(condition, label); pass++; };
const originalFetch = globalThis.fetch;
const OriginalDate = globalThis.Date;
// Freeze the real handler's clock in this process only. Production accepts no
// visitor-controlled date override; direct resolver tests use its deps.today.
const setClock = (iso) => {
  const now = OriginalDate.parse(iso);
  globalThis.Date = class extends OriginalDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
};
setClock("2026-11-06T17:00:00Z");
globalThis.fetch = async () => { throw new Error("Static earning routes must not make network requests"); };
try {
  const expected = { ticketsmarter: "15735296", epicpass: "17171490", vrbo: "10697641" };
  ok(Object.keys(CJ_PARTNERS).length === 3, "all three verified CJ advertisers registered");
  ok(Object.keys(CJ_PARTNER_OFFERS).length === 13, "all thirteen verified CJ offers exercised");
  ok(CJ_PARTNER_OFFERS["enchant-stpete-ticketsmarter"]?.destination === "https://www.ticketsmarter.com/venues/tropicana-field",
    "Enchant resale browse points to the verified St Petersburg venue, not a fabricated ticket/date URL");
  const performances = {
    "christmas-carol-orlando-nov29-ticketsmarter": "/e/a-christmas-carol-tickets-orlando-11-29-2026-margeson-theatre-at-orlando-shakespeare-center/3434093",
    "miami-nutcracker-dec11-ticketsmarter": "/e/miami-city-ballet-the-nutcracker-tickets-miami-12-11-2026-ziff-opera-house-at-the-adrienne-arsht-center/3388768",
    "orange-park-nutcracker-dec12-ticketsmarter": "/e/the-florida-ballet-the-nutcracker-tickets-orange-park-12-12-2026-thrasher-horne-center/3494618",
    "parker-nutcracker-dec18-ticketsmarter": "/e/arts-ballet-theatre-of-florida-the-nutcracker-tickets-fort-lauderdale-12-18-2026-lillian-s-wells-hall-at-the-parker/3478410",
    "parker-celtic-christmas-dec23-ticketsmarter": "/e/celtic-angels-christmas-tickets-fort-lauderdale-12-23-2026-lillian-s-wells-hall-at-the-parker/3478675",
  };
  for (const [id, pathname] of Object.entries(performances)) {
    const row = CJ_PARTNER_OFFERS[id];
    ok(row?.provider === "ticketsmarter" && row.destination === "https://www.ticketsmarter.com" + pathname && row.verifiedOn === "2026-11-06",
      id + ": exact source-reviewed Florida performance, not a venue search");
  }
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
  const performanceDays = {
    "christmas-carol-orlando-nov29-ticketsmarter": ["2026-11-29", "2026-11-30"],
    "miami-nutcracker-dec11-ticketsmarter": ["2026-12-11", "2026-12-12"],
    "orange-park-nutcracker-dec12-ticketsmarter": ["2026-12-12", "2026-12-13"],
    "parker-nutcracker-dec18-ticketsmarter": ["2026-12-18", "2026-12-19"],
    "parker-celtic-christmas-dec23-ticketsmarter": ["2026-12-23", "2026-12-24"],
  };
  for (const [id, [lastDay, nextDay]] of Object.entries(performanceDays)) {
    ok(CJ_PARTNER_OFFERS[id].expiresOn === lastDay && cjPartnerOfferById(id, "ticketsmarter", { today: lastDay }) !== null,
      id + ": registry remains eligible on its exact performance date");
    ok(cjPartnerOfferById(id, "ticketsmarter", { today: nextDay }) === null
      && cjPartnerOfferById(id, "ticketsmarter", { today: "invalid" }) === null,
      id + ": registry refuses the next ET day and invalid clocks");
    const live = await resolveOffer("ticketsmarter", id, { today: lastDay });
    ok(!live.error && new URL(live.dest).searchParams.get("url") === CJ_PARTNER_OFFERS[id].destination,
      id + ": real resolver returns attributed exact performance on its date");
    const expired = await resolveOffer("ticketsmarter", id, { today: nextDay });
    ok(expired.error === "offer-not-found" && !expired.dest,
      id + ": expired shared offer resolves to no merchant or untracked fallback");
    const request = () => new Request(`https://www.gowayfind.com/api/commerce/go?provider=ticketsmarter&offer=${id}&surface=expiry_check`, { headers: { "user-agent": "Mozilla/5.0" } });
    // At 04:59Z it is still the performance's last ET day. At 05:00Z the
    // venue-local day turns over, even though both requests share a UTC date.
    setClock(nextDay + "T04:59:59Z");
    const onDate = await GET(request());
    const location = new URL(onDate.headers.get("location"));
    ok(onDate.status === 302 && location.hostname === "www.kqzyfj.com"
      && location.searchParams.get("url") === CJ_PARTNER_OFFERS[id].destination,
      id + ": actual handler still attributes on the last ET date");
    setClock(nextDay + "T05:00:00Z");
    const after = await GET(request());
    ok(after.status === 302 && after.headers.get("location") === "https://www.gowayfind.com/"
      && after.headers.get("cache-control")?.includes("no-store"),
      id + ": actual handler refuses past social links at ET midnight, without untracked fallback");
  }
  ok(cjPartnerOfferById("enchant-stpete-ticketsmarter", "ticketsmarter", { today: "2027-01-01" })?.destination === "https://www.ticketsmarter.com/venues/tropicana-field",
    "existing Enchant venue-browse resolver behavior is preserved");
  setClock("2026-11-06T17:00:00Z");
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
} finally { globalThis.fetch = originalFetch; globalThis.Date = OriginalDate; }
console.log(`check-earning-integrations: OK — ${pass} assertions; real CJ resolver/handler, tracking refusal, crawler refusal and client market routing`);
