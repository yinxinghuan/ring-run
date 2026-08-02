#!/usr/bin/env python3
"""Generate the formal Ring Run poster through Aigram transit."""

import json
import os
import ssl
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "_production" / "poster-generated.png"
RECORD = ROOT / "_production" / "poster-request.json"
API = "https://chat.aiwaves.tech/aigram/api/gen-image"
HEADERS = {"Content-Type":"application/json","Origin":"https://aigram.app","Referer":"https://aigram.app/","User-Agent":"Mozilla/5.0"}
SSL_CONTEXT = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
PROMPT = """
Square premium mobile game poster, 1960s Western wedding editorial illustration with tactile cream invitation paper. In the
upper quarter, one large perfectly legible dark-green condensed title: RING RUN. There is no period or punctuation after RUN.
The title is the only typography. Below it, a small luxurious forest-green velvet ring box races along one continuous
hand-drawn burgundy route toward a glowing gold wedding arch. The front of the moving box contains a clear round photographic
portrait of a freckled red-haired white Western woman, and a bright gold wedding ring sits on the box corner. One large
wine-red cat paw sweeps toward the route from the right, creating a funny near-miss. Strong diagonal motion, bottle green,
burgundy, antique gold and cream palette, sophisticated mid-century print texture, emotionally readable wedding emergency,
funny but elegant, instantly readable at 160 pixels. No bottle, no robot vacuum, no subtitle, no labels, no names, no Chinese,
no extra letters, no fake glyphs, no interface, no watermark, no logo, no East Asian styling, not anime.
""".strip()


def generate():
    payload = json.dumps({"prompt": PROMPT}).encode()
    last = None
    for attempt, pause in enumerate((3, 8, 15), 1):
        try:
            request = urllib.request.Request(API, data=payload, method="POST", headers=HEADERS)
            with urllib.request.urlopen(request, timeout=360, context=SSL_CONTEXT) as response:
                body = json.loads(response.read())
            url = body.get("url")
            if not url:
                raise RuntimeError(body)
            RECORD.write_text(json.dumps({"endpoint":API,"origin":HEADERS["Origin"],"prompt":PROMPT,"response_url":url}, ensure_ascii=False, indent=2) + "\n")
            return url
        except Exception as error:
            last = error
            if attempt < 3:
                time.sleep(pause)
    raise last or RuntimeError("poster generation failed")


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=120, context=SSL_CONTEXT) as response:
        data = response.read()
    suffix = os.path.splitext(url.split("?")[0])[1].lower()
    if suffix and suffix != ".png":
        temp = OUT.with_suffix(suffix)
        temp.write_bytes(data)
        subprocess.run(["sips", "-s", "format", "png", str(temp), "--out", str(OUT)], check=True)
        temp.unlink()
    else:
        OUT.write_bytes(data)


if __name__ == "__main__":
    ROOT.joinpath("_production").mkdir(parents=True, exist_ok=True)
    download(generate())
    print(OUT)
