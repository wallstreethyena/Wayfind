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
    // Registers for push and stores the device token directly via Supabase
    // (RLS-scoped, same pattern as comments/favorites — no bespoke API route
    // needed). Signed-in tokens carry user_id; signed-out ones carry the
    // existing first-party device_id so re-engagement still works pre-signup.
    // Storage only — sending is a separate, server-side concern (APNs key +
    // a job that reads this table). Fire-and-forget, fail-soft: a push token
    // that never lands is a missed re-engagement channel, never a broken app.
    registerPushNotifications(async (token) => {
      if (!hasSupabase || !supabase) return;
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id || null;
        await supabase.from("device_push_tokens").upsert(
          { token, platform: "ios", user_id: uid, device_id: deviceId(), updated_at: new Date().toISOString() },
          { onConflict: "token" }
        );
      } catch (e) {}
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
