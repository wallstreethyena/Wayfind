import { resolveOverride } from "./envAudit.js";

export const FEEDBACK_TEAM_EMAIL = "info@gowayfind.com";

// Secondary notification only: the protected inbox is the durable record.
// Production-only delivery prevents local/preview exercises emailing the team.
export async function notifyFeedback(row, submissionId, {
  env = process.env, fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  report = (reason) => console.error("[feedback-notification] " + reason),
  sender = () => resolveOverride("WF_ALERT_FROM").value,
} = {}) {
  if (env.VERCEL_ENV !== "production") return { sent: false, reason: "preview" };
  const key = String(env.RESEND_API_KEY || "").trim();
  if (!key) { report("RESEND_API_KEY missing; read saved notes in Command Center"); return { sent: false, reason: "unconfigured" }; }
  let from;
  try { from = sender(); } catch { report("sender configuration invalid; read saved notes in Command Center"); return { sent: false, reason: "unconfigured" }; }
  const recommendation = String(row.message || "").startsWith("Place recommendation:");
  const payload = {
    from, to: [FEEDBACK_TEAM_EMAIL],
    subject: recommendation ? "Wayfind: new place recommendation" : "Wayfind: new feedback",
    text: ["New note in the Wayfind team inbox.", "", String(row.message || ""), "",
      row.place ? "Place: " + row.place : "", row.path ? "Page: " + row.path : "",
      row.loc_name ? "City: " + row.loc_name : "", row.sentiment ? "Reaction: " + row.sentiment : "",
      "", "Review: https://www.gowayfind.com/command-center#feedback"].filter((v) => v !== "").join("\n\n"),
  };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      let response;
      try {
        response = await fetchImpl("https://api.resend.com/emails", {
          method: "POST", cache: "no-store", signal: AbortSignal.timeout(4000),
          headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "Idempotency-Key": "feedback/" + submissionId },
          body: JSON.stringify(payload),
        });
      } catch { /* A bounded retry uses the same idempotency key. */ }
      if (response?.ok) return { sent: true };
      if (response && response.status !== 429 && response.status < 500) break;
      if (attempt === 0) await sleep(500);
    }
    report("email failed; note remains saved in Command Center");
    return { sent: false, reason: "send_failed" };
  } catch {
    report("notification failed; note remains saved in Command Center");
    return { sent: false, reason: "send_failed" };
  }
}
