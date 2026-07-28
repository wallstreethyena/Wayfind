// scripts/test-place-suggestions.mjs — locks the v6.53 place-suggestion
// feature ("suggest a place for this list").
//
// Owner (voice/text, paraphrased): the user should be able to tell the app a
// place they think belongs in a particular experience; it gets STORED, and
// after a push the owner reviews reported places and decides whether to add
// them — never auto-published. It should feel like part of exploring, not an
// annoying interruption.
//
// Four things are locked, structurally (same posture as every other server
// route / cron this codebase can't invoke directly without mocking a live
// upstream): the API route's validation + storage-only behavior, the
// middleware guard, the SQL schema's review-not-auto-publish posture, and the
// home.js/HookDetail.js wiring (non-interruptive placement, reuse of the
// guarded Places proxy, never a direct Google/Supabase call from the render
// component).
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-place-suggestions: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

// --- app/api/place-suggestions/route.js -------------------------------------
const routeSrc = readFileSync(new URL("../app/api/place-suggestions/route.js", import.meta.url), "utf8");
const route = stripComments(routeSrc);
ok(route.length > routeSrc.length * 0.25, "stripping comments left the route intact");
ok(/export async function POST\(req\)/.test(route), "the route exports a POST handler");
ok(/import \{ sbEnv \} from "\.\.\/\.\.\/\.\.\/lib\/serverCache"/.test(route), "the route uses the shared service-role env helper, not a hand-rolled Supabase client");
ok(!/SUPABASE_ANON_KEY/.test(route), "the route never touches the anon key — service role only, so RLS can stay fully closed to the public");
ok(/if \(!placeId \|\| !placeName \|\| !KEY_RX\.test\(experienceKey\)\)/.test(route), "placeId, placeName, and experienceKey shape are all validated before anything is stored");
ok(/const KEY_RX = \/\^\[a-z\]\[a-z0-9_-\]\{0,60\}\$\/i;/.test(route), "experienceKey is bounded to the same lowercase/underscore/hyphen shape EXPERIENCES keys already use — never a hardcoded, rot-prone allow-list");
ok(/DEVICE_DAILY_CAP/.test(route) && /total >= DEVICE_DAILY_CAP/.test(route), "a per-device daily cap exists — defense in depth beyond the middleware rate limit");
ok(/rest\/v1\/wf_place_suggestions/.test(route), "the route writes to wf_place_suggestions");
// The insert payload must NEVER include a status field — status defaults to
// 'pending' in the DB (supabase/place-suggestions.sql). A client that could
// set its own status would auto-publish itself, defeating the whole
// review-then-add point of this feature.
const insertBodyAt = route.indexOf("body: JSON.stringify([{");
const insertBodyEnd = insertBodyAt >= 0 ? route.indexOf("}]),", insertBodyAt) : -1;
const insertBody = insertBodyAt >= 0 && insertBodyEnd > insertBodyAt ? route.slice(insertBodyAt, insertBodyEnd) : "";
ok(insertBody.length > 0, "the insert payload block is present");
ok(!/status/.test(insertBody), "the client-supplied insert never sets `status` — every suggestion lands as the DB's own default (pending), never client-chosen");
ok(/place_id: placeId/.test(insertBody) && /experience_key: experienceKey/.test(insertBody), "the stored row keeps the real place id and the experience it was suggested for");

// --- middleware.js: same-origin + rate-limit guard --------------------------
const mw = stripComments(readFileSync(new URL("../middleware.js", import.meta.url), "utf8"));
ok(/"\/api\/place-suggestions"/.test(mw), "middleware.js guards /api/place-suggestions (same-origin + per-IP rate limit) — an unguarded public POST-that-writes-Supabase is exactly the cost/abuse shape this middleware exists to close");
const navSetAt = mw.indexOf("const NAV_302_ROUTES");
const navSetLine = navSetAt >= 0 ? mw.slice(navSetAt, mw.indexOf("\n", navSetAt)) : "";
const imgSetAt = mw.indexOf("const IMAGE_ROUTES");
const imgSetLine = imgSetAt >= 0 ? mw.slice(imgSetAt, mw.indexOf("\n", imgSetAt)) : "";
ok(!navSetLine.includes("place-suggestions") && !imgSetLine.includes("place-suggestions"), "place-suggestions gets the FULL guard (same-origin block + rate limit), not the rate-limit-only carve-out reserved for GET-302 navigations/image proxies");

