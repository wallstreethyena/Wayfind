// scripts/check-link-quarantine.mjs — the regression lock for the 2026-09-02
// hijacked-domain incident (fruitvillegrove.com → Indonesian togel site;
// olearystikibar.com → injected online-casino copy).
//
// Assert on the CALL wherever the thing can be executed (CLAUDE.md): the
// chokepoint (lib/links.safeUrl), the classifier
// (lib/linkQuarantine.classifyOutboundPage) on fixtures shaped like both real
// incidents, and the event composer (lib/curatedEvents.eventOutboundUrl).
// Then the structural positions nothing else can prove — the render sites
// that must route through those calls — each red-proved by a scratch mutation
// whose application is itself asserted.
import { readFileSync } from "node:fs";
import { safeUrl } from "../lib/links.js";
import { classifyOutboundPage, isQuarantinedUrl, QUARANTINED_HOSTS, isBadVerdict } from "../lib/linkQuarantine.js";
import { eventOutboundUrl } from "../lib/curatedEvents.js";

let pass = 0;
const fail = [];
const ok = (c, m) => (c ? pass++ : fail.push(m));

// ── 1. The chokepoint refuses the ledger, and only the ledger ─────────────
ok(Object.keys(QUARANTINED_HOSTS).length >= 2, "the quarantine ledger carries the two 2026-09-02 incidents");
ok(safeUrl("https://www.fruitvillegrove.com/") === null, "safeUrl refuses the hijacked fruitvillegrove.com (www)");
ok(safeUrl("https://fruitvillegrove.com/pumpkins") === null, "safeUrl refuses the hijacked apex with a path");
ok(safeUrl("https://shop.olearystikibar.com/x") === null, "safeUrl refuses a subdomain of a quarantined host");
ok(safeUrl("https://fruitvillegrovefarm.com/festival/") === "https://fruitvillegrovefarm.com/festival/", "safeUrl still accepts the grove's REAL site");
ok(safeUrl("https://notfruitvillegrove.com/") === "https://notfruitvillegrove.com/", "quarantine is suffix-matched on labels, not a substring match");
ok(safeUrl("/api/viator/go?x=1") === "/api/viator/go?x=1", "app-relative routes are untouched");
ok(isQuarantinedUrl("https://olearystikibar.com/") && !isQuarantinedUrl("https://geckosgrill.com/"), "isQuarantinedUrl answers by host");

// ── 2. The classifier on incident-shaped fixtures ─────────────────────────
const togel = `<!doctype html><html lang="id"><head><title>Togel Singapore, Data Pengeluaran SGP, Togel Hongkong, Data Keluaran HK Hari Ini</title></head>
<body><a>DAFTAR</a><a>LOGIN</a><h1>Data Pengeluaran SGP Sore Ini di Rancang Membantu Penjudi Togel Singapore Hari Ini</h1>
<p>Situs slot gacor hari ini terbaru. Link slot gacor. Togel hongkong lebih mudah dimainkan dari smartphone. RTP slot.</p><p>WA Resmi</p></body></html>`;
const v1 = classifyOutboundPage({ requestedUrl: "https://www.fruitvillegrove.com/", status: 200, finalUrl: "https://www.fruitvillegrove.com/", html: togel, expectedNames: ["Fruitville Grove Pumpkin Festival", "Fruitville Grove"] });
ok(v1.verdict === "hijacked", `the fruitvillegrove.com togel page classifies hijacked (got ${v1.verdict} / ${v1.reason})`);
ok(v1.nameMatch === false, "…and the expected venue is absent from it");

