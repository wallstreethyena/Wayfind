# iOS App Store handoff — draft

2026-09-23. Written by the offline/iOS-shell lane of the App Store readiness PR.
This is a DRAFT: the lead finalizes it once the other two lanes (auth/account,
push backend) land. Everything below is either verified against this repo's
current code, or marked as something Gabe has to do himself and cannot be
verified from the repo.

Plain language, short sentences. This is for Gabe, not for another engineer.

---

## 1. What changed in the iOS shell

Four things, all in `ios/App/App` and the Capacitor config, all fixing things
that were silently broken before:

1. **Push notifications now actually register.** `AppDelegate.swift` was
   missing the two callbacks that tell Capacitor a device token arrived (or
   failed to arrive). Without them, the app asked iOS for permission, iOS
   said yes, and the token just evaporated. `device_push_tokens` had zero
   rows, ever. Fixed by adding those two callbacks.
2. **The app rating prompt now works.** `AppRatingPlugin.swift` existed but
   was never registered with Capacitor, so every call to it failed silently.
   `SceneDelegate.swift` now registers it, the same way it already registered
   Sign in with Apple.
3. **The app no longer risks a duplicate screen at launch.** `Info.plist`
   named a storyboard as the app's initial screen, while `SceneDelegate.swift`
   also builds its own screen in code. Both would have tried to run at once.
   The storyboard is no longer named as the initial screen, so only the
   working path (SceneDelegate) runs.
4. **iPhone only for this first release.** Gabe's call, 2026-09-23: launch
   with a clean iPhone build instead of a stretched iPad one, and add iPad
   later. The project setting, the allowed screen rotations, and a required
   device flag were all changed to match, and a guard script
   (`scripts/check-ios-device-family.mjs`) now fails the build if anyone
   changes this without also updating the same comment that explains why.
5. **A real offline screen.** Before this, losing signal (a plane, dead hotel
   wifi, a cold launch with no bars) showed Apple's bare "cannot connect to
   the server" page, which is the fastest way a reviewer decides the app is
   broken. Now there are two matching screens: `www/offline.html` for a hard
   failure to load the app at all, and a native overlay
   (`app/components/NativeOfflineOverlay.js`) for losing the connection
   after the app is already open. Both say "You're offline", both have a
   "Try again" button, and both reconnect on their own the moment the
   network comes back.

None of this needs a Vercel deploy by itself. It needs Gabe to build the app
in Xcode and upload it, same as any other native change (see section 3).

---

## 2. What Gabe has to provide

This repo cannot do any of these. They are either Apple Developer portal
steps, App Store Connect steps, or values that go into Vercel's environment
variables (never into the code).

### 2a. Push notifications (APNs)

1. In the Apple Developer portal, create an **APNs Auth Key** (a `.p8` file).
   Note the **Key ID** shown when you create it.
2. Your **Team ID** is already known: `VZGMT57ND7`.
3. Add these to Vercel's environment variables (Project Settings →
   Environment Variables), not to any file in this repo:
   - `APNS_TEAM_ID` = `VZGMT57ND7`
   - `APNS_KEY_ID` = the Key ID from step 1
   - `APNS_AUTH_KEY` = the full contents of the `.p8` file
   - `APNS_TOPIC` = `com.gowayfind.app`
   - `APNS_ENV` = `production`

### 2b. Sign in with Apple

1. In the Apple Developer portal, create a **Sign in with Apple key**
   (a separate `.p8` file from the push one). Note its **Key ID**.
2. Add these to Vercel:
   - `APPLE_TEAM_ID` = `VZGMT57ND7`
   - `APPLE_SIWA_KEY_ID` = the Key ID from step 1
   - `APPLE_SIWA_PRIVATE_KEY` = the full contents of that `.p8` file
   - `APPLE_SIWA_CLIENT_ID` = `com.gowayfind.app`

### 2c. Weekend Picks push flags

- `WEEKEND_PICKS_PUSH_ENABLED` and `WEEKEND_PICKS_ALLOWLIST` — set these in
  Vercel when the push backend lane is ready to turn the feature on. Leave
  them unset until then; the code treats "unset" as "off."

### 2d. App ID capabilities (Apple Developer portal)

On the `com.gowayfind.app` App ID, turn on:
- Push Notifications
- Sign In with Apple
- Associated Domains

These are entitlements the code already asks for
(`ios/App/App/App.entitlements`). If the App ID itself does not have the
capability turned on, Xcode's automatic signing will fail to create a
matching profile at archive time, and you will not find out until you try to
archive.

### 2e. App Store Connect

- Create the app record for `com.gowayfind.app`, if it does not exist yet.
- **Screenshots:** at least one set at 6.9 inch iPhone size (iPhone 16 Pro
  Max / 15 Pro Max simulator or a real device that size). This is the only
  size Apple currently requires for an iPhone-only submission.
- **Privacy nutrition labels:** must match `ios/App/App/PrivacyInfo.xcprivacy`
  exactly. That file already lists what this app actually collects (email,
  name, user ID, location, photos, product analytics, crash/performance
  data) — use it as the answer key when filling out the App Store Connect
  privacy questionnaire, category by category.
- **Age rating questionnaire.**
- **Review notes.** Apple's reviewer needs two things spelled out in the
  notes box or they will bounce the build asking for them:
  - **How to find Delete Account.** Tap the account icon (top right, the
    circle with your initial) → Account → Delete Account. It asks you to
    type "delete" to confirm.
  - **A demo login.** Create one throwaway account (email/password or a test
    Apple ID) that the reviewer can sign in with directly, so they are not
    stuck at a sign-in wall.
