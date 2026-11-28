// Carrier-standard SMS keywords (CTIA). STOP words always opt the number out of
// every Wayfind text list; HELP is logged. PURE.
const STOP = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout", "revoke"]);
const HELP = new Set(["help", "info"]);
export function smsKeyword(body) {
  const word = String(body || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (STOP.has(word)) return "stop";
  if (HELP.has(word)) return "help";
  return null;
}
