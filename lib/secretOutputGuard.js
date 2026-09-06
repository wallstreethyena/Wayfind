// lib/secretOutputGuard.js — a runtime backstop against printing a credential.
//
// WHY THIS EXISTS. scripts/live-viator-smoke.mjs hits LIVE production and
// extracts the real Viator pid out of a Location header to judge its shape.
// The absolute rule (owner directive) is that value must never be printed,
// logged, echoed or persisted — booleans and shapes only. A review of the
// script's source is one way to believe that; this is the other, stronger
// one (CLAUDE.md: "assert on the CALL, not the string" / "where the thing
// can be executed, execute it and assert the RESULT"). wrapConsole() makes
// the property SELF-ENFORCING at runtime: every console.log/console.error
// call in the wrapped process is inspected before it reaches the terminal,
// and a call whose text contains a registered secret throws instead of
// printing. A mistake at any future call site — not just the ones reviewed
// today — is caught the moment it would leak, not caught later by re-reading
// the script.
//
// Pure / dependency-free so it is trivially unit-testable
// (scripts/test-secret-output-guard.mjs) without touching a real console.

/**
 * Does `text` contain any of `secrets` (non-empty strings only — an empty
 * secret would match everything and defeat the point)?
 */
export function containsSecret(text, secrets) {
  const s = String(text == null ? "" : text);
  for (const raw of secrets || []) {
    const secret = String(raw == null ? "" : raw);
    if (secret.length > 0 && s.includes(secret)) return true;
  }
  return false;
}

/**
 * Wrap a console-shaped object (or plain functions) so that any call whose
 * stringified arguments contain a registered secret THROWS instead of
 * printing. Returns { log, error, restore }. `restore()` puts the original
 * functions back — callers should always restore in a `finally`.
 *
 * secrets is a mutable array reference: callers register a value the moment
 * they learn it (`secrets.push(pid)`), so the guard is live for the rest of
 * the script even though the value was not known when wrapConsole() was
 * called.
 */
export function wrapConsole(target, secrets) {
  const origLog = target.log.bind(target);
  const origError = target.error.bind(target);
  const guard = (orig) => (...args) => {
    const joined = args.map((a) => (typeof a === "string" ? a : safeStringify(a))).join(" ");
    if (containsSecret(joined, secrets)) {
      throw new Error(
        "secretOutputGuard: REFUSING TO PRINT — this output would contain a registered secret value. " +
        "Print a boolean or a shape, never the value."
      );
    }
    orig(...args);
  };
  target.log = guard(origLog);
  target.error = guard(origError);
  return {
    log: target.log,
    error: target.error,
    restore: () => { target.log = origLog; target.error = origError; },
  };
}

function safeStringify(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}
