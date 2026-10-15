"""Track generated RGB features and lift valid trajectories into predicted 3D."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from plyfile import PlyData
import torch

from create_teaser import PROJECT


BOARD_PATH = PROJECT / "scripts/future_teaser_storyboard.json"
BOARD = json.loads(BOARD_PATH.read_text())
WORK = PROJECT / BOARD["work"]
GALLERY = json.loads((PROJECT / "src/data/gallery.json").read_text())["cases"]


def digest(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024*1024), b""):
            result.update(block)
    return result.hexdigest()


def load_tensor(path):
    return torch.load(path, map_location="cpu", weights_only=True).detach().float().numpy()


def read_rgb(path, size):
    capture = cv2.VideoCapture(str(path))
    frames = []
    try:
        fps = capture.get(cv2.CAP_PROP_FPS)
        while True:
            success, pixels = capture.read()
            if not success:
                break
            frames.append(cv2.cvtColor(cv2.resize(pixels, size), cv2.COLOR_BGR2RGB))
    finally:
        capture.release()
    assert len(frames) == 81 and abs(fps-15) < 0.01, path
    return np.stack(frames)


def sample_map(point_map, coordinates):
    horizontal = coordinates[:, 0].astype(np.float32).reshape(1, -1)
    vertical = coordinates[:, 1].astype(np.float32).reshape(1, -1)
    return cv2.remap(point_map, horizontal, vertical, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)[0]


def track_features(rgb, points, roi, radius):
    height, width = rgb.shape[1:3]
    grayscale = [cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY) for frame in rgb]
    mask = np.zeros((height, width), dtype=np.uint8)
    left, top, right, bottom = roi
    mask[round(top*height):round(bottom*height), round(left*width):round(right*width)] = 255
    tracks = []
    rejected = {"opticalFlow": 0, "geometryJump": 0, "shortOrStatic": 0}
    for start in [0, 16, 32, 48, 64]:
        seeds = cv2.goodFeaturesToTrack(grayscale[start], maxCorners=140, qualityLevel=0.025, minDistance=12, mask=mask, blockSize=7)
        if seeds is None:
            continue
        seeds = seeds[:, 0]
        seeded_world = sample_map(points[start], seeds)
        active = np.isfinite(seeded_world).all(axis=1)
        histories = [[{"frame": start, "uv": coordinate.tolist(), "xyz": world.tolist(), "fbError": 0.0}] for coordinate, world in zip(seeds, seeded_world)]
        current = seeds.copy()
        for frame in range(start+1, min(81, start+36)):
            indices = np.flatnonzero(active)
            if not len(indices):
                break
            previous = current[indices].reshape(-1, 1, 2)
            following, forward_status, error = cv2.calcOpticalFlowPyrLK(grayscale[frame-1], grayscale[frame], previous, None, winSize=(21,21), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,30,0.01))
            backwards, backward_status, _ = cv2.calcOpticalFlowPyrLK(grayscale[frame], grayscale[frame-1], following, None, winSize=(21,21), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,30,0.01))
            following = following[:, 0]
            fb_error = np.linalg.norm(backwards[:, 0]-previous[:, 0], axis=1)
            inside = (following[:,0]>=2)&(following[:,0]<width-2)&(following[:,1]>=2)&(following[:,1]<height-2)
            valid = forward_status[:,0].astype(bool)&backward_status[:,0].astype(bool)&inside&(fb_error<=0.75)&(error[:,0]<=25)&(np.linalg.norm(following-previous[:,0],axis=1)<=24)
            world = sample_map(points[frame], np.nan_to_num(following))
            old_world = np.array([histories[index][-1]["xyz"] for index in indices])
            geometry_valid = np.isfinite(world).all(axis=1)&(np.linalg.norm(world-old_world,axis=1)<=0.12*radius)
            rejected["opticalFlow"] += int((~valid).sum())
            rejected["geometryJump"] += int((valid&~geometry_valid).sum())
            valid &= geometry_valid
            for local_index, identity in enumerate(indices):
                if not valid[local_index]:
                    active[identity] = False
                    continue
                histories[identity].append({"frame": frame,"uv":following[local_index].tolist(),"xyz":world[local_index].tolist(),"fbError":float(fb_error[local_index])})
                current[identity] = following[local_index]
        candidates = []
        for history in histories:
            pixels = np.array([sample["uv"] for sample in history])
            movement = float(np.linalg.norm(pixels-pixels[0],axis=1).max())
            if len(history)<9 or movement<2.0:
                rejected["shortOrStatic"] += 1
                continue
            candidates.append({"samples":history,"displacementPixels":movement})
        candidates.sort(key=lambda track: track["displacementPixels"]*len(track["samples"]),reverse=True)
        tracks.extend(candidates[:55])
    for identity, track in enumerate(tracks):
        track["id"] = identity
    assert len(tracks)>=12, f"Insufficient valid tracks: {len(tracks)}"
    return tracks, rejected


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    destination = WORK / "tracking"
    configuration_hash = hashlib.sha256(json.dumps(BOARD,sort_keys=True).encode()).hexdigest()
    if destination.exists():
        records = list(destination.glob("*.json"))
        if any(json.loads(path.read_text()).get("configurationSha256") != configuration_hash for path in records):
            archive = WORK / ("tracking-preserved-"+datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
            destination.rename(archive)
            print(f"Previous tracking assets preserved: {archive}",flush=True)
    destination.mkdir(exist_ok=True)
    for shot in BOARD["shots"]:
        target = destination / f"{shot['name']}.json"
        if target.exists():
            cached = json.loads(target.read_text())
            assert all(digest(path)==expected for path,expected in cached["sourceHashes"].items())
            print(f"Reusing verified tracks: {shot['name']}",flush=True)
            continue
        case = GALLERY[shot["scene"]]
        root = Path(case["videos"]["rgb"]["source"]).parent
        source_paths = [root/name for name in ["meta.json","condition_image.png","point_map_world.pt","generated_video_geometry.mp4","pred_camera_extrinsics_raw.pt","pred_camera_intrinsics_raw.pt"]]
        metadata = json.loads(source_paths[0].read_text())
        assert metadata["num_condition_frames"]==1 and metadata["task_type"]=="ti2v",case["id"]
        points = load_tensor(root/"point_map_world.pt").reshape(81,280,504,3)
        rgb = read_rgb(root/"generated_video_geometry.mp4",(504,280))
        extrinsics = load_tensor(root/"pred_camera_extrinsics_raw.pt").reshape(81,3,4)
        intrinsics = load_tensor(root/"pred_camera_intrinsics_raw.pt").reshape(81,3,3)
        checks = []
        for frame in [0,30,80]:
            ply_path = root/"point_cloud"/f"frame_{frame:04d}.ply"
            vertices = PlyData.read(ply_path)["vertex"].data
            positions = np.column_stack([vertices[axis] for axis in ["x","y","z"]])
            np.testing.assert_allclose(positions,points[frame].reshape(-1,3),rtol=1e-5,atol=1e-6)
            source_paths.append(ply_path)
            checks.append({"frame":frame,"pointCount":len(vertices),"pointMapMatchesPly":True})
        tracks,rejected = track_features(rgb,points,shot["roi"],case["sequence"]["radius"])
        counts = [sum(any(sample["frame"]==frame for sample in track["samples"]) for track in tracks) for frame in range(81)]
        maximum_fb = max(sample["fbError"] for track in tracks for sample in track["samples"])
        for track in tracks:
            samples = track["samples"]
            assert all(samples[index+1]["frame"]==sample["frame"]+1 for index,sample in enumerate(samples[:-1]))
            for sample in samples:
                expected = sample_map(points[sample["frame"]],np.array([sample["uv"]],dtype=np.float32))[0]
                np.testing.assert_allclose(expected,sample["xyz"],atol=1e-7)
        report = {
            "sceneId":case["id"],"shot":shot,"inputFrames":1,"sourcePrompt":metadata["prompt"],
            "method":"OpenCV pyramidal Lucas-Kanade on generated RGB, forward/backward filtering, lifted through the predicted world point map; visualization postprocessing, not a native tracking head",
            "roi":shot["roi"],"coordinateSpace":"world","trailFrames":18,"maximumForwardBackwardErrorPixels":maximum_fb,
            "tracks":tracks,"activeTracksPerFrame":counts,"rejected":rejected,"pointMapChecks":checks,
            "intrinsics":intrinsics.tolist(),"extrinsics":extrinsics.tolist(),"normalization":case["sequence"],
            "configurationSha256":configuration_hash,"configuration":BOARD,
            "sourceHashes":{str(path):digest(path) for path in source_paths},
        }
        with target.open("x") as stream:
            json.dump(report,stream,indent=2)
            stream.write("\n")
        preview = Image.fromarray(rgb[50]).resize((1008,560))
        draw = ImageDraw.Draw(preview)
        for track in tracks:
            samples = [sample for sample in track["samples"] if 33<=sample["frame"]<=50]
            if len(samples)<2 or samples[-1]["frame"]!=50:
                continue
            coordinates = [(sample["uv"][0]*2,sample["uv"][1]*2) for sample in samples]
            color = ["#0072b2","#d55e00","#009e73","#cc79a7","#e69f00"][track["id"]%5]
            draw.line(coordinates,fill=color,width=3)
            horizontal,vertical=coordinates[-1]
            draw.ellipse((horizontal-4,vertical-4,horizontal+4,vertical+4),fill=color)
        preview.save(destination/f"{shot['name']}-tracks.jpg",quality=95)
        print(json.dumps({"scene":shot["name"],"tracks":len(tracks),"activeAt30":counts[30],"activeAt80":counts[80],"maxFbError":maximum_fb}),flush=True)


if __name__=="__main__":
    main()
