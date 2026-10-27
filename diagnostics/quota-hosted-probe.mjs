// Diagnostic only. Always fails the deployment; never produces an app build.
import http from 'node:http';
import https from 'node:https';
const out=(stage,data={})=>console.log('QUOTA_PROBE',stage,JSON.stringify(data));
out('runtime',{node:process.version,icu:process.versions.icu,zone:Intl.DateTimeFormat().resolvedOptions().timeZone,nodeEnv:process.env.NODE_ENV,vercelEnv:process.env.VERCEL_ENV});
let calls=0;
const block=()=>{calls++;out('unexpected-network',{calls,stack:new Error().stack.split('\n').slice(2,7)});throw Error('Diagnostic blocked outbound network');};
globalThis.fetch=async()=>block();http.request=block;http.get=block;https.request=block;https.get=block;
const timer=setTimeout(()=>{out('timeout',{calls,handles:process._getActiveHandles().map(h=>h.constructor.name)});process.exit(1);},15000);
try{
 for(const file of ['../lib/commandCenter/alerts.js','../lib/commandCenter/sources/photoQuota.js','../lib/commandCenter/alertsRun.js','../lib/googlePhotoQuota.js','../scripts/test-photo-quota-pacing.mjs']){
  out('before-import',{file});await import(file);out('after-import',{file});
 }
 out('guard-complete',{calls});
}catch(error){out('failed',{name:error.name,message:error.message,stack:String(error.stack).split('\n').slice(0,8)});}
finally{clearTimeout(timer);process.exitCode=1;}
