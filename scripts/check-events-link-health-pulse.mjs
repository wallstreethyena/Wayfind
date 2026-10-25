// scripts/check-events-link-health-pulse.mjs — locks the 2026-10-22 fix: inconclusive
// link probes are SKIPPED (green pulse + visible note), real dead links stay red-class
// work, 429/403/challenge/JS-only are unknown (never dead), systemic/stuck escalate.
import { summarizeLinkHealthPulse, unknownSince, daysBetween, STUCK_RED_ROWS } from "../lib/eventLinkPulse.js";
import { classifyOutboundPage, isBadVerdict } from "../lib/linkQuarantine.js";
import { probeAndClassify } from "../lib/linkProbe.js";

let pass = 0; const fail = [];
const ok = (c, m) => (c ? pass++ : fail.push(m));

// 1. all-inconclusive-but-not-systemic run -> green with a visible note
let p = summarizeLinkHealthPulse({ rows: 120, alive: 112, bad: 0, strike: 0, unknown: 8, stuck: 0, err: null });
ok(p.failed === 0 && p.succeeded === 112 && p.attempted === 112, "8/120 inconclusive: failed 0, skipped probes leave attempted");
ok(/8 link probe\(s\) inconclusive \(skipped\)/.test(p.note), "inconclusive count stays visible in the note");
// last week's real shape: 110 ok, 2 darkened, 10 unknown
p = summarizeLinkHealthPulse({ rows: 120, alive: 108, bad: 2, strike: 0, unknown: 10, stuck: 0, err: null });
ok(p.failed === 0 && /2 event link\(s\) darkened; 10 link probe/.test(p.note), "darkened + inconclusive run is green and says both");
// a run where every row was unreadable but the batch is tiny is idle-shaped, not red
p = summarizeLinkHealthPulse({ rows: 5, alive: 0, bad: 0, strike: 0, unknown: 5, stuck: 0, err: null });
ok(p.failed === 0 && p.attempted === 0 && /5 link probe/.test(p.note), "5/5 inconclusive (below systemic floor) is green");
// 2. a confirmed-dead link is still reported (and persistence errors are red)
p = summarizeLinkHealthPulse({ rows: 120, alive: 100, bad: 1, strike: 0, unknown: 3, stuck: 0, err: "patch-500" });
ok(p.failed === 1 && /persistence error: patch-500/.test(p.note), "persistence error still fails the pulse");
ok(isBadVerdict("dead") && !isBadVerdict("unknown"), "dead is bad, unknown is not");
const dead = classifyOutboundPage({ requestedUrl: "https://a.example/x", status: 404, finalUrl: "https://a.example/x", html: "", expectedNames: ["X"] });
ok(dead.verdict === "dead" && isBadVerdict(dead.verdict), "a 404 is still dead (bad) - real dead links still count");
p = summarizeLinkHealthPulse({ rows: 120, alive: 110, bad: 3, strike: 0, unknown: 0, stuck: 0, err: null });
ok(p.succeeded === 113 && /3 event link\(s\) darkened/.test(p.note) && p.failed === 0, "darkened links are the job succeeding, noted");
// 3. escalations
p = summarizeLinkHealthPulse({ rows: 120, alive: 40, bad: 0, strike: 0, unknown: 80, stuck: 0, err: null });
ok(p.failed === 80 && /^systemic/.test(p.note), "majority-unreadable run (probe path broken) goes red");
p = summarizeLinkHealthPulse({ rows: 120, alive: 90, bad: 0, strike: 0, unknown: 30, stuck: STUCK_RED_ROWS + 1, err: null });
ok(p.failed === STUCK_RED_ROWS + 1 && /stuck/.test(p.note), "many rows inconclusive past STUCK_DAYS escalate");
p = summarizeLinkHealthPulse({ rows: 120, alive: 112, bad: 0, strike: 0, unknown: 8, stuck: 3, err: null });
ok(p.failed === 0 && /3 inconclusive >14d/.test(p.note), "a few stuck rows are visible but not red");
ok(unknownSince("unknown:2026-10-08") === "2026-10-08" && unknownSince("alive") === null && daysBetween("2026-10-08", "2026-10-22") === 14, "since-date helpers");

// 4. classifier: 429 / 403 / challenge / JS-only => unknown, never bad
for (const st of [429, 403, 401, 503]) {
  const v = classifyOutboundPage({ requestedUrl: "https://t.example/e", status: st, finalUrl: "https://t.example/e", html: "", expectedNames: ["E"] });
  ok(v.verdict === "unknown" && v.reason === `http-${st}`, `HTTP ${st} is unknown/retry-later, not dead`);
}
const cf = classifyOutboundPage({ requestedUrl: "https://t.example/e", status: 200, finalUrl: "https://t.example/e", html: "<html><head><title>Just a moment...</title></head><body><script src='/cdn-cgi/challenge-platform/h/b/orchestrate/x'></script></body></html>", expectedNames: ["E"] });
ok(cf.verdict === "unknown" && cf.reason === "bot-challenge", "Cloudflare challenge served as 200 is unknown");
const spa = classifyOutboundPage({ requestedUrl: "https://t.example/e", status: 200, finalUrl: "https://t.example/e", html: "<html><body><div id=\"root\"></div><script src=\"/app.js\"></script></body></html>", expectedNames: ["E"] });
ok(spa.verdict === "unknown" && spa.reason === "js-only-shell", "JS-only ticket page is unknown");
const empty = classifyOutboundPage({ requestedUrl: "https://t.example/e", status: 200, finalUrl: "https://t.example/e", html: "<html><body></body></html>", expectedNames: ["E"] });
ok(empty.verdict === "soft404", "a truly empty 200 stays soft404");
const healthy = classifyOutboundPage({ requestedUrl: "https://t.example/e", status: 200, finalUrl: "https://t.example/e", html: "<html><head><title>Grove Fest tickets</title></head><body>Grove Fest is on Saturday at the grove with live music and food trucks all day long. <script src='/cdn-cgi/challenge-platform/scripts/jsd/main.js'></script></body></html>", expectedNames: ["Grove Fest"] });
ok(healthy.verdict === "alive", "a healthy Cloudflare-fronted page (embedded challenge-platform script) is still alive");
const spam = classifyOutboundPage({ requestedUrl: "https://t.example/e", status: 200, finalUrl: "https://t.example/e", html: "<title>slot gacor togel online</title><body>judi slot gacor togel casino online togel hari ini terpercaya</body>", expectedNames: ["Grove Fest"] });
ok(isBadVerdict(spam.verdict), "hijacked/gambling pages are still bad (got " + spam.verdict + ")");
// probe layer: Disney host short-circuits to unknown without a fetch
const dz = await probeAndClassify("https://disneyworld.disney.go.com/x", ["x"]);
ok(dz.verdict === "unknown", "denied host stays unknown without a fetch");

if (fail.length) { console.error("check-events-link-health-pulse: FAIL\n - " + fail.join("\n - ")); process.exit(1); }
console.log(`check-events-link-health-pulse: OK - ${pass} assertions`);
