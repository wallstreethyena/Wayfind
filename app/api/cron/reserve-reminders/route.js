import { timingSafeEqual } from "node:crypto";
import { reserveConfiguration, createReserveRepository } from "../../../../lib/reserveRepository.js";
import { runReserveReminders } from "../../../../lib/reserveReminders.js";
import { reserveEmailReady } from "../../../../lib/reserve.js";
import { recordPulse } from "../../../../lib/jobPulse.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(req) {
  const secret = String(process.env.CRON_SECRET || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(req.headers.get("authorization") || "");
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  // Reminders are email only. Without production email there is nothing to send: an expected idle state.
  if (!reserveEmailReady(process.env)) {
    try { await recordPulse("reserve-reminders", { attempted: 0, succeeded: 0, failed: 0, note: "email not ready" }); } catch { /* pulse is observability only */ }
    return json({ ok: true, skipped: "email_not_ready" });
  }
  try {
    const config = reserveConfiguration(process.env);
    const result = await runReserveReminders({ repository: createReserveRepository(config), env: process.env, config });
    try { await recordPulse("reserve-reminders", { attempted: result.claimed, succeeded: result.sent, failed: result.failed, note: null }); } catch { /* pulse is observability only */ }
    return json(result, result.failed ? 503 : 200);
  } catch (error) {
    try { await recordPulse("reserve-reminders", { attempted: 0, succeeded: 0, failed: 1, note: `error: ${String(error?.code || "RESERVE_UNAVAILABLE")}` }); } catch { /* pulse is observability only */ }
    return json({ ok: false, error: String(error?.code || "RESERVE_UNAVAILABLE") }, 503);
  }
}
