// lib/reserveReminders.js - the reminder sweep for "Reserve a table" (called by /api/cron/reserve-reminders).
// One reminder email about 3 hours before a booking, production + LIVE partners + email ready only.
// reminder_sent_at is claimed with one conditional UPDATE BEFORE the email goes out, so two overlapping
// runs can never both send. If the email then fails, it is not retried (never twice beats guaranteed once).
// No SMS: there is no paid provider.
import { reserveEmailAllowed, zonedToUtcMs, zonedToday, addDays } from "./reserve.js";
import { sendGuestEmail } from "./reserveEmail.js";

export const REMINDER_HOURS = 3;

/** True when a confirmed booking is inside its reminder window and was made before the window opened. */
export function reminderDue(row, nowMs) {
  const partner = row && row.wf_reserve_partners;
  if (!partner || partner.stage !== "live") return false;
  const at = zonedToUtcMs(row.reserve_date, String(row.reserve_time).slice(0, 5), partner.timezone || "America/New_York");
  if (!Number.isFinite(at)) return false;
  const remaining = at - nowMs;
  if (remaining <= 0 || remaining > REMINDER_HOURS * 3600000) return false;
  // Booked inside the window: the confirmation email is the reminder.
  const made = Date.parse(row.created_at);
  return Number.isFinite(made) ? made <= at - REMINDER_HOURS * 3600000 : false;
}

export async function runReserveReminders({ repository, env, now = Date.now(), config, fetchImpl = fetch, send = sendGuestEmail }) {
  const result = { ok: true, skipped: null, checked: 0, claimed: 0, sent: 0, failed: 0 };
  if (!repository) throw new TypeError("runReserveReminders needs a repository");
  const first = zonedToday(now, "America/New_York");
  const rows = await repository.listReminderCandidates(addDays(first, -1), addDays(first, 1));
  result.checked = rows.length;
  for (const row of rows) {
    const partner = row.wf_reserve_partners;
    if (!reminderDue(row, now) || !reserveEmailAllowed(partner, env)) continue;
    if (!(await repository.claimReminder(row.id, new Date(now).toISOString()))) continue;
    result.claimed++;
    let out;
    try {
      out = await send({ partner: { ...partner, place_id: row.place_id }, booking: { id: row.id, user_id: row.user_id, party_size: row.party_size, reserve_date: row.reserve_date, reserve_time: row.reserve_time, confirmation_code: row.confirmation_code }, kind: "reminder", config, env, fetchImpl });
    } catch { out = { sent: false }; }
    if (out && out.sent === true) result.sent++; else result.failed++;
  }
  return result;
}
