// lib/photoLicense.js — the licence gate for the permanent photo vault
// (2026-09-09).
//
// THE OWNER'S RULE, VERBATIM IN INTENT: "Anything we get from somewhere that
// costs, we store permanently, we don't want to lose it." The correct
// implementation of that intent is a PROCUREMENT rule, not a hoarding one --
// Wayfind keeps what it is LICENSED to keep, and prefers providers whose
// licence allows that going forward. This module is the single place that
// decision gets made. Nothing downstream (lib/photoVault.js) may write a
// photo's bytes to permanent storage without first asking THIS function, and
// this function's answer is the only thing downstream is allowed to trust.
//
// GOOGLE IS REFUSED BY NAME, NOT BY ACCIDENT. Google's Places API terms
// permit caching a `place_id` indefinitely and lat/lng for 30 days (AGENTS.md
// §8 — "Google Places ToS: Place IDs may be stored indefinitely; all other
// place content must not be cached beyond 30 days" — the same position
// supabase/migrations/20260908_wf_photo_repair_queue.sql and
// lib/commonsPhotos.js's own header already document for the rest of this
// lane). A photo's bytes sit squarely inside "all other place content":
// PHOTOS ARE NOT AMONG THE CACHING EXCEPTIONS (place_id, and briefly
// lat/lng) — so a Google Places photo may never be written to the permanent
// vault, full stop, regardless of how a caller happened to have labelled it.
// Wayfind also has an open ~$1,878 Google billing dispute; storing Google
// photo bytes past their licensed window is not a risk this module will take
// on a caller's say-so.
//
// EVERYTHING FAILS CLOSED, and each failure is its own reason rather than one
// shared "no": a source this module has never heard of, a missing licence, a
// licence it cannot parse, and a recognised-but-non-free licence are FOUR
// DIFFERENT rejection reasons, so an operator reading a rejected row can tell
// "we don't know this provider" from "we know this provider and its content
// isn't free" without re-deriving it. None of the four is a maybe — there is
// no "probably fine" return from this function.
//
// PURE. No I/O, no network, no throw. This file can be unit-tested with zero
// network and zero DB, which is exactly what scripts/test-photo-vault.mjs
// does.
//
// REUSES lib/commonsPhotos.js's classifyLicense for the free/non-free
// decision (its FREE_LICENSE_RX is the one and only CC/public-domain pattern
// in this codebase) rather than inventing a second license classifier that
// could quietly drift from the first.

import { classifyLicense } from "./commonsPhotos.js";

// The only sources this vault may ever write bytes for. Matches
// wf_place_photo's own `source` check constraint
// (supabase/migrations/20260909_wf_place_photo.sql) exactly, on purpose --
// this array and that constraint must never drift apart, because a source
// this array approves that the column then rejects (or vice versa) is either
// a silent write failure or a silent policy gap depending on which side won.
export const STORABLE_SOURCES = ["wikimedia", "owner", "creator"];

// THE RIGHTS-HELD SOURCES, and why they need their own branch (2026-09-09).
//
// A photo Wayfind shot, or one a creator supplied with consent on record, is
// the MOST permanently ours of anything in this vault — and until this branch
// existed it was the ONE thing the gate could never store. classifyLicense is
// Commons' CC/public-domain matcher; a rights statement like "Wayfind owned"
// or "creator, consent on record" is not a CC code and never matches it, so
// every owner/creator photo fell through to `non_free_license`. Measured by
// calling the gate, not by reading it: mayStorePermanently({source:"owner",
// license:"Wayfind owned"}) returned REFUSE/non_free_license. That is exactly
// backwards — the owner's whole rule is that content we hold outright is the
// content we must never lose.
//
// So third-party content (wikimedia) still has to prove a FREE licence, and
// content we hold directly instead has to prove PROVENANCE: a non-empty
// rights statement naming who holds the rights. Empty still fails closed, so
// this is a different question, not a weaker one — "we hold this, and here is
// the record of why" rather than "some licence string was present".
//
// NOTE, product-level and not enforceable here: `creator` additionally
// requires consent on record (CLAUDE.md's creator-rights law). This gate can
// only prove a rights statement exists; it cannot prove consent was obtained.
// Whatever writes a creator row is what must carry that.
export const RIGHTS_HELD_SOURCES = ["owner", "creator"];

