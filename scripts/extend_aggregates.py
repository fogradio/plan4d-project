"""Audit source pairing and append verified aggregated comparisons without replacing existing assets."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from prepare_aggregates import CASES, FILENAME, MANIFEST, export_cloud, source_directory, validate
from prepare_assets import METHODS, PROJECT, read_json, vist3a_provenance, write_json


ROOT = PROJECT.parents[1]
OUTPUT = PROJECT / "public/results/aggregated-extra"


def digest(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def inventory() -> dict:
    root = ROOT / "plan4d_final_outputs"
    records = []
    files = list(root.rglob("*"))
    for metadata_path in sorted(root.glob("*/meta.json")):
        scene = metadata_path.parent.name
        metadata = read_json(metadata_path)
        records.append({
            "case": scene,
            "metadata": str(metadata_path),
            "condition": metadata.get("condition_path"),
            "prompt": metadata["prompt"],
            "frames": metadata.get("effective_num_frames"),
            "rawMerged": (metadata_path.parent / "point_cloud/merged.ply").exists(),
            "trajectoryMethods": [method for method in METHODS
                                  if (source_directory(scene, method) / "point_cloud" / FILENAME).exists()],
        })
    return {"root": str(root), "recursiveEntries": len(files), "cases": records}


def pairing(scene: str) -> dict:
    raw = ROOT / "plan4d_final_outputs" / scene
    prepared = source_directory(scene, "plan4d")
    identical = {}
    for filename in ("meta.json", "condition_image.png", "point_cloud/merged.ply",
                     "pred_camera_extrinsics_raw.pt", "pred_camera_intrinsics_raw.pt"):
        identical[filename] = digest(raw / filename)
        assert identical[filename] == digest(prepared / filename), (scene, filename)
    plan4d = read_json(raw / "meta.json")
    gen3r = read_json(source_directory(scene, "gen3r") / "metadata.json")
    tesseract = read_json(source_directory(scene, "tesseract") / "meta.json")
    vist3a = read_json(source_directory(scene, "vist3a") / "meta.json")
    assert plan4d["prompt"] == gen3r["sample"]["prompt"] == tesseract["prompt"] == vist3a["prompt"]
    condition = Path(plan4d["condition_path"])
    assert condition.resolve() == Path(gen3r["input_condition_path"]).resolve() == Path(tesseract["condition_path"]).resolve()
    assert plan4d["frame_indices"] == gen3r["sample"]["frame_indices"] == list(range(81))
    assert plan4d["effective_num_frames"] == gen3r["num_frames"] == tesseract["effective_num_frames"] == 81
    original = vist3a_provenance(source_directory(scene, "vist3a"))
    video = source_directory(scene, "vist3a") / "generated_video.mp4"
    assert digest(video) == digest(Path(original["originalDirectory"]) / video.name)
    capture = cv2.VideoCapture(str(video))
    try:
        success, frame = capture.read()
        assert success and int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) == 81
        assert abs(capture.get(cv2.CAP_PROP_FPS) - gen3r["fps"]) < 0.1
    finally:
        capture.release()
    reference = cv2.resize(cv2.imread(str(condition)), (160, 90)).astype(float)
    decoded = cv2.resize(frame, (160, 90)).astype(float)
    error = float(np.abs(reference - decoded).mean())
    correlation = float(np.corrcoef(reference.ravel(), decoded.ravel())[0, 1])
    assert error < 8 and correlation > 0.98, (scene, error, correlation)
    sources = {}
    for method in METHODS:
        directory = source_directory(scene, method)
        metadata = read_json(directory / "point_cloud/global_pcd_with_camera_trajectory_manifest.json")
        assert metadata["frame_count"] == 81
        assert digest(Path(metadata["source_pcd"])) == metadata["source_pcd_sha256"]
        for path, expected in metadata["camera_sources_sha256"].items():
            assert digest(Path(path)) == expected
        sources[method] = str(directory / "point_cloud" / FILENAME)
    return {
        "case": scene, "rawDirectory": str(raw), "preparedDirectory": str(prepared),
        "identicalRawFiles": identical, "condition": str(condition), "conditionSha256": digest(condition),
        "prompt": plan4d["prompt"], "frames": 81, "sources": sources,
        "vist3a": {**original, "conditionEvidence": "Lossy first RGB frame compared with the same source image",
                   "firstFrameMeanAbsoluteError": error, "firstFrameCorrelation": correlation},
        "nativeConfigurations": {
            "plan4d": {key: plan4d[key] for key in ("seed", "cfg_scale", "effective_num_frames", "condition_path")},
            "gen3r": {key: gen3r[key] for key in ("seed", "guidance_scale", "num_frames", "preprocessing")},
            "tesseract": {key: tesseract[key] for key in ("seed", "guidance_scale", "effective_num_frames", "camera_pose_source")},
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate", action="store_true")
    args = parser.parse_args()
    report = inventory()
    report["pairing"] = [pairing(scene) for scene in CASES[3:]]
    report["limitations"] = [
        "HOIGen TesserAct uses 49 frames and DA3 postprocessing, unlike the 81-frame native Gen3R/Plan4D outputs; not added in this extension.",
        "Models retain their native seeds, preprocessing, and reconstruction scale; the display is not metric alignment.",
        "VIST3A metadata lacks an input path; pairing uses the original AnySplat inventory, identical prompt, and first-frame image evidence.",
    ]
    write_json(PROJECT / "artifacts/comparison-refinement/asset-audit.json", report)
    if not args.validate:
        manifest = read_json(MANIFEST)
        backup = PROJECT / "artifacts/comparison-refinement/aggregated-before.json"
        if not backup.exists():
            write_json(backup, manifest)
        for scene in CASES[3:]:
            if any(case["id"] == scene for case in manifest["cases"]):
                continue
            image = OUTPUT / f"{scene}.webp"
            if image.exists():
                raise FileExistsError(image)
            image.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(source_directory(scene, "plan4d") / "condition_image.png") as source:
                source.convert("RGB").save(image, "WEBP", lossless=True)
            case = {"id": scene, "prompt": read_json(source_directory(scene, "plan4d") / "meta.json")["prompt"],
                    "image": image.relative_to(PROJECT / "public").as_posix(), "methods": {}}
            for method in METHODS:
                sequence_id = f"{method}-{scene}"
                destination = OUTPUT / sequence_id / f"{FILENAME}.gz"
                if destination.exists():
                    raise FileExistsError(destination)
                print(f"Exporting {sequence_id}", flush=True)
                manifest["sequences"][sequence_id] = export_cloud(scene, method, destination, manifest["maxScenePoints"])
                case["methods"][method] = sequence_id
            manifest["cases"].append(case)
        write_json(MANIFEST, manifest)
        write_json(OUTPUT / "provenance.json", {"pairing": report["pairing"], "limitations": report["limitations"]})
    validate()
    print(json.dumps({"addedCases": CASES[3:], "pairing": "verified", "audit": "artifacts/comparison-refinement/asset-audit.json"}))


if __name__ == "__main__":
    main()
