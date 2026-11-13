#!/usr/bin/env node
// scripts/test-data-manager-ingest-contract.mjs
//
// Locks the Google Data Manager API `events:ingest` body that Wayfind builds
// for Viator offline booking conversions to Google's OFFICIAL contract, not
// to a shape this repo invented.
//
// Why this exists (2026-11-06): the original builder sent consent as bare
// "GRANTED" / "DENIED" and no `eventSource`. Google's REST reference defines
// `Consent.adUserData` / `adPersonalization` as the `ConsentStatus` enum
// (CONSENT_STATUS_UNSPECIFIED | CONSENT_GRANTED | CONSENT_DENIED), and the
// offline send-events guide lists `eventSource` as required. Either defect
// makes Google reject every upload. The existing attribution suite stayed
// green because it only compared the builder to itself.
//
// Sources:
//   https://developers.google.com/data-manager/api/reference/rest/v1/Consent
//   https://developers.google.com/data-manager/api/reference/rest/v1/events/ingest
//   https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/send-events
//
// Off-box note: this test cannot call Google. It asserts the request body
// against the published contract; a real validate-only receipt still needs
// credentials and a conversion action in account 553-622-6713.
import {
  buildGoogleDataManagerEventPayload,
  buildDataManagerConsent,
  validateDataManagerIngestPayload,
  DATA_MANAGER_CONSENT_STATUSES,
  DATA_MANAGER_EVENT_SOURCES,
  UPLOAD_STATES,
} from "../lib/googleOfflineConversions.js";

let pass = 0;
const fail = [];
function ok(cond, msg) {
  if (cond) pass++;
  else fail.push(msg);
}

// Official enums, written out here (not imported) so a change to the lib's
// constants cannot silently move the target.
const OFFICIAL_CONSENT = ["CONSENT_STATUS_UNSPECIFIED", "CONSENT_GRANTED", "CONSENT_DENIED"];
const OFFICIAL_EVENT_SOURCE = ["WEB", "APP", "IN_STORE", "PHONE", "MESSAGE", "OTHER"];

ok(
  JSON.stringify([...DATA_MANAGER_CONSENT_STATUSES].sort()) === JSON.stringify([...OFFICIAL_CONSENT].sort()),
  "lib ConsentStatus list equals Google's official enum",
);
ok(
  JSON.stringify([...DATA_MANAGER_EVENT_SOURCES].sort()) === JSON.stringify([...OFFICIAL_EVENT_SOURCE].sort()),
  "lib EventSource list equals Google's official enum (EVENT_SOURCE_UNSPECIFIED excluded)",
);

// Fixture only: never written anywhere, never sent. Synthetic identifiers.
const baseBooking = {
  booking_ref: "FIXTURE-BR-1",
  gclid: "FIXTURE_gclid_not_real",
  consent_ad_user_data: "GRANTED",
  consent_ad_personalization: "GRANTED",
  confirmed_commission: 12.34,
  currency: "USD",
  original_booking_at: "2026-11-05T15:00:00Z",
};
const ACTION = "7999000111";

