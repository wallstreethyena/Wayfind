#!/usr/bin/env node
// scripts/check-partner-pitch.mjs — /partners pitch behind partners_pitch_v2.
//
// Flag off must be today's partners page, byte for byte. Flag on is the pitch:
// no hyphen, en dash, em dash, or middle dot in visible copy; no live
// advertiser name or photo; one "never for sale" line; audience numbers taken
// from lib/partnerProof.js; Example only on the sample; call and directions
// on every plan; no Pay now.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { SPONSORED_PLACES } from "../lib/sponsoredPlaces.js";
import { siteTodayStr } from "../lib/siteTime.js";
import {
  partnerFlagOn,
  clearPartnerFlagCache,
  PARTNER_FLAG_DISTINCT_ID,
  PARTNER_FLAG_TIMEOUT_MS,
  PARTNER_FLAG_CACHE_MS,
} from "../lib/partnerFlags.js";
import {
  VERIFIED_AUDIENCE,
  audienceProofSentence,
  formatAudienceCount,
} from "../lib/partnerProof.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
let pass = 0;
const ok = (c, m) => { if (c) pass++; else { console.error("  FAIL: " + m); fails++; } };

delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
delete process.env.POSTHOG_PERSONAL_API_KEY;

const DASH = /[\u002D\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/;
const MIDDOT = /\u00B7/;
const JARGON = /\b(?:geo|flight|utm|crawlable|impressions|cpc)\b/i;

function visibleText(html) {
  const noCode = String(html).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const bits = [];
  for (const m of noCode.matchAll(/\b(?:aria-label|alt|title)="([^"]*)"/gi)) bits.push(m[1]);
  bits.push(noCode.replace(/<[^>]+>/g, " "));
  return bits.join(" ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&apos;|&rsquo;|&#8217;/gi, "'")
    .replace(/&ldquo;|&rdquo;|&quot;|&#8220;|&#8221;/g, '"')
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&mdash;|&#8212;/g, "\u2014")
    .replace(/&ndash;|&#8211;/g, "\u2013")
    .replace(/\s+/g, " ")
    .trim();
}

function jsonResponse(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

const sponsor = await loadComponent(join(ROOT, "lib/sponsorPage.js"), ROOT);
const pitch = await loadComponent(join(ROOT, "lib/partnerPitchPage.js"), ROOT);
const route = await loadComponent(join(ROOT, "app/partners/page.js"), ROOT);

const routeSrc = readFileSync(join(ROOT, "app/partners/page.js"), "utf8");
const pitchSrc = readFileSync(join(ROOT, "lib/partnerPitchPage.js"), "utf8");
const proofSrc = readFileSync(join(ROOT, "lib/partnerProof.js"), "utf8");
const sponsorSrc = readFileSync(join(ROOT, "lib/sponsorPage.js"), "utf8");

ok(/PartnersIndexPage/.test(routeSrc) && /partnersIndexMetadata\(/.test(routeSrc),
  "/partners still calls today's page and its metadata");
ok(route.revalidate === 3600 && route.dynamic !== "force-static",
  "/partners keeps hourly revalidate");
ok(!/PartnersPitchPage|partnerFlagOn|partnerProof/.test(sponsorSrc),
  "lib/sponsorPage.js does not take the pitch flag");

const todayHtml = renderToStaticMarkup(React.createElement(sponsor.PartnersIndexPage));
const offEl = await route.default();
const offHtml = renderToStaticMarkup(offEl);
ok(offHtml === todayHtml, "flag off renders exactly today's /partners page");
ok(offHtml !== todayHtml.replace("Partners on Wayfind", "Partners on Wayfind changed"),
  "positive control: a changed page does not match today's markup");
const offMeta = await route.generateMetadata();
ok(JSON.stringify(offMeta) === JSON.stringify(sponsor.partnersIndexMetadata()),
  "flag off metadata is today's partners metadata");

const PROOF_SENTENCE = "About 16,000 people used Wayfind in the last 90 days. About 3,900 of them were in Florida. Counted in early November 2026.";
ok(VERIFIED_AUDIENCE.visitors === 16000 && VERIFIED_AUDIENCE.floridaVisitors === 3900,
  "verified audience is 16,000 visitors and 3,900 in Florida");
ok(VERIFIED_AUDIENCE.windowLabel === "last 90 days, counted early November 2026",
  "the audience label is last 90 days, counted early November 2026");
ok(VERIFIED_AUDIENCE.source === "PostHog unique visitors",
  "the audience source is PostHog unique visitors");
ok(/owner still needs to confirm the exact date range/i.test(proofSrc),
  "the proof file says the owner still needs to confirm the exact date range");
ok(audienceProofSentence() === PROOF_SENTENCE,
  "the proof sentence is built from the verified audience (" + audienceProofSentence() + ")");
ok(formatAudienceCount(16000) === "16,000" && formatAudienceCount(3900) === "3,900",
  "counts format with a comma");
ok(!/16000|16,000|3900|3,900/.test(pitchSrc),
  "the pitch page source does not carry the audience digits");
ok(/16000/.test(proofSrc) && /3900/.test(proofSrc),
  "positive control: the proof file still contains the audience digits");

ok(sponsor.PARTNER_PACKAGES.map((pkg) => pkg.id + ":" + pkg.priceUsd).join(",") === "weekly:99,monthly:199,quarterly:299",
  "live PARTNER_PACKAGES stay weekly 99, monthly 199, quarterly 299");
ok(pitch.PITCH_PACKAGES.map((pkg) => pkg.id + ":" + pkg.priceUsd).join(",") === "starter:99,monthly:199,quarterly:499",
  "pitch packages are starter 99, monthly 199, quarterly list 499");
ok(pitch.PITCH_PACKAGES.find((pkg) => pkg.id === "quarterly").promoPriceUsd === 399,
  "the quarterly holiday price is 399");
ok(pitch.HOLIDAY_PROMO_THROUGH === "2026-12-31", "holiday promo runs through 2026-12-31");
ok(pitch.holidayPromoActive("2026-12-31") === true && pitch.holidayPromoActive("2027-01-01") === false,
  "the promo is on through December 31, 2026 and off the next day");

function renderPitch(today) {
  return renderToStaticMarkup(React.createElement(pitch.PartnersPitchPage, { today }));
}
const promoHtml = renderPitch("2026-11-17");
const lastDayHtml = renderPitch("2026-12-31");
const afterHtml = renderPitch("2027-01-01");
const promoVisible = visibleText(promoHtml);
const afterVisible = visibleText(afterHtml);

ok(DASH.test("a-b") && DASH.test("a\u2013b") && DASH.test("a\u2014b") && MIDDOT.test("a \u00B7 b"),
  "positive control: the dash probe matches a hyphen, an en dash, an em dash, and a middle dot");
ok(!DASH.test(promoVisible) && !MIDDOT.test(promoVisible) && !DASH.test(afterVisible) && !MIDDOT.test(afterVisible),
  "flag on visible copy has no hyphen, dash, or middle dot");
ok(!DASH.test(pitch.partnersPitchMetadata().title) && !DASH.test(pitch.partnersPitchMetadata().description),
  "pitch title and description have no hyphen or dash");
ok(JARGON.test("no flight here") && JARGON.test("UTM") && JARGON.test("impressions"),
  "positive control: the jargon probe matches flight, UTM, and impressions");
ok(!JARGON.test(promoVisible) && !/posthog|unique visitors|billion/i.test(promoVisible),
  "pitch copy skips geo, flight, UTM, crawlable, impressions, CPC, PostHog, and token claims");
ok((promoVisible.match(/never for sale/gi) || []).length === 1,
  "the pitch says never for sale exactly once");
ok(promoVisible.includes(PROOF_SENTENCE) && promoVisible.includes("We just started."),
  "the proof bar is the verified sentence, then we just started");
ok(!promoVisible.includes(VERIFIED_AUDIENCE.source),
  "the proof source label is not shown on the page");
ok(/Example only/.test(promoVisible) && /Sample Harbor Cafe/.test(promoVisible) && /Not a real business/.test(promoVisible),
  "the sample is Example only and names Sample Harbor Cafe as not a real business");
ok(/data-photo-fallback="unavailable"/.test(promoHtml) && !/<img\b/i.test(promoHtml),
  "the sample uses the shared no photo tile and the pitch has no img");
ok(!/Pay now/i.test(promoVisible) && !/stripe\.com|checkout\.stripe/i.test(promoHtml),
  "the pitch has no Pay now button");
ok(/Pay now/i.test("Pay now"), "positive control: the Pay now probe matches the words Pay now");
ok(promoVisible.includes("People in Florida are asking AI where to go. Make sure the answer includes you."),
  "the hero is the Florida AI line");
ok(promoVisible.includes("See plans") && promoHtml.includes('href="#plans"'),
  "See plans jumps to the plans");
ok(promoVisible.includes("The Wayfind app comes to the app store this year."),
  "the app store line is present");
ok(promoVisible.includes("Every week you wait, people near you pick somewhere else."),
  "the close is present");
ok(promoVisible.includes("Wayfind may earn a commission from some booking partners."),
  "the commission line is present");
ok(!/\$99\/week|\$299\/quarter|\$299/.test(promoVisible),
  "the pitch does not show the live weekly or 299 prices");
ok(!/A listing on Wayfind is free/.test(promoVisible),
  "the pitch does not also render today's free listing paragraph");

const blocks = Object.fromEntries([...promoHtml.matchAll(/<article\b[^>]*data-pitch-plan="([^"]+)"[\s\S]*?<\/article>/g)].map((m) => [m[1], m[0]]));
ok(Object.keys(blocks).sort().join(",") === "monthly,quarterly,starter",
  "three plan cards render");
for (const pkg of pitch.PITCH_PACKAGES) {
  const block = visibleText(blocks[pkg.id] || "");
  ok(block.includes("Call") && block.includes("Directions") && /Sponsored/.test(block),
    pkg.id + " shows a Sponsored card with Call and Directions");
  ok(block.includes("Email us to start"), pkg.id + " asks the reader to email us to start");
  const href = pitch.pitchMailto(pkg, "2026-11-17");
  const params = new URLSearchParams(href.split("?")[1]);
  const mail = (params.get("subject") || "") + " " + (params.get("body") || "");
  ok(href.startsWith("mailto:hello@gowayfind.com?") && !DASH.test(mail) && !/\bPay now\b/i.test(mail),
    pkg.id + " mailto is an email with no dash and no Pay now");
}
ok(visibleText(blocks.starter || "").includes("$99") && visibleText(blocks.starter || "").includes("for 14 days"),
  "starter is $99 for 14 days");
ok(visibleText(blocks.monthly || "").includes("$199") && /Cancel anytime/.test(visibleText(blocks.monthly || "")),
  "monthly is $199 a month, cancel anytime");
ok(visibleText(blocks.quarterly || "").includes("$499") && visibleText(blocks.quarterly || "").includes("$399") && /Holiday Promo/.test(visibleText(blocks.quarterly || "")) && /December 31, 2026/.test(visibleText(blocks.quarterly || "")),
  "quarterly shows list $499 and Holiday Promo $399 through December 31, 2026");
ok(!promoVisible.includes("2026-12-31"), "the promo date constant is not printed");
ok(lastDayHtml.includes(">$399<"), "the last promo day still shows $399");
ok(/\$399/.test(visibleText(lastDayHtml)) && /Holiday Promo/.test(visibleText(lastDayHtml)),
  "December 31, 2026 still shows the holiday promo");
ok(!/Holiday Promo/.test(afterVisible) && !/\$399/.test(afterVisible) && /\$499/.test(afterVisible),
  "after December 31, 2026 the promo and $399 are gone and $499 remains");
ok(renderPitch(siteTodayStr()) === renderToStaticMarkup(React.createElement(pitch.PartnersPitchPage)),
  "a pitch with no date uses the site calendar day");

const markers = [];
for (const sponsorRow of SPONSORED_PLACES) {
  for (const value of [sponsorRow.advertiser, sponsorRow.name, sponsorRow.id, sponsorRow.staticPhoto, sponsorRow.person && sponsorRow.person.name, sponsorRow.person && sponsorRow.person.full]) {
    const text = String(value || "").trim();
    if (text.length >= 3) markers.push(text);
  }
}
ok(markers.includes("Rio Body Wax"), "positive control: the sponsor book still contains Rio Body Wax");
const pitchSurface = promoHtml + "\n" + afterHtml + "\n" + pitch.partnersPitchMetadata().title + "\n" + pitch.partnersPitchMetadata().description;
for (const marker of markers) {
  ok(!pitchSurface.toLowerCase().includes(marker.toLowerCase()), "pitch reveals no advertiser marker " + JSON.stringify(marker));
}

ok(PARTNER_FLAG_TIMEOUT_MS === 800 && PARTNER_FLAG_CACHE_MS === 60000,
  "decide uses an 800 ms timeout and a 60 second cache");
ok(PARTNER_FLAG_DISTINCT_ID === "wayfind-partners-pitch-v2",
  "decide uses one fixed shared distinct id");

const KEY = "phc_pitch_guard_not_real";
const SECRET = "phx_pitch_guard_not_real";
function envWith(extra) {
  return { NEXT_PUBLIC_POSTHOG_KEY: KEY, POSTHOG_PERSONAL_API_KEY: SECRET, ...extra };
}

clearPartnerFlagCache();
let calls = 0;
const missing = await partnerFlagOn("partners_pitch_v2", {
  env: {},
  fetch: () => { calls += 1; throw new Error("should not fetch"); },
});
ok(missing === false && calls === 0, "a missing project key is OFF and does not fetch");

clearPartnerFlagCache();
calls = 0;
let seenBody = "";
const on = await partnerFlagOn("partners_pitch_v2", {
  env: envWith(),
  fetch: async (url, init) => {
    calls += 1;
    seenBody = init && init.body ? String(init.body) : "";
    ok(String(url).includes("/decide?v=3") && init.method === "POST", "the flag calls PostHog decide with POST");
    return jsonResponse(200, { featureFlags: { partners_pitch_v2: true } });
  },
});
ok(on === true && calls === 1 && seenBody.includes(PARTNER_FLAG_DISTINCT_ID) && seenBody.includes(KEY) && !seenBody.includes(SECRET),
  "a boolean true from decide is ON, for the shared distinct id, without the server secret");
const cached = await partnerFlagOn("partners_pitch_v2", {
  env: envWith(),
  now: () => Date.now(),
  fetch: async () => { calls += 1; return jsonResponse(200, { featureFlags: { partners_pitch_v2: false } }); },
});
ok(cached === true && calls === 1, "a boolean result stays cached inside 60 seconds");

clearPartnerFlagCache();
let clock = 1_000;
calls = 0;
await partnerFlagOn("partners_pitch_v2", {
  env: envWith(),
  now: () => clock,
  fetch: async () => { calls += 1; return jsonResponse(200, { featureFlags: { partners_pitch_v2: false } }); },
});
clock += PARTNER_FLAG_CACHE_MS + 1;
const expired = await partnerFlagOn("partners_pitch_v2", {
  env: envWith(),
  now: () => clock,
  fetch: async () => { calls += 1; return jsonResponse(200, { featureFlags: { partners_pitch_v2: true } }); },
});
ok(expired === true && calls === 2, "the cache expires after 60 seconds");

clearPartnerFlagCache();
const variant = await partnerFlagOn("partners_pitch_v2", {
  env: envWith(),
  fetch: async () => jsonResponse(200, { featureFlags: { partners_pitch_v2: "holiday" } }),
});
ok(variant === false, "a non boolean decide value is OFF");
clearPartnerFlagCache();
const enabled = await partnerFlagOn("partners_pitch_v2", {
  env: envWith(),
  fetch: async () => jsonResponse(200, { flags: { partners_pitch_v2: { enabled: true } } }),
});
ok(enabled === true, "a boolean enabled field with no variant is ON");
clearPartnerFlagCache();
const withVariant = await partnerFlagOn("partners_pitch_v2", {
  env: envWith(),
  fetch: async () => jsonResponse(200, { flags: { partners_pitch_v2: { enabled: true, variant: "a" } } }),
});
ok(withVariant === false, "a variant result is OFF");
clearPartnerFlagCache();
const absent = await partnerFlagOn("partners_pitch_v2", {
  env: envWith(),
  fetch: async () => jsonResponse(200, { featureFlags: {} }),
});
ok(absent === false, "a decide payload that omits the flag is OFF");
clearPartnerFlagCache();
const broken = await partnerFlagOn("partners_pitch_v2", {
  env: envWith(),
  fetch: async () => { throw new Error("down"); },
});
ok(broken === false, "a thrown decide call is OFF");
clearPartnerFlagCache();
const httpFail = await partnerFlagOn("partners_pitch_v2", {
  env: envWith(),
  fetch: async () => jsonResponse(500, { featureFlags: { partners_pitch_v2: true } }),
});
ok(httpFail === false, "a failed decide response is OFF");
clearPartnerFlagCache();
const timedOut = await partnerFlagOn("partners_pitch_v2", {
  env: envWith(),
  timeoutMs: 30,
  fetch: (url, init) => new Promise((resolve, reject) => {
    const signal = init && init.signal;
    if (signal) signal.addEventListener("abort", () => reject(new Error("aborted")));
  }),
});
ok(timedOut === false, "an aborted decide call is OFF");

clearPartnerFlagCache();
calls = 0;
const fromDefinitions = await partnerFlagOn("partners_pitch_v2", {
  env: envWith(),
  fetch: async (url) => {
    calls += 1;
    if (String(url).includes("/decide")) return jsonResponse(403, { error: "production_write_blocked", blocked: true });
    return jsonResponse(200, { flags: [{ key: "partners_pitch_v2", active: true, filters: { groups: [{ properties: [], rollout_percentage: 100 }] } }] });
  },
});
ok(fromDefinitions === true && calls === 2, "a firewall blocked decide falls through to a 100 percent boolean definition");
clearPartnerFlagCache();
calls = 0;
const noSecret = await partnerFlagOn("partners_pitch_v2", {
  env: { NEXT_PUBLIC_POSTHOG_KEY: KEY },
  fetch: async (url) => {
    calls += 1;
    if (String(url).includes("/flags/definitions")) return jsonResponse(200, { flags: [{ key: "partners_pitch_v2", active: true, filters: { groups: [{ rollout_percentage: 100 }] } }] });
    return jsonResponse(403, "production_write_blocked");
  },
});
ok(noSecret === false && calls === 1, "a blocked decide with no server key stays OFF");
clearPartnerFlagCache();
const partial = await partnerFlagOn("partners_pitch_v2", {
  env: envWith(),
  fetch: async (url) => {
    if (String(url).includes("/decide")) return jsonResponse(403, "production_write_blocked");
    return jsonResponse(200, { flags: [{ key: "partners_pitch_v2", active: true, filters: { groups: [{ properties: [], rollout_percentage: 50 }] } }] });
  },
});
ok(partial === false, "a partial rollout is not treated as a boolean release");
clearPartnerFlagCache();
const filtered = await partnerFlagOn("partners_pitch_v2", {
  env: envWith(),
  fetch: async (url) => {
    if (String(url).includes("/decide")) return jsonResponse(403, "production_write_blocked");
    return jsonResponse(200, { flags: [{ key: "partners_pitch_v2", active: true, filters: { groups: [{ properties: [{ key: "city", value: "Miami" }], rollout_percentage: 100 }] } }] });
  },
});
ok(filtered === false, "a filtered definition is OFF");

process.env.NEXT_PUBLIC_POSTHOG_KEY = KEY;
const realFetch = globalThis.fetch;
let routeCalls = 0;
globalThis.fetch = async (url, init) => {
  routeCalls += 1;
  ok(String(url).includes("/decide?v=3"), "the page decide call hits /decide");
  return jsonResponse(200, { featureFlags: { partners_pitch_v2: true } });
};
const onEl = await route.default();
const onHtml = renderToStaticMarkup(onEl);
const onMeta = await route.generateMetadata();
globalThis.fetch = realFetch;
delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
ok(routeCalls === 1 && onHtml.includes("People in Florida are asking AI where to go") && !onHtml.includes("A listing on Wayfind is free"),
  "flag on renders the pitch and not today's page");
ok(JSON.stringify(onMeta) === JSON.stringify(pitch.partnersPitchMetadata()),
  "flag on metadata is the pitch metadata");
ok(onHtml !== todayHtml, "flag on markup differs from today's page");

if (fails) {
  console.error("check-partner-pitch: FAIL — " + fails + " failed, " + pass + " passed");
  process.exit(1);
}
console.log("check-partner-pitch: OK — " + pass + " assertions");