// Any URL whose host is googleusercontent.com (or a subdomain of it) is
// Google Places/Maps photo content by construction — see
// lib/photoCacheRecovery.js's GOOGLE_USER_CONTENT_RX and
// lib/placePhotoServe.js's OWNED_HOST_RX, the same host pattern this
// codebase already uses to recognise a Google-served photo byte-for-byte.
// This is the second half of "refuse Google BY NAME": a caller that
// mislabels a Google photo under a storable `source` string must still be
// refused, because the source-string gate below only ever sees the label it
// was given, not where the bytes actually come from.
const GOOGLE_HOST_RX = /(?:^|\.)googleusercontent\.com$/i;

function normalizeSource(source) {
  return typeof source === "string" ? source.trim().toLowerCase().replace(/[^a-z0-9]+/g, "") : "";
}

// True for "google", "Google", "GOOGLE", "google_places", "google-places",
// "GooglePlaces", "google places api" — any spelling whose normalized form
// starts with "google". Deliberately generous toward catching a mislabel: it
// can never produce a FALSE refusal of a real storable source, because none
// of STORABLE_SOURCES starts with "google".
function isGoogleSourceLabel(normalizedSource) {
  return normalizedSource.startsWith("google");
}

/**
 * Pure. True when `url`'s host is a googleusercontent.com Google Photos/
 * Places media host, regardless of what `source` label a caller attached to
 * it. lib/photoVault.js calls this BEFORE any network request, as a second,
 * independent check that cannot be walked around by relabelling a Google URL
 * under a storable source string.
 */
export function isGooglePhotoUrl(url) {
  if (typeof url !== "string" || !url) return false;
  try {
    return GOOGLE_HOST_RX.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

// classifyLicense reads Commons' own extmetadata shape
// (`{ License: { value }, LicenseShortName: { value } }`). Wrapping a plain
// license-code string — what wf_place_photo.license and
// lib/commonsPhotos.js's own findCommonsPhoto return value both carry — as
// that shape reuses its exact free/non-free regex decision instead of a
// second one here. classifyLicense's own two reasons map directly onto this
// gate's two license-rejection reasons: "no_license" (nothing to classify —
// absent/unrecognised) becomes "unknown_license"; anything present that
// FREE_LICENSE_RX does not match becomes "non_free_license".
function licenseVerdict(license) {
  const value = typeof license === "string" ? license.trim() : "";
  return classifyLicense({ License: { value } });
}

/**
 * mayStorePermanently({ source, license }) → { allowed, reason }.
 *
 * Pure, no I/O, never throws. Every rule fails CLOSED:
 *   - source is (any spelling of) "google"            → google_places_terms_no_photo_caching
 *   - source is missing / not in STORABLE_SOURCES      → unknown_source
 *   - license is missing, or classifyLicense can't
 *     parse a value out of it                          → unknown_license
 *   - license is present but not free/CC/public-domain  → non_free_license
 *   - otherwise                                         → allowed: true
 */
export function mayStorePermanently({ source, license } = {}) {
  const normalizedSource = normalizeSource(source);

  // Checked FIRST and BY NAME — this branch must never be reachable only as
  // a side effect of falling through "not in STORABLE_SOURCES" below. A
  // reviewer (or a future guard) can grep this file for the literal string
  // "google" and find the refusal, rather than infer it from an allowlist's
  // absence.
  if (isGoogleSourceLabel(normalizedSource)) {
    return { allowed: false, reason: "google_places_terms_no_photo_caching" };
  }

  if (!normalizedSource || !STORABLE_SOURCES.includes(normalizedSource)) {
    return { allowed: false, reason: "unknown_source" };
  }

  // Content Wayfind holds directly proves PROVENANCE, not a CC code. A blank
  // rights statement still fails closed, as unknown_license — the same reason
  // a missing Commons licence gets, because it is the same failure: we cannot
  // say why we are allowed to keep this.
  if (RIGHTS_HELD_SOURCES.includes(normalizedSource)) {
    const rights = typeof license === "string" ? license.trim() : "";
    if (!rights) return { allowed: false, reason: "unknown_license" };
    return { allowed: true, reason: "ok" };
  }

  const verdict = licenseVerdict(license);
  if (!verdict.free) {
    return { allowed: false, reason: verdict.reason === "no_license" ? "unknown_license" : "non_free_license" };
  }

  return { allowed: true, reason: "ok" };
}
