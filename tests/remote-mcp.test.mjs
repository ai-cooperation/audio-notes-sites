import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {build}=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
// Replace only the cloudflare env module in this protocol-only test. Never tests
// or bypasses the production dispatcher. The owner is injected by the harness.
const out=await build({stdin:{contents:'export {remoteHttp,remoteMethod,REMOTE_TOOLS} from "./lib/remote-mcp";',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'test-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env={};'}));}}]});
const {remoteHttp,REMOTE_TOOLS}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
function request(message,extra={}){return new Request('https://test.local/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...extra},body:JSON.stringify(message)});}
const init={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}};
assert.equal((await remoteHttp(request(init),null)).status,401);
assert.equal((await remoteHttp(request(init,{'origin':'https://evil.test'}),'owner')).status,403);
assert.equal((await remoteHttp(request(init,{'mcp-protocol-version':'invalid'}),'owner')).status,400);
let r=await remoteHttp(request(init),'owner');assert.equal((await r.json()).result.protocolVersion,'2025-06-18');
r=await remoteHttp(request({jsonrpc:'2.0',method:'notifications/initialized'}),'owner');assert.equal(r.status,202);assert.equal(await r.text(),'');
r=await remoteHttp(request({jsonrpc:'2.0',id:2,method:'tools/list'}),'owner');const tools=(await r.json()).result.tools;assert.equal(tools.length,REMOTE_TOOLS.length);assert.ok(tools.some(t=>t.name==='get_audio_preparation_rules'));assert.ok(!tools.some(t=>t.name==='prepare_audio'));
r=await remoteHttp(request({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'save_document',arguments:{id:'00000000-0000-4000-8000-000000000000',kind:'raw',text:'replace'}}}),'owner');assert.equal((await r.json()).error.code,-32602);
r=await remoteHttp(request({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'get_audio_preparation_rules',arguments:{}}}),'owner');assert.match((await r.json()).result.content[0].text,/CLIENT/);
assert.equal((await remoteHttp(new Request('https://test.local/mcp'),'owner')).status,405);
console.log('PASS: HTTP initialization, tool discovery/call, notifications, origin/auth/version rejection, raw preservation, client-preprocessing guidance');
