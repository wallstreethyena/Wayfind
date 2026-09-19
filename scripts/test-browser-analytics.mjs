#!/usr/bin/env node
// Browser analytics contract: owner/bot exclusion, URL redaction, safe clicks,
// and visible-time accounting. The source is loaded as ESM from a data URL so
// this test runs under the repo's CommonJS package setting without transpiling.
import { readFileSync } from "node:fs";

const fail = (message) => { console.error("test-browser-analytics: FAIL — " + message); process.exit(1); };
let passed = 0;
const ok = (condition, message) => { if (!condition) fail(message); passed++; };
const equal = (actual, expected, message) => ok(JSON.stringify(actual) === JSON.stringify(expected), `${message}; got ${JSON.stringify(actual)}`);

const source = readFileSync(new URL("../lib/browserAnalytics.js", import.meta.url), "utf8");
const analytics = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const provider = readFileSync(new URL("../app/components/PostHogProvider.js", import.meta.url), "utf8");

class Storage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) || null; }
  setItem(key, value) { this.values.set(key, value); }
}

const storage = new Storage();
equal(analytics.analyticsSuppressionReason({ storage, user: { email: " GabrielPereira@me.com " } }), "internal", "owner email is suppressed");
ok(analytics.hasInternalBrowserMark(storage), "owner sign-in persistently marks this browser");
equal(analytics.analyticsSuppressionReason({ storage, user: null, userAgent: "ordinary browser" }), "internal", "marked browser stays suppressed after sign-out");
equal(analytics.analyticsSuppressionReason({ storage: new Storage(), userAgent: "Googlebot/2.1" }), "bot", "known crawler is suppressed");
equal(analytics.analyticsSuppressionReason({ storage: new Storage(), userAgent: "Mozilla/5.0", webdriver: true }), "bot", "webdriver automation is suppressed");
equal(analytics.analyticsSuppressionReason({ storage: new Storage(), userAgent: "Mozilla/5.0" }), null, "ordinary anonymous browser is not falsely suppressed");
equal(analytics.analyticsSuppressionReason({ storage: new Storage(), user: { user_metadata: { user_name: "gabrielpereira" } }, userAgent: "Mozilla/5.0" }), "internal", "owner auth handle is suppressed when the provider omits email");

equal(analytics.safePagePath("https://gowayfind.com/explore?email=private@example.com#secret"), "/explore", "query and fragment are discarded");
equal(analytics.safePagePath("https://gowayfind.com/s/secret-share-code"), "/s/:private", "share code path is redacted");
equal(analytics.safePagePath("/auth/confirm?token_hash=secret"), "/auth/:private", "auth callback path is redacted");
equal(analytics.safeReferrerDomain("https://www.google.com/search?q=private"), "google.com", "referrer stores domain only");
equal(analytics.sanitizeAnalyticsProperties({ $current_url: "https://gowayfind.com/search?q=private#secret", $referrer: "https://google.com/search?q=private", value: 42 }), {
  $current_url: "https://gowayfind.com/search", $referrer: "https://google.com/", value: 42,
}, "send-time sanitizer strips URL secrets without disturbing metric values");
equal(analytics.sanitizeAnalyticsProperties({ tour_url_label: "Fall favorites", lcp_url: "https://cdn.example/image.jpg?signature=secret" }), {
  tour_url_label: "Fall favorites", lcp_url: "https://cdn.example/image.jpg",
}, "sanitizer preserves non-URL labels and keeps real URL fields absolute without secrets");

const anchor = {
  tagName: "A",
  closest: () => anchor,
  getAttribute(name) {
    return { href: "https://partner.example/book?traveler=email@example.com", "data-analytics-label": "Book now" }[name] || null;
  },
};
equal(analytics.clickProperties(anchor, { origin: "https://gowayfind.com" }), {
  element_type: "link", destination_type: "outbound", element_label: "Book", outbound_domain: "partner.example",
}, "outbound clicks retain domain and explicit label but never the URL");
const dynamicButton = {
  tagName: "BUTTON", textContent: "Save Jane's private birthday plan", closest: () => dynamicButton,
  getAttribute: () => null,
};
equal(analytics.clickProperties(dynamicButton, { origin: "https://gowayfind.com" }), {
  element_type: "button", destination_type: "none", element_label: "Save",
}, "button meaning comes from a finite action allowlist, never arbitrary text");

const listeners = { doc: {}, win: {} };
let clock = 0;
let intervalCallback = null;
const events = [];
const doc = {
  visibilityState: "visible",
  referrer: "https://google.com/search?q=secret",
  documentElement: { scrollHeight: 2000 },
  scrollingElement: null,
  querySelector: () => null,
  hasFocus: () => true,
  addEventListener: (name, fn) => { listeners.doc[name] = fn; },
  removeEventListener: () => {},
};
const win = {
  innerHeight: 500,
  scrollY: 0,
  location: { href: "https://gowayfind.com/places?secret=1", origin: "https://gowayfind.com" },
  crypto: { randomUUID: () => "visit-one" },
  addEventListener: (name, fn) => { listeners.win[name] = fn; },
  removeEventListener: () => {},
  setInterval: (fn) => { intervalCallback = fn; return 1; },
  clearInterval: () => {},
};
const tracker = analytics.createPageVisitTracker({ win, doc, capture: (name, props) => events.push({ name, props }), now: () => clock });
equal(events[0].name, "page_visit", "visit begins with page_visit");
equal(events[0].props.visit_id, "visit-one", "every visit has a stable nonempty id");
equal(events[0].props.page_path, "/places", "page_visit never stores the query string");

