"""Export and validate the requested Plan4D Gallery without changing source results."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import shutil
from datetime import datetime, timezone

import cv2
import numpy as np
from PIL import Image
from plyfile import PlyData

from prepare_assets import (
    PROJECT, VERTEX_TYPE, export_sequence, export_video_poster,
    export_web_video, frame_paths, read_json, write_json,
)
from prepare_aggregates import export_cloud, load_source, sample_vertices


CASES = {
    "0YrdfBnmrVU-0:02:42.000-0:02:48.840": "Blending Soup",
    "2l9TyNV64Zo-0:01:26.920-0:01:33.426": "Liquid Dripping off a Spoon",
    "3Aku0Zz2_RI-0:03:26.956-0:03:33.379": "Lowering Chopsticks",
    "4MbIbjWJz7k-0:11:10.219-0:11:16.492": "Eating Pizza",
    "EsaTyAI2qxs-0:06:53.371-0:06:59.877": "Slicing a Frosted Cake",
    "FyA7Ft2p5b8-0:03:58.371-0:04:05.111": "Spraying a Car Wheel",
    "Gi56pKL0DpE-0:07:56.480-0:08:03.320": "Shaping a Clay Sculpture",
    "iXTH_6_bIMw-0:01:47.774-0:01:54.489": "Mixing Broccoli and Pasta",
    "Lax0Ppfhct4-0:02:32.785-0:02:39.492": "Tasting Fruit",
    "LcL2UPoQ1C4-0:06:28.788-0:06:35.745": "Draining Fried Food",
    "OFI1bV8KPlk-0:01:21.915-0:01:28.354": "Washing Hands",
    "omniworld_047cd85f5ef7_005257_005337__ti2v": "Walking a Neon-Lit Street",
    "Phu_HyoQWVU-0:00:00.867-0:00:07.841": "Pipetting Pink Liquid",
    "rPT0zZRAzIs-0:05:52.880-0:05:59.160": "Stethoscope Check-Up",
    "test_423875-3_obj_source_right_00486_00567": "Bending Forward",
    "test_90ac3c-3_obj_source_right_00729_00810": "Man and Animals in Motion",
    "u0SFYiZcQG4-0:06:16.709-0:06:23.216": "Drizzling Takoyaki Sauce",
}
VIDEOS = {
    "rgb": "generated_video.mp4",
    "depth": "pred_depth_vis.mp4",
    "flow": "notch14_pointcloud_trails/pred_scene_flow_raw_notch14_pointcloud_trails_vis.mp4",
}
PIPETTE_PROMPT = "Hold the small glass dish. Dispense pink liquid using a pipette. Release the liquid smoothly. Fill the dish gradually."
SOURCE = PROJECT.parents[1] / "plan4d_final_outputs-best"
OUTPUT = PROJECT / "public/results/gallery"
MANIFEST = PROJECT / "src/data/gallery.json"
MAX_POINTS = 16000
MAX_AGGREGATE_POINTS = 200000


def digest(path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def video_info(path) -> dict:
    capture = cv2.VideoCapture(str(path))
    try:
        success, _ = capture.read()
        if not success:
            raise ValueError(f"Cannot decode video: {path}")
        return {
            "fps": capture.get(cv2.CAP_PROP_FPS),
            "frameCount": int(capture.get(cv2.CAP_PROP_FRAME_COUNT)),
            "width": int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)),
            "height": int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        }
    finally:
        capture.release()


def export(resume: bool) -> None:
    for scene_id in CASES:
        directory = SOURCE / scene_id
        frame_paths(directory / "point_cloud")
        for filename in [*VIDEOS.values(), "condition_image.png", "meta.json", "point_cloud/global_pcd_with_camera_trajectory.ply"]:
            if not (directory / filename).is_file():
                raise FileNotFoundError(directory / filename)
    if not resume and (OUTPUT.exists() or MANIFEST.exists()):
        backup = PROJECT / "artifacts" / f"gallery-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}"
        backup.mkdir(parents=True)
        if OUTPUT.exists():
            OUTPUT.rename(backup / "assets")
        if MANIFEST.exists():
            MANIFEST.rename(backup / "gallery.json")
    manifest = {"maxPoints": MAX_POINTS, "maxAggregatePoints": MAX_AGGREGATE_POINTS, "cases": []}
    for index, (scene_id, title) in enumerate(CASES.items()):
        print(f"[{index + 1}/{len(CASES)}] {scene_id}", flush=True)
        directory = SOURCE / scene_id
        destination = OUTPUT / scene_id
        case_manifest = destination / "case.json"
        if resume and case_manifest.exists():
            scene = read_json(case_manifest)
            scene["label"] = f"{index + 1:02d} / {title}"
            write_json(case_manifest, scene)
            manifest["cases"].append(scene)
            continue
        destination.mkdir(parents=True, exist_ok=True)
        metadata = read_json(directory / "meta.json")
        image_path = destination / "input.webp"
        with Image.open(directory / "condition_image.png") as image:
            image.convert("RGB").save(image_path, "WEBP", lossless=True)
        scene = {
            "id": scene_id,
            "label": f"{index + 1:02d} / {title}",
            "prompt": PIPETTE_PROMPT if scene_id.startswith("Phu_HyoQWVU-") else metadata["prompt"],
            "sourcePrompt": metadata["prompt"],
            "image": image_path.relative_to(PROJECT / "public").as_posix(),
            "sequence": export_sequence(directory, destination / "frames", MAX_POINTS),
            "aggregate": export_cloud(scene_id, "plan4d", destination / "global_pcd_with_camera_trajectory.ply.gz", MAX_AGGREGATE_POINTS),
            "videos": {},
        }
        for kind, filename in VIDEOS.items():
            original = directory / filename
            video_path = destination / f"{kind}.mp4"
            webm_path = destination / f"{kind}.webm"
            poster_path = destination / f"{kind}.webp"
            shutil.copy2(original, video_path)
            export_video_poster(original, poster_path)
            export_web_video(original, webm_path)
            scene["videos"][kind] = {
                "mp4": video_path.relative_to(PROJECT / "public").as_posix(),
                "webm": webm_path.relative_to(PROJECT / "public").as_posix(),
                "poster": poster_path.relative_to(PROJECT / "public").as_posix(),
                "source": str(original),
                "sha256": digest(video_path),
                "webmSha256": digest(webm_path),
                **video_info(original),
            }
        scene["fps"] = scene["videos"]["rgb"]["fps"]
        write_json(case_manifest, scene)
        manifest["cases"].append(scene)
    write_json(MANIFEST, manifest)
    write_json(OUTPUT / "provenance.json", {
        "sourceRoot": str(SOURCE),
        "sceneFlowFile": VIDEOS["flow"],
        "cases": [{"id": scene["id"], "sourcePrompt": scene["sourcePrompt"], "aggregateSha256": scene["aggregate"]["sourceSha256"], "videos": scene["videos"]} for scene in manifest["cases"]],
    })


def validate() -> None:
    manifest = read_json(MANIFEST)
    assert [scene["id"] for scene in manifest["cases"]] == list(CASES)
    report = []
    for index, scene in enumerate(manifest["cases"]):
        assert scene["label"] == f"{index + 1:02d} / {CASES[scene['id']]}"
        directory = SOURCE / scene["id"]
        assert scene["sourcePrompt"] == read_json(directory / "meta.json")["prompt"]
        expected_prompt = PIPETTE_PROMPT if scene["id"].startswith("Phu_HyoQWVU-") else scene["sourcePrompt"]
        assert scene["prompt"] == expected_prompt
        with Image.open(directory / "condition_image.png") as original, Image.open(PROJECT / "public" / scene["image"]) as image:
            np.testing.assert_array_equal(np.asarray(original.convert("RGB")), np.asarray(image))
        sequence = scene["sequence"]
        frame_hash = hashlib.sha256()
        for index, original in enumerate(frame_paths(directory / "point_cloud")):
            path = PROJECT / "public" / sequence["path"] / f"{index:04d}.ply.gz"
            frame_hash.update(path.read_bytes())
            with gzip.open(path, "rb") as compressed:
                preview = PlyData.read(compressed)["vertex"].data
            assert len(preview) > 0
            assert all(np.isfinite(preview[axis]).all() for axis in ("x", "y", "z"))
            source = PlyData.read(original)["vertex"].data
            source = source[np.isfinite(np.column_stack([source[axis] for axis in ("x", "y", "z")])).all(axis=1)]
            if len(source) > MAX_POINTS:
                source = source[np.linspace(0, len(source) - 1, MAX_POINTS, dtype=np.int64)]
            expected = np.empty(len(source), dtype=VERTEX_TYPE)
            for name in expected.dtype.names:
                expected[name] = source[name]
            np.testing.assert_array_equal(preview, expected)
        assert frame_hash.hexdigest() == sequence["sha256"]
        source, metadata, source_hash = load_source(directory)
        aggregate = scene["aggregate"]
        assert source_hash == aggregate["sourceSha256"]
        aggregate_path = PROJECT / "public" / aggregate["path"]
        assert digest(aggregate_path) == aggregate["sha256"]
        with gzip.open(aggregate_path, "rb") as compressed:
            np.testing.assert_array_equal(PlyData.read(compressed)["vertex"].data, sample_vertices(source, metadata["source_point_count"], MAX_AGGREGATE_POINTS))
        for kind, video in scene["videos"].items():
            assert video["source"] == str(directory / VIDEOS[kind])
            assert digest(directory / VIDEOS[kind]) == video["sha256"] == digest(PROJECT / "public" / video["mp4"])
            assert digest(PROJECT / "public" / video["webm"]) == video["webmSha256"]
            encoded = video_info(PROJECT / "public" / video["webm"])
            assert encoded["frameCount"] == video["frameCount"]
            assert encoded["width"] == video["width"] and encoded["height"] == video["height"]
        report.append({"case": scene["id"], "frames": sequence["frameCount"], "videos": len(scene["videos"]), "aggregateSourceMatch": True, "allFrameSamplesMatch": True})
        print(f"Validated {scene['id']}", flush=True)
    write_json(PROJECT / "artifacts/gallery-validation.json", report)
    print(f"Validated {len(report)} cases, {sum(item['frames'] for item in report)} frames, 17 aggregate clouds and 51 video pairs.", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate", action="store_true", help="Validate existing assets only")
    parser.add_argument("--resume", action="store_true", help="Reuse completed cases from an interrupted export")
    args = parser.parse_args()
    if not args.validate:
        export(args.resume)
    validate()


if __name__ == "__main__":
    main()
