// Pure group-plan state machine. Caller authenticates the actor and persists
// returned state with CAS; membership checks here are not authentication.
import { assertGroupTimeZone, GroupPlanTimeError } from './groupPlanTime.js';

const DAY = 24 * 60 * 60 * 1000;
const MAX_PARTICIPANT_COMMANDS = 8;
const MAX_ORDINARY_OWNER_COMMANDS = 18;
const MAX_RECEIPTS = 100; // 10 * 8 participant + 18 ordinary owner + 2 terminal.
const OWN = Object.prototype.hasOwnProperty;
const PUBLIC_PLACE_FIELDS = ['id', 'name', 'address', 'formatted_address', 'city', 'region', 'category', 'type', 'types', 'photo', 'photoUrl', 'image', 'imageUrl', 'lat', 'lng', 'latitude', 'longitude', 'location', 'website', 'url', 'placeUrl'];

export class GroupPlanError extends Error {
  constructor(code, message, details = {}, status = 400) {
    super(message);
    this.name = 'GroupPlanError';
    this.code = code;
    this.details = details;
    this.status = status;
    this.statusCode = status;
  }
}

function fail(code, message, details, status) { throw new GroupPlanError(code, message, details, status); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('INVALID_INPUT', `${label} must be a plain object.`);
}
function text(value, label, max = 256) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail('INVALID_INPUT', `${label} must be a nonempty text value of at most ${max} characters.`);
  return value.trim();
}
function identifier(value, label) { return text(value, label, 256); }
function clone(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(clone);
  object(value, 'Stored metadata');
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('INVALID_INPUT', 'Unsafe metadata field.');
    if (typeof item !== 'undefined') result[key] = clone(item);
  }
  return result;
}
function utc(value, label) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) fail('INVALID_DATE', `${label} must be a real timestamp.`);
    return value.toISOString();
  }
  if (typeof value !== 'string') fail('INVALID_DATE', `${label} must be a timestamp with an explicit UTC offset.`);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(?:(\d{2})(?:\.(\d{1,3}))?)(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) fail('INVALID_DATE', `${label} must be a timestamp with an explicit UTC offset.`);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const check = new Date(0);
  check.setUTCFullYear(year, month - 1, day);
  check.setUTCHours(hour, minute, second, 0);
  if (year < 1 || check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second || (match[10] && (+match[10] > 23 || +match[11] > 59))) fail('INVALID_DATE', `${label} must be a real calendar timestamp.`); // one-clock-ok: validate supplied calendar fields, never infer a daypart or read the current hour.
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail('INVALID_DATE', `${label} must be a real timestamp.`);
  return new Date(timestamp).toISOString();
}
function nowValue(options) { return utc(options?.now, 'now'); }
function uniqueIds(ids, allowedIds, label) {
  if (!Array.isArray(ids)) fail('INVALID_INPUT', `${label} must be an array.`);
  const result = ids.map((id) => identifier(id, label));
  if (new Set(result).size !== result.length) fail('DUPLICATE_TIME', `${label} must not contain duplicate IDs.`);
  if (result.some((id) => !allowedIds.includes(id))) fail('INVALID_TIME', `${label} contains a time outside this plan.`);
  // Canonical proposal order makes response semantics independent of UI order.
  return allowedIds.filter((id) => result.includes(id));
}
function generatedIds(ids, count, id, kind) {
  const result = ids === undefined ? Array.from({ length: count }, (_, i) => `${id}:${kind}:${i + 1}`) : ids;
  if (!Array.isArray(result) || result.length !== count) fail('INVALID_IDS', `${kind} IDs must match the number of entries.`);
  const values = result.map((value) => identifier(value, `${kind} ID`));
  if (new Set(values).size !== count) fail('INVALID_IDS', `${kind} IDs must be unique.`);
  return values;
}
function checkPlan(plan) {
  object(plan, 'Plan');
  if (plan.schemaVersion !== 1 || !Number.isSafeInteger(plan.revision) || plan.revision < 1 || !['draft', 'open', 'closed', 'cancelled', 'finalized'].includes(plan.status) || !Array.isArray(plan.invitees) || !plan.invitees.length || plan.invitees.length > 10 || !Array.isArray(plan.places) || !Array.isArray(plan.times) || !Array.isArray(plan.recentCommands) || plan.recentCommands.length > MAX_RECEIPTS) fail('INVALID_PLAN', 'The stored group plan has an invalid schema.');
}
function slotFor(plan, slotId) {
  const slot = plan.invitees.find((item) => item.id === slotId);
  if (!slot) fail('INVALID_SLOT', 'This invite does not belong to the group plan.', {}, 404);
  return slot;
}

