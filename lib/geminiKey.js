// lib/geminiKey.js — single server-only accessor for the Gemini API key.
//
// Accepts GEMINI_API_KEY, falling back to GOOGLE_AI_API_KEY. Bracket notation
// is deliberate for reliable runtime env reads (same convention as lib/aiKey.js).
// Placeholders like "[SENSITIVE]" fail closed to "" via credential().
// Calls logEnvAuditOnce() at request time only, never at module scope.
import { logEnvAuditOnce } from "./envAudit.js";
import { credential } from "./envPlaceholder.js";

export function geminiKey() {
  logEnvAuditOnce();
  return credential(process.env["GEMINI_API_KEY"]) || credential(process.env["GOOGLE_AI_API_KEY"]) || "";
}
