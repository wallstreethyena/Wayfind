// lib/moviePosterFile.js — the one place a movie poster's file path is built.
//
// 2026-11-11: app/api/og/movie read path.join(process.cwd(), "public", src).
// Next's file tracer cannot tell which file a runtime path names, so it pulled
// ALL of public/ (1.1 GB) into that function and Vercel refused every
// production deploy (function over its 250 MB limit). The posters are traced in
// by name in next.config.js (outputFileTracingIncludes), so the path is built
// here, from the fixed public/movies folder and the file's base name only.

import path from "node:path";

const SRC = /^\/movies\/([\w.-]+\.webp)$/;

/** Absolute path of a registry poster (/movies/<name>.webp), or null for anything else. */
export function moviePosterFile(src, root = process.cwd()) {
  const m = SRC.exec(String(src || ""));
  if (!m || m[1].startsWith(".")) return null;
  return path.join(root, "public", "movies", path.basename(m[1]));
}
