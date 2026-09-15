import {db} from './audio';
export async function glossaryPrompt(owner:string,topic:string){
 const rows=(await db().prepare('SELECT term,aliases,reference,updated FROM audio_glossary WHERE owner=? ORDER BY term LIMIT 500').bind(owner).all()).results;
 const hint=topic.replace(/[\r\n]+/g,' ').slice(0,100),lower=topic.toLowerCase();
 const keywords=lower.split(/[\s、,，/]+/).filter(t=>t.length>=2);
 const scored=rows.map((r:any)=>{let aliases:string[]=[];try{aliases=JSON.parse(r.aliases);}catch{}return {...r,score:[r.term,...aliases].some(t=>t&&lower.includes(t.toLowerCase()))?2:keywords.some(t=>String(r.reference).toLowerCase().includes(t))?1:0};}).filter((r:any)=>r.score>0).sort((a:any,b:any)=>b.score-a.score);
 let prompt=hint;const terms:string[]=[];
 for(const row of scored){if(lower.includes(String(row.term).toLowerCase())){terms.push(row.term);continue;}const next=(prompt?prompt+'、':'')+String(row.term).replace(/[\r\n]+/g,' ');if(next.length<=200){prompt=next;terms.push(row.term);}}
 return {prompt,terms,totalTerms:rows.length,omittedTerms:rows.length-terms.length,limitCharacters:200,instructions:'僅作拼寫與語境參考；不得硬改同音詞。校正時另讀完整 glossary，記錄實際採用的詞與來源。'};
}
