// Focused executable contract for truthful results, privacy and terminal races.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GroupPlanError, createGroupPlan, applyGroupPlanCommand, settleGroupPlan, summarizeGroupPlan, participantPlanView, organizerPlanView } from '../lib/groupPlan.js';

let count = 0;
const NOW = '2026-10-04T12:00:00.000Z';
const DEADLINE = '2026-10-05T12:00:00.000Z';
const BEFORE = '2026-10-05T11:59:59.999Z';
const LATE = '2026-10-05T12:00:00.001Z';
const options = { now: NOW, id: 'plan-1', slotIds: ['guest-1', 'guest-2'], timeIds: ['time-1', 'time-2'] };
const input = {
  ownerId: 'authenticated-owner', organizerName: 'Host', originalPlaceId: 'place-1',
  places: [{ id: 'place-1', name: 'Original museum', address: 'Public street', privateNote: 'secret-metadata' }, { id: 'place-2', name: 'Alternative park' }],
  invitees: [{ name: 'Alice Private' }, { name: 'Bob Private' }],
  times: [{ startsAt: '2026-10-10T18:00:00Z', endsAt: '2026-10-10T20:00:00Z' }, { startsAt: '2026-10-11T18:00:00Z', endsAt: '2026-10-11T20:00:00Z' }],
  timeZone: 'America/New_York', deadline: DEADLINE,
};
const copy = (x) => structuredClone(x);
const make = (patch = {}, opts = {}) => createGroupPlan({ ...copy(input), ...patch }, { ...options, ...opts });
const apply = (plan, command, now = NOW) => applyGroupPlanCommand(plan, command, { now });
const start = (plan = make()) => apply(plan, { id: 'start', type: 'start' });
const response = (slotId = 'guest-1', patch = {}) => ({ id: `respond-${slotId}`, type: 'respond', slotId, placeId: 'place-1', availableTimeIds: ['time-1'], declined: false, ...patch });
function eq(actual, expected, message) { assert.deepEqual(actual, expected, message); count++; }
function yes(value, message) { assert.ok(value, message); count++; }
function rejects(fn, code) { assert.throws(fn, (error) => error instanceof GroupPlanError && error.code === code, code); count++; }
function freeze(value) { if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item); } return value; }

