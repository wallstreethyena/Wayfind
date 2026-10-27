// A printed pass is insufficient: the measurement guard must exit naturally
// with and without hosted account configuration. No external requests allowed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT=fileURLToPath(new URL("..",import.meta.url));
const temp=mkdtempSync(path.join(ROOT,".wf-jsx-commerce-exit-"));
const preloader=path.join(temp,"no-network.mjs");
let entry=path.join(ROOT,"scripts/test-guide-commerce-measurement.mjs");
let assertions=0;
try {
  writeFileSync(preloader,`let calls=0; globalThis.fetch=async()=>{calls++;throw Error("External request in measurement guard");}; process.once("beforeExit",()=>console.log("COMMERCE_NATURAL_EXIT network="+calls));\n`);
  if(process.argv.includes("--mutation-control-child")) {
    const original=readFileSync(entry,"utf8");
    const changed=original.replace(/^process\.env\.NEXT_PUBLIC_SUPABASE_(?:URL|ANON_KEY) = "";\r?\n/gm,"");
    assert.notEqual(changed,original,"mutation must remove the auth isolation");
    entry=path.join(temp,"unisolated-commerce.mjs");
    writeFileSync(entry,changed.replace('"./lib/jsxLoad.mjs"',JSON.stringify(pathToFileURL(path.join(ROOT,"scripts/lib/jsxLoad.mjs")).href)));
  }
  for(const configured of [false,true]) {
    const result=spawnSync(process.execPath,["--import",preloader,entry],{
      cwd:ROOT,encoding:"utf8",timeout:15000,
      env:{...process.env,NODE_ENV:"production",WF_SUPPRESS_ANALYTICS:"1",
        NEXT_PUBLIC_SUPABASE_URL:configured?"https://fixture.invalid":"",
        NEXT_PUBLIC_SUPABASE_ANON_KEY:configured?"sb_publishable_fixture_not_a_real_key_000000000000000":""},
    });
    const label=configured?"configured hosted settings":"unconfigured settings";
    assert.equal(result.error,undefined,`${label}: guard must finish within 15 seconds`);assertions++;
    assert.equal(result.status,0,`${label}: guard must succeed: ${result.stderr}`);assertions++;
    const count=/test-guide-commerce-measurement: (\d+) checks passed/.exec(result.stdout);
    assert.ok(count&&Number(count[1])>=33,`${label}: original measurement assertions ran`);assertions++;
    assert.match(result.stdout,/COMMERCE_NATURAL_EXIT network=0/,`${label}: natural exit with no external requests`);assertions++;
  }
} finally { rmSync(temp,{recursive:true,force:true}); }
console.log(`test-guide-commerce-exit: OK — ${assertions} assertions; configured and unconfigured child processes finish naturally, original measurements execute, zero network requests`);
