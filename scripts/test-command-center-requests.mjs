// Execute the real request hook with controlled network completion order.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Isolate the hook's simulated React/network runtime from the guard process.
// All assertions below execute in the worker; any failure blocks this guard.
if (!process.argv.includes("--worker")) {
  const worker = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--worker"], { stdio: "inherit" });
  assert.equal(worker.error, undefined, "hook worker started");
  assert.equal(worker.status, 0, "hook worker completed every assertion");
  process.exit(0);
}

const source = readFileSync(new URL("../app/command-center/ui.js", import.meta.url), "utf8");
const start = source.indexOf("function usePanel(");
const end = source.indexOf("\nconst dget", start);
assert(start >= 0 && end > start, "real hook located");
let state;
const effects = [], pending = [], timers = [];
const context = vm.createContext({
  useState(value) { state = value; return [state, next => { state = typeof next === "function" ? next(state) : next; }]; },
  useRef(value) { return { current: value }; },
  useCallback(fn) { return fn; },
  useEffect(fn) { effects.push(fn); },
  authHeaders() { return {}; },
  AbortController, URLSearchParams, Date,
  setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
  setInterval() { return 1; }, clearInterval() {},
  fetch(url, options) { return new Promise((resolve, reject) => pending.push({ url, options, resolve, reject })); },
});
vm.runInContext(source.slice(start, end) + "\nthis.hook = usePanel;", context);
const panel = context.hook("traffic", { status: "ready" }, { key: "today" });
const cleanup = effects[0]();
assert.equal(pending.length, 1);
const refresh = panel.reload();
assert.equal(pending.length, 2);
assert.equal(pending[0].options.signal.aborted, true, "old request aborted");
pending[1].resolve({ ok: true, status: 200, json: async () => ({ marker: "new" }) });
await refresh;
assert.equal(state.data.marker, "new");
pending[0].resolve({ ok: true, status: 200, json: async () => ({ marker: "old" }) });
await new Promise(resolve => setImmediate(resolve));
assert.equal(state.data.marker, "new", "late response cannot overwrite current result");
const last = panel.reload();
cleanup();
assert.equal(pending[2].options.signal.aborted, true, "unmount cancels active request");
pending[2].resolve({ ok: true, status: 200, json: async () => ({ marker: "unmounted" }) });
await last;
assert.equal(state.data.marker, "new", "unmounted request cannot publish state");
const timeoutRun = panel.reload();
timers.at(-1)();
pending.at(-1).reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
await timeoutRun;
assert.equal(state.loading, false, "timeout settles loading");
assert.equal(state.error, "timeout", "timeout is visible");
const malformed = panel.reload();
pending.at(-1).resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError("invalid JSON"); } });
await malformed;
assert(state.error, "invalid response cannot look successful");
console.log("test-command-center-requests: OK — cancellation, stale response isolation, timeout, malformed response");
