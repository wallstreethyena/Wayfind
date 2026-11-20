// Strip query strings, emails, phones and any extra secrets (the guest's name) before a log or event.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const URL_RE = /https?:\/\/[^\s"'<>]+/gi;

export function pathOnly(url) {
  try {
    const u = new URL(String(url), "https://fixture.local");
    return u.pathname.slice(0, 200);
  } catch {
    return "/";
  }
}

export function redact(value, secrets = []) {
  let s = typeof value === "string" ? value : JSON.stringify(value);
  s = s.replace(URL_RE, (raw) => {
    try {
      const u = new URL(raw);
      return u.origin + u.pathname;
    } catch {
      return "[url]";
    }
  });
  s = s.replace(/\?[^\s"'<>]*/g, "");
  s = s.replace(EMAIL, "[email]");
  s = s.replace(PHONE, "[phone]");
  for (const secret of secrets) {
    const text = String(secret || "").trim();
    if (text.length < 3) continue;
    s = s.split(text).join("[redacted]");
  }
  return s;
}
