// Guardrail: the account-recovery contract. Users must always have a path
// back into their account.
import { readFileSync } from "fs";
import { shellSrc } from "./lib/shellSrc.mjs";
const s = shellSrc(); // G0: greps the whole home shell (home.js + kit + screens + sheets)
const native = readFileSync(new URL("../lib/native.js", import.meta.url), "utf8");
const appleNative = readFileSync(new URL("../ios/App/App/AppleSignInPlugin.swift", import.meta.url), "utf8");
const entitlements = readFileSync(new URL("../ios/App/App/App.entitlements", import.meta.url), "utf8");
const xcodeProject = readFileSync(new URL("../ios/App/App.xcodeproj/project.pbxproj", import.meta.url), "utf8");
const fail = (m) => { console.error("check-auth: FAIL — " + m); process.exit(1); };
if (!s.includes('_event === "PASSWORD_RECOVERY"')) fail("PASSWORD_RECOVERY handler missing");
if (!s.includes("resetPasswordForEmail")) fail("forgot-password sender missing");
if (!s.includes("redirectTo: CANON_ORIGIN")) fail("reset email not pinned to canonical domain");
if (!s.includes("updateUser({ password: newPw })")) fail("set-new-password action missing");
if (!s.includes("Forgot password?")) fail("Forgot password link missing from sign-in sheet");
if (!s.includes("Set a new password")) fail("recovery sheet UI missing");
if (!s.includes("Continue with Apple")) fail("Sign in with Apple button missing");
if (!s.includes("{nativeShell && (") || !s.includes('signInWithProvider("apple")')) fail("Sign in with Apple must render in the native shell without enabling incomplete web OAuth");
if (!/provider === "apple" && isNative\(\)/.test(s) || !s.includes("signInWithIdToken({")) fail("native Apple credential no longer creates a Supabase session");
if (!s.includes("nonce: credential.nonce")) fail("Supabase Apple exchange no longer verifies the raw nonce");
if (!native.includes("crypto.getRandomValues") || !native.includes('crypto.subtle.digest("SHA-256"')) fail("Apple sign-in nonce is not cryptographically random and hashed");
if (!native.includes("authorize({ nonce: hashedNonce })") || !native.includes("nonce: rawNonce")) fail("Apple must receive the hashed nonce while Supabase receives the raw nonce");
if (!appleNative.includes("ASAuthorizationAppleIDProvider") || !appleNative.includes('request.nonce = call.getString("nonce")') || !appleNative.includes("credential.identityToken")) fail("native AuthenticationServices bridge is incomplete");
if (!entitlements.includes("com.apple.developer.applesignin") || !entitlements.includes("<string>Default</string>")) fail("Sign in with Apple entitlement missing");
if (!xcodeProject.includes("AppleSignInPlugin.swift in Sources") || !xcodeProject.includes("CODE_SIGN_ENTITLEMENTS = App/App.entitlements")) fail("Apple native bridge or entitlements are not attached to the App target");
console.log("check-auth: OK — recovery contract + native Apple credential, nonce verification, entitlement, and Supabase exchange");
