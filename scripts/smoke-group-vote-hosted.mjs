#!/usr/bin/env node
// scripts/smoke-group-vote-hosted.mjs: hosted Group Vote smoke test against the
// REAL production database, through the same service, repository and place-data
// code the API routes use. Not a prebuild guard (it needs production
// credentials); run it before enabling Group Vote and after any change to its
// schema or service. Every plan it creates is deleted by id in `finally`.
//
// Required env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   server credentials (never printed)
//   GV_SMOKE_OWNER_ID      an existing auth user id that owns the test plans
//   GV_SMOKE_PLACE_IDS     comma-separated candidate original place ids
//   GV_SMOKE_CONFIRM=production-test
//   WF_OWNER_USER_ID       optional, same as production, for displayed scores
//
// What it proves (by calling the real code, with positive and negative controls):
// private-link isolation, tampered and cross-plan links, participant and final
// link permission limits, command idempotency, concurrent votes without lost
// updates, vote changes, declines, missing replies, ties and no shared time,
// finalize acknowledgements, final read-only link, closed-plan behavior, the
// deadline sweep (what the 5-minute cron runs) and exactly-once notices.
import { randomUUID } from "node:crypto";
import { createGroupPlanService } from "../lib/groupPlanService.js";
import { createGroupPlanRepository } from "../lib/groupPlanRepository.js";
import { createGroupPlaceData } from "../lib/groupPlanPlaceData.js";

