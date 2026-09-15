import { env } from 'cloudflare:workers';
import { db } from './audio';
const model='whisper-large-v3';
export class GroqLimitError extends Error {
 constructor(public retryAfterMs:number){super('Groq 額度已用完，工作已排隊等待恢復');}
}
export function groqRetryDelay(value:string|null,now=Date.now()){
 const seconds=value===null?NaN:Number(value);
 const parsed=Number.isFinite(seconds)?seconds*1000:value?Date.parse(value)-now:NaN;
 // Unknown quota windows are conservatively retried after a day, never local midnight.
 return Number.isFinite(parsed)&&parsed>0?Math.max(1000,parsed):86400000;
}
async function cipher(){const secret=(env as any).CREDENTIAL_ENCRYPTION_KEY;if(!secret)throw new Error('金鑰儲存服務尚未就緒');return crypto.subtle.importKey('raw',Buffer.from(secret,'base64'), 'AES-GCM',false,['encrypt','decrypt']);}
const aad=(owner:string)=>new TextEncoder().encode(`groq:v1:${owner}`);
export async function seal(key:string,owner:string){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(owner)},await cipher(),new TextEncoder().encode(key));return JSON.stringify({v:1,iv:Buffer.from(iv).toString('base64'),data:Buffer.from(data).toString('base64')});}
export async function unseal(value:string,owner:string){const s=JSON.parse(value);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(s.iv,'base64'),additionalData:aad(owner)},await cipher(),Buffer.from(s.data,'base64')));}
export async function groqStatus(owner:string){const r=await db().prepare('SELECT updated FROM groq_credentials WHERE owner=?').bind(owner).first();return {configured:!!r,updated:r?.updated||null,storageReady:!!(env as any).CREDENTIAL_ENCRYPTION_KEY};}
export async function groqKey(owner:string){const r=await db().prepare('SELECT encrypted FROM groq_credentials WHERE owner=?').bind(owner).first();return r?unseal(r.encrypted,owner):null;}
function error(status:number){return new Error(status>=300&&status<400?'Groq 回傳非預期轉址，已停止請求以保護 Key。':status===401?'Groq Key 無效，請重新建立或貼上。':status===403?'此 Key 沒有模型存取權限。':status===429?'Groq 使用額度或頻率已達上限，請稍後再試。':`Groq 暫時無法完成請求（${status}）。`);}
export async function storeGroq(owner:string,key:string){
 if(!/^gsk_[A-Za-z0-9_-]{16,256}$/.test(key))throw new Error('請貼上完整的 Groq API Key。');
 let response:Response;try{response=await fetch(`https://api.groq.com/openai/v1/models/${model}`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000),redirect:'manual'});}catch(err){const timeout=err instanceof Error&&(err.name==='TimeoutError'||err.name==='AbortError');throw new Error(timeout?'Groq 連線逾時，請稍後重試。':'Groq 連線建立失敗，請回報此訊息以檢查網站連線。');}
 if(!response.ok)throw error(response.status);
 const encrypted=await seal(key,owner);
 await db().prepare('INSERT INTO groq_credentials (owner,encrypted,updated) VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET encrypted=excluded.encrypted,updated=excluded.updated').bind(owner,encrypted,new Date().toISOString()).run();
}
export async function groqTranscribe(key:string,bytes:ArrayBuffer,prompt:string,name:string){
 const form=new FormData();form.set('file',new Blob([bytes]),name);form.set('model',model);form.set('language','zh');form.set('response_format','verbose_json');form.set('temperature','0');if(prompt)form.set('prompt',prompt.slice(0,200));
 let response:Response;try{response=await fetch('https://api.groq.com/openai/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:AbortSignal.timeout(120000),redirect:'manual'});}catch{throw new Error('Groq 轉錄連線逾時或失敗，請稍後重試。');}
 if(response.status===429)throw new GroqLimitError(groqRetryDelay(response.headers.get('retry-after')));
 if(!response.ok)throw error(response.status);const result:any=await response.json();if(typeof result.text!=='string')throw new Error('Groq 未回傳有效逐字稿。');return result;
}
