"""Validate exported PLY frames and their correspondence to the original results."""

import gzip
import hashlib
import io
import json
from pathlib import Path

import numpy as np
from plyfile import PlyData

from prepare_assets import FRAME_PATTERN, camera_transform, canonical_id, vist3a_provenance


def main():
    project = Path(__file__).resolve().parents[1]
    manifest = json.loads((project / "src/data/results.json").read_text())
    provenance = json.loads((project / "public/results/provenance.json").read_text())
    sources = {item["sequence"]: Path(item["directory"]) for item in provenance["sources"]}
    source_records = {item["sequence"]: item for item in provenance["sources"]}
    expected = {"P02_122_161", "P02_129_354", "P02_135_92", "P06_102_75", "P07_116_25", "P25_104_94"}
    assert {scene["id"] for scene in manifest["cases"]} == expected
    assert len(manifest["sequences"]) == 24
    total_frames = 0
    for scene in manifest["cases"]:
        assert set(scene["methods"]) == {"gen3r", "tesseract", "vist3a", "plan4d"}
        for key in ("image", "video", "depthVideo"):
            assert (project / "public" / scene[key]).is_file()
        for method, sequence_id in scene["methods"].items():
            source = sources[sequence_id]
            assert canonical_id(source) == scene["id"]
            assert source.parent.name == ("plan4d_final_outputs-best" if method == "plan4d" else method)
            if method != "plan4d":
                assert source.parent.parent.name == "plan4d_final_outputs-baselines"
            sequence = manifest["sequences"][sequence_id]
            assert np.array_equal(np.asarray(sequence["worldToCamera"]), camera_transform(source).flatten()), sequence_id
            if method == "vist3a":
                original = vist3a_provenance(source)
                assert all(source_records[sequence_id].get(key) == value for key, value in original.items()), sequence_id
                assert sequence["sha256"] != manifest["sequences"][scene["methods"]["plan4d"]]["sha256"], scene["id"]
            folder = project / "public" / sequence["path"]
            assert len(list(folder.glob("*.ply.gz"))) == 81
            originals = {int(match.group(1)): path for path in (source / "point_cloud").glob("*.ply") if (match := FRAME_PATTERN.fullmatch(path.name))}
            digest = hashlib.sha256()
            for frame in range(81):
                path = folder / f"{frame:04d}.ply.gz"
                digest.update(path.read_bytes())
                decoded = gzip.decompress(path.read_bytes())
                stream = io.BytesIO(decoded)
                header = PlyData._parse_header(stream)
                assert not header.text and len(header.elements) == 1
                vertices = np.frombuffer(decoded, dtype=header["vertex"].dtype(header.byte_order), count=header["vertex"].count, offset=stream.tell())
                assert len(vertices) > 0
                assert not manifest["maxPoints"] or len(vertices) <= manifest["maxPoints"]
                positions = np.column_stack([vertices[axis] for axis in ("x", "y", "z")])
                assert np.isfinite(positions).all()
                if method == "vist3a" or frame in (0, 80):
                    original = PlyData.read(originals[frame])["vertex"].data
                    finite = np.isfinite(np.column_stack([original[axis] for axis in ("x", "y", "z")])).all(axis=1)
                    original = original[finite]
                    if manifest["maxPoints"] and len(original) > manifest["maxPoints"]:
                        original = original[np.linspace(0, len(original) - 1, manifest["maxPoints"], dtype=np.int64)]
                    for name in vertices.dtype.names:
                        assert np.array_equal(vertices[name], original[name].astype(vertices[name].dtype)), (sequence_id, frame, name)
                total_frames += 1
            assert digest.hexdigest() == sequence["sha256"], sequence_id
    report = {"scenes": 6, "sequences": 24, "verified_frames": total_frames, "source_endpoint_checks": 48,
              "vist3a_source_frame_checks": 486, "vist3a_camera_source": "decode_outputs.pt:extrinsic_w2c",
              "vist3a_distinct_from_plan4d": True, "status": "passed"}
    output = project / "artifacts" / "assets-validation.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
