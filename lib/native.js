"use client";
// lib/native.js — Capacitor native-shell integration.
//
// EVERY export below is a no-op on the regular website. Each one checks
// Capacitor.isNativePlatform() first, so importing this file has ZERO effect
// on gowayfind.com in an ordinary browser tab. It only does anything inside
// the iOS wrapper (ios/App), where Capacitor injects its native bridge into
// the same WebView that loads this site (capacitor.config.ts server.url) —
// meaning this SAME Next.js bundle runs in both places, and the plugin calls
// below only resolve to something real when the bridge is present.
//
// WHY THIS FILE EXISTS AT ALL: Apple App Store guideline 4.2 ("Minimum
// Functionality") rejects an app that is just a website in a native frame.
// A wrapped remote-URL app clears that bar only if it does real native
// things a browser tab cannot — push notifications, the native camera/photo
// picker, the native share sheet, native deep-link handling. That is what
// this module wires, not decoration.
import { Capacitor, registerPlugin } from "@capacitor/core";

const AppleSignIn = registerPlugin("AppleSignIn");

export const isNative = () => {
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch (e) {}
  // Remote-url Capacitor apps can render before the injected bridge finishes
  // reporting its platform. iOS adds this marker before the first request, so
  // native-only UI is stable on the first render instead of racing the bridge.
  try { return /(?:^|\s)WayfindNative\/\d/i.test(navigator.userAgent || ""); } catch (e) { return false; }
};

function randomNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Uses Apple's native AuthenticationServices sheet, then returns the verified
// identity token plus the raw nonce Supabase needs to validate it. The hashed
// nonce goes to Apple; sending that same hash to Supabase would make every
// otherwise-valid login fail nonce verification.
export async function nativeAppleCredential() {
  if (!isNative()) return null;
  if (!globalThis.crypto || !crypto.getRandomValues || !crypto.subtle) {
    throw new Error("Secure Apple sign-in is unavailable on this device");
  }

  const rawNonce = randomNonce();
  const hashedNonce = await sha256(rawNonce);
  const response = await AppleSignIn.authorize({ nonce: hashedNonce });
  if (!response || !response.identityToken) throw new Error("Apple did not return an identity token");
  return { token: response.identityToken, nonce: rawNonce, profile: response };
}

const NATIVE_OAUTH_CALLBACK = "wayfind://auth/callback";

// Opens provider OAuth in iOS's secure browser sheet, then consumes the
// Supabase redirect when iOS returns to wayfind://auth/callback. Google blocks
// authentication inside embedded web views, so the ordinary web redirect is
// not a valid native implementation.
export async function nativeOAuthSignIn(supabase, provider) {
  if (!isNative()) return null;
  if (!supabase) throw new Error("Authentication is unavailable");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: NATIVE_OAUTH_CALLBACK, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data || !data.url) throw new Error(`${provider} did not return a sign-in URL`);

  const { App } = await import("@capacitor/app");
  const { Browser } = await import("@capacitor/browser");

  return new Promise(async (resolve, reject) => {
    let listener = null;
    let settled = false;
    const finish = async (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { if (listener) await listener.remove(); } catch (e) {}
      try { await Browser.close(); } catch (e) {}
      callback();
    };
    const timeout = setTimeout(() => {
      finish(() => reject(new Error(`${provider} sign-in timed out`)));
    }, 120000);

    try {
      listener = await App.addListener("appUrlOpen", async ({ url }) => {
        if (!url || !url.startsWith(NATIVE_OAUTH_CALLBACK)) return;
        try {
          const callbackUrl = new URL(url);
          const params = new URLSearchParams(callbackUrl.hash.replace(/^#/, ""));
          const query = callbackUrl.searchParams;
          const oauthError = params.get("error_description") || query.get("error_description") || params.get("error") || query.get("error");
          if (oauthError) throw new Error(oauthError);

          const code = query.get("code");
          let result;
          if (code) {
            result = await supabase.auth.exchangeCodeForSession(code);
          } else {
            const accessToken = params.get("access_token");
            const refreshToken = params.get("refresh_token");
            if (!accessToken || !refreshToken) throw new Error(`${provider} did not return a session`);
            result = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          }
          if (result.error) throw result.error;
          await finish(() => resolve(result.data && result.data.session));
        } catch (callbackError) {
          await finish(() => reject(callbackError));
        }
      });
      await Browser.open({ url: data.url, presentationStyle: "popover" });
    } catch (openError) {
      await finish(() => reject(openError));
    }
  });
}

// Splash hide + status bar + deep-link listener. Call once, high in the tree
// (see app/components/NativeShellInit.js). onDeepLink receives a same-origin
// path ("/p/abc123") so the caller can route with next/navigation's router —
// this module never touches routing itself, to stay framework-agnostic.
export async function initNativeShell({ onDeepLink } = {}) {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch (e) {}
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
  } catch (e) {}
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("appUrlOpen", (data) => {
      try {
        const url = new URL(data.url);
        if (url.protocol === "wayfind:" && url.host === "auth" && url.pathname === "/callback") return;
        // Universal links (https://www.gowayfind.com/p/abc) and the custom
        // scheme (wayfind://p/abc) both parse to a usable pathname here.
        if (onDeepLink) onDeepLink((url.pathname || "/") + (url.search || ""));
      } catch (e) {}
    });
  } catch (e) {}
}