// --- supabase/place-suggestions.sql: review-then-add, never auto-publish ----
const sql = readFileSync(new URL("../supabase/place-suggestions.sql", import.meta.url), "utf8");
ok(/create table if not exists public\.wf_place_suggestions/.test(sql), "the wf_place_suggestions table is defined");
ok(/status text not null default 'pending'/.test(sql), "every row defaults to pending — nothing is live until an explicit review decision");
ok(/check \(status in \('pending', 'approved', 'rejected'\)\)/.test(sql), "status is constrained to the three real review states");
ok(/enable row level security/.test(sql), "RLS is enabled on the table");
// No public policy at all — grep the whole file for a real (uncommented)
// `create policy` statement; every line mentioning one here must be commented.
const policyLines = sql.split("\n").filter((l) => /create policy/i.test(l));
ok(policyLines.every((l) => /^\s*--/.test(l)), "no active public select/insert/update policy exists — every real access path is the service role in the API route, matching wf_city_requests/verified_offers");
ok(/existing CURATED\+intents mechanism/.test(sql) || /lib\/curated\.js/.test(sql), "the schema's own comments point at the existing curated+intents injection mechanism as the actual publish path — this table is proposals only, never a rendering source");

// --- app/home.js: state + handlers, reused (not re-implemented) Places proxy -
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/const \[sugOpen, setSugOpen\] = useState\(false\);/.test(home), "sugOpen state exists");
ok(/const \[sugPicked, setSugPicked\] = useState\(null\);/.test(home), "sugPicked (the resolved real place) state exists");
// The reset effect: opening a DIFFERENT sheet must clear any suggestion form
// left open in the previous one (else "Thanks!" or a half-typed note could
// bleed into an unrelated list).
const resetAt = home.indexOf("useEffect(() => { const _ps = hookDetail && hookDetail.presetSort;");
const resetLine = resetAt >= 0 ? home.slice(resetAt, home.indexOf("\n", resetAt)) : "";
ok(/setSugOpen\(false\); setSugQuery\(""\); setSugSuggestions\(\[\]\); setSugPicked\(null\); setSugNote\(""\); setSugBusy\(false\); setSugDone\(false\);/.test(resetLine), "the per-sheet reset effect also clears every suggestion-flow field when a different sheet opens");
ok(/\}, \[hookDetail && hookDetail\.id\]\);/.test(resetLine), "the reset is keyed on the sheet's id changing, same dependency the existing hkSort/hkMi reset already uses");