export function createGroupPlan(input, options = {}) {
  object(input, 'Plan input');
  const createdAt = nowValue(options);
  const now = Date.parse(createdAt);
  const id = identifier(options.id, 'Plan ID');
  const ownerId = identifier(input.ownerId, 'Owner ID');
  const organizerName = text(input.organizerName ?? 'Organizer', 'Organizer name', 80);
  try { assertGroupTimeZone(input.timeZone); } catch (error) { if (error instanceof GroupPlanTimeError) fail(error.code, error.message); throw error; }
  const deadline = utc(input.deadline, 'Deadline');
  if (Date.parse(deadline) <= now || Date.parse(deadline) > now + 14 * DAY) fail('INVALID_DEADLINE', 'The deadline must be in the future and within 14 days.');
  if (!Array.isArray(input.invitees) || input.invitees.length < 1 || input.invitees.length > 10) fail('INVALID_INVITEE_COUNT', 'Invite between 1 and 10 people, excluding the organizer.');
  const slotIds = generatedIds(options.slotIds, input.invitees.length, id, 'guest');
  const invitees = input.invitees.map((invitee, i) => {
    object(invitee, 'Invitee');
    return { id: slotIds[i], name: text(invitee.name, 'Invitee name', 80), response: null, inviteVersion: 1, shareInitiatedAt: null };
  });
  if (!Array.isArray(input.places) || input.places.length < 1 || input.places.length > 3) fail('INVALID_PLACE_COUNT', 'Choose between 1 and 3 places.');
  const places = input.places.map((place) => {
    object(place, 'Place');
    return { ...clone(place), id: identifier(place.id, 'Place ID'), name: text(place.name, 'Place name', 160) };
  });
  if (new Set(places.map((place) => place.id)).size !== places.length) fail('DUPLICATE_PLACE', 'Each proposed place must be unique.');
  const originalPlaceId = identifier(input.originalPlaceId, 'Original place ID');
  if (places[0].id !== originalPlaceId) fail('INVALID_ORIGINAL_PLACE', 'The original place must be the first proposed place.');
  if (!Array.isArray(input.times) || input.times.length < 1 || input.times.length > 3) fail('INVALID_TIME_COUNT', 'Choose between 1 and 3 times.');
  const timeIds = generatedIds(options.timeIds, input.times.length, id, 'time');
  const times = input.times.map((time, i) => {
    object(time, 'Time');
    const startsAt = utc(time.startsAt, 'Start time');
    const endsAt = utc(time.endsAt, 'End time');
    const start = Date.parse(startsAt), end = Date.parse(endsAt);
    if (start <= Date.parse(deadline)) fail('INVALID_DEADLINE', 'The deadline must be strictly before every proposed time.');
    if (end <= start || end > now + 90 * DAY) fail('INVALID_INTERVAL', 'Each outing must end after it starts and within 90 days.');
    return { id: timeIds[i], startsAt, endsAt };
  });
  for (let i = 0; i < times.length; i++) {
    for (let j = i + 1; j < times.length; j++) {
      if (times[i].startsAt < times[j].endsAt && times[j].startsAt < times[i].endsAt) fail('OVERLAPPING_TIMES', 'Proposed times must be unique and must not overlap.');
    }
  }
  const availableTimeIds = input.organizerAvailableTimeIds === undefined ? [...timeIds] : uniqueIds(input.organizerAvailableTimeIds, timeIds, 'Organizer availability');
  return {
    schemaVersion: 1, id, revision: 1, ownerId, organizerName, createdAt, deadline,
    timeZone: input.timeZone, status: 'draft', startedAt: null, closedAt: null, closeReason: null,
    originalPlaceId, places, times, invitees, organizer: { availableTimeIds }, finalPlan: null, recentCommands: [],
  };
}

/** Same object for no-op reads; a new revision only for a real expiration. */
export function settleGroupPlan(plan, options = {}) {
  checkPlan(plan);
  const now = nowValue(options);
  if (plan.status !== 'open') return plan;
  const allResponded = plan.invitees.every((slot) => slot.response !== null);
  const expired = Date.parse(now) >= Date.parse(plan.deadline);
  if (!allResponded && !expired) return plan;
  return { ...plan, revision: plan.revision + 1, status: 'closed', closedAt: expired ? plan.deadline : now, closeReason: expired ? 'deadline' : 'all_responded' };
}

