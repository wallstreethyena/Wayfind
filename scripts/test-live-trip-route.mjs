// Wayfind Live Trips — server handlers end to end against an in-memory fake of
// Supabase Auth, PostgREST and the commit RPC (no network).
//
// Proves: sign-in required (anonymous sessions refused); only members read a
// trip; invite codes are capabilities (wrong code, rotated code and ended trips
// refused; codes never stored); owner-only admin; viewers cannot edit; ops are
// validated, stamped with the verified member id (a forged `by` is replaced),
// future clocks clamped; a lost compare-and-swap race is re-applied on the new
// state; replays are idempotent; batch and size limits hold; 304 on unchanged
// snapshots; the middleware matcher covers the routes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import * as S from "../lib/liveTripServer.js";
import { formatHlc, checksum, posBetween } from "../lib/liveTrip.js";
import { createFakeSupabase } from "./lib/liveTripFakeSupabase.mjs";

let count = 0;
const ok = (v, label) => { assert.ok(v, label); count += 1; };
const eq = (a, b, label) => { assert.deepEqual(a, b, label); count += 1; };

const cfg = { url: "https://proj.supabase.co", service: "service-key-xxxxxxxxxxxxxxxxxxxx", anon: "anon-key-xxxxxxxxxxxxxxxxxxxxxxxx" };
const fake = createFakeSupabase({ serviceKey: cfg.service, onCheck: (v, label) => ok(v, label) });
const { users, db } = fake;
const fakeFetch = fake.fetchImpl;
const OWNER = randomUUID(), FRIEND = randomUUID(), THIRD = randomUUID(), VIEWER = randomUUID();
users.set("tok-owner-xxxxxxxxxxxxxxxxx", { id: OWNER, email: "gabe.p@example.com", user_metadata: { full_name: "Gabriel Pereira" } });
users.set("tok-friend-xxxxxxxxxxxxxxxx", { id: FRIEND, email: "maria_l@example.com", user_metadata: {} });
users.set("tok-third-xxxxxxxxxxxxxxxxx", { id: THIRD, email: "third@example.com", user_metadata: { name: "<b>Sam</b>" } });
users.set("tok-viewer-xxxxxxxxxxxxxxxx", { id: VIEWER, email: "v@example.com", user_metadata: {} });
users.set("tok-anon-xxxxxxxxxxxxxxxxxx", { id: randomUUID(), is_anonymous: true });

const T = { owner: "tok-owner-xxxxxxxxxxxxxxxxx", friend: "tok-friend-xxxxxxxxxxxxxxxx", third: "tok-third-xxxxxxxxxxxxxxxxx", viewer: "tok-viewer-xxxxxxxxxxxxxxxx", anon: "tok-anon-xxxxxxxxxxxxxxxxxx" };
const base = { cfg, fetchImpl: fakeFetch, siteUrl: "https://www.gowayfind.com" };
const trip = { key: "miami_fl", city: "Miami", state: "FL", title: "Miami weekend", startDate: "2026-12-11", endDate: "2026-12-13",
  items: [{ id: "a", place: { id: "a", name: "Joe's Stone Crab" }, day: "2026-12-11", order: 0 }, { id: "b", place: { id: "b", name: "Wynwood Walls" }, order: 1 }] };

// ── env + auth ──
eq(S.liveTripEnv({}), null, "missing config → null (503)");
eq(S.liveTripEnv({ NEXT_PUBLIC_SUPABASE_URL: cfg.url, SUPABASE_SERVICE_ROLE_KEY: cfg.service, NEXT_PUBLIC_SUPABASE_ANON_KEY: cfg.anon, LIVE_TRIPS_OFF: "1" }), null, "kill switch turns the feature off");
eq((await S.handleCreate({ ...base, cfg: null, token: T.owner, body: { trip } })).status, 503, "no config answers 503");
eq((await S.handleCreate({ ...base, token: null, body: { trip } })).status, 401, "signed-out create refused");
eq((await S.handleCreate({ ...base, token: T.anon, body: { trip } })).status, 401, "anonymous session refused");