// sugFetchSuggestions must reuse the SAME guarded server proxy the main search
// box uses (never a direct-to-Google call, never a new unguarded endpoint).
const sugFetchAt = home.indexOf("async function sugFetchSuggestions(q)");
ok(sugFetchAt >= 0, "sugFetchSuggestions exists");
const sugFetchBody = sugFetchAt >= 0 ? home.slice(sugFetchAt, home.indexOf("\n  }", sugFetchAt)) : "";
ok(/fetch\("\/api\/places\/autocomplete"/.test(sugFetchBody), "the suggestion search box calls the guarded /api/places/autocomplete proxy — the same one the main search box uses, never Google directly");
ok(/sugTokenRef/.test(sugFetchBody) && !/(?<!sug)tokenRef\.current/.test(sugFetchBody.replace(/sugTokenRef/g, "")), "the suggestion flow uses its OWN session-token ref, never the main search box's tokenRef — the two surfaces can't clobber each other");

const pickAt = home.indexOf("async function pickSugSuggestion(item)");
ok(pickAt >= 0, "pickSugSuggestion exists");
const pickBody = pickAt >= 0 ? home.slice(pickAt, home.indexOf("\n  }", pickAt)) : "";
ok(/await resolvePlaceDetails\(item\.placeId, "place", sessionToken\)/.test(pickBody), "resolving the picked suggestion reuses the existing resolvePlaceDetails function — a real Google place, never free text taken at face value");

const submitAt = home.indexOf("async function submitPlaceSuggestion()");
ok(submitAt >= 0, "submitPlaceSuggestion exists");
const submitBody = submitAt >= 0 ? home.slice(submitAt, home.indexOf("\n  }", submitAt)) : "";
ok(/fetch\("\/api\/place-suggestions"/.test(submitBody), "submission posts to the new /api/place-suggestions route");
ok(/experienceKey: hookDetail\.id/.test(submitBody), "the submission is tagged with the CURRENT sheet's own id — whatever list the user is looking at right now, not a hardcoded key");
ok(/deviceId: deviceId\(\)/.test(submitBody), "the submission carries the app's existing anonymous device id (for the abuse cap), the same helper every other anonymous signal in this app already uses");
ok(!/status:/.test(submitBody), "the client never sends its own status — pending is the DB's decision, not the browser's");

// ctx bag: the new handlers/state actually reach HookDetailSheet.
const ctxAt = home.indexOf("// hookDetail sheet");
const ctxBlock = ctxAt >= 0 ? home.slice(ctxAt, home.indexOf("// account sheet", ctxAt)) : "";
for (const field of ["sugOpen", "setSugOpen", "sugQuery", "onSugQueryChange", "sugSuggestions", "sugPicked", "setSugPicked", "sugNote", "setSugNote", "sugBusy", "sugDone", "pickSugSuggestion", "submitPlaceSuggestion"]) {
  ok(ctxBlock.includes(field), `ctx passes "${field}" down to HookDetailSheet`);
}

// --- app/components/sheets/HookDetail.js: placement + render-only discipline -
const hd = readFileSync(new URL("../app/components/sheets/HookDetail.js", import.meta.url), "utf8");
ok(!/\bfetch\(/.test(hd), "HookDetail.js never calls fetch() itself — it stays a render-only component (per its own header comment), delegating every network call to ctx handlers owned by home.js");
for (const field of ["sugOpen", "setSugOpen", "sugQuery", "onSugQueryChange", "sugSuggestions", "sugPicked", "setSugPicked", "sugNote", "setSugNote", "sugBusy", "sugDone", "pickSugSuggestion", "submitPlaceSuggestion"]) {
  ok(hd.includes(field), `HookDetail.js destructures "${field}" from ctx`);
}
// Position: the suggest block must render AFTER the existing save/share
// footer and the ranked list — i.e. discovered only once someone has already
// scrolled through the list, never as an interrupting popup on open.
const footerAt = hd.indexOf("{/* Bottom save + share actions */}");
const suggestAt = hd.indexOf("{/* Suggest a place for this list");
const mapAt = hd.indexOf("themePlaces.map((p, i) =>");
ok(footerAt >= 0 && suggestAt >= 0 && mapAt >= 0 && mapAt < footerAt && footerAt < suggestAt, "the suggest prompt sits AFTER both the ranked place list and the save/share footer — it's the last thing on the sheet, not an interruption on open");
ok(/!sheetLoading &&/.test(hd.slice(suggestAt, suggestAt + 800)), "the suggest prompt is gated on the list having actually finished loading — it never appears over a loading skeleton");
ok(/📍 Know a place that belongs here\? Suggest it/.test(hd), "the collapsed state is a single low-key line, not a modal/popup — matches \"not annoying... part of the exploring experience\"");
ok(/sugDone \?/.test(hd), "a successfully submitted suggestion shows a quiet thank-you instead of re-showing the form (no re-submit spam within the same sheet visit)");

console.log(`test-place-suggestions: OK — ${pass} assertions (route validates + stores as pending-only; RLS closed to the public; home.js reuses the guarded Places proxy with its own state; HookDetail.js stays render-only and places the prompt after the list, never as an interruption)`);