const env = process.env;
const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const OWNER = String(env.GV_SMOKE_OWNER_ID || "").trim();
const PLACES = String(env.GV_SMOKE_PLACE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
if (env.GV_SMOKE_CONFIRM !== "production-test" || !url || !key || !/^[0-9a-f-]{36}$/i.test(OWNER) || !PLACES.length) {
  console.error("smoke-group-vote-hosted: REFUSED. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GV_SMOKE_OWNER_ID, GV_SMOKE_PLACE_IDS and GV_SMOKE_CONFIRM=production-test.");
  process.exit(2);
}
const config = { url, key };
const repository = createGroupPlanRepository(config);
const placeData = createGroupPlaceData(config);
const service = createGroupPlanService({ repository, placeData });
const owner = { id: OWNER, hasVerifiedEmail: true };
const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
const rest = async (path, init = {}) => {
  const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};

let pass = 0, fail = 0;
const results = [];
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`); };
const rejects = async (name, fn, code) => {
  try { await fn(); check(name, false, `expected ${code}, resolved`); }
  catch (e) { check(name, !code || e.code === code, `got ${e.code || e.message}`); }
};
const iso = (ms) => new Date(ms).toISOString();
const HOUR = 3600000, DAY = 24 * HOUR;
const created = [];
const startedAt = new Date().toISOString();
const redactTokens = (s) => String(s).replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[token]");

async function pickPlace() {
  const now = Date.now();
  const probe = [{ id: "probe-t1", startsAt: iso(now + 3 * DAY), endsAt: iso(now + 3 * DAY + 2 * HOUR) }];
  let fallback = null;
  for (const id of PLACES) {
    try {
      const prepared = await placeData.prepare(id, probe, now);
      if (prepared.places.length > 1) return { id, alternatives: prepared.places.length - 1 };
      fallback ||= { id, alternatives: 0 };
    } catch { /* try the next candidate */ }
  }
  return fallback;
}

const mk = (placeId, invitees, deadlineMs, times) => ({
  createKey: randomUUID(), originalPlaceId: placeId, organizerName: "Group Vote smoke test",
  invitees: invitees.map((name) => ({ name })), times, timeZone: "America/New_York",
  deadline: iso(deadlineMs), emailConsent: false,
});

try {
  const chosen = await pickPlace();
  check("an original place hydrates for a plan", Boolean(chosen), chosen ? `alternatives=${chosen.alternatives}` : "none of GV_SMOKE_PLACE_IDS prepared");
  if (!chosen) throw new Error("no usable place");
  const now = Date.now();
  const timesA = [0, 1, 2].map((d) => ({ startsAt: iso(now + (3 + d) * DAY), endsAt: iso(now + (3 + d) * DAY + 2 * HOUR) }));

  // Plan A: three friends, everyone eventually replies.
  const inputA = mk(chosen.id, ["Smoke Alice", "Smoke Bob", "Smoke Cara"], now + 2 * HOUR, timesA);
  let a = await service.create(inputA, owner);
  created.push(a.id);
  check("organizer creates a plan (draft)", a.status === "draft" && a.role === "organizer");
  check("original place shows its real name", a.places[0]?.name && !/need a refresh/i.test(a.places[0].name), a.places[0]?.name);
  const again = await service.create(inputA, owner);
  check("create is idempotent for the same create key", again.id === a.id);
  check("one private link per friend", a.invites.length === 3 && new Set(a.invites.map((i) => i.token)).size === 3);
  await rejects("signed-out create is refused", () => service.create(mk(chosen.id, ["X"], now + HOUR, timesA), {}), "SIGN_IN_REQUIRED");

  a = await service.command(a.id, { id: randomUUID(), type: "start" }, { user: owner });
  check("organizer starts invitations (open)", a.status === "open");
  const [ALICE, BOB, CARA] = a.invitees.map((s) => s.id);
  const tok = Object.fromEntries(a.invites.map((i) => [i.slotId, i.token]));
  const [t1, t2, t3] = a.times.map((t) => t.id);
  const p1 = a.places[0].id, p2 = a.places[1]?.id || null;

  // Isolation.
  const aliceView = await service.read(a.id, { token: tok[ALICE] });
  const aliceJson = JSON.stringify(aliceView);
  check("Alice's link opens her ballot", aliceView.role === "participant" && aliceView.invitee?.id === ALICE);
  check("Alice cannot see Bob or Cara (names)", !/Smoke Bob|Smoke Cara/.test(aliceJson));
  check("Alice cannot see any private link", !Object.values(tok).some((t) => aliceJson.includes(t)));
  check("Alice cannot see the invite secret or owner id", !aliceJson.includes(OWNER) && !/invite_secret|inviteSecret/.test(aliceJson));
  const tampered = tok[ALICE].slice(0, -2) + (tok[ALICE].endsWith("aa") ? "bb" : "aa");
  await rejects("tampered link is refused", () => service.read(a.id, { token: tampered }), "PLAN_NOT_FOUND");
  await rejects("forged slot with Alice's signature is refused", () => service.read(a.id, { token: `${BOB}.${tok[ALICE].split(".")[1]}` }), "PLAN_NOT_FOUND");
  await rejects("Alice cannot vote as Bob", () => service.command(a.id, { id: randomUUID(), type: "respond", slotId: BOB, placeId: p1, availableTimeIds: [t1], declined: false }, { token: tok[ALICE] }), "ACTION_NOT_ALLOWED");
  await rejects("Alice cannot close the vote", () => service.command(a.id, { id: randomUUID(), type: "close" }, { token: tok[ALICE] }), "ACTION_NOT_ALLOWED");
  await rejects("a different signed-in user is not the organizer", () => service.read(a.id, { user: { id: randomUUID() } }), "PLAN_NOT_FOUND");

  // Idempotent vote and retry.
  const voteId = randomUUID();
  const vote = { id: voteId, type: "respond", slotId: ALICE, placeId: p1, availableTimeIds: [t1, t2], declined: false };
  const v1 = await service.command(a.id, vote, { token: tok[ALICE] });
  const revAfter = (await service.read(a.id, { user: owner })).revision;
  await service.command(a.id, vote, { token: tok[ALICE] });
  const revRetry = (await service.read(a.id, { user: owner })).revision;
  check("Alice's vote is saved", v1.invitee?.response?.placeId === p1);
  check("retrying the same vote does not change anything", revAfter === revRetry, `rev ${revAfter} -> ${revRetry}`);
  await rejects("reusing a vote id for a different vote is refused", () => service.command(a.id, { ...vote, availableTimeIds: [t3] }, { token: tok[ALICE] }));

  // Concurrent replies.
  const [rb, rc] = await Promise.allSettled([
    service.command(a.id, { id: randomUUID(), type: "respond", slotId: BOB, placeId: p1, availableTimeIds: [t2], declined: false }, { token: tok[BOB] }),
    service.command(a.id, { id: randomUUID(), type: "withdraw", slotId: CARA }, { token: tok[CARA] }).catch(() => null),
  ]);
  check("Bob's vote saved while another reply raced", rb.status === "fulfilled");
  let org = await service.read(a.id, { user: owner });
  const responded = () => org.invitees.filter((s) => s.response).length;
  check("no vote was lost in the race", org.invitees.find((s) => s.id === ALICE)?.response && org.invitees.find((s) => s.id === BOB)?.response);
  check("Cara is still a missing reply (not counted)", !org.invitees.find((s) => s.id === CARA)?.response && responded() === 2);

  // Bob changes his mind and declines; Alice changes her vote.
  await service.command(a.id, { id: randomUUID(), type: "respond", slotId: BOB, placeId: null, availableTimeIds: [], declined: true }, { token: tok[BOB] });
  const changed = await service.command(a.id, { id: randomUUID(), type: "respond", slotId: ALICE, placeId: p1, availableTimeIds: [t1], declined: false }, { token: tok[ALICE] });
  check("Alice can change her vote while open", changed.invitee?.response?.availableTimeIds?.join() === t1);
  org = await service.read(a.id, { user: owner });
  check("a decline is not counted as a place vote", (org.summary.placeResults.find((r) => r.placeId === p1)?.votes || 0) === 1);

  // Cara replies last: a different place (tie if an alternative exists) and a different time.
  const [cr1, cr2] = await Promise.allSettled([
    service.command(a.id, { id: randomUUID(), type: "respond", slotId: CARA, placeId: p2 || p1, availableTimeIds: [t2], declined: false }, { token: tok[CARA] }),
    service.read(a.id, { token: tok[ALICE] }),
  ]);
  check("Cara's reply saved while Alice was reading", cr1.status === "fulfilled" && cr2.status === "fulfilled");
  org = await service.read(a.id, { user: owner });
  check("voting closes once everyone replied", org.status === "closed");
  check("no time works for everyone is reported, not claimed", org.summary.commonTimeIds.length === 0 && org.summary.hasNoOverlap === true);
  if (p2) check("a tie is reported", org.summary.tie === true);
  await rejects("a vote after closing is refused", () => service.command(a.id, { id: randomUUID(), type: "respond", slotId: ALICE, placeId: p1, availableTimeIds: [t3], declined: false }, { token: tok[ALICE] }));

  // Finalize needs explicit acknowledgements.
  await rejects("finalize without acknowledgements is refused", () => service.command(a.id, { id: randomUUID(), type: "finalize", placeId: p1, timeId: t1 }, { user: owner }));
  const fin = { id: randomUUID(), type: "finalize", placeId: p1, timeId: t1, acknowledgeUnavailable: true, acknowledgeVenueHours: true };
  if (p2) fin.acknowledgeTie = true;
  const finalized = await service.command(a.id, fin, { user: owner });
  check("organizer finalizes with acknowledgements", finalized.status === "finalized" && finalized.finalPlan?.placeId === p1);
  const finalToken = finalized.finalToken;
  const fv = await service.read(a.id, { finalToken });
  const fvJson = JSON.stringify(fv);
  check("final link opens the read-only plan", fv.role === "final" && fv.finalPlan?.timeId === t1);
  check("final link shows no friend names or links", !/Smoke Alice|Smoke Bob|Smoke Cara/.test(fvJson) && !Object.values(tok).some((t) => fvJson.includes(t)));
  await rejects("final link cannot vote", () => service.command(a.id, { id: randomUUID(), type: "respond", slotId: ALICE, placeId: p1, availableTimeIds: [t1], declined: false }, { finalToken }), "ACTION_NOT_ALLOWED");
  check("final link reopens", (await service.read(a.id, { finalToken })).finalPlan?.placeId === p1);

  // Plan B: deadline closes without anyone opening the page.
  const nowB = Date.now();
  const timesB = [{ startsAt: iso(nowB + 2 * DAY), endsAt: iso(nowB + 2 * DAY + 2 * HOUR) }];
  let b = await service.create(mk(chosen.id, ["Smoke Dan", "Smoke Eve"], nowB + 70000, timesB), owner);
  created.push(b.id);
  b = await service.command(b.id, { id: randomUUID(), type: "start" }, { user: owner });
  const tokB = Object.fromEntries(b.invites.map((i) => [i.slotId, i.token]));
  const [DAN, EVE] = b.invitees.map((s) => s.id);
  await rejects("Plan A link cannot open Plan B", () => service.read(b.id, { token: tok[ALICE] }), "PLAN_NOT_FOUND");
  await rejects("Plan B link cannot open Plan A", () => service.read(a.id, { token: tokB[DAN] }), "PLAN_NOT_FOUND");
  await service.command(b.id, { id: randomUUID(), type: "respond", slotId: DAN, placeId: b.places[0].id, availableTimeIds: [b.times[0].id], declined: false }, { token: tokB[DAN] });
  const wait = Date.parse(b.deadline) - Date.now() + 5000;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const sweep1 = await service.sweepDeadlines();
  const sweep2 = await service.sweepDeadlines();
  check("deadline sweep closes the overdue plan", sweep1.closed >= 1 && sweep1.failed === 0, JSON.stringify(sweep1));
  check("a second sweep finds nothing left to close", sweep2.checked === 0, JSON.stringify(sweep2));
  const orgB = await service.read(b.id, { user: owner });
  check("Plan B is closed with Eve still missing", orgB.status === "closed" && !orgB.invitees.find((s) => s.id === EVE)?.response);
  await rejects("a vote after the deadline is refused", () => service.command(b.id, { id: randomUUID(), type: "respond", slotId: EVE, placeId: b.places[0].id, availableTimeIds: [b.times[0].id], declined: false }, { token: tokB[EVE] }));
  const notices = await rest(`wf_group_plan_notices?plan_id=in.(${created.join(",")})&select=plan_id,event_type`);
  const closedB = notices.body.filter((n) => n.plan_id === b.id && n.event_type === "voting_closed").length;
  const closedA = notices.body.filter((n) => n.plan_id === a.id && n.event_type === "voting_closed").length;
  check("exactly one voting-closed notice per plan", closedA === 1 && closedB === 1, `A=${closedA} B=${closedB}`);
} catch (e) {
  check("smoke run completed without an unexpected error", false, redactTokens(e?.code || e?.message || e));
} finally {
  if (created.length) {
    const del = await rest(`wf_group_plans?id=in.(${created.join(",")})`, { method: "DELETE", headers: { prefer: "return=representation" } });
    const left = await rest(`wf_group_plans?id=in.(${created.join(",")})&select=id`);
    const leftNotices = await rest(`wf_group_plan_notices?plan_id=in.(${created.join(",")})&select=id`);
    const limits = await rest(`wf_group_plan_limits?window_start=gte.${encodeURIComponent(startedAt)}`, { method: "DELETE", headers: { prefer: "return=representation" } });
    check("test plans deleted by id", del.status === 200 && Array.isArray(left.body) && left.body.length === 0, `deleted=${del.body?.length} remaining=${left.body?.length}`);
    check("their notices were removed with them", Array.isArray(leftNotices.body) && leftNotices.body.length === 0);
    results.push(`INFO created plan ids: ${created.join(", ")}; rate-limit rows removed: ${limits.body?.length ?? "?"}`);
  }
  for (const line of results) console.log(redactTokens(line));
  console.log(`smoke-group-vote-hosted: ${fail ? "FAIL" : "OK"} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
