import { createServer } from "node:http";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const board = JSON.parse(
  await readFile(
    resolve(project, "scripts/future_teaser_storyboard.json"),
    "utf8",
  ),
);
const gallery = JSON.parse(
  await readFile(resolve(project, "src/data/gallery.json"), "utf8"),
);
const work = resolve(project, board.work);
const output = resolve(work, "renders");
const preview = process.argv.includes("--preview");
const ffmpeg =
  process.env.PLAN4D_FFMPEG ||
  "/mnt/workspace/hwzhang/miniconda3/envs/dav3/lib/python3.10/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2";
await mkdir(output, { recursive: true });
const schedule = board.stages.flatMap((stage) =>
  Array.from({ length: stage.frames }, (_, index) => ({
    stage: stage.name,
    frame:
      stage.sourceStart +
      Math.round(
        ((stage.sourceEnd - stage.sourceStart) * index) /
          Math.max(1, stage.frames - 1),
      ),
    phase: index / Math.max(1, stage.frames - 1),
  })),
);
let active;
let sourceHashes;
const html = `<!doctype html><html><head><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script></head><body style="margin:0"><script type="module">
import * as THREE from 'three';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
const width=${board.renderWidth}, height=${board.renderHeight};
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(width,height);
renderer.setClearColor(0xf4f6f5);
renderer.outputColorSpace=THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(40,width/height,0.01,100);
const material=new THREE.PointsMaterial({vertexColors:true,size:1.8,sizeAttenuation:false});
const points=new THREE.Points(new THREE.BufferGeometry(),material);
points.frustumCulled=false;
scene.add(points);
const lineMaterial=new LineMaterial({vertexColors:true,linewidth:3.4,depthTest:true,transparent:true});
lineMaterial.resolution.set(width,height);
const lines=new LineSegments2(new LineSegmentsGeometry(),lineMaterial);
lines.frustumCulled=false;
scene.add(lines);
const markers=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({vertexColors:true,size:6,sizeAttenuation:false,depthTest:true}));
markers.frustumCulled=false;
scene.add(markers);
const loader=new PLYLoader();
const palette=[0x0072b2,0xd55e00,0x009e73,0xcc397b,0xd49b00,0x39a9c4];
let metadata,transform,cached=-1,startPosition,startRotation,startFov,startAspectCorrection;
window.configure=(data)=>{
  metadata=data;
  cached=-1;
  const normalization=data.normalization;
  transform=new THREE.Matrix4().makeScale(1/normalization.radius,1/normalization.radius,1/normalization.radius);
  transform.multiply(new THREE.Matrix4().makeTranslation(...normalization.center.map(value=>-value)));
  transform.multiply(new THREE.Matrix4().makeRotationX(Math.PI));
  transform.multiply(new THREE.Matrix4().fromArray(normalization.worldToCamera).transpose());
  const frontal=new THREE.PerspectiveCamera();
  frontal.position.set(0,0.08,2.7);
  frontal.lookAt(0,0,0);
  startPosition=frontal.position.clone();
  startRotation=frontal.quaternion.clone();
  startFov=36;
  startAspectCorrection=1;
};
function trackGeometry(frame,opacity){
  const positions=[],colors=[],heads=[],headColors=[];
  let trackCount=0;
  for(const track of metadata.tracks){
    const current=track.samples.find(sample=>sample.frame===frame);
    if(!current) continue;
    const samples=track.samples.filter(sample=>sample.frame<=frame && sample.frame>frame-metadata.trailFrames);
    if(samples.length<2) continue;
    trackCount++;
    const base=new THREE.Color(palette[track.id%palette.length]);
    const vertices=samples.map(sample=>new THREE.Vector3(...sample.xyz).applyMatrix4(transform));
    for(let index=1;index<vertices.length;index++){
      positions.push(...vertices[index-1].toArray(),...vertices[index].toArray());
      const shade=base.clone().lerp(new THREE.Color(0xffffff),0.55*(1-index/vertices.length));
      colors.push(...shade.toArray(),...shade.toArray());
    }
    heads.push(...vertices.at(-1).toArray());
    headColors.push(...base.toArray());
  }
  lines.geometry.dispose();
  lines.geometry=new LineSegmentsGeometry();
  if(positions.length){ lines.geometry.setPositions(positions); lines.geometry.setColors(colors); }
  lines.visible=positions.length>0 && opacity>0;
  lineMaterial.opacity=opacity;
  markers.geometry.dispose();
  markers.geometry=new THREE.BufferGeometry();
  markers.geometry.setAttribute('position',new THREE.Float32BufferAttribute(heads,3));
  markers.geometry.setAttribute('color',new THREE.Float32BufferAttribute(headColors,3));
  markers.visible=lines.visible;
  return trackCount;
}
window.renderFrame=async(state)=>{
  if(cached!==state.frame){
    const response=await fetch('/cloud/'+state.frame);
    if(!response.ok) throw new Error('Missing PLY');
    const geometry=loader.parse(await response.arrayBuffer());
    geometry.applyMatrix4(transform);
    points.geometry.dispose();
    points.geometry=geometry;
    cached=state.frame;
  }
  const orbit=state.stage==='orbit'?state.phase:(['tracks','final'].includes(state.stage)?1:0);
  const eased=orbit*orbit*(3-2*orbit);
  const angle=0.38+(state.stage==='tracks'?state.phase*0.12:state.stage==='final'?0.12+state.phase*0.16:0);
  const target=new THREE.PerspectiveCamera();
  target.position.set(Math.sin(angle)*2.7,0.16,Math.cos(angle)*2.7);
  target.lookAt(0,0,0);
  camera.position.copy(startPosition).lerp(target.position,eased);
  camera.quaternion.copy(startRotation).slerp(target.quaternion,eased);
  camera.fov=THREE.MathUtils.lerp(startFov,36,eased);
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[0]*=THREE.MathUtils.lerp(startAspectCorrection,1,eased);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  const trackOpacity=state.stage==='orbit'?Math.max(0,(state.phase-0.5)*2):(['tracks','final'].includes(state.stage)?1:0);
  const trackCount=trackGeometry(state.frame,trackOpacity);
  renderer.render(scene,camera);
  const pixels=new Uint8Array(width*height*4);
  const context=renderer.getContext();
  context.readPixels(0,0,width,height,context.RGBA,context.UNSIGNED_BYTE,pixels);
  let occupied=0;
  for(let offset=0;offset<pixels.length;offset+=4){if(Math.abs(pixels[offset]-244)+Math.abs(pixels[offset+1]-246)+Math.abs(pixels[offset+2]-245)>70)occupied++;}
  let trackPixels=null;
  if(state.checkTracks && lines.visible){
    lines.visible=false;
    markers.visible=false;
    renderer.render(scene,camera);
    const withoutTracks=new Uint8Array(pixels.length);
    context.readPixels(0,0,width,height,context.RGBA,context.UNSIGNED_BYTE,withoutTracks);
    trackPixels=0;
    for(let offset=0;offset<pixels.length;offset+=4){
      if(Math.abs(pixels[offset]-withoutTracks[offset])+Math.abs(pixels[offset+1]-withoutTracks[offset+1])+Math.abs(pixels[offset+2]-withoutTracks[offset+2])>30)trackPixels++;
    }
    lines.visible=true;
    markers.visible=true;
    renderer.render(scene,camera);
  }
  return {image:renderer.domElement.toDataURL('image/jpeg',0.97).split(',')[1],points:points.geometry.getAttribute('position').count,occupied:occupied/(width*height),tracks:trackCount,trackPixels};
};
</script></body></html>`;
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end(html);
    } else if (pathname.startsWith("/three/")) {
      const filename = resolve(
        project,
        "node_modules/three",
        pathname.slice(7),
      );
      if (!filename.startsWith(resolve(project, "node_modules/three") + "/"))
        throw new Error("Invalid path");
      response.setHeader("Content-Type", "text/javascript");
      response.end(await readFile(filename));
    } else if (/^\/cloud\/\d+$/.test(pathname) && active) {
      const frame = Number(pathname.split("/").at(-1));
      if (frame > 80) throw new Error("Invalid frame");
      const filename = resolve(
        dirname(gallery.cases[active.scene].videos.rgb.source),
        "point_cloud",
        `frame_${String(frame).padStart(4, "0")}.ply`,
      );
      const data = await readFile(filename);
      sourceHashes[filename] = createHash("sha256").update(data).digest("hex");
      response.setHeader("Content-Type", "application/octet-stream");
      response.end(data);
    } else response.writeHead(404).end();
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-dev-shm-usage",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: board.renderWidth, height: board.renderHeight },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => typeof window.renderFrame === "function");
  for (const shot of board.shots) {
    active = shot;
    sourceHashes = {};
    const trackingPath = resolve(work, "tracking", `${shot.name}.json`);
    const trackingBytes = await readFile(trackingPath);
    const tracking = JSON.parse(trackingBytes);
    sourceHashes[trackingPath] = createHash("sha256")
      .update(trackingBytes)
      .digest("hex");
    const destination = resolve(output, `${shot.name}.mp4`);
    const reportPath = resolve(output, `${shot.name}.json`);
    if (
      !preview &&
      (await access(destination).then(
        () => true,
        () => false,
      ))
    ) {
      const report = JSON.parse(await readFile(reportPath, "utf8"));
      if (
        createHash("sha256")
          .update(await readFile(destination))
          .digest("hex") !== report.outputSha256
      )
        throw new Error("Invalid cached render");
      console.log(`Reuse ${shot.name}`);
      continue;
    }
    await page.evaluate((data) => window.configure(data), tracking);
    const indices = preview
      ? [73, 84, 96, 108, 135, 158, 179]
      : schedule.map((_, index) => index);
    let encoder, completed;
    const samples = [];
    try {
      if (!preview) {
        encoder = spawn(
          ffmpeg,
          [
            "-n",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "image2pipe",
            "-framerate",
            String(board.sourceFps),
            "-vcodec",
            "mjpeg",
            "-i",
            "pipe:0",
            "-an",
            "-c:v",
            "libx264",
            "-crf",
            "16",
            "-preset",
            "fast",
            "-threads",
            "4",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            destination,
          ],
          { stdio: ["pipe", "ignore", "inherit"] },
        );
        completed = once(encoder, "close");
      }
      for (const index of indices) {
        const state = {
          ...schedule[index],
          checkTracks: [108, 135, 179].includes(index),
        };
        const result = await page.evaluate(
          (value) => window.renderFrame(value),
          state,
        );
        if (result.occupied < 0.05 || result.points !== 141120)
          throw new Error(
            `Blank or incomplete ${shot.name}/${index}: ${result.occupied}`,
          );
        const buffer = Buffer.from(result.image, "base64");
        if (state.checkTracks && !(result.trackPixels > 100))
          throw new Error(
            `Invisible tracking overlay: ${shot.name}/${index}: ${result.trackPixels}`,
          );
        if (preview)
          await writeFile(
            resolve(output, `${shot.name}-${index}.jpg`),
            buffer,
            { flag: "wx" },
          );
        else if (!encoder.stdin.write(buffer))
          await once(encoder.stdin, "drain");
        samples.push({
          index,
          ...state,
          occupied: result.occupied,
          points: result.points,
          tracks: result.tracks,
          trackPixels: result.trackPixels,
        });
        if (index % 30 === 0 || index === schedule.length - 1)
          console.log(
            `${shot.name} ${index + 1}/${schedule.length}, ${result.tracks} tracks`,
          );
      }
      if (encoder) {
        encoder.stdin.end();
        const [code] = await completed;
        if (code !== 0) throw new Error(`Render encoder failed: ${code}`);
        await writeFile(
          reportPath,
          JSON.stringify(
            {
              sceneId: tracking.sceneId,
              width: board.renderWidth,
              height: board.renderHeight,
              frames: schedule.length,
              fps: board.sourceFps,
              sourceHashes,
              samples,
              outputSha256: createHash("sha256")
                .update(await readFile(destination))
                .digest("hex"),
            },
            null,
            2,
          ) + "\n",
          { flag: "wx" },
        );
      }
    } finally {
      if (encoder && encoder.exitCode === null) {
        encoder.kill("SIGTERM");
        await completed;
      }
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  if (browser) await browser.close();
  server.close();
}
