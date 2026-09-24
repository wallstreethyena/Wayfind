#!/usr/bin/env node
/**
 * owner-gate-setup-check — verifies, against the live GitHub settings, that the
 * Owner Gate App is wired so that only the owner can satisfy it (2026-09-24).
 *
 * Not a prebuild guard: it reads repository settings (environments, secrets
 * metadata, branch protection), which need an admin-capable token that CI does
 * not have. Run it after setting up or changing the gate:
 *
 *     GH_TOKEN=<admin token> node scripts/owner-gate-setup-check.mjs
 *
 * It never reads a secret's value (GitHub does not return them); it checks names
 * and settings only. Exits 1 when anything is off, listing every problem.
 */
const repo = "wallstreethyena/Wayfind";
const api = "https://api.github.com";
const token = String(process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "").trim();
if (!token) { console.error("owner-gate-setup-check: FAIL — set GH_TOKEN to an admin-capable token"); process.exit(1); }

const get = async (path) => {
  const r = await fetch(`${api}/repos/${repo}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
  return { status: r.status, body: r.ok ? await r.json() : null };
};
const results = [];
const check = (ok, label) => results.push({ ok: Boolean(ok), label });

const env = await get("/environments/owner-gate");
check(env.status === 200, "environment owner-gate exists");
const policy = env.body && env.body.deployment_branch_policy;
check(policy && policy.protected_branches === false && policy.custom_branch_policies === true, "owner-gate admits only listed branches (custom branch policy)");
check(env.body && env.body.can_admins_bypass === false, "administrators cannot bypass owner-gate's rules");
const branches = await get("/environments/owner-gate/deployment-branch-policies");
const names = ((branches.body && branches.body.branch_policies) || []).map((b) => `${b.type || "branch"}:${b.name}`);
check(names.length === 1 && names[0] === "branch:main", `owner-gate branch policy is exactly main (${names.join(", ") || "none"})`);
const envSecrets = await get("/environments/owner-gate/secrets");
check(((envSecrets.body && envSecrets.body.secrets) || []).some((s) => s.name === "OWNER_GATE_PRIVATE_KEY"), "owner-gate holds the OWNER_GATE_PRIVATE_KEY secret");
const envVars = await get("/environments/owner-gate/variables");
const appVar = ((envVars.body && envVars.body.variables) || []).find((v) => v.name === "OWNER_GATE_APP_ID");
const appId = appVar ? Number(appVar.value) : NaN;
check(Number.isSafeInteger(appId) && appId > 0, `owner-gate holds OWNER_GATE_APP_ID (${appVar ? appVar.value : "missing"})`);
const repoSecrets = await get("/actions/secrets");
check(repoSecrets.status === 200 && !((repoSecrets.body && repoSecrets.body.secrets) || []).some((s) => /^OWNER_GATE_/.test(s.name)),
  "the gate key is NOT a repository secret (pull_request workflows could read that)");
const protection = await get("/branches/main/protection/required_status_checks");
const req = (protection.body && protection.body.checks) || [];
const has = (context, app) => req.some((c) => c.context === context && c.app_id === app);
check(protection.body && protection.body.strict === true, "main requires branches to be up to date (strict)");
check(has("guards", 15368) && has("owner-approval", 15368), "main still requires guards and owner-approval from GitHub Actions");
check(Number.isSafeInteger(appId) && has("owner-approval-gate", appId), `main requires owner-approval-gate pinned to the Owner Gate App (app ${Number.isSafeInteger(appId) ? appId : "?"})`);

for (const r of results) console.log(`  ${r.ok ? "ok  " : "FAIL"} ${r.label}`);
const bad = results.filter((r) => !r.ok).length;
if (bad) { console.error(`owner-gate-setup-check: FAIL — ${bad} of ${results.length} settings are not as required`); process.exit(1); }
console.log(`owner-gate-setup-check: OK — ${results.length} settings verified`);
