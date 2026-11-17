// Legal states for one booking-agent run. Terminal states never leave.
// handback:* and failed:* are families. Anything else not listed is illegal and throws.

export const HAND_REASONS = Object.freeze([
  "challenge", "login_required", "payment_required", "phone_verification",
  "slot_unavailable", "unrecognized_page", "timeout",
]);

const PROGRESS = new Set(["queued", "opening", "form_ready", "filling", "review", "submitting"]);
const NAMED = new Set(["confirmed", "unknown_after_submit", "cancelled_by_user", "refused_flag_off", "refused_kill_switch"]);

const NEXT = {
  queued: new Set(["opening", "cancelled_by_user", "refused_flag_off", "refused_kill_switch"]),
  opening: new Set(["form_ready", "cancelled_by_user"]),
  form_ready: new Set(["filling", "cancelled_by_user"]),
  filling: new Set(["review", "cancelled_by_user"]),
  review: new Set(["submitting", "cancelled_by_user", "refused_kill_switch"]),
  submitting: new Set(["confirmed", "unknown_after_submit"]),
};

function familyOk(from, to) {
  if (to.startsWith("handback:")) {
    return (from === "opening" || from === "form_ready" || from === "filling" || from === "review")
      && HAND_REASONS.includes(to.slice("handback:".length));
  }
  if (to.startsWith("failed:")) {
    return (from === "queued" || from === "opening" || from === "form_ready" || from === "filling" || from === "review")
      && /^[a-z0-9_]{1,40}$/.test(to.slice("failed:".length));
  }
  return false;
}

export function isTerminal(state) {
  return NAMED.has(state) || (typeof state === "string" && (state.startsWith("handback:") || state.startsWith("failed:")));
}

export function isProgress(state) {
  return PROGRESS.has(state);
}

/** Returns `to` or throws. Terminal states are final. */
export function assertTransition(from, to) {
  if (typeof from !== "string" || typeof to !== "string") throw new Error("illegal transition");
  if (isTerminal(from)) throw new Error(`terminal state ${from}`);
  if (NEXT[from] && NEXT[from].has(to)) return to;
  if (familyOk(from, to)) return to;
  throw new Error(`illegal transition ${from} -> ${to}`);
}

export function cancellable(state) {
  return state === "queued" || state === "opening" || state === "form_ready" || state === "filling" || state === "review";
}