function summaryOf(plan) {
  const responses = plan.invitees.filter((slot) => slot.response !== null).map((slot) => slot.response);
  const attending = responses.filter((response) => !response.declined);
  const expectedCount = plan.invitees.length, responseCount = responses.length;
  const placeResults = plan.places.map((place) => ({ placeId: place.id, votes: attending.filter((response) => response.placeId === place.id).length }));
  const top = Math.max(...placeResults.map((result) => result.votes));
  const leadingPlaceIds = top > 0 ? placeResults.filter((result) => result.votes === top).map((result) => result.placeId) : [];
  const availabilityCounts = plan.times.map((time) => ({ timeId: time.id, count: attending.filter((response) => response.availableTimeIds.includes(time.id)).length, organizerAvailable: plan.organizer.availableTimeIds.includes(time.id) }));
  const respondentCommonTimeIds = attending.length ? availabilityCounts.filter((time) => time.organizerAvailable && time.count === attending.length).map((time) => time.timeId) : [];
  const allResponded = responseCount === expectedCount;
  const commonTimeIds = allResponded && attending.length === expectedCount ? [...respondentCommonTimeIds] : [];
  return {
    expectedCount, responseCount, votedCount: attending.length, declinedCount: responseCount - attending.length,
    pendingCount: expectedCount - responseCount, allResponded, placeResults, leadingPlaceIds,
    winnerPlaceId: leadingPlaceIds.length === 1 ? leadingPlaceIds[0] : null, tie: leadingPlaceIds.length > 1,
    commonTimeIds, respondentCommonTimeIds, availabilityCounts, hasNoOverlap: attending.length > 0 && respondentCommonTimeIds.length === 0,
    status: plan.status, closedAt: plan.closedAt, closeReason: plan.closeReason,
  };
}

export function summarizeGroupPlan(plan, options = {}) { return summaryOf(settleGroupPlan(plan, options)); }

const COMMAND_FIELDS = {
  start: ['slotId'], respond: ['slotId', 'placeId', 'availableTimeIds', 'declined'], withdraw: ['slotId'],
  close: [], cancel: [], finalize: ['placeId', 'timeId', 'acknowledgePartial', 'acknowledgeTie', 'acknowledgeUnavailable', 'acknowledgeVenueHours'],
};
function normalizedCommand(plan, command) {
  object(command, 'Command');
  const id = identifier(command.id, 'Command ID');
  if (!OWN.call(COMMAND_FIELDS, command.type)) fail('INVALID_COMMAND', 'Unknown group-plan command.');
  const allowed = new Set(['id', 'type', 'expectedRevision', ...COMMAND_FIELDS[command.type]]);
  if (Object.keys(command).some((key) => !allowed.has(key))) fail('INVALID_COMMAND_FIELD', 'The command contains an unsupported field.');
  if (command.expectedRevision !== undefined && (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 1)) fail('INVALID_REVISION', 'expectedRevision must be a positive integer.');
  const normalized = { type: command.type };
  if (['respond', 'withdraw'].includes(command.type) || (command.type === 'start' && command.slotId !== undefined)) {
    normalized.slotId = identifier(command.slotId, 'Invite slot ID');
    slotFor(plan, normalized.slotId);
  }
  if (command.type === 'respond') {
    if (command.declined !== undefined && typeof command.declined !== 'boolean') fail('INVALID_RESPONSE', 'declined must be true or false.');
    normalized.declined = command.declined ?? false;
    normalized.availableTimeIds = uniqueIds(command.availableTimeIds, plan.times.map((time) => time.id), 'Availability');
    if (normalized.declined) {
      if (command.placeId !== null || normalized.availableTimeIds.length) fail('INVALID_RESPONSE', 'Declining requires no place vote and no available times.');
      normalized.placeId = null;
    } else {
      normalized.placeId = identifier(command.placeId, 'Place ID');
      if (!plan.places.some((place) => place.id === normalized.placeId)) fail('INVALID_PLACE', 'Choose a place proposed in this plan.');
    }
  }
  if (command.type === 'finalize') {
    normalized.placeId = identifier(command.placeId, 'Final place ID');
    normalized.timeId = identifier(command.timeId, 'Final time ID');
    if (!plan.places.some((place) => place.id === normalized.placeId)) fail('INVALID_PLACE', 'Choose a place proposed in this plan.');
    if (!plan.times.some((time) => time.id === normalized.timeId)) fail('INVALID_TIME', 'Choose a time proposed in this plan.');
    for (const field of ['acknowledgePartial', 'acknowledgeTie', 'acknowledgeUnavailable', 'acknowledgeVenueHours']) {
      if (command[field] !== undefined && typeof command[field] !== 'boolean') fail('INVALID_ACKNOWLEDGMENT', `${field} must be true or false.`);
      normalized[field] = command[field] ?? false;
    }
  }
  return { id, normalized, fingerprint: JSON.stringify(normalized) };
}
function ensureBudget(plan, normalized) {
  const receipts = plan.recentCommands;
  if (receipts.length >= MAX_RECEIPTS) fail('COMMAND_LIMIT', 'This plan has reached its command limit. Start a new plan.', {}, 409);
  if (['respond', 'withdraw'].includes(normalized.type)) {
    if (receipts.filter((receipt) => receipt.actorKey === `participant:${normalized.slotId}`).length >= MAX_PARTICIPANT_COMMANDS) fail('PARTICIPANT_COMMAND_LIMIT', 'This invite has reached its response edit limit.', {}, 429);
  } else if (!['cancel', 'finalize'].includes(normalized.type)) {
    if (receipts.filter((receipt) => receipt.actorKey === 'organizer' && !['cancel', 'finalize'].includes(receipt.type)).length >= MAX_ORDINARY_OWNER_COMMANDS) fail('ORGANIZER_COMMAND_LIMIT', 'This plan has reached its sharing edit limit. You can still finalize or cancel.', {}, 429);
  }
}

