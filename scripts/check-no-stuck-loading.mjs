// scripts/check-no-stuck-loading.mjs — no surface may sit on a loading
// skeleton forever.
//
// THE INCIDENT (owner, 2026-08-12, screenshot of "What Should We Do Today?"
// expanded over an empty grey box): the rail was not slow, it was STUCK —
// permanently, silently, with no way back. Two components had the identical
// defect and it had been shipping in both:
//
//     setRows((r) => { if (r[id]) return r; return { ...r, [id]: "loading" }; });
//     (async () => { const data = await load(id); setRows(...); })();   // no catch
//
//   * load(id) rejects -> the rejection is unhandled -> rows[id] stays "loading"
//   * the claim guard `if (r[id]) return r` now blocks EVERY retry: the
//     IntersectionObserver, the 2.5s backstop, and re-opening the section all
//     call ensureLoaded, and all of them no-op. The idempotence that exists to
//     stop double-fetching is what makes the stuck state permanent.
//   * "loading" renders a height-reserved skeleton, which is indistinguishable
//     from a slow network — so it never got reported as a bug, it got reported
//     as "the site is slow".
//
// A promise that never settles produces the same screen, so a catch alone is
// not enough; there has to be a timeout too.
//
// THIS GUARD EXECUTES lib/loadState.js RATHER THAN GREPPING FOR ITS SHAPE.
// A regex asserting "there is a .catch() nearby" would pass on a catch that
// swallows and returns undefined, which strands the slot just as thoroughly.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const p = (rel) => fileURLToPath(new URL(rel, root));

