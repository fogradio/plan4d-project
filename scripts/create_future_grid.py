"""Append a nine-case dynamic 4D mosaic while preserving the original teaser."""

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

from create_teaser import BACKGROUND, FFMPEG, PROJECT, font
from validate_teaser import mp4_atoms


BOARD_PATH = PROJECT / "scripts/future_grid_storyboard.json"
BOARD = json.loads(BOARD_PATH.read_text())
GALLERY_PATH = PROJECT / "src/data/gallery.json"
GALLERY = json.loads(GALLERY_PATH.read_text())["cases"]
WORK = PROJECT / BOARD["work"]
OUTPUT = PROJECT / BOARD["output"]
ORIGINAL = PROJECT / BOARD["original"]
SIZE = (BOARD["width"], BOARD["height"])
FPS = BOARD["sourceFps"]
OUT_FPS = BOARD["outputFps"]
SCHEDULE = [
    {"stage": stage["name"], "frame": stage["sourceStart"] + round((stage["sourceEnd"] - stage["sourceStart"]) * index / max(1, stage["frames"] - 1)), "phase": index / max(1, stage["frames"] - 1)}
    for stage in BOARD["stages"] for index in range(stage["frames"])
]
PREVIEW_FRAMES = [0, 35, 66, 93, 100, 180, 194, 269]
PREFIX_FRAMES = 48 * OUT_FPS
SUFFIXES = ["-1080p.mp4", ".mp4", ".webm"]
INK, GREEN, BLUE, AMBER, MUTED = "#172722", "#11785b", "#2768a4", "#9b5917", "#5b6a63"
TILES = [(48 + column * 616, 144 + row * 294, 592, 280) for row in range(3) for column in range(3)]


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def text(canvas, position, content, size, color=INK, bold=False, width=None):
    draw = ImageDraw.Draw(canvas)
    assert not width or draw.textlength(content, font=font(size, bold)) <= width, content
    draw.text(position, content, font=font(size, bold), fill=color, anchor="lt")


