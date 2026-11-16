#!/usr/bin/env node
// EXECUTES next.config.js redirects(): /blog and /blog/:path* must permanently
// redirect to https://blog.gowayfind.com (www /blog used to 404, 2026-11).
// Each env mode (unset / preview / production) runs in its own child process,
// the same way scripts/check-canon.mjs reads the live rule list, so a config
// that reads VERCEL_ENV at module load is exercised the way Vercel loads it.
// Positive control proves the matcher finds the vercel.app host rule in
// production, negative control proves it rejects a bogus source.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];
const find = (rules, src) => rules.find((r) => r.source === src);

function liveRedirects(env) {
  const childEnv = { ...process.env, NODE_ENV: "development" };
  if (env === undefined) delete childEnv.VERCEL_ENV; else childEnv.VERCEL_ENV = env;
  const out = execFileSync(process.execPath, [
    "-e",
    "const c=require('./next.config.js'); Promise.resolve(typeof c==='function'?c('phase-production-build',{defaultConfig:{}}):c).then(cfg=>cfg.redirects()).then(x=>process.stdout.write(JSON.stringify(x)))",
  ], { cwd: ROOT, env: childEnv, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  const rules = JSON.parse(out);
  if (!Array.isArray(rules) || !rules.length) throw new Error("redirects() returned no rules");
  return rules;
}

for (const env of [undefined, "preview", "production"]) {
  const rules = liveRedirects(env);
  const tag = `VERCEL_ENV=${env ?? "unset"}`;
  const a = find(rules, "/blog");
  const b = find(rules, "/blog/:path*");
  if (!a || a.permanent !== true || !/^https:\/\/blog\.gowayfind\.com\/?$/.test(a.destination)) fails.push(`${tag}: /blog redirect missing or not permanent to blog host`);
  if (!b || b.permanent !== true || b.destination !== "https://blog.gowayfind.com/:path*") fails.push(`${tag}: /blog/:path* redirect missing or wrong`);
  if (find(rules, "/definitely-not-a-rule")) fails.push("negative control matched");
  if (env === "production" && !rules.some((r) => (r.has || []).some((h) => /vercel\\\.app/.test(h.value || "")))) fails.push("positive control: vercel.app rule not found in production");
}
if (fails.length) { console.error("FAIL check-blog-redirect:\n" + fails.join("\n")); process.exit(1); }
console.log("ok check-blog-redirect: /blog and /blog/:path* permanent to blog.gowayfind.com in unset/preview/production (3 child-process runs of the real redirects())");
