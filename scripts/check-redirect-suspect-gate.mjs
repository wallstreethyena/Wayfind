#!/usr/bin/env node
/**
 * check-redirect-suspect-gate — the DELTA on top of #1989's
 * lib/redirectTrafficClass.js (whose own guard is check-redirect-traffic-class):
 *   - "suspect": a UA claiming modern Chrome/Firefox with no Sec-Fetch-Site /
 *     Sec-Fetch-Dest (the 2026-10-21 Ashburn sweep shape; #1989's burst gate
 *     ships OFF) gets a 200 noindex Continue page, never a partner 302, and a
 *     provider_redirect_refused (refusal_class suspect), never a started event;
 *     one tap (wf_confirm=1) proceeds as human.
 *   - OWNER RULE (2026-10-29): missing Fetch Metadata ALONE never makes a
 *     visitor suspect. A same-site Referer (gowayfind.com / www) or any
 *     first-party cookie (ph_<key>_posthog, wf_*) keeps the real redirect.
 *   - Every /go response is private, no-store with CDN-Cache-Control /
 *     Vercel-CDN-Cache-Control: no-store (a CDN-cached partner 302 is replayed
 *     without running the classifier), and /api/viator/go's ?q= Book keeps its
 *     Viator spend protection as a cache of the RESOLVED URL (memory + shared
 *     wf_places_cache): a repeat query, even on a cold instance, makes ZERO
 *     Partner API calls.
 *   - HEAD -> 204, no event (explicit HEAD export AND GET invoked as HEAD).
 *   - Next-Router-Prefetch / x-middleware-prefetch -> prefetch (204, no event).
 *   - Meta ads-review agent UA -> refused, never a partner.
 *   - Named crawlers / unfurlers (Googlebot, Slackbot, facebookexternalhit,
 *     iMessage) -> no partner, no human event.
 *   - Humans incl. mobile Safari and Instagram / Facebook / Pinterest in-app
 *     browsers still get the real redirect + one human started event
 *     (Pinterest in-app was refused by lib/crawler.js BOT_UA before this).
 *   - scripts/watchdog-affiliate-links.mjs, run END TO END as a child against a
 *     local server serving the REAL ticketmaster/hotels handlers with every
 *     off-127.0.0.1 fetch recorded: PASSes its tracking checks from the first
 *     hop, makes ZERO partner requests, produces ZERO captured events.
 * Everything is CALLED. Each negative has a positive control in the same harness.
 */
import { readdirSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// Hermetic fixture env — WRITE and DELETE only (check-guard-hermeticity).
// Analytics must be LIVE (intercepted) because emission is what we assert.
process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_guardtest_not_a_real_key";
delete process.env.WF_SUPPRESS_ANALYTICS;
delete process.env.NEXT_PUBLIC_IMPACT_SID;
delete process.env.NEXT_PUBLIC_TM_IMPACT_CAMPAIGN;
delete process.env.NEXT_PUBLIC_TM_IMPACT_AD;
delete process.env.NEXT_PUBLIC_TM_IMPACT_DESTPARAM;
delete process.env.WAYFIND_PREVIEW_PUBLIC_EVENTS;
delete process.env.REDIRECT_BURST_GATE;

const captured = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes("i.posthog.com/capture/")) {
    try { captured.push(JSON.parse((init && init.body) || "{}")); } catch {}
    return { ok: true, status: 200 };
  }
  return realFetch(url, init);
};
// captureServer is fire-and-forget; let its microtasks settle before reading.
const settle = () => new Promise((r) => setTimeout(r, 15));

const { classifyRedirectRequest } = await import(REPO + "lib/redirectTrafficClass.js");
const { isCrawler, isSyntheticMonitor } = await import(REPO + "lib/crawler.js");

