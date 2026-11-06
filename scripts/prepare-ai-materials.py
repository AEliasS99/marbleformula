"""Prepare AI-assisted surface packs, keeping provenance honest.

Colour comes from the original generated image. A periodic-plus-smooth
decomposition removes its wrap discontinuity. Microrelief and roughness are
explicitly AUTHORED procedural fields, not claimed AI-inferred/calibrated PBR.
"""
from pathlib import Path
import argparse, hashlib, json
import numpy as np
from PIL import Image


def periodic_colour(a):
    h, w = a.shape[:2]
    boundary = np.zeros_like(a, dtype=np.float64)
    boundary[0] = a[-1] - a[0]
    boundary[-1] = a[0] - a[-1]
    boundary[:, 0] += a[:, -1] - a[:, 0]
    boundary[:, -1] += a[:, 0] - a[:, -1]
    denominator = (2 * np.cos(2 * np.pi * np.arange(h) / h)[:, None]
                   + 2 * np.cos(2 * np.pi * np.arange(w) / w)[None, :] - 4)
    denominator[0, 0] = 1
    smooth = np.fft.fft2(boundary, axes=(0, 1)) / denominator[:, :, None]
    smooth[0, 0] = 0
    return a - np.fft.ifft2(smooth, axes=(0, 1)).real


def noise(size, sigma, seed):
    rng = np.random.default_rng(seed)
    a = rng.standard_normal((size, size))
    fy, fx = np.fft.fftfreq(size)[:, None], np.fft.fftfreq(size)[None, :]
    sy, sx = (sigma, sigma) if np.isscalar(sigma) else sigma
    filt = np.exp(-2 * np.pi**2 * ((sy * fy)**2 + (sx * fx)**2))
    field = np.fft.ifft2(np.fft.fft2(a) * filt).real
    return field / max(field.std(), 1e-9)


def authored_maps(kind, size, metres):
    fine, broad = noise(size, 2.5, 401), noise(size, 40, 402)
    if kind == 'travertine':
        height = -.00055 * np.maximum(fine - 1.3, 0) + .00008 * broad
        rough = .84 + .035 * broad + .035 * np.maximum(fine - 1.3, 0)
        metallic = 0
    elif kind == 'oak':
        fibres = noise(size, (85, 1.6), 403)
        height = .00011 * fibres + .000035 * fine
        rough = .62 + .04 * broad + .025 * fibres
        metallic = 0
    elif kind == 'bronze':
        height = .000045 * fine + .000025 * broad
        rough = .48 + .065 * broad
        metallic = .94
    else:
        raise ValueError('Unknown authored surface')
    # Derivatives on the periodic height field. Image rows point downward;
    # tangent-space v points up, so OpenGL's green channel uses the opposite.
    du = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * size / (2 * metres)
    dv = -(np.roll(height, -1, 0) - np.roll(height, 1, 0)) * size / (2 * metres)
    normal = np.stack([-du, -dv, np.ones_like(du)], axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    return normal, np.clip(rough, .20, .98), metallic, height


def edge_metrics(a):
    interior = (np.abs(np.diff(a, axis=0)).mean() + np.abs(np.diff(a, axis=1)).mean()) / 2
    wrap = (np.abs(a[0] - a[-1]).mean() + np.abs(a[:, 0] - a[:, -1]).mean()) / 2
    return {'interiorAdjacentMean': float(interior), 'wrapMean': float(wrap),
            'wrapRatio': float(wrap / max(interior, 1e-9))}


def prepare(source, output, kind, metres=1.2):
    source, output = Path(source), Path(output)
    if output.exists():
        raise ValueError('Preserve existing material pack: ' + str(output))
    image = np.asarray(Image.open(source).convert('RGB'), dtype=np.float64) / 255
    if image.shape[0] != image.shape[1]:
        raise ValueError('Material input must be square')
    linear = np.where(image <= .04045, image / 12.92, ((image + .055) / 1.055)**2.4)
    periodic = periodic_colour(linear)
    clipped = float(np.mean((periodic < 0) | (periodic > 1)))
    periodic = np.clip(periodic, 0, 1)
    srgb = np.where(periodic <= .0031308, 12.92 * periodic, 1.055 * periodic**(1 / 2.4) - .055)
    base = np.clip(np.rint(srgb * 255), 0, 255).astype(np.uint8)
    normal, roughness, metalness, height = authored_maps(kind, image.shape[0], metres)
    output.mkdir(parents=True)
    Image.fromarray(base).save(output / 'basecolor.png')
    Image.fromarray(np.rint((normal * .5 + .5) * 255).astype(np.uint8)).save(output / 'normal.png')
    Image.fromarray(np.rint(roughness * 255).astype(np.uint8)).save(output / 'roughness.png')
    maps = {name: hashlib.sha256((output / name).read_bytes()).hexdigest()
            for name in ['basecolor.png', 'normal.png', 'roughness.png']}
    after = edge_metrics(base.astype(float))
    record = {'kind': kind, 'size': list(image.shape[:2]), 'physicalTileMetres': metres,
              'source': str(source), 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'baseColourOrigin': 'FLUX.2-klein-base-4B, processed with periodic-plus-smooth in linear light',
              'normalOrigin': 'Independent authored procedural microrelief, OpenGL tangent space',
              'roughnessOrigin': 'Independent authored procedural physical material estimate',
              'notCalibratedMeasuredPBR': True, 'metalness': metalness,
              'heightRmsMetres': float(height.std()), 'clippedFraction': clipped,
              'edgesBefore': edge_metrics(image * 255), 'edgesAfter': after,
              'wrapDiagnosticPassed': after['wrapRatio'] < 1.6,
              'hashes': maps, 'nativeSceneApproved': False, 'movingVideoApproved': False}
    (output / 'source.json').write_text(json.dumps(record, indent=2) + '\n')
    return record


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('output')
    parser.add_argument('--kind', required=True, choices=['travertine', 'oak', 'bronze'])
    parser.add_argument('--metres', type=float, default=1.2)
    args = parser.parse_args()
    print(json.dumps(prepare(args.source, args.output, args.kind, args.metres), indent=2))
