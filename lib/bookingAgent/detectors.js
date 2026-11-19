// Classify a page snapshot. Challenge (including 403 and 429) wins over every other class.
// The input is HTML we already have. This function does not fetch anything.

const CHALLENGE = /class=["'][^"']*g-recaptcha|hcaptcha|h-captcha|turnstile|cf-turnstile|perimeterx|px-captcha|recaptcha widget|verify you are human|unusual activity/i;
const PAYMENT = /stripe|spreedly|cc-number|credit card|debit card|card number|card required|deposit required|deposit|prepay|pre-pay/i;
const PHONE = /verification code|texted you a code|enter the code|sms code|phone code|one-time-code/i;
const LOGIN = /type=["']password["']|sign in to continue|log in to continue|login wall/i;
const SLOT_GONE = /no longer available|time you selected is gone|slot is gone|that time was just taken|no online availability/i;
const CONFIRM = /reservation (?:is )?confirmed|confirmation (?:number|#)/i;
const SLOTS = /data-test=["']slot-button["']|data-synthetic=["']slot-button["']/i;
const FORM = /id=["']firstName["']|name=["']firstName["']|data-synthetic=["']first-name["']|first name/i;

function visibleHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<textarea[^>]*g-recaptcha-response[^>]*>[\s\S]*?<\/textarea>/gi, " ");
}

export function classifyPage({ html = "", httpStatus = 200, title = "" } = {}) {
  const status = Number(httpStatus);
  if (status === 403 || status === 429) return "challenge";
  const raw = String(html || "");
  const visible = visibleHtml(raw);
  const seen = `${title}\n${visible}`;
  if (/\b403\b|\b429\b/.test(title) || /<h1>\s*403\b|<h1>\s*429\b/i.test(visible)) return "challenge";
  if (CHALLENGE.test(seen)) return "challenge";
  if (PAYMENT.test(seen)) return "payment";
  if (PHONE.test(seen)) return "phone_code";
  if (LOGIN.test(seen)) return "login";
  if (SLOT_GONE.test(seen)) return "slot_gone";
  if (CONFIRM.test(seen)) return "confirmation";
  if (FORM.test(seen) && /email/i.test(seen)) return "form";
  if (SLOTS.test(seen)) return "slots";
  return "unknown";
}

export const DETECT_TO_HAND = Object.freeze({
  challenge: "challenge",
  login: "login_required",
  payment: "payment_required",
  phone_code: "phone_verification",
  slot_gone: "slot_unavailable",
  slots: "slot_unavailable",
  unknown: "unrecognized_page",
  confirmation: "unrecognized_page",
});
