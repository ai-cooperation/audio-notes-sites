import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {build}=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
const {Miniflare,createFetchMock}=require(require.resolve('miniflare',{paths:[require.resolve('wrangler')]}));
const bundled=await build({entryPoints:['tests/queue-worker.ts'],bundle:true,write:false,format:'esm',platform:'neutral',external:['cloudflare:workers'],target:'es2022',charset:'utf8'});
const mock=createFetchMock();mock.disableNetConnect();
mock.get('https://api.groq.com').intercept({path:'/openai/v1/audio/transcriptions',method:'POST'}).reply(200,JSON.stringify({text:'Synthetic transcript'})).times(20);
const mf=new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')},fetchMock:mock});
async function call(path,body,owner='test-owner',expect=200){
 const response=await mf.dispatchFetch('https://test.local'+path,{method:body===undefined?'GET':'POST',headers:{'test-owner':owner},body:Buffer.isBuffer(body)||typeof body==='string'?body:body===undefined?undefined:JSON.stringify(body)});
 const value=await response.json();assert.equal(response.status,expect,JSON.stringify(value));return value;
}
function wav(seconds){const bytes=Buffer.alloc(44+seconds*32000);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(bytes.length-44,40);return bytes;}
try{
 const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
 let sql='';for(const entry of journal.entries)sql+=await readFile(`drizzle/${entry.tag}.sql`,'utf8')+'\n';
 await call('/setup',sql);
 assert.equal((await call('/validate',wav(120))).durationMs,120000);
 const now=Date.now();
 const hourly=await call('/policy',{events:[{created:now-1000,seconds:7200}],seconds:120,now,retry:'90'});
 assert.equal(hourly.quota.reason,'hour_audio');assert.equal(hourly.retry,90000);
 const minute=await call('/policy',{events:Array.from({length:20},()=>({created:now-1000,seconds:10})),seconds:120,now,retry:null});
 assert.equal(minute.quota.reason,'minute_requests');assert.equal(minute.retry,86400000);

 const bytes=wav(1),sha=createHash('sha256').update(bytes).digest('hex');
 const manifest={version:'audio-preparation-v1',name:'synthetic.wav',segments:[0,1].map(n=>({ordinal:n,offsetMs:n*1000,durationMs:1000,bytes:bytes.length,sha256:sha,format:'wav'}))};
 const job=await call('/create',manifest);const id=job.id;
 await call('/status?id='+id,undefined,'other-owner',400);
 await call('/finalize?id='+id,{},'test-owner',400);
 const bad=Buffer.from(bytes);bad[100]=1;await call('/upload?id='+id+'&n=0',bad,'test-owner',400);
 await call('/upload?id='+id+'&n=0',bytes);await call('/upload?id='+id+'&n=1',bytes);
 assert.equal((await call('/upload?id='+id+'&n=0',bytes)).existing,true);
 assert.equal((await call('/finalize?id='+id,{})).state,'queued');
 // Daily exhaustion from earlier in the day (hourly window already elapsed).
 await call('/sql',{sql:`INSERT INTO audio_quota_events VALUES ('past',${Date.now()-7200000},28800)`});
 const waiting=await call('/step?id='+id,{});assert.equal(waiting.state,'waiting_quota');assert.equal(waiting.completed,0);assert.equal(waiting.reason,'day_audio');
 // Persisted state survives a different request and resume after the window.
 assert.equal((await call('/status?id='+id)).state,'waiting_quota');
 await call('/sql',{sql:`UPDATE audio_quota_events SET created=${Date.now()-86400001}`});
 await call('/sql',{sql:`UPDATE audio_tasks SET next_attempt=0 WHERE id='${id}'`});
 assert.equal((await call('/step?id='+id,{})).completed,1);
 // Simulate an interrupted lease/segment; the next request recovers it.
 await call('/sql',{sql:`UPDATE audio_segments SET state='processing' WHERE task='${id}' AND ordinal=1`});
 const done=await call('/step?id='+id,{});assert.equal(done.state,'done',JSON.stringify(done));assert.equal(done.completed,2);
 await call('/step?id='+id,{});
 const docs=await call('/sql',{sql:`SELECT * FROM documents WHERE recording='${id}'`});assert.equal(docs.results.length,1);assert.match(docs.results[0].content,/Synthetic transcript/);
 const attempts=await call('/sql',{sql:`SELECT SUM(attempts) AS n FROM audio_segments WHERE task='${id}'`});assert.equal(attempts.results[0].n,2);
 console.log('PASS: actual D1 migrations, owner isolation, WAV/hash validation, idempotent upload, persistent daily queue, recovery, no retranscription, D1 document readback');
}finally{await mf.dispose();}
