#!/usr/bin/env node
/**
 * test-analytics-write-suppression — every first-party `events` write obeys the
 * same owner / internal-browser / automation gate, and the server never poses
 * as a visitor device (2026-10-01, Website user flow analysis).
 *
 * Two demonstrated leaks into the Command Center first-party KPIs:
 *   1. lib/likeSignal.js recordLikeEvent (like / dislike / save / share from the
 *      card actions, intent pages and Trending Now) inserted an events row with
 *      NO suppression, while app/home.js logEvent and lib/track.js both skip the
 *      owner, a browser marked internal and automation. The owner's own taps and
 *      test browsers were counted as visitor devices.
 *   2. lib/insiderServer.js logLlmCall wrote device_id "server", which every
 *      wf_cc_* count(distinct device_id) KPI counted as one more visitor device.
 *
 * Everything below CALLS the real functions with a recording Supabase / fetch
 * stub and asserts on what would have been written:
 *   - positive control: an ordinary visitor's like IS written, with its device_id;
 *   - webdriver, a known bot UA, the internal-browser mark, the owner account and
 *     window.__WF_ANALYTICS_SUPPRESSED each write NOTHING;
 *   - logLlmCall still writes its llm_call row, with device_id null.
 */
import { register } from "node:module";
register("./lib/nodeResolveHook.mjs", import.meta.url);

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
const HUMAN_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const nav = { userAgent: HUMAN_UA, webdriver: false };
globalThis.window = { localStorage, navigator: nav };
globalThis.localStorage = localStorage;
Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true, writable: true });

const { recordLikeEvent, recordCommerceClick } = await import("../lib/likeSignal.js");
const { INTERNAL_BROWSER_KEY, OWNER_EMAIL } = await import("../lib/browserAnalytics.js");

function recorder() {
  const rows = [];
  return { rows, from: (table) => ({ insert: (row) => { rows.push({ table, row }); return Promise.resolve({ error: null }); } }) };
}
const place = { id: "ChIJfixture", name: "Fixture Place" };
const clickFields = { place_id: "ChIJfixture", provider: "stay22", merchant: "Stay22", offer_id: "ChIJfixture", surface: "event_stays", content_id: "event-1" };
function scenario(name, setup, user = null) {
  store.clear(); nav.userAgent = HUMAN_UA; nav.webdriver = false; delete window.__WF_ANALYTICS_SUPPRESSED; delete window.location; delete globalThis.sessionStorage;
  setup();
  const sb = recorder();
  recordLikeEvent("like", place, { supabase: sb, user });
  recordCommerceClick(clickFields, { supabase: sb, user });
  return sb.rows;
}

const human = scenario("human", () => {});
ok(human.length === 2 && human[0].table === "events" && human[0].row.action === "like" && human[1].row.action === "commerce_cta_clicked",
  `positive control: an ordinary visitor's like and commerce click must write events rows, got ${JSON.stringify(human)}`);
ok(human[0] && typeof human[0].row.device_id === "string" && human[0].row.device_id.length > 0 && human[1].row.device_id === human[0].row.device_id, "positive control: both rows carry the visitor device_id");

const cases = [
  ["webdriver", () => { nav.webdriver = true; }],
  ["bot user agent", () => { nav.userAgent = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"; }],
  ["internal-browser mark", () => { localStorage.setItem(INTERNAL_BROWSER_KEY, "1"); }],
  ["page-level suppression flag", () => { window.__WF_ANALYTICS_SUPPRESSED = true; }],
  ["browser ?wf_test= query param", () => { window.location = { search: "?wf_test=playwright_qa" }; }],
  ["browser wf_test_v1 sessionStorage marker", () => { globalThis.sessionStorage = { getItem: (k) => (k === "wf_test_v1" ? "qa_run" : null) }; }],
  ["bare window stub without navigator.userAgent", () => { nav.userAgent = ""; }],
];
for (const [name, setup] of cases) {
  const rows = scenario(name, setup);
  ok(rows.length === 0, `${name}: recordLikeEvent and recordCommerceClick must write nothing, wrote ${rows.length}`);
}
const owner = scenario("owner", () => {}, { id: "00000000-0000-0000-0000-000000000000", email: OWNER_EMAIL });
ok(owner.length === 0, `owner account: recordLikeEvent and recordCommerceClick must write nothing, wrote ${owner.length}`);
{
  const savedWin = globalThis.window;
  globalThis.window = undefined;
  try {
    const sb = recorder();
    recordLikeEvent("like", place, { supabase: sb, user: null });
    recordCommerceClick(clickFields, { supabase: sb, user: null });
    ok(sb.rows.length === 0, `headless/no-window context: recordLikeEvent and recordCommerceClick must write nothing, wrote ${sb.rows.length}`);
  } finally {
    globalThis.window = savedWin;
  }
}

// ── logLlmCall ──────────────────────────────────────────────────────────────
process.env.SUPABASE_URL = "https://fixture.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-not-a-key";
const posts = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => { posts.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null }); return { ok: true, json: async () => ({}) }; };
try {
  const { logLlmCall } = await import("../lib/insiderServer.js");
  await logLlmCall("fixture-route");
} finally { globalThis.fetch = realFetch; }
const llm = posts.filter((p) => /\/rest\/v1\/events$/.test(p.url));
ok(llm.length === 1, `logLlmCall must write exactly one events row, wrote ${llm.length}`);
ok(llm[0] && llm[0].body.action === "llm_call" && llm[0].body.meta && llm[0].body.meta.route === "fixture-route", "logLlmCall row keeps action llm_call and its route");
ok(llm[0] && llm[0].body.device_id === null, `logLlmCall must not pose as a visitor device: device_id=${llm[0] && JSON.stringify(llm[0].body.device_id)}`);

if (fail.length) {
  console.error(`✗ test-analytics-write-suppression: ${fail.length} failure(s)`);
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`✓ test-analytics-write-suppression: ${pass} assertions (recordLikeEvent: 1 written + 5 suppressed scenarios; logLlmCall device_id null)`);
