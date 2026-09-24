#!/usr/bin/env node
/**
 * agent-github-token — prints a one-hour GitHub token for the Wayfind Agents App,
 * so agents act on GitHub as "wayfind-agents[bot]" instead of the owner's own
 * account (2026-09-24). An owner approval is then something no agent can post.
 *
 *     export GH_TOKEN="$(node scripts/agent-github-token.mjs)"   # gh uses it
 *
 * Reads WAYFIND_AGENT_APP_ID and the private key at WAYFIND_AGENT_APP_KEY
 * (default ~/.config/wayfind-agents/app.pem). This is the AGENTS' App. The Owner
 * Gate App's key never lives on any machine an agent can read; it lives only in
 * the owner-gate environment on GitHub. See docs/OWNER_APPROVAL.md.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mintInstallationToken } from "./lib/githubAppAuth.mjs";

const appId = String(process.env.WAYFIND_AGENT_APP_ID || "").trim();
const keyPath = String(process.env.WAYFIND_AGENT_APP_KEY || "").trim() || join(homedir(), ".config", "wayfind-agents", "app.pem");
const repo = "wallstreethyena/Wayfind";
const api = "https://api.github.com";
try {
  if (!appId) throw new Error("WAYFIND_AGENT_APP_ID is not set");
  const privateKeyPem = readFileSync(keyPath, "utf8");
  const token = await mintInstallationToken({ api, repo, appId, privateKeyPem });
  process.stdout.write(token);
} catch (e) {
  console.error(`agent-github-token: FAIL — ${(e && e.message) || e}`);
  process.exit(1);
}
