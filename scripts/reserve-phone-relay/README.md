# Phone relay

A small Node process that Twilio ConversationRelay connects to. It speaks the same script as `lib/reservePhone`: the first sentence is the automated assistant disclosure, it never gives a card or accepts a deposit, and voicemail, an automated menu, a hold longer than 45 seconds, or a payment request ends as `needs_guest`. It does not record audio and it does not store a transcript. It posts one structured outcome to Wayfind.

Run it from the repo root on any machine with Node 22. Nothing in this folder starts by itself, and the Wayfind flag stays off until you set it on the deployment.

## Env vars

Set these in the relay process. Do not commit the values.

| Name | Required | Meaning |
| --- | --- | --- |
| `RESERVE_PHONE_RELAY_SECRET` | yes | At least 16 characters. The same value on the Wayfind deployment. Sent as `x-wayfind-phone-relay`. |
| `RESERVE_PHONE_CALLBACK_BASE` | yes | `https` origin of the deployment that should store the outcome. No path and no trailing slash. For a preview, this is the preview origin, not `https://www.gowayfind.com`. |
| `PORT` | no | Listen port. Default `8787`. |
| `RESERVE_PHONE_HOLD_SECONDS` | no | Hold limit. Default `45`. |
| `TWILIO_AUTH_TOKEN` | live test | When set, the socket rejects a handshake whose `X-Twilio-Signature` does not match. |
| `RESERVE_PHONE_RELAY_PUBLIC_URL` | with the token | The `wss://` address Twilio dials, used to check that signature. |

The Wayfind deployment that places the call also needs `RESERVE_PHONE_RELAY_URL` set to that same `wss://` address, and `RESERVE_PHONE_CALLBACK_BASE` set to the same https origin. There is no default origin. If the base is missing, the call is not placed.

## Run

```bash
node scripts/reserve-phone-relay/server.mjs
```

A free tunnel, from another terminal, while the relay is listening:

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

Use the `https` hostname cloudflared prints, with `wss` instead of `https`, as `RESERVE_PHONE_RELAY_URL` on Wayfind and as `RESERVE_PHONE_RELAY_PUBLIC_URL` on this process. Restart the relay after you know that hostname so the signature check uses it.

The outcome is `POST /api/reserve/phone-outcome` on the callback origin. That route is not a browser route. A missing secret answers 404. A wrong secret answers 403.
