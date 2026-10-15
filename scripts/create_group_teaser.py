"""Export a standalone demo montage without modifying the public project page."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageOps

from create_teaser import Assets, BACKGROUND, FFMPEG, GALLERY, PROJECT, font


OUTPUT = PROJECT / "artifacts/group-publication-demo-20261015"
SIZE = (1920, 1080)
FPS = 30
SOURCE_FPS = 15
SHOTS = [(12, "pipette"), (0, "soup"), (14, "body")]
PANEL_WIDTH = 956
PANEL_HEIGHT = 536
HEADER_HEIGHT = 36
PANELS = [
    (0, 0, "Generated RGB", "rgb"),
    (964, 0, "Depth", "depth"),
    (0, 544, "Dynamic 4D point cloud", "cloud"),
    (964, 544, "Scene flow", "flow"),
]


def composite(scene_index, cloud_name, frame, assets):
    canvas = Image.new("RGB", SIZE, BACKGROUND)
    draw = ImageDraw.Draw(canvas)
    for left, top, title, kind in PANELS:
        draw.rectangle((left, top, left + PANEL_WIDTH - 1, top + HEADER_HEIGHT - 1), fill="#edf0ee")
        draw.text((left + 16, top + 7), title, fill="#263a31", font=font(25), anchor="lt")
        if kind == "rgb":
            draw.text((left + PANEL_WIDTH - 100, top + 7), "Plan4D", fill="#16765a", font=font(25, True), anchor="lt")
        source = assets.cloud(cloud_name, frame) if kind == "cloud" else assets.clip(scene_index, kind, frame)
        available_height = PANEL_HEIGHT - HEADER_HEIGHT
        fitted = ImageOps.contain(source, (PANEL_WIDTH, available_height), Image.Resampling.LANCZOS)
        canvas.paste(fitted, (left + (PANEL_WIDTH - fitted.width) // 2, top + HEADER_HEIGHT + (available_height - fitted.height) // 2))
    return canvas


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    master = OUTPUT / "plan4d-group-demo-1080p.mp4"
    compact = OUTPUT / "plan4d-group-demo-540p.mp4"
    if master.exists() or compact.exists():
        raise FileExistsError("Existing videos are preserved; use a new output directory for another version.")
    assets = Assets()
    commands = [FFMPEG, "-n", "-hide_banner", "-loglevel", "warning", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "1920x1080", "-r", str(SOURCE_FPS), "-i", "pipe:0", "-an", "-vf", "fps=30", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-threads", "4", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-metadata", "title=Plan4D - Demo", str(master)]
    process = subprocess.Popen(commands, stdin=subprocess.PIPE)
    previews = []
    previous = None
    try:
        for shot_index, (scene_index, cloud_name) in enumerate(SHOTS):
            print(f"Rendering {shot_index + 1}/3: {GALLERY[scene_index]['label']}", flush=True)
            for frame in range(81):
                canvas = composite(scene_index, cloud_name, frame, assets)
                if previous is not None and frame < 4:
                    canvas = Image.blend(previous, canvas, (frame + 1) / 4)
                if frame == 40:
                    canvas.save(OUTPUT / f"scene-{shot_index + 1}.jpg", quality=94)
                    previews.append(canvas.resize((960, 540), Image.Resampling.LANCZOS))
                    if shot_index == 0:
                        canvas.save(OUTPUT / "plan4d-group-demo-poster.jpg", quality=94)
                process.stdin.write(canvas.tobytes())
            previous = canvas
            assets.clear()
        process.stdin.close()
        if process.wait() != 0:
            raise RuntimeError("Video encoding failed")
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait()
    subprocess.run([FFMPEG, "-n", "-hide_banner", "-loglevel", "warning", "-i", str(master), "-an", "-vf", "scale=960:540:flags=lanczos", "-c:v", "libx264", "-crf", "23", "-preset", "medium", "-threads", "4", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(compact)], check=True)
    contact = Image.new("RGB", (960, 1620), BACKGROUND)
    for index, preview in enumerate(previews):
        contact.paste(preview, (0, 540 * index))
    contact.save(OUTPUT / "contact-sheet.jpg", quality=92)
    provenance = {
        "created": datetime.now(timezone.utc).isoformat(),
        "durationSeconds": 16.2,
        "sourceFps": SOURCE_FPS,
        "outputFps": FPS,
        "audio": False,
        "scenes": [{"id": GALLERY[index]["id"], "cloud": name, "sourceFrames": [0, 80]} for index, name in SHOTS],
        "sourceHashes": assets.sources,
        "notes": ["Standalone group publication demo, not included in public project page", "Full source frames with original timing, repeated to 30 fps; no motion interpolation", "Four source frames of dissolve at scene changes", "No title or closing slides, narrative captions, narration or music"],
    }
    (OUTPUT / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")


def verify():
    from validate_teaser import mp4_atoms

    report = {"videos": [], "sourcesVerified": 0}
    for filename, size in [("plan4d-group-demo-1080p.mp4", (1920, 1080)), ("plan4d-group-demo-540p.mp4", (960, 540))]:
        path = OUTPUT / filename
        capture = cv2.VideoCapture(str(path))
        metadata = {"file": filename, "width": int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)), "height": int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)), "fps": capture.get(cv2.CAP_PROP_FPS)}
        count = 0
        minimum_color = 1.0
        selected_frames = {}
        try:
            while True:
                success, frame = capture.read()
                if not success:
                    break
                small = cv2.resize(frame, (192, 108))
                minimum_color = min(minimum_color, float((np.ptp(small.astype(np.int16), axis=2) > 24).mean()))
                if count % 162 in (40, 120):
                    selected_frames[count] = small.astype(np.float32)
                count += 1
        finally:
            capture.release()
        assert (metadata["width"], metadata["height"]) == size, metadata
        assert count == 486 and abs(metadata["fps"] - FPS) < 0.01, metadata
        assert minimum_color > 0.1, minimum_color
        motion = [float(np.abs(selected_frames[index * 162 + 120] - selected_frames[index * 162 + 40]).mean()) for index in range(3)]
        assert min(motion) > 1, motion
        atoms = mp4_atoms(path)
        assert atoms.index("moov") < atoms.index("mdat"), atoms
        metadata.update({"frames": count, "durationSeconds": count / FPS, "bytes": path.stat().st_size, "sha256": digest(path), "minimumColorFraction": minimum_color, "shotMotion": motion, "faststart": True})
        report["videos"].append(metadata)
    provenance = json.loads((OUTPUT / "provenance.json").read_text())
    for source, expected in provenance["sourceHashes"].items():
        assert digest(Path(source)) == expected, source
        report["sourcesVerified"] += 1
    (OUTPUT / "validation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true", help="Validate existing outputs without modifying videos")
    args = parser.parse_args()
    if not args.verify_only:
        encode()
    verify()


if __name__ == "__main__":
    main()
