// lib/interruptionBudget.js — one unsolicited interruption per visit.
//
// Owner rule (2026-11-25): at most ONE modal style interruption per session,
// across every surface. An interruption is anything that appears on its own
// and asks for attention over the page: the planner's proactive offer card, a
// promo sheet, a signup prompt. Things the visitor opens themselves never count.
//
// Every such surface asks canInterrupt() before it shows and calls
// claimInterruption() when it does. The budget lives in sessionStorage, so a
// new visit starts fresh, nothing personal is stored (a count and the kind that
// used it), and a storage failure fails CLOSED (no interruption) rather than
// letting a surface show again and again.
export const INTERRUPTION_KEY = "wf_interrupt_v1";
export const MAX_INTERRUPTIONS_PER_SESSION = 1;

function read(storage) {
  if (!storage || typeof storage.getItem !== "function") return null;
  try {
    const o = JSON.parse(storage.getItem(INTERRUPTION_KEY) || "null");
    return o && typeof o === "object" ? { n: Math.max(0, Number(o.n) || 0), kind: typeof o.kind === "string" ? o.kind.slice(0, 40) : "" } : { n: 0, kind: "" };
  } catch {
    return null;
  }
}

/** True while this session still has an interruption to spend. */
export function canInterrupt(storage) {
  const s = read(storage);
  return !!s && s.n < MAX_INTERRUPTIONS_PER_SESSION;
}

/** Spend the session's interruption. Returns false when none was left. */
export function claimInterruption(storage, kind) {
  const s = read(storage);
  if (!s || s.n >= MAX_INTERRUPTIONS_PER_SESSION) return false;
  try {
    storage.setItem(INTERRUPTION_KEY, JSON.stringify({ n: s.n + 1, kind: String(kind || "").slice(0, 40) }));
    return true;
  } catch {
    return false;
  }
}