const olearys = `<html lang="en"><head><title>Home - Olearys Tiki Bar</title></head><body>
<h1>O'Leary's Tiki Bar &amp; Grill</h1><p>Bayfront Park, Sarasota. Open daily 8am-10pm. Live music nightly. Call (941) 953-7505.</p>
<p>Fair Go Casino is a popular online casino known for its generous bonuses and extensive selection of games from WGS Technology.
Players who enjoy slot machines, blackjack, and other classic casino entertainment can explore sister sites offering similar promotions.
Desert Nights Casino offers its players a relaxing yet exciting atmosphere. Regular slots tournaments and loyalty programs with weekly cashback make this casino a favorite.
All of these casinos offer generous bonus programs, 24/7 support and licensed games. Claim your no deposit bonus and free spins with bonus code TIKI.</p>
<p>Band schedule: Friday Reggae, Saturday Steel Drums.</p></body></html>`;
const v2 = classifyOutboundPage({ requestedUrl: "https://www.olearystikibar.com/", status: 200, finalUrl: "https://www.olearystikibar.com/", html: olearys, expectedNames: ["O'Leary's Tiki Bar & Grill"] });
ok(v2.verdict === "hijacked", `injected casino copy on a real venue page classifies hijacked even with a name match (got ${v2.verdict} / ${v2.reason})`);
ok(v2.nameMatch === true, "…the venue name IS present (injection, not takeover) and does not rescue it");

const hardRock = `<html lang="en"><head><title>Seminole Hard Rock Hotel &amp; Casino Tampa</title></head><body>
<h1>Seminole Hard Rock Tampa</h1><p>Hotel, dining and the casino floor. Council Oak Steaks. Rock Spa. Book a room.</p>
<p>The casino floor is open 24 hours. Poker room. Slot machines and table games.</p></body></html>`;
const v3 = classifyOutboundPage({ requestedUrl: "https://www.seminolehardrocktampa.com/", status: 200, finalUrl: "https://www.seminolehardrocktampa.com/", html: hardRock, expectedNames: ["Seminole Hard Rock Hotel & Casino Tampa"] });
ok(v3.verdict === "alive", `a real casino venue's own page stays alive — weak terms + name match (got ${v3.verdict} / ${v3.reason}, score ${v3.score})`);

// 2026-10-13 false positive: a genuine county event page whose footer lists the
// "Twelfth Judicial Circuit Court" scored 10 via the substring "judi" and was
// labelled hijacked. "judi" now matches as a whole word only.
const county = `<html lang="en"><head><title>Goblin Gathering</title></head><body><nav>Services and Amenities Our Highlighted Amenities Athletic Fields</nav>
<footer>Clerk of the Circuit Court Property Appraiser Sheriff's Office Supervisor of Elections Tax Collector Twelfth Judicial Circuit Court School District</footer>
<h1>Goblin Gathering</h1><p>Friday, October 16, 2026 4:00 to 7:00 PM GT Bray 51st ST Park. Free admission.</p><footer>Twelfth Judicial Circuit Court</footer></body></html>`;
const vCounty = classifyOutboundPage({ requestedUrl: "https://www.mymanatee.org/e", status: 200, finalUrl: "https://www.mymanatee.org/e", html: county, expectedNames: ["Goblin Gathering", "G.T. Bray Park"] });
ok(vCounty.verdict === "alive" && vCounty.score === 0, `a county page with "Judicial Circuit Court" in the footer stays alive (got ${vCounty.verdict} / ${vCounty.reason} / score ${vCounty.score})`);
const judiSpam = `<html lang="en"><head><title>Agen Judi Online</title></head><body><p>Judi slot gacor. Daftar judi online terpercaya.</p></body></html>`;
const vJudi = classifyOutboundPage({ requestedUrl: "https://x.example.com/", status: 200, finalUrl: "https://x.example.com/", html: judiSpam, expectedNames: ["Some Venue"] });
ok(vJudi.verdict === "hijacked", `whole-word "judi" spam still classifies hijacked (got ${vJudi.verdict})`);

const parked = `<html><head><title>innsontheisland.com</title></head><body><h1>This domain is for sale</h1><p>Buy this domain. Related searches. Sponsored listings.</p></body></html>`;
const v4 = classifyOutboundPage({ requestedUrl: "https://www.innsontheisland.com/", status: 200, finalUrl: "https://www.innsontheisland.com/", html: parked, expectedNames: ["Island Breeze Inn"] });
ok(v4.verdict === "parked", `a registrar parking page classifies parked (got ${v4.verdict})`);

