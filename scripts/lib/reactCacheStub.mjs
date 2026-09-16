// scripts/lib/reactCacheStub.mjs — real React, plus a passthrough `cache()`.
//
// lib/placeData.js is a Next.js App Router server module and imports
// `cache` from "react" to de-dupe a request-scoped async call
// (generateMetadata + the page both call loadPlace). Next.js's own React
// build ships that export; the plain "react" package this repo's
// node_modules resolves to (checked 2026-09-15: react@18's public API) does
// not, so a guard that imports lib/placeData.js under plain node hits
// `SyntaxError: The requested module 'react' does not provide an export
// named 'cache'` before a single assertion runs.
//
// A guard exercises ONE call, not a request tree, so memoization buys
// nothing here — an identity passthrough is a faithful stand-in for this
// purpose, not a behavior change to any Wayfind code. Every other export
// passes through to the REAL react package unmodified.
//
// Only scripts/lib/placeDataNodeHook.mjs redirects the specifier "react"
// here, and only for every OTHER importer — never for this file's own
// `export * from "react"` below, which would recurse forever otherwise.
export * from "react";
export { default } from "react";
export const cache = (fn) => fn;
