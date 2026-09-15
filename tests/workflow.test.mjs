import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {build}=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
const {Miniflare}=require(require.resolve('miniflare',{paths:[require.resolve('wrangler')]}));
const b=await build({entryPoints:['tests/workflow-worker.ts'],bundle:true,write:false,format:'esm',platform:'neutral',external:['cloudflare:workers']});
const mf=new Miniflare({modules:true,script:b.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET']});
async function call(path,body,owner='a',status=200){const r=await mf.dispatchFetch('https://example.test'+path,{method:body===undefined?'GET':'POST',headers:{'test-owner':owner},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
try{
 const journal=JSON.parse(await readFile('drizzle/meta/_journal.json'));let sql='';for(const e of journal.entries)sql+=await readFile('drizzle/'+e.tag+'.sql','utf8');await call('/setup',sql);
 const id='11111111-1111-4111-8111-111111111111';await call('/setup',`INSERT INTO recordings(id,owner,name,size,parts,created) VALUES('${id}','a','Synthetic',1,0,'2026-09-15');`);
 await call('/jobs/'+id+'/completion',undefined,'b',400);
 const versions={};for(const kind of ['raw','reviewed','corrections','summary'])versions[kind]=(await call('/doc',{id,kind,text:'Synthetic '+kind})).version;
 const completion={versions,sources:[],sbCompared:false,uncertainties:['Synthetic uncertainty']};await call('/jobs/'+id+'/completion',completion);let result=await call('/jobs/'+id+'/completion');assert.equal(result.verified,true);assert.equal(result.meeting_url,'https://example.test/?meeting='+id);
 await call('/doc',{id,kind:'summary',text:'Updated'});assert.equal((await call('/jobs/'+id+'/completion')).verified,false);await call('/jobs/'+id+'/completion',completion,'a',400);
 await call('/glossary',{term:'Term',aliases:['Wrong'],reference:'User confirmed',confirmed:true});assert.equal((await call('/glossary')).length,1);assert.equal((await call('/glossary',undefined,'b')).length,0);
 const context=await call('/glossary/context?topic=Term');assert.deepEqual(context.terms,['Term']);assert.ok(context.prompt.length<=200);assert.deepEqual((await call('/glossary/context',undefined,'b')).terms,[]);
 await call('/glossary',{terms:[{term:'Term',aliases:[],reference:'Do not overwrite',confirmed:true},{term:'Second',aliases:[],reference:'Synthetic',confirmed:true}]});assert.equal((await call('/glossary')).find(r=>r.term==='Term').reference,'User confirmed');assert.equal((await call('/glossary')).length,2);assert.equal((await call('/glossary',undefined,'b')).length,0);
 assert.deepEqual((await call('/glossary/context?topic=unrelated')).terms,[]);assert.deepEqual((await call('/glossary/context')).terms,[]);
 const a={id:crypto.randomUUID(),target:'gmail',title:'Synthetic',body:'Draft',assignee:null,dueAt:null,sourceVersion:versions.raw,sourceLocation:'00:00',status:'draft',externalId:null,authorization:null};await call('/jobs/'+id+'/actions',a);await call('/jobs/'+id+'/actions',a);assert.equal((await call('/jobs/'+id+'/actions')).length,1);await call('/jobs/'+id+'/actions',{...a,status:'sent'},'a',400);await call('/jobs/'+id+'/actions',{...a,status:'sent',externalId:'synthetic-receipt',authorization:'synthetic-user-request'});await call('/jobs/'+id+'/actions',a,'a',400);
 console.log('PASS: owner isolation, glossary isolation, completion version freshness, stable meeting URL, action deduplication and receipt guards');
}finally{await mf.dispose();}
