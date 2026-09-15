import {glossaryPrompt} from './audio-glossary';
import { groqKey, groqTranscribe } from './groq';
import { env } from 'cloudflare:workers';
export const PART=4*1024*1024;
export function bindings(){const e=env as any;if(!e.DB||!e.BUCKET)throw new Error('儲存服務尚未就緒');return e;}
export function db(){return bindings().DB;}
export async function record(id:string,owner:string){const r=await db().prepare('SELECT * FROM recordings WHERE id=? AND owner=?').bind(id,owner).first();if(!r)throw new Error('找不到錄音');return r;}
export async function save(id:string,kind:string,body:string,asrJson:string|null=null){
 if(!['raw','reviewed','corrections','summary','completion'].includes(kind))throw new Error('文件類型錯誤');
 if(new TextEncoder().encode(body).length+(asrJson?new TextEncoder().encode(asrJson).length:0)>1500000)throw new Error('文字過長');
 const version=crypto.randomUUID(), key=`${id}/docs/${kind}/${version}.md`,created=new Date().toISOString();

 await db().prepare('INSERT INTO documents (id,recording,kind,key,created,content,asr_json) VALUES (?,?,?,?,?,?,?)').bind(version,id,kind,key,created,body,asrJson).run();return {version};
}
export function aiReady(){return false;}
export async function transcribe(bytes:ArrayBuffer,prompt:string,owner:string,name='audio.wav'){
 prompt=(await glossaryPrompt(owner,prompt)).prompt;
 const key=await groqKey(owner);if(!key)throw new Error('請先在後台設定 Groq Key。');
 return groqTranscribe(key,bytes,prompt,name);
}
