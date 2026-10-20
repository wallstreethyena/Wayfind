// The guide email the "Sent. Check your inbox" promise depends on (audit 2026-10-20).
import { readFileSync } from "node:fs";
import { guideEmailMessage, sendGuideEmail, GUIDE_EMAIL_FROM } from "../lib/guideEmail.js";

let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const msg = guideEmailMessage("things-to-do-sarasota");
ok(!!msg, "a real guide builds a message");
ok(msg && msg.subject.startsWith("Your guide: "), "subject names the guide");
ok(msg && /The Ringling/.test(msg.text) && /The Ringling/.test(msg.html), "the picks are in the email");
ok(msg && /\/guides\/things-to-do-sarasota\?utm_source=email/.test(msg.text), "links back to the guide, tagged for attribution");
ok(msg && /unsubscribe/i.test(msg.text) && /unsubscribe/i.test(msg.html), "says how to stop");
ok(guideEmailMessage("not-a-guide") === null, "an unknown slug builds nothing");
ok(guideEmailMessage("__proto__") === null && guideEmailMessage("constructor") === null, "prototype keys are not guides");

const calls = [];
const fakeFetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
const quiet = () => {};
let r = await sendGuideEmail({ email: "a@b.co", slug: "things-to-do-sarasota" }, { env: { VERCEL_ENV: "preview", RESEND_API_KEY: "k" }, fetchImpl: fakeFetch, report: quiet });
ok(r.sent === false && r.reason === "preview" && calls.length === 0, "a preview deploy never emails a real person");
r = await sendGuideEmail({ email: "a@b.co", slug: "things-to-do-sarasota" }, { env: { VERCEL_ENV: "production" }, fetchImpl: fakeFetch, report: quiet });
ok(r.reason === "unconfigured" && calls.length === 0, "no key → no send, no throw");
r = await sendGuideEmail({ email: "a@b.co, c@d.co", slug: "things-to-do-sarasota" }, { env: { VERCEL_ENV: "production", RESEND_API_KEY: "k" }, fetchImpl: fakeFetch, report: quiet });
ok(r.reason === "bad_address" && calls.length === 0, "a multi-recipient address is refused");
r = await sendGuideEmail({ email: "Reader@Example.com", slug: "things-to-do-sarasota" }, { env: { VERCEL_ENV: "production", RESEND_API_KEY: "k" }, fetchImpl: fakeFetch, report: quiet });
ok(r.sent === true && calls.length === 1, "production + key + real guide → one send");
const body = calls[0] ? JSON.parse(calls[0].init.body) : {};
ok(calls[0] && calls[0].url === "https://api.resend.com/emails", "sends through Resend");
ok(body.from === GUIDE_EMAIL_FROM && Array.isArray(body.to) && body.to[0] === "reader@example.com", "one lowercased recipient from the Wayfind sender");
ok(calls[0] && /^guide\/[0-9a-f]{40}$/.test(calls[0].init.headers["Idempotency-Key"]), "idempotency key never carries the raw address");
r = await sendGuideEmail({ email: "a@b.co", slug: "things-to-do-sarasota" }, { env: { VERCEL_ENV: "production", RESEND_API_KEY: "k" }, fetchImpl: async () => { throw new Error("down"); }, report: quiet });
ok(r.sent === false && r.reason === "send_failed", "a Resend outage never throws into the signup request");

const route = readFileSync(new URL("../app/api/signup/route.js", import.meta.url), "utf8");
ok(/saved\.isNew && entry\.source === "guide" && emailableRequest\(req\.headers\)/.test(route), "the route mails only a NEW guide signup from a same-origin page");
ok(/resolution=ignore-duplicates,return=representation/.test(route), "newness comes from the database, not from the client");

ok(/sfs === "same-origin"/.test(route) && !/isSameOrigin\(/.test(route), "mailing needs the browser-set Sec-Fetch-Site; a forgeable Referer is not enough");
ok(/await underSendCaps\(entry\.email\)\) await sendGuideEmail/.test(route), "every send is volume-capped from the durable table");
ok(/: Infinity; \/\/ unknown/.test(route), "a failed cap read counts as over the cap (fail closed)");

if (fail.length) { console.error(`test-guide-email: ${fail.length} FAILED`); for (const f of fail) console.error("  ✗ " + f); process.exit(1); }
console.log(`test-guide-email: OK — ${pass} assertions`);
