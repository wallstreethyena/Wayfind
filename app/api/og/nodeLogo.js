// app/api/og/nodeLogo.js — the owner's logo bytes for the Node.js OG routes
// (hero, movie). card.jsx's edge-bundled copy (new URL(..., import.meta.url))
// only resolves on the edge runtime, the same seam as the Archivo fonts; these
// routes read the vault derivative from disk and pass it as opts.logoBuffer.
// next.config.js outputFileTracingIncludes lists the file for both routes.
import { readFile } from "node:fs/promises";
import path from "node:path";

export const NODE_LOGO_FILE = "public/brand/wayfind/derived/wayfind-logo-white-og.png";
let logoPromise = null;

/** ArrayBuffer of the logo, or null when unreadable (the card then renders without a mark). */
export function loadNodeLogo() {
  if (!logoPromise) {
    logoPromise = readFile(path.join(process.cwd(), NODE_LOGO_FILE))
      .then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
      .catch(() => { logoPromise = null; return null; });
  }
  return logoPromise;
}
