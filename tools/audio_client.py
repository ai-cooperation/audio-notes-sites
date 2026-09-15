#!/usr/bin/env python3
"""Legacy CLI for original storage and short-chunk transcription; not quota-accounted. New Work sessions must use prepare_audio.py and prepared jobs. request() is the shared authorized HTTP transport."""
import argparse,json,os,pathlib,subprocess,tempfile,urllib.request,urllib.error,urllib.parse
BASE=os.environ.get('AUDIO_SITE_URL','').rstrip('/')
TOKEN=os.environ.get('AUDIO_SITE_TOKEN','')
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def request(path,body=None,method=None):
    site=urllib.parse.urlsplit(BASE)
    service_token=os.environ.get('AUDIO_SERVICE_TOKEN','')
    if site.scheme!='https' or not site.hostname or site.username or site.password or site.path not in ('','/') or site.query or site.fragment:
        raise ValueError('AUDIO_SITE_URL must be an HTTPS origin without credentials, path, query or fragment.')
    if not TOKEN or not service_token:
        raise ValueError('Set AUDIO_SITE_TOKEN and AUDIO_SERVICE_TOKEN through the process environment.')
    headers={'OAI-Sites-Authorization':'Bearer '+TOKEN,'X-Audio-Service-Token':service_token}
    if isinstance(body,dict): body=json.dumps(body).encode();headers['Content-Type']='application/json'
    req=urllib.request.Request(BASE+'/api/audio/'+path,data=body,headers=headers,method=method)
    try:
        with urllib.request.build_opener(NoRedirect()).open(req,timeout=300) as r:return json.load(r)
    except urllib.error.HTTPError as e:
        # Do not echo upstream HTML, credentials or arbitrary response bodies.
        status=e.code;e.close()
        raise RuntimeError(f'Audio API returned HTTP {status}; redirects are not followed. Check access and job status in the site.') from None

def main():
    p=argparse.ArgumentParser();p.add_argument('file',type=pathlib.Path);p.add_argument('--job');p.add_argument('--prompt',default='');p.add_argument('--upload-only',action='store_true');a=p.parse_args()
    if not BASE or not TOKEN:raise SystemExit('Set AUDIO_SITE_URL and AUDIO_SITE_TOKEN in the environment.')
    if not a.job:
        j=request('jobs',{'name':a.file.name,'size':a.file.stat().st_size});a.job=j['id'];print('Job:',a.job,flush=True)
        with a.file.open('rb') as f:
            for n in range(j['parts']):request(f'jobs/{a.job}/parts/{n}',f.read(j['partSize']),'PUT')
        request(f'jobs/{a.job}/complete',{})
    if a.upload_only:return
    if not request('health')['ai']:raise SystemExit('Audio saved. No speech provider is configured; resume with --job '+a.job)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['ffmpeg','-v','error','-i',str(a.file),'-map','0:a:0','-ac','1','-ar','16000','-c:a','pcm_s16le','-f','segment','-segment_time','120','-reset_timestamps','1',tmp+'/%05d.wav'],check=True)
        files=sorted(pathlib.Path(tmp).glob('*.wav'))
        for n,f in enumerate(files):
            request(f'jobs/{a.job}/chunks/{n}?offset={n*120}',f.read_bytes(),'PUT')
            request(f'jobs/{a.job}/chunks/{n}',{'prompt':a.prompt});print(f'Transcribed {n+1}/{len(files)}',flush=True)
        request(f'jobs/{a.job}/assemble',{'count':len(files)})
    print('Completed:',a.job)
if __name__=='__main__':main()