// ── create ──
const created = await S.handleCreate({ ...base, token: T.owner, body: { trip } });
eq(created.status, 201, "create answers 201");
const id = created.body.id;
ok(S.LIVE_TRIP_ID.test(id) && created.body.role === "owner" && created.body.revision === 0, "owner snapshot");
const invite = created.body.inviteUrl;
ok(invite.startsWith(`https://www.gowayfind.com/trips/${id}#j=`), "invite link puts the code in the fragment");
const code = invite.split("#j=")[1];
eq(created.body.members.map((m) => m.name), ["Gabriel"], "display name is the first name, no email");
ok(!JSON.stringify(created.body).includes("@example.com") && !JSON.stringify(created.body).includes("invite_secret"), "no email or secret leaves the server");
const again = await S.handleCreate({ ...base, token: T.owner, body: { trip } });
ok(again.body.id === id && db.trips.length === 1, "re-sharing the same personal trip returns the same live trip");

// ── access control ──
eq((await S.handleGet({ ...base, token: T.friend, id })).status, 403, "a non-member cannot read the trip");
eq((await S.handleGet({ ...base, token: T.friend, id: "not-a-uuid" })).status, 404, "bad id");
eq((await S.handlePreview({ ...base, id, code: "x".repeat(22) })).status, 404, "preview needs the right code");
const pv = await S.handlePreview({ ...base, id, code });
ok(pv.status === 200 && pv.body.title === "Miami weekend" && pv.body.stops === 2 && pv.body.ownerName === "Gabriel" && !("state" in pv.body), "preview shows only the headline");
eq((await S.handleJoin({ ...base, token: T.friend, id, code: code.slice(0, -1) + (code.endsWith("A") ? "B" : "A") })).status, 404, "a wrong code cannot join");
eq((await S.handleJoin({ ...base, token: null, id, code })).status, 401, "joining needs an account");
const joined = await S.handleJoin({ ...base, token: T.friend, id, code });
ok(joined.status === 200 && joined.body.role === "editor" && !joined.body.inviteUrl, "friend joins as editor and does not get the invite secret");
eq(joined.body.members.map((m) => m.name), ["Gabriel", "Maria"], "email-prefix name fallback");
ok(db.broadcasts.some((b) => b.event === "members" && b.private === true), "join announces the roster on the private channel");
const third = await S.handleJoin({ ...base, token: T.third, id, code });
eq(third.body.members.find((m) => m.id === THIRD).name, "Sam", "markup stripped from names");
ok(new Set(third.body.members.map((m) => m.color)).size === 3, "members get distinct colors");
db.members.push({ trip_id: id, user_id: VIEWER, role: "viewer", display_name: "V", color: "#000000", joined_at: new Date().toISOString() });

// ── snapshots ──
const snap = await S.handleGet({ ...base, token: T.friend, id });
ok(snap.status === 200 && snap.body.checksum === checksum(snap.body.state), "member snapshot with checksum");
eq((await S.handleGet({ ...base, token: T.friend, id, since: snap.body.revision })).status, 304, "unchanged since → 304");