clock = 10000;
win.scrollY = 500;
intervalCallback();
const sample = events.find((event) => event.name === "attention_sample");
equal(sample.props.active_ms, 10000, "attention sample duration is incremental active time");
ok(Number.isInteger(sample.props.document_bucket) && sample.props.document_bucket >= 0 && sample.props.document_bucket <= 9, "attention position is a coarse document bucket");

clock = 15000;
doc.visibilityState = "hidden";
listeners.doc.visibilitychange();
const hiddenTime = events.filter((event) => event.name === "page_active_time").at(-1);
equal(hiddenTime.props.active_ms, 15000, "hidden flush reports visible active time accumulated so far");
equal(hiddenTime.props.reason, "hidden", "active-time reason is bounded");

clock = 25000;
listeners.win.pagehide();
const finalTime = events.filter((event) => event.name === "page_active_time").at(-1);
const exit = events.find((event) => event.name === "page_exit");
equal(finalTime.props.active_ms, 0, "final incremental flush does not repeat time already reported while hidden");
equal(exit.props.active_ms, 15000, "page_exit carries cumulative visible active time");
equal(exit.props.reason, "pagehide", "exit reason is bounded");
ok(!JSON.stringify(events).includes("secret=1"), "captured events contain no source query string");
clock = 30000;
listeners.win.pageshow();
equal(events.filter((event) => event.name === "page_visit").length, 2, "BFCache restore starts a fresh measurable visit");
tracker.stop();

// Wayfind's home feed scrolls an inner .wf-scrollarea while window.scrollY is
// always zero. Prove the tracker reads that surface and does not credit a
// covered background feed when an overlay has no known scrollport.
let overlay = null;
const primary = {
  clientHeight: 400, scrollHeight: 1600, scrollTop: 800,
  getAttribute: (name) => name === "data-analytics-page" ? "explore" : (name === "data-analytics-overlay" ? overlay : null),
};
const innerEvents = [];
const innerDoc = {
  ...doc, visibilityState: "visible", documentElement: { scrollHeight: 400 },
  querySelector: (selector) => selector === "[data-analytics-page]" ? primary : null,
  addEventListener: (name, fn) => { listeners.doc["inner-" + name] = fn; },
};
const innerWin = { ...win, scrollY: 0, innerHeight: 800, crypto: { randomUUID: () => "inner-visit" } };
clock = 0;
const innerTracker = analytics.createPageVisitTracker({ win: innerWin, doc: innerDoc, capture: (name, props) => innerEvents.push({ name, props }), now: () => clock });
clock = 10000;
intervalCallback();
const innerSample = innerEvents.find((event) => event.name === "attention_sample");
equal(innerSample.props.document_bucket, 6, "heatmap uses the inner Wayfind scrollport instead of window.scrollY");
equal(innerEvents[0].props.page_surface, "explore", "SPA screen enum identifies the measured surface");
overlay = "place";
innerTracker.sync();
clock = 20000;
intervalCallback();
equal(innerEvents.filter((event) => event.name === "attention_sample").length, 1, "unknown modal scrollport never attributes attention to the covered feed");
equal(innerEvents.filter((event) => event.name === "page_visit").at(-1).props.page_surface, "explore:place", "overlay transition starts a distinct visit surface without collecting place identity");
innerTracker.stop();

ok(/createPageVisitTracker\(\{[\s\S]{0,100}win: window,[\s\S]{0,100}doc: document,/.test(provider), "provider passes the helper's real win/doc integration keys");
ok(provider.indexOf("createPageVisitTracker({") < provider.indexOf("window.requestIdleCallback(boot"), "lifecycle measurement starts before idle SDK loading so short visits are queued");
ok(/if \(cancelled\) return;[\s\S]{0,100}const blocked = reason\(user\)/.test(provider), "stale auth completion cannot restart a cleaned-up provider");
ok(/if \(window\.__WF_ANALYTICS_SUPPRESSED\) return;/.test(provider), "tracker capture closure drops every event after owner or bot suppression");
ok(/ph\.capture\(event, properties, \{ timestamp \}\)/.test(provider), "idle-queued events preserve their occurrence timestamps");
ok(/mask_all_text:\s*true/.test(provider) && /mask_all_element_attributes:\s*true/.test(provider), "provider keeps automatic signals while masking DOM text and attributes");
ok(/sanitize_properties:\s*sanitizeAnalyticsProperties/.test(provider), "provider applies URL redaction to every PostHog payload");

console.log(`test-browser-analytics: OK — ${passed} assertions (owner/bot gate, URL redaction, safe clicks, incremental attention + visible duration)`);
