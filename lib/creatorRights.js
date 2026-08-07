// lib/creatorRights.js — what Wayfind may and may not say and show about a
// creator it has not signed.
//
// v6.98. Owner, 2026-08-06: "on the social media find you are naming the
// influencer as wayfind creators they are not ... i also need to make sure we
// are protected from these influencer legally if they complain about being
// listed in our website without compensation."
//
// Both halves of that are the same problem, and this file is the single place
// the answer lives so no surface can quietly diverge from it.
//
// ── WHAT THE LAW ACTUALLY SAYS (research, 2026-08-06; NOT legal advice — have
//    a Florida attorney review before relying on any of this) ───────────────
//
// 1. FLORIDA STATUTE 540.08 — the one that matters most, because Wayfind is a
//    Florida business writing about Florida places. It forbids publishing a
//    person's "name, portrait, photograph, or other likeness" for "purposes of
//    trade or for any commercial or advertising purpose" without their express
//    written or oral consent. Remedies include an injunction, damages, PUNITIVE
//    damages, and — the one that maps exactly onto the owner's fear — "an
//    amount which would have been a reasonable royalty." That is a court
//    ordering us to pay the compensation the creator says they were owed.
//
//    Its escape hatch, s. 540.08(4)(a), covers use in a "bona fide news report
//    or presentation having a current and legitimate public interest" AND NOT
//    for advertising purposes. Editorially crediting a creator for a real
//    recommendation sits close to that exemption. Dressing them up as part of
//    our brand does not.
//
// 2. LANHAM ACT s. 43(a) — FALSE ENDORSEMENT. Separate from 540.08 and not
//    cured by a disclaimer buried in a footer. The claim is that consumers were
//    misled into believing a person endorses or is affiliated with a business.
//    A badge reading "WAYFIND CREATOR" over someone's real name and photograph
//    is close to a textbook description of it. NOMINATIVE FAIR USE is the
//    defence for naming someone truthfully — but it requires using no more of
//    their identity than necessary and doing nothing suggesting sponsorship.
//    A handle and a link are necessary. A membership-style badge is not.
//
// 3. COPYRIGHT, AND THE SERVER TEST. Hunley v. Instagram (9th Cir. 2023) held
//    that EMBEDDING an image does not infringe the display right, because the
//    embedding site "does not store a copy" — the bytes come from the platform.
//    That defence turns entirely on not holding the copy. app/api/creator-avatar
//    reads the profile photo with arrayBuffer() and re-serves the bytes from our
//    own origin, which is the precise thing the server test does NOT protect.
//    Separately the photograph is usually owned by whoever took it, who may be
//    neither the creator nor us.
//
// ── THE RULE ───────────────────────────────────────────────────────────────
// We may TRUTHFULLY NAME a creator and LINK to their public post. That is
// attribution, it is what they get out of this, and it is defensible.
// We may NOT imply they are ours, and we may NOT host their photograph unless
// they have actually said yes and we have written it down here.

/** The exact affiliation language that must never appear in the product. */
export const BANNED_AFFILIATION_PHRASES = Object.freeze([
  "wayfind creator",
  "our creator",
  "our creators",
  "wayfind partner",
  "official creator",
  "wayfind ambassador",
  "brand ambassador",
  "sponsored by wayfind",
  // "wayfind team" is NOT banned. It appears on /about, /editorial-policy and
  // the guide byline, where it truthfully means OUR OWN staff. The risk here is
  // never Wayfind describing itself — it is Wayfind describing a creator as
  // though they belonged to it. A ban broad enough to catch our own byline is a
  // guard that gets switched off the first time it cries wolf.
]);

/** Shown wherever creators are listed. Plain, short, and load-bearing. */
export const AFFILIATION_DISCLOSURE =
  "These creators are independent. They are not affiliated with Wayfind, are not paid by us, and have not endorsed us. We link to their public posts and credit them by name.";

/** The way out, offered before anyone has to ask for it. */
// Owner, 2026-08-07: route removal requests to the mailbox that is actually
// monitored. creators@ was never provisioned, so the "cheapest resolution to a
// complaint is a fast yes" argument below only holds if the address resolves.
export const REMOVAL_CONTACT = "info@gowayfind.com";
export const REMOVAL_PROMPT = "Are you a creator and want your post removed? Email us and we will take it down.";

