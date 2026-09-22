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
    // Push storage is server-side only. Signed-out devices are allowed because
    // pre-signup re-engagement is a product requirement; signed-in sessions are
    // passed only as bearer tokens and verified by the server. The client never
    // supplies a user id and never receives a service-role credential.
    registerPushNotifications(async (token) => {
      try {
        const headers = { "content-type": "application/json" };
        if (hasSupabase && supabase) {
          try {
            const { data } = await supabase.auth.getSession();
            const accessToken = data?.session?.access_token;
            if (accessToken) headers.authorization = "Bearer " + accessToken;
          } catch (e) {}
        }
        await fetch("/api/push/register", {
          method: "POST",
          headers,
          body: JSON.stringify({
            token,
            platform: "ios",
            deviceId: deviceId(),
          }),
        });
      } catch (e) {}
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
