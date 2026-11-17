// lib/reservePhone/twilioVoice.js - outbound Twilio Voice calls. No recording.
// Florida is a two party consent state, so Record is false and the TwiML has no Record noun.
// Status callbacks reuse the signature check in lib/reserveSms.js. The auth token is never logged.
import { twilioSignature, validTwilioSignature } from "../reserveSms.js";
import { DISCLOSURE } from "./script.js";

export const CALL_SID = /^CA[0-9a-f]{32}$/;
export { twilioSignature, validTwilioSignature };

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** ConversationRelay TwiML. welcomeGreeting starts with the disclosure sentence. No recording attributes. */
export function buildConversationRelayTwiml(script, relayUrl) {
  const greeting = xml((script && script.text) || DISCLOSURE);
  const url = xml(relayUrl);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><ConversationRelay url="${url}" welcomeGreeting="${greeting}"/></Connect></Response>`;
}

/**
 * Places one outbound call. `config` comes from resolvePhoneConfig / phoneDialSecrets.
 * Returns { ok, callId } or { ok:false, code }. Never throws. Never records.
 */
export function createTwilioVoiceAdapter({ config, fetchImpl = fetch } = {}) {
  return {
    id: "twilio_voice",
    async placeCall({ to, script }) {
      if (!config || !config.accountSid || !config.authToken || !config.from || !config.relayUrl) return { ok: false, code: "NOT_CONFIGURED" };
      const twiml = buildConversationRelayTwiml(script, config.relayUrl);
      if (twiml.includes("<Record") || /record=/i.test(twiml)) return { ok: false, code: "RECORDING_BLOCKED" };
      const form = new URLSearchParams();
      form.set("To", to);
      form.set("From", config.from);
      form.set("Twiml", twiml);
      form.set("Record", "false");
      form.set("StatusCallback", config.callbackUrl);
      form.set("StatusCallbackMethod", "POST");
      form.append("StatusCallbackEvent", "completed");
      form.append("StatusCallbackEvent", "busy");
      form.append("StatusCallbackEvent", "no-answer");
      form.append("StatusCallbackEvent", "failed");
      form.append("StatusCallbackEvent", "canceled");
      let res;
      try {
        res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`, {
          method: "POST",
          headers: {
            authorization: "Basic " + Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64"),
            "content-type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
          signal: AbortSignal.timeout(10000),
        });
      } catch { return { ok: false, code: "PROVIDER" }; }
      let json = null;
      try { json = await res.json(); } catch { json = null; }
      const sid = json && json.sid;
      if (!res.ok || !CALL_SID.test(String(sid || ""))) return { ok: false, code: "PROVIDER" };
      return { ok: true, callId: sid };
    },
  };
}
