// scripts/lib/mergeTrain.mjs — the merge train's decision, as a pure function.
//
// WHY (2026-11-13). main requires every pull request to be up to date with main
// and green on "guards" and "owner-approval". guards takes about 15 minutes and
// lanes merge into main every 15 to 20 minutes, so every lane that kept its own
// pull request current raced every other lane: each update restarted the checks,
// and a Mac script had to babysit the race. GitHub's merge queue would solve it,
// but GitHub offers it only to organization repositories, and Wayfind is a
// personal-account repository.
//
// So the train does what a merge queue does, from main, on GitHub's runners:
// exactly ONE pull request at a time (the "car") is brought up to date and
// tested against current main; the rest wait. When the car merges (auto-merge),
// main moves and the train brings the next one up. Nothing races, because
// nothing else updates queued pull requests.
//
// Who is in the queue: open, non-draft pull requests into main from this
// repository with auto-merge turned on. Order: oldest pull request first.
//
// Pure: the caller (scripts/merge-train.mjs) reads GitHub and acts.

export const REQUIRED_CHECKS = Object.freeze(["guards", "owner-approval"]);
const FAILED = new Set(["failure", "timed_out", "action_required", "startup_failure", "stale"]);

/**
 * checks: { [name]: { status, conclusion } | undefined } — latest run per name on
 * the pull request's CURRENT head.
 */
export function checkState(check) {
  if (!check) return "missing";
  if (check.status !== "completed") return "running";
  if (check.conclusion === "success" || check.conclusion === "neutral" || check.conclusion === "skipped") return "passed";
  if (check.conclusion === "cancelled") return "missing"; // superseded run: run it again
  if (FAILED.has(check.conclusion)) return "failed";
  return "missing";
}

/**
 * cars: [{ number, behindBy, mergeable, checks }] in queue order.
 * Returns one action:
 *   { type: "wait", number, need: [...] }   the car is current; make sure its checks run
 *   { type: "update", number, skipped }      bring this pull request up to date
 *   { type: "idle", skipped }                nothing to do
 * `need` lists required checks the car still lacks on its head ("guards" to
 * dispatch, "owner-approval" to evaluate); a running check is not needed again.
 * A pull request whose current head failed a required check leaves the queue
 * until its author pushes (a failed car never blocks the cars behind it).
 */
export function planTrain(cars) {
  const skipped = [];
  const list = Array.isArray(cars) ? cars : [];
  for (const car of list) {
    if (car.behindBy !== 0) continue;
    const states = Object.fromEntries(REQUIRED_CHECKS.map((n) => [n, checkState(car.checks && car.checks[n])]));
    if (states.guards === "failed") { skipped.push({ number: car.number, why: "guards failed on its current head" }); continue; }
    if (states["owner-approval"] === "failed" && states.guards !== "missing") {
      // Owner approval missing for this head: the train re-checks it each pass
      // (an approval comment can arrive any time) but does not hold the line for it.
      skipped.push({ number: car.number, why: "waiting for owner approval", recheck: true });
      continue;
    }
    const need = REQUIRED_CHECKS.filter((n) => states[n] === "missing" || (n === "owner-approval" && states[n] === "failed"));
    return { type: "wait", number: car.number, need, skipped };
  }
  for (const car of list) {
    if (!(car.behindBy > 0)) continue;
    if (car.mergeable === false) { skipped.push({ number: car.number, why: "has a merge conflict with main" }); continue; }
    if (checkState(car.checks && car.checks.guards) === "failed") {
      skipped.push({ number: car.number, why: "guards failed on its current head" });
      continue;
    }
    return { type: "update", number: car.number, skipped };
  }
  return { type: "idle", skipped };
}
