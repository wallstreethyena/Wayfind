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
 *   - THE "2023 ROTATION" SCRAPER (2026-11-10): the ten exact desktop
 *     identities in lib/crawler.js isStaleRotationUa() get the SAME Continue
 *     page even WITH full Fetch Metadata and a same-site Referer, unless the
 *     request carries a cookie this site sets or wf_confirm=1. Exactly ten
 *     identities match in a version sweep (a phone on the same Chrome never
 *     does), lib/browserAnalytics.js's inlined mirror agrees on every one, and
 *     every discovered go route is disallowed in app/robots.js.
 *   - DESKTOP ZERO PROOF (2026-11-11 owner rule): a computer browser that opens
 *     a go URL with none of the four click proofs (click_id, a cookie this site
 *     sets, a same-site Referer, an off-site direct-link surface) gets the same
 *     Continue page. Any ONE proof is a person and goes straight through, as do
 *     phones, tablets, in-app browsers, the synthetic monitor, and anyone who
 *     taps Continue. REDIRECT_ZERO_PROOF_GATE=off turns the rule off.
 * Everything is CALLED. Each negative has a positive control in the same harness.
 */
import { readdirSync, readFileSync } from "node:fs";
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
const { isCrawler, isSyntheticMonitor, isStaleRotationUa } = await import(REPO + "lib/crawler.js");
const browserAnalytics = await import(REPO + "lib/browserAnalytics.js");

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
  // 2026-11-10 "2023 rotation" scraper: three of its ten exact identities.
  staleWinChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  staleWinEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
  staleMacFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
  // Android 7 is stuck on Chrome 119 for good: a person, never the scraper.
  androidChrome119: "Mozilla/5.0 (Linux; Android 7.0; SM-G930V) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
  // One major either side of the Windows Chrome range, and a Mac build the scraper never used.
  winChrome117: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
  winChrome121: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  macChrome118: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
};
const GUARD_PH_COOKIE = "ph_phc_guardtest_not_a_real_key_posthog=" + encodeURIComponent(JSON.stringify({ distinct_id: "guard-person" }));
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
  // 2026-11-11 owner rule: desktop + ZERO click proof = the Continue page. One proof = a person.
  ["desktop Chrome + Fetch Metadata, ZERO click proof (2026-11-11 owner rule)", { ua: UA.desktopChrome, meta: true }, "suspect"],
  ["desktop Chrome + same-site Referer (a tap on a Wayfind page)", { ua: UA.desktopChrome, meta: true, extra: { referer: "https://www.gowayfind.com/guides/things-to-do-sarasota" } }, "human"],
  ["desktop Chrome + wf_device cookie, no Referer", { ua: UA.desktopChrome, meta: true, extra: { cookie: "wf_device=d_abc123" } }, "human"],
  ["desktop Chrome + PostHog cookie, no Referer", { ua: UA.desktopChrome, meta: true, extra: { cookie: GUARD_PH_COOKIE } }, "human"],
  ["desktop Chrome + third-party cookie only (not a proof)", { ua: UA.desktopChrome, meta: true, extra: { cookie: "_ga=GA1.2.3; session=abc" } }, "suspect"],
  ["desktop Chrome + another site's Referer (not a proof)", { ua: UA.desktopChrome, meta: true, extra: { referer: "https://example.com/list" } }, "suspect"],
  ["desktop Firefox on Linux, zero click proof", { ua: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0", meta: true }, "suspect"],
  ["desktop Chrome on Windows 149, zero click proof", { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36", meta: true }, "suspect"],
  // Phones, tablets and in-app browsers keep the 10-31 rule: labelled, never stopped.
  ["Android Chrome, zero click proof (phones are never touched)", { ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36", meta: true }, "human"],
  ["Android tablet Chrome, zero click proof", { ua: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36", meta: true }, "human"],
  ["iPad Safari (Mobile token), zero click proof", { ua: "Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1", meta: true }, "human"],
  ["Facebook in-app on Android, zero click proof", { ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]", meta: true }, "human"],
  // An in-app browser can send a desktop-class OS string (iPad apps do). Still in-app: never touched.
  ["Facebook in-app with a Mac-class UA, zero click proof", { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) [FBAN/FBIOS;FBAV/480.0.0.0;FBSV/18.7]", meta: true }, "human"],
  ["Instagram in-app with a Mac-class UA, zero click proof", { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Instagram 350.0.0.0", meta: true }, "human"],
  ["TikTok in-app with a Mac-class UA, zero click proof", { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) musical_ly_40.0.0 BytedanceWebview/d8a21c6", meta: true }, "human"],
  ["TikTok in-app on iPhone, zero click proof", { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_40.0.0 JsSdk/2.0 BytedanceWebview/d8a21c6", meta: true }, "human"],
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
  // Until 2026-11-11 Fetch Metadata alone made this human. It is a desktop claim, so it now also needs one click proof.
  ["2026-10-21 incident UA WITH Fetch Metadata and a same-site Referer (a real headful browser on a Wayfind page)", { ua: UA.incident, meta: true, extra: { referer: "https://www.gowayfind.com/guides/things-to-do-sarasota" } }, "human"],
  ["2026-10-21 incident UA WITH Fetch Metadata but zero click proof (2026-11-11 owner rule)", { ua: UA.incident, meta: true }, "suspect"],
  ["our synthetic monitor / watchdog (exempt: real redirect; captureServer drops it)", { ua: UA.synthetic }, "human"],
  // 2026-11-10: the 2023-rotation scraper drives a real browser, so it HAS Fetch Metadata.
  ["2023 rotation: Windows Chrome/120 WITH Fetch Metadata, no cookie", { ua: UA.staleWinChrome, meta: true }, "suspect"],
  ["2023 rotation: Windows Edg/119 WITH Fetch Metadata, no cookie", { ua: UA.staleWinEdge, meta: true }, "suspect"],
  ["2023 rotation: Mac Firefox/121 WITH Fetch Metadata, no cookie", { ua: UA.staleMacFirefox, meta: true }, "suspect"],
  ["2023 rotation: no Fetch Metadata, no cookie", { ua: UA.staleWinChrome }, "suspect"],
  // 6 of its 281 go-route requests sent a same-site Referer: NOT a pass for these ten identities.
  ["2023 rotation + same-site Referer, no cookie", { ua: UA.staleWinChrome, meta: true, extra: { referer: "https://www.gowayfind.com/guides/things-to-do-sarasota" } }, "suspect"],
  ["2023 rotation + third-party cookie only", { ua: UA.staleWinChrome, meta: true, extra: { cookie: "_ga=GA1.2.3; session=abc" } }, "suspect"],
  ["2023 rotation + empty wf_ cookie", { ua: UA.staleWinChrome, meta: true, extra: { cookie: "wf_device=" } }, "suspect"],
  // A cookie this site sets is the pass: a person on an old build who loaded any page has one.
  ["2023 rotation UA + wf_device cookie (a person on an old build)", { ua: UA.staleWinChrome, meta: true, extra: { cookie: "foo=1; wf_device=d_abc123" } }, "human"],
  ["2023 rotation UA + PostHog cookie", { ua: UA.staleMacFirefox, meta: true, extra: { cookie: GUARD_PH_COOKIE } }, "human"],
  ["2023 rotation UA + wf_device cookie AND same-site Referer", { ua: UA.staleWinEdge, meta: true, extra: { cookie: "wf_device=d_abc123", referer: "https://www.gowayfind.com/" } }, "human"],
  // Controls: the same Chrome on a phone, and the nearest desktop builds the scraper never used.
  ["Android 7 Chrome/119 Mobile (stuck there for good), no cookie", { ua: UA.androidChrome119, meta: true }, "human"],
  // A same-site Referer with no cookie is a pass for every other desktop build; only the ten identities need the cookie.
  ["Windows Chrome/117 (one below the range) + same-site Referer, no cookie", { ua: UA.winChrome117, meta: true, extra: { referer: "https://www.gowayfind.com/guides/things-to-do-sarasota" } }, "human"],
  ["Windows Chrome/121 (one above the range) + same-site Referer, no cookie", { ua: UA.winChrome121, meta: true, extra: { referer: "https://www.gowayfind.com/guides/things-to-do-sarasota" } }, "human"],
  ["Mac Chrome/118 (a Windows-only identity) + same-site Referer, no cookie", { ua: UA.macChrome118, meta: true, extra: { referer: "https://www.gowayfind.com/guides/things-to-do-sarasota" } }, "human"],
];
for (const [label, o, want] of A) {
  const got = await cls(o);
  ok(got === want, `classifier: ${label} → expected ${want}, got ${got}`);
}
ok((await cls({ ua: UA.incident }, U + "&wf_confirm=1")) === "human", "classifier: a suspect that tapped the interstitial (wf_confirm=1) is human");
ok((await cls({ ua: UA.staleWinChrome, meta: true }, U + "&wf_confirm=1")) === "human", "classifier: a 2023-rotation identity that tapped the interstitial (wf_confirm=1) is human");
{
  const r = await classifyRedirectRequest(req(U, { ua: UA.staleWinChrome, meta: true }), { env: {} });
  ok(r.reason === "stale-rotation-ua", `classifier: the 2023-rotation suspect carries its own reason (got ${r.reason})`);
}

// 2026-11-11 desktop zero proof: the proofs that ride in the URL, the reason, and the off switch.
{
  const zero = { ua: UA.desktopChrome, meta: true };
  const r = await classifyRedirectRequest(req(U, zero), { env: {} });
  ok(r.klass === "suspect" && r.reason === "desktop-zero-proof:same-origin", `classifier: desktop zero proof carries its own reason plus what the browser said about the navigation (got ${r.klass}/${r.reason})`);
  // The reason suffix is the measurement: where did the browser say this navigation came from?
  const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3.1 Safari/605.1.15";
  for (const [site, want] of [["none", "none"], ["cross-site", "cross-site"], ["same-site", "same-site"], ["SAME-ORIGIN", "same-origin"], ["weird value", "absent"]]) {
    const k = await classifyRedirectRequest(req(U, { ua: SAFARI_MAC, extra: { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", "sec-fetch-site": site } }), { env: {} });
    ok(k.klass === "suspect" && k.reason === "desktop-zero-proof:" + want, `classifier: Sec-Fetch-Site ${JSON.stringify(site)} is recorded as desktop-zero-proof:${want} (got ${k.klass}/${k.reason})`);
  }
  {
    const k = await classifyRedirectRequest(req(U, { ua: SAFARI_MAC }), { env: {} });
    ok(k.klass === "suspect" && k.reason === "desktop-zero-proof:absent", `classifier: a desktop Safari that sends no Fetch Metadata at all is desktop-zero-proof:absent (got ${k.klass}/${k.reason})`);
  }
  // Our own off-site shortlink is a direct link; the on-site social_* surfaces are not.
  ok((await cls(zero, U + "&surface=social_shortlink")) === "human", "classifier: desktop + our own /go shortlink surface (social_shortlink) is human");
  ok((await cls(zero, U + "&surface=social_find_browse")) === "suspect", "classifier: an ON-site social_* surface is not a direct link");
  ok((await cls({ ua: UA.desktopChrome, meta: true, extra: { referer: "https://blog.gowayfind.com/sarasota-weekend" } }, U)) === "human", "classifier: desktop + a Referer from our own blog host is human");
  ok((await cls({ ua: UA.desktopChrome, meta: true, extra: { referer: "https://blog.gowayfind.com.evil.example/" } }, U)) === "suspect", "classifier: a look-alike blog host is not first-party");
  // KNOWN LIMIT, pinned on purpose: a tablet or phone that asks for the desktop site is
  // identical to a computer on the wire. It gets one Continue tap with zero proof, and
  // goes straight through with any proof.
  const IPAD_AS_MAC = SAFARI_MAC;
  ok((await cls({ ua: IPAD_AS_MAC, meta: true }, U)) === "suspect", "known limit: iPadOS Safari (it sends a Mac UA) with zero proof gets the Continue page, like a Mac");
  ok((await cls({ ua: IPAD_AS_MAC, meta: true, extra: { cookie: "wf_device=d_abc123" } }, U)) === "human", "known limit control: the same iPad with a cookie of ours is human");
  ok((await cls({ ua: IPAD_AS_MAC, meta: true }, U + "&click_id=clk_guard12345678")) === "human", "known limit control: the same iPad with a page-minted click_id is human");
  ok((await cls({ ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Silk/120.4.1 like Chrome/120.0.0.0 Safari/537.36", meta: true }, U)) === "human", "an Amazon Silk tablet in desktop mode is still a tablet (never touched)");
  ok((await cls(zero, U + "&click_id=clk_guard12345678")) === "human", "classifier: desktop + a click_id the page minted is a tap (human)");
  ok((await cls(zero, U + "&click_id=x")) === "suspect", "classifier: desktop + a malformed click_id is not a proof");
  ok((await cls(zero, U + "&surface=instagram_bio")) === "human", "classifier: desktop + an off-site direct-link surface (bio link) is human");
  ok((await cls(zero, U + "&surface=email_weekly")) === "human", "classifier: desktop + an email surface is human");
  ok((await cls(zero, U + "&surface=guide_pick")) === "suspect", "classifier: desktop + an ON-site surface with no other proof is not a direct link");
  ok((await cls(zero, U + "&wf_confirm=1")) === "human", "classifier: desktop zero proof that tapped Continue (wf_confirm=1) is human");
  for (const off of ["off", "0", "false", "OFF"]) {
    const k = await classifyRedirectRequest(req(U, zero), { env: { REDIRECT_ZERO_PROOF_GATE: off } });
    ok(k.klass === "human", `classifier: REDIRECT_ZERO_PROOF_GATE=${off} turns the desktop zero-proof rule off (got ${k.klass}/${k.reason})`);
  }
  for (const on of ["", "1", "on", "anything-else"]) {
    const k = await classifyRedirectRequest(req(U, zero), { env: { REDIRECT_ZERO_PROOF_GATE: on } });
    ok(k.klass === "suspect", `classifier: REDIRECT_ZERO_PROOF_GATE=${JSON.stringify(on)} leaves the rule ON (only an explicit off value disables it; got ${k.klass})`);
  }
  // The off switch does not reach the older gates.
  const stale = await classifyRedirectRequest(req(U, { ua: UA.staleWinChrome, meta: true, extra: { referer: "https://www.gowayfind.com/" } }), { env: { REDIRECT_ZERO_PROOF_GATE: "off" } });
  ok(stale.klass === "suspect" && stale.reason === "stale-rotation-ua", `classifier: the off switch leaves the 2023-rotation gate in place (got ${stale.klass}/${stale.reason})`);
}

/* ── A2. the ten identities, SWEPT, and the browser-side mirror ───────────── */
{
  const SHAPES = {
    "windows chrome": (v) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
    "windows edge": (v) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36 Edg/${v}.0.0.0`,
    "windows firefox": (v) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`,
    "mac chrome": (v) => `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
    "mac edge": (v) => `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36 Edg/${v}.0.0.0`,
    "mac firefox": (v) => `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`,
    "linux chrome": (v) => `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
    "chromeos chrome": (v) => `Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
    "linux firefox": (v) => `Mozilla/5.0 (X11; Linux x86_64; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`,
    "android chrome": (v) => `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Mobile Safari/537.36`,
    "android tablet chrome": (v) => `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
    "android firefox": (v) => `Mozilla/5.0 (Android 14; Mobile; rv:${v}.0) Gecko/${v}.0 Firefox/${v}.0`,
    "windows opera": (v) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36 OPR/106.0.0.0`,
    "android webview (in-app)": (v) => `Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/${v}.0.0.0 Mobile Safari/537.36`,
    "windows headless chrome": (v) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/${v}.0.0.0 Safari/537.36`,
  };
  const WANT = ["mac chrome 119", "mac chrome 120", "mac firefox 121", "windows chrome 118", "windows chrome 119", "windows chrome 120", "windows edge 119", "windows edge 120", "windows firefox 120", "windows firefox 121"];
  const hit = [];
  const drift = [];
  let swept = 0;
  for (const [shape, make] of Object.entries(SHAPES)) {
    for (let v = 100; v <= 160; v++) {
      const ua = make(v);
      swept++;
      if (isStaleRotationUa(ua)) hit.push(shape + " " + v);
      if (browserAnalytics.isStaleRotationUa(ua) !== isStaleRotationUa(ua)) drift.push(shape + " " + v);
    }
  }
  ok(swept === Object.keys(SHAPES).length * 61, `PROBE BROKEN: the sweep must cover every shape x 61 majors (covered ${swept})`);
  ok(JSON.stringify(hit.sort()) === JSON.stringify(WANT), `isStaleRotationUa() matches EXACTLY the ten measured identities in a ${swept}-UA sweep, nothing wider (matched: ${hit.join(", ") || "none"})`);
  {
    const decl = (file) => { const src = readFileSync(REPO + file, "utf8"); const a = src.match(/const STALE_ROTATION_OS = \[[\s\S]*?\n\];/); const b = src.match(/const NOT_PLAIN_DESKTOP_UA = .*;/); return a && b ? a[0] + "\n" + b[0] : null; };
    const server = decl("lib/crawler.js"), browser = decl("lib/browserAnalytics.js");
    ok(!!server && !!browser, "PROBE BROKEN: both files must declare STALE_ROTATION_OS and NOT_PLAIN_DESKTOP_UA");
    ok(server === browser, "the identity table and the exclusion pattern are character-for-character identical in lib/crawler.js and lib/browserAnalytics.js");
  }
  ok(drift.length === 0, `lib/browserAnalytics.js isStaleRotationUa() (the inlined mirror) agrees with lib/crawler.js on every swept UA (drift: ${drift.slice(0, 6).join(", ") || "none"})`);
  for (const [label, ua] of [["empty", ""], ["null", null], ["Safari 18", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3.1 Safari/605.1.15"], ["iPhone Safari", UA.mobileSafari], ["Instagram in-app", UA.instagramAndroid], ["Pinterest in-app", UA.pinterestIos], ["Googlebot", UA.googlebot]]) {
    ok(isStaleRotationUa(ua) === false && browserAnalytics.isStaleRotationUa(ua) === false, `isStaleRotationUa(): ${label} is never the scraper, in either copy`);
  }
}

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
process.env.STUBHUB_PARTNERIZE_CAMREF = "guardcamref1"; // hermetic fixture: the StubHub route ships dark and only redirects with a camref (WRITE only)
const FIX = {
  "app/api/commerce/go/route.js": { q: "provider=unknown&offer=xyz", partner: null },
  "app/api/hotels/go/route.js": {
    q: "name=" + encodeURIComponent("Days Inn Bradenton - Near the Gulf") + "&address=" + encodeURIComponent("3506 1st Street West, Bradenton, FL") + "&content=wfh-days-inn-bradenton-near-the-gulf-27469",
    partner: "stay22.com",
  },
  "app/api/ticketmaster/go/route.js": { q: "url=" + encodeURIComponent("https://www.ticketmaster.com/event/123"), partner: "ticketmaster" },
  "app/api/stubhub/go/route.js": { q: "url=" + encodeURIComponent("https://www.stubhub.com/event/123"), partner: "stubhub.prf.hn" },
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
  for (const [label, o] of [["desktop Chrome", { ua: UA.desktopChrome, meta: true, extra: { referer: "https://www.gowayfind.com/guides/things-to-do-sarasota" } }], ["mobile Safari", { ua: UA.mobileSafari }], ["Instagram in-app", { ua: UA.instagramIos }], ["Pinterest in-app", { ua: UA.pinterestIos }]]) {
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

  // THE 2023-ROTATION SCRAPER, through the real handler: full Fetch Metadata
  // (it drives a real browser) and still the Continue page, never a partner.
  for (const [label, o] of [
    ["Windows Chrome/120", { ua: UA.staleWinChrome, meta: true }],
    ["Mac Firefox/121", { ua: UA.staleMacFirefox, meta: true }],
    ["Windows Edg/119 + same-site Referer", { ua: UA.staleWinEdge, meta: true, extra: { referer: "https://www.gowayfind.com/guides/things-to-do-sarasota" } }],
  ]) {
    const r = await run(o);
    ok(r.res.status === 200 && !r.loc, `${rel} (2023 rotation, ${label}) gets a 200 Continue page, not a redirect (got ${r.res.status}, Location ${r.loc.slice(0, 60)})`);
    ok(/noindex/.test(r.res.headers.get("x-robots-tag") || "") && /no-store/.test(r.res.headers.get("cache-control") || ""), `${rel} (2023 rotation, ${label}) Continue page is noindex + no-store`);
    ok(!/https?:\/\/[^\s"'<>]*(?:viator|ticketmaster|stay22|evyy|booking|stubhub|prf)\./i.test(r.body.replace(/value="[^"]*"/g, "")), `${rel} (2023 rotation, ${label}) Continue page carries no partner URL outside the echoed form values`);
    ok(/name="wf_confirm" value="1"/.test(r.body), `${rel} (2023 rotation, ${label}) Continue page offers the one-tap continue (wf_confirm=1)`);
    ok(r.started.length === 0 && r.events.length === 1 && r.refused.length === 1 && r.refused[0].properties.refusal_class === "suspect" && r.refused[0].properties.refusal_reason === "stale-rotation-ua", `${rel} (2023 rotation, ${label}) emits one provider_redirect_refused (suspect / stale-rotation-ua) and no started (got ${r.events.map((e) => e.event + "/" + (e.properties.refusal_reason || "")).join(",")})`);
  }
  // A person on one of those old builds: one tap, or any cookie this site sets, and the real redirect.
  for (const [label, o, extra] of [
    ["after tapping Continue", { ua: UA.staleWinChrome, meta: true }, "&wf_confirm=1"],
    ["wf_device cookie", { ua: UA.staleWinChrome, meta: true, extra: { cookie: "wf_device=d_guard123" } }, ""],
    ["PostHog cookie", { ua: UA.staleMacFirefox, meta: true, extra: { cookie: GUARD_PH_COOKIE } }, ""],
    ["Android 7 Chrome/119 Mobile, no cookie", { ua: UA.androidChrome119, meta: true }, ""],
    ["Windows Chrome/121 + same-site Referer, no cookie", { ua: UA.winChrome121, meta: true, extra: { referer: "https://www.gowayfind.com/guides/things-to-do-sarasota" } }, ""],
  ]) {
    const r = await run(o, extra);
    ok(r.refused.length === 0 && r.res.status === 302, `${rel} (2023 rotation control: ${label}) is NOT held at the Continue page (status ${r.res.status}, refused ${r.refused.length})`);
    if (fx.partner) ok(reachesPartner(r) && r.started.length === 1 && r.started[0].properties.traffic_class === "human", `${rel} (2023 rotation control: ${label}) gets the real partner redirect + one human started event (Location ${r.loc.slice(0, 60)}, started ${r.started.length})`);
  }

  // DESKTOP ZERO PROOF (2026-11-11), through the real handler.
  for (const [label, o] of [
    ["Mac Chrome 129", { ua: UA.desktopChrome, meta: true }],
    ["Windows Chrome 149", { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36", meta: true }],
    ["Linux Firefox 140 + another site's Referer", { ua: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0", meta: true, extra: { referer: "https://example.com/list" } }],
  ]) {
    const r = await run(o);
    ok(r.res.status === 200 && !r.loc, `${rel} (desktop zero proof, ${label}) gets a 200 Continue page, not a redirect (got ${r.res.status}, Location ${r.loc.slice(0, 60)})`);
    ok(/noindex/.test(r.res.headers.get("x-robots-tag") || "") && /no-store/.test(r.res.headers.get("cache-control") || ""), `${rel} (desktop zero proof, ${label}) Continue page is noindex + no-store`);
    ok(!/https?:\/\/[^\s"'<>]*(?:viator|ticketmaster|stay22|evyy|booking|stubhub|prf)\./i.test(r.body.replace(/value="[^"]*"/g, "")), `${rel} (desktop zero proof, ${label}) Continue page carries no partner URL outside the echoed form values`);
    ok(/name="wf_confirm" value="1"/.test(r.body), `${rel} (desktop zero proof, ${label}) Continue page offers the one-tap continue (wf_confirm=1)`);
    ok(r.started.length === 0 && r.events.length === 1 && r.refused.length === 1 && r.refused[0].properties.refusal_class === "suspect" && /^desktop-zero-proof:(?:same-origin|same-site|cross-site|none|absent)$/.test(r.refused[0].properties.refusal_reason), `${rel} (desktop zero proof, ${label}) emits one provider_redirect_refused (suspect / desktop-zero-proof:<Sec-Fetch-Site>) and no started (got ${r.events.map((e) => e.event + "/" + (e.properties.refusal_reason || "")).join(",")})`);
  }
  // Every proof, and every surface the rule must never touch, still gets the real redirect.
  for (const [label, o, extra] of [
    ["desktop, tapped Continue", { ua: UA.desktopChrome, meta: true }, "&wf_confirm=1"],
    ["desktop + click_id from the page", { ua: UA.desktopChrome, meta: true }, "&click_id=clk_guard12345678"],
    ["desktop + same-site Referer", { ua: UA.desktopChrome, meta: true, extra: { referer: "https://www.gowayfind.com/guides/things-to-do-sarasota" } }, ""],
    ["desktop + wf_device cookie", { ua: UA.desktopChrome, meta: true, extra: { cookie: "wf_device=d_guard123" } }, ""],
    ["Android Chrome, zero proof", { ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36", meta: true }, ""],
    ["iPhone Safari, zero proof", { ua: UA.mobileSafari }, ""],
    ["Instagram in-app, zero proof", { ua: UA.instagramIos }, ""],
  ]) {
    const r = await run(o, extra);
    ok(r.refused.length === 0 && r.res.status === 302, `${rel} (zero-proof control: ${label}) is NOT held at the Continue page (status ${r.res.status}, refused ${r.refused.length})`);
    if (fx.partner) ok(reachesPartner(r) && r.started.length === 1 && r.started[0].properties.traffic_class === "human", `${rel} (zero-proof control: ${label}) gets the real partner redirect + one human started event (Location ${r.loc.slice(0, 60)}, started ${r.started.length})`);
    if (fx.partner && label === "desktop, tapped Continue") ok(r.started[0] && r.started[0].properties.click_proof === "continue_tap", `${rel}: a person who tapped Continue is counted with click_proof continue_tap (got ${r.started[0] && r.started[0].properties.click_proof})`);
    if (fx.partner && label === "iPhone Safari, zero proof") ok(r.started[0] && r.started[0].properties.click_proof === "none", `${rel}: a phone with zero proof keeps the 10-31 label none, and is still redirected (got ${r.started[0] && r.started[0].properties.click_proof})`);
  }

  // CACHE POLICY: every response shape from every go route is per-request.
  for (const [label, o, extra, handler] of [
    ["human redirect", { ua: UA.desktopChrome, meta: true, extra: { referer: "https://www.gowayfind.com/guides/things-to-do-sarasota" } }, "", "GET"],
    ["desktop zero-proof interstitial", { ua: UA.desktopChrome, meta: true }, "", "GET"],
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

  const human = { ua: UA.desktopChrome, meta: true, extra: { referer: "https://www.gowayfind.com/guides/things-to-do-sarasota" } };
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

/* ── R. app/robots.js keeps compliant crawlers off every go route ────────── */
{
  const robotsSrc = readFileSync(REPO + "app/robots.js", "utf8");
  const m = robotsSrc.match(/disallow:\s*\[([^\]]*)\]/);
  ok(!!m, "PROBE BROKEN: app/robots.js must declare `disallow: [ ... ]` as an array literal this guard can read");
  const listed = m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  ok(listed.includes("/api/photo"), `app/robots.js still disallows the metered /api/photo proxy (listed: ${listed.join(", ") || "none"})`);
  for (const rel of ROUTES) {
    const path = "/" + rel.replace(/^app\//, "").replace(/\/route\.js$/, "");
    ok(listed.includes(path), `app/robots.js disallows ${path} (every discovered go route must be listed; listed: ${listed.join(", ") || "none"})`);
  }
  ok(/allow:\s*"\/"/.test(robotsSrc) && !listed.some((p) => p === "/" || p === "/api" || p === "/api/"), "app/robots.js still allows the site itself (no blanket disallow sneaks in with the go routes)");
}

globalThis.fetch = realFetch;
if (fail.length) {
  console.error("check-redirect-suspect-gate: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-redirect-suspect-gate: OK — ${pass} assertions; ${A.length + 1} classifier fixtures, ${ROUTES.length} go routes called (humans incl. Instagram/Pinterest in-app redirected + counted; crawlers/unfurlers/meta-ads/HEAD/Next-prefetch/10-21-incident-UA never reach a partner nor count as human; synthetic monitor captures nothing; first-party Referer/cookie keeps a header-less visitor human; every /go response private no-store); watchdog run end-to-end with 0 off-origin fetches; Viator ?q= resolved-URL cache holds spend with no CDN-cached redirect`);