const original = freeze(make());
eq(original.schemaVersion, 1, 'schema version');
eq(original.status, 'draft', 'draft before explicit sharing');
eq(original.revision, 1, 'initial revision');
eq(original.startedAt, null, 'draft not started');
eq(original.invitees.map((slot) => slot.inviteVersion), [1, 1], 'invite versions');
eq(original.organizer.availableTimeIds, ['time-1', 'time-2'], 'proposing means organizer available by default');
eq(original.times[0].startsAt, '2026-10-10T18:00:00.000Z', 'canonical UTC');
eq(make({}, { slotIds: undefined, timeIds: undefined }).invitees[0].id, 'plan-1:guest:1', 'deterministic generated slots');
eq(make({ organizerAvailableTimeIds: ['time-2'] }).organizer.availableTimeIds, ['time-2'], 'explicit organizer subset');
eq(make({ organizerAvailableTimeIds: [] }).organizer.availableTimeIds, [], 'organizer may disclose no available proposal');
const maxInvitees = Array.from({ length: 10 }, (_, i) => ({ name: `Guest ${i + 1}` }));
eq(make({ invitees: maxInvitees }, { slotIds: undefined }).invitees.length, 10, 'cap accepts ten excluding organizer');
rejects(() => make({ invitees: [...maxInvitees, { name: 'Eleven' }] }, { slotIds: undefined }), 'INVALID_INVITEE_COUNT');
rejects(() => make({ invitees: [] }, { slotIds: [] }), 'INVALID_INVITEE_COUNT');
rejects(() => make({ invitees: [{ name: '' }, { name: 'Bob' }] }), 'INVALID_INPUT');
rejects(() => make({ places: [input.places[0], input.places[0]] }), 'DUPLICATE_PLACE');
rejects(() => make({ places: [] }), 'INVALID_PLACE_COUNT');
eq(make({ places: [...input.places, { id: 'place-3', name: 'Third option' }] }).places.length, 3, 'three proposed places allowed');
eq(make({ invitees: [{ name: 'Only guest' }], times: [input.times[0]] }, { slotIds: ['guest-1'], timeIds: ['time-1'] }).invitees.length, 1, 'one invitee and one time is valid');
eq(make({ times: [...input.times, { startsAt: '2026-10-12T18:00:00Z', endsAt: '2026-10-12T20:00:00Z' }] }, { timeIds: ['time-1', 'time-2', 'time-3'] }).times.length, 3, 'three nonoverlapping times allowed');
rejects(() => make({ times: [...input.times, { startsAt: '2026-10-12T18:00:00Z', endsAt: '2026-10-12T20:00:00Z' }, { startsAt: '2026-10-13T18:00:00Z', endsAt: '2026-10-13T20:00:00Z' }] }, { timeIds: ['time-1', 'time-2', 'time-3', 'time-4'] }), 'INVALID_TIME_COUNT');
eq(make({ deadline: '2026-10-18T12:00:00Z', times: [{ startsAt: '2026-10-19T18:00:00Z', endsAt: '2026-10-19T20:00:00Z' }] }, { timeIds: ['time-1'] }).deadline, '2026-10-18T12:00:00.000Z', 'exact fourteen-day deadline is allowed');
rejects(() => make({ places: [...input.places, { id: 'p3', name: 'Three' }, { id: 'p4', name: 'Four' }] }), 'INVALID_PLACE_COUNT');
rejects(() => make({ originalPlaceId: 'place-2' }), 'INVALID_ORIGINAL_PLACE');
rejects(() => make({}, { slotIds: ['same', 'same'] }), 'INVALID_IDS');
rejects(() => make({}, { timeIds: ['same', 'same'] }), 'INVALID_IDS');
rejects(() => make({}, { slotIds: ['only-one'] }), 'INVALID_IDS');
rejects(() => make({ timeZone: 'Invalid/Zone' }), 'INVALID_TIME_ZONE');
rejects(() => make({ timeZone: '+02:00' }), 'INVALID_TIME_ZONE');
rejects(() => make({ deadline: NOW }), 'INVALID_DEADLINE');
rejects(() => make({ deadline: '2026-10-18T12:00:00.001Z' }), 'INVALID_DEADLINE');
rejects(() => make({ deadline: input.times[0].startsAt }), 'INVALID_DEADLINE');
rejects(() => make({ deadline: '2026-10-05T12:00' }), 'INVALID_DATE');
rejects(() => make({}, { now: undefined }), 'INVALID_DATE');
for (const bad of ['2026-02-30T12:00:00Z', '2026-10-05T24:00:00Z', '2026-10-05T12:60:00Z', '2026-10-05T12:00:60Z', '2026-10-05T12:00:00+24:00']) rejects(() => make({ deadline: bad }), 'INVALID_DATE');
rejects(() => make({ times: [] }, { timeIds: [] }), 'INVALID_TIME_COUNT');
rejects(() => make({ times: [input.times[0], input.times[0]] }), 'OVERLAPPING_TIMES');
rejects(() => make({ times: [{ startsAt: '2026-10-10T19:00:00Z', endsAt: '2026-10-10T20:00:00Z' }, input.times[0]] }), 'OVERLAPPING_TIMES');
rejects(() => make({ times: [{ startsAt: DEADLINE, endsAt: '2026-10-05T13:00:00Z' }] }, { timeIds: ['time-1'] }), 'INVALID_DEADLINE');
rejects(() => make({ times: [{ startsAt: '2026-10-10T19:00:00Z', endsAt: '2026-10-10T19:00:00Z' }] }, { timeIds: ['time-1'] }), 'INVALID_INTERVAL');
rejects(() => make({ times: [{ startsAt: '2027-01-02T11:00:00Z', endsAt: '2027-01-02T12:00:00.001Z' }] }, { timeIds: ['time-1'] }), 'INVALID_INTERVAL');
eq(make({ times: [{ startsAt: '2027-01-02T11:00:00Z', endsAt: '2027-01-02T12:00:00Z' }] }, { timeIds: ['time-1'] }).times.length, 1, 'exact ninety-day ending is allowed');
eq(make({ times: [{ startsAt: '2026-10-10T18:00:00Z', endsAt: '2026-10-10T19:00:00Z' }, { startsAt: '2026-10-10T19:00:00Z', endsAt: '2026-10-10T20:00:00Z' }] }).times.length, 2, 'adjacent intervals are nonoverlapping');
rejects(() => make({ organizerAvailableTimeIds: ['forged'] }), 'INVALID_TIME');
rejects(() => make({ organizerAvailableTimeIds: ['time-1', 'time-1'] }), 'DUPLICATE_TIME');

