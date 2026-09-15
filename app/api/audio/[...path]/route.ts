import {workflowApi} from '../../../../lib/meeting-workflow';
import { AUDIO_POLICY,createPrepared,putPrepared,preparedStatus,finalizePrepared,stepPrepared,changePrepared } from '../../../../lib/audio-queue';
import { groqStatus,storeGroq } from '../../../../lib/groq';
import { audioUser } from '../../../../lib/audio-service-auth';
import { bindings,db,record,save,aiReady,transcribe,PART } from '../../../../lib/audio';
export const dynamic='force-dynamic';
async function handle(req:Request){
 try{
 const user=await audioUser(req);if(!user)return Response.json({error:'請先登入 ChatGPT'},{status:401});
 const url=new URL(req.url),p=url.pathname.split('/').slice(3),method=req.method;
 const origin=req.headers.get('origin');if(method!=='GET'&&origin&&origin!==url.origin)return new Response('Forbidden',{status:403});
 const extra=await workflowApi(req,p,user.userId,url.origin);if(extra)return extra;
 const e=bindings();
 if(p[0]==='settings'&&p[1]==='groq'&&p.length===2){
 const reply=(body:unknown)=>Response.json(body,{headers:{'Cache-Control':'no-store'}});
 if(method==='GET')return reply(await groqStatus(user.userId));
 if(method==='POST'||method==='DELETE'){
 if(origin!==url.origin)return new Response('Forbidden',{status:403});
 if(method==='DELETE'){await db().prepare('DELETE FROM groq_credentials WHERE owner=?').bind(user.userId).run();return reply(await groqStatus(user.userId));}
 if(Number(req.headers.get('content-length'))>2048)throw new Error('輸入過長');
 const raw=await req.text();if(raw.length>2048)throw new Error('輸入過長');let b:any;try{b=JSON.parse(raw);}catch{throw new Error('設定資料格式無效');}
 if(typeof b.key!=='string')throw new Error('請貼上 Key');await storeGroq(user.userId,b.key.trim());return reply(await groqStatus(user.userId));
 }
 return new Response('Method not allowed',{status:405});
 }
 if(p[0]==='health'){const status=await groqStatus(user.userId);return Response.json({storage:true,ai:aiReady()||status.configured,provider:status.configured?'Groq':null,textStorage:'D1'});}
 if(p[0]==='jobs'&&p[1]==='preparation'&&method==='GET')return Response.json(AUDIO_POLICY);
 if(p[0]==='jobs'&&p[1]==='prepared'&&method==='POST'){
 if(Number(req.headers.get('content-length'))>500000)throw new Error('清單過大');
 const body=await req.text();if(body.length>500000)throw new Error('清單過大');return Response.json(await createPrepared(user.userId,JSON.parse(body)));
 }
 if(p[0]==='jobs'&&p[1]==='queue'&&method==='GET')return Response.json((await db().prepare('SELECT id,state,next_attempt,error FROM audio_tasks WHERE owner=? ORDER BY created').bind(user.userId).all()).results);
 if(p[0]==='jobs'&&p.length===1){
 if(method==='GET')return Response.json((await db().prepare('SELECT * FROM recordings WHERE owner=? ORDER BY created DESC LIMIT 100').bind(user.userId).all()).results);
 if(method==='POST'){const b:any=await req.json();if(typeof b.name!=='string'||b.name.length>250||!Number.isInteger(b.size)||b.size<1||b.size>500*1024*1024)throw new Error('檔案名稱或大小無效（上限 500 MB）');const id=crypto.randomUUID(),parts=Math.ceil(b.size/PART);await db().prepare('INSERT INTO recordings (id,owner,name,size,parts,created) VALUES (?,?,?,?,?,?)').bind(id,user.userId,b.name,b.size,parts,new Date().toISOString()).run();return Response.json({id,parts,partSize:PART});}
 }
 const id=p[1];if(!id||p[0]!=='jobs')return new Response('Not found',{status:404});const r=await record(id,user.userId);
 if(p.length===2&&method==='GET')return Response.json(r);
 if(p[2]==='prepared'){
 if(p.length===3&&method==='GET')return Response.json(await preparedStatus(id,user.userId));
 if(p.length===4&&method==='PUT'){
 if(Number(req.headers.get('content-length'))>AUDIO_POLICY.maxChunkBytes)throw new Error('片段過大');
 const bytes=await req.arrayBuffer();if(bytes.byteLength>AUDIO_POLICY.maxChunkBytes)throw new Error('片段過大');
 return Response.json(await putPrepared(id,Number(p[3]),user.userId,bytes));
 }
 if(method==='POST'){
 if(p[3]==='finalize')return Response.json(await finalizePrepared(id,user.userId));
 if(p[3]==='step')return Response.json(await stepPrepared(id,user.userId));
 if(['retry','cancel'].includes(p[3]))return Response.json(await changePrepared(id,user.userId,p[3]));
 }
 return new Response('Not found',{status:404});
 }

 if(p[2]==='parts'&&method==='PUT'){
 if(r.state!=='uploading')throw new Error('已完成上傳，無法更改原始檔');const n=Number(p[3]);if(!Number.isInteger(n)||n<0||n>=r.parts)throw new Error('分段編號錯誤');
 const expected=n===r.parts-1?r.size-n*PART:PART;const length=Number(req.headers.get('content-length'));if(length>PART)throw new Error('分段過大');const bytes=await req.arrayBuffer();if(bytes.byteLength!==expected)throw new Error('分段長度不符');await e.BUCKET.put(`${id}/original/${n}`,bytes);return Response.json({ok:true});
 }
 if(p[2]==='complete'&&method==='POST'){
 for(let n=0;n<r.parts;n++)if(!await e.BUCKET.head(`${id}/original/${n}`))throw new Error(`缺少分段 ${n}`);
 await db().prepare("UPDATE recordings SET state='stored',uploaded=parts WHERE id=? AND state='uploading'").bind(id).run();return Response.json({ok:true});
 }
 if(p[2]==='original'&&method==='GET'){
 if(r.parts===0)throw new Error('此工作只保存預處理片段，沒有上傳原始音檔');if(r.state==='uploading')throw new Error('音檔尚未完整上傳');let n=0,reader:any=null;
 const stream=new ReadableStream({async pull(controller){try{while(true){if(!reader){if(n>=r.parts){controller.close();return;}const obj=await e.BUCKET.get(`${id}/original/${n++}`);if(!obj)throw new Error('缺少音檔分段');reader=obj.body.getReader();}const chunk=await reader.read();if(chunk.done){reader=null;continue;}controller.enqueue(chunk.value);return;}}catch(err){controller.error(err);}},async cancel(){await reader?.cancel();}});
 return new Response(stream,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(r.name)}`,'Content-Length':String(r.size)}});
 }
 if(p[2]==='documents'){
 const kind=p[3]||'raw';if(!['raw','reviewed','corrections','summary'].includes(kind))throw new Error('文件類型錯誤');
 if(method==='GET'){const doc=await db().prepare('SELECT * FROM documents WHERE recording=? AND kind=? ORDER BY created DESC,id DESC LIMIT 1').bind(id,kind).first();if(!doc)return Response.json({text:'',version:null});if(doc.content!==null)return Response.json({text:doc.content,version:doc.id});const obj=await e.BUCKET.get(doc.key);if(!obj)throw new Error('文件遺失');const text=await obj.text();await db().prepare('UPDATE documents SET content=? WHERE id=? AND content IS NULL').bind(text,doc.id).run();return Response.json({text,version:doc.id});}
 if(method==='POST'){const b:any=await req.json();if(typeof b.text!=='string')throw new Error('缺少文字');return Response.json(await save(id,kind,b.text));}
 }

 if(p[2]==='chunks'&&method==='PUT'){
 const n=Number(p[3]),offset=Number(url.searchParams.get('offset'));if(!Number.isInteger(n)||n<0||n>1000||!Number.isInteger(offset)||offset<0)throw new Error('分段資訊錯誤');
 if(Number(req.headers.get('content-length'))>8*1024*1024)throw new Error('音訊片段過大');
 const bytes=await req.arrayBuffer();if(!bytes.byteLength||bytes.byteLength>8*1024*1024)throw new Error('音訊片段過大或空白');
 const cid=`${id}-${n}`,key=`${id}/chunks/${n}.wav`;
 const exists=await db().prepare('SELECT id FROM chunks WHERE id=?').bind(cid).first();if(exists)return Response.json({ok:true,existing:true});
 await e.BUCKET.put(key,bytes);await db().prepare('INSERT INTO chunks (id,recording,ordinal,offset,state,key) VALUES (?,?,?,?,?,?)').bind(cid,id,n,offset,'ready',key).run();return Response.json({ok:true});
 }
 if(p[2]==='chunks'&&method==='POST'){
 if(!aiReady()&&!(await groqStatus(user.userId)).configured)return Response.json({error:'請先設定 Groq Key'},{status:503});const n=Number(p[3]);const cid=`${id}-${n}`;const c=await db().prepare('SELECT * FROM chunks WHERE id=? AND recording=?').bind(cid,id).first();if(!c)throw new Error('缺少片段');if(c.state==='done')return Response.json({ok:true,cached:true});
 const lock=await db().prepare("UPDATE chunks SET state='processing' WHERE id=? AND state='ready'").bind(cid).run();if(!lock.meta.changes)throw new Error('片段處理中');
 try{const b:any=await req.json();const obj=await e.BUCKET.get(c.key);const result=await transcribe(await obj.arrayBuffer(),String(b.prompt||'').slice(0,2000),user.userId);await db().prepare("UPDATE chunks SET state='done',result=? WHERE id=?").bind(JSON.stringify({...result,offset:c.offset}),cid).run();return Response.json({ok:true});}catch(err){await db().prepare("UPDATE chunks SET state='ready' WHERE id=?").bind(cid).run();throw err;}
 }
 if(p[2]==='assemble'&&method==='POST'){
 const b:any=await req.json();const rows=(await db().prepare('SELECT * FROM chunks WHERE recording=? ORDER BY ordinal').bind(id).all()).results;
 if(!Number.isInteger(b.count)||rows.length!==b.count||rows.some((c:any,i:number)=>c.ordinal!==i||c.state!=='done'))throw new Error('轉錄片段尚未齊全');
 let md=`# ${r.name}\n\n原始機器逐字稿，尚未校正。\n\n`;for(const c of rows){const data=JSON.parse(c.result || await (await e.BUCKET.get(`${id}/chunks/${c.ordinal}.json`)).text());md+=`## ${Math.floor(c.offset/60)}:${String(c.offset%60).padStart(2,'0')}\n\n${data.text||''}\n\n`;}
 await save(id,'raw',md);await db().prepare("UPDATE recordings SET state='transcribed' WHERE id=?").bind(id).run();return Response.json({ok:true});
 }
 if(p[2]==='transcribe'&&method==='POST'){
 if(r.parts===0)throw new Error('請使用分段佇列處理此工作');
 if(r.state==='uploading')throw new Error('請先完成上傳');if(r.size>8*1024*1024)throw new Error('長音檔需先以 FFmpeg 切成可解碼音訊片段，再使用分段轉錄介面');
 if(!aiReady()&&!(await groqStatus(user.userId)).configured)return Response.json({error:'轉錄模型尚未接通，目前可保存音檔及編輯逐字稿。'},{status:503});
 const locked=await db().prepare("UPDATE recordings SET state='processing' WHERE id=? AND state!='processing'").bind(id).run();if(!locked.meta.changes)throw new Error('轉錄正在執行');
 try{const buffers=[];for(let n=0;n<r.parts;n++)buffers.push(await (await e.BUCKET.get(`${id}/original/${n}`)).arrayBuffer());const bytes=await new Blob(buffers).arrayBuffer();const b:any=await req.json();const result=await transcribe(bytes,String(b.prompt||'').slice(0,2000),user.userId,r.name);await save(id,'raw',result.text||'',JSON.stringify(result));await db().prepare("UPDATE recordings SET state='transcribed' WHERE id=?").bind(id).run();return Response.json({ok:true});}catch(err){await db().prepare("UPDATE recordings SET state='stored' WHERE id=?").bind(id).run();throw err;}
 }
 return new Response('Not found',{status:404});
 }catch(err){return Response.json({error:err instanceof Error?err.message:'服務暫時無法使用'},{status:400});}
}
export {handle as GET,handle as POST,handle as PUT,handle as DELETE};
