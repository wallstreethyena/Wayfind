// scripts/test-comment-photos.mjs — locks the v6.54 "Community takes" upgrade.
//
// Owner: "the review is capped on characters we should be able to allow the
// user to have more characters and write it longer" + "allow the user to
// also post pictures on the review... no restriction on the characters."
//
// Two things are locked, structurally (same posture as every other client-
// side-write-to-Supabase feature in this codebase, since there's no server
// route to unit test against): the app's own generous cap + photo picker
// (app/components/sheets/Detail.js), and — the part that actually matters for
// "no restriction" requests — that the real enforcement lives in the
// DATABASE, not just the browser, because this write path goes straight from
// the client to Supabase with the user's own session and NO server route in
// between (unlike app/api/place-suggestions, which can validate server-side).
// A client-only cap here would be pure theater against anyone hitting the
// REST API directly with a valid token.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-comment-photos: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// --- supabase/comment-photos.sql: the REAL backstop -------------------------
const sql = readFileSync(new URL("../supabase/comment-photos.sql", import.meta.url), "utf8");
ok(/alter table public\.comments add column if not exists photos jsonb not null default '\[\]'::jsonb;/.test(sql), "photos column added, non-destructive (IF NOT EXISTS, sane default)");
ok(/check \(char_length\(body\) <= 4000\)/.test(sql), "the database itself caps body length — not just the browser's textarea");
ok(/check \(jsonb_array_length\(photos\) <= 4\)/.test(sql), "the database itself caps photo count — not just the browser's picker");
ok(/insert into storage\.buckets \(id, name, public\)/.test(sql) && /'comment-photos', 'comment-photos', true/.test(sql), "a public comment-photos storage bucket is created (public read — a photo on a public comment is not more sensitive than the text next to it)");
ok(/\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/.test(sql), "storage insert/delete policies key off the uploader's OWN auth.uid() folder — this is what actually prevents one user overwriting/deleting another's photos, independent of what the client sends");
// v6.55 (Supabase security advisor, run against the real project after this
// migration first shipped): a bucket marked `public` already serves reads off
// the public CDN URL (see getPublicUrl in Detail.js) WITHOUT going through
// storage.objects RLS at all — a SELECT policy here does nothing for that
// read path. Its only real effect was granting `list`/enumerate access over
// the REST API (public_bucket_allows_listing), letting anyone walk every
// uploader's folder — strictly more exposure than the feature needs, so it
// was dropped rather than kept as unused attack surface.
ok(!/create policy "public read comment photos"/.test(sql), "no SELECT policy on storage.objects for comment-photos — public reads come from the public bucket URL, not RLS, and a SELECT policy would only grant unwanted bucket-listing");
const policyCount = (sql.match(/create policy/g) || []).length;
ok(policyCount === 2, `exactly 2 storage policies exist (own-folder insert, own-folder delete) — read access is via the public bucket URL, not a policy (found ${policyCount})`);

// --- app/home.js: the comment fetch carries photos along -------------------
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/select\("id,place_id,user_id,author,type,body,photos,created_at"\)/.test(home), "the comments fetch selects the new photos column — without this, uploaded photos would never render for anyone");

// --- app/components/sheets/Detail.js: client-side companions ---------------
const hd = readFileSync(new URL("../app/components/sheets/Detail.js", import.meta.url), "utf8");
ok(/const COMMENT_MAX_CHARS = 4000;/.test(hd), "the client's char cap matches the DB constraint exactly (4000) — a mismatch would mean the client silently accepts what the database then rejects, or vice versa");
ok(/const COMMENT_MAX_PHOTOS = 4;/.test(hd), "the client's photo-count cap matches the DB constraint exactly (4)");
ok(/const COMMENT_PHOTO_BUCKET = "comment-photos";/.test(hd), "the client uploads to the same bucket the SQL migration creates");

const taAt = hd.indexOf("<textarea key={detail.id}");
const taTag = taAt >= 0 ? hd.slice(taAt, hd.indexOf("/>", taAt)) : "";
ok(/maxLength=\{COMMENT_MAX_CHARS\}/.test(taTag), "the textarea has a real maxLength — the browser stops accepting input at the cap instead of silently truncating on save (the old bug: v.slice(0, 600) with no client-visible limit at all)");
ok(/onChange=\{\(e\) => setNoteLen\(e\.target\.value\.length\)\}/.test(taTag), "a live character count is tracked as the user types");
ok(/\{noteLen\.toLocaleString\(\)\} \/ \{COMMENT_MAX_CHARS\.toLocaleString\(\)\}/.test(hd), "a visible \"n / 4000\" counter renders — the user can SEE the room they have, unlike the old silent cap");

