// scripts/lib/githubAppAuth.mjs — authenticate as a GitHub App (free, no Enterprise).
//
// Used by scripts/owner-approval-gate.mjs, which posts the "owner-approval-gate"
// check as the Wayfind Owner Gate App. Branch protection pins that required check
// to the App's id, and GitHub attributes a check run to the App whose installation
// token created it. So only code holding the App's private key can produce a
// passing gate check: a workflow a pull request adds runs with GitHub Actions'
// token (a different app), and the key lives only in the "owner-gate" environment,
// which only workflows running on main can open. See docs/OWNER_APPROVAL.md.
//
// No dependencies: node:crypto signs the RS256 JWT GitHub requires.
import { createPrivateKey, createSign } from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/**
 * The short-lived JWT an App uses to identify itself (GitHub allows at most 10
 * minutes). iat is backdated 60s for clock drift, as GitHub recommends.
 */
export function createAppJwt({ appId, privateKeyPem, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const id = String(appId || "").trim();
  if (!/^\d+$/.test(id)) throw new Error("GitHub App id is missing or not numeric");
  let key;
  try { key = createPrivateKey(String(privateKeyPem || "")); } catch { throw new Error("GitHub App private key is missing or not a PEM private key"); }
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: id }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${b64url(signer.sign(key))}`;
}

/**
 * An installation access token for `repo`, narrowed to `permissions` (a token may
 * only ask for a subset of what the App was granted). Throws on any failure.
 */
export async function mintInstallationToken({ api, repo, appId, privateKeyPem, permissions, fetchImpl = globalThis.fetch }) {
  const jwt = createAppJwt({ appId, privateKeyPem });
  const headers = { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  const installation = await fetchImpl(`${api}/repos/${repo}/installation`, { headers, signal: AbortSignal.timeout(15000) });
  if (!installation || !installation.ok) throw new Error(`the App is not installed on ${repo} (HTTP ${installation ? installation.status : "nothing"})`);
  const { id } = await installation.json();
  if (!Number.isSafeInteger(id)) throw new Error("GitHub returned no installation id");
  const repoName = repo.split("/")[1];
  const minted = await fetchImpl(`${api}/app/installations/${id}/access_tokens`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ repositories: [repoName], permissions }),
    signal: AbortSignal.timeout(15000),
  });
  if (!minted || !minted.ok) throw new Error(`could not mint an installation token (HTTP ${minted ? minted.status : "nothing"})`);
  const body = await minted.json();
  if (typeof body.token !== "string" || !body.token) throw new Error("GitHub returned no installation token");
  return body.token;
}
