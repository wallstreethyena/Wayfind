// events-link-health: blocked / temporary is never "dead", the job is not red
// on a handful of bot walls, and the probe never follows an affiliate link.
//
// 2026-10-28 evidence: wf_job_pulse events-link-health red 14/14 nights with
// failed = 2-8 "inconclusive" of 120 (every unknown counted as a job failure),
// and wf_link_verdicts (14d) darkened real venues as dead "http-network"
// (jacksonvillezoo.org, drphillipscenter.org, rotarycoconutgrove.com) plus one
// "offsite" that was a freshtix.queue-it.net waiting room.
// Executes lib/linkProbe.probeAndClassify with an injected fetch + DNS (no
// sockets) and the real route against a fake PostgREST.
import assert from "node:assert/strict";
import { probeAndClassify, isAffiliateLink } from "../lib/linkProbe.js";
import { linkHealthJobFailed } from "../lib/linkQuarantine.js";

const lookupImpl = async () => [{ address: "93.184.216.34", family: 4 }];
const html = (title, body) => `<html><head><title>${title}</title></head><body>${body}</body></html>`;
const resp = (status, { location, body = "" } = {}) => ({ status, url: undefined, headers: { get: (n) => (n.toLowerCase() === "location" ? location || null : null) }, body: null, text: async () => body });
const names = ["Spooktacular", "Jacksonville Zoo"];

async function classify(url, fetchImpl) {
  return probeAndClassify(url, names, { lookupImpl, fetchImpl, timeoutMs: 2000 });
}

// 1. Connection reset on the organizer's own host -> unknown, not dead.
const reset = await classify("https://www.jacksonvillezoo.org/spooktacular", async () => { throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }); });
assert.equal(reset.verdict, "unknown", "a connection reset (bot wall) is unknown, not dead");
assert.equal(reset.reason, "network-blocked");
// Same-host redirect then reset (drphillipscenter.org -> /csq/) -> unknown.
let n = 0;
const csq = await classify("https://www.drphillipscenter.org/frontyard", async () => (n++ === 0 ? resp(302, { location: "/csq/" }) : Promise.reject(new Error("read ECONNRESET"))));
assert.equal(csq.verdict, "unknown", "same-host challenge redirect then reset is unknown");
// Redirect loop (cookie challenge) -> unknown.
const loop = await classify("https://loop.example/e", async (u) => resp(302, { location: u }));
assert.equal(loop.verdict, "unknown", "a redirect loop is a challenge, not dead");
// Waiting room -> unknown, not offsite.
const queue = await classify("https://30aswf.freshtix.com/events/x", async (u) => (u.includes("queue-it") ? resp(200, { body: html("Waiting room", "You are now in line") }) : resp(302, { location: "https://freshtix.queue-it.net/?c=freshtix" })));
assert.equal(queue.verdict, "unknown", "a queue-it waiting room is unknown, not offsite");
assert.equal(queue.reason, "waiting-room");
// 403 / 429 / 503 stay unknown (existing contract, positive control).
for (const st of [403, 429, 503]) assert.equal((await classify("https://a.example/e", async () => resp(st))).verdict, "unknown", `HTTP ${st} is unknown`);

// Negative controls: real dead answers stay dead.
assert.equal((await classify("https://a.example/gone", async () => resp(404))).verdict, "dead", "control: 404 is still dead");
const nx = await probeAndClassify("https://nxdomain.example/e", names, { lookupImpl: async () => { throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }); }, fetchImpl: async () => resp(200) });
assert.equal(nx.verdict, "dead", "control: a name that does not resolve is still dead");
let m = 0;
const away = await classify("https://cortez-fish.org", async () => (m++ === 0 ? resp(302, { location: "https://www.antoniohotella.com/" }) : Promise.reject(new Error("ECONNRESET"))));
assert.notEqual(away.verdict, "unknown", "control: a reset AFTER leaving the organizer's domain is not excused");
const hijack = await classify("https://fruitvillegrove.com/tix", async () => resp(200, { body: html("Togel Hari Ini", "togel slot gacor togel slot gacor togel bandar togel situs slot") }));
assert.equal(hijack.verdict, "hijacked", "control: hijack detection unchanged");

