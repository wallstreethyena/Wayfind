// Minimal WebSocket text frames. Server frames are not masked. Client frames are.
import { createHash } from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
export const acceptKey = (key) => createHash("sha1").update(String(key) + GUID).digest("base64");

export function encodeText(text) {
  const payload = Buffer.from(String(text), "utf8");
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x81, len]);
  else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

/** Pull complete text frames out of a buffer. `rest` is the unparsed tail. */
export function decodeFrames(buf) {
  const frames = [];
  let o = 0;
  let closed = false;
  while (o + 2 <= buf.length) {
    const b1 = buf[o + 1];
    const opcode = buf[o] & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let p = o + 2;
    if (len === 126) {
      if (p + 2 > buf.length) break;
      len = buf.readUInt16BE(p);
      p += 2;
    } else if (len === 127) {
      if (p + 8 > buf.length) break;
      len = Number(buf.readBigUInt64BE(p));
      p += 8;
    }
    const maskLen = masked ? 4 : 0;
    if (p + maskLen + len > buf.length) break;
    let payload = buf.subarray(p + maskLen, p + maskLen + len);
    if (masked) {
      const mask = buf.subarray(p, p + 4);
      payload = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
    }
    if (opcode === 0x8) closed = true;
    else if (opcode === 0x1) frames.push(payload.toString("utf8"));
    o = p + maskLen + len;
  }
  return { frames, rest: buf.subarray(o), closed };
}