// Upload path must be scoped under the user's own id — this is what the new
// storage RLS policy (own-folder only) actually authorizes; any other shape
// would be rejected in production regardless of what the client intends.
const uploadFnAt = hd.indexOf("async function uploadPendingPhotos()");
const uploadFnBody = uploadFnAt >= 0 ? hd.slice(uploadFnAt, hd.indexOf("\n  }", uploadFnAt)) : "";
ok(uploadFnBody.length > 0, "uploadPendingPhotos exists");
ok(/const path = `\$\{user\.id\}\//.test(uploadFnBody), "every upload path starts with the uploader's own user id — matches the own-folder storage policy, so uploads actually succeed in production instead of being silently rejected by RLS");
ok(/COMMENT_PHOTO_BUCKET/.test(uploadFnBody), "uploads target the shared bucket constant, not a hardcoded duplicate string that could drift from it");
ok(/if \(!error\) uploaded\.push\(path\);/.test(uploadFnBody), "one failed upload doesn't take down the rest — best-effort, matches this app's fail-soft posture for non-critical writes");

// Save must PRESERVE existing photos on a text-only edit — the actual bug
// class this guards against is a save silently wiping previously uploaded
// photos just because the user only touched the text box.
const saveFnAt = hd.indexOf("async function handleSaveComment()");
const saveFnBody = saveFnAt >= 0 ? hd.slice(saveFnAt, hd.indexOf("\n  }", saveFnAt)) : "";
ok(saveFnBody.length > 0, "handleSaveComment exists");
ok(/const photos = \[\.\.\.existingPhotoUrls, \.\.\.uploaded\]\.slice\(0, COMMENT_MAX_PHOTOS\);/.test(saveFnBody), "the saved photo set is EXISTING photos plus newly uploaded ones — editing text alone can never silently drop photos the user never touched");
ok(/body: v,/.test(saveFnBody) && !/body: v\.slice/.test(saveFnBody), "the upsert sends the FULL (already client-capped) text — no second silent truncation on top of the maxLength/DB cap");
ok(/photos,/.test(saveFnBody), "the upsert includes the photos array");

// Delete must clear local photo state AND best-effort remove the storage
// objects — otherwise a deleted comment leaves orphaned images (or a stale
// photo strip that reappears if the user starts a new post for this place).
const delFnAt = hd.indexOf("function handleDeleteComment()");
const delFnBody = delFnAt >= 0 ? hd.slice(delFnAt, hd.indexOf("\n  }", delFnAt)) : "";
ok(delFnBody.length > 0, "handleDeleteComment exists");
ok(/supabase\.storage\.from\(COMMENT_PHOTO_BUCKET\)\.remove\(existingPhotoUrls\)/.test(delFnBody), "deleting a comment also best-effort removes its uploaded photos from storage");
ok(/setExistingPhotoUrls\(\[\]\);/.test(delFnBody), "deleting a comment clears the local photo picker state — a stale thumbnail can't survive a delete");

// Reset-on-place-change: an attached-but-unsaved photo must never silently
// ride along to a DIFFERENT place's review.
const resetAt = hd.indexOf("setPendingPhotos((prev) => { prev.forEach((p) => { try { URL.revokeObjectURL(p.previewUrl); } catch (e) {} }); return []; });\n    const mine =");
ok(resetAt >= 0, "the per-place reset effect clears any unsaved pending photos (and revokes their object URLs, avoiding a memory leak) the moment the sheet opens a different place");

// A photo-only post (no text) must still be treated as real content, not
// silently discarded as if the box were empty.
ok(/const hasNewContent = !!\(v \|\| pendingPhotos\.length\);/.test(saveFnBody), "a post with photos but no text still counts as content worth saving/posting — the feature isn't text-only");

console.log(`test-comment-photos: OK — ${pass} assertions (DB-level char + photo caps are the real backstop; client caps mirror them exactly; own-folder storage RLS; edits never silently drop existing photos; delete cleans up storage)`);