/* ── fixtures ─────────────────────────────────────────────────────────────── */
const FETCH_META = { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", "sec-fetch-site": "same-origin", "sec-fetch-user": "?1" };
const UA = {
  desktopChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  mobileSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1",
  // Real UAs from the 2026-10-22 "instagram" surface (residential IPs, humans).
  instagramIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23G83 Instagram 452.0.1.39.54 (iPhone15,4; iOS 26_6_1; en_US; en; scale=3.00; 1179x2556; IABMV/1; 1093431980) Safari/604.1",
  instagramAndroid: "Mozilla/5.0 (Linux; Android 17; Pixel 7a Build/CP3A.261005.002.A1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/156.0.8078.51 Mobile Safari/537.36 Instagram 452.1.0.53.64 Android (37/17; 420dpi; 1080x2400; Google/google; Pixel 7a; lynx; lynx; en_US; 1096920925; IABMV/1)",
  facebookAndroid: "Mozilla/5.0 (Linux; Android 17; Pixel 7 Pro Build/CP3A.260905.009) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/155.0.8059.34 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/582.0.0.50.54;IABMV/1;]",
  pinterestIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [Pinterest/iOS]",
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  slackbot: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  facebookexternalhit: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  imessage: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0",
  metaAds: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23G71 Safari/604.1 [FBAN/FBIOS;FBAV/583.0.0.61.69;FBBV/1090364060;IABMV/1] meta-externalads/1.1",
  // The 2026-10-21 burst's exact UA.
  incident: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
  // The 2026-10-21 pattern as the owner quoted it (Windows variant).
  incidentWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
  synthetic: "WayfindSyntheticMonitor/1.0 (+https://www.gowayfind.com)",
};
const req = (url, { ua, meta = false, method = "GET", extra = {} } = {}) => {
  const h = new Headers();
  if (ua) h.set("user-agent", ua);
  if (meta) for (const [k, v] of Object.entries(FETCH_META)) h.set(k, v);
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return new Request(url, { method, headers: h });
};

/* ── A. classifier, CALLED ────────────────────────────────────────────────── */
const U = "https://www.gowayfind.com/api/viator/go?product=x";
const cls = async (o, url = U) => (await classifyRedirectRequest(req(url, o), { env: {} })).klass;
const A = [
  ["desktop Chrome + Fetch Metadata", { ua: UA.desktopChrome, meta: true }, "human"],
  ["mobile Safari, no Fetch Metadata", { ua: UA.mobileSafari }, "human"],
  ["Instagram iOS in-app, no Fetch Metadata", { ua: UA.instagramIos }, "human"],
  ["Instagram Android WebView, no Fetch Metadata", { ua: UA.instagramAndroid }, "human"],
  ["Facebook Android in-app, no Fetch Metadata", { ua: UA.facebookAndroid }, "human"],
  ["Pinterest iOS in-app", { ua: UA.pinterestIos }, "human"],
  ["no UA at all (privacy-hardened human)", {}, "human"],
  ["Googlebot", { ua: UA.googlebot }, "synthetic"],
  ["Slackbot-LinkExpanding", { ua: UA.slackbot }, "synthetic"],
  ["facebookexternalhit", { ua: UA.facebookexternalhit }, "synthetic"],
  ["iMessage unfurler", { ua: UA.imessage }, "synthetic"],
  ["Meta ads-review agent inside an FBAN UA", { ua: UA.metaAds }, "synthetic"],
  ["HEAD from a real browser UA", { ua: UA.desktopChrome, meta: true, method: "HEAD" }, "head"],
  ["Sec-Purpose: prefetch", { ua: UA.desktopChrome, meta: true, extra: { "sec-purpose": "prefetch" } }, "prefetch"],
  ["Sec-Purpose: prefetch;prerender", { ua: UA.desktopChrome, meta: true, extra: { "sec-purpose": "prefetch;prerender" } }, "prefetch"],
  ["Purpose: prefetch", { ua: UA.desktopChrome, meta: true, extra: { purpose: "prefetch" } }, "prefetch"],
  ["Next-Router-Prefetch", { ua: UA.desktopChrome, meta: true, extra: { "next-router-prefetch": "1" } }, "prefetch"],
  ["x-middleware-prefetch", { ua: UA.desktopChrome, meta: true, extra: { "x-middleware-prefetch": "1" } }, "prefetch"],
  ["2026-10-21 incident UA, no Fetch Metadata", { ua: UA.incident }, "suspect"],
  ["10-21 Windows Chrome/129.0, no Fetch Metadata, no cookie, no Referer", { ua: UA.incidentWin }, "suspect"],
  // OWNER RULE: missing Fetch Metadata alone is never enough.
  ["10-21 UA, no Fetch Metadata + Referer www.gowayfind.com", { ua: UA.incidentWin, extra: { referer: "https://www.gowayfind.com/guides/halloween" } }, "human"],
  ["10-21 UA, no Fetch Metadata + Referer gowayfind.com (apex)", { ua: UA.incidentWin, extra: { referer: "https://gowayfind.com/" } }, "human"],
  ["10-21 UA, no Fetch Metadata + PostHog ph_<key>_posthog cookie", { ua: UA.incidentWin, extra: { cookie: "ph_phc_abc123_posthog=%7B%22distinct_id%22%3A%22x%22%7D" } }, "human"],
  ["10-21 UA, no Fetch Metadata + wf_device cookie", { ua: UA.incidentWin, extra: { cookie: "foo=1; wf_device=d_abc123" } }, "human"],
  ["10-21 UA, no Fetch Metadata + wf_rails_collapsed cookie", { ua: UA.incidentWin, extra: { cookie: "wf_rails_collapsed=x" } }, "human"],
  // Controls: a look-alike signal is NOT first-party.
  ["10-21 UA, no Fetch Metadata + Referer gowayfind.com.evil.tld", { ua: UA.incidentWin, extra: { referer: "https://gowayfind.com.evil.tld/" } }, "suspect"],
  ["10-21 UA, no Fetch Metadata + Referer google.com", { ua: UA.incidentWin, extra: { referer: "https://www.google.com/" } }, "suspect"],
  ["10-21 UA, no Fetch Metadata + third-party cookie only", { ua: UA.incidentWin, extra: { cookie: "_ga=GA1.2.3; session=abc" } }, "suspect"],
  ["10-21 UA, no Fetch Metadata + empty wf_ cookie", { ua: UA.incidentWin, extra: { cookie: "wf_device=" } }, "suspect"],
  ["2026-10-21 incident UA WITH Fetch Metadata (a real headful browser)", { ua: UA.incident, meta: true }, "human"],
  ["our synthetic monitor / watchdog (exempt: real redirect; captureServer drops it)", { ua: UA.synthetic }, "human"],
];
for (const [label, o, want] of A) {
  const got = await cls(o);
  ok(got === want, `classifier: ${label} → expected ${want}, got ${got}`);
}
ok((await cls({ ua: UA.incident }, U + "&wf_confirm=1")) === "human", "classifier: a suspect that tapped the interstitial (wf_confirm=1) is human");
ok(isCrawler(UA.pinterestIos) === false, "isCrawler(): the Pinterest in-app browser is a person, never refused by the /go crawler gate");
ok(isCrawler("Pinterestbot/1.0 (+http://www.pinterest.com/bot.html)") === true, "isCrawler(): Pinterest's own crawler is still refused (positive control for the carve-out)");

/* ── B. every go route, CALLED ────────────────────────────────────────────── */
function findGoRoutes(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = dir + "/" + e.name;
    if (e.isDirectory()) { findGoRoutes(full, out); continue; }
    if (e.name === "route.js" && dir.split("/").pop() === "go") out.push(full.slice(full.indexOf("app/api")));
  }
  return out;
}
const ROUTES = findGoRoutes(REPO + "app/api").sort();
ok(ROUTES.length >= 4, `PROBE BROKEN: expected at least the 4 known go routes, found ${ROUTES.length}`);

