// lib/atlasBudgetFileLedger.js — persistent SINGLE-MACHINE ledger for lib/atlasBudget.js.
//
// One JSON file. Every operation is: take an exclusive lock file (fs.openSync 'wx'),
// read + parse the JSON, mutate, write a temp file, fsync it, rename over the real
// file, fsync the directory, release the lock. State is reloaded from disk on every
// call, so a restarted process sees all earlier liability. Single machine only: a
// shared network filesystem does not give O_EXCL / rename atomicity guarantees.
//
// PERIOD KEY: the caller passes `period` (e.g. "pilot-2026-10" for a one-off pilot,
// or "2026-10" meaning the calendar month in America/New_York, as siteTime does).
// The ledger never computes a period itself. Ceiling is per (scope, period); an
// UNRESOLVED/reserved/dispatched row from ANY earlier period still counts and blocks.
// SETTLED spend only counts against the period it was booked in.
//
// Any read/parse error, lock timeout or write error THROWS: callers (Budget.reserve)
// treat that as a rejection (fail closed). A corrupt file is never treated as empty.
//
// Stale lock: a lock older than staleMs (default 30s, critical sections take ~ms) is
// broken by renaming it aside (only one contender's rename can win). Limitation: if a
// holder stalls longer than staleMs, two writers can overlap. Keep staleMs >> a write.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { KNOWN_PRICE_VERSIONS, LedgerStateError } from "./atlasBudget.js";

