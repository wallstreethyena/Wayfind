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
  try { return Capacitor.isNativePlatform(); } catch (e) { return false; }
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
        // Universal links (https://www.gowayfind.com/p/abc) and the custom
        // scheme (wayfind://p/abc) both parse to a usable pathname here.
        if (onDeepLink) onDeepLink((url.pathname || "/") + (url.search || ""));
      } catch (e) {}
    });
  } catch (e) {}
}

// Requests permission and registers for push. Resolves the APNs device token
// to onToken(token) — storage/sending is a separate, server-side concern
// (see docs/proposals or the push-backend task); this function's job ends at
// "the device has a real token and handed it to the caller."
export async function registerPushNotifications(onToken) {
  if (!isNative()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;
    await PushNotifications.register();
    PushNotifications.addListener("registration", (token) => {
      try { onToken && onToken(token.value); } catch (e) {}
    });
    PushNotifications.addListener("registrationError", () => {});
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
