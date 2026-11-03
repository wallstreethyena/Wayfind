#!/usr/bin/env node
// EXECUTES next.config.js redirects(): /blog and /blog/:path* must permanently
// redirect to https://blog.gowayfind.com (www /blog used to 404, 2026-11).
// Runs in preview and production env modes; positive control proves the matcher
// finds the vercel.app rule, negative control proves it rejects a bogus source.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
process.env.NODE_ENV = "development";
let cfg = require("../next.config.js");
if (typeof cfg === "function") cfg = await cfg("phase-production-build", { defaultConfig: {} });
const fails = [];
const find = (rules, src) => rules.find((r) => r.source === src);
for (const env of [undefined, "preview", "production"]) {
  if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env;
  const rules = await cfg.redirects();
  const tag = `VERCEL_ENV=${env ?? "unset"}`;
  const a = find(rules, "/blog");
  const b = find(rules, "/blog/:path*");
  if (!a || a.permanent !== true || !/^https:\/\/blog\.gowayfind\.com\/?$/.test(a.destination)) fails.push(`${tag}: /blog redirect missing or not permanent to blog host`);
  if (!b || b.permanent !== true || b.destination !== "https://blog.gowayfind.com/:path*") fails.push(`${tag}: /blog/:path* redirect missing or wrong`);
  if (find(rules, "/definitely-not-a-rule")) fails.push("negative control matched");
  if (env === "production" && !rules.some((r) => (r.has || []).some((h) => /vercel\\\.app/.test(h.value || "")))) fails.push("positive control: vercel.app rule not found in production");
}
if (fails.length) { console.error("FAIL check-blog-redirect:\n" + fails.join("\n")); process.exit(1); }
console.log("ok check-blog-redirect: /blog and /blog/:path* permanent to blog.gowayfind.com in unset/preview/production");