// ─── Push notifications (owner Gabe, 2026-09-23 launch hardening) ──────────
//
// THREE DEFECTS THE SHAPE BELOW EXISTS TO CLOSE, all present in the previous
// version of this file:
//   1. register() was called BEFORE the "registration" listener was added —
//      a race where Capacitor could resolve registration before anything
//      was listening for it, silently dropping the token.
//   2. no pushNotificationActionPerformed handler at all — a tap on a
//      delivered notification did nothing; APNs' custom `url` key never
//      reached the router.
//   3. permission was requested unconditionally, at app boot
//      (NativeShellInit), with zero context — see that file for the
//      contextual-prompt replacement.
//
// getPushPermission() / requestPushPermission() are the READ and the ASK,
// kept separate on purpose: NativeShellInit's boot path only ever reads
// (never prompts), and the contextual PushPrompt card is the only caller of
// requestPushPermission(). registerPushNotifications() is now permission-
// READ-only — it adds listeners unconditionally (so a token or a tap is
// never missed once permission IS granted) but only calls register() when
// permission is ALREADY granted; it never itself triggers the OS prompt.
let pushListenersAdded = false;
// Listener callbacks close over this, not over the arguments a given
// registerPushNotifications() call was made with, so calling it twice (or
// calling requestPushPermission() before it) updates who gets notified
// without ever registering a second set of Capacitor listeners.
const pushHandlers = { onToken: null, onTap: null };

// APNs' custom `url` key (this repo's lib/apns.js payload shape: {aps:{...},
// url}) arrives in notification.data.url. Accept only a same-origin path —
// "/p/abc123" — never a full URL or a protocol-relative one, which is what a
// crafted push payload would use to send router.push() somewhere off-site.
// Exported so it can be exercised directly (scripts/check-push-registration.mjs)
// rather than only pattern-matched from source.
export function safeNativeTapPath(raw) {
  if (typeof raw !== "string") return null;
  const path = raw.trim();
  if (!path) return null;
  if (!path.startsWith("/")) return null; // rejects "https://evil.com", relative paths, etc.
  if (path.startsWith("//")) return null; // rejects "//evil.com" (protocol-relative)
  return path;
}