export function applyGroupPlanCommand(plan, command, options = {}) {
  checkPlan(plan);
  const now = nowValue(options);
  const { id, normalized, fingerprint } = normalizedCommand(plan, command);
  const receipt = plan.recentCommands.find((entry) => entry.id === id);
  if (receipt) {
    if (receipt.fingerprint !== fingerprint) fail('COMMAND_ID_CONFLICT', 'This command ID was already used for a different action.', {}, 409);
    return plan;
  }
  if (normalized.type === 'close' && plan.status === 'closed') return plan;
  if (command.expectedRevision !== undefined && command.expectedRevision !== plan.revision) fail('REVISION_CONFLICT', 'This plan changed. Refresh it before trying again.', { expectedRevision: command.expectedRevision, actualRevision: plan.revision }, 409);
  const settled = settleGroupPlan(plan, { now });
  // Expiry settlement is the sole revision: closing an already closed plan
  // cannot require a forbidden closed-to-closed persistence transition.
  if (normalized.type === 'close' && settled.status === 'closed') return settled;
  // Terminal cancellation is a natural no-op, not an endlessly growing ledger.
  if (normalized.type === 'cancel' && settled.status === 'cancelled') return settled;
  ensureBudget(settled, normalized);
  const next = clone(settled);
  switch (normalized.type) {
    case 'start': {
      if (!['draft', 'open'].includes(next.status)) fail('PLAN_NOT_OPEN', 'This plan is no longer accepting invitations.', {}, 409);
      if (Date.parse(now) >= Date.parse(next.deadline)) fail('DEADLINE_PASSED', 'The response deadline has passed.', {}, 409);
      if (next.status === 'draft') { next.status = 'open'; next.startedAt = now; }
      if (normalized.slotId) {
        const slot = slotFor(next, normalized.slotId);
        if (!slot.shareInitiatedAt) slot.shareInitiatedAt = now;
      }
      break;
    }
    case 'respond': {
      if (next.status !== 'open') fail('PLAN_NOT_OPEN', 'Responses are locked because this plan is not open.', {}, 409);
      slotFor(next, normalized.slotId).response = { placeId: normalized.placeId, availableTimeIds: [...normalized.availableTimeIds], declined: normalized.declined, respondedAt: now };
      if (next.invitees.every((slot) => slot.response !== null)) { next.status = 'closed'; next.closedAt = now; next.closeReason = 'all_responded'; }
      break;
    }
    case 'withdraw':
      if (next.status !== 'open') fail('PLAN_NOT_OPEN', 'Responses are locked because this plan is not open.', {}, 409);
      slotFor(next, normalized.slotId).response = null;
      break;
    case 'close':
      if (next.status !== 'closed') fail('CANNOT_CLOSE_EARLY', 'The plan closes at its deadline or when every invited person responds.', {}, 409);
      break;
    case 'cancel':
      if (!['draft', 'open', 'closed'].includes(next.status)) fail('CANNOT_CANCEL', 'A finalized plan cannot be cancelled through this command.', {}, 409);
      next.status = 'cancelled'; next.closedAt = now; next.closeReason = 'cancelled'; next.finalPlan = null;
      break;
    case 'finalize': {
      if (next.status !== 'closed') fail('CANNOT_FINALIZE', 'Close the plan before choosing the final outing.', {}, 409);
      const selectedTime = next.times.find((time) => time.id === normalized.timeId);
      if (Date.parse(selectedTime.startsAt) <= Date.parse(now)) fail('OUTING_TIME_PASSED', 'That outing has already started. Start a new plan with a future time.', {}, 409);
      const summary = summaryOf(next);
      if (summary.pendingCount > 0 && !normalized.acknowledgePartial) fail('PARTIAL_ACKNOWLEDGMENT_REQUIRED', 'Some invitees have not responded. Acknowledge the partial result before finalizing.', {}, 409);
      if (summary.tie && !normalized.acknowledgeTie) fail('TIE_ACKNOWLEDGMENT_REQUIRED', 'The place vote is tied. Acknowledge that the organizer is resolving it.', {}, 409);
      const isCommonTime = summary.commonTimeIds.includes(normalized.timeId);
      if (!isCommonTime && !normalized.acknowledgeUnavailable) fail('AVAILABILITY_ACKNOWLEDGMENT_REQUIRED', 'The selected time is not confirmed available for every invitee and the organizer. Acknowledge this before finalizing.', {}, 409);
      next.status = 'finalized';
      next.finalPlan = {
        placeId: normalized.placeId, timeId: normalized.timeId, finalizedAt: now,
        isCommonTime, isPartial: summary.pendingCount > 0, isTie: summary.tie,
        acknowledgePartial: normalized.acknowledgePartial, acknowledgeTie: normalized.acknowledgeTie,
        acknowledgeUnavailable: normalized.acknowledgeUnavailable, acknowledgeVenueHours: normalized.acknowledgeVenueHours,
        confirmedInviteeCount: summary.availabilityCounts.find((time) => time.timeId === normalized.timeId).count,
        expectedInviteeCount: summary.expectedCount, declinedCount: summary.declinedCount,
      };
      break;
    }
    default: fail('INVALID_COMMAND', 'Unknown group-plan command.');
  }
  next.revision = plan.revision + 1;
  next.recentCommands.push({ id, type: normalized.type, actorKey: ['respond', 'withdraw'].includes(normalized.type) ? `participant:${normalized.slotId}` : 'organizer', fingerprint, appliedAt: now });
  return next;
}

