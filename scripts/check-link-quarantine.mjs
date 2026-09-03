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
ok(/link_ok,link_verdict"/.test(curated), "lib/curatedEvents selects link_ok so the sweep's verdict reaches the composer");
const flEvents = strip(read("app/florida-events/[slug]/page.js"));
ok(/href=\{safeUrl\(e\.official_event_url\)\}/.test(flEvents) && !/href=\{e\.official_event_url\}/.test(flEvents), "the single-event page's official link passes through safeUrl");
const mw = strip(read("middleware.js"));
ok(/"\/api\/outbound\/verdict",/.test(mw), "middleware rate-limits /api/outbound/verdict (it fetches third-party pages on request)");
const crons = JSON.parse(read("vercel.json")).crons.map((c) => c.path);
ok(crons.includes("/api/cron/events-link-health"), "vercel.json schedules the nightly events-link-health content sweep");
const cronSrc = strip(read("app/api/cron/events-link-health/route.js"));
ok(/probeAndClassify\(/.test(cronSrc) && /link_ok: false/.test(cronSrc) && /wf_link_verdicts/.test(cronSrc) && /wf_broken_links/.test(cronSrc),
  "the sweep probes by content, darkens rows, and records verdicts + broken links");
const probe = strip(read("lib/linkProbe.js"));
ok(/isDeniedHost\(host\)/.test(probe) && /"unknown", reason: "denied-host-no-fetch"/.test(probe), "the probe never fetches a denied (Disney) host — AGENTS.md §7");

if (fail.length) {
  console.error("check-link-quarantine: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`check-link-quarantine: OK — ${pass} assertions; the chokepoint refuses the ledger, the classifier catches both incident shapes (and spares Hard Rock, Spanish pages, bot walls), every render site routes through the call`);
