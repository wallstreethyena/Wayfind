// lib/aiKey.js — the ONE accessor for the AI provider key, so every AI endpoint
// degrades identically. Accepts ANTHROPIC_API_KEY, falling back to LLM_API_KEY
// (the same pattern lib/insiderServer.js already uses). Bracket notation is
// deliberate for runtime env reads (see app/api/viator/go/route.js:19) — leave it.
import { logEnvAuditOnce } from "./envAudit";

export function aiKey() {
  logEnvAuditOnce(); // request-time, once per process; never at module scope (no build-log noise)
  return (process.env["ANTHROPIC_API_KEY"] || process.env["LLM_API_KEY"] || "").trim();
}