const v5 = classifyOutboundPage({ requestedUrl: "https://x.example.com/a", status: 404, finalUrl: "https://x.example.com/a", html: "<html><title>Not found</title></html>", expectedNames: ["X"] });
ok(v5.verdict === "dead", "HTTP 404 classifies dead");
const v5b = classifyOutboundPage({ requestedUrl: "https://x.example.com/a", status: 0, finalUrl: "https://x.example.com/a", html: "", expectedNames: ["X"] });
ok(v5b.verdict === "dead", "a DNS / connection failure classifies dead");

const soft = `<html lang="en"><head><title>Zenoti</title></head><body><h2>Something went wrong!</h2><p>Please try again later.</p></body></html>`;
const v6 = classifyOutboundPage({ requestedUrl: "https://riobodywax.zenoti.com/webstoreNew/services/x", status: 200, finalUrl: "https://riobodywax.zenoti.com/webstoreNew/services/x", html: soft, expectedNames: ["Rio Body Wax"] });
ok(v6.verdict === "soft404", `a 200 error template classifies soft404 (got ${v6.verdict})`);

const unrelated = `<html lang="en"><head><title>Acme Roofing Supply</title></head><body><h1>Acme Roofing Supply</h1><p>Shingles, underlayment, gutters.</p></body></html>`;
const v7 = classifyOutboundPage({ requestedUrl: "https://www.rivieradunesdockside.com/", status: 200, finalUrl: "https://www.acmeroofing.example/", html: unrelated, expectedNames: ["Riviera Dunes Dockside"] });
ok(v7.verdict === "offsite", `a cross-org redirect to an unrelated site classifies offsite (got ${v7.verdict})`);
const eb = `<html lang="en"><head><title>Orange Blossom Revue Tickets</title></head><body><h1>Orange Blossom Revue</h1><p>Lake Wailes Park.</p></body></html>`;
const v8 = classifyOutboundPage({ requestedUrl: "https://www.orangeblossomrevue.com/tickets", status: 200, finalUrl: "https://www.eventbrite.com/e/orange-blossom-revue-123", html: eb, expectedNames: ["Orange Blossom Revue"] });
ok(v8.verdict === "alive", `a redirect to a known ticketing vendor stays alive (got ${v8.verdict})`);
const v9 = classifyOutboundPage({ requestedUrl: "https://sobewff.org/", status: 200, finalUrl: "https://corporate.sobewff.org/", html: "<html lang='en'><title>South Beach Wine & Food Festival</title><body><h1>SOBEWFF</h1><p>Food Network South Beach Wine &amp; Food Festival presented by Capital One.</p></body></html>", expectedNames: ["Food Network South Beach Wine & Food Festival"] });
ok(v9.verdict === "alive", `a same-org subdomain redirect stays alive (got ${v9.verdict})`);
const v10 = classifyOutboundPage({ requestedUrl: "https://www.treeumph.com/", status: 403, finalUrl: "https://www.treeumph.com/", html: "", expectedNames: ["TreeUmph"] });
ok(v10.verdict === "unknown" && !isBadVerdict("unknown"), "a bot wall (403) is unknown, never bad — our reading problem, not the venue's");
const normal = `<html lang="en"><head><title>Annual Pumpkin Festival – Fruitville Grove Store</title></head><body><h1>38th Annual Pumpkin Festival</h1><p>Every Weekend in October! Sat &amp; Sun 10:00 am – 5:00 pm. Pony rides, costume contest, food vendors.</p></body></html>`;
const v11 = classifyOutboundPage({ requestedUrl: "https://fruitvillegrovefarm.com/festival/", status: 200, finalUrl: "https://fruitvillegrovefarm.com/festival/", html: normal, expectedNames: ["Fruitville Grove Pumpkin Festival", "Fruitville Grove"] });
ok(v11.verdict === "alive" && v11.nameMatch === true, `the grove's real festival page is alive with a name match (got ${v11.verdict} / ${v11.reason})`);
const spanish = `<html lang="es"><head><title>Islas Canarias Restaurant</title></head><body><h1>Islas Canarias</h1><p>Cocina cubana en Miami desde 1977.</p></body></html>`;
const v12 = classifyOutboundPage({ requestedUrl: "https://islascanariasrestaurant.com/", status: 200, finalUrl: "https://islascanariasrestaurant.com/", html: spanish, expectedNames: ["Islas Canarias Restaurant"] });
ok(v12.verdict === "alive", "a Spanish-language Florida venue page is alive — Spanish is not a foreign-language signal here");

