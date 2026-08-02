// Guardrail: the account-recovery contract. Users must always have a path
// back into their account.
import { readFileSync } from "fs";
import { shellSrc } from "./lib/shellSrc.mjs";
const s = shellSrc(); // G0: greps the whole home shell (home.js + kit + screens + sheets)
const native = readFileSync(new URL("../lib/native.js", import.meta.url), "utf8");
const appleNative = readFileSync(new URL("../ios/App/App/AppleSignInPlugin.swift", import.meta.url), "utf8");
const entitlements = readFileSync(new URL("../ios/App/App/App.entitlements", import.meta.url), "utf8");
const xcodeProject = readFileSync(new URL("../ios/App/App.xcodeproj/project.pbxproj", import.meta.url), "utf8");
const capacitorConfig = readFileSync(new URL("../capacitor.config.ts", import.meta.url), "utf8");
const fail = (m) => { console.error("check-auth: FAIL — " + m); process.exit(1); };
if (!s.includes('_event === "PASSWORD_RECOVERY"')) fail("PASSWORD_RECOVERY handler missing");
if (!s.includes("resetPasswordForEmail")) fail("forgot-password sender missing");
if (!s.includes("redirectTo: CANON_ORIGIN")) fail("reset email not pinned to canonical domain");
if (!s.includes("updateUser({ password: newPw })")) fail("set-new-password action missing");
if (!s.includes("Forgot password?")) fail("Forgot password link missing from sign-in sheet");
if (!s.includes("Set a new password")) fail("recovery sheet UI missing");
if (!s.includes("Continue with Apple")) fail("Sign in with Apple button missing");
if (!/\{\(!isStandalone \|\| nativeShell\) && \(\s*<button onClick=\{\(\) => signInWithProvider\("apple"\)\}/s.test(s)) fail("Sign in with Apple must render on the website and in the native shell");
if (!s.includes("(!isStandalone || nativeShell)") || !s.includes('signInWithProvider("google")')) fail("Google sign-in must render alongside Apple in the native shell");
if (!/provider === "apple" && isNative\(\)/.test(s) || !s.includes("signInWithIdToken({")) fail("native Apple credential no longer creates a Supabase session");
if (!s.includes("nonce: credential.nonce")) fail("Supabase Apple exchange no longer verifies the raw nonce");
if (!native.includes("crypto.getRandomValues") || !native.includes('crypto.subtle.digest("SHA-256"')) fail("Apple sign-in nonce is not cryptographically random and hashed");
if (!native.includes("authorize({ nonce: hashedNonce })") || !native.includes("nonce: rawNonce")) fail("Apple must receive the hashed nonce while Supabase receives the raw nonce");
if (!appleNative.includes("ASAuthorizationAppleIDProvider") || !appleNative.includes('request.nonce = call.getString("nonce")') || !appleNative.includes("credential.identityToken")) fail("native AuthenticationServices bridge is incomplete");
if (!entitlements.includes("com.apple.developer.applesignin") || !entitlements.includes("<string>Default</string>")) fail("Sign in with Apple entitlement missing");
if (!xcodeProject.includes("AppleSignInPlugin.swift in Sources") || !xcodeProject.includes("CODE_SIGN_ENTITLEMENTS = App/App.entitlements")) fail("Apple native bridge or entitlements are not attached to the App target");
if (!xcodeProject.includes('CODE_SIGN_IDENTITY = "Apple Distribution";') || !xcodeProject.includes('PROVISIONING_PROFILE_SPECIFIER = "Wayfind App Store";')) fail("Release signing must use the WAYFIND LLC App Store distribution profile");
if (!native.includes('redirectTo: NATIVE_OAUTH_CALLBACK') || !native.includes('Browser.open({ url: data.url') || !native.includes('App.addListener("appUrlOpen"') || !native.includes("exchangeCodeForSession(code)") || !native.includes("setSession({ access_token: accessToken")) fail("native Google OAuth must use the system browser and consume its callback");
if (!native.includes('const NATIVE_OAUTH_CALLBACK = "wayfind://auth/callback"')) fail("native Google OAuth callback is missing");
if (!readFileSync(new URL("../ios/App/App/Info.plist", import.meta.url), "utf8").includes("<string>wayfind</string>")) fail("iOS custom URL scheme for OAuth callback is missing");
const sceneDelegate = readFileSync(new URL("../ios/App/App/SceneDelegate.swift", import.meta.url), "utf8");
if (!sceneDelegate.includes("registerPluginInstance(AppleSignInPlugin())")) fail("AppleSignIn native plugin must use instance registration because Capacitor ignores type registration while package auto-registration is enabled");
if (!sceneDelegate.includes('plugin(withName: "AppleSignIn") != nil')) fail("iOS must fail at launch if AppleSignIn registration did not actually take effect");
if (!capacitorConfig.includes('appendUserAgent: "WayfindNative/1.0"') || !native.includes("WayfindNative\\/\\d")) fail("native auth UI must have a first-request marker instead of racing Capacitor bridge initialization");
console.log("check-auth: OK — recovery contract + native Google/Apple UI, OAuth callback, Apple nonce verification, plugin registration, entitlement, App Store signing, and Supabase exchange");
