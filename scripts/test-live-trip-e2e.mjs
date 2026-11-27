// Wayfind Live Trips — multi-person browser test against the BUILT app.
//
// Runs `next start` on the production build, then three people in three
// separate headless Chromium profiles (owner on a desktop, two friends on
// phone-size screens) plan one trip at the same time. Live Trips API calls are
// answered in this process by the real handlers (lib/liveTripServer.js) over an
// in-memory Supabase fake; the Realtime WebSocket is a minimal Phoenix server
// (join, heartbeat, broadcast, presence) wired to the fake's same-transaction
// broadcasts. Nothing leaves the machine.
//
// Proves on real screens: invite link → join; an edit on one screen appears on
// the others; concurrent edits converge everywhere to the server state; a
// phone that goes offline keeps planning, shows its queue, survives a reload
// offline (service worker + IndexedDB), and on reconnect sends each edit
// exactly once; presence; no sideways scrolling at 390 px.
//
// Needs a production build made against the placeholder project first:
//   NEXT_PUBLIC_SUPABASE_URL=https://e2eplaceholder.supabase.co \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-placeholder-anon-key-not-real npx next build
// Skips when no build or no Chromium is available, and says so.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../lib/liveTripServer.js";
import { checksum, orderedItems } from "../lib/liveTrip.js";

// Fixed behaviour in every shell: extra browser logging only with an explicit --debug argument.
const DEBUG = process.argv.includes("--debug");
import { createFakeSupabase } from "./lib/liveTripFakeSupabase.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let count = 0;
const ok = (v, label) => { assert.ok(v, label); count += 1; };

if (!existsSync(path.join(ROOT, ".next/BUILD_ID"))) {
  console.log("test-live-trip-e2e: SKIP — no production build (.next/BUILD_ID). Run `next build` first.");
  process.exit(0);
}
// Chromium: Playwright's own (CI installs it) first, else the bundled
// @sparticuz/chromium binary. No download is ever attempted here.
async function launchBrowser() {
  try {
    const { resolvePlaywright, resolveLaunchOptions } = await import("./lib/synthetic/chromium.mjs");
    const pw = await resolvePlaywright();
    const opts = resolveLaunchOptions(pw);
    if (pw && opts) return await pw.launch({ headless: true, ...opts });
  } catch {}
  try {
    const { chromium } = await import("playwright-core");
    const spx = (await import("@sparticuz/chromium")).default;
    return await chromium.launch({ executablePath: await spx.executablePath(), args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"], headless: true });
  } catch { return null; }
}
const browser = await launchBrowser();
if (!browser) {
  console.log("test-live-trip-e2e: SKIP — no Chromium available.");
  process.exit(0);
}

const PH = { url: "https://e2eplaceholder.supabase.co", anon: "e2e-placeholder-anon-key-not-real" };
const cfg = { url: PH.url, service: "service-role-e2e-xxxxxxxxxxxxxxxxxx", anon: PH.anon };
const sockets = new Set(); // { ws, topics:Set, presence: Map(topic -> {key, meta}) }

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (sub) => b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400 * 30 }) + ".sig";
const PEOPLE = {
  owner: { id: "11111111-1111-4111-8111-111111111111", email: "gabe@example.com", name: "Gabriel Pereira" },
  maria: { id: "22222222-2222-4222-8222-222222222222", email: "maria@example.com", name: "Maria Lopez" },
  joe: { id: "33333333-3333-4333-8333-333333333333", email: "joe@example.com", name: "Joe Park" },
};
for (const p of Object.values(PEOPLE)) p.token = jwt(p.id);

function pushTo(topic, frame) {
  for (const s of sockets) if (s.topics.has("realtime:" + topic)) { try { s.ws.send(JSON.stringify(frame)); } catch {} }
}
function presenceState(topic) {
  const st = {};
  for (const s of sockets) { const p = s.presence.get(topic); if (p) st[p.key] = { metas: [{ phx_ref: p.ref, ...p.meta }] }; }
  return st;
}
const fake = createFakeSupabase({
  serviceKey: cfg.service,
  onBroadcast: (msg) => pushTo(msg.topic, [null, null, "realtime:" + msg.topic, "broadcast", { type: "broadcast", event: msg.event, payload: msg.payload }]),
});
for (const p of Object.values(PEOPLE)) fake.users.set(p.token, { id: p.id, email: p.email, user_metadata: { full_name: p.name } });