// Otherwise-valid params; partner = the host only a real handoff reaches.
// commerce/go has no hermetic offer row (same limitation as
// check-go-routes-crawler-gate), so its human positive asserts the request was
// NOT classified/refused as non-human rather than a partner host.
const FIX = {
  "app/api/commerce/go/route.js": { q: "provider=unknown&offer=xyz", partner: null },
  "app/api/hotels/go/route.js": {
    q: "name=" + encodeURIComponent("Days Inn Bradenton - Near the Gulf") + "&address=" + encodeURIComponent("3506 1st Street West, Bradenton, FL") + "&content=wfh-days-inn-bradenton-near-the-gulf-27469",
    partner: "stay22.com",
  },
  "app/api/ticketmaster/go/route.js": { q: "url=" + encodeURIComponent("https://www.ticketmaster.com/event/123"), partner: "ticketmaster" },
  "app/api/viator/go/route.js": { q: "product=" + encodeURIComponent("https://www.viator.com/tours/Orlando/Airboat/d827-1234P5"), partner: "viator.com" },
};
const missing = ROUTES.filter((r) => !(r in FIX));
ok(missing.length === 0, `every discovered go route needs a fixture here (missing: ${missing.join(", ") || "none"})`);

const NON_HUMAN_REASONS = new Set(["crawler-refused"]);
for (const rel of ROUTES.filter((r) => r in FIX)) {
  const mod = await import(REPO + rel);
  const fx = FIX[rel];
  const url = (extra = "") => `https://www.gowayfind.com/${rel.replace(/^app\//, "").replace(/\/route\.js$/, "")}?${fx.q}${extra}`;
  const run = async (o, extra = "", handler = "GET") => {
    const before = captured.length;
    const res = await mod[handler](req(url(extra), o));
    await settle();
    const events = captured.slice(before);
    const loc = res.headers.get("location") || "";
    const body = res.status === 200 ? await res.text() : "";
    return { res, events, loc, body, started: events.filter((e) => e.event === "provider_redirect_started"), failed: events.filter((e) => e.event === "provider_redirect_failed"), refused: events.filter((e) => e.event === "provider_redirect_refused") };
  };
  const reachesPartner = (r) => !!fx.partner && r.loc.includes(fx.partner);

  // Humans: the real redirect, one human event.
  for (const [label, o] of [["desktop Chrome", { ua: UA.desktopChrome, meta: true }], ["mobile Safari", { ua: UA.mobileSafari }], ["Instagram in-app", { ua: UA.instagramIos }], ["Pinterest in-app", { ua: UA.pinterestIos }]]) {
    const r = await run(o);
    if (fx.partner) {
      ok(r.res.status === 302 && reachesPartner(r), `${rel} (${label}) gets the real partner redirect to ${fx.partner} (status ${r.res.status}, Location ${r.loc.slice(0, 80)})`);
      ok(r.started.length === 1 && r.started[0].properties.traffic_class === "human", `${rel} (${label}) emits exactly one provider_redirect_started tagged traffic_class=human (got ${r.started.length}, class ${r.started[0] && r.started[0].properties.traffic_class})`);
    } else {
      const reason = r.failed[0] && r.failed[0].properties.failure_reason;
      ok(r.events.length === 1 && r.refused.length === 0 && !NON_HUMAN_REASONS.has(reason) && r.events[0].properties.traffic_class === "human", `${rel} (${label}) is handled as a human (one event, traffic_class=human, not refused as non-human; got ${r.events.length} events, reason ${reason})`);
    }
  }

  // Named crawlers / unfurlers: the route's own isCrawler gate (crawler-refused, not human).
  for (const [label, o] of [["Googlebot", { ua: UA.googlebot }], ["Slackbot", { ua: UA.slackbot }], ["facebookexternalhit", { ua: UA.facebookexternalhit }], ["iMessage", { ua: UA.imessage }]]) {
    const r = await run(o);
    ok(!/viator\.com|ticketmaster|stay22|evyy\.net/.test(r.loc), `${rel} (${label}) must NOT be redirected to a partner (Location ${r.loc.slice(0, 80)})`);
    ok(r.started.length === 0, `${rel} (${label}) must emit NO provider_redirect_started (got ${r.started.length})`);
    ok(r.failed.length === 1 && r.failed[0].properties.failure_reason === "crawler-refused" && r.failed[0].properties.traffic_class !== "human", `${rel} (${label}) records one crawler-refused failure not tagged human (got ${r.failed.map((e) => e.properties.failure_reason + "/" + e.properties.traffic_class).join(",") || "none"})`);
  }
  // Meta ads-review agent (inside an FBAN UA, so isCrawler misses it): refused by the classifier.
  {
    const r = await run({ ua: UA.metaAds });
    ok(!/viator\.com|ticketmaster|stay22|evyy\.net/.test(r.loc), `${rel} (meta-externalads) must NOT be redirected to a partner (Location ${r.loc.slice(0, 80)})`);
    ok(r.started.length === 0 && r.refused.length === 1 && r.refused[0].properties.refusal_class === "synthetic", `${rel} (meta-externalads) emits one provider_redirect_refused (synthetic) and no started (got ${r.events.map((e) => e.event).join(",")})`);
  }

  // HEAD (exported handler AND GET invoked with method HEAD) and prefetch: silent.
  ok(typeof mod.HEAD === "function", `${rel} exports an explicit HEAD handler (Next would otherwise run GET for HEAD)`);
  for (const [label, o, handler, status] of [
    ["HEAD export", { ua: UA.desktopChrome, meta: true, method: "HEAD" }, "HEAD", 204],
    ["GET handler invoked as HEAD", { ua: UA.desktopChrome, meta: true, method: "HEAD" }, "GET", 204],
    ["Sec-Purpose prefetch (#1989 control)", { ua: UA.desktopChrome, meta: true, extra: { "sec-purpose": "prefetch" } }, "GET", 204],
    ["Next-Router-Prefetch", { ua: UA.desktopChrome, meta: true, extra: { "next-router-prefetch": "1" } }, "GET", 204],
    ["x-middleware-prefetch", { ua: UA.desktopChrome, meta: true, extra: { "x-middleware-prefetch": "1" } }, "GET", 204],
  ]) {
    if (handler === "HEAD" && typeof mod.HEAD !== "function") continue;
    const r = await run(o, "", handler);
    ok(r.res.status === status && !r.loc, `${rel} (${label}) answers ${status} with no Location (got ${r.res.status}, Location ${r.loc.slice(0, 60)})`);
    ok(r.events.length === 0, `${rel} (${label}) emits NO event at all (got ${r.events.map((e) => e.event).join(",")})`);
  }

  // The incident shape: interstitial, no partner anywhere, one suspect failure.
  {
    const r = await run({ ua: UA.incident });
    ok(r.res.status === 200 && !r.loc, `${rel} (2026-10-21 incident UA) gets a 200 interstitial, not a redirect (got ${r.res.status})`);
    ok(/noindex/.test(r.res.headers.get("x-robots-tag") || "") && /no-store/.test(r.res.headers.get("cache-control") || ""), `${rel} (incident UA) interstitial is noindex + no-store`);
    ok(!/https?:\/\/[^\s"'<>]*(?:viator|ticketmaster|stay22|evyy|booking)\./i.test(r.body.replace(/value="[^"]*"/g, "")), `${rel} (incident UA) interstitial carries no partner URL outside the echoed form values`);
    ok(/name="wf_confirm" value="1"/.test(r.body), `${rel} (incident UA) interstitial offers the one-tap continue (wf_confirm=1)`);
    ok(r.started.length === 0 && r.events.length === 1 && r.refused.length === 1 && r.refused[0].properties.refusal_class === "suspect", `${rel} (incident UA) emits one provider_redirect_refused (suspect) and no started (got ${r.events.map((e) => e.event + "/" + (e.properties.refusal_class || e.properties.failure_reason)).join(",")})`);
    if (fx.partner) {
      const c = await run({ ua: UA.incident }, "&wf_confirm=1");
      ok(c.res.status === 302 && reachesPartner(c) && c.started.length === 1 && c.started[0].properties.traffic_class === "human", `${rel} (incident UA after tapping Continue) gets the real redirect + one human started event (status ${c.res.status})`);
    }
  }

  // OWNER RULE, through the real handler: the 10-21 UA with a first-party
  // signal is a human (real redirect, one human started event, no refusal).
  for (const [label, extra] of [
    ["same-site Referer", { referer: "https://www.gowayfind.com/guides/halloween" }],
    ["PostHog cookie", { cookie: "ph_phc_guardtest_not_a_real_key_posthog=" + encodeURIComponent(JSON.stringify({ distinct_id: "guard-person" })) }],
    ["wf_device cookie", { cookie: "wf_device=d_guard123" }],
  ]) {
    const r = await run({ ua: UA.incidentWin, extra });
    ok(r.refused.length === 0 && r.res.status === 302, `${rel} (10-21 UA, no Fetch Metadata, ${label}) is NOT held at the interstitial (status ${r.res.status}, refused ${r.refused.length})`);
    if (fx.partner) ok(reachesPartner(r) && r.started.length === 1 && r.started[0].properties.traffic_class === "human", `${rel} (10-21 UA + ${label}) gets the real partner redirect + one human started event (Location ${r.loc.slice(0, 60)}, started ${r.started.length})`);
  }
  {
    const r = await run({ ua: UA.incidentWin });
    ok(r.res.status === 200 && !r.loc && r.refused.length === 1 && r.refused[0].properties.refusal_class === "suspect", `${rel} (10-21 Windows UA, no cookie, no Referer) gets the Continue page (status ${r.res.status})`);
  }

  // CACHE POLICY: every response shape from every go route is per-request.
  for (const [label, o, extra, handler] of [
    ["human redirect", { ua: UA.desktopChrome, meta: true }, "", "GET"],
    ["crawler refusal", { ua: UA.googlebot }, "", "GET"],
    ["suspect interstitial", { ua: UA.incidentWin }, "", "GET"],
    ["prefetch 204", { ua: UA.desktopChrome, meta: true, extra: { "next-router-prefetch": "1" } }, "", "GET"],
    ["HEAD 204", { ua: UA.desktopChrome, meta: true, method: "HEAD" }, "", "HEAD"],
    ["synthetic refusal", { ua: UA.metaAds }, "", "GET"],
  ]) {
    const r = await run(o, extra, handler);
    const cc = r.res.headers.get("cache-control") || "";
    ok(/\bprivate\b/.test(cc) && /\bno-store\b/.test(cc) && !/s-maxage|\bpublic\b/.test(cc), `${rel} (${label}) Cache-Control must be private, no-store and never CDN-cacheable (got ${JSON.stringify(cc)})`);
    ok(/no-store/.test(r.res.headers.get("cdn-cache-control") || "") && /no-store/.test(r.res.headers.get("vercel-cdn-cache-control") || ""), `${rel} (${label}) must forbid CDN copies (CDN-Cache-Control / Vercel-CDN-Cache-Control: no-store)`);
  }

  // Internal: real redirect (where hermetic), zero analytics.
  {
    const r = await run({ ua: UA.synthetic });
    ok(r.events.length === 0, `${rel} (internal probe UA) captures NOTHING (got ${r.events.map((e) => e.event).join(",")})`);
    if (fx.partner) ok(r.res.status === 302 && reachesPartner(r), `${rel} (internal probe UA) still gets the real attributed Location to inspect (got ${r.res.status} ${r.loc.slice(0, 60)})`);
  }
}

