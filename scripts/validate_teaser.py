"""Decode all teaser frames and verify delivery metadata and source hashes."""

import hashlib
import json
from pathlib import Path
import struct

import cv2
import numpy as np


PROJECT = Path(__file__).resolve().parents[1]
MEDIA = PROJECT / "public/results/teaser"


def mp4_atoms(path):
    atoms = []
    with path.open("rb") as stream:
        while True:
            header = stream.read(8)
            if len(header) != 8:
                break
            size, kind = struct.unpack(">I4s", header)
            header_size = 8
            if size == 1:
                size = struct.unpack(">Q", stream.read(8))[0]
                header_size = 16
            atoms.append(kind.decode("ascii"))
            if size == 0:
                break
            if size < header_size:
                raise ValueError(f"Invalid MP4 atom: {path}")
            stream.seek(size - header_size, 1)
    return atoms


def validate(path, expected_size):
    capture = cv2.VideoCapture(str(path))
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = capture.get(cv2.CAP_PROP_FPS)
    count, minimum_std, minimum_color = 0, 255.0, 1.0
    shot_frames = {}
    try:
        while True:
            success, frame = capture.read()
            if not success:
                break
            small = cv2.resize(frame, (192, 108))
            minimum_std = min(minimum_std, float(small.std()))
            colorful = np.ptp(small.astype(np.int16), axis=2) > 24
            minimum_color = min(minimum_color, float(colorful.mean()))
            if count % 162 in (40, 120):
                shot_frames[count] = small.astype(np.float32)
            count += 1
    finally:
        capture.release()
    assert (width, height) == expected_size, (path, width, height)
    assert abs(fps - 30) < 0.01, (path, fps)
    assert count == 1620, (path, count)
    assert minimum_std > 15 and minimum_color > 0.01, (path, minimum_std, minimum_color)
    motion = []
    for shot in range(10):
        difference = float(np.abs(shot_frames[shot * 162 + 120] - shot_frames[shot * 162 + 40]).mean())
        assert difference > 0.3, (path, shot, difference)
        motion.append(round(difference, 3))
    atoms = mp4_atoms(path) if path.suffix == ".mp4" else []
    if atoms:
        assert atoms.index("moov") < atoms.index("mdat"), (path, atoms)
    return {"file": path.name, "sizeBytes": path.stat().st_size, "width": width, "height": height, "fps": fps, "frames": count, "seconds": count / fps, "minimumPixelStd": round(minimum_std, 3), "minimumColorFraction": round(minimum_color, 4), "shotMotion": motion, "atoms": atoms, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    provenance = json.loads((MEDIA / "provenance.json").read_text())
    for source, expected in provenance["sourceHashes"].items():
        assert hashlib.sha256(Path(source).read_bytes()).hexdigest() == expected, source
    gallery = json.loads((PROJECT / "src/data/gallery.json").read_text())["cases"]
    original_matches = 0
    for scene in gallery:
        for video in scene["videos"].values():
            source = str(PROJECT / "public" / video["mp4"])
            if source in provenance["sourceHashes"]:
                assert provenance["sourceHashes"][source] == video["sha256"], source
                original_matches += 1
    report = {"sourceHashesVerified": len(provenance["sourceHashes"]), "originalVideoMatches": original_matches, "videos": []}
    for filename, size in [("plan4d-teaser-1080p.mp4", (1920, 1080)), ("plan4d-teaser.mp4", (1280, 720)), ("plan4d-teaser.webm", (1280, 720))]:
        result = validate(MEDIA / filename, size)
        report["videos"].append(result)
        print(json.dumps(result), flush=True)
    destination = PROJECT / "artifacts/teaser-20261015/validation.json"
    destination.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Verified {report['sourceHashesVerified']} source hashes; report: {destination}")


if __name__ == "__main__":
    main()
