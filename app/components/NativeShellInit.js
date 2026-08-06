"use client";
// Mounted once in app/layout.js, alongside SentryClient/GoogleTags. Renders
// nothing — its only job is to fire the native-shell init (splash hide,
// status bar, deep links, push registration) the moment the app boots. A
// no-op on the regular website; see lib/native.js for why every call inside
// is gated on Capacitor.isNativePlatform().
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNative, initNativeShell, registerPushNotifications } from "../../lib/native";
import { supabase, hasSupabase } from "../../lib/supabase";
import { deviceId } from "../../lib/deviceId";

export default function NativeShellInit() {
  const router = useRouter();
  useEffect(() => {
    if (!isNative()) return;
    initNativeShell({
      onDeepLink: (path) => { try { router.push(path); } catch (e) {} },
    });
    // Registers for push and hands the APNs token to a SECURITY DEFINER RPC.
    //
    // WAS a direct .from("device_push_tokens").upsert(), against a table that
    // DOES NOT EXIST — verified against the live database, not inferred. So
    // every registration since the shell shipped failed silently inside this
    // try/catch, and push has zero tokens in it.
    //
    // The RPC rather than the table, because a directly-writable table needs an
    // INSERT policy permissive enough for a SIGNED-OUT device (tokens are
    // collected pre-signup, which is most of the value), and "anon may insert"
    // on a table of device tokens and user ids is a write surface anyone can
    // spray. The definer function leaves the table unwritable by anon and
    // authenticated and exposes exactly one operation.
    //
    // user_id is NOT passed: the function reads auth.uid() itself. A client
    // that supplies its own user id is a client that can supply someone
    // else's.
    //
    // Storage only — sending is a separate, server-side concern (APNs key + a
    // job that reads this table). Fire-and-forget and fail-soft: a push token
    // that never lands is a missed re-engagement channel, never a broken app.
    // The RPC records its own wf_job_pulse heartbeat, so "zero tokens" can be
    // told apart from "nobody ever called".
    //
    // See supabase/push-token-register.sql. Until that is applied this call
    // fails exactly as the old one did — no regression, and the same silence.
    registerPushNotifications(async (token) => {
      if (!hasSupabase || !supabase) return;
      try {
        await supabase.rpc("wf_register_push_token", {
          p_token: token,
          p_platform: "ios",
          p_device_id: deviceId(),
        });
      } catch (e) {}
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