const open = freeze(start(original));
eq(open.status, 'open', 'sharing starts the plan');
eq(open.startedAt, NOW, 'start clock');
eq(open.revision, 2, 'one command is one revision');
eq(original.status, 'draft', 'creation input is untouched');
const shared = apply(open, { id: 'share-guest', type: 'start', slotId: 'guest-1' });
eq(shared.invitees[0].shareInitiatedAt, NOW, 'records initiation, not actual delivery');
rejects(() => apply(open, { id: 'fake-share', type: 'start', slotId: 'forged' }), 'INVALID_SLOT');
rejects(() => apply(original, response()), 'PLAN_NOT_OPEN');
rejects(() => apply(original, { id: 'late-start', type: 'start' }, DEADLINE), 'DEADLINE_PASSED');
rejects(() => apply(open, { id: 'close-early', type: 'close' }), 'CANNOT_CLOSE_EARLY');
rejects(() => apply(open, { id: 'forged', type: 'respond', slotId: 'not-a-slot', placeId: 'place-1', availableTimeIds: [] }), 'INVALID_SLOT');
rejects(() => apply(open, response('guest-1', { placeId: 'forged' })), 'INVALID_PLACE');
rejects(() => apply(open, response('guest-1', { availableTimeIds: ['forged'] })), 'INVALID_TIME');
rejects(() => apply(open, response('guest-1', { availableTimeIds: ['time-1', 'time-1'] })), 'DUPLICATE_TIME');
rejects(() => apply(open, response('guest-1', { placeId: null })), 'INVALID_INPUT');
rejects(() => apply(open, response('guest-1', { declined: 'true' })), 'INVALID_RESPONSE');
rejects(() => apply(open, response('guest-1', { declined: true })), 'INVALID_RESPONSE');
rejects(() => apply(open, response('guest-1', { declined: true, placeId: null })), 'INVALID_RESPONSE');
rejects(() => apply(open, response('guest-1', { ownerId: 'forged-owner' })), 'INVALID_COMMAND_FIELD');
rejects(() => apply(open, { id: 'replace', type: 'replace-options', places: [] }), 'INVALID_COMMAND');
rejects(() => apply(open, response('guest-1', { expectedRevision: 1 })), 'REVISION_CONFLICT');
rejects(() => apply(open, response('guest-1', { expectedRevision: -1 })), 'INVALID_REVISION');