def paste(canvas, source, rectangle):
    left, top, width, height = rectangle
    fitted = ImageOps.contain(source, (width, height), Image.Resampling.LANCZOS)
    canvas.paste(fitted, (left + (width - fitted.width) // 2, top + (height - fitted.height) // 2))


class GridAssets:
    def __init__(self, preview=None):
        self.preview = preview
        self.captures = {}
        self.positions = {}
        self.last = {}
        self.stills = {}
        self.sources = {}

    def still(self, shot):
        path = PROJECT / "public" / GALLERY[shot["scene"]]["image"]
        if path not in self.stills:
            self.stills[path] = Image.open(path).convert("RGB")
            self.sources[str(path)] = digest(path)
        return self.stills[path]

    def video(self, path, frame):
        if path not in self.captures:
            capture = cv2.VideoCapture(str(path))
            assert capture.isOpened(), path
            self.captures[path] = capture
            self.positions[path] = -1
            self.sources[str(path)] = digest(path)
        if self.positions[path] == frame:
            return self.last[path]
        capture = self.captures[path]
        if self.positions[path] + 1 != frame:
            capture.set(cv2.CAP_PROP_POS_FRAMES, frame)
        success, pixels = capture.read()
        assert success, (path, frame)
        self.positions[path] = frame
        self.last[path] = Image.fromarray(cv2.cvtColor(pixels, cv2.COLOR_BGR2RGB))
        return self.last[path]

    def rgb(self, shot, frame):
        root = Path(GALLERY[shot["scene"]]["videos"]["rgb"]["source"]).parent
        return self.video(root / "generated_video_geometry.mp4", frame)

    def cloud(self, shot, frame):
        if self.preview:
            return Image.open(self.preview / f"{shot['name']}-{frame}.jpg").convert("RGB")
        return self.video(WORK / "renders" / f"{shot['name']}.mp4", frame)

    def close(self):
        for capture in self.captures.values():
            capture.release()


def compose(frame, assets):
    state = SCHEDULE[frame]
    stage = state["stage"]
    canvas = Image.new("RGB", SIZE, BACKGROUND)
    draw = ImageDraw.Draw(canvas)
    text(canvas, (48, 26), "Plan", 58, INK, True)
    text(canvas, (170, 26), "4D", 58, GREEN, True)
    text(canvas, (385, 38), "Nine scenes. Nine generated 4D futures.", 43, INK, True, 1487)
    labels = {"input": "ONE IMAGE + TEXT PER CASE", "rgb": "GENERATED FUTURE RGB", "reveal": "FROM VIDEO TO 3D", "orbit": "THE SAME FUTURE, IN 3D", "dynamic": "DYNAMIC 4D / 0.5x PLAYBACK", "final": "EXPLORE EACH GENERATED FUTURE"}
    held = stage in ("reveal", "orbit", "final")
    text(canvas, (48, 105), labels[stage], 24, BLUE if stage == "input" else GREEN, True, 1200)
    time_label = ("TIME HELD / " if held else "") + f"t = +{state['frame'] / FPS:.2f} s"
    label_width = draw.textlength(time_label, font=font(24, True))
    text(canvas, (1872 - label_width, 105), time_label, 24, AMBER if held else GREEN, True)
    for index, (shot, rectangle) in enumerate(zip(BOARD["shots"], TILES)):
        left, top, width, height = rectangle
        paste(canvas, assets.still(shot), (left, top, 88, 50))
        text(canvas, (left + 104, top + 2), f"{index + 1:02d} / 1 FRAME + TEXT", 16, BLUE, True, 480)
        text(canvas, (left + 104, top + 27), shot["action"], 23, INK, True, 480)
        display = Image.new("RGB", (width, 216), BACKGROUND)
        region = (0, 0, width, 216)
        if stage == "input":
            paste(display, assets.still(shot), region)
        elif stage == "rgb":
            paste(display, assets.rgb(shot, state["frame"]), region)
        else:
            paste(display, assets.cloud(shot, frame), region)
            if stage == "reveal":
                rgb = Image.new("RGB", display.size, BACKGROUND)
                paste(rgb, assets.rgb(shot, state["frame"]), region)
                phase = state["phase"]
                display = Image.blend(rgb, display, phase * phase * (3 - 2 * phase))
        canvas.paste(display, (left, top + 64))
        if index < 6:
            draw.line((left, top + height + 7, left + width, top + height + 7), fill="#d4ded8", width=1)
    text(canvas, (48, 1036), "One observed image per case. All future frames are generated.", 24, MUTED, False, 1250)
    text(canvas, (1410, 1036), "RGB + DYNAMIC 4D", 24, GREEN, True, 462)
    return canvas


def preview(directory):
    assets = GridAssets(directory)
    sheet = Image.new("RGB", (1920, 1080), BACKGROUND)
    try:
        for index, frame in enumerate(PREVIEW_FRAMES):
            canvas = compose(frame, assets)
            canvas.save(directory / f"grid-{frame}.jpg", quality=95)
            sheet.paste(canvas.resize((480, 270), Image.Resampling.LANCZOS), ((index % 4) * 480, (index // 4) * 270))
        sheet.save(directory / "contact-sheet.jpg", quality=95)
    finally:
        assets.close()
    print(directory, flush=True)


def encode():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    for suffix in SUFFIXES + ["-poster.webp"]:
        assert not (OUTPUT / (BOARD["basename"] + suffix)).exists(), "Preserving existing final media"
    assert not (OUTPUT / "provenance.json").exists()
    original_hashes = {str(path): digest(path) for path in ORIGINAL.iterdir() if path.is_file()}
    master = WORK / "grid-tail-1080p.mp4"
    assert not master.exists(), "Preserving existing tail; use --assemble-only after a partial run"
    assets = GridAssets()
    encoder = subprocess.Popen([FFMPEG, "-n", "-hide_banner", "-loglevel", "warning", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "1920x1080", "-r", str(FPS), "-i", "pipe:0", "-an", "-vf", f"fps={OUT_FPS}", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-threads", "4", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(master)], stdin=subprocess.PIPE)
    try:
        for frame in range(len(SCHEDULE)):
            encoder.stdin.write(compose(frame, assets).tobytes())
            if frame % 30 == 0:
                print(f"Compose grid {frame}/{len(SCHEDULE)}", flush=True)
        encoder.stdin.close()
        assert encoder.wait() == 0
    finally:
        assets.close()
        if encoder.poll() is None:
            encoder.terminate()
            encoder.wait()
    sources = {**assets.sources, **original_hashes, str(BOARD_PATH): digest(BOARD_PATH), str(GALLERY_PATH): digest(GALLERY_PATH), str(Path(__file__).resolve()): digest(__file__)}
    scenes = []
    for shot in BOARD["shots"]:
        path = WORK / "renders" / f"{shot['name']}.json"
        rendered = json.loads(path.read_text())
        sources.update(rendered["sourceHashes"])
        sources[str(path)] = digest(path)
        sources[str(WORK / "renders" / f"{shot['name']}.mp4")] = rendered["outputSha256"]
        scenes.append({**shot, "id": rendered["sceneId"], "inputFrames": rendered["inputFrames"], "originalPrompt": rendered["originalPrompt"]})
    provenance = {"created": datetime.now(timezone.utc).isoformat(), "durationSeconds": 66, "preservedPrefixSeconds": 48, "tailSeconds": 18, "sourceFps": FPS, "outputFps": OUT_FPS, "scenes": scenes, "schedule": SCHEDULE, "sourceHashes": sources, "originalHashes": original_hashes, "notes": ["The first 48 seconds are stream-copied from the previous teaser, without re-encoding.", "The nine scenes and their order match the original 2D mosaic.", "One observed image and corresponding text per case, not nine views of a single input.", "All 141120 original PLY points are rendered per frame; no geometry completion or motion interpolation.", "Dynamic geometry uses a fixed display camera. Slow motion is explicitly labeled 0.5x PLAYBACK.", "The orbit changes only the display camera and is labeled TIME HELD.", "The appended mosaic shows dynamic point clouds, not newly computed tracking."]}
    with (WORK / "provenance-prepared.json").open("x") as stream:
        json.dump(provenance, stream, indent=2)
        stream.write("\n")


def assemble():
    for suffix, codec in [(".mp4", "libx264"), (".webm", "libvpx-vp9")]:
        destination = WORK / ("grid-tail" + suffix)
        if destination.exists():
            raise FileExistsError(f"Preserving existing transcode: {destination}")
        options = ["-crf", "22", "-preset", "medium", "-movflags", "+faststart"] if codec == "libx264" else ["-crf", "30", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4"]
        subprocess.run([FFMPEG, "-n", "-hide_banner", "-loglevel", "warning", "-i", str(WORK / "grid-tail-1080p.mp4"), "-an", "-vf", "scale=1280:720:flags=lanczos", "-c:v", codec, *options, "-threads", "4", "-pix_fmt", "yuv420p", str(destination)], check=True)
    for suffix in SUFFIXES:
        listing = WORK / ("concat" + suffix + ".txt")
        with listing.open("x") as stream:
            for path in [ORIGINAL / (BOARD["basename"] + suffix), WORK / ("grid-tail" + suffix)]:
                assert "'" not in str(path)
                stream.write(f"file '{path}'\n")
        options = ["-movflags", "+faststart"] if suffix.endswith("mp4") else []
        subprocess.run([FFMPEG, "-n", "-hide_banner", "-loglevel", "warning", "-f", "concat", "-safe", "0", "-i", str(listing), "-map", "0:v:0", "-c", "copy", *options, str(OUTPUT / (BOARD["basename"] + suffix))], check=True)
    poster_name = BOARD["basename"] + "-poster.webp"
    with (OUTPUT / poster_name).open("xb") as stream:
        stream.write((ORIGINAL / poster_name).read_bytes())
    with (OUTPUT / "provenance.json").open("x") as stream:
        stream.write((WORK / "provenance-prepared.json").read_text())


def prefix_hashes(path):
    result = subprocess.run([FFMPEG, "-v", "error", "-threads", "4", "-i", str(path), "-frames:v", str(PREFIX_FRAMES), "-map", "0:v:0", "-f", "framemd5", "-"], capture_output=True, text=True, check=True)
    return [line.rsplit(",", 1)[-1].strip() for line in result.stdout.splitlines() if line and not line.startswith("#")]


def verify():
    provenance = json.loads((OUTPUT / "provenance.json").read_text())
    for path, expected in provenance["sourceHashes"].items():
        assert digest(path) == expected, path
    original_board = json.loads((PROJECT / "scripts/teaser_storyboard.json").read_text())
    original_indices = next(shot["scenes"] for shot in original_board["shots"] if shot["layout"] == "mosaic")
    assert [shot["scene"] for shot in BOARD["shots"]] == original_indices
    assert sorted(set(state["frame"] for state in SCHEDULE)) == list(range(81))
    assert all(right["frame"] >= left["frame"] for left, right in zip(SCHEDULE, SCHEDULE[1:]))
    report = {"sourceCount": len(provenance["sourceHashes"]), "originalMediaUnchanged": True, "sceneIndices": original_indices, "renders": [], "videos": []}
    configuration = hashlib.sha256(BOARD_PATH.read_bytes() + GALLERY_PATH.read_bytes() + (PROJECT / "scripts/render_future_grid.mjs").read_bytes()).hexdigest()
    for shot in BOARD["shots"]:
        rendered = json.loads((WORK / "renders" / f"{shot['name']}.json").read_text())
        assert rendered["configuration"] == configuration
        assert len([path for path in rendered["sourceHashes"] if path.endswith(".ply")]) == 81
        assert len(rendered["samples"]) == len(SCHEDULE)
        assert all(sample["frame"] == state["frame"] and sample["stage"] == state["stage"] and sample["points"] == 141120 for sample, state in zip(rendered["samples"], SCHEDULE))
        dynamic = [sample for sample in rendered["samples"] if sample["stage"] == "dynamic"]
        assert len({sample["angle"] for sample in dynamic}) == 1
        changes = [sample["changed"] for sample in dynamic if sample["sourceChanged"] and sample["sameCamera"]]
        assert len(changes) == 50 and min(changes) > 100
        report["renders"].append({"name": shot["name"], "frames": len(SCHEDULE), "pointsPerFrame": 141120, "fixedCameraChangedPixelsMinimum": min(changes)})
    for suffix, dimensions in [("-1080p.mp4", SIZE), (".mp4", (1280, 720)), (".webm", (1280, 720))]:
        filename = BOARD["basename"] + suffix
        path = OUTPUT / filename
        original_prefix = prefix_hashes(ORIGINAL / filename)
        assert len(original_prefix) == PREFIX_FRAMES and original_prefix == prefix_hashes(path), filename
        capture = cv2.VideoCapture(str(path))
        selected = {}
        count = 0
        minimum_color = 1.0
        try:
            assert (int(capture.get(3)), int(capture.get(4))) == dimensions
            assert abs(capture.get(cv2.CAP_PROP_FPS) - OUT_FPS) < 0.01
            while True:
                success, pixels = capture.read()
                if not success:
                    break
                small = cv2.resize(pixels, (192, 108))
                minimum_color = min(minimum_color, float((np.ptp(small.astype(np.int16), axis=2) > 24).mean()))
                if count in [PREFIX_FRAMES + index * 2 for index in [0, 35, 66, 93, 100, 180, 194, 269]]:
                    selected[(count - PREFIX_FRAMES) // 2] = cv2.resize(pixels, SIZE).astype(np.float32)
                count += 1
        finally:
            capture.release()
        assert count == 1980 and minimum_color > 0.01, (filename, count, minimum_color)
        motion = []
        for left, top, width, height in TILES:
            area = np.s_[top + 64:top + height, left:left + width]
            difference = float(np.abs(selected[180][area] - selected[100][area]).mean())
            orbit_difference = float(np.abs(selected[269][area] - selected[194][area]).mean())
            assert difference > 0.3 and orbit_difference > 0.3, (filename, left, top, difference, orbit_difference)
            motion.append({"dynamicDifference": difference, "orbitDifference": orbit_difference})
        atoms = mp4_atoms(path) if path.suffix == ".mp4" else []
        assert not atoms or atoms.index("moov") < atoms.index("mdat")
        report["videos"].append({"file": filename, "frames": count, "durationSeconds": count / OUT_FPS, "prefixFramesPixelIdentical": PREFIX_FRAMES, "width": dimensions[0], "height": dimensions[1], "minimumColorFraction": minimum_color, "gridMotion": motion, "sha256": digest(path), "bytes": path.stat().st_size})
        print(f"Verified {filename}: {count} frames, prefix identical, all nine cells move", flush=True)
    first_assets, last_assets = GridAssets(), GridAssets()
    try:
        first = np.asarray(compose(0, first_assets))
        last = np.asarray(compose(269, last_assets))
        for left, top, width, _ in TILES:
            assert np.array_equal(first[top:top + 50, left:left + width], last[top:top + 50, left:left + width])
        report["allNineInputStripsPixelIdentical"] = True
    finally:
        first_assets.close()
        last_assets.close()
    (WORK / "validation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"videos": 3, "framesDecoded": 5940, "sourceHashes": report["sourceCount"]}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--preview", type=Path, help="Compose stills from a fresh render-preview directory")
    modes.add_argument("--verify-only", action="store_true", help="Check all frames, sources, preserved prefix, inputs and motion")
    modes.add_argument("--assemble-only", action="store_true", help="Transcode and concatenate an already prepared master tail")
    arguments = parser.parse_args()
    if arguments.preview:
        preview(arguments.preview)
        return
    if not arguments.verify_only:
        if not arguments.assemble_only:
            encode()
        assemble()
    verify()


if __name__ == "__main__":
    main()
