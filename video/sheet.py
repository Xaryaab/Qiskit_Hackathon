"""Contact sheets of a rendered video at chosen frames, for review.

    .venv/Scripts/python.exe sheet.py remotion/out/preview.mp4 check/sheet [--scene hook,problem] [--per 3]
Picks frames at the middle and late part of every narration line in timeline.json.
"""
import argparse
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
FF = str(HERE / "remotion" / "node_modules" / "@remotion" / "compositor-win32-x64-msvc" / "ffmpeg.exe")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("out")
    ap.add_argument("--scene", default="")
    ap.add_argument("--cols", type=int, default=3)
    ap.add_argument("--frames", default="")
    args = ap.parse_args()
    tl = json.loads((HERE / "remotion" / "src" / "timeline.json").read_text())
    picks = []
    if args.frames:
        picks = [(int(x), f"f{x}") for x in args.frames.split(",")]
    else:
        for s in tl["scenes"]:
            if args.scene and s["id"] not in args.scene.split(","):
                continue
            for i, l in enumerate(s["lines"]):
                for frac in (0.35, 0.9):
                    picks.append((l["from"] + int(l["dur"] * frac), f"{s['id']}.{i} {frac}"))
    tmp = HERE / "check" / "tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    tiles = []
    for fr, label in picks:
        p = tmp / f"{fr:05d}.png"
        subprocess.run([FF, "-loglevel", "error", "-y", "-ss", f"{fr / 30:.3f}", "-i", args.video, "-frames:v", "1", str(p)], check=True)
        im = Image.open(p).convert("RGB")
        im.thumbnail((640, 360))
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 220, 22], fill=(0, 0, 0))
        d.text((4, 4), f"{label} @{fr}", fill=(255, 255, 0))
        tiles.append(im)
    cols = args.cols
    per_sheet = cols * 4
    for s in range(0, len(tiles), per_sheet):
        chunk = tiles[s:s + per_sheet]
        rows = (len(chunk) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * 640, rows * 360), "white")
        for k, im in enumerate(chunk):
            sheet.paste(im, ((k % cols) * 640, (k // cols) * 360))
        out = Path(f"{args.out}_{s // per_sheet}.jpg")
        sheet.save(out, quality=85)
        print(out)


if __name__ == "__main__":
    main()
