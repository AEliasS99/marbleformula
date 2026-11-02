"""Reject missing 3D content in the active race/replay of an Alpes export.

Decode every frame, including frames between thumbnails. The centre of this
authored circuit contains shaded scenery/road; a near-solid white or black
centre indicates a lost canvas, even when the broadcast HUD still renders.
This is a technical guard, not editorial approval of the camera or racing.
Usage: check-scene.py VIDEO --end-frame N [--start-frame N] [--report PATH]
"""
import argparse
import json
import subprocess
import sys
import numpy as np


def blank_scene(image):
    h, w, _ = image.shape
    centre = image[int(h*.2):int(h*.8), int(w*.2):int(w*.9)]
    white = np.all(centre >= 242, axis=2).mean()
    black = np.all(centre <= 12, axis=2).mean()
    return bool(white > .94 or black > .985)


def scan(video, start, end):
    proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', video,
        '-vf', 'scale=320:180:flags=area', '-pix_fmt', 'rgb24',
        '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    size, n, bad = 320*180*3, 0, []
    try:
        while True:
            buf = proc.stdout.read(size)
            if not buf:
                break
            if len(buf) != size:
                raise RuntimeError('Incomplete decoded frame')
            if start <= n <= end and blank_scene(np.frombuffer(buf, np.uint8).reshape(180, 320, 3)):
                bad.append(n)
            n += 1
        if proc.wait() != 0 or n <= end:
            raise RuntimeError(f'Decode failed or incomplete video: {n} frames, need {end+1}')
    finally:
        proc.stdout.close()
        if proc.poll() is None:
            proc.terminate()
            proc.wait()
    ranges = []
    for frame in bad:
        if ranges and ranges[-1][1]+1 == frame:
            ranges[-1][1] = frame
        else:
            ranges.append([frame, frame])
    return {'video': video, 'decodedFrames': n, 'checkedStart': start,
        'checkedEnd': end, 'missingSceneFrames': len(bad), 'ranges': ranges,
        'passed': not bad}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video')
    parser.add_argument('--start-frame', type=int, default=0)
    parser.add_argument('--end-frame', type=int, required=True)
    parser.add_argument('--report')
    args = parser.parse_args()
    try:
        if not 0 <= args.start_frame <= args.end_frame:
            raise ValueError('Invalid frame interval')
        result = scan(args.video, args.start_frame, args.end_frame)
        if args.report:
            with open(args.report, 'w') as f:
                json.dump(result, f, indent=2)
        print(json.dumps(result))
        sys.exit(0 if result['passed'] else 1)
    except Exception as error:
        print(f'check-scene failed: {error}', file=sys.stderr)
        sys.exit(2)
