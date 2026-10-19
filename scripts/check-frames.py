"""Scans a rendered video for garbled frames (Chrome occasionally emits a frame
that is a magnified, tiled copy of the top-left corner). Such a frame repeats
the yellow timing-tower header in the top-right corner, where it never belongs.

    python3 scripts/check-frames.py out/gp/r5-monza.mp4
"""
import glob
import subprocess
import sys
import tempfile

from PIL import Image

video = sys.argv[1]
with tempfile.TemporaryDirectory() as tmp:
    subprocess.run(
        ["ffmpeg", "-v", "error", "-i", video, "-vf", "crop=iw*0.15625:ih*0.0556:iw*0.8125:ih*0.037,scale=60:12", f"{tmp}/c%05d.png"],
        check=True,
    )
    bad = []
    for f in sorted(glob.glob(f"{tmp}/c*.png")):
        px = Image.open(f).convert("RGB").get_flattened_data()
        if sum(1 for r, g, b in px if r > 220 and g > 180 and b < 80) > len(px) * 0.3:
            bad.append(int(f[-9:-4]) - 1)
print(f"{video}: {len(bad)} garbled frame(s)" + (f" at {bad}" if bad else ""))
sys.exit(1 if bad else 0)
