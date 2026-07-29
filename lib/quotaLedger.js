// lib/quotaLedger.js — SCRIPT-ONLY. A reservation ledger for metered Places SKUs.
//
// WHY THIS EXISTS (issue #444)
// census-build.mjs had a `--preflight` that made ONE searchText call and ONE
// searchNearby call and, on two 200s, reported "quota is available". Minutes
// later a 244-call sweep died on its first call with
// `429 Quota exceeded ... 'SearchNearbyRequest per day'`.
//
// The preflight was a LIVENESS check wearing a BUDGET check's name. "Can I make
// a call?" and "do I have 244 calls?" are different questions, and only the
// second one gates a sweep. A single 200 is consistent with exactly one call of
// headroom left, so the check could not fail in the way that mattered.
//
// This module answers the second question: a sweep RESERVES the budget it needs
// before spending anything, and is refused with numbers if it cannot have it.
//
// PER-SWEEP, NOT GLOBAL. Two lanes sharing one daily cap is how the 429
// happened: each lane independently observed "quota looks fine" because neither
// could see the other's planned spend. A reservation is visible to every sweep
// that reads this ledger, so the second lane is refused BEFORE it burns calls
// rather than discovering the first lane's spend by colliding with it.
//
// THE LEDGER IS SHARED STATE AND MUST BE A SHARED PATH. Worktrees do not share
// tmp/. WF_QUOTA_LEDGER overrides; the default is ~/.wayfind/quota-ledger.json
// so every worktree on the machine lands on the same file. If two lanes point at
// different ledgers this module silently stops working — that is exactly the
// failure it exists to prevent, so `ledgerPath()` is printed on every refusal.

import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

// Daily caps. Owner-set 2026-07-29. Env-overridable so a cap change does not
// need a code change, but the DEFAULT is the real configured value — a wrong
// default here silently permits overspend.
export const CAPS = {
  searchNearby: Number(process.env.WF_CAP_SEARCH_NEARBY || 1500),
  searchText: Number(process.env.WF_CAP_SEARCH_TEXT || 6000),
};

// A reservation older than this is treated as abandoned. Without expiry a
// crashed sweep holds budget until midnight and every later sweep is refused
// for a run that is not happening.
export const RESERVATION_TTL_MS = 2 * 60 * 60 * 1000; // 2h

export function ledgerPath() {
  return process.env.WF_QUOTA_LEDGER || join(homedir(), ".wayfind", "quota-ledger.json");
}

// Google Cloud daily quotas reset at midnight PACIFIC, not UTC.
//
// This choice is deliberate and it fails SAFE. If our day boundary rolls over
// LATER than Google's we keep counting spend Google has already forgiven — we
// refuse too early, which costs a wait. If it rolls over EARLIER we zero our
// counter while Google's is still full — we permit overspend and 429 again.
// UTC midnight is 5pm Pacific, i.e. earlier, i.e. the unsafe direction. Pacific
// is therefore the conservative choice even if the exact reset hour is off.
export function dayKey(now = Date.now()) {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function emptyDay() { return { spent: { searchNearby: 0, searchText: 0 }, reservations: {} }; }

// Integrity. The ledger is the only record of what we have spent, so a file we
// cannot trust must not be readable as "nothing spent yet".
function sumOf(payload) { return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32); }

export function read(now = Date.now()) {
  const day = dayKey(now);
  const p = ledgerPath();

  // ABSENT is not CORRUPT, and conflating them is the whole point of this block.
  // No file = legitimate first run of the day = full headroom. A file that
  // exists but cannot be trusted = we have LOST TRACK of spend, and that is the
  // one state where an unmetered sweep is most dangerous. Fail CLOSED there.
  if (!existsSync(p)) return { ...emptyDay(), day, corrupt: false };

  let all = null, why = null;
  try { all = JSON.parse(readFileSync(p, "utf8")); }
  catch (e) { why = "unparseable JSON (" + String(e.message).slice(0, 60) + ")"; }
  if (all && typeof all !== "object") { all = null; why = "top-level value is not an object"; }

  if (all && !why) {
    const stored = all.__sum;
    const body = { ...all }; delete body.__sum;
    if (stored == null) why = "no integrity checksum — written by an older version, or hand-edited";
    else if (stored !== sumOf(body)) why = "checksum MISMATCH — the file was modified outside this module";
  }
  if (why) {
    // spent/reservations are deliberately left at zero: nothing downstream should
    // be able to use them. `corrupt` is what the gate reads.
    return { ...emptyDay(), day, corrupt: true, corruptReason: why, path: p };
  }
  const rec = all[day] && all[day].spent ? all[day] : emptyDay();
  // Drop expired reservations on read so a crashed sweep cannot hold budget.
  const live = {};
  for (const [id, r] of Object.entries(rec.reservations || {})) {
    if (r && typeof r.at === "number" && now - r.at < RESERVATION_TTL_MS) live[id] = r;
  }
  return { day, spent: { ...emptyDay().spent, ...rec.spent }, reservations: live, corrupt: false };
}

function write(rec, now = Date.now()) {
  const p = ledgerPath();
  mkdirSync(dirname(p), { recursive: true });
  // Keep only today — the ledger is a daily budget, not an audit log.
  const payload = { [rec.day]: { spent: rec.spent, reservations: rec.reservations } };
  const body = JSON.stringify({ ...payload, __sum: sumOf(payload) }, null, 1);
  // Write-then-rename so a crash mid-write cannot leave a truncated ledger that
  // parses as {} and silently resets the day's spend to zero.
  const tmpP = p + ".tmp";
  writeFileSync(tmpP, body);
  renameSync(tmpP, p);
}

