#!/usr/bin/env node
// scripts/push-test.mjs — operator CLI for sending one real APNs test push
// through app/api/push/test, without waiting for Friday's Weekend Picks run.
//
// USAGE
//   node scripts/push-test.mjs --url https://www.gowayfind.com --token <apns device token> [--title "..." --body "..." --path /p/abc]
//   node scripts/push-test.mjs --url https://www.gowayfind.com --user <uuid> [--title "..." --body "..." --path /p/abc]
//
// Reads CRON_SECRET from the environment (never accepted as a flag — a
// secret does not belong in shell history or `ps`). Requires --url and
// either --token or --user. --path becomes the notification's `url` field
// (defaults to "/" server-side when omitted).
//
// This is NOT a guard (no `ok()`/assertion counter) and is not wired into
// scripts/guards.txt — it is an operator convenience, run by hand.

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { out[key] = true; continue; }
    out[key] = next;
    i++;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const secret = String(process.env.CRON_SECRET || "").trim();

  if (!args.url) return fail("missing --url (e.g. --url https://www.gowayfind.com)");
  if (!args.token && !args.user) return fail("provide either --token <apns device token> or --user <uuid>");
  if (!secret) return fail("CRON_SECRET is not set in the environment");

  const base = String(args.url).replace(/\/+$/, "");
  const body = {};
  if (args.token) body.token = String(args.token);
  if (args.user) body.userId = String(args.user);
  if (args.title) body.title = String(args.title);
  if (args.body) body.body = String(args.body);
  if (args.path) body.url = String(args.path);

  console.log(`POST ${base}/api/push/test`);
  let res;
  try {
    res = await fetch(`${base}/api/push/test`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/json", authorization: "Bearer " + secret },
      body: JSON.stringify(body),
    });
  } catch (e) {
    fail(`request failed: ${e && e.message ? e.message : e}`);
    return;
  }

  let json = null;
  try { json = await res.json(); } catch (e) {}

  console.log(`status ${res.status}`);
  console.log(JSON.stringify(json, null, 2));

  if (!res.ok) process.exitCode = 1;
}

function fail(msg) {
  console.error("push-test: " + msg);
  console.error("");
  console.error("Usage:");
  console.error("  node scripts/push-test.mjs --url https://www.gowayfind.com --token <apns token> [--title --body --path]");
  console.error("  node scripts/push-test.mjs --url https://www.gowayfind.com --user <uuid> [--title --body --path]");
  process.exitCode = 1;
}

await main();