// ── ops ──
const hlc = (ms, c = "dev1") => formatHlc(ms, 0, c);
const now = Date.now();
const opNote = { id: "op-note-000001", hlc: hlc(now), type: "set", itemId: "a", field: "note", value: "book 7pm", by: OWNER };
let r = await S.handleOps({ ...base, token: T.friend, id, body: { baseRevision: 0, ops: [opNote] } });
ok(r.status === 200 && r.body.revision === 1 && r.body.applied[0] === opNote.id, "editor op committed");
const bc = db.broadcasts.filter((b) => b.event === "ops").pop();
ok(bc.payload.ops[0].by === FRIEND, "server stamps the verified member id (a forged `by` is replaced)");
ok(bc.payload.checksum === r.body.checksum && bc.payload.revision === 1, "broadcast carries revision + checksum");
// Delivery does not depend on realtime.messages partitions: the saved ops also
// go out through the Realtime HTTP broadcast API, on the private topic.
const httpOps = db.broadcasts.filter((b) => b.event === "ops" && b.via === "http");
ok(httpOps.length === 1 && httpOps[0].topic === "live-trip:" + id && httpOps[0].private === true && httpOps[0].payload.revision === 1 && httpOps[0].payload.checksum === r.body.checksum, "a saved batch is also sent through the HTTP broadcast API with its revision and checksum");
ok(db.broadcasts.some((b) => b.event === "ops" && b.via === "db" && b.payload.revision === 1), "positive control: the in-transaction broadcast still fires too");
const commitsBefore = db.commits;
r = await S.handleOps({ ...base, token: T.friend, id, body: { baseRevision: 0, ops: [opNote] } });
ok(r.body.applied.includes(opNote.id) && db.commits === commitsBefore, "a retried op is acknowledged without a second commit");
ok(db.broadcasts.filter((b) => b.event === "ops" && b.via === "http").length === 1, "a retried op that commits nothing sends no second broadcast");
eq((await S.handleOps({ ...base, token: T.viewer, id, body: { ops: [{ ...opNote, id: "op-viewer-0001" }] } })).status, 403, "viewers cannot edit");
eq((await S.handleOps({ ...base, token: T.friend, id, body: { ops: [] } })).status, 400, "empty batch refused");
eq((await S.handleOps({ ...base, token: T.friend, id, body: { ops: Array.from({ length: 51 }, (_, i) => ({ ...opNote, id: "op-many-" + String(i).padStart(6, "0") })) } })).status, 400, "more than 50 ops refused");
r = await S.handleOps({ ...base, token: T.friend, id, body: { ops: [{ id: "op-bad-field-1", hlc: hlc(now), type: "set", itemId: "a", field: "place", value: {} }, { id: "op-gone-item-1", hlc: hlc(now), type: "remove", itemId: "zzz" }] } });
ok(r.status === 200 && r.body.rejected.length === 2 && r.body.applied.length === 0, "invalid and gone ops are rejected individually");

// future clock clamped
const future = { id: "op-future-0001", hlc: hlc(now + 86400000 * 365, "dev9"), type: "set", itemId: "b", field: "note", value: "from the future" };
r = await S.handleOps({ ...base, token: T.friend, id, body: { ops: [future] } });
const stamped = db.trips[0].state.items.b.ts.note;
ok(r.status === 200 && stamped.endsWith(":srv") && stamped < hlc(now + 300000), "a stamp far in the future is replaced by the server clock");

// lost race: re-applied on the newer state
db.raceOnce = true;
const raceOp = { id: "op-race-mine-1", hlc: hlc(now + 1000), type: "add", item: { id: "c", place: { id: "c", name: "Versailles" }, day: "2026-12-12", pos: posBetween(null, null) } };
const revBefore = db.trips[0].revision;
r = await S.handleOps({ ...base, token: T.third, id, body: { ops: [raceOp] } });
ok(r.status === 200 && r.body.revision === revBefore + 2, "after losing the compare-and-swap the batch is re-applied on top");
ok(db.trips[0].state.items.a.visited === true && db.trips[0].state.items.c, "both the other commit and ours survive");

// size limit
const huge = Array.from({ length: 50 }, (_, i) => ({ id: "op-huge-" + String(i).padStart(6, "0"), hlc: hlc(now + 2000 + i), type: "set", itemId: "a", field: "note", value: "x".repeat(500) }));
r = await S.handleOps({ ...base, token: T.friend, id, body: { ops: huge } });
ok(r.status === 200, "notes are capped, not refused");

