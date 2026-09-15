import io
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
import wave
from unittest.mock import patch
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'tools'))
import prepare_audio
import mcp_stdio

RULES = {'version':'audio-preparation-v1','uploadFormat':'wav','targetSeconds':120,'overlapSeconds':1,'maxChunkBytes':8388608,'providerMaxBytes':25000000,'maxTotalBytes':524288000,'maxSegments':1000}

class Preparation(unittest.TestCase):
    def test_decoding_misnamed_file_and_resume(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder)
            # Deliberately misleading extension, actual PCM content is decoded.
            source=root/'recording.m4a'
            with wave.open(str(source),'wb') as w:
                w.setnchannels(2);w.setsampwidth(2);w.setframerate(16000)
                w.writeframes(b'\x00\x00\x00\x00'*(16000*122))
            out=prepare_audio.prepare(source,root/'prepared',RULES)
            manifest=json.loads(pathlib.Path(out['manifest']).read_text())
            self.assertEqual(len(manifest['segments']),2)
            self.assertEqual(manifest['segments'][1]['offsetMs'],119000)
            self.assertEqual(manifest['segments'][1]['durationMs'],3000)
            for s in manifest['segments']:
                self.assertLess(s['bytes'],RULES['maxChunkBytes'])
                with wave.open(str(root/'prepared'/s['file'])) as w:
                    self.assertEqual(w.getnchannels(),1)
                    self.assertEqual(w.getframerate(),16000)
            calls=[]
            def api(path,body=None,method=None):
                calls.append(path)
                return {'id':'00000000-0000-4000-8000-000000000000','state':'queued'}
            prepare_audio.upload(out['manifest'],api)
            prepare_audio.upload(out['manifest'],api)
            self.assertEqual(calls.count('jobs/prepared'),1)

    def test_mcp_instructions_and_calls(self):
        init=mcp_stdio.dispatch({'method':'initialize'})
        self.assertIn('before any audio upload',init['instructions'])
        self.assertIn('resources',init['capabilities'])
        with patch.object(mcp_stdio,'request',return_value={'state':'waiting_quota'}) as api:
            r=mcp_stdio.dispatch({'method':'tools/call','params':{'name':'run_transcription_step','arguments':{'id':'00000000-0000-4000-8000-000000000000'}}})
            self.assertIn('waiting_quota',r['content'][0]['text'])
            api.assert_called_once()
        r=mcp_stdio.dispatch({'method':'tools/call','params':{'name':'save_document','arguments':{'id':'00000000-0000-4000-8000-000000000000','kind':'raw','text':'overwrite'}}})
        self.assertTrue(r['isError'])

    def test_stdio_protocol(self):
        p=subprocess.run([sys.executable,str(pathlib.Path(mcp_stdio.__file__))],input=json.dumps({'jsonrpc':'2.0','id':1,'method':'initialize'})+'\n'+json.dumps({'jsonrpc':'2.0','id':2,'method':'tools/list'})+'\n',text=True,capture_output=True,check=True)
        rows=[json.loads(line) for line in p.stdout.splitlines()]
        self.assertEqual(rows[0]['result']['serverInfo']['version'],'0.2.0')
        self.assertIn('prepare_audio',[t['name'] for t in rows[1]['result']['tools']])
