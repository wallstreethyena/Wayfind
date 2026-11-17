// Classify a page snapshot. Challenge (including 403 and 429) wins over every other class.
// The input is HTML we already have. This function does not fetch anything.

const CHALLENGE = /recaptcha|hcaptcha|h-captcha|g-recaptcha|turnstile|cf-turnstile|perimeterx|px-captcha|captcha|verify you are human|unusual activity/i;
const PAYMENT = /stripe|spreedly|cc-number|credit card|debit card|card number|card required|deposit required|deposit|prepay|pre-pay/i;
const PHONE = /verification code|texted you a code|enter the code|sms code|phone code/i;
const LOGIN = /type=["']password["']|sign in to continue|log in to continue|login wall/i;
const SLOT = /no longer available|time you selected is gone|slot is gone|that time was just taken/i;
const CONFIRM = /reservation confirmed|confirmation number/i;
const FORM = /data-synthetic=["']first-name["']|first name/i;

function visibleHtml(html) {
  return String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
}

export function classifyPage({ html = "", httpStatus = 200, title = "" } = {}) {
  const status = Number(httpStatus);
  if (status === 403 || status === 429) return "challenge";
  const raw = String(html || "");
  const visible = visibleHtml(raw);
  const blob = `${title}\n${raw}`;
  const seen = `${title}\n${visible}`;
  if (/\b403\b|\b429\b/.test(title) || /<h1>\s*403\b|<h1>\s*429\b/i.test(visible)) return "challenge";
  if (CHALLENGE.test(blob)) return "challenge";
  if (PAYMENT.test(seen)) return "payment";
  if (PHONE.test(seen)) return "phone_code";
  if (LOGIN.test(seen)) return "login";
  if (SLOT.test(seen)) return "slot_gone";
  if (CONFIRM.test(seen)) return "confirmation";
  if (FORM.test(seen) && /email/i.test(seen)) return "form";
  return "unknown";
}

export const DETECT_TO_HAND = Object.freeze({
  challenge: "challenge",
  login: "login_required",
  payment: "payment_required",
  phone_code: "phone_verification",
  slot_gone: "slot_unavailable",
  unknown: "unrecognized_page",
  confirmation: "unrecognized_page",
});
