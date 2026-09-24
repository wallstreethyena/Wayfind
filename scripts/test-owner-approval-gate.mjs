#!/usr/bin/env node
/**
 * test-owner-approval-gate — the owner gate cannot be satisfied by a pull
 * request, and it only ever speaks as the Owner Gate GitHub App.
 *
 * Why this exists (2026-09-24): on a personal-account repository a required
 * check is matched by name and app, so a pull request that adds its own
 * workflow with a job named "owner-approval" could report a passing check under
 * that name. The fix is a check posted by a GitHub App whose key only main can
 * reach (scripts/owner-approval-gate.mjs). This test runs the REAL gate script as
 * a child process against a stub GitHub API that verifies the App's RS256 JWT
 * with a throwaway key pair, and proves:
 *
 *   S1  the gate check is created with the App's installation token, never with
 *       the workflow's GITHUB_TOKEN, under the exact name branch protection pins
 *   S2  it refuses to run on a pull request's own ref or event (pull_request),
 *       which is the only way a pull request could get its own code near the key
 *   S3  a pull request that ADDS a workflow (the spoof itself) is an owner-only
 *       change and gets a failing gate check without the owner's approval
 *   S4  the verdict is the shared owner rule: no approval, bot approval, a
 *       shortened sha, a non-owner account all fail; the owner's full-sha comment
 *       passes; an approval arriving by comment re-evaluates the live head
 *   S5  it fails closed: API errors post a failing check and exit non-zero; a
 *       key that cannot mint a token never posts success; half a configuration
 *       is an error; no configuration posts nothing (so a required check stays
 *       missing, which blocks)
 *   S6  the workflow cannot leak the key: only pull_request_target and
 *       issue_comment (both run from main), the owner-gate environment, no
 *       deployment object, read-only GITHUB_TOKEN, main checked out, pinned
 *       actions, no event text in a shell
 *   S7  nothing else in the repository can reach the gate: no other workflow
 *       names the owner-gate environment or its secret, and the three required
 *       check names are each produced by exactly one workflow
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppJwt } from "./lib/githubAppAuth.mjs";
import { isOwnerOnly, OWNERS } from "./lib/ownerApproval.mjs";

const REPO = process.cwd();
const GATE = join(REPO, "scripts", "owner-approval-gate.mjs");
const OWNER = OWNERS[0];
const APP_ID = "424242";
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_PEM = privateKey.export({ type: "pkcs8", format: "pem" });
const PUBLIC_PEM = publicKey.export({ type: "spki", format: "pem" });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });

// ── 1. The App JWT is a real RS256 signature GitHub can verify ─────────────
{
  const now = 1_800_000_000;
  const jwt = createAppJwt({ appId: APP_ID, privateKeyPem: PRIVATE_PEM, nowSeconds: now });
  const [h, p, sig] = jwt.split(".");
  const verify = createVerify("RSA-SHA256"); verify.update(`${h}.${p}`);
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  ok(verify.verify(PUBLIC_PEM, Buffer.from(sig, "base64url")) && JSON.parse(Buffer.from(h, "base64url").toString()).alg === "RS256",
    "the App JWT is RS256-signed with the App's private key");
  ok(payload.iss === APP_ID && payload.iat === now - 60 && payload.exp - payload.iat <= 600, `JWT claims: issuer is the App, lifetime within GitHub's 10 minutes (${JSON.stringify(payload)})`);
  ok((() => { try { createAppJwt({ appId: APP_ID, privateKeyPem: "not a key" }); return false; } catch { return true; } })()
    && (() => { try { createAppJwt({ appId: "abc", privateKeyPem: PRIVATE_PEM }); return false; } catch { return true; } })(),
  "a bad key or a non-numeric App id throws instead of signing garbage");
}

// ── 2. The real gate script against a stub GitHub API ──────────────────────
const root = mkdtempSync(join(tmpdir(), "wf-owner-gate-"));
const preload = join(root, "stub.mjs");
writeFileSync(preload, `
import { readFileSync, appendFileSync } from "node:fs";
import { createVerify } from "node:crypto";
const cfg = JSON.parse(readFileSync(process.env.STUB_CONFIG, "utf8"));
let pullReads = 0;
const jwtOk = (auth) => {
  const m = /^Bearer ([^.]+)\\.([^.]+)\\.([^.]+)$/.exec(auth || ""); if (!m) return false;
  const v = createVerify("RSA-SHA256"); v.update(m[1] + "." + m[2]);
  const claims = JSON.parse(Buffer.from(m[2], "base64url").toString());
  return v.verify(cfg.publicPem, Buffer.from(m[3], "base64url")) && claims.iss === cfg.appId;
};
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
globalThis.fetch = async (url, init = {}) => {
  const path = new URL(url).pathname; const method = init.method || "GET";
  const auth = String((init.headers || {}).Authorization || "");
  appendFileSync(process.env.STUB_LOG, JSON.stringify({ method, path: path + new URL(url).search, auth: auth.slice(0, 40), body: init.body ? JSON.parse(init.body) : null }) + "\\n");
  if (path.endsWith("/installation")) return jwtOk(auth) ? reply(200, { id: 777 }) : reply(401, {});
  if (path === "/app/installations/777/access_tokens") return jwtOk(auth) && !cfg.mintFails ? reply(201, { token: "ghs_gate_fixture" }) : reply(401, {});
  if (path.endsWith("/check-runs")) return auth === "Bearer ghs_gate_fixture" ? reply(201, { id: 1 }) : reply(403, {});
  if (auth !== "Bearer workflow-token") return reply(401, {});
  if (cfg.apiStatus) return reply(cfg.apiStatus, {});
  if (/\\/pulls\\/\\d+$/.test(path)) return reply(200, { head: { sha: ++pullReads > 1 && cfg.liveHeadLater ? cfg.liveHeadLater : cfg.liveHead }, base: { ref: cfg.baseRef || "main" }, changed_files: cfg.files.length });
  if (/\\/pulls\\/\\d+\\/files$/.test(path)) return reply(200, cfg.files);
  if (/\\/issues\\/\\d+\\/comments$/.test(path)) return reply(200, cfg.comments || []);
  return reply(404, {});
};`);

const HEAD = "a".repeat(40);
let n = 0;
const file = (filename) => ({ filename, status: "modified" });
const approve = (sha = HEAD, user = { login: OWNER.login, id: OWNER.id, type: "User" }, edited = false) => ({ id: 900 + n, user, body: `/owner-approve ${sha}`, created_at: "2026-09-24T00:00:00Z", updated_at: edited ? "2026-09-24T00:09:00Z" : "2026-09-24T00:00:00Z" });
const gate = ({ event = "pull_request_target", ref = "refs/heads/main", appId = APP_ID, key = PRIVATE_PEM, files = [file("lib/x.js")], comments = [], liveHead = HEAD, eventHead = HEAD, onIssue = false, apiStatus = 0, mintFails = false, baseRef, liveHeadLater, attempt = 1 } = {}) => {
  const tag = ++n;
  const log = join(root, `log-${tag}.jsonl`); writeFileSync(log, "");
  const cfgPath = join(root, `cfg-${tag}.json`);
  writeFileSync(cfgPath, JSON.stringify({ publicPem: PUBLIC_PEM, appId: APP_ID, files, comments, liveHead, apiStatus, mintFails, baseRef, liveHeadLater }));
  const eventPath = join(root, `event-${tag}.json`);
  const payload = event === "issue_comment"
    ? { issue: onIssue ? { number: 1500 } : { number: 1500, pull_request: { url: "x" } }, comment: { body: "/owner-approve" } }
    : { pull_request: { number: 1500, head: { sha: eventHead } } };
  writeFileSync(eventPath, JSON.stringify(payload));
  const env = { ...process.env, STUB_CONFIG: cfgPath, STUB_LOG: log, GITHUB_ACTIONS: "true", GITHUB_REF: ref, GITHUB_EVENT_NAME: event, GITHUB_EVENT_PATH: eventPath,
    GITHUB_RUN_ATTEMPT: String(attempt), GITHUB_TOKEN: "workflow-token", GITHUB_REPOSITORY: "wallstreethyena/Wayfind", GITHUB_API_URL: "https://api.github.fixture.invalid", OWNER_GATE_APP_ID: appId, OWNER_GATE_PRIVATE_KEY: key };
  let code = 0; let out = "";
  try { out = execFileSync(process.execPath, ["--import", preload, GATE], { cwd: root, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { code = e.status ?? 1; out = `${e.stdout || ""}${e.stderr || ""}`; }
  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const posted = calls.filter((c) => c.method === "POST" && c.path.endsWith("/check-runs"));
  return { code, out, calls, posted };
};

try {
  // S1: posted as the App, under the pinned name, on the live head.
  let r = gate();
  ok(r.code === 0 && r.posted.length === 1, `S1: an ordinary PR gets exactly one gate check (${r.code}: ${r.out.trim()})`);
  ok(r.posted[0].auth === "Bearer ghs_gate_fixture" && !r.calls.some((c) => c.path.endsWith("/check-runs") && c.auth.includes("workflow-token")),
    "S1: the gate check is created with the App's installation token, never with the workflow's GITHUB_TOKEN");
  ok(r.posted[0].body.name === "owner-approval-gate" && r.posted[0].body.head_sha === HEAD && r.posted[0].body.conclusion === "success" && r.posted[0].body.status === "completed",
    `S1: check name "owner-approval-gate", on the live head, concluded success (${JSON.stringify(r.posted[0].body).slice(0, 160)})`);
  const mint = r.calls.find((c) => c.path.endsWith("/access_tokens"));
  ok(mint && JSON.stringify(mint.body.permissions) === JSON.stringify({ checks: "write" }) && JSON.stringify(mint.body.repositories) === JSON.stringify(["Wayfind"]),
    "S1: the installation token is narrowed to checks:write on this one repository");

  // S2: never on a pull request's own ref or event.
  r = gate({ event: "pull_request" });
  ok(r.code === 1 && r.posted.length === 0 && !r.calls.some((c) => c.path.includes("access_tokens")), `S2: a pull_request run (the PR's own code) is refused before any token is minted (${r.out.trim()})`);
  r = gate({ ref: "refs/pull/1500/merge" });
  ok(r.code === 1 && r.posted.length === 0 && r.calls.length === 0, `S2: a run on a pull request ref is refused before any call (${r.out.trim()})`);
  r = gate({ event: "push" });
  ok(r.code === 1 && r.posted.length === 0, "S2: any other event is refused");
  r = gate({ attempt: 2, files: [file("CLAUDE.md")], comments: [approve()] });
  ok(r.code === 1 && r.posted.length === 0 && !r.calls.some((c) => c.path.includes("access_tokens")), "S2: a re-run (which would check out an OLD main and its older rule) is refused before any token is minted");

  // S3: the spoof itself — a PR adding a workflow with a job named like a required check.
  r = gate({ files: [file(".github/workflows/fake-owner-approval.yml")] });
  ok(r.posted.length === 1 && r.posted[0].body.conclusion === "failure" && /\.github\/workflows\/fake-owner-approval\.yml/.test(r.posted[0].body.output.summary),
    `S3: a PR that adds a workflow gets a FAILING gate check without the owner's approval (${r.posted[0] && r.posted[0].body.output.summary.slice(0, 120)})`);
  r = gate({ files: [file(".github/workflows/owner-approval-gate.yml"), file("scripts/owner-approval-gate.mjs"), file("scripts/lib/ownerApproval.mjs")] });
  ok(r.posted.length === 1 && r.posted[0].body.conclusion === "failure", "S3: a PR that edits the gate itself is judged by main's gate and fails without approval");
  ok(isOwnerOnly(".github/workflows/anything.yml") && isOwnerOnly(".github/dependabot.yml") && isOwnerOnly(".GitHub/workflows/x.yml") && isOwnerOnly("scripts/owner-approval-gate.mjs") && isOwnerOnly("scripts/lib/githubAppAuth.mjs"),
    "S3: everything under .github/ and the gate's own code is owner-only");

  // S4: the verdict is the owner rule.
  r = gate({ files: [file("CLAUDE.md")] });
  ok(r.posted.length === 1 && r.posted[0].body.conclusion === "failure" && r.posted[0].body.output.title === "Owner approval required", "S4: owner-only change without approval: failing gate check");
  r = gate({ files: [file("CLAUDE.md")], comments: [approve()] });
  ok(r.posted.length === 1 && r.posted[0].body.conclusion === "success" && r.posted[0].body.output.title === "Approved by the owner", "S4: the owner's full-sha comment passes");
  r = gate({ files: [file("CLAUDE.md")], comments: [approve(HEAD.slice(0, 12)), approve(HEAD, { login: OWNER.login, id: OWNER.id, type: "Bot" }), approve(HEAD, { login: "wayfind-agents[bot]", id: 5, type: "Bot" }), approve(HEAD, { login: OWNER.login, id: OWNER.id + 1, type: "User" })] });
  ok(r.posted.length === 1 && r.posted[0].body.conclusion === "failure", "S4: a shortened sha, a bot, the agents' App, and a look-alike account all fail");
  r = gate({ event: "issue_comment", files: [file("CLAUDE.md")], comments: [approve(HEAD, undefined, true)] });
  ok(r.posted.length === 1 && r.posted[0].body.conclusion === "failure", "S4: an owner comment EDITED to name the head (anyone with write access can edit it) does not approve");
  r = gate({ event: "issue_comment", files: [file("CLAUDE.md")], comments: [approve()] });
  ok(r.code === 0 && r.posted.length === 1 && r.posted[0].body.conclusion === "success" && r.posted[0].body.head_sha === HEAD, "S4: an approval comment re-evaluates the live head and posts success");
  r = gate({ event: "issue_comment", onIssue: true });
  ok(r.code === 0 && r.posted.length === 0 && r.calls.length === 0, "S4: a comment on a plain issue does nothing");
  r = gate({ eventHead: "b".repeat(40) });
  ok(r.code === 0 && r.posted.length === 0, "S4: a run for an older head posts nothing; the run for the new head decides");
  r = gate({ baseRef: "release" });
  ok(r.code === 0 && r.posted.length === 0, "S4: a PR into another branch is not gated (branch protection is on main)");

  // S5: fail closed.
  r = gate({ apiStatus: 502, files: [file("CLAUDE.md")] });
  ok(r.code === 1 && r.posted.length === 1 && r.posted[0].body.conclusion === "failure" && /could not be verified/.test(r.posted[0].body.output.title),
    `S5: an API error posts a FAILING gate check and exits 1 (${r.out.trim().slice(0, 140)})`);
  r = gate({ mintFails: true });
  ok(r.code === 1 && r.posted.length === 0, "S5: if the App token cannot be minted, nothing is posted and the run fails");
  r = gate({ key: other });
  ok(r.code === 1 && r.posted.length === 0, "S5: a key that is not the App's key cannot post (GitHub rejects its JWT)");
  r = gate({ appId: "", key: "" });
  ok(r.code === 0 && r.posted.length === 0 && r.calls.length === 0 && /NOT CONFIGURED/.test(r.out), "S5: before the App exists nothing is posted, so a required gate check stays missing (blocked)");
  r = gate({ appId: APP_ID, key: "" });
  ok(r.code === 1 && r.posted.length === 0 && /half configured/.test(r.out), "S5: half a configuration is an error");
  r = gate({ files: [file("lib/x.js")], liveHeadLater: "c".repeat(40) });
  ok(r.code === 1 && r.posted.every((p) => p.body.conclusion === "failure" && p.body.head_sha === HEAD), "S5: a head that moves mid-read never posts success and the run fails (the new head's own run decides)");
} finally {
  rmSync(root, { recursive: true, force: true });
}

// ── 3. S6: the workflow cannot leak the key ────────────────────────────────
const WF_DIR = join(REPO, ".github", "workflows");
const wfFiles = readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f));
const code = (f) => readFileSync(join(WF_DIR, f), "utf8").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
{
  const g = code("owner-approval-gate.yml");
  const triggers = (g.match(/^on:\n((?:\s{2}\S.*\n(?:\s{4}.*\n)*)*)/m) || [, ""])[1].match(/^\s{2}([a-z_]+):/gm).map((t) => t.trim().replace(":", "")).sort();
  ok(JSON.stringify(triggers) === JSON.stringify(["issue_comment", "pull_request_target"]), `S6: only pull_request_target and issue_comment, which GitHub runs from main (${triggers.join(", ")})`);
  ok(/environment:\s*\n\s+name:\s*owner-gate\s*\n\s+deployment:\s*false/.test(g), "S6: the key comes only from the owner-gate environment, with no deployment object");
  ok(/permissions:\s*\n\s+contents:\s*read\s*\n\s+pull-requests:\s*read\s*\n\s+issues:\s*read/.test(g) && !/:\s*write/.test(g) && !/write-all/.test(g), "S6: the workflow's own GITHUB_TOKEN is read-only (the App token is the only writer)");
  ok(/persist-credentials:\s*false/.test(g) && !/^\s*ref:/m.test(g) && !/github\.event\.pull_request\.head/.test(g) && !/repository:/.test(g) && !/\b(npm|npx|yarn|pnpm)\b/.test(g),
    "S6: main is checked out, never the pull request, and nothing is installed");
  const exprs = [...g.matchAll(/\$\{\{([^}]*)\}\}/g)].map((m) => m[1].trim()).sort();
  ok(JSON.stringify(exprs) === JSON.stringify(["github.event.pull_request.number || github.event.issue.number", "github.token", "secrets.OWNER_GATE_PRIVATE_KEY", "vars.OWNER_GATE_APP_ID"].sort()) && !/run:\s*[|>]/.test(g),
    `S6: the only expressions are the PR number (concurrency), the token, the App id and the key, and there is no multi-line shell (${exprs.join(" ; ")})`);
  const uses = [...g.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  ok(uses.length === 2 && uses.every((u) => /@[0-9a-f]{40}$/.test(u)), `S6: every action is pinned to a full commit sha (${uses.join(", ")})`);
  ok(/contains\(github\.event\.comment\.body, '\/owner-approve'\)/.test(g) && /contains\(github\.event\.changes\.body\.from, '\/owner-approve'\)/.test(g),
    "S6: editing or deleting an approval comment re-evaluates the gate (the old body is matched too)");
  ok(/run:\s*node scripts\/owner-approval-gate\.mjs\s*$/m.test(g) && /name:\s*owner-gate-runner/.test(g) && !/name:\s*owner-approval-gate\s*$/m.test(g.split("jobs:")[1] || ""),
    "S6: the runner job has its own name; only the App posts the check named owner-approval-gate");
}

// ── 4. S7: nothing else can reach the gate or reuse a required check name ──
{
  const others = wfFiles.filter((f) => f !== "owner-approval-gate.yml");
  const leaks = others.filter((f) => /owner-gate|OWNER_GATE_/.test(code(f)));
  ok(leaks.length === 0, `S7: no other workflow names the owner-gate environment or its secret (${leaks.join(", ") || "none"})`);
  const jobNames = (f) => [...code(f).matchAll(/^\s{4}name:\s*(\S+)\s*$/gm)].map((m) => m[1]).concat([...(code(f).split("jobs:")[1] || "").matchAll(/^\s{2}([\w-]+):\s*$/gm)].map((m) => m[1]));
  const owners = { guards: "guards.yml", "owner-approval": "owner-approval.yml", "owner-approval-gate": null };
  const clashes = [];
  for (const f of wfFiles) for (const name of new Set(jobNames(f))) if (name in owners && owners[name] !== f) clashes.push(`${f}:${name}`);
  ok(clashes.length === 0, `S7: "guards" and "owner-approval" come from exactly one workflow each, and no workflow job is named "owner-approval-gate" (${clashes.join(", ") || "none"})`);
}

const EXPECTED = 38;
if (checks !== EXPECTED) {
  console.error(`test-owner-approval-gate: FAIL — ran ${checks} assertions, expected exactly ${EXPECTED}; a proof was skipped or added without review.`);
  process.exit(1);
}
console.log(`test-owner-approval-gate: OK — ${checks} assertions: the gate check is posted only with the Owner Gate App's token (RS256 JWT verified), never from a pull request's ref or event, a PR adding a workflow is refused without the owner, the owner rule decides, it fails closed, and no other workflow can reach the key or reuse a required check name`);
