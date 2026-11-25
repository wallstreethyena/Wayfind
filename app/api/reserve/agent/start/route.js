import { after } from "next/server";
import { createBookingAgentHandlers } from "../../../../../lib/bookingAgent/http.js";
import { runBookingAgentOnce } from "../../../../../lib/bookingAgent/serverlessRun.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The run starts right after the reply, inside this same function (no separate worker).
export const maxDuration = 300;

export async function POST(req) {
  const res = await createBookingAgentHandlers().start(req);
  // 201 means a new run was queued. The every-minute cron is the backstop if this pass is cut short.
  if (res.status === 201) {
    after(async () => {
      try {
        const out = await runBookingAgentOnce();
        if (out.ran) console.log(JSON.stringify({ tag: "booking_agent_run", id: out.id || null, status: out.status || null, launched: Boolean(out.launched), via: "start" }));
      } catch (e) {
        console.error(JSON.stringify({ tag: "booking_agent_run", error: String((e && e.code) || "error").slice(0, 40), via: "start" }));
      }
    });
  }
  return res;
}