/** Calls already spent + calls currently reserved by any sweep, per SKU. */
export function committed(rec) {
  const out = { searchNearby: rec.spent.searchNearby, searchText: rec.spent.searchText };
  for (const r of Object.values(rec.reservations)) {
    for (const sku of Object.keys(out)) out[sku] += Number((r.calls && r.calls[sku]) || 0);
  }
  return out;
}

/** Remaining headroom per SKU after spend AND outstanding reservations. */
export function remaining(rec = read()) {
  const c = committed(rec);
  return { searchNearby: Math.max(0, CAPS.searchNearby - c.searchNearby), searchText: Math.max(0, CAPS.searchText - c.searchText) };
}

/**
 * Reserve budget for one sweep. Returns { ok:true, id } or a refusal carrying
 * the numbers — never a bare boolean.
 * @param {{label:string, calls:{searchNearby?:number, searchText?:number}}} req
 */
export function reserve(req, now = Date.now()) {
  const calls = { searchNearby: Number(req.calls?.searchNearby || 0), searchText: Number(req.calls?.searchText || 0) };
  if (calls.searchNearby <= 0 && calls.searchText <= 0) {
    return { ok: false, reason: "a reservation for zero calls is not a reservation — state the planned call count", ledger: ledgerPath() };
  }
  const rec = read(now);
  // FAIL CLOSED on a ledger we cannot trust. A refused sweep costs a wait; a day
  // we did not meter costs money. The message must make it obvious this is "fix
  // the ledger", NOT "out of quota" — those need opposite responses and an
  // operator who reads them as the same thing will sit and wait for a reset that
  // will not help.
  if (rec.corrupt) {
    return {
      ok: false,
      reason: "LEDGER CORRUPT — refusing to sweep. This is NOT a quota problem and waiting for the reset will NOT fix it.",
      corrupt: true,
      detail: [
        `ledger ${rec.path} is unusable: ${rec.corruptReason}`,
        `spend for today cannot be determined, so no reservation can be granted safely`,
        `FIX: inspect the file. If today's spend is genuinely unknown, delete it to start a fresh day` +
          ` (this forgives any spend already made today and risks overspend), or repair it and re-run.`,
      ],
      needed: calls, available: null, caps: CAPS, day: rec.day, ledger: rec.path,
    };
  }
  const avail = remaining(rec);
  const short = Object.keys(calls).filter((sku) => calls[sku] > avail[sku]);
  if (short.length) {
    return {
      ok: false,
      reason: "insufficient daily quota",
      // The refusal a human can act on. "Quota exceeded" tells the next person
      // nothing; needed-vs-available tells them whether to wait an hour or a day.
      detail: short.map((sku) => `${sku}: needed ${calls[sku]}, ${avail[sku]} remaining (cap ${CAPS[sku]}, spent ${rec.spent[sku]}, reserved by others ${committed(rec)[sku] - rec.spent[sku]})`),
      needed: calls, available: avail, caps: CAPS, spent: rec.spent,
      outstanding: Object.entries(rec.reservations).map(([id, r]) => ({ id, label: r.label, calls: r.calls, ageMin: Math.round((now - r.at) / 60000) })),
      day: rec.day, ledger: ledgerPath(),
    };
  }
  // Reservation id must be deterministic-ish but unique per sweep. No
  // Math.random/Date.now in workflow scripts elsewhere, but this is a CLI tool
  // and a collision would silently merge two lanes' budgets, so uniqueness wins.
  const id = `${rec.day}-${String(req.label || "sweep").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}-${process.pid}-${now.toString(36)}`;
  rec.reservations[id] = { label: req.label || "sweep", calls, at: now };
  write(rec, now);
  return { ok: true, id, reserved: calls, available: remaining(rec), day: rec.day, ledger: ledgerPath() };
}

/**
 * Convert a reservation into actual spend and free the remainder. Call this even
 * on failure — a sweep that 429s partway still SPENT what it made.
 */
export function settle(id, actual, now = Date.now()) {
  const rec = read(now);
  const held = rec.reservations[id];
  delete rec.reservations[id];
  const a = { searchNearby: Number(actual?.searchNearby || 0), searchText: Number(actual?.searchText || 0) };
  for (const sku of Object.keys(rec.spent)) rec.spent[sku] += a[sku];
  write(rec, now);
  return { settled: a, released: held ? { searchNearby: held.calls.searchNearby - a.searchNearby, searchText: held.calls.searchText - a.searchText } : null, remaining: remaining(rec) };
}

/** Give a reservation back unused (e.g. --preflight exiting before the sweep). */
export function release(id, now = Date.now()) {
  const rec = read(now);
  const had = !!rec.reservations[id];
  delete rec.reservations[id];
  write(rec, now);
  return { released: had, remaining: remaining(rec) };
}

/** Human-readable status, for a refusal message or a status flag. */
export function describe(rec = read()) {
  if (rec.corrupt) {
    return [
      `*** LEDGER CORRUPT — ${rec.corruptReason}`,
      `*** path ${rec.path}`,
      `*** every reservation is REFUSED until this is fixed. This is not a quota shortage.`,
    ].join("\n");
  }
  const c = committed(rec), rem = remaining(rec);
  return [
    `day ${rec.day} (Pacific)  ledger ${ledgerPath()}`,
    ...Object.keys(CAPS).map((sku) => `  ${sku.padEnd(13)} cap ${String(CAPS[sku]).padStart(5)}  spent ${String(rec.spent[sku]).padStart(5)}  reserved ${String(c[sku] - rec.spent[sku]).padStart(5)}  remaining ${String(rem[sku]).padStart(5)}`),
    `  outstanding reservations: ${Object.keys(rec.reservations).length || "none"}`,
  ].join("\n");
}
