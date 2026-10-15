"""Export and validate the aggregated point-cloud comparisons."""

from __future__ import annotations

import argparse
import gzip
import hashlib
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image
from plyfile import PlyData, PlyElement

from prepare_assets import (
    METHODS, PROJECT, VERTEX_TYPE, camera_transform, read_json,
    vist3a_provenance, write_json,
)


CASES = (
    "iaHNa6cm64k-0:02:50.044-0:02:56.759",
    "test_cab_e_3rd_00000_00081",
    "ZHwqSpZfPCI-0:05:13.280-0:05:19.640",
    "epic_kitchens100_P02_122_161",
    "epic_kitchens100_P02_129_354",
    "epic_kitchens100_P07_116_25-勉强尚可",
)
FILENAME = "global_pcd_with_camera_trajectory.ply"
OUTPUT = PROJECT / "public/results/aggregated"
MANIFEST = PROJECT / "src/data/aggregated.json"


def source_directory(scene: str, method: str) -> Path:
    root = PROJECT.parents[1]
    parent = root / "plan4d_final_outputs-best" if method == "plan4d" else root / "plan4d_final_outputs-baselines" / method
    return parent / scene


def load_source(directory: Path) -> tuple:
    path = directory / "point_cloud" / FILENAME
    metadata = read_json(path.with_name("global_pcd_with_camera_trajectory_manifest.json"))
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != metadata["output_sha256"]:
        raise ValueError(f"Source hash differs from trajectory manifest: {path}")
    vertices = PlyData.read(path)["vertex"].data
    scene_count = metadata["source_point_count"]
    camera_count = metadata["frustum_point_count"] + metadata["trajectory_point_count"]
    if len(vertices) != scene_count + camera_count:
        raise ValueError(f"Unexpected source/camera vertex counts: {path}")
    for axis in ("x", "y", "z"):
        if not np.isfinite(vertices[axis]).all():
            raise ValueError(f"Nonfinite vertices: {path}")
    return vertices, metadata, digest


def sample_vertices(source: np.ndarray, scene_count: int, max_points: int) -> np.ndarray:
    count = min(scene_count, max_points) if max_points else scene_count
    indices = np.concatenate((
        np.linspace(0, scene_count - 1, count, dtype=np.int64),
        np.arange(scene_count, len(source)),
    ))
    vertices = np.empty(len(indices), dtype=VERTEX_TYPE)
    for name in vertices.dtype.names:
        vertices[name] = source[name][indices]
    return vertices


def first_camera(directory: Path, metadata: dict) -> np.ndarray:
    camera_archives = [Path(path) for path in metadata["camera_sources_sha256"] if path.endswith(".npz")]
    if camera_archives:
        with np.load(camera_archives[0]) as cameras:
            transform = np.eye(4)
            transform[:3, :4] = cameras["extrinsics"][0, :3, :4]
    else:
        transform = camera_transform(directory)
    np.testing.assert_allclose(
        np.linalg.inv(transform)[:3, 3], metadata["camera_centers_world"][0], atol=1e-5,
    )
    return transform


def export_cloud(scene: str, method: str, destination: Path, max_points: int) -> dict:
    directory = source_directory(scene, method)
    source, metadata, source_hash = load_source(directory)
    vertices = sample_vertices(source, metadata["source_point_count"], max_points)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as output:
        with gzip.GzipFile(fileobj=output, mode="wb", mtime=0, filename="") as compressed:
            PlyData([PlyElement.describe(vertices, "vertex")], text=False, byte_order="<").write(compressed)
    transform = first_camera(directory, metadata)
    points = np.column_stack([vertices[axis] for axis in ("x", "y", "z")])
    points = (points @ transform[:3, :3].T + transform[:3, 3]) * [1, -1, -1]
    camera_count = metadata["frustum_point_count"] + metadata["trajectory_point_count"]
    lower, upper = np.quantile(points[:-camera_count], [0.005, 0.995], axis=0)
    lower = np.minimum(lower, points[-camera_count:].min(axis=0))
    upper = np.maximum(upper, points[-camera_count:].max(axis=0))
    radius = float(np.linalg.norm(upper - lower) / 2)
    if not np.isfinite(radius) or radius <= 0:
        raise ValueError(f"Degenerate display bounds: {directory}")
    return {
        "path": destination.relative_to(PROJECT / "public").as_posix(),
        "worldToCamera": transform.flatten().tolist(),
        "center": ((lower + upper) / 2).tolist(),
        "radius": radius,
        "sourceCase": scene,
        "frameCount": 1,
        "sourceFrameCount": metadata["frame_count"],
        "sourcePoints": len(source),
        "previewPoints": len(vertices),
        "cameraPoints": camera_count,
        "sourceSha256": source_hash,
        "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
    }


