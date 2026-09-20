import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/api/feedback/route.js',import.meta.url),'utf8');
const ast=ts.createSourceFile('route.js',source,ts.ScriptTarget.Latest,true);
const fns=new Map();
let strSource;
for(const node of ast.statements)if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations)if(d.name.getText(ast)==='str')strSource=d.initializer.getText(ast);
for(const node of ast.statements)if(ts.isFunctionDeclaration(node))fns.set(node.name.text,node.getText(ast).replace(/^export /,''));
function harness({configured=true,blocked=false,response={ok:true},reject=false}={}){
 const state={calls:[]}; const ctx={sb:()=>configured?{url:'https://test.supabase.co',key:'fixture-only'}:null,limited:()=>blocked,
 console:{error(){}},fetch:async(url,init)=>{state.calls.push({url,init});if(reject)throw new Error('down');return {...response,text:async()=>''};}};
 for(const name of ['str','POST']){
   if(name==='str')ctx.str=new Function(`return (${strSource});`)();
   else ctx.POST=new Function('ctx',`with(ctx){return (${fns.get(name)});}`)(ctx);
 }
 return {ctx,state};
}
const request=(body)=>new Request('https://wayfind.test/api/feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
{
 const {ctx,state}=harness();const res=await ctx.POST(request({message:'Place recommendation: Known Cafe\n\nGreat local coffee.',place:'Known Cafe, Orlando',loc:'Orlando',path:'/search',ignored:'no'}));
 assert.equal(res.status,200);assert.deepEqual(await res.json(),{ok:true,stored:true});
 const body=JSON.parse(state.calls[0].init.body);assert.equal(body.place,'Known Cafe, Orlando');assert.equal(body.path,'/search');assert.equal(body.ignored,undefined);assert(state.calls[0].init.signal);assert.equal(state.calls[0].init.cache,'no-store');
}
for(const [options,status] of [[{configured:false},503],[{blocked:true},429],[{response:{ok:false}},503],[{reject:true},503]]){
 const {ctx}=harness(options);const res=await ctx.POST(request({message:'Please review this place.'}));const body=await res.json();
 assert.equal(res.status,status);assert.equal(body.ok,false);assert.equal(body.stored,false,'never acknowledge a message that was not saved');
}
{
 const {ctx,state}=harness();assert.equal((await ctx.POST(request({message:'   '}))).status,400);assert.equal(state.calls.length,0);
 await ctx.POST(request({message:'x'.repeat(3000),place:'y'.repeat(300)}));const body=JSON.parse(state.calls[0].init.body);assert.equal(body.message.length,2000);assert.equal(body.place.length,200);
}
assert(readFileSync(new URL('../middleware.js',import.meta.url),'utf8').includes('"/api/feedback"'));
console.log('test-feedback-storage: OK — stored acknowledgement, recommendation context, failures, rate limit, bounds and guarded route');
