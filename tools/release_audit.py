#!/usr/bin/env python3
"""Read-only public-release preflight. Does not publish or export private history."""
import json,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'],cwd=root,text=True).splitlines()
patterns={
 'deployment_identifier':r'appgprj_[A-Za-z0-9_]+|appgdep_[A-Za-z0-9_]+',
 'private_site_url':r'https://[^\s\"<>]+\.chatgpt\.site',
 'email':r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}',
 'credential_literal':r'gsk_[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY',
}
findings=[]
for f in files:
 p=root/f
 if p.suffix.lower() in {'.m4a','.wav','.mp3','.sqlite','.db','.png','.jpeg','.jpg'}:findings.append({'path':f,'reason':'binary_manual_review'});continue
 if p.stat().st_size>5_000_000:findings.append({'path':f,'reason':'large_file_review'});continue
 try:s=p.read_text()
 except (UnicodeError,OSError):continue
 # Scanner source contains its own examples, not actual credentials.
 if f=='tools/release_audit.py':continue
 for label,pattern in patterns.items():
  if re.search(pattern,s):findings.append({'path':f,'reason':label})
report={'status':'blocked' if findings or not (root/'LICENSE').exists() else 'manual_review_required','license_present':(root/'LICENSE').exists(),'scanned_files':len(files),'findings':findings,'notes':['No matched values are printed.','Heuristic scan is not a complete secret or license audit.','Never release the private Git history; sanitize a separate source snapshot.']}
print(json.dumps(report,ensure_ascii=False,indent=2))
