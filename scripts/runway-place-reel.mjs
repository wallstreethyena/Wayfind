#!/usr/bin/env node
// scripts/runway-place-reel.mjs — OPERATOR-RUN: animate one real place photo
// into a vertical social reel with Runway Dev (POST /v1/image_to_video). NOT a
// cron and NOT an API route — the owner runs it by hand because every
// generation spends Runway credits (and a moderated generation is billed too).
//
//   1. NEVER SPENDS WITHOUT --confirm. The default run validates the request
//      with lib/runwayReel.buildReelRequest, prints it and exits 0 having made
//      ZERO calls to api.dev.runwayml.com. Costs: guides/pricing.md only.
//   2. ONE SUBMIT, NO RESUBMIT. The SDK's waitForTaskOutput() does the polling
//      with backoff; a FAILED task (incl. content moderation) is reported with
//      its failureCode and the script exits 1 — it never retries, because a
//      retry is a second charge and repeated moderated requests can suspend
//      the account.
//   3. OUTPUT URLS EXPIRE (~24-48h), so the mp4 is downloaded immediately to
//      --out (default out/runway-reels/, gitignored) with a sidecar
//      .json recording task id, model, prompt and source photo.
//   4. RUNWAYML_API_SECRET is read by the SDK from the environment (.env.local
//      or the shell). It is never printed, logged or written to the sidecar.
//
// USAGE
//   npm run runway:reel -- --image <https-url|local-file> --place "Mai-Kai" --city "Fort Lauderdale"
//     --image     source photo: https URL, or a local .jpg/.jpeg/.png/.webp
//                 (local files go up via Runway's ephemeral upload)
//     --place / --city   names used in the prompt and the output filename
//     --motion    camera move, e.g. "a slow orbit to the left" (default: push-in)
//     --prompt    full prompt override (skips the honesty-default prompt)
//     --model     gen4.5 (default) | gen4_turbo
//     --ratio     default 720:1280 (9:16 vertical)
//     --duration  seconds, default 5
//     --seed      integer, for reproducible takes
//     --out       output directory (default out/runway-reels)
//     --confirm   actually submit (SPENDS CREDITS). Refused without it.
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildReelRequest, reelSlug } from "../lib/runwayReel.js";

const LOCAL_IMAGE = /\.(?:jpe?g|png|webp)$/i;
// A phone photo never needs more; keeps the ephemeral upload fast.
const MAX_LOCAL_BYTES = 16 * 1024 * 1024;

