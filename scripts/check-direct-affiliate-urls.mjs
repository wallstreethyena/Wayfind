#!/usr/bin/env node
// check-direct-affiliate-urls.mjs — regression guard for the money-funnel traceability work.
//
// WHY THIS EXISTS
// After routing Viator/Ticketmaster CTAs through server redirect layers, the
// fastest way for attribution to silently break is a future edit that puts a
// direct partner URL back into a money card. This guard fails the build if any
// client-facing money surface renders a raw affiliate domain instead of our
// redirect paths.
//
// SCOPE
// Scans app/components/*.js, app/components/screens/*.js, app/components/sheets/*.js
// and app/home.js. Server routes, data libs, and the ONE lib/affiliates.js builder
// are excluded by design — they are allowed to know partner URLs.
//
// ALLOWED outbound paths (these are the redirect layers):
//   /api/commerce/go
//   /api/viator/go
//   /api/ticketmaster/go
//
// BLOCKED raw hosts in hrefs (these earn nothing if rendered directly):
//   www.viator.com/tours
//   www.ticketmaster.com
//   www.livenation.com
//   www.booking.com/searchresults
//   www.vrbo.com

import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BLOCKED = [
  { host: /www\.viator\.com\/tours/i, name: "Viator product URL" },
  { host: /www\.ticketmaster\.com/i, name: "Ticketmaster URL" },
  { host: /www\.livenation\.com/i, name: "LiveNation URL" },
  { host: /www\.booking\.com\/searchresults/i, name: "Booking.com search URL" },
  { host: /www\.vrbo\.com/i, name: "VRBO URL" },
];

const ALLOWED_REDIRECTS = [
  /\/api\/commerce\/go\?/,
  /\/api\/viator\/go\?/,
  /\/api\/ticketmaster\/go\?/,
];

function walk(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      out.push(...walk(p));
    } else if (/\.(js|jsx|mjs)$/.test(n)) {
      out.push(p);
    }
  }
  return out;
}

const files = [
  ...walk("app/components"),
  "app/home.js",
];

let failures = [];

for (const f of files) {
  const src = readFileSync(f, "utf8");
  // Strip full-line comments so doc lines mentioning a partner URL don't trip us.
  const codeLines = src.split("\n").filter((l) => {
    const t = l.trimStart();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  });
  const code = codeLines.join("\n");

  for (const { host, name } of BLOCKED) {
    if (host.test(code)) {
      // A blocked host is only acceptable if the same file also routes through
      // one of the allowed redirect layers, OR if it appears in a non-href
      // context (e.g. a comment we already stripped). We conservatively fail
      // and let the author whitelist with an explanation.
      failures.push(`${f}: renders a raw ${name}`);
    }
  }
}

if (failures.length) {
  console.error("check-direct-affiliate-urls: FAIL");
  for (const m of failures) console.error("  - " + m);
  process.exit(1);
}

console.log("check-direct-affiliate-urls: OK — no raw Viator/Ticketmaster/Booking/VRBO URLs in client money surfaces");
