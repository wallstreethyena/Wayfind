#!/usr/bin/env node
/**
 * owner-sign-approval — the OWNER runs this on his own machine to sign an
 * approval, then pastes the printed comment into the pull request himself.
 *
 *   node scripts/owner-sign-approval.mjs --sha <40-hex> [--key ~/.ssh/id_ed25519_sk]
 *
 * The sha is the one the owner COPIES FROM THE PULL REQUEST PAGE ON github.com,
 * after reading the diff he is approving. There is deliberately no --pr option:
 * "sign whatever the head is right now" would sign a commit an agent pushed a
 * moment ago. The script prints the sha and the repository in large type BEFORE
 * it asks the key to sign, so he can compare them with github.com while the key
 * waits for his touch (a hardware key blinks until touched and asks for its PIN).
 * If they differ, or he did not start this himself, he does not touch the key.
 *
 * It writes the exact approval message
 *     wayfind-owner-approve v1\nrepo=wallstreethyena/Wayfind\nsha=<sha>
 * to a temp file, runs `ssh-keygen -Y sign -n wayfind-owner-approve -f <key>`,
 * and prints the full comment text: the "/owner-approve <sha>" line plus the
 * armored signature. It NEVER posts, edits or sends anything and makes no
 * network call; the owner pastes the text. An agent must not run this, with any
 * key, to produce an approval (AGENTS.md section 11); see docs/OWNER_APPROVAL.md.
 *
 * Owner-only file (scripts/lib/ownerApproval.mjs OWNER_ONLY): changing what the
 * owner is shown at the moment he signs is itself an approval decision.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { APPROVAL_NAMESPACE, APPROVAL_REPO, approvalMessage } from "./lib/ownerApproval.mjs";

function parseArgs(argv) {
  const out = { sha: null, key: join(homedir(), ".ssh", "id_ed25519_sk") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sha") out.sha = argv[++i];
    else if (a === "--key") out.key = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

function fail(msg) {
  console.error(`owner-sign-approval: ${msg}`);
  console.error("usage: node scripts/owner-sign-approval.mjs --sha <the 40-character commit sha copied from the PR page on github.com> [--key <private key path>]");
  process.exit(2);
}

let args;
try { args = parseArgs(process.argv.slice(2)); } catch (e) { fail(e.message); }
if (!/^[0-9a-fA-F]{40}$/.test(args.sha || "")) fail("--sha is required and must be the full 40-character commit sha shown on the pull request page");
const sha = args.sha.toLowerCase();

const dir = mkdtempSync(join(tmpdir(), "wf-owner-sign-"));
try {
  const file = join(dir, "message");
  writeFileSync(file, approvalMessage(sha)); // exact bytes, no trailing newline
  console.error([
    "",
    "================================================================",
    "  YOU ARE ABOUT TO SIGN AN OWNER APPROVAL",
    `  repository : ${APPROVAL_REPO}`,
    `  commit sha : ${sha}`,
    "================================================================",
    "Open the pull request on github.com NOW and compare this sha with the one",
    "shown there (the commit you reviewed). If it differs by even one character,",
    "or you did not start this yourself just now, do NOT touch the key: press Ctrl-C.",
    "",
  ].join("\n"));
  execFileSync("ssh-keygen", ["-Y", "sign", "-n", APPROVAL_NAMESPACE, "-f", args.key, file], { stdio: ["inherit", "ignore", "inherit"] });
  const signature = readFileSync(`${file}.sig`, "utf8").trimEnd();
  console.error(`signed for sha ${sha}. Paste everything below into a comment on the pull request yourself (nothing was posted):\n`);
  console.log(`/owner-approve ${sha}\n${signature}`);
} catch (e) {
  fail(`ssh-keygen could not sign with ${args.key}: ${e.message.split("\n")[0]}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
