#!/usr/bin/env python3
"""Regenerate authored loading-preview assets without modifying originals.

Requires Pillow and pdftoppm (Poppler). Tiny previews are printed as data URIs;
copy them into the corresponding data-progressive-image style in docs/index.md.
The PDF is rasterized locally; no remote assets are fetched.
"""

from __future__ import annotations

import base64
import io
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs/assets"


def save_variants(source: Path, widths: tuple[int, ...], *, lossless: bool = False) -> None:
    with Image.open(source) as image:
        for width in widths:
            height = round(image.height * width / image.width)
            resized = image.resize((width, height), Image.Resampling.LANCZOS)
            output = source.with_name(f"{source.stem}-{width}.webp")
            resized.save(output, "WEBP", quality=86, method=6, lossless=lossless)
            print(f"{output.relative_to(ROOT)}: {width}x{height}, {output.stat().st_size} bytes")
        tiny_width = 28
        tiny_height = round(image.height * tiny_width / image.width)
        tiny = image.resize((tiny_width, tiny_height), Image.Resampling.LANCZOS)
        tiny = tiny.filter(ImageFilter.GaussianBlur(0.65))
        buffer = io.BytesIO()
        tiny.save(buffer, "WEBP", quality=35, method=6)
        print(f"{source.stem} preview: data:image/webp;base64,{base64.b64encode(buffer.getvalue()).decode()}")


def pdf_previews() -> None:
    poppler = shutil.which("pdftoppm")
    if not poppler:
        raise SystemExit("pdftoppm is required to render the first two PDF pages")
    source = ASSETS / "documents/rfm-practical-tuning-meeting-share.pdf"
    with tempfile.TemporaryDirectory(prefix="edwinos-pdf-previews-") as directory:
        prefix = Path(directory) / "page"
        subprocess.run(
            [poppler, "-f", "1", "-l", "2", "-scale-to", "2560", "-png", str(source), str(prefix)],
            check=True,
        )
        for page, rendered in enumerate(sorted(Path(directory).glob("page-*.png")), start=1):
            with Image.open(rendered) as image:
                for width in (1280, 2560):
                    height = round(image.height * width / image.width)
                    output = source.with_name(f"{source.stem}-page-{page}-{width}.webp")
                    image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS).save(
                        output, "WEBP", quality=90, method=6
                    )
                    print(f"{output.relative_to(ROOT)}: {width}x{height}, {output.stat().st_size} bytes")


if __name__ == "__main__":
    save_variants(ASSETS / "images/zhejiang-university-logo.png", (180, 360, 540), lossless=True)
    save_variants(ASSETS / "images/workshops/iros-2026-moma-poster.webp", (175, 350, 525))
    pdf_previews()
