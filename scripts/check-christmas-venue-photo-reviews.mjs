#!/usr/bin/env node
// Locks lib/christmasVenuePhotoReviews.js and the card step that uses it
// (withReviewedVenuePhoto in lib/christmasTickets.js).
// EXECUTES the real step with injected store readers; never touches the network.
//   - only the exact reviewed version of an ACCEPTED venue fills an empty event card
//   - a refreshed photo (other version), a rejected venue, a held event, a place
//     card, and a card that already shows a photo are all left alone (controls)
//   - the review list itself is well formed and never accepts and rejects one venue
import assert from "node:assert/strict";
import { CHRISTMAS_VENUE_PHOTO_ACCEPTED, CHRISTMAS_VENUE_PHOTO_REJECTED, reviewedVenuePhoto } from "../lib/christmasVenuePhotoReviews.js";
import { withReviewedVenuePhoto, withBrowseTicketPhotos } from "../lib/christmasTickets.js";
import { CHRISTMAS_INTENT_IMAGE_HOLDS } from "../lib/fallEventImage.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const HEX = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_-]{10,}$/;

// 1. The list is well formed.
const accepted = Object.entries(CHRISTMAS_VENUE_PHOTO_ACCEPTED);
const rejected = Object.entries(CHRISTMAS_VENUE_PHOTO_REJECTED);
ok(accepted.length >= 1 && rejected.length >= 1, "both lists have entries (a list emptied by accident is caught)");
for (const [pid, e] of accepted) {
  ok(ID.test(pid) && HEX.test(e.version) && e.venue && e.shows && e.shows.length >= 10 && Array.isArray(e.events), pid + ": accepted entry needs place id, 64 hex version, venue, what it shows, events");
  ok(/christmas|holiday|tree|lights?\b/i.test(e.shows), pid + ": an accepted photo must show the holiday itself (batch 11x rule), not a year round venue shot");
  ok(!(pid in CHRISTMAS_VENUE_PHOTO_REJECTED), pid + ": a venue cannot be both accepted and rejected");
}
for (const [pid, e] of rejected) ok(ID.test(pid) && HEX.test(e.version) && e.reason && e.reason.length >= 10, pid + ": rejected entry needs a written reason");

// 2. The matcher answers only for the exact reviewed photo.
const [PID, ACC] = accepted[0];
const good = "/api/photo/stored/" + PID + "?v=" + ACC.version;
ok(reviewedVenuePhoto(PID, good) === true, "the reviewed version matches");
ok(reviewedVenuePhoto(PID, "/api/photo/stored/" + PID + "?v=" + "0".repeat(64)) === false, "a refreshed version does not match");
ok(reviewedVenuePhoto(PID, "/api/photo/stored/OtherPlace12345?v=" + ACC.version) === false, "the same version under another place does not match");
const [RPID, REJ] = rejected[0];
ok(reviewedVenuePhoto(RPID, "/api/photo/stored/" + RPID + "?v=" + REJ.version) === false, "a rejected venue never matches");

// 3. The real card step.
const stored = (pid, version) => async (id) => (id === pid ? { src: "/api/photo/stored/" + pid + "?v=" + version, width: 1280, height: 853, source: "google", credit: { authors: [{ name: "A Photographer", uri: "https://maps.google.com/x" }] } } : null);
const base = { noMemo: true, readVault: async () => [] };
const ev = (over = {}) => ({ kind: "event", id: "test-event-2026", title: "Test Lighting", name: "Test Lighting", venue: ACC.venue, place_id: PID, image: null, photos: [], ...over });

const filled = await withReviewedVenuePhoto(ev(), { ...base, readGoogle: stored(PID, ACC.version) });
ok(filled.photos.length === 1 && filled.photos[0].src === good, "an empty event card at an accepted venue gets the reviewed photo");
ok(/A Photographer/.test(filled.photos[0].credit) && /Google Maps/.test(filled.photos[0].credit), "the photo keeps its visible credit");
const tix = await withReviewedVenuePhoto(ev({ ticketRow: { cta: { href: "x" }, photos: [] } }), { ...base, readGoogle: stored(PID, ACC.version) });
ok(tix.ticketRow.photos.length === 1 && tix.ticketRow.photos[0].src === good, "a ticketed card's ticket row gets the same photo");

const refreshed = await withReviewedVenuePhoto(ev(), { ...base, readGoogle: stored(PID, "1".repeat(64)) });
ok(refreshed.photos.length === 0, "control: an unreviewed refreshed photo is not shown");
const rej = await withReviewedVenuePhoto(ev({ place_id: RPID, venue: REJ.venue }), { ...base, readGoogle: stored(RPID, REJ.version) });
ok(rej.photos.length === 0, "control: a rejected venue's photo is not shown");
const held = [...CHRISTMAS_INTENT_IMAGE_HOLDS][0];
ok(held, "probe: the hold list has a member to test with");
const heldOut = await withReviewedVenuePhoto(ev({ id: held }), { ...base, readGoogle: stored(PID, ACC.version) });
ok(heldOut.photos.length === 0, "control: a held event never borrows a venue photo");
let asked = 0;
const counting = async (id) => { asked += 1; return stored(PID, ACC.version)(id); };
const hasPhoto = await withReviewedVenuePhoto(ev({ image: "/events/christmas/x.webp" }), { ...base, readGoogle: counting });
ok(hasPhoto.image === "/events/christmas/x.webp" && hasPhoto.photos.length === 0 && asked === 0, "control: a card that already shows a photo is untouched and the store is not asked");
const place = await withReviewedVenuePhoto(ev({ kind: "place" }), { ...base, readGoogle: counting });
ok(place.photos.length === 0 && asked === 0, "control: place cards use their own fallback, not this list");
const noPlace = await withReviewedVenuePhoto(ev({ place_id: null }), { ...base, readGoogle: counting });
ok(noPlace.photos.length === 0 && asked === 0, "control: no venue id, no lookup");

// 4. Wired into the page step the Christmas page and its API both call.
const page = await withBrowseTicketPhotos({ cards: [ev()], total: 1 }, [ev()], "2026-11-20", new Map(), { ...base, readTagged: async () => [], readGoogle: stored(PID, ACC.version), servable: { noMemo: true, resolve: async () => ({ type: "redirect", location: "keep" }), findFree: async () => null } });
ok(page.cards[0].photos && page.cards[0].photos[0] && page.cards[0].photos[0].src === good, "withBrowseTicketPhotos fills the empty event card through the reviewed step");

console.log("check-christmas-venue-photo-reviews: OK, " + n + " assertions (" + accepted.length + " accepted venues, " + rejected.length + " rejected with reasons; real withReviewedVenuePhoto and withBrowseTicketPhotos executed)");
