// scripts/local-calendars/validate-lib.mjs — pure checks shared by validate.mjs
// and scripts/check-local-calendars-import.mjs.

/** Every queued series must be answered by a publish row or a hold entry with its lead_key. */
export function accountProblems(file, queue) {
  const out = [];
  const answered = new Set([...(file.publish || []).map((r) => r.lead_key), ...(file.hold || []).map((h) => h.lead_key)]);
  for (const l of queue.leads) if (!answered.has(l.key)) out.push(`series dropped (no publish row or hold names lead_key ${l.key})`);
  return out;
}
