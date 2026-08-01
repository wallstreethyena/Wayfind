import type { CapacitorConfig } from "@capacitor/cli";

// Wayfind iOS wrapper. This is a REMOTE-URL hybrid app on purpose, not a
// static export: Wayfind is a live Next.js app (SSR, API routes, Supabase
// auth, personalization, affiliate redirects) that cannot be meaningfully
// "exported" to static files without breaking almost everything that makes
// it Wayfind. Apple accepts this pattern (App Store guideline 4.2) as long
// as the wrapper adds real native functionality beyond a bare browser —
// which is exactly what the native plugins wired in this project do: push
// notifications, native camera/photo picker for review photos, native share
// sheet, deep-linked opens, and native chrome (splash, status bar). None of
// that is decorative — it is the difference between "a website in a frame"
// and an app that clears review.
const config: CapacitorConfig = {
  appId: "com.gowayfind.app",
  appName: "Wayfind",
  // Points at www/ — a one-line placeholder, NOT the real public/ folder.
  // The CLI schema requires webDir to exist, but this app is remote-URL
  // (server.url below), so nothing in webDir ever renders. Pointing this at
  // the real public/ folder would make every `cap sync` copy 50+MB of
  // already-deployed web assets into ios/App/App/public for no reason.
  webDir: "www",
  server: {
    // Loads the live production site. Swap to a staging URL by exporting
    // CAP_SERVER_URL before `npx cap sync` if you need a pre-prod build.
    url: process.env.CAP_SERVER_URL || "https://www.gowayfind.com",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
    // Apple review guideline 4.2 checklist we're relying on native plugins
    // (not this flag) to satisfy — see the plugin wiring in lib/native.js.
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: "#0D1117",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
