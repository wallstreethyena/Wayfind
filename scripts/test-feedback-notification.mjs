import assert from 'node:assert/strict';
import {notifyFeedback,FEEDBACK_TEAM_EMAIL} from '../lib/feedbackNotification.js';
const row={message:'Place recommendation: Test cafe\n\nPlease review <script>fake</script>',place:'Test cafe',path:'/search',loc_name:'Orlando',ua:'PRIVATE-UA',user_id:'PRIVATE-ID'};
function setup(responses=[{ok:true,status:200}],env={VERCEL_ENV:'production',RESEND_API_KEY:'fixture'}){
 const calls=[],logs=[],waits=[];
 return {calls,logs,waits, options:{env,sender:()=> 'Wayfind <alerts@gowayfind.com>',report:s=>logs.push(s),sleep:async ms=>waits.push(ms),fetchImpl:async(url,init)=>{calls.push({url,init}); const response=responses.shift();if(response instanceof Error)throw response;return response;}}};
}
{
 const h=setup();assert.deepEqual(await notifyFeedback(row,'saved-1',h.options),{sent:true});
 const {init}=h.calls[0]; const data=JSON.parse(init.body);
 assert.deepEqual(data.to,['info@gowayfind.com']);assert.equal(FEEDBACK_TEAM_EMAIL,data.to[0]);
 assert.match(data.subject,/recommendation/);assert.equal(data.html,undefined,'user text never becomes HTML');
 assert.match(data.text,/command-center#feedback/);assert(!data.text.includes('PRIVATE-'));
 assert(init.signal);assert.equal(init.cache,'no-store');
}
for(const response of [{ok:false,status:503},new Error('network')]){
 const h=setup([response,{ok:true,status:200}]);assert.equal((await notifyFeedback(row,'saved-2',h.options)).sent,true);
 assert.equal(h.calls.length,2);assert.equal(h.calls[0].init.headers['Idempotency-Key'],h.calls[1].init.headers['Idempotency-Key']);assert.equal(h.waits.length,1);
}
{
 const h=setup([{ok:false,status:401}]);assert.equal((await notifyFeedback(row,'saved-3',h.options)).sent,false);assert.equal(h.calls.length,1);assert.equal(h.logs.length,1);
}
{
 const h=setup([new Error('down'),new Error('down')]);assert.equal((await notifyFeedback(row,'saved-4',h.options)).sent,false);assert.equal(h.calls.length,2);assert.equal(h.logs.length,1);
}
for(const env of [{VERCEL_ENV:'preview',RESEND_API_KEY:'fixture'},{VERCEL_ENV:'production'}]){
 const h=setup([],env);assert.equal((await notifyFeedback(row,'saved-5',h.options)).sent,false);assert.equal(h.calls.length,0);
}
{
 const h=setup();h.options.sender=()=>{throw new Error('invalid sender');};assert.equal((await notifyFeedback(row,'saved-6',h.options)).reason,'unconfigured');assert.equal(h.calls.length,0);
}
console.log('test-feedback-notification: OK — fixed recipient, plaintext, privacy, stored-event idempotency, bounded retries, production-only and configuration failures');
