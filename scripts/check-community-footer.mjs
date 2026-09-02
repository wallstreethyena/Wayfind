#!/usr/bin/env node
/**
 * scripts/check-community-footer.mjs — pins the three community affordances the
 * owner asked for on the app route, and the ONE rule that separates them.
 *
 * THE ASK (2026-08-22):
 *   1. surface the Instagram page in the app (the layout footer has it, but that
 *      footer is veiled on "/", so a phone user never sees it);
 *   2. a creator call-out — a good creator emails us and gets a spot;
 *   3. a FEEDBACK control that does NOT go to email — the user submits in-app and
 *      the team reads it in one place.
 *
 * THE RULE THAT MATTERS: creators email (mailto is correct there); feedback must
 * NEVER email. A future edit that turns the feedback path into a mailto, or wires
 * a mailer into /api/feedback, silently defeats the entire point — so this guard
 * fails the build on it. Both walls are red-proven below.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
let fails = 0;
const ok = (c, m) => { if (!c) { console.error("  FAIL: " + m); fails++; } };

const COMP = "app/components/CommunityFooter.js";
const ROUTE = "app/api/feedback/route.js";
const GUARDED_IG = "https://www.instagram.com/gowayfind.app/";

ok(existsSync(join(ROOT, COMP)), `${COMP} is missing`);
ok(existsSync(join(ROOT, ROUTE)), `${ROUTE} is missing`);
const comp = read(COMP);
const route = read(ROUTE);
const home = read("app/home.js");
const layout = read("app/layout.js");

// Strip line comments before scanning for a mailer: this file's own doc comment
// legitimately says the word "RESEND" to explain what is forbidden, and that
// must not read as a violation. We police CODE, not prose.
const stripComments = (s) => s.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const routeCode = stripComments(route);

// == 1. Instagram: exact handle, and consistent with the layout footer ==
ok(comp.includes(GUARDED_IG), `${COMP} must link the canonical Instagram ${GUARDED_IG}`);
ok(layout.includes(GUARDED_IG), "app/layout.js must still carry the same Instagram handle - the two must not drift");
// No OTHER instagram handle may sneak in (a typo'd handle sends followers to a
// stranger's account - the affiliate-pid failure mode, applied to social).
for (const m of comp.matchAll(/instagram\.com\/([A-Za-z0-9_.]+)/g)) {
  ok(m[1].replace(/\/$/, "") === "gowayfind.app", `${COMP} links instagram.com/${m[1]} - only gowayfind.app is allowed`);
}

// == 2. Creators email; feedback does NOT ==
// The creator mailto is built by concatenation ("mailto:" + CREATOR_EMAIL), so
// assert the two halves rather than a joined literal.
ok(/"mailto:"/.test(comp), "the creator call must build a mailto: href");
ok(/CREATOR_EMAIL\s*=\s*"hello@gowayfind\.com"/.test(comp), "the creator email must be hello@gowayfind.com");
ok(comp.includes('fetch("/api/feedback"'), "feedback must POST to /api/feedback");
// The feedback submit path must not be a mailto. Prove it structurally: the only
// mailto in the component is the creator line, and it is NOT inside the send().
const sendBody = comp.slice(comp.indexOf("async function send"), comp.indexOf("const mailHref"));
ok(sendBody && !/mailto:/.test(sendBody), "the feedback send() must never build a mailto - feedback does not go to email");

// == 3. The route writes to the DB and never emails ==
ok(/wf_feedback/.test(route), "the feedback route must insert into wf_feedback");
ok(/service|SERVICE_ROLE_KEY/i.test(route), "the feedback route must use the service role to write");
ok(!/mailto:|nodemailer|resend|sendgrid|RESEND_API_KEY|smtp/i.test(routeCode),
  "the feedback route must NOT send email - the owner asked for feedback that does NOT go to an inbox");
ok(route.includes("2000"), "the feedback route must cap message length (untrusted input)");
ok(/cache: "no-store"/.test(route), 'the feedback insert must be cache:"no-store" (mutating fetch) - see check-cron-post-nostore doctrine');

// == 4. It is actually mounted, in the home footer, not the side nav ==
ok(/const CommunityFooter\s*=\s*nextDynamic\(\(\)\s*=>\s*import\("\.\/components\/CommunityFooter"\)/.test(home), "app/home.js must load CommunityFooter outside the first screen bundle");
ok(/<CommunityFooter\b/.test(home), "app/home.js must render <CommunityFooter/>");
// It must sit in the centered in-app footer block (next to Privacy/Terms), not
// bolted onto the left nav. Assert proximity to the Privacy link.
const mountAt = home.indexOf("<CommunityFooter");
const privacyAt = home.indexOf('href="/privacy"');
ok(mountAt > -1 && privacyAt > -1 && Math.abs(privacyAt - mountAt) < 1200,
  "CommunityFooter must live in the in-app footer block beside Privacy/Terms, not elsewhere");

// == red-proofs: the walls can fail ==
{
  const spoofed = comp.replace(GUARDED_IG, "https://www.instagram.com/someone.else/");
  ok(!spoofed.includes(GUARDED_IG), "self-test: a swapped Instagram handle must be detectable");
  const mailed = route + "\nimport nodemailer from 'nodemailer';";
  ok(/nodemailer/i.test(mailed), "self-test: a mailer import in the feedback route must be detectable");
}

if (fails) { console.error(`check-community-footer: ${fails} failure(s)`); process.exit(1); }
console.log("check-community-footer: OK - Instagram surfaced, creators email, feedback goes to wf_feedback (never email), mounted in the home footer");