// 2. Never follow an affiliate link — no request is made, first hop or redirect hop.
let calls = 0;
const counting = async () => { calls++; return resp(200, { body: html("x", "x".repeat(100)) }); };
for (const u of ["https://ticketmaster.evyy.net/c/7475855/264167/4272?u=https%3A%2F%2Fwww.ticketmaster.com%2Fe", "https://klook.tpx.lu/AbC", "https://www.anrdoezrs.net/click-1-2", "https://www.gowayfind.com/api/commerce/go?p=viator&id=1", "https://shop.example/e?irclickid=abc"]) {
  calls = 0;
  const r = await classify(u, counting);
  assert.equal(calls, 0, `no request to affiliate link ${u}`);
  assert.equal(r.verdict, "unknown", `affiliate link is never judged dead: ${u}`);
  assert.equal(r.reason, "affiliate-no-fetch");
}
calls = 0;
const hop = await classify("https://organizer.example/tickets", async (u) => { calls++; return u.includes("evyy") ? resp(200) : resp(302, { location: "https://ticketmaster.evyy.net/c/1/2/3?u=x" }); });
assert.equal(calls, 1, "a redirect INTO a tracker stops before the tracker is requested");
assert.equal(hop.reason, "affiliate-no-fetch");
assert.equal(isAffiliateLink("https://www.gowayfind.com/florida-events/x"), false, "control: our own event pages are not affiliate links");
assert.equal(isAffiliateLink("https://www.eventbrite.com/e/x?aff=ebdssbdestsearch"), false, "control: Eventbrite's own aff= tag is not a partner tracker");

// 3. Job health: inconclusive probes are not job failures; all-inconclusive is.
assert.equal(linkHealthJobFailed({ alive: 112, bad: 0, strike: 0, unknown: 8 }, 120), false, "8 bot walls of 120 is a healthy run (was red)");
assert.equal(linkHealthJobFailed({ alive: 0, bad: 0, strike: 0, unknown: 120 }, 120), true, "nothing conclusive = our outage, stays red");
assert.equal(linkHealthJobFailed({ alive: 0, bad: 0, strike: 0, unknown: 0 }, 0), false, "idle is not a failure");

// 4. The real route records failed=0 for a run with conclusive results + some unknowns.
{
  const saved = globalThis.fetch;
  process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.CRON_SECRET = "s3";
  const pulses = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = (init.method || "GET").toUpperCase();
    if (u.pathname === "/rest/v1/wf_job_pulse" && method === "POST") { pulses.push(JSON.parse(init.body)); return new Response(null, { status: 201 }); }
    if (u.pathname === "/rest/v1/wf_events" && method === "GET") {
      return Response.json([
        { event_id: "q", event_name: "Q", venue: "Q", official_ticket_url: "https://ticketmaster.evyy.net/c/1/2/3?u=x", official_event_url: null, event_page_url: null },
        { event_id: "h", event_name: "Grove Fest", venue: "Grove", official_ticket_url: "https://fruitvillegrove.com/tix", official_event_url: null, event_page_url: null },
      ]);
    }
    return new Response(null, { status: 204 });
  };
  try {
    const { GET } = await import("../app/api/cron/events-link-health/route.js");
    const res = await GET(new Request("https://x.test/api/cron/events-link-health", { headers: { authorization: "Bearer s3" } }));
    const body = await res.json();
    assert.equal(body.unknown, 1, "the affiliate row is inconclusive (not fetched)");
    assert.equal(body.bad, 1, "the hijacked row still darkens");
  } finally { globalThis.fetch = saved; }
  const p = pulses.flat().find((r) => r && r.job === "events-link-health");
  assert.ok(p, "the route recorded a pulse");
  assert.equal(p.failed, 0, "one inconclusive probe beside a conclusive one is not a failed run");
  assert.ok(/inconclusive/.test(p.note || ""), "inconclusive count stays visible in the note");
}

console.log("test-link-health-blocked-not-dead: OK — resets/loops/waiting rooms/403/429/5xx are unknown; 404/NXDOMAIN/hijack/off-domain stay bad; 0 requests to 5 affiliate shapes + redirect-into-tracker; job red only when nothing was conclusive");