// 1. Granted consent maps to the official enum and eventSource is WEB.
const built = buildGoogleDataManagerEventPayload({ booking: baseBooking, conversionActionId: ACTION });
const ev = built.body && built.body.events && built.body.events[0];
ok(built.eligible === true, "a fully granted fixture booking builds an eligible payload");
ok(ev && ev.eventSource === "WEB", "event carries eventSource WEB");
ok(
  ev && ev.consent && ev.consent.adUserData === "CONSENT_GRANTED" && ev.consent.adPersonalization === "CONSENT_GRANTED",
  "granted consent is sent as CONSENT_GRANTED, never bare GRANTED",
);
if (!built.body) {
  // The builder refused its own output (e.g. its contract check fired). Report
  // that plainly instead of crashing on the assertions below.
  console.error("test-data-manager-ingest-contract: FAIL");
  console.error(`  - builder returned no body for a fully granted fixture: ${JSON.stringify({ status: built.status, reason: built.reason })}`);
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
ok(validateDataManagerIngestPayload(built.body).ok === true, "the built body passes the contract check");
ok(built.body.validateOnly === true, "builder defaults to validateOnly true");

// 2. Every consent value anywhere in the body is an official enum member.
const allConsentValues = [];
for (const e of built.body.events) if (e.consent) allConsentValues.push(...Object.values(e.consent));
if (built.body.consent) allConsentValues.push(...Object.values(built.body.consent));
ok(
  allConsentValues.length > 0 && allConsentValues.every((v) => OFFICIAL_CONSENT.includes(v)),
  "no consent value outside the official ConsentStatus enum",
);

// 3. Unknown ad_personalization is omitted, never invented as DENIED.
const builtUnknownAp = buildGoogleDataManagerEventPayload({
  booking: { ...baseBooking, consent_ad_personalization: "UNKNOWN" },
  conversionActionId: ACTION,
});
const evU = builtUnknownAp.body && builtUnknownAp.body.events[0];
ok(
  evU && evU.consent && evU.consent.adUserData === "CONSENT_GRANTED" && !("adPersonalization" in evU.consent),
  "unknown adPersonalization is omitted rather than reported as denied",
);

// 4. Consent helper: unknown/empty yields null so `consent` is omitted entirely.
ok(buildDataManagerConsent({}) === null, "no known consent -> null (omit the object)");
ok(buildDataManagerConsent({ adUserData: "UNKNOWN", adPersonalization: "" }) === null, "UNKNOWN maps to omission");
const denied = buildDataManagerConsent({ adUserData: "DENIED", adPersonalization: "DENIED" });
ok(denied && denied.adUserData === "CONSENT_DENIED" && denied.adPersonalization === "CONSENT_DENIED", "DENIED maps to CONSENT_DENIED");

// 5. Eligibility gate is unchanged by this fix: not-granted stays blocked.
for (const c of ["UNKNOWN", "DENIED", null]) {
  const r = buildGoogleDataManagerEventPayload({
    booking: { ...baseBooking, consent_ad_user_data: c },
    conversionActionId: ACTION,
  });
  ok(
    r.eligible === false && r.status === UPLOAD_STATES.INELIGIBLE_MISSING_CONSENT,
    `consent_ad_user_data=${c} is still held as ineligible_missing_consent`,
  );
}

// 6. The contract check rejects each defect it exists to catch (red proofs on
//    the protected thing: the request body Google receives).
function mutated(fn) {
  const b = JSON.parse(JSON.stringify(built.body));
  fn(b);
  return validateDataManagerIngestPayload(b);
}
const redProofs = [
  ["bare GRANTED consent (the original defect)", (b) => { b.events[0].consent = { adUserData: "GRANTED", adPersonalization: "DENIED" }; }, "invalid_event_consent"],
  ["missing eventSource (the original defect)", (b) => { delete b.events[0].eventSource; }, "invalid_event_source"],
  ["EVENT_SOURCE_UNSPECIFIED", (b) => { b.events[0].eventSource = "EVENT_SOURCE_UNSPECIFIED"; }, "invalid_event_source"],
  ["empty consent object", (b) => { b.events[0].consent = {}; }, "invalid_event_consent"],
  ["unknown consent key", (b) => { b.events[0].consent = { adStorage: "CONSENT_GRANTED" }; }, "invalid_event_consent"],
  ["bare GRANTED at request level", (b) => { b.consent = { adUserData: "GRANTED" }; }, "invalid_request_consent"],
  ["non-boolean validateOnly", (b) => { b.validateOnly = "true"; }, "validate_only_not_boolean"],
  ["wrong account type", (b) => { b.destinations[0].operatingAccount.accountType = "GOOGLE_ANALYTICS_PROPERTY"; }, "invalid_operating_account"],
  ["hyphenated customer id", (b) => { b.destinations[0].operatingAccount.accountId = "553-622-6713"; }, "invalid_operating_account"],
  ["non-numeric conversion action", (b) => { b.destinations[0].productDestinationId = "AW-18342267447/abc"; }, "invalid_product_destination_id"],
  ["no click identifier", (b) => { b.events[0].adIdentifiers = {}; }, "missing_ad_identifier"],
  ["negative value", (b) => { b.events[0].conversionValue = -1; }, "invalid_conversion_value"],
  ["lowercase currency", (b) => { b.events[0].currency = "usd"; }, "invalid_currency"],
  ["bad timestamp", (b) => { b.events[0].eventTimestamp = "yesterday"; }, "invalid_event_timestamp"],
  ["over 2000 events", (b) => { b.events = Array.from({ length: 2001 }, () => b.events[0]); }, "too_many_events"],
];
for (const [label, fn, reason] of redProofs) {
  const r = mutated(fn);
  ok(r.ok === false && r.reason === reason, `contract check rejects ${label} with ${reason} (got ${JSON.stringify(r)})`);
}

// 7. Positive control for the mutation helper itself.
ok(mutated(() => {}).ok === true, "unmutated clone still passes (mutation helper is not what fails)");

if (fail.length > 0) {
  console.error("test-data-manager-ingest-contract: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(
  `test-data-manager-ingest-contract: OK (${pass} assertions; body checked against Google's published ConsentStatus/EventSource enums, ${redProofs.length} red proofs; no network call made)`,
);