let pass = 0;
const fail = (m) => { console.error("check-no-stuck-loading: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const { settleLoad, canClaim, isPending, isFailed, LOAD_PENDING, LOAD_FAILED, LOAD_TIMEOUT_MS } =
  await import(new URL("../lib/loadState.js", import.meta.url));

// ─── 1. settleLoad ALWAYS SETTLES. Executed, not inspected. ─────────────────
{
  const good = await settleLoad(() => Promise.resolve([1, 2, 3]));
  ok(good.ok === true && Array.isArray(good.data) && good.data.length === 3, "settleLoad must pass a resolved value straight through");

  const rejected = await settleLoad(() => Promise.reject(new Error("boom")));
  ok(rejected.ok === false && rejected.reason === "error", "a REJECTED thunk must settle as {ok:false} — this is the exact case that stranded the rail");

  const thrown = await settleLoad(() => { throw new Error("sync boom"); });
  ok(thrown.ok === false && thrown.reason === "error", "a thunk that throws SYNCHRONOUSLY must settle too — it never returns a promise to attach a handler to");

  const nully = await settleLoad(() => Promise.resolve(null));
  ok(nully.ok === true && nully.data === null, "a resolved null is a RESULT, not a failure — the caller decides what null means");

  // The one a catch cannot save you from.
  const hung = await settleLoad(() => new Promise(() => {}), { timeoutMs: 40 });
  ok(hung.ok === false && hung.reason === "timeout",
    "a promise that NEVER SETTLES must time out. A .catch() does nothing here, and the reader sees the identical grey box — which is why settleLoad arms its timer before running the work.");

  ok(LOAD_TIMEOUT_MS > 3000 && LOAD_TIMEOUT_MS <= 30000, `the default timeout is ${LOAD_TIMEOUT_MS}ms — under ~3s it will fire on a slow but working connection, over ~30s the reader has already left`);
}

// ─── 2. A FAILED SLOT IS RE-CLAIMABLE. A PENDING ONE IS NOT. ────────────────
ok(canClaim(undefined) === true && canClaim(null) === true, "an empty slot must be claimable");
ok(canClaim(LOAD_FAILED) === true, "a FAILED slot must be re-claimable, or the retry control is decorative");
ok(canClaim(LOAD_PENDING) === false, "a PENDING slot must NOT be re-claimable — that is the double-fetch guard and it stays");
ok(canClaim([]) === false && canClaim([1]) === false, "a slot already holding data must not be re-fetched");
ok(isPending(LOAD_PENDING) && !isPending(LOAD_FAILED) && isFailed(LOAD_FAILED) && !isFailed(LOAD_PENDING), "the two sentinels must stay distinguishable");
ok(LOAD_PENDING !== LOAD_FAILED, "the pending and failed sentinels must not be the same value");

// ─── 3. EVERY SURFACE THAT CLAIMS A SLOT ROUTES THROUGH IT ──────────────────
// These are the components that own a lazily-loaded, height-reserved section.
// A new one must be added here — that is deliberate: the cost of joining this
// list is one line, and the cost of not joining it is a permanent grey box.
const OWNERS = ["app/components/BestNearby.js", "app/components/TodaysBest.js"];
for (const rel of OWNERS) {
  const src = readFileSync(p(rel), "utf8");

  ok(/from "(\.\.\/)+lib\/loadState\.js"/.test(src),
    `${rel} claims a loading slot but does not import lib/loadState.js. Every pending state must be written by something that guarantees it gets overwritten.`);

  // The literal sentinel may not be re-introduced alongside the constant — two
  // spellings of the same state is how one of them stops being handled.
  const literalPending = (src.match(/\[id\]:\s*"loading"/g) || []).length;
  ok(literalPending === 0, `${rel} writes the literal "loading" into a slot. Use LOAD_PENDING so the sentinel has exactly one spelling.`);

  ok(/settleLoad\s*\(/.test(src), `${rel} must run its load through settleLoad — a bare \`await\` in an async IIFE is the defect this guard exists for`);
  ok(/canClaim\s*\(/.test(src), `${rel} must gate its claim on canClaim, or a failed section can never be retried`);
  ok(/\[id\]:\s*LOAD_FAILED/.test(src), `${rel} never writes LOAD_FAILED — there is no terminal state, so a failure still reads as "still loading"`);
  ok(/isFailed\s*\(/.test(src), `${rel} never RENDERS the failed state. Writing LOAD_FAILED and then showing the skeleton for it is the same bug with extra steps.`);

  // The async IIFE that does the work must not carry a bare top-level await of
  // the loader any more.
  ok(!/\(async \(\) => \{\s*\n\s*const data = await load\(id\);/.test(src),
    `${rel} still awaits load(id) directly inside an un-caught async IIFE`);
}

// ─── 4. THE RETRY IS REACHABLE ──────────────────────────────────────────────
const bn = readFileSync(p("app/components/BestNearby.js"), "utf8");
ok(/ensureLoaded\(sdef\.id\)/.test(bn) && /delete nx\[sdef\.id\]/.test(bn),
  "the failed-rail control must clear the slot AND call ensureLoaded — clearing alone leaves it blank, calling alone no-ops because the slot is still claimed");

// ─── 5. THE OTHER TWO LOADERS ALREADY TERMINATE, AND MUST KEEP DOING SO ─────
// IntentRail wraps its IIFE in try/catch; ExplodingNearby attaches .catch and
// writes a terminal status. Neither routes through settleLoad (they own
// different shapes), so assert the property directly.
for (const [rel, needle, why] of [
  ["app/components/IntentRail.js", /\(async \(\) => \{\s*\n\s*try \{/, "its async IIFE must open with try {"],
  ["app/components/ExplodingNearby.js", /\.catch\(\(\) => \{[^}]*setResult\(/, "its fetch chain must .catch() into a terminal setResult"],
]) {
  ok(needle.test(readFileSync(p(rel), "utf8")), `${rel}: ${why} — otherwise it strands its own loading state exactly like BestNearby did`);
}

console.log(`check-no-stuck-loading: OK — ${pass} assertions (settleLoad EXECUTED against rejecting, throwing, null-resolving and never-settling work; ${OWNERS.length} section owners route through it; failed slots are retryable and rendered)`);
