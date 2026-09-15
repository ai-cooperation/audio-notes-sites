import {env} from 'cloudflare:workers';
import {workflowApi} from '../lib/meeting-workflow';
import {save} from '../lib/audio';
export default {async fetch(req:Request){try{const p=new URL(req.url).pathname;if(p==='/setup'){for(const s of (await req.text()).split(';').map(x=>x.trim()).filter(Boolean))await (env as any).DB.prepare(s).run();return Response.json({ok:true});}if(p==='/doc'){const a:any=await req.json();return Response.json(await save(a.id,a.kind,a.text));}return await workflowApi(req,p.split('/').slice(1),req.headers.get('test-owner')||'a','https://example.test')||Response.json({error:'missing'},{status:404});}catch(e){return Response.json({error:String(e)},{status:400});}}};
