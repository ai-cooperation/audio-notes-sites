#!/usr/bin/env python3
"""Local stdio MCP for client-prepared audio. No remote OAuth endpoint implied."""
import json
import re
import sys
from audio_client import request
from prepare_audio import prepare, upload

GUIDE = '''Receive audio -> get_audio_preparation_rules -> prepare_audio in the client execution environment -> upload_prepared_audio -> run_transcription_step -> get_transcription_status -> read_transcript -> save_document.
The original file is decoded and split before any audio upload. Local paths refer to THIS MCP runner's filesystem, never an unrelated Chat host. If the attachment is not accessible here, report that capability gap; do not invent paths or upload the unsplit original.
Check actual bytes, format and duration of each encoded segment. Upload all pieces before queuing so the job survives chat/session loss. A queued or waiting_quota result is not completion. Honor nextAttemptAt and do not duplicate jobs or completed pieces. This Sites-only product resumes through an authorized Work session. The stdio server does not schedule future calls; do not add an external hosted runner or scheduler. On completion reconcile one-second overlap by timestamps, retain raw text, mark uncertain names/numbers and save reviewed/corrections/summary separately. Never ask for provider keys in chat.'''

def schema(properties=None, required=None):
    return {'type': 'object', 'properties': properties or {}, 'required': required or [], 'additionalProperties': False}

ID = {'type': 'string', 'description': 'Server-returned recording UUID'}
TOOLS = [
 {'name': 'get_audio_preparation_rules', 'description': 'Call FIRST after receiving an audio file, before uploading. Returns actual size, PCM encoding, duration/overlap and quota rules. Requires a configured private API connection.', 'inputSchema': schema()},
 {'name': 'prepare_audio', 'description': 'Decode and split a user-provided local audio file with FFmpeg in this MCP runner. No network audio upload. Output directory must not exist. Returns a manifest path; next call upload_prepared_audio.', 'inputSchema': schema({'source': {'type': 'string'}, 'output_directory': {'type': 'string'}, 'prompt': {'type': 'string', 'description': 'Optional professional terms and meeting context'}}, ['source', 'output_directory'])},
 {'name': 'upload_prepared_audio', 'description': 'Upload locally prepared and hashed WAV pieces, then finalize a durable queue job. Resume by calling with the SAME manifest; never recreate the job because quota is exhausted.', 'inputSchema': schema({'manifest_path': {'type': 'string'}}, ['manifest_path'])},
 {'name': 'list_recordings', 'description': 'List recordings owned by this authenticated principal.', 'inputSchema': schema()},
 {'name': 'list_transcription_queue', 'description': 'List durable jobs and their due times. waiting_quota means wait, not failed.', 'inputSchema': schema()},
 {'name': 'get_transcription_status', 'description': 'Read progress. Do not say finished until state is done. Honor nextAttemptAt before another step.', 'inputSchema': schema({'id': ID}, ['id'])},
 {'name': 'run_transcription_step', 'description': 'Process at most one due segment. Enforces shared hourly/daily/minute quotas. Repeat only when due; completed segments are reused. No background scheduling is created by this call.', 'inputSchema': schema({'id': ID}, ['id'])},
 {'name': 'retry_transcription', 'description': 'After fixing a failed job, retry only unfinished segments. Does not reset or bypass quota waiting.', 'inputSchema': schema({'id': ID}, ['id'])},
 {'name': 'cancel_transcription', 'description': 'Cancel future segments. An already submitted request may finish and be saved.', 'inputSchema': schema({'id': ID}, ['id'])},
 {'name': 'read_transcript', 'description': 'Read latest Markdown. For prepared jobs first verify done. Raw text preserves segment timestamps and possible overlap; correct into a separate version.', 'inputSchema': schema({'id': ID, 'kind': {'type': 'string', 'enum': ['raw','reviewed','corrections','summary']}}, ['id','kind'])},
 {'name': 'save_document', 'description': 'Save reviewed transcript, corrections log or summary as a new D1 version. Preserve raw. Mark uncertain professional terms instead of inventing.', 'inputSchema': schema({'id': ID, 'kind': {'type': 'string', 'enum': ['reviewed','corrections','summary']}, 'text': {'type': 'string'}}, ['id','kind','text'])}
]

def call(name, a):
    tool = next((t for t in TOOLS if t['name'] == name), None)
    if not tool:
        raise ValueError('Unknown tool')
    fields = tool['inputSchema']
    if not isinstance(a, dict) or set(a) - set(fields['properties']) or any(k not in a for k in fields['required']) or any(not isinstance(v, str) for v in a.values()):
        raise ValueError('Invalid tool arguments')
    if 'id' in a and not re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', a['id']):
        raise ValueError('Invalid recording ID')
    if name == 'get_audio_preparation_rules': return request('jobs/preparation')
    if name == 'prepare_audio': return prepare(a['source'], a['output_directory'], request('jobs/preparation'), a.get('prompt',''))
    if name == 'upload_prepared_audio': return upload(a['manifest_path'], request)
    if name == 'list_recordings': return request('jobs')
    if name == 'list_transcription_queue': return request('jobs/queue')
    if name in ('get_transcription_status','run_transcription_step','retry_transcription','cancel_transcription'):
        suffix = {'get_transcription_status':'','run_transcription_step':'/step','retry_transcription':'/retry','cancel_transcription':'/cancel'}[name]
        return request(f"jobs/{a['id']}/prepared{suffix}", {} if suffix else None)
    if a['kind'] not in fields['properties']['kind']['enum']:
        raise ValueError('Invalid document kind')
    return request(f"jobs/{a['id']}/documents/{a['kind']}", {'text': a['text']} if name == 'save_document' else None)


def dispatch(m):
    method, p = m.get('method'), m.get('params', {})
    if method == 'initialize': return {'protocolVersion': '2024-11-05', 'capabilities': {'tools': {}, 'resources': {}}, 'serverInfo': {'name':'audio-notes','version':'0.2.0'}, 'instructions': GUIDE}
    if method == 'ping': return {}
    if method == 'tools/list': return {'tools': TOOLS}
    if method == 'resources/list': return {'resources': [{'uri':'audio-notes://workflow','name':'Audio preparation and quota workflow','mimeType':'text/plain'}]}
    if method == 'resources/read' and p.get('uri') == 'audio-notes://workflow': return {'contents':[{'uri':'audio-notes://workflow','mimeType':'text/plain','text':GUIDE}]}
    if method == 'tools/call':
        try:
            r = call(p.get('name'), p.get('arguments', {}))
            return {'content':[{'type':'text','text':json.dumps(r, ensure_ascii=False)}]}
        except Exception as e:
            return {'isError':True,'content':[{'type':'text','text':str(e)}]}
    raise ValueError('Method not found')


def main():
    for line in sys.stdin:
        try: m = json.loads(line)
        except Exception:
            print(json.dumps({'jsonrpc':'2.0','id':None,'error':{'code':-32700,'message':'Parse error'}}), flush=True)
            continue
        if not isinstance(m, dict) or m.get('jsonrpc') != '2.0':
            print(json.dumps({'jsonrpc':'2.0','id':None,'error':{'code':-32600,'message':'Invalid request'}}), flush=True)
            continue
        if 'id' not in m: continue
        try: out = {'jsonrpc':'2.0','id':m['id'],'result':dispatch(m)}
        except Exception: out = {'jsonrpc':'2.0','id':m['id'],'error':{'code':-32601,'message':'Method not found'}}
        print(json.dumps(out, ensure_ascii=False), flush=True)

if __name__ == '__main__': main()
