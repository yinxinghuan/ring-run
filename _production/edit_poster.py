#!/usr/bin/env python3
"""Clean punctuation and fake label text from the selected Aigram poster."""

import json
import os
import ssl
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "_production" / "poster-edited.png"
RECORD = ROOT / "_production" / "poster-edit-request.json"
API = "https://chat.aiwaves.tech/aigram/api/gen-image"
REF_URL = "https://cdn.aiwaves.tech/prod/telegram/avatar/0/1785693188212262.webp"
HEADERS = {"Content-Type":"application/json","Origin":"https://aigram.app","Referer":"https://aigram.app/","User-Agent":"Mozilla/5.0"}
SSL_CONTEXT = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
PROMPT = """
Edit this exact square poster while preserving the composition, people, objects, colors, route, proportions and illustration
style. Make only two local corrections. First, the large top title must read RING RUN with no period, exclamation mark or
punctuation after RUN. Second, remove every tiny letter and fake glyph from the champagne bottle label; replace the label
with a simple blank antique-gold rectangle containing no symbols. Do not add any subtitle or any other typography. The sole
text anywhere is RING RUN. Preserve the ring box portrait, cat, wedding arch and robot vacuum exactly.
""".strip()

payload = json.dumps({"prompt": PROMPT, "ref_url": REF_URL}).encode()
request = urllib.request.Request(API, data=payload, method="POST", headers=HEADERS)
with urllib.request.urlopen(request, timeout=360, context=SSL_CONTEXT) as response:
    body = json.loads(response.read())
url = body.get("url")
if not url:
    raise RuntimeError(body)
RECORD.write_text(json.dumps({"endpoint":API,"origin":HEADERS["Origin"],"prompt":PROMPT,"ref_url":REF_URL,"response_url":url}, ensure_ascii=False, indent=2) + "\n")
download = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
with urllib.request.urlopen(download, timeout=120, context=SSL_CONTEXT) as response:
    data = response.read()
suffix = os.path.splitext(url.split("?")[0])[1].lower()
if suffix and suffix != ".png":
    temp = OUT.with_suffix(suffix)
    temp.write_bytes(data)
    subprocess.run(["sips", "-s", "format", "png", str(temp), "--out", str(OUT)], check=True)
    temp.unlink()
else:
    OUT.write_bytes(data)
print(OUT)
