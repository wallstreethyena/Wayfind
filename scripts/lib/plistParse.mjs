// scripts/lib/plistParse.mjs — plist parsing with NO external binary.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
// The iOS guards originally shelled out to `plutil`. That works on a Mac and
// FAILS THE VERCEL BUILD, because Vercel builds on Linux and plutil is a macOS
// binary:
//
//     Error: spawnSync plutil ENOENT
//     run-guards: FAIL — guard 271/271 exited 1
//     Error: Command "npm run build" exited with 1
//
// The tempting fix is to skip these guards when plutil is missing. That would
// be strictly worse than deleting them: the suite would go green on Vercel
// while checking nothing, which is this repo's single most-repeated failure —
// the check ran, and answered a question nobody was asking. So the parsing
// moves in-process instead, and the guards run identically everywhere.
//
// ── HOW THESE ARE KNOWN TO BE CORRECT ─────────────────────────────────────
// scripts/test-plist-parse.mjs diffs BOTH parsers against real plutil output
// on every plist in the repo, whenever plutil is available (i.e. on a Mac). On
// Linux it says so and checks structural invariants instead, rather than
// pretending it verified something.
//
// A hand-written parser that is only ever tested on the files it was written
// for is a liability. The differential test is what makes this safe to rely on.
import { readFileSync } from "node:fs";

// ── XML plists (.xcprivacy, .entitlements, Info.plist) ───────────────────

/**
 * Parse an XML plist into plain JS. Handles the element set Apple actually
 * emits: dict, array, string, true, false, integer, real, data, date.
 *
 * Not a general XML parser and does not pretend to be — it walks the tag
 * stream, which is sufficient because plists are machine-generated and have no
 * mixed content, no namespaces and no attributes that carry meaning.
 */
export function parseXmlPlist(src) {
  // Strip the prolog, doctype and comments before tokenising, so a comment
  // mentioning <string> cannot be read as one. (This repo has hit
  // "the regex matched its own comment" repeatedly.)
  const body = src
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const tokens = [];
  const rx = /<(\/?)([a-zA-Z]+)(\s*\/)?>|([^<]+)/g;
  let m;
  while ((m = rx.exec(body)) !== null) {
    if (m[2]) tokens.push({ tag: m[2], close: m[1] === "/", self: !!m[3] });
    else if (m[4] && m[4].trim()) tokens.push({ text: m[4] });
  }

  let i = 0;
  const decode = (s) =>
    s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
     .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
     .replace(/&amp;/g, "&"); // last, so &amp;lt; does not become <

  // Text content up to the matching close tag. Returns "" for <tag></tag>.
  function textUntilClose(tag) {
    let out = "";
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.tag === tag && t.close) { i += 1; return decode(out); }
      if (t.text !== undefined) out += t.text;
      i += 1;
    }
    return decode(out);
  }

  function value() {
    while (i < tokens.length && tokens[i].text !== undefined) i += 1; // whitespace
    const t = tokens[i];
    if (!t) return undefined;
    if (t.close) return undefined;
    i += 1;

    switch (t.tag) {
      case "plist": {
        const v = value();
        // consume </plist>
        while (i < tokens.length && !(tokens[i].tag === "plist" && tokens[i].close)) i += 1;
        i += 1;
        return v;
      }
      case "true":  if (!t.self) textUntilClose("true");  return true;
      case "false": if (!t.self) textUntilClose("false"); return false;
      case "string": return t.self ? "" : textUntilClose("string");
      case "integer": return t.self ? 0 : parseInt(textUntilClose("integer"), 10);
      case "real": return t.self ? 0 : parseFloat(textUntilClose("real"));
      case "data": return t.self ? "" : textUntilClose("data").replace(/\s+/g, "");
      case "date": return t.self ? "" : textUntilClose("date");
      case "array": {
        const out = [];
        if (t.self) return out;
        for (;;) {
          while (i < tokens.length && tokens[i].text !== undefined) i += 1;
          if (i >= tokens.length) break;
          if (tokens[i].tag === "array" && tokens[i].close) { i += 1; break; }
          out.push(value());
        }
        return out;
      }
      case "dict": {
        const out = {};
        if (t.self) return out;
        for (;;) {
          while (i < tokens.length && tokens[i].text !== undefined) i += 1;
          if (i >= tokens.length) break;
          if (tokens[i].tag === "dict" && tokens[i].close) { i += 1; break; }
          if (tokens[i].tag !== "key") { i += 1; continue; }
          const selfKey = tokens[i].self;
          i += 1;
          const k = selfKey ? "" : textUntilClose("key");
          out[k] = value();
        }
        return out;
      }
      default:
        return undefined;
    }
  }

  return value();
}

// ── NeXTSTEP / old-style plists (project.pbxproj) ────────────────────────

/**
 * Parse an Xcode project.pbxproj. The format is a NeXTSTEP property list:
 * `{ key = value; }`, `( a, b )`, bare or quoted strings, and C-style comments
 * that carry no meaning (Xcode uses them to annotate object ids).
 *
 * Everything is a string or a container — the format has no type information,
 * which matches how plutil renders it too, so the two agree exactly.
 */
export function parsePbxproj(src) {
  let i = 0;
  const n = src.length;

  function skip() {
    for (;;) {
      while (i < n && /\s/.test(src[i])) i += 1;
      if (src[i] === "/" && src[i + 1] === "*") {
        const end = src.indexOf("*/", i + 2);
        i = end === -1 ? n : end + 2;
        continue;
      }
      // A `//` comment. Only outside a quoted string, and we are never inside
      // one here — quoted strings are consumed whole by readString().
      if (src[i] === "/" && src[i + 1] === "/") {
        const end = src.indexOf("\n", i);
        i = end === -1 ? n : end;
        continue;
      }
      return;
    }
  }

  function readString() {
    if (src[i] === '"') {
      i += 1;
      let out = "";
      while (i < n) {
        const c = src[i];
        if (c === "\\") {
          const nx = src[i + 1];
          out += nx === "n" ? "\n" : nx === "t" ? "\t" : nx === "r" ? "\r" : nx;
          i += 2;
          continue;
        }
        if (c === '"') { i += 1; return out; }
        out += c;
        i += 1;
      }
      return out;
    }
    // Bare token: runs until a structural character or whitespace.
    const start = i;
    while (i < n && !/[\s{}()=;,"]/.test(src[i])) i += 1;
    return src.slice(start, i);
  }

  function value() {
    skip();
    const c = src[i];
    if (c === "{") {
      i += 1;
      const out = {};
      for (;;) {
        skip();
        if (src[i] === "}") { i += 1; return out; }
        if (i >= n) return out;
        const k = readString();
        skip();
        if (src[i] === "=") i += 1;
        out[k] = value();
        skip();
        if (src[i] === ";") i += 1;
      }
    }
    if (c === "(") {
      i += 1;
      const out = [];
      for (;;) {
        skip();
        if (src[i] === ")") { i += 1; return out; }
        if (i >= n) return out;
        out.push(value());
        skip();
        if (src[i] === ",") i += 1;
      }
    }
    return readString();
  }

  skip();
  // The leading `// !$*UTF8*$!` marker is handled by skip().
  return value();
}

/** Read and parse any plist file the repo holds, by shape. */
export function readPlist(file) {
  const src = readFileSync(file, "utf8");
  return /^\s*(?:<\?xml|<!DOCTYPE|<plist)/.test(src) ? parseXmlPlist(src) : parsePbxproj(src);
}
