// Text a confirmed agent run through the same sender as a Wayfind booking.
// The durable claim is an event row (sms_intent) created BEFORE the provider call.
// The phone is not written on that row. "unknown" is never blindly resent: the sender's
// own reconcile path owns that, and a second claim does not send again.

import { sendBookingConfirmationSms } from "../reserveSms.js";

export async function notifyConfirmedRun({ store, run, profile, restaurantName, env = {}, fetchImpl, now }) {
  if (!run || run.status !== "confirmed" || run.sms_consent !== true || !run.confirmation_number) return { sent: false, reason: "not_confirmed" };
  if (!profile || !profile.mobile_phone) return { sent: false, reason: "no_phone" };
  const adapter = {
    async claimNotification() {
      return store.claimSms({ runId: run.id, recipient: profile.mobile_phone });
    },
    async markNotification(id, patch) {
      return store.markSms(id, patch);
    },
    async notificationByProviderId() {
      return null;
    },
    // The shared sender asks whether this booking already has a request text
    // (a request booking never also gets a confirmation text). An agent run is
    // never a request, so there is no such row; without this method the sender
    // treats the read as a storage failure and never texts.
    async notificationFor() {
      return null;
    },
  };
  return sendBookingConfirmationSms({
    repository: adapter,
    booking: {
      id: run.id,
      status: "confirmed",
      confirmation_code: run.confirmation_number,
      reserve_date: String(run.date).slice(0, 10),
      reserve_time: String(run.time).slice(0, 5),
      party_size: run.party,
    },
    partner: { stage: "live", name: restaurantName || "your restaurant", timezone: "America/New_York" },
    consent: { sms: true, phone: profile.mobile_phone },
    env,
    fetchImpl,
    now,
  });
}
