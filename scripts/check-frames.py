"""Scans a rendered video for garbled frames.

Chrome occasionally emits a frame that is a magnified, tiled copy of the
top-left corner. That corner holds the timing tower: a yellow header bar
(#ffcc00) with the tower's white rows right below it. In a garbled frame that
"yellow bar over white rows" pattern shows up again to the right of the real
tower, where it never belongs.

    python3 scripts/check-frames.py out/gp/r5-monza.mp4

Prints one line "<video>: N garbled frame(s) [at [frame, ...]]" and exits
  0  no garbled frame
  1  N > 0 garbled frames
  2  the check itself failed (unreadable video, ffmpeg error, ...). The
     factory treats anything but 0/1 *with* that line as an error.

Geometry (src/gp/Overlay.tsx): every overlay size is k * s with
s = min(width, height) / 1080; in portrait the tower is drawn at 0.92 s. The
tower sits at top/left 40, is 290 wide, and its yellow header is ~53 tall
(10 + 33 + 10). The video is scaled by 1/s so all the numbers below are in
those 1080-units, whatever the resolution (1920x1080, 3840x2160, 1080x1920).

What we look for, inside a band to the right of the real tower:
  - a column whose 8 rows above some row y0 are header yellow (exactly the UI's
    flat #ffcc00: lit 3D yellows in the scene have far more blue, see below), and
    whose rows just below y0 are the tower's white card,
  - for a horizontal run of at least RUN units (a big chunk of the 290-wide
    header): a single yellow chip or a shaded yellow machine doesn't qualify.
The band stops at y = 260 (a header copy magnified up to ~2x) so the centred
results cards (yellow title bar over a white card) never reach it.
"""
import subprocess
import sys

try:
    import numpy as np
except ImportError:  # numpy is required: fail loudly (exit 2), never "0 garbled"
    print("check-frames: numpy is required (pip install numpy)", file=sys.stderr)
    sys.exit(2)

RUN = 120  # units: the minimum width of a "header over tower" run
BAND_BOTTOM = 260  # units: how far down the copy may sit


def probe(video):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", video],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    w, h = (int(x) for x in out.split(",")[:2])
    return w, h


def geometry(w, h):
    """The band to scan, in source pixels, and its size once scaled to units."""
    s = min(w, h) / 1080
    portrait = h > w
    t = 0.92 if portrait else 1.0  # the tower's own scale (Overlay.tsx)
    wu = w / s  # frame width in units: 1920 landscape, 1080 portrait
    x0 = (40 + 290) * t + 30  # just right of the real tower, with a margin
    x1 = wu
    y0, y1 = 0, BAND_BOTTOM
    crop = (round(x0 * s), round(y0 * s), round((x1 - x0) * s), round((y1 - y0) * s))  # x, y, w, h in pixels
    size = (round(x1 - x0), round(y1 - y0))  # the band in units
    return crop, size, portrait


def is_garbled(px):
    """px: (h, w, 3) uint8 band in units. True when it holds a header copy."""
    r, g, b = (px[..., i].astype(np.int16) for i in range(3))
    # The UI's flat #ffcc00 (255, 204, 0). Lit 3D yellows measured in real frames: b >= 56.
    yellow = (r >= 230) & (g >= 180) & (g <= 225) & (b <= 45)
    # The tower card is rgba(255,255,255,0.96): >= 244 over any background. Bright
    # scenery (a white track wall under a yellow split-screen chip) measured 217-230.
    white = (r >= 240) & (g >= 240) & (b >= 240)
    cy = np.vstack([np.zeros((1, px.shape[1]), np.int32), np.cumsum(yellow, axis=0, dtype=np.int32)])
    cw = np.vstack([np.zeros((1, px.shape[1]), np.int32), np.cumsum(white, axis=0, dtype=np.int32)])
    rows = np.arange(8, px.shape[0] - 10)  # candidate boundary rows y0
    if rows.size == 0:
        return False
    above = cy[rows] - cy[rows - 8]  # yellow rows in [y0-8, y0)
    below = cw[rows + 10] - cw[rows + 2]  # white rows in [y0+2, y0+10)
    ok = (above >= 6) & (below >= 7)  # (n_rows, width)
    if ok.shape[1] < RUN:
        return False
    c = np.hstack([np.zeros((ok.shape[0], 1), np.int32), np.cumsum(ok, axis=1, dtype=np.int32)])
    runs = c[:, RUN:] - c[:, :-RUN]  # columns ok in each RUN-wide window
    return bool((runs >= 0.9 * RUN).any())


def scan(video):
    w, h = probe(video)
    (cx, cy, cw, ch), (uw, uh), _ = geometry(w, h)
    vf = f"crop={cw}:{ch}:{cx}:{cy},scale={uw}:{uh}:flags=area,format=rgb24"
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", video, "-vf", vf, "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
    size = uw * uh * 3
    bad, n = [], 0
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size:
            break
        if is_garbled(np.frombuffer(buf, np.uint8).reshape(uh, uw, 3)):
            bad.append(n)
        n += 1
    if proc.wait() != 0:
        raise RuntimeError(f"ffmpeg exited {proc.returncode} while decoding {video}")
    if n == 0:
        raise RuntimeError(f"no frames decoded from {video}")
    return bad, n


def main():
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    video = sys.argv[1]
    try:
        bad, n = scan(video)
    except Exception as e:  # an uncaught exception would exit 1, which means "garbled"
        print(f"check-frames: {e}", file=sys.stderr)
        return 2
    print(f"{video}: {len(bad)} garbled frame(s)" + (f" at {bad}" if bad else "") + f" (of {n})")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
