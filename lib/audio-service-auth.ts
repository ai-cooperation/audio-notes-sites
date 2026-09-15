import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../app/chatgpt-auth';
// Temporary, owner-scoped machine access for the authorized audio import.
// Sites' private dispatcher access check still applies to every request.
export async function audioUser(req:Request){
 const user=await getChatGPTUser();if(user)return user;
 const path=new URL(req.url).pathname;
 if(!['/api/audio/health','/api/audio/glossary','/api/audio/glossary/context','/api/audio/workflow'].includes(path)&&!/^\/api\/audio\/jobs(?:\/|$)/.test(path))return null;
 const e=env as any,token=req.headers.get('x-audio-service-token');
 if(!token||token.length>256||!e.AUDIO_SERVICE_TOKEN||!e.AUDIO_SERVICE_OWNER||Date.now()>Number(e.AUDIO_SERVICE_EXPIRES)||!Number.isFinite(Number(e.AUDIO_SERVICE_EXPIRES)))return null;
 const digest=(v:string)=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));
 const a=new Uint8Array(await digest(token)),b=new Uint8Array(await digest(e.AUDIO_SERVICE_TOKEN));let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 return diff===0?{userId:e.AUDIO_SERVICE_OWNER}:null;
}