// ── 3. The event composer publishes nothing bad ───────────────────────────
ok(eventOutboundUrl({ official_event_url: "https://www.fruitvillegrove.com", link_ok: null }) === "", "a quarantined event URL yields no outbound URL even before the sweep has run");
ok(eventOutboundUrl({ official_ticket_url: "https://www.eventbrite.com/e/1", official_event_url: "https://www.fruitvillegrove.com", link_ok: null }) === "https://www.eventbrite.com/e/1", "a good ticket URL still wins when only the event URL is quarantined");
ok(eventOutboundUrl({ official_ticket_url: "https://www.eventbrite.com/e/1", link_ok: false }) === "", "link_ok=false (the sweep found it bad) publishes nothing, whatever the URLs say");
ok(eventOutboundUrl({ official_event_url: "https://fruitvillegrovefarm.com/festival/", link_ok: true }) === "https://fruitvillegrovefarm.com/festival/", "a clean row publishes its URL");
ok(eventOutboundUrl({ official_event_url: "N/A" }) === "", "junk sentinels still yield nothing");

// ── 4. Render sites route through the calls (structural, red-proved) ──────
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const railCard = strip(read("app/components/RailCard.js"));
const RC_CTA = /const ctaHref = cta && cta\.external \? safeUrl\(cta\.href\) : null;/;
const RC_HREF = /href=\{ctaHref \|\| cta\.href \|\| "#"\}/;
const RC_OPEN = /if \(external\) \{ const safe = safeUrl\(href\); if \(safe\) window\.open\(safe/;
ok(RC_CTA.test(railCard) && RC_HREF.test(railCard) && RC_OPEN.test(railCard) && /import \{ safeUrl \} from "\.\.\/\.\.\/lib\/links\.js";/.test(railCard),
  "RailCard: an external CTA and an external body-open both pass through safeUrl");
{ // red-prove: drop the gate and the structural check must fail; assert the mutation applied
  const mutated = railCard.replace(RC_CTA, "const ctaHref = cta ? cta.href : null;");
  ok(mutated !== railCard && !RC_CTA.test(mutated), "red-prove(RailCard): removing the safeUrl gate is detected");
}
const detail = strip(read("app/components/sheets/Detail.js"));
const D_CAND = /const websiteCandidate = detailExtra \? safeUrl\(detailExtra\.website\) : null;/;
const D_OK = /const websiteHref = websiteOk === true \? websiteCandidate : null;/;
const D_FETCH = /fetch\("\/api\/outbound\/verdict"/;
const D_RENDER = /\{websiteHref && <a href=\{websiteHref\}/;
ok(D_CAND.test(detail) && D_OK.test(detail) && D_FETCH.test(detail) && D_RENDER.test(detail) && !/href=\{detailExtra\.website\}/.test(detail),
  "Detail: the Website button renders only from websiteHref, which exists only after /api/outbound/verdict answered ok");
{ const mutated = detail.replace(D_OK, "const websiteHref = websiteCandidate;");
  ok(mutated !== detail && !D_OK.test(mutated), "red-prove(Detail): bypassing the verdict is detected"); }
const fallRoute = strip(read("app/api/events/fall/route.js"));
ok(/url: eventOutboundUrl\(e\) \|\| null,/.test(fallRoute) && !/e\.official_ticket_url \|\| e\.official_event_url/.test(fallRoute),
  "the fall events endpoint composes url via eventOutboundUrl, not a raw column fallback chain");
const curated = strip(read("lib/curatedEvents.js"));
// 2026-09-03: the feed's url is the affiliate commerce redirect when one sells
// the event (eventTicketHref — our own /api/commerce/go path, never a partner
// URL) and otherwise eventOutboundUrl; officialUrl is always eventOutboundUrl.
// Either way every OUTBOUND URL is composed by eventOutboundUrl.
ok(/url: eventTicketHref\(row\.event_id, \{ surface: "events_feed" \}\) \|\| eventOutboundUrl\(row\),/.test(curated)
  && /officialUrl: eventOutboundUrl\(row\),/.test(curated)
  && (curated.match(/official_ticket_url \|\| (?:row|e)\.official_event_url/g) || []).length === 0,
  "lib/curatedEvents composes every published outbound URL via eventOutboundUrl — zero raw fallback chains remain (the commerce redirect is our own path)");
{
  const colDecl = curated.match(/const EVENT_COLUMNS =\s*([\s\S]*?);/);
  ok(!!colDecl && /\blink_ok\b/.test(colDecl[1]) && /\blink_verdict\b/.test(colDecl[1]),
    "lib/curatedEvents selects link_ok so the sweep's verdict reaches the composer");
}
const flEvents = strip(read("app/florida-events/[slug]/page.js"));
// v8.99 — the official link is `site`, derived ONCE from eventWebsiteUrl(e)
// (link_ok gate + safeUrl), and every href on the page uses that gated value.
// A raw column must never reach an href.
ok(/const site = eventWebsiteUrl\(e\)/.test(flEvents) && /href=\{site\}/.test(flEvents) && !/href=\{e\.official_event_url\}|href=\{safeUrl\(e\.official_event_url\)\}/.test(flEvents),
  "the single-event page's official link is the gated `site` from eventWebsiteUrl (link_ok + safeUrl), never the raw column");
ok(/export function eventWebsiteUrl[\s\S]*?link_ok === false\) return ""[\s\S]*?safeUrl\(raw\)/.test(curated),
  "lib/curatedEvents.eventWebsiteUrl honours link_ok and safeUrl exactly like eventOutboundUrl");
const mw = strip(read("middleware.js"));
ok(/"\/api\/outbound\/verdict",/.test(mw), "middleware rate-limits /api/outbound/verdict (it fetches third-party pages on request)");
const crons = JSON.parse(read("vercel.json")).crons.map((c) => c.path);
ok(crons.includes("/api/cron/events-link-health"), "vercel.json schedules the nightly events-link-health content sweep");
const cronSrc = strip(read("app/api/cron/events-link-health/route.js"));
ok(/probeAndClassify\(/.test(cronSrc) && /link_ok: false/.test(cronSrc) && /wf_link_verdicts/.test(cronSrc) && /link_manual_verifications/.test(cronSrc) && /manual-browser-verification/.test(cronSrc),
  "the sweep probes by content, darkens rows, records verdicts, and honors only expiring exact-URL browser verification fuses");
const probe = strip(read("lib/linkProbe.js"));
ok(/isDeniedHost\(host\)/.test(probe) && /"unknown", reason: "denied-host-no-fetch"/.test(probe), "the probe never fetches a denied (Disney) host — AGENTS.md §7");

// wf_link_verdicts upsert (2026-10-13): a batch naming one url twice is a Postgres
// "cannot affect row a second time" error -> PostgREST 500 -> nothing persisted since 2026-10-02.
{
  const q = await import("../lib/linkQuarantine.js");
  const dup = q.dedupeVerdictRows([
    { url: "https://a.test/x", verdict: "alive" }, { url: "https://a.test/x", verdict: "dead" },
    { url: "https://b.test/y", verdict: "alive" }, { url: "https://b.test/y", verdict: "alive" }, null,
  ]);
  ok(dup.length === 2 && new Set(dup.map((r) => r.url)).size === 2, "dedupeVerdictRows leaves exactly one row per url");
  ok(dup.find((r) => r.url === "https://a.test/x").verdict === "dead", "the worst verdict wins for a shared url");
  ok(/dedupeVerdictRows\(verdictRows\)/.test(cronSrc) && !/JSON\.stringify\(verdictRows\)/.test(cronSrc), "the sweep upserts the DEDUPED rows, never the raw batch");
}

// wf_broken_links is a read-only VIEW over active wf_deals rows (link_ok is
// false) - not a table the events sweep may write. 2026-10-14 pulse "persistence
// error: broken-400": the sweep POSTed a darkened event into it, i.e. an INSERT
// into wf_deals, which answered 23502 (affiliate_url NOT NULL). EXECUTE the real
// route against a fake PostgREST that enforces the schema contract.
{
  const READ_ONLY_VIEWS = new Set(["wf_broken_links"]); // production relkind 'v'
  const WRITABLE = new Set(["wf_events", "wf_link_verdicts", "wf_job_pulse"]);
  const savedFetch = globalThis.fetch;
  // Assigned, never read from the shell (guard hermeticity): the fake backend is fully explicit.
  process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.CRON_SECRET = "s3";
  const writes = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const m = u.pathname.match(/^\/rest\/v1\/([a-z_]+)/);
    const method = (init.method || "GET").toUpperCase();
    if (!m) return new Response("{}", { status: 200 });
    if (method === "GET") {
      return Response.json([{ event_id: "e1", event_name: "Grove Fest", venue: "Grove", official_ticket_url: "https://fruitvillegrove.com/tix", official_event_url: null, event_page_url: null, link_ok: null, link_verdict: null, link_manual_verifications: null }]);
    }
    writes.push({ table: m[1], method, body: init.body ? JSON.parse(init.body) : null });
    if (READ_ONLY_VIEWS.has(m[1])) return Response.json({ code: "23502", message: "null value in column \"affiliate_url\" of relation \"wf_deals\" violates not-null constraint" }, { status: 400 });
    return new Response(null, { status: 204 });
  };
  let res, body;
  try {
    const { GET } = await import("../app/api/cron/events-link-health/route.js");
    res = await GET(new Request("https://x.test/api/cron/events-link-health", { headers: { authorization: "Bearer s3" } }));
    body = await res.json();
  } finally {
    globalThis.fetch = savedFetch;
  }
  ok(body && body.ok === true && !body.error, "a flagged event link completes with no persistence error (was broken-400)");
  ok(writes.every((w) => !READ_ONLY_VIEWS.has(w.table) && WRITABLE.has(w.table)), "the sweep writes only base tables, never the wf_broken_links view: " + [...new Set(writes.map((w) => w.table))].join(","));
  const darkened = writes.find((w) => w.table === "wf_events" && w.method === "PATCH" && w.body && w.body.link_ok === false && w.body.link_verdict === "hijacked");
  ok(!!darkened, "a genuinely bad link is still persisted: wf_events.link_ok=false, link_verdict=hijacked");
  const vr = writes.find((w) => w.table === "wf_link_verdicts");
  ok(!!vr && Array.isArray(vr.body) && vr.body.some((r) => r.url === "https://fruitvillegrove.com/tix" && r.verdict === "hijacked"), "a genuinely bad link is still recorded in wf_link_verdicts");
}

if (fail.length) {
  console.error("check-link-quarantine: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`check-link-quarantine: OK — ${pass} assertions; the chokepoint refuses the ledger, the classifier catches both incident shapes (and spares Hard Rock, Spanish pages, bot walls), every render site routes through the call`);