// rate limit (240/min per member)
let limited = false;
for (let i = 0; i < 6 && !limited; i += 1) {
  const batch = Array.from({ length: 50 }, (_, j) => ({ id: `op-rl-${i}-${String(j).padStart(4, "0")}`, hlc: hlc(now + 5000 + i * 100 + j), type: "set", itemId: "b", field: "visited", value: j % 2 === 0 }));
  const x = await S.handleOps({ ...base, token: T.third, id, body: { ops: batch } });
  if (x.status === 429) limited = true;
}
ok(limited, "a member flooding edits is slowed down with 429");

// ── admin ──
eq((await S.handleAdmin({ ...base, token: T.friend, id, body: { action: "rotate_link" } })).status, 403, "only the owner rotates the link");
eq((await S.handleAdmin({ ...base, token: T.friend, id, body: { action: "remove_member", memberId: OWNER } })).status, 403, "an editor cannot remove people");
const rot = await S.handleAdmin({ ...base, token: T.owner, id, body: { action: "rotate_link" } });
const code2 = rot.body.inviteUrl.split("#j=")[1];
ok(code2 !== code, "a new link has a new code");
eq((await S.handlePreview({ ...base, id, code })).status, 404, "the old link stops working");
const rm = await S.handleAdmin({ ...base, token: T.owner, id, body: { action: "remove_member", memberId: THIRD } });
ok(!rm.body.members.some((m) => m.id === THIRD), "owner removes a member");
eq((await S.handleOps({ ...base, token: T.third, id, body: { ops: [{ ...opNote, id: "op-removed-0001" }] } })).status, 403, "a removed member can no longer edit");
eq((await S.handleAdmin({ ...base, token: T.owner, id, body: { action: "leave" } })).status, 400, "the owner cannot leave (must end)");
const list = await S.handleList({ ...base, token: T.friend });
ok(list.body.trips.length === 1 && list.body.trips[0].role === "editor" && list.body.trips[0].sourceKey === null, "members list their live trips; the owner's local key stays private");
eq((await S.handleList({ ...base, token: T.owner })).body.trips[0].sourceKey, "miami_fl", "the owner sees which personal trip it came from");
const end = await S.handleAdmin({ ...base, token: T.owner, id, body: { action: "end" } });
ok(end.body.ended && db.broadcasts.some((b) => b.event === "ended"), "ending broadcasts to members");
eq((await S.handleOps({ ...base, token: T.friend, id, body: { ops: [{ ...opNote, id: "op-after-end-01" }] } })).status, 410, "edits after the end answer 410");
eq((await S.handleJoin({ ...base, token: T.third, id, code: code2 })).status, 404, "an ended trip cannot be joined");
const lv = await S.handleAdmin({ ...base, token: T.friend, id, body: { action: "leave" } });
ok(lv.body.left, "a member can leave");

// ── capability helpers ──
const fakeRow = { id, invite_secret: "cd".repeat(32), invite_version: 3 };
ok(S.verifyInviteCode(fakeRow, S.inviteCode(fakeRow)) && !S.verifyInviteCode(fakeRow, S.inviteCode({ ...fakeRow, invite_version: 2 })), "codes are bound to the version");
ok(!S.verifyInviteCode(fakeRow, "short") && !S.verifyInviteCode({ ...fakeRow, invite_secret: "bad" }, "x".repeat(22)), "malformed codes and secrets fail closed");

// ── wiring ──
const mw = readFileSync(new URL("../middleware.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
ok(mw.includes('"/api/trips/live"') && mw.includes('"/api/trips/live/:path*"'), "middleware guards every live-trip route");
for (const f of ["app/api/trips/live/route.js", "app/api/trips/live/[id]/route.js", "app/api/trips/live/[id]/ops/route.js"]) {
  const src = readFileSync(new URL("../" + f, import.meta.url), "utf8");
  ok(/export const dynamic = "force-dynamic"/.test(src) && /no-store/.test(src) && /bearerFrom\(req\)/.test(src), f + " is dynamic, uncached, and passes the bearer token");
}
console.log(`test-live-trip-route: OK — ${count} assertions (${db.commits} commits, ${db.rest.length} PostgREST calls, all service role).`);