const ACTIVE = new Set(["reserved", "dispatched"]);
const LIABLE = new Set(["reserved", "dispatched", "unresolved"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bkey = (scope, period) => `${scope}|${period}`;

export class FileLedger {
  constructor({ file, staleMs = 30000, lockTimeoutMs = 20000 }) {
    if (!file) throw new Error("FileLedger: file required");
    this.file = path.resolve(file); this.lockFile = this.file + ".lock";
    this.staleMs = staleMs; this.lockTimeoutMs = lockTimeoutMs;
    this._chain = Promise.resolve(); // in-process FIFO so parallel awaits don't spin on the lock
  }

  async _acquire() {
    const token = crypto.randomBytes(8).toString("hex");
    const t0 = Date.now();
    for (;;) {
      try {
        const fd = fs.openSync(this.lockFile, "wx");
        fs.writeSync(fd, token); fs.closeSync(fd);
        return token;
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        try {
          const st = fs.statSync(this.lockFile);
          if (Date.now() - st.mtimeMs > this.staleMs) {
            try { fs.renameSync(this.lockFile, `${this.lockFile}.stale.${token}`); fs.unlinkSync(`${this.lockFile}.stale.${token}`); } catch { /* lost the race */ }
            continue;
          }
        } catch { continue; /* lock vanished */ }
        if (Date.now() - t0 > this.lockTimeoutMs) throw new Error("FileLedger: lock timeout (fail closed)");
        await sleep(2 + Math.floor(Math.random() * 8));
      }
    }
  }
  _release(token) {
    try { if (fs.readFileSync(this.lockFile, "utf8") === token) fs.unlinkSync(this.lockFile); } catch { /* already gone */ }
  }
  _load() {
    let raw;
    try { raw = fs.readFileSync(this.file, "utf8"); }
    catch (e) { if (e.code === "ENOENT") return { version: 1, budgets: {}, attempts: {} }; throw e; }
    const s = JSON.parse(raw); // throws on corruption: fail closed
    if (!s || s.version !== 1 || typeof s.budgets !== "object" || typeof s.attempts !== "object") throw new Error("FileLedger: unrecognised ledger file");
    return s;
  }
  _save(state) {
    const tmp = `${this.file}.tmp.${process.pid}.${crypto.randomBytes(4).toString("hex")}`;
    const fd = fs.openSync(tmp, "w");
    try { fs.writeSync(fd, JSON.stringify(state)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, this.file);
    try { const dfd = fs.openSync(path.dirname(this.file), "r"); try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); } } catch { /* dir fsync unsupported */ }
  }
  // fn(state) mutates state in place and returns the result; saved only if fn returns normally.
  _tx(fn) {
    const run = async () => {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const token = await this._acquire();
      try { const state = this._load(); const out = fn(state); this._save(state); return out; }
      finally { this._release(token); }
    };
    const p = this._chain.then(run, run);
    this._chain = p.catch(() => {});
    return p;
  }

  // ── operator actions ──
  // Creating a budget or LOWERING/keeping its ceiling is always allowed. RAISING an existing
  // ceiling needs the explicit operator option {allowRaise:true}; the pilot runner never passes it
  // by default. Returns { old, new }.
  setBudget(scope, period, ceilingMicroUsd, { allowRaise = false } = {}) {
    if (!Number.isInteger(ceilingMicroUsd) || ceilingMicroUsd < 0) throw new RangeError("ceiling must be a non-negative integer");
    return this._tx((s) => {
      const k = bkey(scope, period); const prev = s.budgets[k];
      if (prev && ceilingMicroUsd > prev.ceilingMicroUsd && !allowRaise) {
        throw new LedgerStateError(`refusing to RAISE ceiling ${prev.ceilingMicroUsd} -> ${ceilingMicroUsd} for ${scope}/${period} without {allowRaise:true}`);
      }
      s.budgets[k] = { scope, period, ceilingMicroUsd, halted: !!(prev && prev.halted) };
      return { old: prev ? prev.ceilingMicroUsd : null, new: ceilingMicroUsd };
    });
  }
  clearHalt(scope) { return this._tx((s) => { for (const b of Object.values(s.budgets)) if (b.scope === scope) b.halted = false; }); }
  // Operator reconciles an UNRESOLVED attempt against the real provider bill.
  reconcileAttempt(attemptKey, { settledMicroUsd, reason = "operator_reconcile" }) {
    return this._tx((s) => {
      const a = s.attempts[attemptKey];
      if (!a) throw new LedgerStateError(`unknown attempt ${attemptKey}`);
      if (a.state !== "unresolved") throw new LedgerStateError(`reconcile only from unresolved (is ${a.state})`);
      a.state = "settled"; a.settledMicroUsd = settledMicroUsd; a.reason = reason; a.updatedAt = Date.now();
    });
  }

  // ── lifecycle (each atomic) ──
  reserveAttempt({ attemptKey, scope, period, placeId, model, priceVersion, boundMicroUsd }) {
    return this._tx((s) => {
      if (!KNOWN_PRICE_VERSIONS.includes(priceVersion)) return { ok: false, reason: "unknown_price_version" };
      if (!Number.isInteger(boundMicroUsd) || boundMicroUsd < 0) return { ok: false, reason: "invalid_bound" };
      const b = s.budgets[bkey(scope, period)];
      if (!b) return { ok: false, reason: "no_budget" };
      if (Object.values(s.budgets).some((x) => x.scope === scope && x.halted)) return { ok: false, reason: "halted" };
      if (s.attempts[attemptKey]) return { ok: false, reason: "duplicate_attempt_key" };
      const rows = Object.values(s.attempts).filter((a) => a.scope === scope);
      if (rows.some((a) => a.placeId === placeId && ACTIVE.has(a.state))) return { ok: false, reason: "active_place" };
      let committed = 0;
      for (const a of rows) {
        if (a.state === "settled" && a.period === period) committed += a.settledMicroUsd;
        else if (LIABLE.has(a.state)) committed += a.reservedMicroUsd; // any period
      }
      if (committed + boundMicroUsd > b.ceilingMicroUsd) return { ok: false, reason: "over_ceiling", committed };
      const now = Date.now();
      s.attempts[attemptKey] = { attemptKey, scope, period, placeId, model, priceVersion, state: "reserved",
        reservedMicroUsd: boundMicroUsd, settledMicroUsd: null, usage: null, requestId: null, reason: null, createdAt: now, updatedAt: now };
      return { ok: true };
    });
  }
  _move(key, from, patch) {
    return this._tx((s) => {
      const a = s.attempts[key];
      if (!a) throw new LedgerStateError(`unknown attempt ${key}`);
      if (!from.includes(a.state)) throw new LedgerStateError(`illegal transition: ${a.state} -> ${patch.state} (allowed from ${from.join("|")})`);
      Object.assign(a, patch, { updatedAt: Date.now() });
      return { a, s };
    });
  }
  async dispatchAttempt(key) { await this._move(key, ["reserved"], { state: "dispatched" }); }
  async releaseAttempt(key) { await this._move(key, ["reserved"], { state: "released" }); } // never legal after dispatch
  async unresolveAttempt(key, reason) { await this._move(key, ["dispatched"], { state: "unresolved", reason }); }
  settleAttempt(key, { settledMicroUsd, usage, requestId }) {
    return this._tx((s) => {
      const a = s.attempts[key];
      if (!a) throw new LedgerStateError(`unknown attempt ${key}`);
      if (a.state !== "dispatched") throw new LedgerStateError(`illegal transition: ${a.state} -> settled (allowed from dispatched)`);
      if (!Number.isInteger(settledMicroUsd) || settledMicroUsd < 0) throw new LedgerStateError("settledMicroUsd must be a non-negative integer");
      a.state = "settled"; a.settledMicroUsd = settledMicroUsd; a.usage = usage || null; a.requestId = requestId || null; a.updatedAt = Date.now();
      const overrun = settledMicroUsd > a.reservedMicroUsd;
      if (overrun) { // recorded in full; halt every period of the scope until an operator clears it
        a.reason = `overrun: settled ${settledMicroUsd} > bound ${a.reservedMicroUsd}`;
        for (const b of Object.values(s.budgets)) if (b.scope === a.scope) b.halted = true;
        if (s.budgets[bkey(a.scope, a.period)] === undefined) s.budgets[bkey(a.scope, a.period)] = { scope: a.scope, period: a.period, ceilingMicroUsd: 0, halted: true };
      }
      return { overrun };
    });
  }
  async getAttempt(key) { return this._tx((s) => (s.attempts[key] ? { ...s.attempts[key] } : null)); }
  // read-only snapshot for tests / operators
  async totals(scope, period) {
    return this._tx((s) => {
      let settled = 0, liability = 0;
      for (const a of Object.values(s.attempts)) {
        if (a.scope !== scope) continue;
        if (a.state === "settled" && a.period === period) settled += a.settledMicroUsd;
        else if (LIABLE.has(a.state)) liability += a.reservedMicroUsd;
      }
      const b = s.budgets[bkey(scope, period)];
      return { settled, liability, ceiling: b ? b.ceilingMicroUsd : null, halted: Object.values(s.budgets).some((x) => x.scope === scope && x.halted) };
    });
  }
}
