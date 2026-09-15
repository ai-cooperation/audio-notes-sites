#!/usr/bin/env python3
"""Local-only bounded-memory decoder. No original audio is uploaded."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import tempfile
import wave

VERSION = 'audio-preparation-v1'


def prepare(source, output, rules, prompt=""):
    source = pathlib.Path(source).resolve(strict=True)
    output = pathlib.Path(output).resolve()
    if not source.is_file():
        raise ValueError('Source must be a regular file')
    if rules.get('version') != VERSION or rules.get('uploadFormat') != 'wav':
        raise ValueError('Unsupported preparation rules; update the client')
    output.mkdir(parents=True, exist_ok=False)
    target = int(rules['targetSeconds'] * 16000) * 2
    overlap = int(rules['overlapSeconds'] * 16000) * 2
    if not 0 <= overlap < target or target + 44 > rules['maxChunkBytes']:
        raise ValueError('Invalid chunk policy')
    manifest = {'version': VERSION, 'name': source.name, 'prompt': prompt[:2000], 'segments': []}
    # Input is decoded as a stream; AAC/M4A byte sizes and estimated ffprobe
    # duration never determine the actual PCM duration or the upload boundary.
    with tempfile.TemporaryFile() as errors:
        proc = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(source), '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 's16le', 'pipe:1'], stdout=subprocess.PIPE, stderr=errors)
        offset_bytes = 0
        carry = b''
        total_bytes = 0
        try:
            while True:
                data = bytearray(carry)
                new_bytes = 0
                while len(data) < target:
                    part = proc.stdout.read(target - len(data))
                    if not part:
                        break
                    data.extend(part)
                    new_bytes += len(part)
                if not new_bytes:
                    break
                if len(data) % 2:
                    raise ValueError('Decoder returned an incomplete PCM sample')
                ordinal = len(manifest['segments'])
                if ordinal >= rules['maxSegments']:
                    raise ValueError('Too many segments; split into separate meeting jobs')
                path = output / f'{ordinal:05d}.wav'
                with wave.open(str(path), 'wb') as wav:
                    wav.setnchannels(1)
                    wav.setsampwidth(2)
                    wav.setframerate(16000)
                    wav.writeframes(data)
                raw = path.read_bytes()
                total_bytes += len(raw)
                if len(raw) > rules['maxChunkBytes'] or len(raw) >= rules['providerMaxBytes'] or total_bytes > rules['maxTotalBytes']:
                    raise ValueError('Prepared audio exceeds the service byte limit; split into separate jobs')
                manifest['segments'].append({'ordinal': ordinal, 'offsetMs': offset_bytes // 32, 'durationMs': len(data) / 32, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'format': 'wav', 'file': path.name})
                if len(data) < target:
                    break
                carry = bytes(data[-overlap:]) if overlap else b''
                offset_bytes += len(data) - len(carry)
            if proc.wait() != 0:
                raise ValueError('FFmpeg could not decode the audio; no upload was attempted')
        except BaseException:
            proc.kill()
            proc.wait()
            raise
        finally:
            proc.stdout.close()
    if not manifest['segments']:
        raise ValueError('No audio samples decoded')
    path = output / 'manifest.json'
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return {'manifest': str(path), 'segments': len(manifest['segments']), 'bytes': total_bytes, 'nextAction': 'upload_prepared_audio'}


def upload(manifest_path, request):
    path = pathlib.Path(manifest_path).resolve(strict=True)
    manifest = json.loads(path.read_text(encoding='utf-8'))
    # Validate every local segment before creating a server job. Never follow
    # arbitrary paths from an untrusted manifest outside its own directory.
    for segment in manifest['segments']:
        file = (path.parent / segment['file']).resolve(strict=True)
        if file.parent != path.parent or not file.is_file():
            raise ValueError('Segment path must stay inside the prepared directory')
        raw = file.read_bytes()
        if len(raw) != segment['bytes'] or hashlib.sha256(raw).hexdigest() != segment['sha256']:
            raise ValueError('Local segment does not match its manifest')
    resume = path.with_name('upload-state.json')
    origin = __import__('audio_client').BASE
    manifest_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    state = json.loads(resume.read_text()) if resume.exists() else None
    if state and (state.get('origin') != origin or state.get('manifestHash') != manifest_hash):
        raise ValueError('Resume state belongs to another server or manifest')
    if state:
        job = state['id']
    else:
        job = request('jobs/prepared', manifest)['id']
        resume.write_text(json.dumps({'id': job, 'origin': origin, 'manifestHash': manifest_hash}))
    for segment in manifest['segments']:
        file = (path.parent / segment['file']).resolve(strict=True)
        if file.parent != path.parent:
            raise ValueError('Segment path changed')
        request(f"jobs/{job}/prepared/{segment['ordinal']}", file.read_bytes(), 'PUT')
    return request(f'jobs/{job}/prepared/finalize', {})


if __name__ == '__main__':
    from audio_client import request
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('output')
    args = parser.parse_args()
    print(json.dumps(prepare(args.source, args.output, request('jobs/preparation')), ensure_ascii=False))
