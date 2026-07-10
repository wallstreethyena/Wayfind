// Guardrail: the account-recovery contract. Users must always have a path
// back into their account.
import { readFileSync } from "fs";
const s = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const fail = (m) => { console.error("check-auth: FAIL — " + m); process.exit(1); };
if (!s.includes('_event === "PASSWORD_RECOVERY"')) fail("PASSWORD_RECOVERY handler missing");
if (!s.includes("resetPasswordForEmail")) fail("forgot-password sender missing");
if (!s.includes("redirectTo: CANON_ORIGIN")) fail("reset email not pinned to canonical domain");
if (!s.includes("updateUser({ password: newPw })")) fail("set-new-password action missing");
if (!s.includes("Forgot password?")) fail("Forgot password link missing from sign-in sheet");
if (!s.includes("Set a new password")) fail("recovery sheet UI missing");
console.log("check-auth: OK — forgot-password link, recovery handler, new-password sheet, canonical redirect");