async function ensurePushListeners(PushNotifications) {
  if (pushListenersAdded) return;
  pushListenersAdded = true;
  // All three listeners are added here, before either register() call site
  // below runs — closing defect #1 above structurally, not by convention.
  PushNotifications.addListener("registration", (token) => {
    try { pushHandlers.onToken && pushHandlers.onToken(token.value); } catch (e) {}
  });
  PushNotifications.addListener("registrationError", () => {});
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    try {
      const data = action && action.notification && action.notification.data;
      const path = safeNativeTapPath(data && data.url);
      if (path && pushHandlers.onTap) pushHandlers.onTap(path);
    } catch (e) {}
  });
}

// Reads the CURRENT permission state without ever prompting the user.
// "unsupported" covers web (no plugin) and any plugin failure — treated the
// same as "there is nothing to offer here" by every caller.
export async function getPushPermission() {
  if (!isNative()) return "unsupported";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    const state = perm && perm.receive;
    if (state === "granted") return "granted";
    if (state === "denied") return "denied";
    if (state === "prompt" || state === "prompt-with-rationale") return "prompt";
    return "unsupported";
  } catch (e) {
    return "unsupported";
  }
}

// The ONLY function in this module that triggers the OS permission sheet.
// Called exclusively from the contextual PushPrompt card (never from boot),
// and only ever in response to the person tapping "Turn on".
export async function requestPushPermission() {
  if (!isNative()) return "unsupported";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await ensurePushListeners(PushNotifications);
    const perm = await PushNotifications.requestPermissions();
    const state = perm && perm.receive;
    if (state === "granted") {
      try { await PushNotifications.register(); } catch (e) {}
      return "granted";
    }
    return state === "denied" ? "denied" : "prompt";
  } catch (e) {
    return "unsupported";
  }
}

// Adds listeners (registration / registrationError / tap) and registers for
// push ONLY when permission is already granted — never prompts. Safe to call
// on every native boot: on a signed-out/never-asked device this is a no-op
// past adding listeners, and once permission IS granted it re-arms the token
// flow (e.g. after an app update) without asking again.
//
// onToken(token) receives the raw APNs device token string — storage/sending
// is entirely server-side (lib/apns.js, lib/pushTokens.js); this function's
// job ends at "the device has a real token and handed it to the caller."
// onTap(path) receives a validated same-origin path from a notification tap.
export async function registerPushNotifications(onToken, { onTap } = {}) {
  if (!isNative()) return;
  pushHandlers.onToken = onToken || null;
  pushHandlers.onTap = onTap || null;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await ensurePushListeners(PushNotifications);
    const perm = await PushNotifications.checkPermissions();
    if (perm && perm.receive === "granted") {
      await PushNotifications.register();
    }
  } catch (e) {}
}

// Native share sheet. Returns true if it actually handled the share (so
// callers can fall back to the existing web Share API / clipboard chain on
// failure or on web) — this is additive to lib's existing shareLink(), not a
// replacement for it.
export async function nativeShare({ title, text, url }) {
  if (!isNative()) return false;
  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title, text, url, dialogTitle: title });
    return true;
  } catch (e) { return false; }
}

// Native camera/photo-library picker. Returns a real File object so it slots
// directly into the EXISTING photo-upload path (Detail.js's pendingPhotos
// already expects File/Blob objects from <input type=file> — this is a
// drop-in alternate source, not a parallel upload pipeline) or null if the
// user cancelled or the plugin isn't available (web).
export async function nativePickPhoto({ source = "PROMPT" } = {}) {
  if (!isNative()) return null;
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const srcMap = { PROMPT: CameraSource.Prompt, CAMERA: CameraSource.Camera, PHOTOS: CameraSource.Photos };
    const photo = await Camera.getPhoto({ resultType: CameraResultType.Uri, source: srcMap[source] || CameraSource.Prompt, quality: 85 });
    if (!photo || !photo.webPath) return null;
    const res = await fetch(photo.webPath);
    const blob = await res.blob();
    const ext = (photo.format || "jpeg").toLowerCase();
    return new File([blob], `photo-${Date.now()}.${ext}`, { type: blob.type || `image/${ext}` });
  } catch (e) { return null; }
}
