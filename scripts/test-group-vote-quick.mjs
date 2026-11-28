// Group Vote quick create (owner redesign 2026-11-28: "really weird and
// difficult to use"): one screen, a swipe rail of spots, a sticky "Send to
// group", optional name, no friend-name form; friends' numbers never leave the
// phone. Plus the voter's own opt-in to Wayfind texts, kept with proof of
// consent, and STOP handling. No network.
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { groupShareMessage, SMS_SUBSCRIBE_CONSENT_TEXT, SMS_SUBSCRIBE_CONSENT_VERSION } from "../lib/groupPlanShareText.js";
import { smsKeyword } from "../lib/smsKeywords.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(path.join(ROOT, f), "utf8");
let n = 0;
const ok = (v, m) => { assert.ok(v, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// One short screen.
const UI = await loadComponent(path.join(ROOT, "app/group-plans/GroupPlanClient.js"), ROOT);
ok(typeof UI.GroupQuickCreate === "function", "quick create component exists");
const html = renderToStaticMarkup(React.createElement(UI.GroupQuickCreate, { placeId: "p1", placeName: "Ulele", session: {} }));
ok(/class="gq-rail"/.test(html), "spots sit in one horizontal swipe rail");
ok(/Add a place/.test(html), "search hides behind a small + Add a place tile");
ok(/Send to group/.test(html) && /class="gq-bar"/.test(html), "a sticky Send to group bar is always visible");
ok(!/Friend 1|Who’s voting\?|Your people &amp; your text|Let Santa pick/.test(html), "no friend-name form, people step or extra buttons");
ok(!/required=""/.test(html), "nothing is required except a spot and a time, so the button never silently fails");
ok(/optional/.test(html), "the organizer's name is optional");
const client = read("app/group-plans/GroupPlanClient.js");
ok(/mode==="new"\?<GroupQuickCreate /.test(client), "the new-vote page uses the quick form");
ok(/openGroup:true,autoStart:true,invitees:\[\]/.test(client), "one open group link, started at once, no stored friends");
ok(/navigator\.share\(\{title:"Group Vote on Wayfind"/.test(client), "creating goes straight to the phone's share sheet where allowed");
ok(/<GroupTextInvite key=\{created\.id\} body=\{body\} single=\{false\} onNotice=\{setNotice\} remember\/>/.test(client), "ready screen offers Messages and the contact picker");
const css = read("app/group-plans/GroupFrame.js");
ok(/\.gq-rail\{[^}]*scroll-snap-type:x mandatory/.test(css) && /\.gq-slot\{flex:0 0 72%/.test(css), "snap scrolling with a peek of the next card");
ok(/\.gq-bar\{position:fixed;[^}]*env\(safe-area-inset-bottom\)/.test(css), "the send bar clears the iPhone home bar");

// Contacts stay on the phone.
const invite = read("app/group-plans/GroupTextInvite.js");
ok(/navigator\.contacts\.select\(remember \? \["name", "tel"\] : \["tel"\]/.test(invite), "contact picker asks only for picked names and numbers");
ok(/window\.localStorage\.setItem\(RECENT_KEY/.test(invite) && !/fetch\(/.test(invite), "recent picks are kept on the device only, never sent to Wayfind");

// The text says who it's from, never "Organizer".
ok(groupShareMessage({ organizerName: "Organizer", places: [{ name: "Ulele" }], url: "https://x.test/v" }).startsWith("I started"), "no name reads as 'I started', never 'Organizer started'");
ok(groupShareMessage({ organizerName: "gabe", places: [{ name: "Ulele" }], url: "https://x.test/v" }).startsWith("Gabe started"), "a given name leads the text");

// Voter opt-in: their own unticked box, full disclosure, proof of consent.
for (const part of ["recurring automated marketing texts", "up to 4 a month", "Consent isn’t required", "Msg & data rates may apply", "Reply STOP to cancel", "HELP for help"]) ok(SMS_SUBSCRIBE_CONSENT_TEXT.includes(part), `consent says: ${part}`);
eq(SMS_SUBSCRIBE_CONSENT_VERSION, "2026-11-28", "consent wording is versioned");
const ballot = read("app/group-plans/GroupBallot.js");
ok(/useState\(false\)/.test(ballot) && /subscribeConsent:true,subscribePhone:voterPhone\.trim\(\),subscribeName:subscriberName/.test(ballot), "only a ticked box sends the voter's name and number");
const service = read("lib/groupPlanService.js");
ok(/command\.subscribeConsent === true \? toE164\(command\.subscribePhone\) : null/.test(service), "the server saves a number only with the consent flag and a valid US number");
ok(/consentText: SMS_SUBSCRIBE_CONSENT_TEXT, consentVersion: SMS_SUBSCRIBE_CONSENT_VERSION/.test(service), "the stored consent wording comes from the server, never the browser");
ok(/!execCmd\.declined/.test(service), "a voter who can't make it isn't signed up");
const route = read("app/api/group-plans/[id]/route.js");
ok(/x-forwarded-for/.test(route) && /user-agent/.test(route), "IP and device are kept as proof of consent");
const sql = read("supabase/migrations/20261128180000_sms_subscribers.sql");
ok(/enable row level security/.test(sql) && /revoke all on public\.wf_sms_subscribers from anon, authenticated/.test(sql), "subscriber list is owner-only (service role)");
ok(/wf_sms_consent_log/.test(sql), "every opt-in and opt-out is logged");

// STOP and HELP.
eq(["STOP", "stop ", "Unsubscribe", "cancel", "END", "quit", "STOPALL", "help", "hello"].map(smsKeyword), ["stop", "stop", "stop", "stop", "stop", "stop", "stop", "help", null], "carrier stop and help words");
const inbound = read("app/api/sms/inbound/route.js");
ok(/validTwilioSignature\(/.test(inbound) && /markSmsUnsubscribed/.test(inbound), "STOP from Twilio (signature checked) unsubscribes the number");

// Privacy and Terms say what the feature does.
const privacy = read("app/privacy/page.js"), terms = read("app/terms/page.js");
ok(privacy.includes("If you pick friends from your contacts, we use them only to help you send your vote invite. We don’t upload or store your contact list."), "privacy: contacts line");
ok(/To make voting easier and more convenient/.test(privacy), "privacy: why contacts are used");
ok(/Reply STOP/.test(privacy) && /Text messages from Wayfind/.test(privacy), "privacy: text messages section");
ok(/<h2 style=\{h2\}>Text messages<\/h2>/.test(terms) && /recurring automated marketing text messages/.test(terms), "terms: text messages section");

console.log(`test-group-vote-quick: OK — ${n} assertions (one screen, swipe rail, sticky Send to group, contacts stay on the phone, opt-in with proof of consent, STOP)`);
