// scripts/test-cc-alert-drill.mjs — the alert-delivery drill
// (GET /api/cron/cc-alerts?drill=photos_not_serving) must be auth-gated,
// allow-listed, rate-limited, go through the SAME sender as real alerts, and
// never touch photo/spend ledgers or the real alert cooldown. Hermetic: CALLS the
// real route handler with env + global fetch faked (fake Resend capture, fake
// in-memory Supabase REST). No network.
import { GET } from "../app/api/cron/cc-alerts/route.js";   // env/fetch are read at call time, set below before any call

let pass = 0;
const fail = (m) => { console.error("test-cc-alert-drill: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const SECRET = "drill-test-secret";
process.env.CRON_SECRET = SECRET;
process.env.RESEND_API_KEY = "re_fake";
process.env.DIGEST_EMAIL = "owner@example.test";
process.env.WF_ALERT_FROM = "Wayfind Alerts <alerts@example.test>";
process.env.SUPABASE_URL = "https://fake.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-key";

const settings = new Map();   // wf_cc_settings k -> v
const emails = [];            // captured Resend bodies
let failRequestRead = false;   // scenario switch: Supabase read error on the request row
const writes = [];            // every non-GET REST call, "METHOD url body"
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), method = (init.method || "GET").toUpperCase();
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
  if (u.startsWith("https://api.resend.com/emails")) { emails.push(JSON.parse(init.body)); return json({ id: "fake" }); }
  if (method !== "GET") writes.push(method + " " + u + " " + String(init.body || "").slice(0, 300));
  if (u.includes("/rest/v1/wf_cc_settings")) {
    if (method === "GET") { const k = decodeURIComponent((u.match(/k=eq\.([^&]+)/) || [])[1] || ""); if (failRequestRead && k === "cc_alerts_drill_request") return json({ message: "boom" }, 500); return json(settings.has(k) ? [{ v: settings.get(k) }] : []); }
    if (method === "DELETE") { const k = decodeURIComponent((u.match(/k=eq\.([^&]+)/) || [])[1] || ""); settings.delete(k); return json([], 204); }
    const b = JSON.parse(init.body); settings.set(b.k, b.v); return json([], 201);
  }
  if (u.includes("/rest/v1/rpc/")) return json([]);   // aggregate RPCs: empty rowsets
  return json(method === "GET" ? [] : {}, method === "GET" ? 200 : 201);
};

const call = (qs, auth = "Bearer " + SECRET) => GET(new Request("https://x.test/api/cron/cc-alerts" + qs, { headers: auth ? { authorization: auth } : {} }));
const ledgerWrites = () => writes.filter((w) => /wf_photo_outcome_daily|wf_spend_ledger|wf_spend_take/.test(w));