const oneResponse = freeze(apply(open, response('guest-1', { expectedRevision: open.revision })));
eq(oneResponse.invitees[0].response, { placeId: 'place-1', availableTimeIds: ['time-1'], declined: false, respondedAt: NOW }, 'complete response, no unrelated command fields');
eq(oneResponse.status, 'open', 'awaits every invited slot');
const partial = summarizeGroupPlan(oneResponse, { now: NOW });
eq([partial.expectedCount, partial.responseCount, partial.votedCount, partial.declinedCount, partial.pendingCount], [2, 1, 1, 0, 1], 'partial counts');
eq(partial.commonTimeIds, [], 'partial never implies everyone available');
eq(partial.respondentCommonTimeIds, ['time-1'], 'respondent intersection is separate');
eq(partial.winnerPlaceId, 'place-1', 'sole positive place leader');
eq(partial.placeResults, [{ placeId: 'place-1', votes: 1 }, { placeId: 'place-2', votes: 0 }], 'no fake organizer vote');
const replay = apply(oneResponse, response('guest-1', { expectedRevision: 2 }), LATE);
yes(replay === oneResponse, 'identical replay returns input even with stale expected revision and later time');
rejects(() => apply(oneResponse, response('guest-1', { placeId: 'place-2' })), 'COMMAND_ID_CONFLICT');
const withdrawn = apply(oneResponse, { id: 'withdraw', type: 'withdraw', slotId: 'guest-1' });
eq(withdrawn.invitees[0].response, null, 'withdraw while open');
eq(summarizeGroupPlan(withdrawn, { now: NOW }).responseCount, 0, 'withdraw clears counts');
rejects(() => apply(open, { id: 'withdraw-fake', type: 'withdraw', slotId: 'forged' }), 'INVALID_SLOT');
const noTimes = apply(open, response('guest-1', { availableTimeIds: [] }));
eq(summarizeGroupPlan(noTimes, { now: NOW }).hasNoOverlap, true, 'empty availability truthfully reports known no overlap');

const closed = freeze(apply(oneResponse, response('guest-2')));
eq(closed.status, 'closed', 'last response closes atomically');
eq(closed.revision, oneResponse.revision + 1, 'auto-close is part of response revision');
eq(closed.closeReason, 'all_responded', 'all invited responded');
eq(summarizeGroupPlan(closed, { now: NOW }).commonTimeIds, ['time-1'], 'real universal overlap');
rejects(() => apply(closed, response('guest-1', { id: 'late-edit', placeId: 'place-2' })), 'PLAN_NOT_OPEN');
rejects(() => apply(closed, { id: 'late-withdraw', type: 'withdraw', slotId: 'guest-1' }), 'PLAN_NOT_OPEN');
const withDecline = apply(oneResponse, response('guest-2', { declined: true, placeId: null, availableTimeIds: [] }));
const declineSummary = summarizeGroupPlan(withDecline, { now: NOW });
eq(withDecline.status, 'closed', 'decline is still a completed response');
eq([declineSummary.responseCount, declineSummary.votedCount, declineSummary.declinedCount], [2, 1, 1], 'decline does not create a vote');
eq(declineSummary.commonTimeIds, [], 'decline cannot imply everyone attends');
eq(declineSummary.respondentCommonTimeIds, ['time-1'], 'known attendees may share a time');
const allDeclines = apply(apply(open, response('guest-1', { declined: true, placeId: null, availableTimeIds: [] })), response('guest-2', { declined: true, placeId: null, availableTimeIds: [] }));
const allDeclineSummary = summarizeGroupPlan(allDeclines, { now: NOW });
eq([allDeclineSummary.winnerPlaceId, allDeclineSummary.tie, allDeclineSummary.leadingPlaceIds, allDeclineSummary.commonTimeIds, allDeclineSummary.respondentCommonTimeIds], [null, false, [], [], []], 'zero votes or attendees never produce fictional winner/overlap');
const tiePlan = apply(oneResponse, response('guest-2', { placeId: 'place-2' }));
eq(summarizeGroupPlan(tiePlan, { now: NOW }).leadingPlaceIds, ['place-1', 'place-2'], 'tied positive votes');
eq(summarizeGroupPlan(tiePlan, { now: NOW }).winnerPlaceId, null, 'tie has no automatic winner');
const disjoint = apply(oneResponse, response('guest-2', { availableTimeIds: ['time-2'] }));
eq(summarizeGroupPlan(disjoint, { now: NOW }).hasNoOverlap, true, 'disjoint nondeclined responses');
eq(summarizeGroupPlan(disjoint, { now: NOW }).commonTimeIds, [], 'disjoint has no universal overlap');
const organizerUnavailable = apply(apply(start(make({ organizerAvailableTimeIds: ['time-2'] })), response()), response('guest-2'));
eq(summarizeGroupPlan(organizerUnavailable, { now: NOW }).respondentCommonTimeIds, [], 'organizer availability is included honestly');