def export(max_points: int) -> None:
    for scene in CASES:
        for method in METHODS:
            directory = source_directory(scene, method)
            if not (directory / "point_cloud" / FILENAME).is_file():
                raise FileNotFoundError(directory / "point_cloud" / FILENAME)
            if method == "vist3a":
                vist3a_provenance(directory)
    if OUTPUT.exists() or MANIFEST.exists():
        backup = PROJECT / "artifacts" / f"aggregated-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}"
        backup.mkdir(parents=True)
        if OUTPUT.exists():
            OUTPUT.rename(backup / "assets")
        if MANIFEST.exists():
            MANIFEST.rename(backup / "aggregated.json")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {"maxScenePoints": max_points, "cases": [], "sequences": {}}
    provenance = {"sourceFilename": FILENAME, "sources": []}
    for scene in CASES:
        plan4d = source_directory(scene, "plan4d")
        prompt = read_json(plan4d / "meta.json")["prompt"]
        image = OUTPUT / f"{scene}.webp"
        with Image.open(plan4d / "condition_image.png") as condition:
            condition.convert("RGB").save(image, "WEBP", lossless=True)
        case = {"id": scene, "prompt": prompt, "image": image.relative_to(PROJECT / "public").as_posix(), "methods": {}}
        for method in METHODS:
            sequence_id = f"{method}-{scene}"
            print(f"Exporting {sequence_id}", flush=True)
            sequence = export_cloud(scene, method, OUTPUT / sequence_id / f"{FILENAME}.gz", max_points)
            manifest["sequences"][sequence_id] = sequence
            case["methods"][method] = sequence_id
            provenance["sources"].append({
                "sequence": sequence_id,
                "file": str(source_directory(scene, method) / "point_cloud" / FILENAME),
                "sha256": sequence["sourceSha256"],
            })
        manifest["cases"].append(case)
    write_json(MANIFEST, manifest)
    write_json(OUTPUT / "provenance.json", provenance)


def validate() -> None:
    manifest = read_json(MANIFEST)
    assert [scene["id"] for scene in manifest["cases"]] == list(CASES)
    assert len(manifest["sequences"]) == len(CASES) * len(METHODS)
    report = []
    for scene in manifest["cases"]:
        plan4d = source_directory(scene["id"], "plan4d")
        assert scene["prompt"] == read_json(plan4d / "meta.json")["prompt"]
        with Image.open(plan4d / "condition_image.png") as original, Image.open(PROJECT / "public" / scene["image"]) as preview:
            np.testing.assert_array_equal(np.asarray(original.convert("RGB")), np.asarray(preview.convert("RGB")))
        hashes = []
        for method in METHODS:
            directory = source_directory(scene["id"], method)
            source, metadata, source_hash = load_source(directory)
            sequence = manifest["sequences"][scene["methods"][method]]
            assert source_hash == sequence["sourceSha256"]
            asset = PROJECT / "public" / sequence["path"]
            assert hashlib.sha256(asset.read_bytes()).hexdigest() == sequence["sha256"]
            with gzip.open(asset, "rb") as compressed:
                actual = PlyData.read(compressed)["vertex"].data
            expected = sample_vertices(source, metadata["source_point_count"], manifest["maxScenePoints"])
            np.testing.assert_array_equal(actual, expected)
            np.testing.assert_allclose(first_camera(directory, metadata).flatten(), sequence["worldToCamera"])
            assert sequence["previewPoints"] == len(actual)
            hashes.append(source_hash)
            report.append({"case": scene["id"], "method": method, "vertices": len(actual), "cameraVertices": sequence["cameraPoints"], "sourceMatch": True})
        assert len(set(hashes)) == len(METHODS), "Methods must not duplicate one another"
    write_json(PROJECT / "artifacts/aggregated-validation.json", report)
    print(f"Validated {len(report)} aggregated point clouds, all sampled XYZ/RGB values and complete camera trajectories.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-scene-points", type=int, default=200000, help="Uniform scene samples per cloud; 0 keeps every point. Camera vertices are always retained.")
    parser.add_argument("--validate", action="store_true", help="Check existing assets against the original XYZ/RGB values")
    args = parser.parse_args()
    if args.max_scene_points < 0:
        parser.error("--max-scene-points must be nonnegative")
    if not args.validate:
        export(args.max_scene_points)
    validate()


if __name__ == "__main__":
    main()