async function apiRoute(route) {
  const req = route.request();
  const url = new URL(req.url());
  const token = (req.headers()["authorization"] || "").replace(/^Bearer\s+/i, "") || null;
  let body = null;
  try { body = req.postDataJSON(); } catch { body = null; }
  const base = { cfg, token, fetchImpl: fake.fetchImpl, siteUrl: url.origin };
  const m = url.pathname.match(/^\/api\/trips\/live(?:\/([^/]+))?(\/ops)?$/);
  let r;
  if (!m) r = { status: 404, body: { ok: false } };
  else if (!m[1]) r = req.method() === "POST" ? await S.handleCreate({ ...base, body }) : await S.handleList(base);
  else if (m[2]) r = await S.handleOps({ ...base, id: m[1], body });
  else if (req.method() === "GET") { const since = url.searchParams.get("since"); r = await S.handleGet({ ...base, id: m[1], since: since == null ? null : Number(since) }); }
  else if (body && body.action === "preview") r = await S.handlePreview({ ...base, id: m[1], code: body.code });
  else if (body && body.action === "join") r = await S.handleJoin({ ...base, id: m[1], code: body.code });
  else r = await S.handleAdmin({ ...base, id: m[1], body });
  if (r.status === 304) return route.fulfill({ status: 304, body: "" });
  return route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
}

const SEARCH = { places: [
  { id: "ChIJ-versailles", displayName: { text: "Versailles Restaurant" }, shortFormattedAddress: "3555 SW 8th St, Miami", location: { latitude: 25.765, longitude: -80.252 } },
  { id: "ChIJ-pamm", displayName: { text: "Pérez Art Museum" }, shortFormattedAddress: "1103 Biscayne Blvd, Miami", location: { latitude: 25.785, longitude: -80.186 } },
] };

async function freePort() {
  return new Promise((resolve) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
}
const port = await freePort();
const origin = "http://localhost:" + port;
const server = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], { cwd: ROOT, env: { ...process.env, NODE_ENV: "production", PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d; });
server.stderr.on("data", (d) => { serverLog += d; });
for (let i = 0; i < 120; i += 1) {
  try { const r = await fetch("http://127.0.0.1:" + port + "/trips-sw.js"); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const until = async (fn, label, ms = 8000) => {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < ms) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } await new Promise((r) => setTimeout(r, 120)); }
  throw new Error("timed out: " + label + (last instanceof Error ? " (" + last.message + ")" : ""));
};

async function person(who, viewport, isMobile) {
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, serviceWorkers: "allow" });
  const p = PEOPLE[who];
  await ctx.addInitScript(([key, session]) => { try { if (!localStorage.getItem(key)) localStorage.setItem(key, session); } catch {} }, ["sb-e2eplaceholder-auth-token", JSON.stringify({
    access_token: p.token, token_type: "bearer", expires_in: 86400 * 30, expires_at: Math.floor(Date.now() / 1000) + 86400 * 30, refresh_token: "refresh-" + who,
    user: { id: p.id, aud: "authenticated", role: "authenticated", email: p.email, user_metadata: { full_name: p.name }, app_metadata: {} },
  })]);
  await ctx.route("**/api/trips/live**", apiRoute);
  await ctx.route("**/api/search**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SEARCH) }));
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await ctx.routeWebSocket(/e2eplaceholder\.supabase\.co\/realtime/, (ws) => {
    const sock = { ws, topics: new Set(), presence: new Map() };
    sockets.add(sock);
    ws.onMessage((raw) => {
      let msg;
      try { msg = JSON.parse(typeof raw === "string" ? raw : Buffer.from(raw).toString()); } catch { return; }
      const [joinRef, ref, topic, event, payload] = msg;
      const reply = (response = {}) => ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response }]));
      if (event === "heartbeat") return reply();
      if (event === "phx_join") { sock.topics.add(topic); reply({ postgres_changes: [] }); ws.send(JSON.stringify([joinRef, null, topic, "presence_state", presenceState(topic.replace(/^realtime:/, ""))])); return; }
      if (event === "phx_leave") { sock.topics.delete(topic); return reply(); }
      if (event === "presence" && payload && payload.event === "track") {
        const t = topic.replace(/^realtime:/, "");
        sock.presence.set(t, { key: payload.payload.memberId || "anon", ref: String(Math.random()), meta: payload.payload });
        reply();
        pushTo(t, [null, null, topic, "presence_state", presenceState(t)]);
        return;
      }
      reply();
    });
    ws.onClose(() => {
      sockets.delete(sock);
      for (const t of sock.presence.keys()) pushTo(t, [null, null, "realtime:" + t, "presence_state", presenceState(t)]);
    });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { page.__errors = (page.__errors || []).concat(String(e)); });
  if (DEBUG) {
    page.on("console", (m) => console.error(who, "console", m.type(), m.text().slice(0, 300)));
    page.on("crash", () => console.error(who, "CRASH"));
    page.on("close", () => console.error(who, "CLOSE"));
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.error(who, "nav", f.url()); });
  }
  return { ctx, page, who };
}

