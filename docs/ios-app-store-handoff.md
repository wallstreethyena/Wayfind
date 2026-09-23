# Wayfind iOS: App Store handoff

2026-09-23. Written for Gabe. Plain language, short steps.

This PR takes the code side of the iPhone app to "ready to submit". What is left
needs your Apple login, your Apple keys, or a click in App Store Connect. Those
steps are listed below in the order you should do them.

---

## 1. What this PR changed

**Delete account, inside the app.** Account sheet (tap the round button with your
initial in the top bar) → "Delete account" → type `delete` → "Delete my account".
It removes the account, saved spots, lists, likes, photos and reviews, taste
profile, feedback, marketing email signups and this device's push token, then
signs you out. If you signed in with Apple, Apple shows its sheet once more so
Wayfind can also cancel the Sign in with Apple link (Apple requires this). If you
cancel that sheet, nothing is deleted.

**Real push notifications, both sides.**
- The app now actually receives a device token (the iOS code that hands the token
  to the app was missing, which is why the token table was always empty).
- The app no longer asks for notification permission the moment it opens. It
  shows a Wayfind card "Get Weekend Picks near you" on the second launch or right
  after a first sign in, and only asks iOS if you tap "Turn on".
- Signing in links the phone's token to your account.
- Tapping a notification opens the page it points to.
- The server can send through Apple (APNs) with `lib/apns.js`. Dead tokens are
  cleaned up automatically.
- A test path: `POST /api/push/test` (details in section 4).
- "Weekend Picks Near You" goes out Fridays at 11 AM Eastern, but only after you
  switch it on (`WEEKEND_PICKS_PUSH_ENABLED=1`). It is OFF by default.

**Offline screen.** If the app opens with no connection, it shows a branded
"You're offline" screen with a "Try again" button and reconnects on its own when
the connection returns, then puts you back on the page you were on. If the
connection drops while the app is open, the same screen covers the app and goes
away by itself when you are back online.

**iOS project fixes found in the audit.**
- iPhone only for v1 (portrait only, modern 64 bit devices). iPad can come later.
- The app rating prompt plugin was never switched on; now it is.
- The app no longer tries to build its first screen twice at launch.
- The privacy file now also lists the device ID (push token) and user content
  (reviews and photos) that the app stores.
- Sign in with Apple now hands over the one time code needed to cancel the Apple
  link on account deletion.

---

## 2. What you have to provide (Apple Developer portal)

Team ID is `VZGMT57ND7`. Bundle ID is `com.gowayfind.app`.

1. **App ID capabilities.** Identifiers → `com.gowayfind.app` → make sure these
   are ticked: Push Notifications, Sign In with Apple, Associated Domains.
2. **APNs key (for push).** Keys → "+" → tick "Apple Push Notifications service
   (APNs)" → download the `.p8` file (you can only download it once) and note the
   Key ID.
3. **Sign in with Apple key (for account deletion).** Keys → "+" → tick "Sign in
   with Apple" → Configure → pick the `com.gowayfind.app` App ID → download the
   `.p8` and note the Key ID. (One key can carry both APNs and Sign in with Apple;
   two separate keys is also fine.)

## 3. What you have to put in Vercel (Project Settings → Environment Variables, Production)

Never put these in the code or in git.

| Name | Value |
|---|---|
| `APNS_TEAM_ID` | `VZGMT57ND7` |
| `APNS_KEY_ID` | Key ID of the APNs key |
| `APNS_AUTH_KEY` | full text of the APNs `.p8` file |
| `APNS_TOPIC` | `com.gowayfind.app` |
| `APNS_ENV` | `production` |
| `APPLE_TEAM_ID` | `VZGMT57ND7` |
| `APPLE_SIWA_KEY_ID` | Key ID of the Sign in with Apple key |
| `APPLE_SIWA_PRIVATE_KEY` | full text of that `.p8` file |
| `APPLE_SIWA_CLIENT_ID` | `com.gowayfind.app` |
| `WEEKEND_PICKS_PUSH_ENABLED` | leave unset until you want Friday pushes; `1` turns them on |
| `WEEKEND_PICKS_ALLOWLIST` | optional: comma separated user IDs or device IDs to test Friday pushes on just your phone first |

`CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` already exist in Vercel and are
reused. After adding the variables, redeploy production so they take effect.

Without the APNs values, push test calls answer "unconfigured" and nothing is
sent. Without the Sign in with Apple values, account deletion still works but
cannot cancel the Apple link (the response says `skipped_unconfigured`).

---

## 4. TestFlight, step by step (on your Mac)

1. Fresh copy of the code (your main folder has other work in it):
   ```
   cd ~/Projects/wayfind
   git fetch origin
   git worktree add ../wayfind-ios-release origin/main
   cd ../wayfind-ios-release
   npm ci
   npx cap sync ios
   ```
   `cap sync` copies the offline screen and settings into the Xcode project.
2. Open the project. It uses Swift Package Manager, so there is no
   `.xcworkspace`; open the project file:
   ```
   open ios/App/App.xcodeproj
   ```
3. Click the **App** target → **Signing & Capabilities** → Team: your team
   (`VZGMT57ND7`). Signing is Automatic.
