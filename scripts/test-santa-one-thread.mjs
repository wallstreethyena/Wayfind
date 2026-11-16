#!/usr/bin/env node
// scripts/test-santa-one-thread.mjs — locks the owner's 2026-11-14 fix: ONE Santa conversation for planning and
// restaurant reservations, "Organize my saved stops" that sees the real trip, and one reader for booking phrases.
//   1. lib/santaIntent.js classifies the owner's exact phrases (and typos) the same way for client and server;
//      negative controls stay out; no generic word or typo is ever searched as a venue name.
//   2. The REAL /api/planner route (network stubbed, zero spend) hands a table request back as mode "reserve"
//      with no model call, so the planner can never again answer "I can't book a table from here".
//   3. lib/organizeTrips.js picks the right trip (selected, only one, ask when several, honest empty) and a forged
//      key that is not in the visitor's own store is ignored.
//   4. Wiring: the chat routes tables to the concierge in-thread, every Santa door opens the chat, the offer passes
//      the trip key, the concierge renders into the thread and only a Confirm tap books.
// Dates are computed from siteTodayStr() (America/New_York) at run time, never copied from a report.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const fails = [];
const ok = (cond, msg) => { n += 1; if (!cond) fails.push(msg); };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (f) => readFileSync(path.join(REPO, f), "utf8");

const { classifySantaMessage, reserveVenue } = await import("../lib/santaIntent.js");
const { normalizeGenericTypos, parseReserveIntent } = await import("../lib/guestReserveIntent.js");
const { siteTodayStr } = await import("../lib/siteTime.js");
const { addDays } = await import("../lib/reserveFormat.js");
const today = siteTodayStr();
const c = (m, extra = {}) => classifySantaMessage(m, { today, ...extra });

// ── 1. One reader ───────────────────────────────────────────────────────────
{
  const r = c("book me a table for 4 tonight at 7");
  ok(r.kind === "reserve" && r.details.venue === "" && r.details.partySize === 4 && r.details.time === "19:00" && r.details.date === today,
    `"book me a table for 4 tonight at 7" -> reserve, no venue, 4 people, 19:00, today (got ${JSON.stringify(r)})`);
  const r2 = c("reserve dinner for four tomorrow");
  ok(r2.kind === "reserve" && r2.details.venue === "" && r2.details.partySize === 4 && r2.details.date === addDays(today, 1),
    `"reserve dinner for four tomorrow" -> reserve, 4, tomorrow (got ${JSON.stringify(r2)})`);
  const r3 = c("find a redtaurant near me");
  ok(r3.kind === "find_food" && r3.details.venue === "", `"find a redtaurant near me" -> discovery, not a booking, no venue named "redtaurant" (got ${JSON.stringify(r3)})`);
  const r4 = c("book Ulele Friday at 7 for 4");
  ok(r4.kind === "reserve" && r4.details.venue === "Ulele" && r4.details.partySize === 4 && r4.details.time === "19:00" && /^\d{4}-\d{2}-\d{2}$/.test(r4.details.date || ""),
    `"book Ulele Friday at 7 for 4" -> reserve Ulele, 4, 19:00, a Friday (got ${JSON.stringify(r4)})`);
  ok(new Date(r4.details.date + "T12:00:00Z").getUTCDay() === 5, "Friday resolves to a Friday on the Eastern calendar");
  const r5 = c("Book it again next Friday");
  ok(r5.kind === "reserve" && r5.details.again === true && r5.details.venue === "", `"Book it again next Friday" -> reserve, again, no invented venue (got ${JSON.stringify(r5)})`);
  const r6 = c("Can u book me a redtaurant?");
  ok(r6.kind === "reserve" && r6.details.venue === "", `the owner's own "Can u book me a redtaurant?" -> reserve with no venue (got ${JSON.stringify(r6)})`);
  for (const neg of ["bookstore near me", "I read a book", "don't book anything", "dont book anything yet", "We already have a reservation at Bern's", "our table is already booked", "The book was great"]) {
    ok(c(neg).kind === "none", `negative control stays out of booking: "${neg}" (got ${c(neg).kind})`);
  }
  ok(c("Tampa this weekend, two adults, Christmas lights and great food").kind === "plan", "a trip request is planning");
  ok(c("book a weekend trip to Tampa").kind === "plan", "\"book a weekend trip\" is a trip, not a table");
  ok(c("7pm works", { reserveActive: true }).kind === "reserve" && c("7pm works").kind === "none", "a bare follow up belongs to the booking only while one is in progress");
  ok(c("Plan my Tampa weekend", { reserveActive: true }).kind === "plan", "planning words leave the booking (planning -> booking -> planning)");
  // Typos: generic words only, proper names untouched; Bern's handling kept.
  ok(normalizeGenericTypos("Can u book me a redtaurant tonite?") === "Can u book me a restaurant tonight?", "generic typos are fixed");
  ok(normalizeGenericTypos("Berns and Ulele and Restuarant Row") === "Berns and Ulele and Restaurant Row", "proper names are never rewritten; a capitalised typo keeps its capital");
  ok(reserveVenue("reserve a table at Berns friday at 8 for 2") === "Berns", "Berns stays a venue (the concierge resolves Bern's)");
  for (const generic of ["book me a table", "book me a restaurant", "book me a redtaurant", "reserve a reservation", "book it again"]) {
    ok(reserveVenue(generic) === "", `no venue search for a generic word: "${generic}"`);
  }
  const legacy = parseReserveIntent("Can u book me a redtaurant?", today);
  ok(legacy === null, `legacy reader (santa-chat) no longer searches "redtaurant" as a name (got ${JSON.stringify(legacy)})`);
}

