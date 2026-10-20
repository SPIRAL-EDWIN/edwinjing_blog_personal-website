#!/usr/bin/env python3
"""Prepare an opt-in silent H.264 preview and matching WebP cover using ffmpeg.

No dependencies are installed. Originals and existing outputs are never replaced.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path, help="New .mp4 path (outside docs while reviewing)")
    parser.add_argument("--start", type=float, default=0)
    parser.add_argument("--duration", type=float, default=6)
    parser.add_argument("--width", type=int, default=480)
    parser.add_argument("--crf", type=int, default=25)
    args = parser.parse_args()
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        parser.error("ffmpeg is not installed; install it separately or export H.264 in your video editor")
    if not args.input.is_file() or args.output.suffix.lower() != ".mp4":
        parser.error("input must exist and output must end in .mp4")
    if args.start < 0 or not 0 < args.duration <= 10 or not 160 <= args.width <= 960 or args.width % 2 or not 18 <= args.crf <= 35:
        parser.error("use start >= 0, duration 0–10 s, an even width 160–960 px, and CRF 18–35")
    cover = args.output.with_suffix(".webp")
    if args.output.exists() or cover.exists():
        parser.error("output or matching cover already exists; choose new paths")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-n", "-ss", str(args.start),
        "-i", str(args.input), "-t", str(args.duration), "-map", "0:v:0", "-an", "-sn", "-dn",
        "-vf", f"scale={args.width}:-2,fps=24", "-c:v", "libx264", "-preset", "slow",
        "-crf", str(args.crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-map_metadata", "-1",
        str(args.output)], check=True)
    subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-n", "-i", str(args.output),
        "-frames:v", "1", "-quality", "80", str(cover)], check=True)
    if args.output.stat().st_size > 3 * 1024 * 1024 or cover.stat().st_size > 256 * 1024:
        parser.error("export exceeds the build budget (clip 3 MiB, cover 256 KiB); shorten the clip or increase CRF")
    print(f"Review clip: {args.output.resolve()} ({args.output.stat().st_size / 1024:.0f} KiB)")
    print(f"Matching cover: {cover.resolve()}")
    print("Review motion, framing and loop seam before copying into docs and adding preview YAML.")


if __name__ == "__main__":
    main()
