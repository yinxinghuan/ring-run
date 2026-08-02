#!/usr/bin/env python3
"""Typeset the verified title over the Aigram-generated and cleaned raster key art."""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "_production" / "poster-edited.png"
OUTPUT = ROOT / "public" / "poster.png"
RECORD = ROOT / "_production" / "poster-composition.json"
FONT = Path("/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf")
TITLE = "RING RUN"

image = Image.open(SOURCE).convert("RGB")
draw = ImageDraw.Draw(image)
field_color = image.getpixel((18, 18))
draw.rectangle((0, 0, image.width, 224), fill=field_color)
font = ImageFont.truetype(str(FONT), 184)
bounds = draw.textbbox((0, 0), TITLE, font=font)
text_width = bounds[2] - bounds[0]
draw.text(((image.width - text_width) / 2, 7), TITLE, font=font, fill="#084f35")

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
image.save(OUTPUT, format="PNG", optimize=True)
RECORD.write_text(
    json.dumps(
        {
            "aigram_source": "_production/poster-edited.png",
            "txt2img_request": "_production/rejected/poster-v1-request.json",
            "img2img_request": "_production/poster-edit-request.json",
            "title": TITLE,
            "font": str(FONT),
            "output": "public/poster.png"
        },
        indent=2,
    ) + "\n"
)
print(OUTPUT)
