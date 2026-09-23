"use client";
// Mounted once in app/layout.js, alongside SentryClient/GoogleTags. Renders
// the native-shell init (splash hide, status bar, deep links) plus push
// registration and, contextually, the push opt-in card. A no-op on the
// regular website; see lib/native.js for why every call inside is gated on
// Capacitor.isNativePlatform().
//
// PUSH, 2026-09-23 launch hardening (owner Gabe). Three things changed from
// the previous version:
//   1. registerPushNotifications() no longer prompts at boot — it only
//      reads the current permission and re-arms an already-granted device.
//      The OS permission sheet is asked for in context, by PushPrompt below,
//      never here.
//   2. a tap on a delivered notification now routes — registerPushNotifications's
//      onTap hands back a validated same-origin path (lib/native.js
//      safeNativeTapPath) and this pushes it with the SAME router the deep
//      link handler uses.
//   3. sign-in re-links the token. A token registered while signed out has
//      no user_id; supabase.auth.onAuthStateChange's SIGNED_IN case re-POSTs
//      /api/push/register with the fresh bearer so the server can attach it
//      to the account (app/api/push/register/route.js's wf_register_push_token_server
//      RPC already merges rather than clobbering — see coalesce(excluded.user_id,
//      t.user_id) in its migration — this just makes sure that merge actually
//      fires once a session exists).
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { isNative, initNativeShell, registerPushNotifications, getPushPermission } from "../../lib/native";
import { supabase, hasSupabase } from "../../lib/supabase";
import { deviceId } from "../../lib/deviceId";

// Lazy: this card only ever renders on native, and only for a fraction of
// those sessions (second launch, or right after a first sign-in) — it must
// never cost a byte in the regular website bundle (CLAUDE.md bundle budget).
const PushPrompt = dynamic(() => import("./native/PushPrompt"), { ssr: false });

const TOKEN_KEY = "wf_push_token";
const PROMPTED_KEY = "wf_push_prompted";
const LAUNCHES_KEY = "wf_native_launches";

async function postPushRegister(token, bearer) {
  try {
    const headers = { "content-type": "application/json" };
    if (bearer) headers.authorization = "Bearer " + bearer;
    await fetch("/api/push/register", {
      method: "POST",
      headers,
      body: JSON.stringify({ token, platform: "ios", deviceId: deviceId() }),
    });
  } catch (e) {}
}

export default function NativeShellInit() {
  const router = useRouter();
  const [showPrompt, setShowPrompt] = useState(false);
  const tokenRef = useRef(null);

  useEffect(() => {
    if (!isNative()) return;

    initNativeShell({
      onDeepLink: (path) => { try { router.push(path); } catch (e) {} },
    });

    // Push storage is server-side only. Signed-out devices are allowed because
    // pre-signup re-engagement is a product requirement; signed-in sessions are
    // passed only as bearer tokens and verified by the server. The client never
    // supplies a user id and never receives a service-role credential.
    registerPushNotifications(
      async (token) => {
        tokenRef.current = token;
        try {
          localStorage.setItem(TOKEN_KEY, token);
          window.__wfPushToken = token;
        } catch (e) {}
        let bearer = null;
        if (hasSupabase && supabase) {
          try {
            const { data } = await supabase.auth.getSession();
            bearer = data?.session?.access_token || null;
          } catch (e) {}
        }
        await postPushRegister(token, bearer);
      },
      {
        onTap: (path) => { try { router.push(path); } catch (e) {} },
      }
    );

    // Count native launches (once per mount of this root component, which is
    // once per cold start of the WebView) so the contextual prompt can wait
    // for the SECOND one rather than interrupting the very first run.
    let launches = 0;
    try {
      launches = (parseInt(localStorage.getItem(LAUNCHES_KEY) || "0", 10) || 0) + 1;
      localStorage.setItem(LAUNCHES_KEY, String(launches));
    } catch (e) {}

    maybeShowPushPrompt(launches >= 2);

    let authSub = null;
    if (hasSupabase && supabase) {
      try {
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          if (event !== "SIGNED_IN") return;
          // Re-link: a token saved while signed out (or under a different
          // account) now gets attached to the account that just signed in.
          let known = tokenRef.current;
          if (!known) { try { known = localStorage.getItem(TOKEN_KEY); } catch (e) {} }
          const bearer = session?.access_token || null;
          if (known && bearer) postPushRegister(known, bearer);
          // "after the first sign in" — evaluate again here in case the
          // launch-count trigger above did not already fire.
          maybeShowPushPrompt(true);
        });
        authSub = data?.subscription || null;
      } catch (e) {}
    }

    return () => { try { authSub && authSub.unsubscribe(); } catch (e) {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function maybeShowPushPrompt(eligible) {
    if (!eligible) return;
    try {
      if (localStorage.getItem(PROMPTED_KEY)) return;
    } catch (e) { return; }
    let state = "unsupported";
    try { state = await getPushPermission(); } catch (e) {}
    if (state !== "prompt") return;
    try { localStorage.setItem(PROMPTED_KEY, "1"); } catch (e) {}
    setShowPrompt(true);
  }

  if (!showPrompt) return null;
  return <PushPrompt onClose={() => setShowPrompt(false)} />;
}