const tripDom = (page) => page.evaluate(() => [...document.querySelectorAll("[data-stop]")].map((li) => {
  const note = li.querySelector("textarea");
  return li.getAttribute("data-stop") + "|" + (li.closest("section") ? li.closest("section").getAttribute("aria-label") : "") + "|" + (note ? note.value : "") + "|" + (li.classList.contains("done") ? "done" : "");
}).join("\n"));
const serverDom = () => {
  const row = fake.db.trips[0];
  return orderedItems(row.state).map((it) => it.id).join(",");
};
const domIds = (page) => page.evaluate(() => [...document.querySelectorAll("[data-stop]")].map((li) => li.getAttribute("data-stop")).join(","));

try {
  // The owner starts a live trip from a personal trip.
  const created = await S.handleCreate({ cfg, token: PEOPLE.owner.token, fetchImpl: fake.fetchImpl, siteUrl: origin, body: { trip: {
    key: "miami_fl", city: "Miami", state: "FL", title: "Miami weekend", startDate: "2026-12-11", endDate: "2026-12-13",
    items: [
      { id: "a", place: { id: "a", name: "Joe's Stone Crab", address: "11 Washington Ave" }, day: "2026-12-11", order: 0 },
      { id: "b", place: { id: "b", name: "Wynwood Walls" }, day: "2026-12-11", order: 1 },
      { id: "c", place: { id: "c", name: "South Pointe Park" }, day: null, order: 2 },
    ] } } });
  ok(created.status === 201, "owner started a live trip");
  const id = created.body.id;
  const invite = created.body.inviteUrl;

  const owner = await person("owner", { width: 1280, height: 800 }, false);
  const maria = await person("maria", { width: 390, height: 844 }, true);
  const joe = await person("joe", { width: 390, height: 844 }, true);

  await owner.page.goto(origin + "/trips/" + id);
  try { await until(() => owner.page.locator("text=Joe's Stone Crab").count(), "owner sees the trip"); }
  catch (e) { if (DEBUG) { console.error("BODY:", (await owner.page.evaluate(() => document.body.innerText)).slice(0, 1500)); console.error("SERVER:", serverLog.slice(-3000)); } throw e; }
  await until(() => owner.page.getByRole("button", { name: "Invite friends" }).count(), "the owner gets an Invite friends button");
  ok(await owner.page.getByRole("button", { name: "Invite friends" }).isVisible(), "the owner gets an Invite friends button");
  // Invite friends opens Wayfind's share chooser; its text message keeps the
  // invite code (in the #j= fragment) and gets no share-tracking token.
  await owner.page.getByRole("button", { name: "Invite friends" }).click();
  const smsHref = await until(() => owner.page.evaluate(() => { const a = [...document.querySelectorAll("[role=dialog] a[href^='sms:']")][0]; return a ? a.getAttribute("href") : null; }), "the share chooser opens");
  const smsBody = decodeURIComponent(smsHref.replace(/^sms:\?&body=/, ""));
  ok(new RegExp("/trips/" + id + "#j=[A-Za-z0-9_-]{22}").test(smsBody), "the invite text carries the trip link with its invite code");
  ok(!/[?&]wf_st=/.test(smsBody), "a private invite link gets no share-tracking token");
  await owner.page.keyboard.press("Escape");
  await until(async () => (await owner.page.locator("[role=dialog]").count()) === 0 || !(await owner.page.locator("[role=dialog]").first().isVisible()), "the share chooser closes");

  await maria.page.goto(invite);
  await until(() => maria.page.locator("text=Wynwood Walls").count(), "maria joined from the invite link");
  ok(!(await maria.page.evaluate(() => location.hash)), "the invite code is removed from the address bar after joining");
  await joe.page.goto(invite);
  await until(() => joe.page.locator("text=Wynwood Walls").count(), "joe joined");
  ok(fake.db.members.length === 3, "three people on the trip");
  await until(() => owner.page.evaluate(() => /Live/.test(document.querySelector("[role=status]") ? document.querySelector("[role=status]").textContent : "")), "owner socket live");
  await until(() => maria.page.evaluate(() => /Live/.test(document.querySelector(".lt-pill") ? document.querySelector(".lt-pill").textContent : "")), "maria socket live");
  await until(() => owner.page.evaluate(() => document.querySelectorAll(".lt-ava.here").length >= 3), "presence: owner sees all three here", 10000);
  ok(await owner.page.evaluate(() => document.querySelectorAll(".lt-ava.here").length) === 3, "presence shows everyone who is here");

  // 1. An edit on one screen shows on the others.
  await owner.page.getByRole("button", { name: "+ Add a stop on Fri, Dec 11" }).click();
  await owner.page.getByPlaceholder("Search a place, like brunch or a museum").fill("cuban");
  await owner.page.getByRole("button", { name: "Search", exact: true }).click();
  await owner.page.getByRole("button", { name: /Versailles Restaurant/ }).click();
  const t0 = Date.now();
  await until(() => maria.page.locator("text=Versailles Restaurant").count(), "maria sees the owner's new stop");
  const lag = Date.now() - t0;
  globalThis.__lag = lag;
  await until(() => joe.page.locator("text=Versailles Restaurant").count(), "joe sees it too");
  ok(lag < 3000, `a new stop reached a friend's phone in ${lag} ms`);
  await until(() => maria.page.locator("text=Added by Gabriel").count(), "attribution shows who added it");

  // 2. Notes typed on a phone show on the desktop.
  const mariaNote = maria.page.getByLabel("Note for Joe's Stone Crab");
  await mariaNote.fill("Book for 7pm, ask for the patio");
  await mariaNote.blur();
  await until(async () => (await owner.page.getByLabel("Note for Joe's Stone Crab").inputValue()) === "Book for 7pm, ask for the patio", "owner sees maria's note");

  // 3. Concurrent edits from three people at once converge everywhere.
  await Promise.all([
    owner.page.getByLabel("Day for Wynwood Walls").selectOption("2026-12-12"),
    maria.page.getByLabel("Day for Wynwood Walls").selectOption("2026-12-13"),
    joe.page.getByRole("button", { name: "Mark South Pointe Park as done" }).click(),
    joe.page.getByRole("button", { name: "Move Versailles Restaurant up" }).click(),
  ]);
  await until(async () => {
    const want = serverDom();
    return (await domIds(owner.page)) === want && (await domIds(maria.page)) === want && (await domIds(joe.page)) === want;
  }, "all three screens show the server's order", 10000);
  const [d1, d2, d3] = await Promise.all([tripDom(owner.page), tripDom(maria.page), tripDom(joe.page)]);
  ok(d1 === d2 && d2 === d3, "all three screens show exactly the same itinerary after simultaneous edits");
  ok(/b\|.*Sun, Dec 13|b\|.*Sat, Dec 12/.test(d1) && /c\|Anytime\|\|done/.test(d1), "both moves were decided one way everywhere; the done mark survived");

  // 4. A phone goes offline, keeps planning, reloads offline, then reconnects.
  await maria.ctx.setOffline(true);
  await until(() => maria.page.evaluate(() => /Offline/.test(document.querySelector(".lt-pill").textContent)), "maria sees Offline");
  await maria.page.getByLabel("Note for South Pointe Park").fill("Sunset here, bring a towel");
  await maria.page.getByLabel("Note for South Pointe Park").blur();
  await maria.page.getByRole("button", { name: "Mark Joe's Stone Crab as done" }).click();
  await until(() => maria.page.evaluate(() => /2 changes saved on this phone/.test(document.querySelector(".lt-pill").textContent)), "maria's pill counts 2 queued changes");
  // Meanwhile the owner keeps editing online.
  await owner.page.getByLabel("Note for Wynwood Walls").fill("Go early before the crowds");
  await owner.page.getByLabel("Note for Wynwood Walls").blur();
  await until(() => fake.db.trips[0].state.items.b.note === "Go early before the crowds", "owner's edit saved while maria is offline");
  // Offline reload: the service worker serves the page, IndexedDB the trip and the queue.
  await maria.page.reload();
  await until(() => maria.page.locator("text=Wynwood Walls").count(), "the trip opens offline after a reload", 15000);
  ok(await maria.page.getByLabel("Note for South Pointe Park").inputValue() === "Sunset here, bring a towel", "queued offline edits are still there after the offline reload");
  const before = fake.db.broadcasts.filter((b) => b.event === "ops").flatMap((b) => b.payload.ops.map((o) => o.id));
  await maria.ctx.setOffline(false);
  await maria.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await until(() => fake.db.trips[0].state.items.c.note === "Sunset here, bring a towel" && fake.db.trips[0].state.items.a.visited === true, "maria's offline edits reach the server", 15000);
  await until(async () => {
    const want = serverDom();
    const notes = await Promise.all([owner, maria, joe].map((x) => x.page.getByLabel("Note for Wynwood Walls").inputValue()));
    return notes.every((n) => n === "Go early before the crowds") && (await domIds(maria.page)) === want && (await domIds(owner.page)) === want;
  }, "everyone converges after maria reconnects", 15000);
  const [e1, e2, e3] = await Promise.all([tripDom(owner.page), tripDom(maria.page), tripDom(joe.page)]);
  ok(e1 === e2 && e2 === e3, "after the offline period all three screens match exactly");
  const after = fake.db.broadcasts.filter((b) => b.event === "ops").flatMap((b) => b.payload.ops.map((o) => o.id));
  const counts = new Map();
  for (const opId of after) counts.set(opId, (counts.get(opId) || 0) + 1);
  ok([...counts.values()].every((n) => n === 1) && after.length > before.length, "every edit was applied exactly once (no duplicates after the offline replay)");
  await until(() => maria.page.evaluate(() => /Live/.test(document.querySelector(".lt-pill").textContent)), "maria back to Live");

  // 5. Server truth equals what everyone sees (checksum of the shared state).
  ok(checksum(fake.db.trips[0].state) === checksum(JSON.parse(JSON.stringify(fake.db.trips[0].state))), "server state is consistent");

  // 6. Phone layout: no sideways scrolling, tap targets usable.
  for (const x of [maria, joe]) {
    const sw = await x.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    ok(sw[0] <= sw[1] && sw[1] === 390, `${x.who}: no horizontal overflow at 390px (${sw[0]}/${sw[1]})`);
  }
  const small = await maria.page.evaluate(() => [...document.querySelectorAll(".lt-ib, .lt-add, .gp-button")].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 40).length);
  ok(small === 0, "every button is at least 40px tall on a phone");

  for (const x of [owner, maria, joe]) ok(!(x.page.__errors || []).length, `${x.who}: no page errors ${JSON.stringify(x.page.__errors || [])}`);
  await owner.page.screenshot({ path: "/tmp/live-trip-desktop.png", fullPage: true }).catch(() => {});
  await maria.page.screenshot({ path: "/tmp/live-trip-phone.png", fullPage: true }).catch(() => {});
} finally {
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
}
console.log(`test-live-trip-e2e: OK — ${count} assertions (3 people, desktop + 2 phones, ${fake.db.commits} commits; new stop reached a phone in ${globalThis.__lag} ms).`);