/* ── D. the watchdog, END TO END, against a local server ─────────────────── */
{
  const { withViatorTracking } = await import(REPO + "lib/affiliates.js");
  const tm = await import(REPO + "app/api/ticketmaster/go/route.js");
  const hotels = await import(REPO + "app/api/hotels/go/route.js");
  const seenUAs = [];
  const server = createServer(async (inReq, out) => {
    try {
      seenUAs.push(String(inReq.headers["user-agent"] || ""));
      const url = "http://" + inReq.headers.host + inReq.url;
      const headers = new Headers();
      for (const [k, v] of Object.entries(inReq.headers)) if (typeof v === "string") headers.set(k, v);
      let res;
      if (inReq.url.startsWith("/api/ticketmaster/go")) res = await tm.GET(new Request(url, { headers }));
      else if (inReq.url.startsWith("/api/hotels/go")) res = await hotels.GET(new Request(url, { headers }));
      else if (inReq.url.startsWith("/api/commerce/go")) {
        // commerce/go's viator offer needs the live DB; stand in with the
        // real attribution builder so the watchdog's pid check has a real input.
        res = new Response(null, { status: 302, headers: { Location: withViatorTracking("https://www.viator.com/tours/Orlando/Airboat/d827-1234P5") } });
      } else if (inReq.url === "/" || inReq.url.startsWith("/?")) {
        res = new Response('<html><body><a href="/api/commerce/go?provider=viator&amp;offer=v1&amp;surface=home">Book</a></body></html>', { status: 200, headers: { "Content-Type": "text/html" } });
      } else res = new Response("nf", { status: 404 });
      const h = {};
      res.headers.forEach((v, k) => { h[k] = v; });
      out.writeHead(res.status, h);
      out.end(res.status === 200 ? await res.text() : undefined);
    } catch (e) {
      out.writeHead(500); out.end(String(e));
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const beforeCaptures = captured.length;

  // Preload for the CHILD: every fetch to a non-127.0.0.1 host is recorded and
  // refused. That is the "no partner contact" instrument.
  const preload = "data:text/javascript," + encodeURIComponent(`
    const real = globalThis.fetch;
    globalThis.fetch = (u, i) => {
      const host = new URL(String(u && u.url ? u.url : u)).hostname;
      if (host !== "127.0.0.1") { process.stderr.write("WF_OFFSITE_FETCH " + host + "\\n"); return Promise.reject(new TypeError("offsite fetch blocked by guard: " + host)); }
      return real(u, i);
    };`);
  const runChild = (args) => new Promise((resolve) => {
    const env = { ...process.env, WF_SUPPRESS_ANALYTICS: "1" };
    const c = spawn(process.execPath, ["--import", preload, ...args], { cwd: REPO, env });
    let so = "", se = "";
    c.stdout.on("data", (d) => { so += d; });
    c.stderr.on("data", (d) => { se += d; });
    c.on("close", (code) => resolve({ code, so, se }));
  });

  // Positive control for the instrument: a child that DOES fetch off-site must be caught.
  const ctl = await runChild(["--input-type=module", "-e", "try { await fetch('https://partner.example/x'); } catch {}"]);
  ok(/WF_OFFSITE_FETCH partner\.example/.test(ctl.se), "PROBE BROKEN: the off-site fetch recorder must catch a deliberate off-site fetch (else 'zero partner fetches' below proves nothing)");

  const w = await runChild(["scripts/watchdog-affiliate-links.mjs", `--base-url=http://127.0.0.1:${port}`]);
  await settle();
  server.close();
  const offsite = (w.se.match(/WF_OFFSITE_FETCH \S+/g) || []);
  ok(offsite.length === 0, `watchdog must make ZERO requests outside our origin — no partner click per run (saw: ${offsite.join(", ")})`);
  ok(seenUAs.length >= 3, `PROBE BROKEN: the local server must have served the watchdog's probes (served ${seenUAs.length})`);
  ok(seenUAs.length > 0 && seenUAs.every((ua) => isSyntheticMonitor(ua) && !isCrawler(ua)), `every watchdog request identifies as our internal probe (isSyntheticMonitor && !isCrawler); saw: ${[...new Set(seenUAs)].join(" | ")}`);
  for (const name of ["ticketmaster", "viator", "stay22"]) {
    ok(new RegExp("^PASS " + name + "\\b", "m").test(w.so), `watchdog still PASSES its ${name} tracking check from the first (Wayfind-issued) hop alone; output:\n${w.so.slice(0, 1200)}`);
  }
  ok(captured.length === beforeCaptures, `watchdog run through the REAL ticketmaster/hotels handlers captured ${captured.length - beforeCaptures} events (must be 0 — it is never a human)`);
}

/* ── E. Viator spend protection = cache of the RESOLVED URL ─────────────────
 * The ?q= Book branch used to rely on public, s-maxage=3600 (60 on a miss) so
 * the CDN, not the function, absorbed repeat queries (#196). That redirect is
 * no-store now; the same protection must hold one layer down. Every network
 * call is intercepted: the ledger (wf_spend_take) says yes, Supabase's
 * wf_places_cache is a tiny in-process table, freetext calls are COUNTED. */
{
  const table = new Map();
  let freetext = 0;
  let freetextBody = { products: { results: [] } };
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes("i.posthog.com/capture/")) return { ok: true, status: 200, text: async () => "" };
    if (u.includes("/rest/v1/rpc/wf_spend_take")) return { ok: true, status: 200, json: async () => true, text: async () => "true" };
    if (u.includes("api.viator.com/partner/search/freetext")) { freetext++; return { ok: true, status: 200, json: async () => freetextBody }; }
    if (u.includes("/rest/v1/wf_places_cache")) {
      if (String(init.method || "GET").toUpperCase() === "POST") {
        try { const row = JSON.parse(init.body); table.set(row.k, row); } catch {}
        return { ok: true, status: 201, text: async () => "" };
      }
      const k = decodeURIComponent((u.match(/[?&]k=eq\.([^&]*)/) || [])[1] || "");
      return { ok: true, status: 200, json: async () => (table.has(k) ? [table.get(k)] : []) };
    }
    return { ok: false, status: 503, json: async () => ({}), text: async () => "" };
  };
  process.env.VIATOR_API_KEY = "guardtest-viator-key-not-real";
  process.env.VIATOR_MONTH_CAP = "999999999";
  process.env.WAYFIND_GATE = "open";
  process.env.SUPABASE_URL = "https://guardtest-fake-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "guardtest-fake-service-role-key-not-real";

  const human = { ua: UA.desktopChrome, meta: true };
  const coldRoute = async (tag) => import(REPO + "app/api/viator/go/route.js?cold=" + tag);
  const book = async (mod, qs) => {
    const before = freetext;
    const res = await mod.GET(req("https://www.gowayfind.com/api/viator/go?" + qs, human));
    await settle();
    return { res, calls: freetext - before, loc: res.headers.get("location") || "", cc: res.headers.get("cache-control") || "" };
  };
  const coldCache = () => { if (globalThis.__wfServerCacheMem) globalThis.__wfServerCacheMem.clear(); };

  // E1. A MISS (no verified product) is cached for the old 60 s edge window.
  const miss = "q=" + encodeURIComponent("guard nowhere tour") + "&city=Bradenton&region=" + encodeURIComponent("Bradenton, Tampa Bay");
  const m1 = await coldRoute("m1");
  const a = await book(m1, miss);
  ok(a.calls === 1, `PROBE BROKEN unless 1: the first ?q= Book must reach the Partner API (calls ${a.calls})`);
  ok(/no-store/.test(a.cc) && !/s-maxage/.test(a.cc), `the ?q= Book redirect is no-store, never CDN-cached (got ${JSON.stringify(a.cc)})`);
  ok(!/viator\.com/.test(a.loc), `a miss fails closed to our origin (got ${a.loc.slice(0, 60)})`);
  const b = await book(m1, miss);
  ok(b.calls === 0, `a repeat MISS on a warm instance makes ZERO Partner API calls (made ${b.calls})`);
  coldCache();
  const m2 = await coldRoute("m2");
  const c = await book(m2, miss);
  ok(c.calls === 0, `a repeat MISS on a COLD instance reuses the shared resolved-URL row: ZERO Partner API calls (made ${c.calls})`);

  // E2. A verified PRODUCT is cached 1 h and served on a cold instance too.
  freetextBody = { products: { results: [
    { title: "Bradenton Area Highlights Tour", productUrl: "https://www.viator.com/tours/x1", productCode: "X1" },
    { title: "Robinson Preserve Kayak Eco Tour in Bradenton", productUrl: "https://www.viator.com/tours/Bradenton/x2", productCode: "X2" },
  ] } };
  const hit = "q=" + encodeURIComponent("Robinson Preserve") + "&city=Bradenton&region=" + encodeURIComponent("Bradenton, Tampa Bay") + "&kind=waterfront";
  const p1 = await coldRoute("p1");
  const d = await book(p1, hit);
  ok(d.calls === 1 && /viator\.com\/tours\/Bradenton\/x2/.test(d.loc), `PROBE BROKEN unless the first verified Book reaches the API once and lands on the product (calls ${d.calls}, Location ${d.loc.slice(0, 80)})`);
  ok(/no-store/.test(d.cc) && !/s-maxage/.test(d.cc), `a verified product redirect is no-store (got ${JSON.stringify(d.cc)})`);
  coldCache();
  const p2 = await coldRoute("p2");
  const e = await book(p2, hit);
  ok(e.calls === 0 && /viator\.com\/tours\/Bradenton\/x2/.test(e.loc), `a repeat verified Book on a COLD instance serves the cached product with ZERO Partner API calls (calls ${e.calls}, Location ${e.loc.slice(0, 80)})`);
  ok(/[?&]pid=/.test(e.loc), `the cached product still gets attribution stamped per request (Location ${e.loc.slice(0, 100)})`);
  // Positive control: a DIFFERENT query is not served from the cache.
  const f = await book(p2, "q=" + encodeURIComponent("Robinson Preserve sunset") + "&city=Bradenton&region=" + encodeURIComponent("Bradenton, Tampa Bay") + "&kind=waterfront");
  ok(f.calls === 1, `PROBE BROKEN unless 1: a new query must still reach the API (calls ${f.calls}) — else the zeros above prove nothing`);
  globalThis.fetch = prev;
}

globalThis.fetch = realFetch;
if (fail.length) {
  console.error("check-redirect-suspect-gate: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-redirect-suspect-gate: OK — ${pass} assertions; ${A.length + 1} classifier fixtures, ${ROUTES.length} go routes called (humans incl. Instagram/Pinterest in-app redirected + counted; crawlers/unfurlers/meta-ads/HEAD/Next-prefetch/10-21-incident-UA never reach a partner nor count as human; synthetic monitor captures nothing; first-party Referer/cookie keeps a header-less visitor human; every /go response private no-store); watchdog run end-to-end with 0 off-origin fetches; Viator ?q= resolved-URL cache holds spend with no CDN-cached redirect`);
