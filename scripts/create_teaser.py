"""Compose the Plan4D teaser from real Gallery results and rendered PLY clips."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import subprocess

import cv2
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont, ImageOps


PROJECT = Path(__file__).resolve().parents[1]
PUBLIC = PROJECT / "public"
WORK = PROJECT / "artifacts/teaser-20261015"
OUTPUT = PUBLIC / "results/teaser"
BOARD = json.loads((PROJECT / "scripts/teaser_storyboard.json").read_text())
GALLERY = json.loads((PROJECT / "src/data/gallery.json").read_text())["cases"]
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
WIDTH, HEIGHT = BOARD["width"], BOARD["height"]
BACKGROUND = "#f4f6f5"
INK = "#192522"
MUTED = "#64716c"
GREEN = "#16765a"
GOLD = "#a66d24"
FONT_ROOT = Path("/usr/share/fonts/urw-base35")


@lru_cache(maxsize=30)
def font(size, bold=False):
    return ImageFont.truetype(str(FONT_ROOT / ("NimbusSans-Bold.otf" if bold else "NimbusSans-Regular.otf")), size)


def text(canvas, position, content, size=32, color=INK, bold=False, max_width=None):
    draw = ImageDraw.Draw(canvas)
    while max_width and draw.textlength(content, font=font(size, bold)) > max_width:
        size -= 1
    draw.text(position, content, font=font(size, bold), fill=color, anchor="lt")


def wrap(canvas, position, content, width, size=36, color=INK, bold=False):
    draw = ImageDraw.Draw(canvas)
    left, top = position
    lines, line = [], ""
    for word in content.split():
        candidate = (line + " " + word).strip()
        if line and draw.textlength(candidate, font=font(size, bold)) > width:
            lines.append(line)
            line = word
        else:
            line = candidate
    lines.append(line)
    for index, line in enumerate(lines):
        text(canvas, (left, top + index * (size + 12)), line, size, color, bold)
    return top + len(lines) * (size + 12)


def paste(canvas, source, rectangle):
    left, top, width, height = rectangle
    fitted = ImageOps.contain(source, (width, height), Image.Resampling.LANCZOS)
    canvas.paste(fitted, (left + (width - fitted.width) // 2, top + (height - fitted.height) // 2))


def label(canvas, left, top, title, color=GREEN):
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((left, top + 1, left + 5, top + 25), fill=color)
    text(canvas, (left + 18, top), title, 28, INK)


def logo(canvas, left, top, size=108):
    text(canvas, (left, top), "Plan", size, INK, True)
    offset = ImageDraw.Draw(canvas).textlength("Plan", font=font(size, True))
    text(canvas, (left + offset, top), "4D", size, GREEN, True)


def base(shot, index, frame):
    canvas = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    if shot["layout"] in ("opening", "closing"):
        logo(canvas, 64, 49, 104)
        text(canvas, (480, 84), shot["subtitle"], 43, INK, False, 1320)
    else:
        text(canvas, (64, 53), shot["title"], 58, INK, True, 1700)
        logo(canvas, 1718, 58, 34)
    draw = ImageDraw.Draw(canvas)
    draw.line((64, 149, 1856, 149), fill="#d2dbd6", width=2)
    text(canvas, (64, 994), shot["action"], 31, MUTED, False, 1680)
    text(canvas, (1784, 996), f"{index + 1:02d} / 10", 22, MUTED)
    progress = (index * 81 + frame + 1) / (len(BOARD["shots"]) * 81)
    draw.rectangle((64, 1050, 1856, 1053), fill="#dde4df")
    draw.rectangle((64, 1050, 64 + round(1792 * progress), 1053), fill=GREEN)
    return canvas


class Assets:
    def __init__(self):
        self.frames = {}
        self.stills = {}
        self.sources = {}

    def video(self, path, frame):
        path = Path(path)
        if path not in self.frames:
            capture = cv2.VideoCapture(str(path))
            frames = []
            try:
                fps = capture.get(cv2.CAP_PROP_FPS)
                while True:
                    success, pixels = capture.read()
                    if not success:
                        break
                    frames.append(Image.fromarray(cv2.cvtColor(pixels, cv2.COLOR_BGR2RGB)))
            finally:
                capture.release()
            if len(frames) != 81 or abs(fps - 15) > 0.01:
                raise ValueError(f"Unexpected timing: {path}: {len(frames)} frames, {fps} fps")
            self.frames[path] = frames
            self.sources[str(path)] = hashlib.sha256(path.read_bytes()).hexdigest()
        return self.frames[path][frame]

    def clip(self, scene_index, kind, frame):
        return self.video(PUBLIC / GALLERY[scene_index]["videos"][kind]["mp4"], frame)

    def cloud(self, name, frame):
        return self.video(WORK / "clouds" / f"{name}.mp4", frame)

    def still(self, scene_index):
        path = PUBLIC / GALLERY[scene_index]["image"]
        if path not in self.stills:
            self.stills[path] = Image.open(path).convert("RGB")
            self.sources[str(path)] = hashlib.sha256(path.read_bytes()).hexdigest()
        return self.stills[path]

    def clear(self):
        self.frames.clear()


def compose(shot, index, frame, assets):
    canvas = base(shot, index, frame)
    layout = shot["layout"]
    scene_index = shot.get("scene", 0)
    if layout in ("opening", "pair"):
        label(canvas, 64, 198, "Generated RGB video")
        right_label = "Dynamic 4D point cloud" if "cloud" in shot else "Generated depth"
        label(canvas, 976, 198, right_label, GOLD)
        paste(canvas, assets.clip(scene_index, "rgb", frame), (64, 258, 856, 642))
        right = assets.cloud(shot["cloud"], frame) if "cloud" in shot else assets.clip(scene_index, "depth", frame)
        paste(canvas, right, (960, 258, 896, 642))
        if layout == "opening":
            text(canvas, (64, 916), "Observed image + planned action", 29, GREEN)
            text(canvas, (976, 916), "Future appearance + geometry + motion", 29, GREEN)
    elif layout == "condition":
        label(canvas, 64, 198, "Observed image")
        paste(canvas, assets.still(scene_index), (64, 252, 500, 282))
        label(canvas, 64, 587, "Planned action")
        wrap(canvas, (64, 643), '"' + shot["action"] + '"', 500, 41)
        draw = ImageDraw.Draw(canvas)
        draw.line((597, 522, 661, 522), fill=GREEN, width=5)
        draw.polygon([(661, 522), (643, 512), (643, 532)], fill=GREEN)
        label(canvas, 716, 198, "Generated RGB video")
        paste(canvas, assets.clip(scene_index, "rgb", frame), (716, 242, 1120, 330))
        label(canvas, 716, 614, "Generated depth", GOLD)
        paste(canvas, assets.clip(scene_index, "depth", frame), (716, 658, 1120, 310))
    elif layout == "modalities":
        cells = [(64, 181, "Generated RGB video", "rgb"), (976, 181, "Generated depth", "depth"), (64, 574, "Dynamic 4D point cloud", "cloud"), (976, 574, "Scene flow", "flow")]
        for left, top, title, kind in cells:
            label(canvas, left, top, title, GREEN if kind in ("rgb", "cloud") else GOLD)
            source = assets.cloud(shot["cloud"], frame) if kind == "cloud" else assets.clip(scene_index, kind, frame)
            paste(canvas, source, (left, top + 45, 856, 340))
    elif layout == "detail":
        label(canvas, 64, 198, "Generated RGB video")
        paste(canvas, assets.clip(scene_index, "rgb", frame), (64, 258, 1100, 644))
        label(canvas, 1232, 198, "Generated depth", GOLD)
        paste(canvas, assets.clip(scene_index, "depth", frame), (1232, 242, 624, 315))
        label(canvas, 1232, 600, "Scene flow", GOLD)
        paste(canvas, assets.clip(scene_index, "flow", frame), (1232, 643, 624, 310))
    elif layout == "aggregate":
        label(canvas, 64, 198, "Generated RGB video")
        paste(canvas, assets.clip(scene_index, "rgb", frame), (64, 245, 552, 310))
        label(canvas, 64, 614, "Generated depth", GOLD)
        paste(canvas, assets.clip(scene_index, "depth", frame), (64, 660, 552, 310))
        label(canvas, 688, 198, "Aggregated 4D point cloud + cameras", GOLD)
        paste(canvas, assets.cloud(shot["cloud"], frame), (662, 246, 1194, 704))
    elif layout in ("mosaic", "closing"):
        columns = 3
        rows = 3 if layout == "mosaic" else 2
        cell_height = 246 if rows == 3 else 338
        top_start = 183 if rows == 3 else 223
        for tile, selected in enumerate(shot["scenes"]):
            left = 64 + (tile % columns) * 604
            top = top_start + (tile // columns) * (cell_height + 12)
            paste(canvas, assets.clip(selected, "rgb", frame), (left, top, 584, cell_height - 32))
            title = GALLERY[selected]["label"].split(" / ", 1)[1]
            text(canvas, (left, top + cell_height - 25), title, 24, MUTED, False, 584)
    return canvas


def encode_args(destination):
    return [FFMPEG, "-n", "-hide_banner", "-loglevel", "warning", "-f", "rawvideo", "-vcodec", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}", "-r", "15", "-i", "pipe:0", "-an", "-vf", "fps=30", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-threads", "4", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-metadata", "title=" + BOARD["title"], "-metadata", "comment=Real Plan4D qualitative outputs; no audio; source motion at 15 fps", str(destination)]


def transcode(master):
    common = [FFMPEG, "-n", "-hide_banner", "-loglevel", "warning", "-i", str(master), "-an", "-vf", "scale=1280:720:flags=lanczos", "-threads", "4"]
    mp4 = OUTPUT / "plan4d-teaser.mp4"
    webm = OUTPUT / "plan4d-teaser.webm"
    if not mp4.exists():
        subprocess.run([*common, "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(mp4)], check=True)
    if not webm.exists():
        subprocess.run([*common, "-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-pix_fmt", "yuv420p", str(webm)], check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", action="store_true", help="Export ten still storyboard frames only")
    parser.add_argument("--web-only", action="store_true", help="Encode web versions from the existing 1080p master")
    args = parser.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    master = OUTPUT / "plan4d-teaser-1080p.mp4"
    if args.web_only:
        transcode(master)
        return
    if master.exists() and not args.preview:
        raise FileExistsError(f"Preserving existing video: {master}")
    assets = Assets()
    previews = []
    encoder = None if args.preview else subprocess.Popen(encode_args(master), stdin=subprocess.PIPE)
    previous = None
    try:
        for index, shot in enumerate(BOARD["shots"]):
            print(f"Shot {index + 1}/10: {shot['title']}", flush=True)
            frame_indices = [40] if args.preview else range(81)
            for frame in frame_indices:
                canvas = compose(shot, index, frame, assets)
                if previous is not None and frame < 5 and not args.preview:
                    canvas = Image.blend(previous, canvas, (frame + 1) / 5)
                if frame == 40:
                    canvas.save(WORK / f"storyboard-{index + 1:02d}.jpg", quality=93)
                    previews.append(canvas.resize((640, 360), Image.Resampling.LANCZOS))
                    if index == 0:
                        canvas.resize((1280, 720), Image.Resampling.LANCZOS).save(OUTPUT / "plan4d-teaser-poster.webp", quality=93)
                if encoder:
                    encoder.stdin.write(canvas.tobytes())
            previous = canvas
            assets.clear()
        if encoder:
            encoder.stdin.close()
            if encoder.wait() != 0:
                raise RuntimeError("Master video encoding failed")
    finally:
        if encoder and encoder.poll() is None:
            encoder.terminate()
            encoder.wait()
    contact = Image.new("RGB", (1280, 5 * 360), BACKGROUND)
    for index, preview in enumerate(previews):
        contact.paste(preview, ((index % 2) * 640, (index // 2) * 360))
    contact.save(WORK / "storyboard.jpg", quality=92)
    if not args.preview:
        cloud_sources = {shot["cloud"]: json.loads((WORK / "clouds" / (shot["cloud"] + ".json")).read_text()) for shot in BOARD["shots"] if "cloud" in shot}
        selected = sorted({scene for shot in BOARD["shots"] for scene in ([shot["scene"]] if "scene" in shot else shot["scenes"])})
        scenes = [{"index": scene, "id": GALLERY[scene]["id"], "prompt": GALLERY[scene]["prompt"], "videos": GALLERY[scene]["videos"]} for scene in selected]
        provenance = {"created": datetime.now(timezone.utc).isoformat(), "duration": 54, "sourceFps": 15, "outputFps": 30, "audio": False, "storyboard": BOARD, "scenes": scenes, "cloudSources": cloud_sources, "sourceHashes": assets.sources, "notes": ["Source timing preserved; frames duplicated for 30 fps delivery", "5-frame dissolves at edit boundaries; no optical-flow interpolation", "Point clouds rendered from unmodified original PLY files", "Action captions are shortened editorial summaries, not full input prompts"]}
        (OUTPUT / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
        transcode(master)
    print(f"Output: {OUTPUT}", flush=True)


if __name__ == "__main__":
    main()
