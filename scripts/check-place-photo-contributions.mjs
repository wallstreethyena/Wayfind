// STRUCTURAL-ONLY: the control needs a browser Supabase session and real File uploads to
// execute, so this guard pins the source contract; the RLS half is checked by
// check-client-writes-have-policies against lib/policySnapshot.json.
import fs from "node:fs";
import assert from "node:assert/strict";

const ui = fs.readFileSync(new URL("../app/components/PlacePhotoContribution.js", import.meta.url), "utf8");
const detail = fs.readFileSync(new URL("../app/components/sheets/Detail.js", import.meta.url), "utf8");

function ok(v, m) { assert.ok(v, m); }

ok(ui.includes('const BUCKET = "user-media"'), "contributions use the existing private user-media bucket");
ok(/\.from\("wf_user_media"\)\.insert\(rows\.map\(\(r\) => \(\{ \.\.\.r, user_id: user\.id \}\)\)\)/.test(ui), "submission metadata enters wf_user_media carrying the signed-in user's id (RLS: authenticated, user_id = auth.uid())");
ok(/if \(!authReady \|\| !user\?\.id\)/.test(ui), "submitting while signed out opens sign-in instead of writing");
ok(ui.includes('status: "pending"'), "a browser can only create pending submissions");
ok(ui.includes("rights_attested: true"), "the stored moderation metadata records the rights attestation");
ok(ui.includes("Wayfind reviews submissions before publishing"), "the user is told review is required");
ok(ui.includes("Nothing on the place card changes until Wayfind approves a photo"), "pending media never claims to be live");
ok(!ui.includes("wf_place_photo"), "the client cannot write the permanent place-photo table");
ok(!ui.includes("photo_ref"), "the contribution UI cannot alter the Google photo path");
ok(detail.includes('import PlacePhotoContribution from "../PlacePhotoContribution";'), "the detail sheet imports the contribution control");
ok(/<PlacePhotoContribution[\s\S]*?place=\{detail\}/.test(detail), "every normal place detail mounts the contribution control");
ok(/!detail\._event && \(\s*<PlacePhotoContribution/.test(detail), "events do not receive a place-photo submission control");

console.log("check-place-photo-contributions: OK");
