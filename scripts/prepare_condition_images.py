"""Export lossless, native-resolution conditioning images for on-demand enlargement."""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
from PIL import Image

from prepare_assets import PROJECT, read_json, write_json


def main() -> None:
    manifest = {}
    evidence = []
    for filename in ("results.json", "aggregated.json"):
        data = read_json(PROJECT / "src/data" / filename)
        for case in data["cases"]:
            scene = data["sequences"][case["methods"]["plan4d"]]["sourceCase"]
            metadata = PROJECT.parents[1] / "plan4d_final_outputs-best" / scene / "meta.json"
            source = Path(read_json(metadata)["condition_path"])
            destination = PROJECT / "public/results/aggregated-extra/conditions" / f"{scene}.webp"
            destination.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(source) as original:
                rgb = original.convert("RGB")
                if not destination.exists():
                    rgb.save(destination, "WEBP", lossless=True)
                with Image.open(destination) as exported:
                    np.testing.assert_array_equal(np.asarray(rgb), np.asarray(exported.convert("RGB")))
                manifest[case["image"]] = {
                    "path": destination.relative_to(PROJECT / "public").as_posix(),
                    "width": rgb.width, "height": rgb.height,
                }
            evidence.append({"case": case["id"], "source": str(source), "metadata": str(metadata),
                             "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                             "exportSha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
                             "pixelsIdentical": True, **manifest[case["image"]]})
    write_json(PROJECT / "src/data/conditioning-images.json", manifest)
    write_json(PROJECT / "public/results/aggregated-extra/conditions/provenance.json", evidence)
    print(f"Validated {len(manifest)} image mappings; all exported pixels equal native-resolution source images.")


if __name__ == "__main__":
    main()
