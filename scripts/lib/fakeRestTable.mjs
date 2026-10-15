// scripts/lib/fakeRestTable.mjs — a tiny in-memory stand-in for the PostgREST
// wf_events endpoint, used only by tests. It implements the ONE behaviour the
// anchor fix path relies on: GET/PATCH with `col=eq.V` and `col=is.null`
// filters, where a PATCH touches only the rows that match EVERY filter and
// returns them (Prefer: return=representation), so a conditional PATCH on a
// changed row returns [] with HTTP 200, exactly like the real service.
// State lives in `state.rows` or, for child-process runs, in a JSON file.
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

export function makeFakeFetch({ rows = [], stateFile = null, beforePatch = null, log = [], logFile = null } = {}) {
  const load = () => (stateFile ? JSON.parse(readFileSync(stateFile, "utf8")) : rows);
  const save = (r) => { if (stateFile) writeFileSync(stateFile, JSON.stringify(r)); };
  const match = (row, params) => {
    for (const [k, v] of params) {
      if (k === "select" || k === "limit" || k === "order") continue;
      if (v === "is.null") { if (row[k] != null) return false; }
      else if (v.startsWith("eq.")) { if (row[k] == null || String(row[k]) !== v.slice(3)) return false; }
      else throw new Error(`fake REST: unsupported filter ${k}=${v}`);
    }
    return true;
  };
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = init.method || "GET";
    log.push({ method, url: String(url), body: init.body });
    if (logFile) appendFileSync(logFile, JSON.stringify({ method, url: String(url) }) + "\n");
    if (!u.pathname.endsWith("/rest/v1/wf_events")) return { ok: false, status: 404, json: async () => ({}) };
    const params = [...u.searchParams.entries()];
    if (method === "GET") {
      const cols = (u.searchParams.get("select") || "*").split(",");
      const out = load().filter((r) => match(r, params)).map((r) => (cols[0] === "*" ? r : Object.fromEntries(cols.map((c) => [c, r[c] ?? null]))));
      return { ok: true, status: 200, json: async () => out };
    }
    if (method === "PATCH") {
      if (beforePatch) beforePatch(load, save);
      const all = load();
      const hit = all.filter((r) => match(r, params));
      const patch = JSON.parse(init.body);
      for (const r of hit) Object.assign(r, patch);
      save(all);
      return { ok: true, status: 200, json: async () => hit.map((r) => ({ ...r })) };
    }
    return { ok: false, status: 405, json: async () => ({}) };
  };
  return fetchImpl;
}

/** Child-process preload: replaces globalThis.fetch with the fake bound to a state file. */
export function installFake(stateFile, logFile = null) {
  globalThis.fetch = makeFakeFetch({ stateFile, logFile });
}