// ── 2. The real planner route hands tables to Reserve, with no model call ──
{
  for (const k of ["ANTHROPIC_API_KEY", "LLM_API_KEY", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]) delete process.env[k];
  process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
  process.env.WAYFIND_GATE = "open";
  process.env.ANTHROPIC_MONTHLY_REQUEST_CAP = "5";
  process.env.SUPABASE_URL = "https://stub.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-service-key";
  let modelCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url && url.url ? url.url : url);
    if (/api\.anthropic\.com/.test(u)) { modelCalls += 1; return new Response(JSON.stringify({ content: [{ type: "text", text: "I can't book a table from here." }] }), { status: 200 }); }
    if (/wf_spend_take/.test(u)) return new Response("true", { status: 200 });
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };
  const route = await loadComponent(path.join(REPO, "app/api/planner/route.js"), REPO);
  let ip = 0;
  const post = async (body) => { ip += 1; const res = await route.POST(new Request("https://www.gowayfind.com/api/planner", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${ip}` }, body: JSON.stringify(body) })); return res.json(); };
  for (const m of ["Can u book me a redtaurant?", "book me a table for 4 tonight at 7", "book Ulele Friday at 7 for 4", "find a redtaurant near me"]) {
    modelCalls = 0;
    const j = await post({ message: m, voice: "santa" });
    ok(j.ok && j.mode === "reserve" && modelCalls === 0, `/api/planner routes "${m}" to Reserve with zero model calls (got ${j.mode}, ${modelCalls} calls)`);
    ok(!/can'?t book|cannot book/i.test(String(j.reply || "")), `the reply never says it can't book ("${j.reply}")`);
  }
  modelCalls = 0;
  const neg = await post({ message: "I read a book about Tampa", voice: "santa" });
  ok(neg.mode !== "reserve", "a negative control is not routed to Reserve");
  globalThis.fetch = realFetch;
}

// ── 3. Saved stops: the right trip, never a forged one ──────────────────────
{
  const { resolveOrganizeTrip, tripsNeedingDays, organizePreview } = await import("../lib/organizeTrips.js");
  const one = { t1: { title: "Tampa", items: [{ id: "a" }, { id: "b" }, { id: "c", day: "2026-11-20" }] } };
  ok(JSON.stringify(resolveOrganizeTrip(one, null)) === JSON.stringify({ kind: "one", key: "t1" }), "the only trip with undated stops is chosen");
  const two = { ...one, t2: { title: "Orlando", items: [{ id: "x" }] } };
  const ch = resolveOrganizeTrip(two, null);
  ok(ch.kind === "choose" && ch.trips.length === 2, "several qualifying trips -> ask which (never merged)");
  ok(resolveOrganizeTrip(two, "t2").key === "t2", "the selected trip wins when it qualifies");
  ok(resolveOrganizeTrip(two, "someone_elses_trip").kind === "choose", "a key that is not in the visitor's own store is ignored");
  ok(resolveOrganizeTrip({}, null).kind === "empty" && resolveOrganizeTrip({ t: { items: [{ id: "a", day: "2026-11-20" }] } }, null).kind === "empty", "no undated stops -> an honest empty answer");
  ok(tripsNeedingDays(one)[0].count === 2 && tripsNeedingDays(one)[0].total === 3, "counts the undated stops and keeps the dated ones");
  const prev = organizePreview({ items: [{ day: "2026-11-21", place: { name: "B" } }, { day: "2026-11-20", place: { name: "A" } }, { place: { name: "C" } }] });
  ok(prev.length === 3 && prev[0].names[0] === "A" && /Friday/.test(prev[0].day) && prev[2].day === "No day yet", `the preview lists days in order with readable labels (got ${JSON.stringify(prev)})`);
}

// ── 4. Wiring of the one thread ─────────────────────────────────────────────
{
  const sheet = strip(read("app/components/WayfindPlannerSheet.js"));
  ok(/const routed = classifySantaMessage\(text,/.test(sheet) && /routed\.kind === "reserve" \|\| routed\.kind === "find_food"[\s\S]{0,80}routeToReserve\(text, routed, \{ showUser: true \}\)/.test(sheet),
    "every typed turn goes through the one reader, and tables go to Reserve before the planner");
  ok(/data\.mode === "reserve"[\s\S]{0,200}routeToReserve\(/.test(sheet), "a server-side \"reserve\" answer joins the same booking");
  ok(/<ReserveConcierge[\s\S]{0,120}\bthread\b[\s\S]{0,120}controlRef=\{conciergeRef\}[\s\S]{0,80}onSnapshot=\{onReserveSnapshot\}/.test(sheet), "the existing concierge is mounted in thread mode, once");
  ok(sheet.indexOf("{reserveSeed && (") > -1 && sheet.indexOf("{reserveSeed && (") < sheet.indexOf("{open && ("), "the booking state stays mounted while the sheet is closed (sign in, back)");
  ok(/conciergeRef\.current\.send\(clean\)/.test(sheet) && /conciergeRef\.current\.choose\(pick\)/.test(sheet), "later turns and picked restaurants continue the same booking, no second request chain");
  ok(/<ReservePicks[\s\S]{0,140}onPick=\{pickRestaurant\}/.test(sheet), "picks stay in the thread (no separate Reserve sheet)");
  ok(/if \(reserveSnapRef\.current\.busy\) return;/.test(sheet), "no new turn while a booking request is in flight");
  ok(/resolveOrganizeTrip\(snap,/.test(sheet) && /role: "tripchoice"/.test(sheet) && /noSavedStops/.test(sheet), "organize finds the trip, asks when several, and answers empty honestly");
  ok(/data-wf-organize-apply="1"/.test(sheet) && /applyOrganize\(idx, true\)/.test(sheet), "the organized days are shown first and applied only by a tap");
  ok(/if \(prevAuth !== nextAuth && prevAuth !== null\) return true;/.test(sheet), "signing in to finish a booking keeps the thread; sign out still resets");

  const conc = strip(read("app/components/ReserveConcierge.js"));
  ok(/if \(thread\) return null;/.test(conc) && /onSnapshot\(\{ items, busy, who, renderCard \}\)/.test(conc), "in a thread the concierge draws into the chat, not a box of its own");
  ok(/if \(!thread\) push\(\{ role: "user", text \}\)/.test(conc), "the visitor's words appear once");
  ok((conc.match(/bookTable\(req\)/g) || []).length === 1 && /data-reserve-confirm="1"[^>]*onClick=\{\(\) => onConfirm\(Boolean\(sms && sms\.tail && textMe\)\)\}/.test(conc) && (conc.match(/onConfirm\(/g) || []).length === 1, "the only booking call is the Confirm tap's");
  ok(/delete keys\.current\[sig\]/.test(conc) && /keys\.current\[sig\] \|\| \(keys\.current\[sig\] = newIdempotencyKey\(\)\)/.test(conc), "one idempotency key per slot, reused on retry");

  const boo = strip(read("app/components/BooCompanion.js"));
  ok(/if \(santaNow\(\)\) \{[\s\S]{0,260}openWayfindPlanner\(/.test(boo), "every Santa door opens the one iMessage chat");
  ok(/onAsk=\{\(prompt, src\) => \{ openSheet\(src \|\| "dock-cta", prompt\); \}\}/.test(boo), "the dock's Ask/Plan button carries its prompt into the chat");
  ok(/if \(ch === "santa"\) \{ openSheet\("event", prompt\); return; \}/.test(boo), "Ask Santa on the Christmas page opens the same chat");

  const loader = strip(read("app/components/WayfindPlannerLoader.js"));
  ok(/offer\.kind === "unassigned_saves"[\s\S]{0,200}resolveOrganizeTrip\(readStoredTripsSnapshot\(\)/.test(loader) && /tripKey = pick\.kind === "one" \? pick\.key : "";/.test(loader) && /activeTripKey: tripKey,/.test(loader),
    "\"Organize these into days\" passes the real trip key");

  const plannerRoute = strip(read("app/api/planner/route.js"));
  ok(/const routed = classifySantaMessage\(message,/.test(plannerRoute), "the server uses the same reader");
  const persona = read("lib/plannerPersona.js");
  ok(/never say you cannot book/.test(persona), "the model is told tables are booked here by the reservation system, not by it");
}

if (fails.length) {
  for (const f of fails) console.error("test-santa-one-thread: FAIL: " + f);
  process.exit(1);
}
console.log(`test-santa-one-thread: OK, ${n} assertions (owner phrases + typos + negatives through the one reader; real /api/planner routes tables with 0 model calls; trip choice incl. forged key; one-thread wiring)`);
