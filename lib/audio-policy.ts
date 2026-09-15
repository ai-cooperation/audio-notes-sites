export const AUDIO_POLICY = {
 version:'audio-preparation-v1', provider:'groq', model:'whisper-large-v3',
 providerMaxBytes:25_000_000, maxChunkBytes:8*1024*1024, maxTotalBytes:500*1024*1024,
 maxSegments:1000, targetSeconds:120, overlapSeconds:1,
 uploadFormat:'wav', codec:'pcm_s16le', sampleRate:16000, channels:1,
 limits:{requestsPerMinute:20,audioSecondsPerHour:7200,audioSecondsPerDay:28800},
 quotaScope:'conservative shared deployment budget; provider organization may have other consumers',
 scheduler:'explicit authorized Work/MCP/browser calls only; no managed background trigger configured; external hosting and schedulers are outside this Sites-only product',
 instructions:[
  'Read these rules before uploading. Decode the attachment locally; never upload the original as a prerequisite.',
  'Use FFmpeg to decode supported inputs into mono 16 kHz signed 16-bit PCM WAV. Detect the actual format, not the extension.',
  'Cut independently decodable segments, then measure actual bytes and decoded duration. Never split compressed files by arbitrary byte offsets.',
  'Upload a manifest with ordinals, offsets, duration, SHA-256 and actual bytes, then upload all segments and finalize the job.',
  'Run at most one queue step per call. waiting_quota is pending, not failure or completion. Honor nextAttemptAt; do not recreate the job.',
  'All queued audio must be stored before ending the session. Resume through an authorized Work session after nextAttemptAt; do not add external hosting or schedulers. Unattended overnight progress is not provided.',
  'On completion read raw text, reconcile the one-second overlaps using timestamps, correct terms without guessing, and save reviewed/corrections/summary separately.'
 ]
};
export function inspectWav(bytes:ArrayBuffer){
 const v=new DataView(bytes),u=new Uint8Array(bytes);
 const tag=(p:number)=>String.fromCharCode(...u.slice(p,p+4));
 if(bytes.byteLength<44||tag(0)!=='RIFF'||tag(8)!=='WAVE'||v.getUint32(4,true)+8!==bytes.byteLength)throw new Error('請上傳完整、可獨立解碼的 PCM WAV 片段');
 let format=false,dataSize=0;
 for(let p=12;p+8<=bytes.byteLength;){const size=v.getUint32(p+4,true),end=p+8+size;if(end>bytes.byteLength)throw new Error('WAV 內容不完整');
 if(tag(p)==='fmt '){if(size<16||v.getUint16(p+8,true)!==1||v.getUint16(p+10,true)!==1||v.getUint32(p+12,true)!==16000||v.getUint32(p+16,true)!==32000||v.getUint16(p+20,true)!==2||v.getUint16(p+22,true)!==16)throw new Error('片段須為單聲道 16 kHz / 16-bit PCM WAV');format=true;}
 if(tag(p)==='data'){if(dataSize||size%2)throw new Error('WAV data 區塊無效');dataSize=size;}p=end+(size%2);}
 if(!format||!dataSize)throw new Error('WAV 缺少音訊');
 return {durationMs:dataSize/32};
}
export function quotaDelay(events:{created:number,seconds:number}[],seconds:number,now:number){
 const checks=[{window:60000,cap:20,cost:1,count:true},{window:3600000,cap:7200,cost:seconds,count:false},{window:86400000,cap:28800,cost:seconds,count:false}];
 let next=now;let reason='';
 for(const c of checks){const active=events.filter(e=>e.created>now-c.window).sort((a,b)=>a.created-b.created);let total=active.reduce((s,e)=>s+(c.count?1:e.seconds),0);if(total+c.cost<=c.cap)continue;
 for(const e of active){total-=c.count?1:e.seconds;if(total+c.cost<=c.cap){const due=e.created+c.window+1;if(due>next){next=due;reason=c.count?'minute_requests':c.window===3600000?'hour_audio':'day_audio';}break;}}}
 return {next,reason};
}
