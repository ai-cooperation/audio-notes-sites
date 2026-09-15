// Isolated Miniflare test harness only. Not an app route or production export.
import {env} from 'cloudflare:workers';
import {createPrepared,putPrepared,finalizePrepared,preparedStatus,stepPrepared} from '../lib/audio-queue';
import {inspectWav,quotaDelay} from '../lib/audio-policy';
import {groqRetryDelay} from '../lib/groq';
import {seal} from '../lib/groq';
export default {async fetch(req:Request){
 const e=env as any,url=new URL(req.url),owner=req.headers.get('test-owner')||'test-owner';
 try{
 if(url.pathname==='/setup'){
 const sql=await req.text();for(const statement of sql.split(';'))if(statement.trim())await e.DB.prepare(statement).run();
 await e.DB.prepare('INSERT INTO groq_credentials VALUES (?,?,?)').bind(owner,await seal('synthetic-key',owner),'test').run();return Response.json({ok:true});}
 if(url.pathname==='/sql'){const b:any=await req.json();return Response.json(await e.DB.prepare(b.sql).all());}
 if(url.pathname==='/validate')return Response.json(inspectWav(await req.arrayBuffer()));
 if(url.pathname==='/policy'){const b:any=await req.json();return Response.json({quota:quotaDelay(b.events,b.seconds,b.now),retry:groqRetryDelay(b.retry,b.now)});}
 if(url.pathname==='/create')return Response.json(await createPrepared(owner,await req.json()));
 const id=url.searchParams.get('id')!;
 if(url.pathname==='/upload')return Response.json(await putPrepared(id,Number(url.searchParams.get('n')),owner,await req.arrayBuffer()));
 if(url.pathname==='/finalize')return Response.json(await finalizePrepared(id,owner));
 if(url.pathname==='/step')return Response.json(await stepPrepared(id,owner));
 return Response.json(await preparedStatus(id,owner));
 }catch(err){return Response.json({error:err instanceof Error?err.message:'error'},{status:400});}
}};
