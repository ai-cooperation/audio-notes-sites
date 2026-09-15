import {glossaryPrompt} from './audio-glossary';
import { bindings,db,record } from './audio';
import { groqKey,groqTranscribe,GroqLimitError } from './groq';
import { AUDIO_POLICY,inspectWav,quotaDelay } from './audio-policy';
export { AUDIO_POLICY };
const hash=async(bytes:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function task(id:string,owner:string){const t=await db().prepare('SELECT * FROM audio_tasks WHERE id=? AND owner=?').bind(id,owner).first();if(!t)throw new Error('找不到分段工作');return t;}
export async function createPrepared(owner:string,b:any){
 if(b?.version!==AUDIO_POLICY.version||typeof b.name!=='string'||!b.name.trim()||b.name.length>250||!Array.isArray(b.segments)||!b.segments.length||b.segments.length>AUDIO_POLICY.maxSegments)throw new Error('分段清單格式無效');
 let total=0,previousEnd=0;
 const segments=b.segments.map((s:any,i:number)=>{
 if(s.ordinal!==i||!Number.isInteger(s.offsetMs)||s.offsetMs<0||!Number.isFinite(s.durationMs)||s.durationMs<=0||s.durationMs>121000||!Number.isInteger(s.bytes)||s.bytes<44||s.bytes>AUDIO_POLICY.maxChunkBytes||!(/^[a-f0-9]{64}$/).test(s.sha256)||s.format!=='wav')throw new Error('片段資訊無效');
 if((i===0&&s.offsetMs!==0)||(i>0&&(s.offsetMs>previousEnd+1||s.offsetMs<previousEnd-1001)))throw new Error('片段時間有缺漏或重疊超過一秒');
 previousEnd=s.offsetMs+s.durationMs;total+=s.bytes;
 return {ordinal:i,offsetMs:s.offsetMs,durationMs:s.durationMs,bytes:s.bytes,sha256:s.sha256,format:'wav'};
 });
 if(total>AUDIO_POLICY.maxTotalBytes)throw new Error('處理後片段總量超過 500 MiB，請分成多份會議工作');
 const id=crypto.randomUUID(),now=Date.now();const manifest=JSON.stringify({version:b.version,name:b.name,segments});
 await db().batch([
 db().prepare("INSERT INTO recordings (id,owner,name,size,parts,uploaded,state,created) VALUES (?,?,?,?,0,0,'uploading',?)").bind(id,owner,b.name,total,new Date(now).toISOString()),
 db().prepare('INSERT INTO audio_tasks (id,owner,manifest,prompt,created) VALUES (?,?,?,?,?)').bind(id,owner,manifest,String(b.prompt||'').slice(0,2000),now)
 ]);
 // The immutable manifest is durable even if initialization is interrupted.
 return {id,state:'uploading',segments:segments.length,nextAction:'upload_prepared_segments'};
}
export async function putPrepared(id:string,n:number,owner:string,bytes:ArrayBuffer){
 const t=await task(id,owner),m=JSON.parse(t.manifest),s=m.segments[n];if(!s||s.ordinal!==n)throw new Error('片段編號錯誤');
 if(bytes.byteLength!==s.bytes||bytes.byteLength>AUDIO_POLICY.maxChunkBytes)throw new Error('片段大小與清單不符');
 const wav=inspectWav(bytes);if(Math.abs(wav.durationMs-s.durationMs)>1)throw new Error('實際音訊時長與清單不符');
 if(await hash(bytes)!==s.sha256)throw new Error('片段雜湊不符');
 const cid=`${id}-${n}`,key=`${id}/prepared/${n}-${s.sha256}.wav`;
 const old=await db().prepare('SELECT state FROM audio_segments WHERE id=?').bind(cid).first();if(old)return {ok:true,existing:true};
 if(t.state!=='uploading')throw new Error('工作已提交，不能更改片段');
 await bindings().BUCKET.put(key,bytes,{httpMetadata:{contentType:'audio/wav'}});
 await db().prepare("INSERT OR IGNORE INTO audio_segments (id,task,ordinal,key,sha256,bytes,duration_ms,offset_ms,state) VALUES (?,?,?,?,?,?,?,?,'ready')").bind(cid,id,n,key,s.sha256,s.bytes,Math.ceil(wav.durationMs),s.offsetMs).run();
 return {ok:true};
}
export async function preparedStatus(id:string,owner:string){
 const t=await task(id,owner),rows=(await db().prepare('SELECT ordinal,state,attempts FROM audio_segments WHERE task=? ORDER BY ordinal').bind(id).all()).results;
 return {id,state:t.state,total:JSON.parse(t.manifest).segments.length,uploaded:rows.length,completed:rows.filter((r:any)=>r.state==='done').length,segments:rows,nextAttemptAt:t.next_attempt?new Date(t.next_attempt).toISOString():null,reason:t.error,scheduler:'external_runner_required',nextAction:t.state==='done'?'read_transcript':t.state==='uploading'?'upload_missing_then_finalize':t.state==='failed'?'fix_issue_then_retry':t.state==='cancelled'?'cancelled':'run_queue_step_when_due'};
}
export async function finalizePrepared(id:string,owner:string){
 const t=await task(id,owner);if(t.state!=='uploading')return preparedStatus(id,owner);
 const count=await db().prepare('SELECT count(*) AS n FROM audio_segments WHERE task=?').bind(id).first();if(count.n!==JSON.parse(t.manifest).segments.length)throw new Error('片段尚未全部上傳');
 await db().batch([db().prepare("UPDATE audio_tasks SET state='queued' WHERE id=? AND state='uploading'").bind(id),db().prepare("UPDATE recordings SET state='queued' WHERE id=?").bind(id)]);return preparedStatus(id,owner);
}
export async function changePrepared(id:string,owner:string,action:string){
 await task(id,owner);
 if(action==='retry')await db().prepare("UPDATE audio_tasks SET state='queued',error=NULL,next_attempt=0 WHERE id=? AND state='failed'").bind(id).run();
 if(action==='cancel')await db().prepare("UPDATE audio_tasks SET state='cancelled' WHERE id=? AND state NOT IN ('done','uploading')").bind(id).run();
 return preparedStatus(id,owner);
}
async function finish(id:string,owner:string){
 const r=await record(id,owner),rows=(await db().prepare('SELECT * FROM audio_segments WHERE task=? ORDER BY ordinal').bind(id).all()).results;
 let text=`# ${r.name}\n\n原始機器逐字稿。相鄰片段可能重疊一秒，校正時請依時間標記整合；原稿保留。\n\n`;
 for(const s of rows){const d=JSON.parse(s.result);text+=`## ${(s.offset_ms/1000).toFixed(3)}–${((s.offset_ms+s.duration_ms)/1000).toFixed(3)} 秒\n\n${d.text}\n\n`;}
 if(new TextEncoder().encode(text).length>1500000)throw new Error('組稿過長，請分段讀取結果');
 await db().batch([
 db().prepare('INSERT OR IGNORE INTO documents (id,recording,kind,key,content,created) VALUES (?,?,\'raw\',?,?,?)').bind(`prepared-${id}`,id,`${id}/raw.md`,text,new Date().toISOString()),
 db().prepare("UPDATE audio_tasks SET state='done',error=NULL,next_attempt=0 WHERE id=? AND state!='cancelled'").bind(id),
 db().prepare("UPDATE recordings SET state='transcribed' WHERE id=?").bind(id)
 ]);
}
export async function stepPrepared(id:string,owner:string){
 let t=await task(id,owner);const now=Date.now();
 if(['uploading','done','cancelled','failed'].includes(t.state)||t.next_attempt>now)return preparedStatus(id,owner);
 await db().prepare("INSERT OR IGNORE INTO audio_queue_lock (id) VALUES ('groq')").run();
 const token=crypto.randomUUID();
 const acquired=await db().prepare("UPDATE audio_queue_lock SET token=?,until=? WHERE id='groq' AND until<=?").bind(token,now+180000,now).run();
 if(!acquired.meta.changes)return {...await preparedStatus(id,owner),nextAction:'another_request_running',retryAfterSeconds:10};
 try{
 t=await task(id,owner);if(['cancelled','done','failed'].includes(t.state))return preparedStatus(id,owner);
 const c=await db().prepare("SELECT * FROM audio_segments WHERE task=? AND state!='done' ORDER BY ordinal LIMIT 1").bind(id).first();
 if(!c){await finish(id,owner);return preparedStatus(id,owner);}
 const key=await groqKey(owner);if(!key)throw new Error('請先設定 Groq Key，再重試工作');
 const seconds=Math.max(10,Math.ceil(c.duration_ms/1000));
 const events=(await db().prepare('SELECT created,seconds FROM audio_quota_events WHERE created>?').bind(now-86400000).all()).results;
 const wait=quotaDelay(events,seconds,now),lock=await db().prepare("SELECT blocked_until FROM audio_queue_lock WHERE id='groq'").first();
 const due=Math.max(wait.next,lock.blocked_until);
 if(due>now){await db().prepare("UPDATE audio_tasks SET state='waiting_quota',next_attempt=?,error=? WHERE id=? AND state!='cancelled'").bind(due,lock.blocked_until>wait.next?'provider_quota':wait.reason,id).run();return preparedStatus(id,owner);}
 const obj=await bindings().BUCKET.get(c.key);if(!obj)throw new Error('已上傳片段遺失');
 // Shared lease serializes reservations across owners. Attempts remain charged after timeout/crash.
 await db().batch([
 db().prepare('INSERT INTO audio_quota_events (id,created,seconds) VALUES (?,?,?)').bind(token,now,seconds),
 db().prepare("UPDATE audio_segments SET state='processing',attempts=attempts+1 WHERE id=?").bind(c.id),
 db().prepare("UPDATE audio_tasks SET state='processing',error=NULL,next_attempt=0 WHERE id=? AND state!='cancelled'").bind(id)
 ]);
 try{
 const result=await groqTranscribe(key,await obj.arrayBuffer(),(await glossaryPrompt(owner,t.prompt)).prompt,'segment.wav');
 // Keep per-segment payload bounded; raw transcript plus timing is sufficient for review.
 const stored=JSON.stringify({text:result.text,offsetMs:c.offset_ms,durationMs:c.duration_ms});
 if(new TextEncoder().encode(stored).length>500000)throw new Error('片段逐字稿過長');
 await db().prepare("UPDATE audio_segments SET state='done',result=? WHERE id=?").bind(stored,c.id).run();
 await db().prepare("UPDATE audio_tasks SET state='queued' WHERE id=? AND state!='cancelled'").bind(id).run();
 const left=await db().prepare("SELECT count(*) AS n FROM audio_segments WHERE task=? AND state!='done'").bind(id).first();
 if(!left.n&&(await task(id,owner)).state!=='cancelled')await finish(id,owner);
 }catch(err){
 await db().prepare("UPDATE audio_segments SET state='ready' WHERE id=? AND state!='done'").bind(c.id).run();
 if(err instanceof GroqLimitError){
 const retry=Date.now()+err.retryAfterMs;
 await db().prepare("UPDATE audio_queue_lock SET blocked_until=MAX(blocked_until,?) WHERE id='groq'").bind(retry).run();
 await db().prepare("UPDATE audio_tasks SET state='waiting_quota',next_attempt=?,error='provider_quota' WHERE id=? AND state!='cancelled'").bind(retry,id).run();
 }else if(c.attempts<4){await db().prepare("UPDATE audio_tasks SET state='queued',next_attempt=?,error=? WHERE id=? AND state!='cancelled'").bind(Date.now()+Math.min(3600000,30000*2**c.attempts),err instanceof Error?err.message:'轉錄失敗',id).run();}
 else throw err;
 }
 }catch(err){await db().prepare("UPDATE audio_tasks SET state='failed',error=? WHERE id=? AND state!='cancelled'").bind(err instanceof Error?err.message:'工作失敗',id).run();}
 finally{await db().prepare("UPDATE audio_queue_lock SET token='',until=0 WHERE id='groq' AND token=?").bind(token).run();}
 return preparedStatus(id,owner);
}