const before = settleGroupPlan(oneResponse, { now: BEFORE });
yes(before === oneResponse, 'read before deadline does not mutate or revise');
const expired = settleGroupPlan(oneResponse, { now: DEADLINE });
eq([expired.status, expired.closeReason, expired.closedAt, expired.revision], ['closed', 'deadline', DEADLINE, oneResponse.revision + 1], 'exact deadline closes at deadline');
yes(settleGroupPlan(expired, { now: LATE }) === expired, 'repeated settled read is no-op');
eq(summarizeGroupPlan(oneResponse, { now: DEADLINE }).status, 'closed', 'summary settles stale open plan');
eq(participantPlanView(oneResponse, 'guest-1', { now: DEADLINE }).status, 'closed', 'participant read settles');
eq(organizerPlanView(oneResponse, { now: DEADLINE }).status, 'closed', 'organizer read settles');
rejects(() => apply(oneResponse, response('guest-2'), DEADLINE), 'PLAN_NOT_OPEN');
const deadlineClose = apply(oneResponse, { id: 'deadline-close', type: 'close' }, DEADLINE);
eq(deadlineClose.revision, oneResponse.revision + 1, 'command + expiry is one atomic revision');
eq(deadlineClose.closeReason, 'deadline', 'explicit deadline close');
eq(deadlineClose.recentCommands.length, oneResponse.recentCommands.length, 'expiry close does not add a forbidden closed-to-closed receipt');
yes(apply(closed, { id: 'close-again', type: 'close', expectedRevision: 1 }) === closed, 'already closed close is a true terminal no-op');
rejects(() => apply(closed, { id: 'start', type: 'close' }), 'COMMAND_ID_CONFLICT');