4. At the top, pick **Any iOS Device (arm64)** as the destination.
5. **Product → Archive.** When it finishes, the Organizer opens.
6. **Distribute App → App Store Connect → Upload.** Keep the defaults.
7. In App Store Connect, wait for the build to finish processing, then
   **TestFlight** tab → Internal Testing → add yourself.
8. Every new upload needs a higher build number: App target → General →
   Build (1, 2, 3...). Version stays 1.0 until you ship.

## 5. Test on your real iPhone (TestFlight build)

1. Install from TestFlight. Open the app, close it, open it again (the
   notification card appears on the second launch). Tap **Turn on**, then
   **Allow**.
2. Sign in, so your token is linked to your account.
3. Send yourself a test notification. Easiest: from any terminal with the
   secret set:
   ```
   CRON_SECRET=... node scripts/push-test.mjs --url https://www.gowayfind.com --user <your user id> --path /florida-events
   ```
   Your user id is in Supabase (`auth.users`). Or find the token with:
   ```sql
   select token, user_id, created_at from device_push_tokens order by created_at desc limit 5;
   ```
   and use `--token <token>` instead of `--user`.
4. Tap the notification. It should open the `--path` page inside the app.
5. Offline: turn on Airplane Mode inside the app → the "You're offline" screen
   appears. Turn Airplane Mode off → it disappears by itself within a few
   seconds. Also try closing the app, turning Airplane Mode on, and opening it:
   you get the same branded screen, never a blank page.
6. Delete account: sign in with a spare Apple ID, Account → Delete account → type
   `delete` → Delete my account. Apple's sheet appears once. You end up signed
   out. Sign in again with the same Apple ID: it should be a brand new, empty
   account.

Important: test push only on the **TestFlight** build. A build you run straight
from Xcode on your phone gets a "sandbox" token, and with `APNS_ENV=production`
Apple rejects it (and Wayfind deletes it as dead). If you ever need to test from
Xcode, temporarily set `APNS_ENV=sandbox` on a preview deployment.

---

## 6. App Store Connect listing

- **App record** for `com.gowayfind.app` (Apps → "+" → New App), name Wayfind,
  primary language English, SKU anything.
- **Screenshots:** iPhone 6.9 inch (iPhone 17 Pro Max simulator works: take them
  with Cmd+S). 3 to 10 images. Show real Wayfind screens (home, a place page, an
  event page with its map, saved spots).
- **Privacy Policy URL:** `https://www.gowayfind.com/privacy`.
  **Support URL:** your contact page or a mailto page.
- **Category:** Travel (secondary Food & Drink).
- **Age rating:** answer honestly; bars and nightlife listings usually mean
  "Infrequent/Mild Alcohol, Tobacco, or Drug Use or References" (12+).
- **App Privacy (nutrition labels).** Match `ios/App/App/PrivacyInfo.xcprivacy`:
  Contact Info (email, name), Identifiers (user ID, device ID), Location (precise),
  User Content (photos, reviews), Usage Data / Diagnostics (analytics, crash). All
  "linked to the user", all "not used for tracking", purpose App Functionality
  (plus Analytics for usage data).
- **Review notes** (paste and fill in):
  > Wayfind is a local discovery app for Florida. Native features: push
  > notifications (Weekend Picks), Sign in with Apple, native camera and photo
  > picker for reviews, native share sheet, universal links, and an offline
  > screen. To delete an account: sign in, tap the round button with your
  > initial in the top bar, then "Delete account". Demo login: <email> /
  > <password>.
  Create that demo login yourself (email and password account) before
  submitting.
- **Export compliance** is already answered in the app (standard HTTPS only).

---

## 7. What is blocking the TestFlight upload right now

Only things that need you:
1. Merge this PR (production needs the new server routes and pages, because the
   app loads the live site).
2. App ID capabilities ticked (section 2, step 1).
3. APNs key and Sign in with Apple key created and added to Vercel (sections 2
   and 3), then a production redeploy.
4. Xcode signed into your Apple account with the team selected, then Archive and
   Upload (section 4).
5. App Store Connect app record created (section 6).

Nothing else in the code is waiting.

---

## 8. Known limits (not blockers)

- **Bare `gowayfind.com` links open in Safari, not the app.** Vercel redirects
  the bare domain to `www`, and Apple will not follow a redirect when checking
  app links. `www.gowayfind.com` links open in the app. To fix later: in Vercel,
  serve the bare domain without the redirect, or remove `gowayfind.com` from the
  app's associated domains.
- **Google sign in users:** deletion removes everything on Wayfind's side; Google
  itself keeps no Wayfind token to cancel.
- **Weekend Picks is off** until you set `WEEKEND_PICKS_PUSH_ENABLED=1`. The
  in-app card already promises Friday picks, so switch it on before public launch.
- **iPad** is off for v1 on purpose.

## 9. How this was verified

- All guard checks green (`npm run prebuild`), production build green, page size
  491.2 KB of the 498 KB budget.
- New checks: `test-account-delete`, `check-apns-sender`, `check-ios-shell-wiring`,
  updated `check-push-registration`, `check-ios-device-family`,
  `check-ios-privacy-manifest`. Each includes a proof that it fails when the thing
  it protects is broken.
- Browser runs at iPhone size: the offline screen, Try again, automatic recovery
  to the saved page, the in-app offline cover (shows only in the app, never on the
  website), and a hostile saved path being refused.
- Xcode simulator build and run: see the PR description for the results.