function publicPlace(place) {
  const result = {};
  for (const field of PUBLIC_PLACE_FIELDS) {
    if (!OWN.call(place, field)) continue;
    const value = place[field];
    // Metadata is verified server-side, but projection still allows only the
    // display values it understands. Never leak opaque nested credentials.
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) result[field] = value;
    else if (field === 'types' && Array.isArray(value) && value.every((type) => typeof type === 'string')) result[field] = [...value];
    else if (field === 'location' && value && typeof value === 'object' && !Array.isArray(value)) {
      const location = {};
      for (const coordinate of ['lat', 'lng', 'latitude', 'longitude']) if (typeof value[coordinate] === 'number' && Number.isFinite(value[coordinate])) location[coordinate] = value[coordinate];
      if (Object.keys(location).length) result[field] = location;
    }
  }
  return result;
}

/** Invite capability view: deliberately no roster, owner ID, receipts or secrets. */
export function participantPlanView(plan, slotId, options = {}) {
  const settled = settleGroupPlan(plan, options);
  const own = slotFor(settled, slotId);
  return {
    schemaVersion: settled.schemaVersion, id: settled.id, revision: settled.revision,
    organizerName: settled.organizerName, createdAt: settled.createdAt, deadline: settled.deadline,
    timeZone: settled.timeZone, status: settled.status, startedAt: settled.startedAt,
    closedAt: settled.closedAt, closeReason: settled.closeReason, originalPlaceId: settled.originalPlaceId,
    places: settled.places.map(publicPlace), times: clone(settled.times),
    invitee: { id: own.id, name: own.name, response: clone(own.response) },
    summary: summaryOf(settled), finalPlan: clone(settled.finalPlan),
  };
}

export function organizerPlanView(plan, options = {}) {
  const settled = settleGroupPlan(plan, options);
  const view = clone(settled);
  delete view.ownerId;
  delete view.recentCommands;
  return { ...view, summary: summaryOf(settled) };
}
