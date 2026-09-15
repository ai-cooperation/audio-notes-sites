#!/usr/bin/env python3
"""Run only within the authorized Work session. No external hosting or scheduler. No secrets in args or log output."""
import argparse
import time
from audio_client import request


def tick():
    jobs = request('jobs/queue')
    now = time.time() * 1000
    due = [j for j in jobs if j['state'] in ('queued','waiting_quota','processing') and j['next_attempt'] <= now]
    for job in due:
        result = request(f"jobs/{job['id']}/prepared/step", {})
        print(result['id'], result['state'], result.get('nextAttemptAt'), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true', help='One queue pass within the authorized Work session; does not schedule future calls')
    args = parser.parse_args()
    while True:
        try: tick()
        except Exception:
            print('Queue connection failed; check service credentials and expiry.', flush=True)
            if args.once: raise SystemExit(1)
        if args.once: return
        time.sleep(15)

if __name__ == '__main__': main()
