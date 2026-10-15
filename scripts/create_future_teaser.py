"""Compose the single-image and text future-4D project-page teaser."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageOps

from create_teaser import Assets, BACKGROUND, FFMPEG, PROJECT, font
from prepare_future_teaser_assets import BOARD, BOARD_PATH, GALLERY, WORK, digest
from validate_teaser import mp4_atoms


OUTPUT = PROJECT / BOARD["output"]
SIZE = (BOARD["width"], BOARD["height"])
FPS = BOARD["sourceFps"]
OUT_FPS = BOARD["outputFps"]
SCHEDULE = [
    {"stage":stage["name"],"sourceFrame":stage["sourceStart"]+round((stage["sourceEnd"]-stage["sourceStart"])*index/max(1,stage["frames"]-1)),"phase":index/max(1,stage["frames"]-1)}
    for stage in BOARD["stages"] for index in range(stage["frames"])
]
SHOT_FRAMES = len(SCHEDULE)
MASTER = "plan4d-future-teaser-1080p.mp4"
MP4 = "plan4d-future-teaser.mp4"
WEBM = "plan4d-future-teaser.webm"
POSTER = "plan4d-future-teaser-poster.webp"
INK = "#172722"
GREEN = "#11785b"
BLUE = "#2768a4"
AMBER = "#9b5917"
MUTED = "#5b6a63"
STAGE = (48,336,1824,648)
INPUT_REGION = (48,137,240,134)


def text(canvas,position,content,size=30,color=INK,bold=False,width=None):
    draw = ImageDraw.Draw(canvas)
    if width and draw.textlength(content,font=font(size,bold))>width:
        raise ValueError(f"Text overflows {width}: {content}")
    draw.text(position,content,font=font(size,bold),fill=color,anchor="lt")


def wrap(canvas,position,content,width,size=39,color=INK,bold=True):
    left,top = position
    lines = []
    current = ""
    draw = ImageDraw.Draw(canvas)
    for word in content.split():
        candidate = (current+" "+word).strip()
        if current and draw.textlength(candidate,font=font(size,bold))>width:
            lines.append(current)
            current=word
        else:
            current=candidate
    lines.append(current)
    assert len(lines)<=2,(content,lines)
    for index,line in enumerate(lines):
        text(canvas,(left,top+index*(size+12)),line,size,color,bold,width)


def paste(canvas,source,rectangle):
    left,top,width,height = rectangle
    fitted = ImageOps.contain(source,(width,height),Image.Resampling.LANCZOS)
    canvas.paste(fitted,(left+(width-fitted.width)//2,top+(height-fitted.height)//2))


class TeaserAssets(Assets):
    def rendered(self,name,frame,preview=False):
        if preview:
            return Image.open(WORK/"renders"/f"{name}-{frame}.jpg").convert("RGB")
        path = WORK/"renders"/f"{name}.mp4"
        if path not in self.frames:
            capture = cv2.VideoCapture(str(path))
            frames=[]
            try:
                fps=capture.get(cv2.CAP_PROP_FPS)
                while True:
                    success,pixels=capture.read()
                    if not success:
                        break
                    frames.append(Image.fromarray(cv2.cvtColor(pixels,cv2.COLOR_BGR2RGB)))
            finally:
                capture.release()
            assert len(frames)==SHOT_FRAMES and abs(fps-FPS)<0.01,(path,len(frames),fps)
            self.frames[path]=frames
            self.sources[str(path)]=digest(path)
        return self.frames[path][frame]

    def geometry_rgb(self,scene_index,frame):
        root=Path(GALLERY[scene_index]["videos"]["rgb"]["source"]).parent
        return self.video(root/"generated_video_geometry.mp4",frame)


def stage_image(shot,frame,assets,preview=False):
    state=SCHEDULE[frame]
    stage=state["stage"]
    source=state["sourceFrame"]
    canvas=Image.new("RGB",(STAGE[2],STAGE[3]),BACKGROUND)
    region=(0,0,STAGE[2],STAGE[3])
    if stage=="input":
        paste(canvas,assets.still(shot["scene"]),region)
    elif stage=="rgb":
        paste(canvas,assets.geometry_rgb(shot["scene"],source),region)
    elif stage in ("depth-wipe","depth"):
        paste(canvas,assets.clip(shot["scene"],"depth",source),region)
        if stage=="depth-wipe":
            rgb=Image.new("RGB",canvas.size,BACKGROUND)
            paste(rgb,assets.geometry_rgb(shot["scene"],source),region)
            boundary=round(canvas.width*state["phase"])
            rgb.paste(canvas.crop((0,0,boundary,canvas.height)),(0,0))
            ImageDraw.Draw(rgb).line((boundary,0,boundary,canvas.height),fill=GREEN,width=3)
            canvas=rgb
    else:
        paste(canvas,assets.rendered(shot["name"],frame,preview),region)
        if stage=="geometry":
            depth=Image.new("RGB",canvas.size,BACKGROUND)
            paste(depth,assets.clip(shot["scene"],"depth",source),region)
            phase=state["phase"]
            canvas=Image.blend(depth,canvas,phase*phase*(3-2*phase))
    return canvas


def compose(shot_index,frame,assets,preview=False):
    shot=BOARD["shots"][shot_index]
    state=SCHEDULE[frame]
    stage=state["stage"]
    source=state["sourceFrame"]
    canvas=Image.new("RGB",SIZE,BACKGROUND)
    draw=ImageDraw.Draw(canvas)
    text(canvas,(48,26),"Plan",58,INK,True)
    text(canvas,(170,26),"4D",58,GREEN,True)
    text(canvas,(385,38),"One image. One action. A 4D future.",43,INK,True,1487)
    text(canvas,(48,104),"INPUT / 1 FRAME",24,BLUE,True,260)
    paste(canvas,assets.still(shot["scene"]),INPUT_REGION)
    text(canvas,(311,181),"+",42,MUTED)
    text(canvas,(371,116),"TEXT ACTION",24,AMBER,True)
    wrap(canvas,(371,160),shot["action"],1040)
    draw.line((1450,198,1520,198),fill=GREEN,width=5)
    draw.polygon([(1520,198),(1504,188),(1504,208)],fill=GREEN)
    text(canvas,(1562,150),"GENERATED FUTURE",25,GREEN,True,310)
    text(canvas,(1562,191),"RGB + 4D geometry",25,MUTED,False,310)
    text(canvas,(1562,228),"+ motion",25,MUTED,False,310)
    draw.line((48,288,1872,288),fill="#d4ded8",width=2)
    labels={"input":"Only one observed frame","rgb":"Future RGB video","depth-wipe":"Future RGB to depth","depth":"Predicted future depth","geometry":"Future depth to 3D","orbit":"Explore the future in 3D","tracks":"Future 4D + tracked motion","final":"A future you can explore"}
    text(canvas,(48,302),labels[stage],28,BLUE if stage=="input" else GREEN,True,1150)
    held=stage in ("depth-wipe","depth","geometry","orbit","final")
    time_label=("TIME HELD  /  " if held else "")+f"t = +{source/FPS:0.2f} s"
    label_width=draw.textlength(time_label,font=font(26,True))
    text(canvas,(1872-label_width,303),time_label,26,AMBER if held else GREEN,True)
    canvas.paste(stage_image(shot,frame,assets,preview),(STAGE[0],STAGE[1]))
    text(canvas,(48,998),f"{shot_index+1:02d} / {len(BOARD['shots']):02d}",23,MUTED)
    if stage in ("tracks","final"):
        text(canvas,(180,998),"Tracks from generated RGB + predicted geometry",24,MUTED,False,1200)
    elif stage=="input":
        text(canvas,(180,998),"One image + text. All future frames are generated.",24,BLUE,False,1200)
    elif held:
        text(canvas,(180,998),"Same future moment. A different representation.",24,MUTED,False,1200)
    else:
        text(canvas,(180,998),"Generated appearance, geometry and motion",24,MUTED,False,1200)
    start,end,baseline=150,1856,1050
    draw.line((start,baseline,end,baseline),fill="#d4ded8",width=5)
    position=round(start+(end-start)*source/80)
    if position>start:
        draw.line((start,baseline,position,baseline),fill=GREEN,width=5)
    draw.ellipse((start-6,baseline-6,start+6,baseline+6),fill=BLUE)
    draw.ellipse((position-8,baseline-8,position+8,baseline+8),fill=AMBER if held else GREEN)
    text(canvas,(48,1040),"NOW",22,BLUE,True)
    text(canvas,(1520,998),"GENERATED FUTURE",23,GREEN,True,352)
    return canvas


def preview_frames():
    destination=WORK/("storyboard-"+datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    destination.mkdir(parents=True)
    assets=TeaserAssets()
    indices=[0,32,60,72,84,108,135,179]
    sheet=Image.new("RGB",(1920,1080),BACKGROUND)
    for shot_index,shot in enumerate(BOARD["shots"]):
        for column,frame in enumerate(indices):
            canvas=compose(shot_index,frame,assets,preview=True)
            canvas.save(destination/f"{shot['name']}-{frame}.jpg",quality=95)
            sheet.paste(canvas.resize((480,270),Image.Resampling.LANCZOS),((column%4)*480,(shot_index%2)*540+(column//4)*270))
        if shot_index%2==1:
            sheet.save(destination/f"contact-sheet-{shot_index//2+1}.jpg",quality=95)
        assets.clear()
    print(destination,flush=True)


def encode():
    OUTPUT.mkdir(parents=True,exist_ok=True)
    for filename in [MASTER,MP4,WEBM,POSTER,"provenance.json"]:
        if (OUTPUT/filename).exists():
            raise FileExistsError(f"Preserving existing media: {OUTPUT/filename}")
    assets=TeaserAssets()
    encoder=subprocess.Popen([FFMPEG,"-n","-hide_banner","-loglevel","warning","-f","rawvideo","-pix_fmt","rgb24","-s","1920x1080","-r",str(FPS),"-i","pipe:0","-an","-vf",f"fps={OUT_FPS}","-c:v","libx264","-crf","18","-preset","medium","-threads","4","-pix_fmt","yuv420p","-movflags","+faststart","-metadata","title="+BOARD["title"],str(OUTPUT/MASTER)],stdin=subprocess.PIPE)
    try:
        for shot_index,shot in enumerate(BOARD["shots"]):
            print(f"Compose {shot_index+1}/{len(BOARD['shots'])}: {shot['name']}",flush=True)
            for frame in range(SHOT_FRAMES):
                canvas=compose(shot_index,frame,assets)
                encoder.stdin.write(canvas.tobytes())
                if shot_index==0 and frame==135:
                    canvas.save(OUTPUT/POSTER,"WEBP",quality=95)
            assets.clear()
        encoder.stdin.close()
        if encoder.wait()!=0:
            raise RuntimeError("Teaser encoding failed")
    finally:
        if encoder.poll() is None:
            encoder.terminate()
            encoder.wait()
    for filename,codec in [(MP4,"libx264"),(WEBM,"libvpx-vp9")]:
        print(f"Transcode {filename}",flush=True)
        options=["-crf","22","-preset","medium","-movflags","+faststart"] if codec=="libx264" else ["-crf","30","-b:v","0","-row-mt","1","-deadline","good","-cpu-used","4"]
        subprocess.run([FFMPEG,"-n","-hide_banner","-loglevel","warning","-i",str(OUTPUT/MASTER),"-an","-vf","scale=1280:720:flags=lanczos","-c:v",codec,*options,"-threads","4","-pix_fmt","yuv420p",str(OUTPUT/filename)],check=True)
    sources=dict(assets.sources)
    sources[str(BOARD_PATH)]=digest(BOARD_PATH)
    scenes=[]
    for shot in BOARD["shots"]:
        tracking_path=WORK/"tracking"/f"{shot['name']}.json"
        render_path=WORK/"renders"/f"{shot['name']}.json"
        tracking=json.loads(tracking_path.read_text())
        rendered=json.loads(render_path.read_text())
        for report,path in [(tracking,tracking_path),(rendered,render_path)]:
            sources.update(report["sourceHashes"])
            sources[str(path)]=digest(path)
        scenes.append({**shot,"id":tracking["sceneId"],"inputFrames":tracking["inputFrames"],"sourcePrompt":tracking["sourcePrompt"],"trackingMethod":tracking["method"],"trackCount":len(tracking["tracks"])})
    provenance={"created":datetime.now(timezone.utc).isoformat(),"title":BOARD["title"],"durationSeconds":len(scenes)*SHOT_FRAMES/FPS,"sourceFps":FPS,"outputFps":OUT_FPS,"audio":False,"scenes":scenes,"schedule":SCHEDULE,"sourceHashes":sources,"notes":["Top strip contains exactly one observed frame and a summary of the original action prompt.","All future modalities are existing generated predictions; no observed future video is supplied to Plan4D.","RGB and depth use the same held source frame during the wipe. Color dissolve then reveals that frame's unmodified 3D points.","All 81 source time steps appear in order; editorial holds are labeled TIME HELD. No motion interpolation.","Tracking is OpenCV LK postprocessing on generated RGB, lifted through predicted geometry; not a native model tracking head.","Tracks are filtered by forward/backward error, contiguous visibility, pixel movement and 3D jumps; trails are not amplified.","Camera motion changes only the display viewpoint. Point geometry remains unchanged.","Source RGB has lower native resolution than the 1080p composition. No narration or music."]}
    with (OUTPUT/"provenance.json").open("x") as stream:
        json.dump(provenance,stream,indent=2)
        stream.write("\n")


def verify():
    provenance=json.loads((OUTPUT/"provenance.json").read_text())
    report={"videos":[],"sourceCount":0,"tracking":[],"inputFreeze":[]}
    for source,expected in provenance["sourceHashes"].items():
        assert digest(source)==expected,source
        report["sourceCount"]+=1
    source_frames=[state["sourceFrame"] for state in SCHEDULE]
    assert sorted(set(source_frames))==list(range(81))
    assert all(following>=previous for previous,following in zip(source_frames,source_frames[1:]))
    assets=TeaserAssets()
    for index,shot in enumerate(BOARD["shots"]):
        tracking=json.loads((WORK/"tracking"/f"{shot['name']}.json").read_text())
        rendered=json.loads((WORK/"renders"/f"{shot['name']}.json").read_text())
        assert digest(WORK/"renders"/f"{shot['name']}.mp4")==rendered["outputSha256"]
        assert len(rendered["samples"])==SHOT_FRAMES
        assert all(sample["frame"]==state["sourceFrame"] for sample,state in zip(rendered["samples"],SCHEDULE))
        assert all(sample["trackPixels"]>100 for sample in rendered["samples"] if sample["trackPixels"] is not None)
        assert tracking["inputFrames"]==1
        assert tracking["maximumForwardBackwardErrorPixels"]<=0.75
        for track in tracking["tracks"]:
            samples=track["samples"]
            assert len(samples)>=9 and track["displacementPixels"]>=2
            assert all(following["frame"]==previous["frame"]+1 for previous,following in zip(samples,samples[1:]))
            assert all(np.isfinite(sample["xyz"]).all() for sample in samples)
        report["tracking"].append({"scene":shot["name"],"tracks":len(tracking["tracks"]),"maxForwardBackwardError":tracking["maximumForwardBackwardErrorPixels"],"pointMapChecks":tracking["pointMapChecks"]})
        first=np.asarray(compose(index,0,assets))[:288]
        last=np.asarray(compose(index,179,assets))[:288]
        assert np.array_equal(first,last),shot["name"]
        report["inputFreeze"].append({"scene":shot["name"],"topInputStripPixelIdentical":True})
        assets.clear()
    expected_count=SHOT_FRAMES*len(BOARD["shots"])*OUT_FPS//FPS
    for filename,size in [(MASTER,SIZE),(MP4,(1280,720)),(WEBM,(1280,720))]:
        capture=cv2.VideoCapture(str(OUTPUT/filename))
        selected={}
        count=0
        minimum_fraction=1.0
        try:
            dimensions=(int(capture.get(3)),int(capture.get(4)))
            fps=capture.get(cv2.CAP_PROP_FPS)
            assert dimensions==size and abs(fps-OUT_FPS)<0.01,(filename,dimensions,fps)
            while True:
                success,pixels=capture.read()
                if not success:
                    break
                reduced=cv2.resize(pixels,(192,108))
                minimum_fraction=min(minimum_fraction,float((np.ptp(reduced.astype(np.int16),axis=2)>24).mean()))
                if count%(SHOT_FRAMES*2) in [40,90,128,168,224,308,356]:
                    selected[count]=reduced.astype(np.float32)
                count+=1
        finally:
            capture.release()
        assert count==expected_count,(filename,count,expected_count)
        assert minimum_fraction>0.025,(filename,minimum_fraction)
        motion=[]
        for scene_index in range(len(BOARD["shots"])):
            offset=scene_index*SHOT_FRAMES*2
            differences=[float(np.abs(selected[offset+later][34:98]-selected[offset+earlier][34:98]).mean()) for earlier,later in [(40,90),(128,168),(224,308),(308,356)]]
            assert min(differences)>0.3,(filename,scene_index,differences)
            motion.append(differences)
        faststart=None
        if filename.endswith(".mp4"):
            atoms=mp4_atoms(OUTPUT/filename)
            faststart=atoms.index("moov")<atoms.index("mdat")
            assert faststart
        report["videos"].append({"file":filename,"frames":count,"width":size[0],"height":size[1],"fps":fps,"durationSeconds":count/OUT_FPS,"bytes":(OUTPUT/filename).stat().st_size,"sha256":digest(OUTPUT/filename),"minimumColorFraction":minimum_fraction,"motionByScene":motion,"faststart":faststart})
        print(f"Validated {filename}: {count} frames",flush=True)
    (WORK/"validation.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps({"videos":len(report["videos"]),"sources":report["sourceCount"],"tracks":sum(item["tracks"] for item in report["tracking"])}),flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    modes=parser.add_mutually_exclusive_group()
    modes.add_argument("--preview",action="store_true",help="Create a fresh still storyboard from render previews")
    modes.add_argument("--verify-only",action="store_true",help="Verify existing videos, inputs, sources and tracks")
    args=parser.parse_args()
    if args.preview:
        preview_frames()
        return
    if not args.verify_only:
        encode()
    verify()


if __name__=="__main__":
    main()