- **D-U-N-S number / organization enrollment.** Only relevant if the Apple
  Developer account is not already enrolled as an organization. If Gabe is
  enrolled as an individual, skip this.

---

## 3. TestFlight, step by step, on Gabe's Mac

This assumes the Mac environment already confirmed working: Xcode 26.6, iOS
26.5 simulators, `node` and `gh` available, repo at `~/Projects/wayfind`.

1. **Work in a fresh worktree**, not the dirty main clone — this repo's own
   `CLAUDE.md` rule, and it matters here too since two other lanes may still
   be committing.
   ```
   cd ~/Projects/wayfind
   git fetch origin
   git worktree add ../wayfind-ios-release origin/main
   cd ../wayfind-ios-release
   ```
2. **Install dependencies.**
   ```
   npm ci
   ```
3. **Sync the native project.** This copies `capacitor.config.ts`'s settings
   and the `www/` folder (including `offline.html`) into the Xcode project,
   and regenerates `ios/App/App/capacitor.config.json` and
   `ios/App/App/public` — both are git-ignored and expected to be
   regenerated, not hand-edited.
   ```
   npx cap sync ios
   ```
4. **Open the project in Xcode.** This project has **no `.xcworkspace`
   file** — it uses Swift Package Manager (see `ios/App/CapApp-SPM`), not
   CocoaPods, so there is nothing a workspace would add. Open the
   `.xcodeproj` directly:
   ```
   open ios/App/App.xcodeproj
   ```
5. **Select your team.** In Xcode, click the App target → Signing &
   Capabilities → make sure the team is the Wayfind LLC team
   (`VZGMT57ND7`). Signing is set to Automatic, so Xcode should just work
   once the team is selected and the App ID capabilities from section 2d are
   turned on.
6. **Archive.** Product menu → Archive. This can take a few minutes.
7. **Distribute.** In the Organizer window that opens after the archive
   finishes: Distribute App → App Store Connect → Upload. Use the defaults
   Xcode suggests unless you have a specific reason not to.
8. **TestFlight.** Once the build finishes processing in App Store Connect
   (usually a few minutes to an hour), go to the app's TestFlight tab, add
   it to Internal Testing, and add yourself (and anyone else testing) as an
   internal tester.

---

## 4. Real iPhone test script

Do this on a real iPhone, not just the simulator — push notifications and
some permission prompts do not behave the same in the simulator.

1. **Install the TestFlight build.** Open the TestFlight app, accept the
   invite, install.
2. **Allow notifications.** On first launch (or whenever the app first asks),
   tap Allow on the system permission prompt.
3. **Get the device's push token**, one of two ways:
   - The 5-tap diagnostic: tap the Wayfind logo/wordmark 5 times in a row
     wherever `wfShowDiag` is wired in the app, which shows on-device debug
     info including the push token.
   - Or query Supabase directly:
     ```sql
     select token, platform, user_id, created_at
     from device_push_tokens
     order by created_at desc
     limit 5;
     ```
4. **Send a test push.**
   ```
   node scripts/push-test.mjs
   ```
   Follow its prompts (it will ask for a token or a user id, depending on how
   it's set up — check the script's own `--help` output before running it
   for the first time).
5. **Tap the notification** when it arrives and confirm it opens the right
   page inside the app, not just the app's homepage.
6. **Airplane mode test (offline).** Turn on Airplane Mode, background and
   reopen the app (or navigate somewhere). Confirm the "You're offline"
   overlay appears, has a working "Try again" button, and that it goes away
   on its own within a few seconds of turning Airplane Mode back off.
7. **Delete account test.** Sign in with a throwaway Apple ID (create one if
   you don't have a spare), go to Account → Delete Account, type "delete" to
   confirm, and verify the account and its data are actually gone — try
   signing back in with the same Apple ID and confirm it comes back as a
   brand new account, not the deleted one.

---

## 5. Known caveat: the apex domain cannot carry Universal Links

`gowayfind.com` (no `www`) 308-redirects to `www.gowayfind.com` at the Vercel
domain level. Apple's Universal Links validation refuses to follow a
redirect when it checks the `apple-app-site-association` file, so the apex
domain entry in the app's entitlements (`applinks:gowayfind.com`) can never
actually validate as things stand today. Links to `www.gowayfind.com` work
correctly; links to the bare `gowayfind.com` open in Safari instead of the
app.

This is **not fixable in this codebase** — it is a Vercel domain
configuration choice, and there are two ways to fix it, both outside this
repo:
- Serve the apex domain directly (no redirect) so it can validate on its
  own, or
- Drop the apex domain from the app's associated-domains entitlement, so the
  app only ever claims the domain that actually works (`www`).

Either is a small Vercel dashboard change; neither needs a code change here.
Flagging it so it doesn't get treated as a bug in this PR — it was already
true before this PR and stays true after it.

---

## 6. Verification (for the record)

Everything in section 1 is covered by guard scripts that ran green at the
time this doc was written:
`scripts/check-ios-device-family.mjs`,
`scripts/check-ios-shell-wiring.mjs`,
`scripts/check-ios-privacy-manifest.mjs`,
`scripts/check-auth.mjs`,
`scripts/check-universal-links.mjs`,
`scripts/test-app-rating.mjs`,
`scripts/check-push-registration.mjs`.

`ios/App/App/PrivacyInfo.xcprivacy` was checked against every native
Capacitor plugin actually bundled in this app (`app`, `browser`, `camera`,
`push-notifications`, `share`, `splash-screen`, `status-bar`) for the
file-timestamp and system-boot-time required-reason APIs Apple added to its
review checklist. None of them are used by any bundled plugin's Swift source,
so no new declaration was needed beyond the `UserDefaults` one already in the
manifest (`CA92.1`, used by Capacitor's own runtime).