/**
 * PHOTO CONSENT, per creator handle.
 *
 * DEFAULT IS NO. A handle absent from this map may not have its photograph
 * hosted, full stop — `mayHostPhoto()` fails closed rather than treating
 * silence as permission, because silence is exactly what a 540.08 claim is
 * built on.
 *
 * To grant: get it IN WRITING (email is fine — s. 540.08 accepts written or
 * oral consent, but oral consent you cannot produce later is worth nothing in
 * front of a judge), then add a row with the date and where the record lives.
 *
 *   "somehandle": { photo: true, on: "2026-08-06", record: "email from @somehandle, subject '...', in creators@ inbox" }
 *
 * v6.98 ships with an EMPTY map on purpose. Eleven creators are currently
 * listed in lib/creatorVideos.js and not one of them has been asked.
 */
// v6.98b (2026-08-06) — owner: "All of the creators added has provided
// permission so we need to make sure their profile photo show up."
//
// Recorded on the OWNER'S ATTESTATION, and the record says exactly that rather
// than pretending to cite a document nobody has produced. This is a real and
// sufficient basis to proceed — s. 540.08 accepts written OR oral consent — but
// it is the weaker of the two, so read this next part as the actual to-do:
//
//   KEEP THE UNDERLYING MESSAGES. The DM, email or signed note from each
//   creator is what gets produced if one of them later changes their mind. An
//   attestation with no artefact behind it is worth very little in front of a
//   judge, and "we asked them all at once, months ago" is not a document.
//   As each real artefact is filed, replace that creator's row with one that
//   cites it — the shape is right there in the comment above.
const OWNER_ATTESTED = Object.freeze({
  photo: true,
  on: "2026-08-06",
  record: "Owner attestation, 2026-08-06: permission obtained from every creator listed in lib/creatorVideos.js at that date. Underlying DMs/emails to be filed per creator and cited here individually.",
});

// 2026-08-07 — three creators added this session, at the owner's direction and
// on the same attestation basis as the eleven above. The to-do in that comment
// applies to these three EXACTLY as it does to the others: keep the DM or email
// from each of them. Three more rows on one person's word is three more rows
// with no artefact behind them.
const OWNER_ATTESTED_2026_08_07 = Object.freeze({
  photo: true,
  on: "2026-08-07",
  record: "Owner attestation, 2026-08-07: permission obtained from @tampaiman, @_adatewithkait, @magicalmaddieb and @stufftodointampabay, whose posts the owner supplied for curation on that date. Underlying DMs/emails to be filed per creator and cited here individually.",
});

export const CREATOR_CONSENT = Object.freeze({
  "tampaiman": OWNER_ATTESTED_2026_08_07,
  "_adatewithkait": OWNER_ATTESTED_2026_08_07,
  "magicalmaddieb": OWNER_ATTESTED_2026_08_07,
  "stufftodointampabay": OWNER_ATTESTED_2026_08_07,
  "alexandramartin_tv": OWNER_ATTESTED,
  "secretsoftampabay": OWNER_ATTESTED,
  "influencetampa": OWNER_ATTESTED,
  "tampaterrencee": OWNER_ATTESTED,
  "cindy.selects": OWNER_ATTESTED,
  "katelynintampa": OWNER_ATTESTED,
  "neverboredinorlando": OWNER_ATTESTED,
  "fashion.eat.travel": OWNER_ATTESTED,
  "lifeinparrish": OWNER_ATTESTED,
  "theerynlalonde": OWNER_ATTESTED,
  "thefloridaqueenie_": OWNER_ATTESTED,
});

const norm = (h) => String(h || "").trim().toLowerCase().replace(/^@/, "");

/** May we host and serve this creator's photograph? Fails closed. */
export function mayHostPhoto(handle) {
  const row = CREATOR_CONSENT[norm(handle)];
  return !!(row && row.photo === true && typeof row.record === "string" && row.record.length > 10);
}

/**
 * The truthful label for a creator card. Never a membership badge — the
 * PLATFORM they posted on, which is a fact about the post rather than a claim
 * about the person.
 */
export function creatorLabel(platformLabel) {
  return platformLabel ? "Found on " + platformLabel : "Independent creator";
}

/** Does this string make an affiliation claim we cannot support? */
export function claimsAffiliation(text) {
  const t = String(text || "").toLowerCase();
  return BANNED_AFFILIATION_PHRASES.some((p) => t.includes(p));
}
