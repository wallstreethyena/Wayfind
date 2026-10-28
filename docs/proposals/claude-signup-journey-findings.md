# Finding for the owner: the signup journey was invisible, and the offer converts about 0 (2026-10-27)

Lane: claude.exe (Wayfind lane). This is a finding only. The PR that carries it changes tracking, not the product.

## The numbers

PostHog, last 14 days:

| Event | Count | Users |
|---|---|---|
| signup_offer_shown | 221 | 221 |
| signup_started | 2 | 1 |
| login_completed | 9 | 2 |
| signup_completed | 0 | 0 |

Supabase `auth.users`, last 21 days: exactly 3 new accounts (10-16, 10-24 twice). All three used provider google, all confirmed, all signed in.

## What this means

- Real signups happen only through web Google sign-in. That path is a full page redirect to Google and back, and it logged nothing except the generic `auth_event` with `event: SIGNED_IN`. So `signup_completed` read 0 while 3 accounts were created.
- Password signup is almost unused (2 starts, 1 user). Native Apple and Google logged `login_completed` but never `signup_completed`.
- Opening the sheet from the header button, and dismissing it, logged nothing, so there was no way to see where people leave.
- Because `signup_completed` is the one Google Ads signup conversion, Ads could not see any signup at all.

## Product observation (no change made)

The save offer opens the sign in sheet 1.2 seconds after a first anonymous save, at the same time as a toast saying "Saved on this device, sign up free and it follows you to every device." 221 people were shown it. 2 started the password form. Through this path the conversion is about zero. The 3 real signups in 21 days most likely did not come from this offer, and we cannot tell until the new events run for a while.

Possible next steps for the owner to consider, not done here: show the offer later or on a second save, show it inline instead of as a full sheet over the thing they just saved, lead with Google as one tap, or measure first with the new events.

## What this PR adds

- `auth_opened {src}`: every time the sheet opens. src is one of header, save_offer, require_auth, screen_gate, giveaway, auth_wall, other.
- `auth_method_clicked {method, mode}`: Google or Apple button, or the password submit.
- `auth_dismissed {mode}`: the sheet closed without a session.
- `signup_completed {method}` and `login_completed {method}`: now emitted in one place only, the auth state change handler, through `lib/authJourney.js`. A signup is a SIGNED_IN for an account created (or email confirmed) in the last 10 minutes that this device has not counted before (marker `wf_auth_seen_<uid>`). A login is a SIGNED_IN that follows a method click in the same tab. INITIAL_SESSION and token refreshes never count.
- `auth_event` is unchanged.

The Google Ads mirror still goes through `logEvent` and `forwardToGoogle`, so it gets exactly one signup conversion per account. `scripts/test-auth-journey.mjs` proves it.

## Notes

- `method` for password accounts stays "password" (Supabase calls it "email"), to match the old events. Native sign ins now report "google" or "apple" instead of "google_native" or "apple_native".
- Expect `signup_completed` to start showing a small real number, which will also start feeding Ads optimization for the first time.
