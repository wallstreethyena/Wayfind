// lib/openaiKey.js — single server-only accessor for the OpenAI API key.
//
// Reads OPENAI_API_KEY with bracket notation for reliable runtime env reads
// (same convention as lib/aiKey.js and lib/geminiKey.js). Placeholders like
// "[SENSITIVE]" fail closed to "" via credential(). Calls logEnvAuditOnce()
// at request time only, never at module scope.
import { logEnvAuditOnce } from "./envAudit.js";
import { credential } from "./envPlaceholder.js";

export function openaiKey() {
  logEnvAuditOnce();
  return credential(process.env["OPENAI_API_KEY"]) || "";
}