const finalize = (patch = {}) => ({ id: 'finalize', type: 'finalize', placeId: 'place-1', timeId: 'time-1', ...patch });
rejects(() => apply(open, finalize()), 'CANNOT_FINALIZE');
rejects(() => apply(closed, finalize({ placeId: 'forged' })), 'INVALID_PLACE');
rejects(() => apply(closed, finalize({ timeId: 'forged' })), 'INVALID_TIME');
rejects(() => apply(expired, finalize(), LATE), 'PARTIAL_ACKNOWLEDGMENT_REQUIRED');
rejects(() => apply(expired, finalize({ acknowledgePartial: true }), LATE), 'AVAILABILITY_ACKNOWLEDGMENT_REQUIRED');
rejects(() => apply(tiePlan, finalize()), 'TIE_ACKNOWLEDGMENT_REQUIRED');
rejects(() => apply(disjoint, finalize()), 'AVAILABILITY_ACKNOWLEDGMENT_REQUIRED');
rejects(() => apply(withDecline, finalize()), 'AVAILABILITY_ACKNOWLEDGMENT_REQUIRED');
rejects(() => apply(organizerUnavailable, finalize()), 'AVAILABILITY_ACKNOWLEDGMENT_REQUIRED');
rejects(() => apply(closed, finalize({ acknowledgePartial: 'true' })), 'INVALID_ACKNOWLEDGMENT');
rejects(() => apply(closed, finalize({ acknowledgeVenueHours: 'true' })), 'INVALID_ACKNOWLEDGMENT');
rejects(() => apply(closed, finalize({ acknowledgeVenueHours: 1 })), 'INVALID_ACKNOWLEDGMENT');
eq(apply(closed, finalize({ acknowledgeVenueHours: true })).finalPlan.acknowledgeVenueHours, true, 'venue-hours uncertainty acknowledgment stored independently of attendee availability');
rejects(() => apply(closed, finalize(), '2026-10-10T18:00:00Z'), 'OUTING_TIME_PASSED');
rejects(() => apply(closed, finalize(), '2026-10-10T21:00:00Z'), 'OUTING_TIME_PASSED');
eq(apply(organizerUnavailable, finalize({ acknowledgeUnavailable: true })).finalPlan.isCommonTime, false, 'organizer-unavailable selected time needs explicit truthful acknowledgment');
const final = apply(closed, finalize());
eq([final.status, final.finalPlan.isCommonTime, final.finalPlan.isPartial, final.finalPlan.isTie], ['finalized', true, false, false], 'honest complete final plan');
eq([final.finalPlan.confirmedInviteeCount, final.finalPlan.expectedInviteeCount], [2, 2], 'real attendance confirmation scope');
yes(apply(final, finalize()) === final, 'finalize replay is idempotent');
eq(final.finalPlan.acknowledgeVenueHours, false, 'pure domain does not invent or require venue-hours evidence');
rejects(() => apply(final, finalize({ acknowledgeVenueHours: true })), 'COMMAND_ID_CONFLICT');
const venueAcknowledged = apply(closed, finalize({ acknowledgeVenueHours: true }));
yes(apply(venueAcknowledged, finalize({ acknowledgeVenueHours: true })) === venueAcknowledged, 'acknowledged venue-hours finalize replay is idempotent');
rejects(() => apply(final, finalize({ id: 'finalize-again' })), 'CANNOT_FINALIZE');
rejects(() => apply(final, { id: 'cancel-final', type: 'cancel' }), 'CANNOT_CANCEL');
const partialFinal = apply(expired, finalize({ acknowledgePartial: true, acknowledgeUnavailable: true }), LATE);
eq([partialFinal.finalPlan.isCommonTime, partialFinal.finalPlan.isPartial, partialFinal.finalPlan.confirmedInviteeCount], [false, true, 1], 'partial choice is disclosed never unanimous');
const tieFinal = apply(tiePlan, finalize({ acknowledgeTie: true }));
eq(tieFinal.finalPlan.isTie, true, 'organizer tie resolution remains disclosed');
const declineFinal = apply(withDecline, finalize({ acknowledgeUnavailable: true }));
eq([declineFinal.finalPlan.isCommonTime, declineFinal.finalPlan.declinedCount], [false, 1], 'decline remains disclosed in final choice');
for (const source of [original, open, closed]) {
  const cancelled = apply(source, { id: 'cancel', type: 'cancel' });
  eq([cancelled.status, cancelled.closeReason], ['cancelled', 'cancelled'], 'cancel draft/open/closed');
  yes(apply(cancelled, { id: 'cancel-again', type: 'cancel' }) === cancelled, 'terminal cancellation natural no-op');
  rejects(() => apply(cancelled, finalize()), 'CANNOT_FINALIZE');
}

