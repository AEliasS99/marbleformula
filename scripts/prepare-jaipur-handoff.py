"""Install the verified Jaipur 70 picture and audio inputs into a local checkout."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import tempfile
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "race-data/jaipur-70"
SNAPSHOT = ROOT / "out/tcr/portable-jaipur-70-camera-c"
AUDIO_EVIDENCE = "audio-technical-review-camera-c.json"


def verify(path, expected):
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError(f"SHA-256 mismatch: {path}")


def prepare():
    output_dir = Path(os.environ.get("VIDEO_OUT", Path.home() / "MarbleFormulaVideos")).resolve()
    if output_dir == ROOT or ROOT in output_dir.parents:
        raise ValueError("VIDEO_OUT must be outside the checkout")
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / "jaipur-70-camera-c-4k.mp4"
    manifest = json.loads((PACKAGE / "manifest.json").read_text())
    files = manifest["files"]
    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=SNAPSHOT.parent) as scratch:
        candidate = Path(scratch) / "candidate"
        if not SNAPSHOT.exists():
            with ZipFile(PACKAGE / "jaipur-70-camera-c.zip") as archive:
                if len(archive.namelist()) != len(files) or set(archive.namelist()) != files.keys():
                    raise ValueError("Archive entries do not match the manifest")
                for name, expected in files.items():
                    parts = PurePosixPath(name).parts
                    if not parts or any(p in ("/", "..") for p in parts) or "\\" in name or ":" in name:
                        raise ValueError(f"Unsafe archive path: {name}")
                    dest = candidate.joinpath(*parts)
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    with archive.open(name) as source, dest.open("xb") as target:
                        shutil.copyfileobj(source, target)
                    verify(dest, expected)
            candidate.rename(SNAPSHOT)
        for name, expected in files.items():
            verify(SNAPSHOT / name, expected)
    template = json.loads((SNAPSHOT / "ready-template.json").read_text())
    for path, expected in template["audioHashes"].items():
        source = SNAPSHOT / "audio" / Path(path).name
        verify(source, expected)
        target = ROOT / path
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            with target.open("xb") as handle, source.open("rb") as audio:
                shutil.copyfileobj(audio, handle)
        verify(target, expected)
    ready = SNAPSHOT / "ready.json"
    if ready.exists():
        if json.loads(ready.read_text())["output"] != str(output):
            raise ValueError("Reuse the original VIDEO_OUT for this prepared snapshot")
    else:
        template.update(directory=str(SNAPSHOT), entry=str(SNAPSHOT / "entry.tsx"), output=str(output))
        template["audioMixReview"]["technicalEvidence"]["path"] = str(SNAPSHOT / AUDIO_EVIDENCE)
        template["reviewRenderAuthorization"]["output"] = str(output)
        with ready.open("x") as handle:
            json.dump(template, handle, indent=2)
            handle.write("\n")
    print(f"Verified {len(files)} inputs. Ready: {SNAPSHOT.relative_to(ROOT)}")
    print(f"Local review video: {output}")


if __name__ == "__main__":
    prepare()
