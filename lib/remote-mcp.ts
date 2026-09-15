import {WORKFLOW_GUIDE} from './meeting-workflow';
import {z} from 'zod';
import {AUDIO_POLICY,createPrepared,preparedStatus,finalizePrepared,stepPrepared,changePrepared} from './audio-queue';
import {db,record,save,bindings} from './audio';
const id=z.string().uuid();
const kinds=z.enum(['raw','reviewed','corrections','summary']);
export const REMOTE_GUIDE=`Audio Notes remote workflow: first get_audio_preparation_rules. Decode and split the audio in the CHAT CLIENT'S execution environment before upload. Remote tools cannot access a client-local path or run the local FFmpeg preparation tool. Use the returned rules and manifest; do not send original audio or base64 audio through tool arguments. If the client lacks decoding or binary transfer, report that requirement instead of pretending the attachment was processed. Create a prepared job, upload every piece using the authenticated binary API, then finalize. Process only due segments. waiting_quota is pending, not completion; honor nextAttemptAt. Read the completed raw transcript and save reviewed/corrections/summary as separate versions. Never expose or request Groq keys in chat. OAuth onboarding is not implemented. This Sites-only product has no unattended background wakeup; do not add external hosting or schedulers. A protocol endpoint alone does not supply client authorization.`;
const registry={
 get_audio_preparation_rules:{description:'Call first before processing an attachment. Returns actual byte/format limits and client-side preparation instructions. Does not upload or decode audio.',schema:z.object({}).strict(),read:true,run:async()=>({...AUDIO_POLICY,instructions:[REMOTE_GUIDE,...AUDIO_POLICY.instructions]})},
 list_recordings:{description:'List only the authenticated owner recordings.',schema:z.object({}).strict(),read:true,run:async(owner:string)=>(await db().prepare('SELECT id,name,size,parts,state,created FROM recordings WHERE owner=? ORDER BY created DESC LIMIT 100').bind(owner).all()).results},
 create_prepared_job:{description:'Create a durable manifest after client-side decoding and splitting. Does not fetch any client-local file. Return binary upload paths; do not mark queued until all pieces are finalized.',schema:z.object({manifest:z.object({version:z.literal('audio-preparation-v1'),name:z.string().min(1).max(250),prompt:z.string().max(2000).optional(),segments:z.array(z.object({ordinal:z.number().int().nonnegative(),offsetMs:z.number().int().nonnegative(),durationMs:z.number().positive(),bytes:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/),format:z.literal('wav')}).strict()).min(1).max(1000)}).strict()}).strict(),read:false,run:async(owner:string,a:any)=>{const job=await createPrepared(owner,a.manifest);return {...job,upload:{method:'PUT',pathTemplate:`/api/audio/jobs/${job.id}/prepared/{ordinal}`,body:'binary PCM WAV',authentication:'requires authorized Sites API identity; browser login is not a transferable client credential',remoteClientTransferReady:false},nextAction:'upload_all_segments_then_finalize_prepared_job'};}},
 get_transcription_status:{description:'Read upload/progress and nextAttemptAt. Only done means transcription is complete.',schema:z.object({id}).strict(),read:true,run:async(owner:string,a:any)=>preparedStatus(a.id,owner)},
 finalize_prepared_job:{description:'Verify all declared segments are stored, then queue the job. Missing pieces are an error, not a completed job.',schema:z.object({id}).strict(),read:false,run:async(owner:string,a:any)=>finalizePrepared(a.id,owner)},
 run_transcription_step:{description:'Process at most one due segment using the owner Groq key. Persisted quota waiting must be respected. This does not start an overnight scheduler.',schema:z.object({id}).strict(),read:false,run:async(owner:string,a:any)=>stepPrepared(a.id,owner)},
 retry_transcription:{description:'Retry unfinished segments of a failed job after fixing its cause. Does not bypass quotas.',schema:z.object({id}).strict(),read:false,run:async(owner:string,a:any)=>changePrepared(a.id,owner,'retry')},
 cancel_transcription:{description:'Cancel future work. A segment already submitted may still finish.',schema:z.object({id}).strict(),read:false,run:async(owner:string,a:any)=>changePrepared(a.id,owner,'cancel')},
 read_transcript:{description:'Read the latest owner-scoped Markdown version. Raw preserves overlap and uncertainty; do not overwrite it during review.',schema:z.object({id,kind:kinds}).strict(),read:true,run:async(owner:string,a:any)=>{await record(a.id,owner);const d=await db().prepare('SELECT id,content,key FROM documents WHERE recording=? AND kind=? ORDER BY created DESC,id DESC LIMIT 1').bind(a.id,a.kind).first();if(!d)return {text:'',version:null};if(d.content!==null)return {text:d.content,version:d.id};const o=await bindings().BUCKET.get(d.key);if(!o)throw new Error('文件遺失');return {text:await o.text(),version:d.id};}},
 save_document:{description:'Save reviewed transcript, corrections or summary as a new version. Never replace raw. Mark uncertain professional terms rather than guess.',schema:z.object({id,kind:z.enum(['reviewed','corrections','summary']),text:z.string().max(500000)}).strict(),read:false,run:async(owner:string,a:any)=>{await record(a.id,owner);return save(a.id,a.kind,a.text);}}
};
// Explicit JSON schemas are generated from the limited Zod subset used above.
function jsonSchema(s:any):any{
 if(s instanceof z.ZodObject){const shape=s.shape;return {type:'object',properties:Object.fromEntries(Object.entries(shape).map(([k,v])=>[k,jsonSchema(v)])),required:Object.keys(shape).filter(k=>!shape[k].isOptional()),additionalProperties:false};}
 if(s instanceof z.ZodOptional)return jsonSchema(s.unwrap());
 if(s instanceof z.ZodArray)return {type:'array',items:jsonSchema(s.element),...(s._def.minLength?{minItems:s._def.minLength.value}:{}),...(s._def.maxLength?{maxItems:s._def.maxLength.value}:{})};
 if(s instanceof z.ZodEnum)return {type:'string',enum:s.options};
 if(s instanceof z.ZodLiteral)return {type:typeof s.value,const:s.value};
 if(s instanceof z.ZodString){const result:any={type:'string'};for(const c of s._def.checks){if(c.kind==='min')result.minLength=c.value;if(c.kind==='max')result.maxLength=c.value;if(c.kind==='uuid')result.format='uuid';if(c.kind==='regex')result.pattern=c.regex.source;}return result;}
 if(s instanceof z.ZodNumber){const result:any={type:s.isInt?'integer':'number'};for(const c of s._def.checks){if(c.kind==='min')result[c.inclusive?'minimum':'exclusiveMinimum']=c.value;}return result;}
 throw new Error('Unsupported schema');
}
export const REMOTE_TOOLS=Object.entries(registry).map(([name,t])=>({name,description:t.description,inputSchema:jsonSchema(t.schema),annotations:{readOnlyHint:t.read,destructiveHint:name==='cancel_transcription',openWorldHint:name==='run_transcription_step'}}));
export async function remoteMethod(owner:string,method:string,params:any){
 if(method==='initialize')return {protocolVersion:'2025-06-18',serverInfo:{name:'audio-notes',version:'0.3.0'},capabilities:{tools:{},resources:{}},instructions:REMOTE_GUIDE+"\n"+WORKFLOW_GUIDE};
 if(method==='ping')return {};
 if(method==='tools/list')return {tools:REMOTE_TOOLS};
 if(method==='resources/list')return {resources:[{uri:'audio-notes://workflow',name:'Audio workflow',mimeType:'text/plain'}]};
 if(method==='resources/read'){if(params?.uri!=='audio-notes://workflow')throw new RpcError(-32602,'Unknown resource');return {contents:[{uri:params.uri,mimeType:'text/plain',text:REMOTE_GUIDE}]};}
 if(method!=='tools/call')throw new RpcError(-32601,'Method not found');
 const entry=registry[params?.name as keyof typeof registry];if(!entry)throw new RpcError(-32602,'Unknown tool');
 const valid=entry.schema.safeParse(params.arguments??{});if(!valid.success)throw new RpcError(-32602,'Invalid tool arguments');
 try {const result=await (entry.run as any)(owner,valid.data);return {content:[{type:'text',text:JSON.stringify(result)}]};}
 catch {return {isError:true,content:[{type:'text',text:'無法完成此操作；請確認工作屬於目前帳戶、資料完整及服務狀態。'}]};}
}
export class RpcError extends Error{constructor(public code:number,message:string){super(message);}}
export async function remoteHttp(req:Request,owner:string|null,invoke=remoteMethod){
 const origin=req.headers.get('origin');
 if(origin&&origin!==new URL(req.url).origin)return new Response('Forbidden',{status:403});
 const headers={'Cache-Control':'no-store'};
 // Until Sites supplies its supported MCP OAuth contract, no pretend issuer,
 // consent endpoint, token validation or bypass credential is advertised.
 if(!owner)return Response.json({error:'authentication_required',detail:'MCP OAuth onboarding is not configured for this deployment.'},{status:401,headers});
 if(req.method!=='POST')return new Response(null,{status:405,headers:{...headers,Allow:'POST'}});
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return new Response(null,{status:415,headers});
 const accept=req.headers.get('accept')||'';if(!accept.includes('application/json')||!accept.includes('text/event-stream'))return new Response(null,{status:406,headers});
 const version=req.headers.get('mcp-protocol-version');if(version&&!['2025-06-18','2025-03-26'].includes(version))return new Response('Unsupported protocol version',{status:400,headers});
 if(Number(req.headers.get('content-length'))>1500000)return new Response(null,{status:413,headers});
 // Bound streamed bodies as well as Content-Length.
 const reader=req.body?.getReader();let size=0;const parts:Uint8Array[]=[];
 if(reader){while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1500000){await reader.cancel();return new Response(null,{status:413,headers});}parts.push(value);}}
 const raw=new Uint8Array(size);let offset=0;for(const part of parts){raw.set(part,offset);offset+=part.length;}
 let m:any;try{m=JSON.parse(new TextDecoder().decode(raw));}catch{return Response.json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}},{status:400,headers});}
 if(!m||Array.isArray(m)||m.jsonrpc!=='2.0'||typeof m.method!=='string'||('id'in m&&typeof m.id!=='string'&&typeof m.id!=='number'))return Response.json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid Request'}},{status:400,headers});
 if(!('id'in m)){if(!m.method.startsWith('notifications/'))return new Response(null,{status:400,headers});return new Response(null,{status:202,headers});}
 try{return Response.json({jsonrpc:'2.0',id:m.id,result:await invoke(owner,m.method,m.params||{})},{headers});}
 catch(err){return Response.json({jsonrpc:'2.0',id:m.id,error:{code:err instanceof RpcError?err.code:-32603,message:err instanceof RpcError?err.message:'Internal error'}},{headers});}
}
