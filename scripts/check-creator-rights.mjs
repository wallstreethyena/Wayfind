// scripts/check-creator-rights.mjs — we may name a creator. We may not claim
// them, and we may not host their face.
//
// v6.98. Two live exposures, both created by UI copy rather than by code:
//
//   1. Fla. Stat. 540.08 — publishing a person's name or likeness for a
//      commercial purpose without express consent. Remedies include injunction,
//      punitive damages, and "an amount which would have been a reasonable
//      royalty". That last one IS the owner's stated fear, written into statute.
//   2. Lanham Act s. 43(a) false endorsement — implying a person is affiliated
//      with or endorses a business. A "WAYFIND CREATOR" badge over a real
//      person's handle and photograph shipped for weeks.
//
// Naming someone truthfully and linking their public post is defensible
// (nominative fair use; the 540.08(4)(a) news/public-interest carve-out).
// Dressing them as part of the brand is not, and neither is re-hosting their
// photograph — Hunley v. Instagram protects EMBEDDING because the site "does
// not store a copy", which is exactly what /api/creator-avatar does not do.
//
// NOT LEGAL ADVICE. This encodes a conservative reading so the product cannot
// drift back; a Florida attorney should review the policy itself.
import { BANNED_AFFILIATION_PHRASES, AFFILIATION_DISCLOSURE, REMOVAL_CONTACT, REMOVAL_PROMPT, CREATOR_CONSENT, mayHostPhoto, claimsAffiliation, creatorLabel } from "../lib/creatorRights.js";
import { allCreators } from "../lib/creatorVideos.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ── 1. NO AFFILIATION CLAIM ANYWHERE A USER CAN READ ────────────────────────
// Walk the rendered surfaces, not one known file — the badge was in a sheet
// nobody thought to check.
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const f = path.join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (/\.(js|jsx)$/.test(f)) out.push(f);
  }
  return out;
}
const files = walk(path.join(REPO, "app")).concat(walk(path.join(REPO, "lib")));
ok(files.length > 50, `the product source was actually scanned (${files.length} files)`);

const POLICY = path.join(REPO, "lib/creatorRights.js");
let scanned = 0;
for (const f of files) {
  if (f === POLICY) continue; // the policy NAMES the banned phrases in order to ban them
  const src = readFileSync(f, "utf8");
  // Strip line comments: a comment explaining why we do not say "Wayfind
  // creator" must not itself trip the check. (Learned twice already this
  // session — test the property, never the word.)
  const live = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  for (const phrase of BANNED_AFFILIATION_PHRASES) {
    ok(!live.toLowerCase().includes(phrase),
       `${path.relative(REPO, f)} does not claim affiliation ("${phrase}") — that is Lanham Act s. 43(a) false endorsement, and a disclaimer elsewhere does not cure it`);
  }
  scanned += 1;
}
ok(scanned > 50, `every surface was checked (${scanned})`);
ok(claimsAffiliation("WAYFIND CREATOR") === true, "the detector actually detects — otherwise the loop above is decoration");
ok(claimsAffiliation("Found on Instagram") === false, "…and does not fire on the truthful label");

// ── 2. PHOTO CONSENT FAILS CLOSED ───────────────────────────────────────────
const { creators } = allCreators();
ok(creators.length > 0, `creators are listed (${creators.length}) — an empty library would make this vacuous`);
for (const c of creators) {
  const row = CREATOR_CONSENT[c.handle.toLowerCase()];
  if (!row) {
    ok(mayHostPhoto(c.handle) === false,
       `"${c.handle}" has NO consent record, so their photograph is not hosted — silence is not permission, and silence is what a 540.08 claim is built on`);
  } else {
    ok(row.photo === true && typeof row.record === "string" && row.record.length > 10,
       `"${c.handle}" consent row names WHERE the written record is, so it can be produced if challenged`);
    ok(/^\d{4}-\d{2}-\d{2}$/.test(row.on || ""), `"${c.handle}" consent row is dated`);
  }
}
ok(mayHostPhoto("someone-who-never-agreed") === false, "an unknown handle is never photographed — the gate defaults to no");
ok(mayHostPhoto("") === false && mayHostPhoto(null) === false, "…and empty input does not slip through");

// ── 3. THE GATE IS WIRED WHERE IT CANNOT BE FORGOTTEN ───────────────────────
{
  const CA = readFileSync(path.join(REPO, "app/components/CreatorAvatar.js"), "utf8");
  ok(/mayHostPhoto\(handle\)\s*\?\s*avatarSrc\(/.test(CA),
     "CreatorAvatar asks for the photo ONLY with consent — the gate is in the component, so a new call site inherits it instead of having to remember");
  ok(/initials\(handle\)/.test(CA), "…and initials remain the base layer, so a gated card still renders a person");
}

// ── 4. THE DISCLOSURE AND THE WAY OUT ARE ON THE PAGE ───────────────────────
{
  const SF = readFileSync(path.join(REPO, "app/components/sheets/SocialFind.js"), "utf8");
  // Assert it is RENDERED, not merely imported. The first version of this
  // checked that the identifier appeared anywhere in the file — which the
  // import statement alone satisfies, so deleting the disclosure from the JSX
  // passed happily. Caught by RED proof.
  ok(/\{AFFILIATION_DISCLOSURE\}/.test(SF), "the creator library RENDERS the independence statement, not just imports it");
  ok(/\{REMOVAL_PROMPT\}/.test(SF), "…and renders the removal prompt");
  ok(/REMOVAL_CONTACT/.test(SF) && /mailto:/.test(SF),
     "…and offers a working removal address BEFORE anyone has to hunt for one — the cheapest resolution to a complaint is a fast yes");
  ok(/creatorLabel\(/.test(SF), "the card label comes from the policy, not a hand-typed string that can drift back");
}
ok(/not affiliated with Wayfind/i.test(AFFILIATION_DISCLOSURE), "the disclosure actually denies affiliation");
ok(/not paid|not compensated/i.test(AFFILIATION_DISCLOSURE), "…and denies payment, which is the specific thing a creator complains about");
ok(/@/.test(REMOVAL_CONTACT) && REMOVAL_PROMPT.length > 20, "the removal contact and prompt are real");
ok(creatorLabel("Instagram") === "Found on Instagram", "the truthful label describes the POST's platform, not the person's relationship to us");

if (fail.length) {
  console.error(`check-creator-rights: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-creator-rights: OK — ${pass} assertions; ${creators.length} creators listed, ${Object.keys(CREATOR_CONSENT).length} with photo consent on record`);
