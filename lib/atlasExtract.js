// lib/atlasExtract.js — tolerant JSON extraction for model responses.
//
// Why this exists: /api/cron/atlas-build parsed Anthropic replies with
//   txt.match(/\{[\s\S]*\}/) → JSON.parse(m[0])
// which has two failure modes, both observed in production since 2026-07-29
// (8 SyntaxError hits, "Expected ',' or ']'"):
//   1. GREEDY SPAN — first "{" to LAST "}" anywhere in the text, so one stray
//      brace in trailing prose poisons an otherwise valid object.
//   2. TRUNCATION — max_tokens cuts the reply mid-object; the regex still
//      matches a span, JSON.parse throws, and the place is stored
//      PENDING SOURCE even though the model answered with usable content.
//
// The contract, and the honesty rule that shapes it:
//   - extract the FIRST balanced JSON object/array (string-aware scan, so
//     braces inside strings and in surrounding prose never confuse it);
//   - if the payload is truncated, SALVAGE only complete leading elements by
//     cutting at a comma that sits outside every string, then closing the
//     open containers. A string the model never finished is NEVER closed and
//     kept — a half-written claim is a fabrication with extra steps. Every
//     leaf that survives salvage appeared verbatim, complete, in the reply.
//   - never invent: this module only ever DELETES trailing content; it adds
//     nothing but the structural closers ("]"/"}").
//
// Pure: no fetches, no env. Executed (not grepped) by
// scripts/test-atlas-extract.mjs, including truncated-JSON fixtures.

// Scan `s` (which must start at "{" or "[") with full string/escape awareness.
// Returns { end } — index of the closer that balances s[0] — or, if the text
// runs out first, { end: -1, stack, inString } describing what is still open.
function scanBalance(s) {
  const stack = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") {
      stack.pop();
      if (stack.length === 0) return { end: i, stack, inString: false };
    }
  }
  return { end: -1, stack, inString };
}

// Positions of every "," in `s` that is outside all strings — the only safe
// cut points for salvage (cutting anywhere else could keep a partial value).
function commaPositions(s) {
  const out = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === ",") out.push(i);
  }
  return out;
}

// Close a candidate prefix and parse it. Refuses (returns undefined) if the
// prefix ends inside a string — closing that string would publish a value the
// model never finished writing. Only structural closers are appended.
function closeAndParse(candidate) {
  let c = candidate.replace(/[\s,]+$/, "");
  const st = scanBalance(c);
  if (st.inString) return undefined;
  if (st.end >= 0) c = c.slice(0, st.end + 1);
  else if (!st.stack.length) return undefined;
  const closers = st.stack.map((o) => (o === "{" ? "}" : "]")).reverse().join("");
  try {
    const v = JSON.parse(c + closers);
    return v && typeof v === "object" ? v : undefined;
  } catch (e) {
    return undefined;
  }
}

// The entry point. Returns null when no JSON object/array can be recovered,
// else { value, salvaged, dropped }:
//   value    — the parsed object/array
//   salvaged — true when trailing content had to be discarded to parse
//   dropped  — how many comma-cut retreats it took (≈ trailing elements lost)
export function extractModelJson(txt) {
  const s = String(txt || "");
  const start = s.search(/[{[]/);
  if (start < 0) return null;
  const body = s.slice(start);

  // Happy path: the first balanced span parses as-is.
  const bal = scanBalance(body);
  if (bal.end >= 0) {
    try {
      const v = JSON.parse(body.slice(0, bal.end + 1));
      if (v && typeof v === "object") return { value: v, salvaged: false, dropped: 0 };
    } catch (e) { /* fall through to salvage */ }
  }

  // Salvage path: try the whole (truncated) body first — legal only when it
  // does not end mid-string — then retreat comma by comma from the end,
  // dropping the incomplete tail element each time.
  const whole = closeAndParse(body);
  if (whole !== undefined) return { value: whole, salvaged: true, dropped: 0 };
  const commas = commaPositions(body);
  let dropped = 0;
  for (let k = commas.length - 1; k >= 0; k--) {
    dropped++;
    const v = closeAndParse(body.slice(0, commas[k]));
    if (v !== undefined) return { value: v, salvaged: true, dropped };
  }
  return null;
}
