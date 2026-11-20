// lib/reservePhone/voice.js - the conversational seam.
//
// Twilio ConversationRelay is the voice provider. Wayfind already uses Twilio for booking texts, so the
// call, the status callback, and the signature check stay on one account. The words are this file plus
// lib/reservePhone/script.js, which the tests lock. ElevenLabs Conversational AI would add a second
// account, a second secret, and a prompt hosted outside the repo, so the disclosure line could not be
// proven from source. Relay speaks our script. We do not record audio (Florida is a two party consent
// state) and we do not keep the transcript: only the structured outcome and a short summary leave this file.
import { HOLD_LIMIT_SECONDS } from "./policy.js";
import { DISCLOSURE, scrubSummary, timeInGuestWindow } from "./script.js";

const PAYMENT = /\b(card|credit card|debit|cvv|cvc|deposit|prepay|prepaid|hold on a card|card number)\b/i;
const VOICEMAIL = /\b(voicemail|voice mail|leave a message|after the tone|not available to take)\b/i;
const IVR = /\b(press\s+\d|press one|press two|main menu|for reservations press|extension)\b/i;
const HUMAN = /\b(are you (a )?(real )?person|are you human|is this a recording|speak to a (real )?person)\b/i;
const DECLINE = /\b(fully booked|no tables|cannot|can't|unable|no availability|sold out|do not have|don't have)\b/i;
const YES = /\b(yes|confirmed|that works|we can do that|you are all set|you're all set|we have a table|see you then)\b/i;
const CARD_RUN = /\b\d[\d\s-]{11,}\d\b/;

const goodbye = {
  payment: "I cannot share payment details. The guest will follow up. Goodbye.",
  voicemail: "I reached a recording. The guest will follow up. Goodbye.",
  ivr: "I cannot get through this menu. The guest will follow up. Goodbye.",
  hold: "I have been on hold too long. The guest will follow up. Goodbye.",
  declined: "Thank you for letting me know. I will tell the guest. Goodbye.",
  outside: "That time is outside the time the guest can do. I will ask them. Goodbye.",
  unclear: "I will have the guest follow up. Goodbye.",
};

function parseClock(text) {
  const ampm = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i.exec(text);
  if (ampm) {
    let h = Number(ampm[1]);
    const min = Number(ampm[2] || "0");
    const pm = /^p/i.test(ampm[3]);
    if (h < 1 || h > 12 || min > 59) return null;
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  const h24 = /\b([01]\d|2[0-3]):([0-5]\d)\b/.exec(text);
  return h24 ? `${h24[1]}:${h24[2]}` : null;
}

function detailToken(text) {
  if (CARD_RUN.test(text) || PAYMENT.test(text)) return { payment: true };
  const m = /\b(?:confirmation|confirmed|code|under|name is)\b[:\s]+([A-Za-z][A-Za-z0-9]{1,11}|\d{2,8})\b/i.exec(text);
  if (!m) return null;
  if (/^\d{12,}$/.test(m[1])) return { payment: true };
  return { token: m[1].slice(0, 12) };
}

function finish(outcome, summary, say, extra = {}) {
  return { outcome, summary: scrubSummary(summary), say, hangup: true, ...extra };
}

/**
 * One restaurant turn. `state` is mutated only for the in memory conversation (asked once for a detail).
 * Returns a spoken line and, when the call should end, an outcome. Never returns a transcript to store.
 */
export function interpretUtterance(state, event, { holdLimit = HOLD_LIMIT_SECONDS } = {}) {
  const script = state.script;
  const held = typeof event === "object" && event ? Number(event.heldSeconds || 0) : 0;
  const text = typeof event === "string" ? event : String((event && event.utterance) || "");
  if (held > holdLimit) return finish("needs_guest", "The hold was too long.", goodbye.hold, { reason: "HOLD" });
  if (PAYMENT.test(text) || CARD_RUN.test(text)) return finish("needs_guest", "They asked for payment.", goodbye.payment, { reason: "PAYMENT" });
  if (VOICEMAIL.test(text)) return finish("needs_guest", "Reached voicemail.", goodbye.voicemail, { reason: "VOICEMAIL" });
  if (IVR.test(text)) return finish("needs_guest", "Reached an automated menu.", goodbye.ivr, { reason: "IVR" });
  if (HUMAN.test(text)) {
    state.humanAnswers = (state.humanAnswers || 0) + 1;
    if (state.humanAnswers > 2) return finish("needs_guest", "They asked for a person.", goodbye.unclear, { reason: "HUMAN" });
    return { outcome: null, hangup: false, say: DISCLOSURE, summary: null };
  }
  const alt = parseClock(text);
  if (alt && alt !== script.time) {
    const inside = timeInGuestWindow(script.time, alt, script.windowMinutes);
    if (inside) {
      return finish("alternative_offered", "They offered a time inside the guest window and the assistant accepted it.",
        `Yes, ${alt} works. Please note it under ${script.guestLabel}. I cannot give a card or pay a fee. Goodbye.`,
        { alternativeTime: alt, acceptedWithinWindow: true, reason: "ALTERNATIVE" });
    }
    return finish("alternative_offered", "They offered a time outside the guest window. Nothing was accepted.",
      goodbye.outside, { alternativeTime: alt, acceptedWithinWindow: false, reason: "ALTERNATIVE" });
  }
  if (DECLINE.test(text) && !YES.test(text)) return finish("declined", "The restaurant declined.", goodbye.declined, { reason: "DECLINED" });
  const detail = detailToken(text);
  if (detail && detail.payment) return finish("needs_guest", "They asked for payment.", goodbye.payment, { reason: "PAYMENT" });
  if (YES.test(text) || (detail && detail.token)) {
    if (detail && detail.token) {
      return finish("confirmed", "The restaurant confirmed. A confirmation detail was captured.",
        "Thank you. I have that noted. Goodbye.", { confirmationDetail: detail.token, reason: "CONFIRMED" });
    }
    if (!state.askedDetail) {
      state.askedDetail = true;
      return { outcome: null, hangup: false, say: "What name or confirmation should I note? I cannot take a card.", summary: null };
    }
    return finish("needs_guest", "They agreed but gave no confirmation detail.", goodbye.unclear, { reason: "NO_DETAIL" });
  }
  if (!state.reasked) {
    state.reasked = true;
    return { outcome: null, hangup: false, say: script.spoken[1], summary: null };
  }
  return finish("needs_guest", "The call ended without a clear answer.", goodbye.unclear, { reason: "UNCLEAR" });
}

/** Walk a fake or relay transcript. The returned object has no transcript field. */
export function runConversation(script, events, { holdLimit = HOLD_LIMIT_SECONDS } = {}) {
  const state = { script, askedDetail: false, reasked: false, humanAnswers: 0 };
  let last = { outcome: null, hangup: false, say: script.spoken[0], summary: null };
  for (const event of events || []) {
    last = interpretUtterance(state, event, { holdLimit });
    if (last.hangup || last.outcome) break;
  }
  if (!last.outcome) return finish("needs_guest", "The call ended without a clear answer.", goodbye.unclear, { reason: "UNCLEAR" });
  return last;
}

export function createConversationRelayVoice({ holdLimit = HOLD_LIMIT_SECONDS } = {}) {
  return {
    id: "conversation_relay",
    opening(script) { return script.spoken[0]; },
    reduce(script, events) { return runConversation(script, events, { holdLimit }); },
  };
}
