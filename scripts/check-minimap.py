"""Reject disappearing minimap paths in native 4K landscape production exports.

Scan every fully visible live-HUD frame. The dark backplate cannot produce the
white route pixels counted inside the map; a blank compositor layer can.
This does not establish editorial approval or assess the underlying 3D scene.
"""
import argparse
import json
import subprocess
from pathlib import Path

import numpy as np


def route_pixels(image):
    rgb = image.astype(np.int16)
    return int(((rgb.min(2) > 180) & (rgb.max(2) - rgb.min(2) < 45)).sum())


def scan(video, start, end):
    # Native 3840x2160 HUD: sample inside its 380px map, excluding its border.
    proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', str(video),
        '-vf', 'crop=320:320:3430:1750', '-pix_fmt', 'rgb24',
        '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    size, n, bad, minimum = 320 * 320 * 3, 0, [], None
    try:
        while True:
            buf = proc.stdout.read(size)
            if not buf:
                break
            if len(buf) != size:
                raise RuntimeError('Incomplete minimap frame')
            if start <= n <= end:
                count = route_pixels(np.frombuffer(buf, np.uint8).reshape(320, 320, 3))
                minimum = count if minimum is None else min(minimum, count)
                if count < 250:
                    bad.append(n)
            n += 1
        if proc.wait() or n <= end or minimum is None:
            raise RuntimeError(f'Incomplete minimap scan: {n} frames, need {end + 1}')
    finally:
        proc.stdout.close()
        if proc.poll() is None:
            proc.terminate()
            proc.wait()
    return dict(passed=not bad, decodedFrames=n, checkedFrames=end-start+1,
                minimumRoutePixels=minimum, missingRouteFrames=bad,
                firstCheckedFrame=start, lastCheckedFrame=end)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video')
    parser.add_argument('--start-frame', type=int, required=True)
    parser.add_argument('--end-frame', type=int, required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    if args.start_frame < 0 or args.end_frame < args.start_frame:
        parser.error('Invalid live-HUD frame range')
    report = scan(args.video, args.start_frame, args.end_frame)
    Path(args.report).write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))
    raise SystemExit(0 if report['passed'] else 1)
