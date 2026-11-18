#!/usr/bin/env node
/**
 * owner-sign-approval — the OWNER runs this on his own machine to sign an
 * approval, then pastes the printed comment into the pull request himself.
 *
 *   node scripts/owner-sign-approval.mjs --pr 2600
 *   node scripts/owner-sign-approval.mjs --sha <40-hex> [--key ~/.ssh/id_ed25519_sk]
 *
 * It writes the exact approval message
 *     wayfind-owner-approve v1\nrepo=wallstreethyena/Wayfind\nsha=<sha>
 * to a temp file, runs `ssh-keygen -Y sign -n wayfind-owner-approve -f <key>`
 * (a hardware key asks for a touch), and prints the full comment text: the
 * "/owner-approve <sha>" line plus the armored signature. It NEVER posts,
 * edits or sends anything; the owner pastes the text. An agent must not run
 * this to produce an approval (AGENTS.md section 11); see docs/OWNER_APPROVAL.md.
 *
 * --pr reads the PR's current head with `gh pr view` (read only). Not an
 * owner-only file: it holds no trust, the verifier does.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { APPROVAL_NAMESPACE, approvalMessage } from "./lib/ownerApproval.mjs";

function parseArgs(argv) {
  const out = { sha: null, pr: null, key: join(homedir(), ".ssh", "id_ed25519_sk") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sha") out.sha = argv[++i];
    else if (a === "--pr") out.pr = argv[++i];
    else if (a === "--key") out.key = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

function fail(msg) {
  console.error(`owner-sign-approval: ${msg}`);
  console.error("usage: node scripts/owner-sign-approval.mjs (--sha <40-hex> | --pr <number>) [--key <private key path>]");
  process.exit(2);
}

let args;
try { args = parseArgs(process.argv.slice(2)); } catch (e) { fail(e.message); }
if (!!args.sha === !!args.pr) fail("give exactly one of --sha or --pr");

let sha = args.sha;
if (args.pr) {
  if (!/^[0-9]+$/.test(args.pr)) fail("--pr must be a pull request number");
  try {
    sha = execFileSync("gh", ["pr", "view", args.pr, "--repo", "wallstreethyena/Wayfind", "--json", "headRefOid", "--jq", ".headRefOid"], { encoding: "utf8" }).trim();
  } catch (e) {
    fail(`could not read the head of PR ${args.pr} with gh: ${e.message.split("\n")[0]}`);
  }
}
if (!/^[0-9a-fA-F]{40}$/.test(sha || "")) fail("the commit must be the full 40-character sha");
sha = sha.toLowerCase();

const dir = mkdtempSync(join(tmpdir(), "wf-owner-sign-"));
try {
  const file = join(dir, "message");
  writeFileSync(file, approvalMessage(sha)); // exact bytes, no trailing newline
  execFileSync("ssh-keygen", ["-Y", "sign", "-n", APPROVAL_NAMESPACE, "-f", args.key, file], { stdio: ["inherit", "ignore", "inherit"] });
  const signature = readFileSync(`${file}.sig`, "utf8").trimEnd();
  console.error(`signed for sha ${sha}. Paste everything below into a comment on the pull request yourself (nothing was posted):\n`);
  console.log(`/owner-approve ${sha}\n${signature}`);
} catch (e) {
  fail(`ssh-keygen could not sign with ${args.key}: ${e.message.split("\n")[0]}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