// 1. No auth / wrong auth -> 401, nothing sent, nothing written.
{
  const a = await call("?drill=photos_not_serving", null);
  const b = await call("?drill=photos_not_serving", "Bearer wrong");
  ok(a.status === 401 && b.status === 401, "drill without valid bearer must be 401");
  ok(emails.length === 0 && writes.length === 0, "unauthorised drill must send/write nothing");
}
// 2. Unknown drill id -> 400, nothing sent.
for (const q of ["?drill=bogus", "?drill=", "?drill=__proto__", "?drill=toString"]) {
  const r = await call(q);
  ok(r.status === 400, `drill id ${JSON.stringify(q)} must be 400, got ${r.status}`);
}
ok(emails.length === 0, "bad drill ids must send nothing");
// 3. Good drill -> exactly one send, [DRILL] subject, class/count/subsystem/day in body.
{
  const r = await call("?drill=photos_not_serving");
  const j = await r.json();
  ok(r.status === 200 && j.drill === true && j.delivered === true && j.provider_status === 200, "good drill returns {drill:true, delivered:true, provider_status:200}");
  ok(j.alert && j.alert.id === "drill:photos_not_serving" && /^\[DRILL\]/.test(j.alert.title) && j.at, "response carries alert{id,title} and at");
  ok(emails.length === 1, "exactly one email for a good drill, got " + emails.length);
  const e = emails[0];
  ok(/\[DRILL\]/.test(e.subject), "subject must contain [DRILL]");
  ok(e.to && e.to[0] === "owner@example.test" && /alerts@example\.test/.test(e.from), "goes to DIGEST_EMAIL from WF_ALERT_FROM");
  ok(/Failure class: ledger-denied/.test(e.html) && /Count: 0 served vs 999 refused/.test(e.html) && /Subsystem: photos/.test(e.html), "body has class, count, subsystem");
  ok(/Site day \(ET\): \d{4}-\d{2}-\d{2}/.test(e.html) && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(e.html), "body has ET site day and ISO timestamp");
  ok(/GOOGLE_PHOTOS_MONTH_CAP/.test(e.html) && /command-center#health/.test(e.html), "body carries recovery guidance + link");
  ok(settings.has("cc_alerts_drill_sent") && !settings.has("cc_alerts_sent"), "drill cooldown uses its own key, real cc_alerts_sent untouched");
}
// 4. Second drill inside 10 minutes -> not sent.
{
  const r = await call("?drill=photos_not_serving");
  const j = await r.json();
  ok(j.drill === true && j.delivered === false && /cooldown/.test(j.reason), "second drill within 10 min is suppressed");
  ok(emails.length === 1, "no second email inside the drill cooldown");
}
// 5. Zero ledger writes anywhere.
ok(ledgerWrites().length === 0, "drill must never write wf_photo_outcome_daily / wf_spend_ledger: " + ledgerWrites().join(" | "));
// 6. No-drill call -> never produces a drill alert / drill cooldown write.
{
  const before = JSON.stringify(settings.get("cc_alerts_drill_sent"));
  const r = await call("");
  ok(r.status === 200, "plain hourly call still works (fake data), got " + r.status);
  ok(emails.slice(1).every((e) => !/DRILL|drill:/i.test(e.subject + e.html)), "plain call never emits a drill alert (it may send real alerts from the fake empty data)");
  ok(settings.has("cc_alerts_sent") && !/drill:/.test(JSON.stringify(settings.get("cc_alerts_sent"))), "real cooldown map holds no drill ids");
  ok(JSON.stringify(settings.get("cc_alerts_drill_sent")) === before, "plain call leaves drill state untouched");
  ok(ledgerWrites().length === 0, "plain call writes no ledgers either");
}
// 7. Secretless trigger: the NORMAL hourly run honours a wf_cc_settings request row.
const isDrillMail = (e) => /\[DRILL\]/.test(e.subject);
const reset = () => { emails.length = 0; writes.length = 0; settings.delete("cc_alerts_sent"); settings.delete("cc_alerts_drill_sent"); settings.delete("cc_alerts_drill_request"); failRequestRead = false; };
const reqRow = (id, ageMs) => ({ id, requested_at: new Date(Date.now() - ageMs).toISOString() });
reset();
await call("");
const baselineMails = emails.map((e) => e.subject);
const baselineWrites = writes.length;
ok(baselineMails.length >= 1 && baselineMails.every((x) => !/DRILL/.test(x)), "baseline hourly run sends real alerts only (fake empty data)");
{ // no row -> identical behaviour, no extra writes
  reset(); await call("");
  ok(JSON.stringify(emails.map((e) => e.subject)) === JSON.stringify(baselineMails) && writes.length === baselineWrites, "no request row: same emails and same write count as baseline");
}
{ // valid row -> real alerts unchanged + exactly one [DRILL] + row deleted
  reset(); settings.set("cc_alerts_drill_request", reqRow("photos_not_serving", 60000));
  const r = await call("");
  ok(r.status === 200, "hourly run with a request row still returns 200");
  ok(emails.filter((e) => !isDrillMail(e)).map((e) => e.subject).join("|") === baselineMails.join("|"), "real alerts delivered exactly as baseline");
  ok(emails.filter(isDrillMail).length === 1, "exactly one [DRILL] send for a valid request row");
  ok(!settings.has("cc_alerts_drill_request"), "request row deleted after the delivery attempt");
  ok(settings.has("cc_alerts_drill_sent") && !/drill:/.test(JSON.stringify(settings.get("cc_alerts_sent"))), "drill cooldown on its own key; real cooldown map has no drill id");
  ok(ledgerWrites().length === 0, "request-row drill writes no ledgers");
  const again = await call("");
  ok(again.status === 200 && emails.filter(isDrillMail).length === 1, "next hourly run does not re-send (row gone)");
}
{ // stale row -> deleted, nothing sent
  reset(); settings.set("cc_alerts_drill_request", reqRow("photos_not_serving", 4 * 3600000));
  await call("");
  ok(emails.filter(isDrillMail).length === 0 && !settings.has("cc_alerts_drill_request"), "stale (>3h) request: deleted, nothing sent");
  reset(); settings.set("cc_alerts_drill_request", reqRow("not_a_drill", 1000));
  await call("");
  ok(emails.filter(isDrillMail).length === 0 && !settings.has("cc_alerts_drill_request"), "unknown-id request: deleted, nothing sent");
}
{ // Supabase read error -> real alerts still sent
  reset(); failRequestRead = true; settings.set("cc_alerts_drill_request", reqRow("photos_not_serving", 1000));
  const r = await call("");
  ok(r.status === 200 && emails.map((e) => e.subject).join("|") === baselineMails.join("|"), "request-row read error: real alerts still sent, no drill");
  ok(settings.has("cc_alerts_drill_request"), "read error leaves the row for the next run");
  failRequestRead = false;
}
console.log(`test-cc-alert-drill: OK — ${pass} assertions (auth 401, allow-list 400, one [DRILL] send via the real sender, 10-min drill cooldown on separate key, zero ledger writes, no-drill path inert)`);