const participant = participantPlanView(oneResponse, 'guest-1', { now: NOW });
eq(participant.invitee.name, 'Alice Private', 'own name is visible');
const participantJSON = JSON.stringify(participant);
for (const secret of ['Bob Private', 'authenticated-owner', 'secret-metadata', 'recentCommands', 'shareInitiatedAt', 'inviteVersion']) yes(!participantJSON.includes(secret), `participant excludes ${secret}`);
yes(!('invitees' in participant) && !('ownerId' in participant) && !('recentCommands' in participant), 'participant has no roster/owner/receipt fields');
rejects(() => participantPlanView(oneResponse, 'forged', { now: NOW }), 'INVALID_SLOT');
const organizer = organizerPlanView(oneResponse, { now: NOW });
eq(organizer.invitees[1].name, 'Bob Private', 'organizer owns roster');
yes(!('ownerId' in organizer) && !('recentCommands' in organizer), 'organizer projection excludes persistence internals');
participant.invitee.response.availableTimeIds.push('mutated'); participant.places[0].name = 'mutated'; participant.times[0].startsAt = 'mutated'; participant.summary.placeResults[0].votes = 999; organizer.invitees[0].name = 'mutated';
eq(oneResponse.invitees[0].response.availableTimeIds, ['time-1'], 'response projection cannot mutate source');
eq(oneResponse.places[0].name, 'Original museum', 'place projection cannot mutate source');
eq(oneResponse.times[0].startsAt, '2026-10-10T18:00:00.000Z', 'time projection cannot mutate source');
eq(oneResponse.invitees[0].name, 'Alice Private', 'organizer projection cannot mutate source');
const nestedMetadata = make({ places: [{ id: 'place-1', name: 'Original', location: { lat: 28, lng: -82, ownerId: 'nested-secret-owner' }, photo: { url: 'public-image', token: 'nested-secret-token' }, types: ['museum'] }] });
const nestedPublic = participantPlanView(nestedMetadata, 'guest-1', { now: NOW });
eq(nestedPublic.places[0].location, { lat: 28, lng: -82 }, 'nested location coordinates are allowlisted');
eq(nestedPublic.places[0].types, ['museum'], 'public array metadata independently copied');
yes(!JSON.stringify(nestedPublic).includes('nested-secret'), 'opaque nested metadata never leaks through public fields');
const mutableInput = copy(input); const independent = createGroupPlan(mutableInput, options); mutableInput.places[0].privateNote = 'changed'; mutableInput.invitees[0].name = 'changed';
eq(independent.places[0].privateNote, 'secret-metadata', 'verified metadata is independently copied');
eq(independent.invitees[0].name, 'Alice Private', 'input roster independently copied');

// Hostile edits are isolated to the slot; organizer terminal actions stay usable.
let budget = start();
for (let i = 0; i < 8; i++) budget = apply(budget, response('guest-1', { id: `guest-edit-${i}`, placeId: i % 2 ? 'place-2' : 'place-1' }));
rejects(() => apply(budget, response('guest-1', { id: 'guest-edit-9' })), 'PARTICIPANT_COMMAND_LIMIT');
const healthyOther = apply(budget, response('guest-2'));
eq(healthyOther.status, 'closed', 'hostile slot budget does not block healthy invite');
eq(apply(healthyOther, finalize({ acknowledgeTie: true })).status, 'finalized', 'hostile slot budget does not block finalizing');
eq(apply(budget, { id: 'cancel-after-budget', type: 'cancel' }).status, 'cancelled', 'hostile slot budget does not block cancelling');
let largest = start(make({ invitees: maxInvitees }, { slotIds: undefined }));
for (let i = 0; i < 17; i++) largest = apply(largest, { id: `owner-share-${i}`, type: 'start' });
rejects(() => apply(largest, { id: 'owner-share-over', type: 'start' }), 'ORGANIZER_COMMAND_LIMIT');
for (let guest = 0; guest < 10; guest++) {
  const slotId = `plan-1:guest:${guest + 1}`;
  for (let i = 0; i < 7; i++) largest = apply(largest, { id: `withdraw-${guest}-${i}`, type: 'withdraw', slotId });
}
for (let guest = 0; guest < 10; guest++) largest = apply(largest, response(`plan-1:guest:${guest + 1}`, { id: `last-${guest}` }));
eq(largest.recentCommands.length, 98, 'receipt ledger bounded with terminal capacity reserved');
const hugeFinal = apply(largest, finalize());
eq(hugeFinal.recentCommands.length, 99, 'finalization fits reserved ledger capacity');
yes(apply(hugeFinal, { id: 'withdraw-0-0', type: 'withdraw', slotId: 'plan-1:guest:1' }) === hugeFinal, 'oldest successful command is still replay-safe, never evicted');
rejects(() => apply(hugeFinal, { id: 'withdraw-0-0', type: 'withdraw', slotId: 'plan-1:guest:2' }), 'COMMAND_ID_CONFLICT');
const source = readFileSync(new URL('../lib/groupPlan.js', import.meta.url), 'utf8');
yes(!/Date\.now\(|Math\.random\(|fetch\(|process\.env/.test(source), 'domain has no ambient clock/random/network/config');
console.log(`test-group-plan: ${count} assertions passed`);
