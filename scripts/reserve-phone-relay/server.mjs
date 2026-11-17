// Standalone ConversationRelay host. Run from the repo root:
//   node scripts/reserve-phone-relay/server.mjs
// It does not place calls and it does not record audio. Twilio opens the socket.
// See README.md in this folder for the env vars and a cloudflared tunnel.
import http from "node:http";
import { pathToFileURL } from "node:url";
import { validTwilioSignature } from "../../lib/reserveSms.js";
import { HOLD_LIMIT_SECONDS } from "../../lib/reservePhone/policy.js";
import { acceptKey, decodeFrames, encodeText } from "./frames.mjs";
import { createRelaySession } from "./session.mjs";

export function relayListenConfig(env = process.env) {
  const secret = String(env.RESERVE_PHONE_RELAY_SECRET || "");
  const base = String(env.RESERVE_PHONE_CALLBACK_BASE || "").trim().replace(/\/+$/, "");
  if (secret.length < 16) return { ok: false, code: "NOT_CONFIGURED", message: "RESERVE_PHONE_RELAY_SECRET is not set." };
  if (!/^https:\/\/[^\s/]+$/.test(base)) return { ok: false, code: "NOT_CONFIGURED", message: "RESERVE_PHONE_CALLBACK_BASE must be the https origin that receives the outcome." };
  const token = String(env.TWILIO_AUTH_TOKEN || "");
  const publicUrl = String(env.RESERVE_PHONE_RELAY_PUBLIC_URL || "").trim();
  if (token.length >= 16 && !/^wss:\/\/[^\s]+$/.test(publicUrl) && !/^ws:\/\/[^\s]+$/.test(publicUrl)) {
    return { ok: false, code: "NOT_CONFIGURED", message: "RESERVE_PHONE_RELAY_PUBLIC_URL must be the ws address Twilio dials, so the signature can be checked." };
  }
  const port = Number(env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, code: "NOT_CONFIGURED", message: "PORT is not usable." };
  let holdSeconds = HOLD_LIMIT_SECONDS;
  const holdRaw = String(env.RESERVE_PHONE_HOLD_SECONDS || "").trim();
  if (holdRaw) {
    holdSeconds = Number(holdRaw);
    if (!Number.isInteger(holdSeconds) || holdSeconds < 15 || holdSeconds > 180) return { ok: false, code: "NOT_CONFIGURED", message: "RESERVE_PHONE_HOLD_SECONDS is not usable." };
  }
  return { ok: true, secret, base, token: token.length >= 16 ? token : "", publicUrl, port, holdSeconds, outcomeUrl: `${base}/api/reserve/phone-outcome` };
}

export function createRelayServer({ config, fetchImpl = fetch, sessionFactory = null } = {}) {
  async function postOutcome(body) {
    await fetchImpl(config.outcomeUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-wayfind-phone-relay": config.secret },
      body: JSON.stringify(body),
    });
  }
  const server = http.createServer((_req, res) => {
    res.writeHead(426, { "content-type": "text/plain" });
    res.end("This host speaks the phone relay websocket only.");
  });
  server.on("upgrade", (req, socket) => {
    if (config.token) {
      const sig = req.headers["x-twilio-signature"];
      const url = config.publicUrl || "";
      if (!validTwilioSignature(config.token, url, {}, typeof sig === "string" ? sig : "")) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
    }
    const key = req.headers["sec-websocket-key"];
    if (!key) { socket.destroy(); return; }
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + acceptKey(key) + "\r\n\r\n");
    const session = (sessionFactory || createRelaySession)({
      postOutcome, holdLimit: config.holdSeconds,
      onFrames: (frames) => { for (const frame of frames) socket.write(encodeText(JSON.stringify(frame))); },
    });
    let buf = Buffer.alloc(0);
    socket.on("data", async (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const decoded = decodeFrames(buf);
      buf = decoded.rest;
      if (decoded.closed) { socket.end(); return; }
      for (const text of decoded.frames) {
        const out = await session.handle(text);
        for (const frame of out || []) socket.write(encodeText(JSON.stringify(frame)));
      }
    });
  });
  return server;
}

function invokedDirectly() {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
}

if (invokedDirectly()) {
  const config = relayListenConfig(process.env);
  if (!config.ok) {
    console.error(config.message);
    process.exit(1);
  }
  if (!config.token) console.error("Twilio signature check is off. Set TWILIO_AUTH_TOKEN and RESERVE_PHONE_RELAY_PUBLIC_URL before a live test.");
  const server = createRelayServer({ config });
  server.listen(config.port, "0.0.0.0", () => {
    console.error(`Phone relay listening on port ${config.port}. Outcomes go to the configured callback origin.`);
  });
}
