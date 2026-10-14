"""Export the requested EPIC results into a self-contained static project page."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops
from plyfile import PlyData, PlyElement


PROJECT = Path(__file__).resolve().parents[1]
FRAME_PATTERN = re.compile(r"(?:frame_)?(\d+)\.ply$")
CASE_PATTERN = re.compile(r"epic_kitchens100_(P\d+_\d+_\d+)")
METHODS = ("gen3r", "tesseract", "vist3a", "plan4d")
EXCLUDED = {"P02_121_87", "P28_101_119"}
VERTEX_TYPE = [(axis, "<f4") for axis in ("x", "y", "z")] + [
    (channel, "u1") for channel in ("red", "green", "blue")
]


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def canonical_id(path: Path) -> str:
    match = CASE_PATTERN.match(path.name)
    if not match:
        raise ValueError(f"Invalid EPIC case: {path}")
    return match.group(1)


def frame_paths(directory: Path) -> list[Path]:
    frames = sorted(
        ((int(match.group(1)), path) for path in directory.glob("*.ply")
         if (match := FRAME_PATTERN.fullmatch(path.name))),
        key=lambda item: item[0],
    )
    if [index for index, _ in frames] != list(range(81)):
        raise ValueError(f"Expected exactly frames 0..80: {directory}")
    return [path for _, path in frames]


def camera_transform(directory: Path) -> np.ndarray:
    camera_file = directory / "cameras.json"
    if camera_file.exists():
        data = read_json(camera_file)
        extrinsics = data.get("w2c", data.get("extrinsics_world_to_camera", data.get("extrinsics")))
        matrix = np.asarray(extrinsics[0], dtype=np.float64)
    else:
        import torch

        bundle_file = directory / "decode_outputs.pt"
        if bundle_file.exists():
            bundle = torch.load(bundle_file, map_location="cpu", weights_only=True)
            extrinsics = bundle["extrinsic_w2c"]
        else:
            extrinsics = torch.load(
                directory / "pred_camera_extrinsics_raw.pt", map_location="cpu", weights_only=True
            )
        matrix = extrinsics.numpy().reshape(-1, 3, 4)[0]
    transform = np.eye(4)
    transform[:3, :4] = matrix[:3, :4]
    return transform


def vist3a_provenance(directory: Path) -> dict:
    metadata = read_json(directory / "meta.json")
    if "Wan2.1" not in metadata.get("model_id", "") or "vist3a_14b_lora_ema" not in metadata.get("transformer_lora_path", ""):
        raise ValueError(f"Expected the Wan2.1 + AnySplat VIST3A baseline: {directory}")
    if not (directory / "decode_outputs.pt").is_file():
        raise ValueError(f"Missing original AnySplat geometry and cameras: {directory}")
    inventory = read_json(directory.parent.parent / "_inventory/source_manifest.json")
    records = [record for record in inventory["records"]
               if record["method"] == "vist3a" and record["case"] == directory.name]
    if len(records) != 1 or not records[0]["source"]:
        raise ValueError(f"Missing VIST3A source mapping: {directory}")
    original = Path(records[0]["source"])
    original.resolve().relative_to(PROJECT.parents[1] / "ti2v_bench_anysplat_outputs")
    if read_json(original / "meta.json") != metadata:
        raise ValueError(f"VIST3A metadata differs from its original source: {directory}")
    return {"originalDirectory": str(original), "model": metadata["model_id"],
            "geometryModel": "AnySplat", "cameraSource": "decode_outputs.pt:extrinsic_w2c"}


def export_sequence(directory: Path, destination: Path, max_points: int) -> dict:
    paths = frame_paths(directory / "point_cloud")
    destination.mkdir(parents=True, exist_ok=True)
    transform = camera_transform(directory)
    view_points = []
    original_counts = []
    preview_counts = []
    digest = hashlib.sha256()
    for index, path in enumerate(paths):
        source = PlyData.read(path)["vertex"].data
        positions = np.column_stack([source[axis] for axis in ("x", "y", "z")])
        finite = np.isfinite(positions).all(axis=1)
        source = source[finite]
        original_counts.append(len(source))
        if not len(source):
            raise ValueError(f"Empty point cloud: {path}")
        if max_points and len(source) > max_points:
            source = source[np.linspace(0, len(source) - 1, max_points, dtype=np.int64)]
        vertices = np.empty(len(source), dtype=VERTEX_TYPE)
        for name in vertices.dtype.names:
            vertices[name] = source[name]
        preview_counts.append(len(vertices))
        preview = destination / f"{index:04d}.ply.gz"
        with preview.open("wb") as output:
            with gzip.GzipFile(fileobj=output, mode="wb", mtime=0, filename="") as compressed:
                PlyData([PlyElement.describe(vertices, "vertex")], text=False, byte_order="<").write(compressed)
        digest.update(preview.read_bytes())
        if index in (0, 20, 40, 60, 80):
            points = np.column_stack([vertices[axis] for axis in ("x", "y", "z")])
            camera_points = points @ transform[:3, :3].T + transform[:3, 3]
            camera_points *= np.array([1, -1, -1])
            view_points.append(camera_points)
    points = np.concatenate(view_points)
    lower, upper = np.quantile(points, [0.025, 0.975], axis=0)
    center = (lower + upper) / 2
    radius = float(np.max(upper - lower) / 2)
    if not np.isfinite(radius) or radius <= 0:
        raise ValueError(f"Degenerate point cloud bounds: {directory}")
    return {
        "frameCount": len(paths),
        "path": destination.relative_to(PROJECT / "public").as_posix(),
        "worldToCamera": transform.flatten().tolist(),
        "center": center.tolist(),
        "radius": radius,
        "sourcePoints": [min(original_counts), max(original_counts)],
        "previewPoints": [min(preview_counts), max(preview_counts)],
        "sourceCase": directory.name,
        "sha256": digest.hexdigest(),
    }


def export_figure(source: Path, destination: Path) -> None:
    import pypdfium2 as pdfium

    with pdfium.PdfDocument(source) as document:
        page = document[0]
        bitmap = page.render(scale=min(3, 2600 / page.get_width()))
        image = bitmap.to_pil().convert("RGB")
        bounds = ImageChops.difference(image, Image.new("RGB", image.size, "white")).getbbox()
        if bounds:
            image = image.crop(bounds)
        image.save(destination, "WEBP", quality=93)


def export_video_poster(source: Path, destination: Path) -> None:
    import cv2

    capture = cv2.VideoCapture(str(source))
    try:
        success, frame = capture.read()
        if not success:
            raise ValueError(f"Unable to read video: {source}")
        Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).save(destination, "WEBP", quality=90)
    finally:
        capture.release()


def export_web_video(source: Path, destination: Path) -> None:
    import imageio_ffmpeg

    subprocess.run([
        imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-i", str(source), "-an", "-c:v", "libvpx-vp9", "-crf", "28",
        "-b:v", "0", "-deadline", "good", "-cpu-used", "4", "-threads", "2",
        "-row-mt", "1", "-pix_fmt", "yuv420p", str(destination),
    ], check=True)


def refresh_vist3a(baselines_root: Path) -> None:
    manifest_path = PROJECT / "src/data/results.json"
    provenance_path = PROJECT / "public/results/provenance.json"
    manifest = read_json(manifest_path)
    provenance = read_json(provenance_path)
    replacements = []
    for scene in manifest["cases"]:
        scene_id = scene["id"]
        candidates = sorted(path for path in (baselines_root / "vist3a").glob(f"epic_kitchens100_{scene_id}*")
                            if canonical_id(path) == scene_id)
        if len(candidates) != 1:
            raise ValueError(f"Ambiguous/missing VIST3A baseline for {scene_id}: {candidates}")
        directory = candidates[0]
        origin = vist3a_provenance(directory)
        frame_paths(directory / "point_cloud")
        replacements.append((scene, directory, origin))
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = PROJECT / "artifacts" / f"vist3a-source-correction-{timestamp}"
    backup.mkdir(parents=True)
    shutil.copy2(manifest_path, backup / "results.json")
    shutil.copy2(provenance_path, backup / "provenance.json")
    for scene, directory, origin in replacements:
        scene_id = scene["id"]
        previous_id = scene["methods"]["vist3a"]
        previous = manifest["sequences"][previous_id]
        old_folder = PROJECT / "public" / previous["path"]
        if old_folder.exists():
            old_folder.rename(backup / old_folder.name)
        sequence_id = f"vist3a-{scene_id}-wan21-anysplat"
        destination = PROJECT / "public/results" / sequence_id
        if destination.exists():
            destination.rename(backup / destination.name)
        print(f"Exporting {sequence_id}: {directory}", flush=True)
        sequence = export_sequence(directory, destination, manifest["maxPoints"])
        plan4d_id = scene["methods"]["plan4d"]
        if sequence["sha256"] == manifest["sequences"][plan4d_id]["sha256"]:
            raise ValueError(f"VIST3A duplicates Plan4D: {scene_id}")
        manifest["sequences"] = {
            sequence_id if key == previous_id else key: sequence if key == previous_id else value
            for key, value in manifest["sequences"].items()
        }
        scene["methods"]["vist3a"] = sequence_id
        provenance["sources"] = [source for source in provenance["sources"] if source["sequence"] != previous_id]
        provenance["sources"].append({"sequence": sequence_id, "directory": str(directory.resolve()), **origin})
    write_json(manifest_path, manifest)
    write_json(provenance_path, provenance)
    print(f"Refreshed {len(replacements)} VIST3A sequences; previous assets preserved in {backup}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results-root", type=Path, default=PROJECT.parents[1] / "plan4d_final_outputs-best")
    parser.add_argument("--baselines-root", type=Path, default=PROJECT.parents[1] / "plan4d_final_outputs-baselines")
    parser.add_argument("--paper-root", type=Path, default=Path("/mnt/workspace/hwzhang/69e090695f534d4b6292331f"))
    parser.add_argument("--max-points", type=int, default=16000, help="Maximum preview points per frame, 0 keeps all points")
    parser.add_argument("--refresh-vist3a", action="store_true", help="Refresh only VIST3A sequences and preserve the other methods")
    args = parser.parse_args()
    if args.max_points < 0:
        parser.error("--max-points must be nonnegative")
    if args.refresh_vist3a:
        refresh_vist3a(args.baselines_root)
        return
    cases = sorted(path for path in args.results_root.glob("epic_kitchens100_*") if path.is_dir() and canonical_id(path) not in EXCLUDED)
    grouped = {}
    for path in cases:
        grouped.setdefault(canonical_id(path), []).append(path)
    if len(grouped) != 6 or any(len(variants) != 1 for variants in grouped.values()):
        raise ValueError("Expected six distinct EPIC scenes with one Plan4D result each")
    output = PROJECT / "public" / "results"
    output.mkdir(parents=True, exist_ok=True)
    sequences = {}
    entries = []
    sources = []
    for scene_id, variants in grouped.items():
        plan4d_directory = variants[0]
        meta = read_json(plan4d_directory / "meta.json")
        image_path = output / f"{scene_id}.webp"
        with Image.open(plan4d_directory / "condition_image.png") as condition:
            condition.convert("RGB").save(image_path, "WEBP", quality=95)
        entry = {
            "id": scene_id,
            "prompt": meta["prompt"],
            "fps": meta.get("fps", 16),
            "image": f"results/{scene_id}.webp",
            "methods": {},
        }
        for method in METHODS:
            if method == "plan4d":
                candidates = [plan4d_directory]
            else:
                candidates = sorted(path for path in (args.baselines_root / method).glob(f"epic_kitchens100_{scene_id}*") if canonical_id(path) == scene_id)
                if len(candidates) != 1:
                    raise ValueError(f"Ambiguous/missing {method} baseline for {scene_id}: {candidates}")
            for directory in candidates:
                origin = vist3a_provenance(directory) if method == "vist3a" else {}
                sequence_id = f"{method}-{scene_id}" + ("-wan21-anysplat" if method == "vist3a" else "")
                print(f"Exporting {sequence_id}: {directory.name}", flush=True)
                sequences[sequence_id] = export_sequence(directory, output / sequence_id, args.max_points)
                sources.append({"sequence": sequence_id, "directory": str(directory.resolve()), **origin})
                entry["methods"][method] = sequence_id
        video = plan4d_directory / "generated_video.mp4"
        depth = plan4d_directory / "pred_depth_vis.mp4"
        for source, suffix in ((video, "rgb"), (depth, "depth")):
            shutil.copy2(source, output / f"{scene_id}-{suffix}.mp4")
            export_web_video(source, output / f"{scene_id}-{suffix}.webm")
        entry["video"] = f"results/{scene_id}-rgb.mp4"
        entry["depthVideo"] = f"results/{scene_id}-depth.mp4"
        export_video_poster(depth, output / f"{scene_id}-depth.webp")
        entries.append(entry)
    manifest = {"maxPoints": args.max_points, "excludedCases": sorted(EXCLUDED), "cases": entries, "sequences": sequences}
    write_json(PROJECT / "src" / "data" / "results.json", manifest)
    write_json(output / "provenance.json", {"sources": sources, "maxPoints": args.max_points, "excludedCases": sorted(EXCLUDED)})
    figures = PROJECT / "public" / "figures"
    figures.mkdir(parents=True, exist_ok=True)
    for source, target in (("plan4d_teaser-v1.pdf", "teaser.webp"), ("plab4d_final-chuanxia.pdf", "method.webp")):
        export_figure(args.paper_root / "figs" / source, figures / target)
    total = sum(path.stat().st_size for path in output.rglob("*") if path.is_file())
    print(f"Prepared {len(entries)} scenes, {len(sequences)} sequences, {total / 2**20:.1f} MiB.")


if __name__ == "__main__":
    main()
