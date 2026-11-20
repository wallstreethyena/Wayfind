// ConversationRelay session. Uses the same interpreter as lib/reservePhone/voice.js.
// The welcome greeting already spoke the disclosure, so setup does not say it again.
// A transcript is kept only in this process, long enough to decide, and is not posted.
import { HOLD_LIMIT_SECONDS } from "../../lib/reservePhone/policy.js";
import { buildCallScript } from "../../lib/reservePhone/script.js";
import { interpretUtterance } from "../../lib/reservePhone/voice.js";

const HOLD_WORDS = /\b(please hold|on hold|one moment|please wait|stay on the line)\b/i;

function framesFor(result) {
  const out = [];
  if (result && result.say) out.push({ type: "text", token: result.say, last: true, interruptible: false });
  if (result && result.hangup) out.push({ type: "end", handoffData: JSON.stringify({ outcome: result.outcome || "needs_guest" }) });
  return out;
}

/**
 * One call. `postOutcome` receives the structured result only.
 * `schedule(fn, ms)` is injectable so tests do not wait 45 seconds.
 */
export function createRelaySession({ postOutcome, holdLimit = HOLD_LIMIT_SECONDS, schedule = setTimeout, clearSchedule = clearTimeout, onFrames = () => {} } = {}) {
  let state = null;
  let requestId = "";
  let holdTimer = null;
  let finished = false;

  async function finish(result) {
    if (finished || !result) return [];
    if (!result.hangup) return framesFor(result);
    finished = true;
    if (holdTimer) { clearSchedule(holdTimer); holdTimer = null; }
    const frames = framesFor(result);
    if (requestId && result.outcome && postOutcome) {
      await postOutcome({
        requestId,
        outcome: result.outcome,
        summary: result.summary,
        alternativeTime: result.alternativeTime || null,
        acceptedWithinWindow: result.acceptedWithinWindow === true,
        confirmationDetail: result.confirmationDetail || null,
      });
    }
    return frames;
  }

  return {
    async handle(raw) {
      let msg;
      try { msg = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return []; }
      if (!msg || typeof msg !== "object") return [];
      if (msg.type === "setup") {
        const p = msg.customParameters || {};
        requestId = String(p.requestId || "");
        const script = buildCallScript({
          restaurantName: p.restaurantName || "the restaurant",
          date: p.date || "2026-11-18",
          time: p.time || "19:00",
          partySize: Number(p.party) || 2,
          guestLabel: p.guestLabel || "Guest",
          windowMinutes: Number(p.windowMinutes) || 90,
        });
        state = { script, askedDetail: false, reasked: false, humanAnswers: 0 };
        return [];
      }
      if (!state || finished) return [];
      if (msg.type === "hold") return finish(interpretUtterance(state, { utterance: "", heldSeconds: holdLimit + 1 }, { holdLimit }));
      if (msg.type !== "prompt" || msg.last === false) return [];
      if (holdTimer) { clearSchedule(holdTimer); holdTimer = null; }
      const text = String(msg.voicePrompt || "");
      const result = interpretUtterance(state, text, { holdLimit });
      if (!result.hangup && HOLD_WORDS.test(text)) {
        holdTimer = schedule(() => finish(interpretUtterance(state, { utterance: "", heldSeconds: holdLimit + 1 }, { holdLimit })).then((frames) => { onFrames(frames || []); return frames; }), holdLimit * 1000);
      }
      return finish(result);
    },
  };
}