function parseArgs(argv) {
  const out = { confirm: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--confirm") { out.confirm = true; continue; }
    if (a === "--help" || a === "-h") { out.help = true; continue; }
    if (!a.startsWith("--")) throw new Error(`unexpected argument "${a}"`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
    out[a.slice(2)] = v;
    i++;
  }
  return out;
}

function intOrUndefined(v, name) {
  if (v === undefined) return undefined;
  if (!/^\d+$/.test(v)) throw new Error(`--${name} must be a whole number, got "${v}"`);
  return Number(v);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`runway-place-reel: ${e.message} (try --help)`);
    return 2;
  }
  if (args.help || !args.image) {
    console.log("usage: npm run runway:reel -- --image <https-url|local-file> [--place NAME] [--city CITY] [--motion TEXT] [--model gen4.5|gen4_turbo] [--duration N] [--confirm]");
    return args.help ? 0 : 2;
  }

  const isLocal = !/^[a-z]+:/i.test(args.image);
  if (isLocal) {
    if (!LOCAL_IMAGE.test(args.image)) { console.error("runway-place-reel: local --image must be .jpg, .jpeg, .png or .webp"); return 2; }
    if (!existsSync(args.image)) { console.error(`runway-place-reel: no such file ${args.image}`); return 2; }
    if (statSync(args.image).size > MAX_LOCAL_BYTES) { console.error("runway-place-reel: local image is over 16MB — resize it first"); return 2; }
  }

  const opts = {
    // Placeholder https URI for validation of a local file; replaced by the
    // runway:// upload URI right before submit.
    imageUri: isLocal ? "https://upload.pending/local-file" : args.image,
    place: args.place, city: args.city, motion: args.motion, promptText: args.prompt,
    model: args.model, ratio: args.ratio,
  };
  let body;
  try {
    opts.duration = intOrUndefined(args.duration, "duration");
    opts.seed = intOrUndefined(args.seed, "seed");
    body = buildReelRequest(opts);
  } catch (e) {
    console.error(`runway-place-reel: ${e.message}`);
    return 2;
  }

  const shown = { ...body, promptImage: [{ ...body.promptImage[0], uri: isLocal ? `<upload of ${args.image}>` : args.image }] };
  console.log("runway-place-reel: request →", JSON.stringify(shown, null, 2));

  if (!args.confirm) {
    console.log(`runway-place-reel: DRY RUN — nothing submitted. Re-run with --confirm to generate (${body.model}, ${body.duration}s; costs: https://docs.dev.runwayml.com/guides/pricing.md).`);
    return 0;
  }
  if (!process.env.RUNWAYML_API_SECRET) {
    console.error("runway-place-reel: RUNWAYML_API_SECRET is not set. Add it to .env.local (gitignored) or your shell — create a key at https://dev.runway.com. Never commit it.");
    return 1;
  }

  // Imported only on the spend path so a dry run works without the SDK.
  const { default: RunwayML, TaskFailedError, TaskTimedOutError } = await import("@runwayml/sdk");
  const client = new RunwayML();

  if (isLocal) {
    const { uri } = await client.uploads.createEphemeral({ file: createReadStream(args.image) });
    body.promptImage[0].uri = uri;
  }

  let task;
  try {
    console.log("runway-place-reel: submitted — waiting for Runway (usually under a few minutes)…");
    task = await client.imageToVideo.create(body).waitForTaskOutput({ timeout: 15 * 60 * 1000 });
  } catch (e) {
    if (e instanceof TaskFailedError) {
      const t = e.taskDetails || {};
      console.error(`runway-place-reel: task ${t.id} ${t.status}: ${t.failure || "no reason given"} [${t.failureCode || "no code"}] — NOT retrying (a retry is billed again).`);
      return 1;
    }
    if (e instanceof TaskTimedOutError) {
      console.error(`runway-place-reel: gave up waiting on task ${e.taskDetails?.id}; it may still finish — check it in the Runway Dev portal before re-running.`);
      return 1;
    }
    console.error(`runway-place-reel: ${e.status ? `HTTP ${e.status} ` : ""}${e.message}`);
    return 1;
  }

  const url = task.output?.[0];
  if (!url) { console.error(`runway-place-reel: task ${task.id} succeeded with no output`); return 1; }

  const outDir = path.resolve(args.out || "out/runway-reels");
  mkdirSync(outDir, { recursive: true });
  const base = `${reelSlug([args.place, args.city].filter(Boolean).join(" "))}-${String(task.id).slice(0, 8)}`;
  const res = await fetch(url);
  if (!res.ok) { console.error(`runway-place-reel: download failed HTTP ${res.status}; task ${task.id} output: ${url} (expires within ~24-48h)`); return 1; }
  const mp4 = path.join(outDir, `${base}.mp4`);
  writeFileSync(mp4, Buffer.from(await res.arrayBuffer()));
  writeFileSync(path.join(outDir, `${base}.json`), JSON.stringify({
    taskId: task.id, createdAt: task.createdAt, model: body.model, ratio: body.ratio, duration: body.duration,
    seed: body.seed ?? null, promptText: body.promptText, sourceImage: args.image, place: args.place ?? null, city: args.city ?? null,
    aiGenerated: true,
  }, null, 2) + "\n");
  console.log(`runway-place-reel: saved ${path.relative(process.cwd(), mp4)} (task ${task.id}). Label it as AI-animated when posting.`);
  return 0;
}

main().then((code) => process.exit(code), (e) => {
  console.error(`runway-place-reel: unexpected error — ${e?.message || e}`);
  process.exit(1);
});
