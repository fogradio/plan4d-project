"""Build a visual inventory from the existing, unmodified Gallery videos."""

from pathlib import Path
import json

import cv2
from PIL import Image, ImageDraw, ImageFont, ImageOps


PROJECT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT / "artifacts/teaser-20261015"
FONT = "/usr/share/fonts/urw-base35/NimbusSans-Regular.otf"


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    scenes = json.loads((PROJECT / "src/data/gallery.json").read_text())["cases"]
    font = ImageFont.truetype(FONT, 22)
    small = ImageFont.truetype(FONT, 16)
    for group in range(3):
        selected = scenes[group * 6:(group + 1) * 6]
        sheet = Image.new("RGB", (1440, 236 * len(selected) + 48), "#f3f4f6")
        draw = ImageDraw.Draw(sheet)
        for column, label in enumerate(["Observed image", "Generated RGB / middle", "Generated depth", "Scene flow / notch14"]):
            draw.text((column * 360 + 12, 14), label, fill="#20252b", font=font)
        for row, scene in enumerate(selected):
            top = 48 + row * 236
            for column, kind in enumerate([None, "rgb", "depth", "flow"]):
                if kind is None:
                    frame = Image.open(PROJECT / "public" / scene["image"]).convert("RGB")
                else:
                    capture = cv2.VideoCapture(str(PROJECT / "public" / scene["videos"][kind]["mp4"]))
                    capture.set(cv2.CAP_PROP_POS_FRAMES, 40)
                    success, pixels = capture.read()
                    capture.release()
                    if not success:
                        raise RuntimeError(scene["id"])
                    frame = Image.fromarray(cv2.cvtColor(pixels, cv2.COLOR_BGR2RGB))
                frame = ImageOps.contain(frame, (348, 196))
                sheet.paste(frame, (column * 360 + 6 + (348 - frame.width) // 2, top + (196 - frame.height) // 2))
            draw.text((12, top + 203), scene["label"], fill="#20252b", font=small)
        destination = OUTPUT / f"contact-sheet-{group + 1}.jpg"
        sheet.save(destination, quality=92)
        print(destination)


if __name__ == "__main__":
    main()
