import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const script = fileURLToPath(import.meta.url);
const project = resolve(dirname(script), "..");
const boardPath = resolve(project, "scripts/future_grid_storyboard.json");
const galleryPath = resolve(project, "src/data/gallery.json");
const board = JSON.parse(await readFile(boardPath, "utf8"));
assert.deepEqual(
  board.stages.map((stage) => stage.name),
  ["dynamic", "final"],
);
const gallery = JSON.parse(await readFile(galleryPath, "utf8"));
const preview = process.argv.includes("--preview");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const exists = (path) =>
  access(path).then(
    () => true,
    () => false,
  );
const configuration = hash(
  Buffer.concat([
    await readFile(boardPath),
    await readFile(galleryPath),
    await readFile(script),
  ]),
);
const work = resolve(project, board.work);
const destination = resolve(
  work,
  preview ? `preview-${Date.now()}` : "renders",
);
await mkdir(destination, { recursive: true });
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
const selectedFrames = [0, 35, 66, 93, 100, 160, 162, 269];
const ffmpeg =
  process.env.PLAN4D_FFMPEG ||
  "/mnt/workspace/hwzhang/miniconda3/envs/dav3/lib/python3.10/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2";
let active;
let sourceHashes;
const html = `<!doctype html><html><head><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script></head><body style="margin:0"><script type="module">
import * as THREE from 'three';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
const width=${board.renderWidth}, height=${board.renderHeight};
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(width,height);
renderer.setClearColor(0xf4f6f5);
renderer.outputColorSpace=THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(38,width/height,0.01,100);
const material=new THREE.PointsMaterial({vertexColors:true,size:1.5,sizeAttenuation:false});
const points=new THREE.Points(new THREE.BufferGeometry(),material);
points.frustumCulled=false;
scene.add(points);
const loader=new PLYLoader();
let transform,cached=-1,lastPixels,lastState,settings;
window.configure=(data)=>{
  const {normalization,shot}=data;
  settings=shot;
  camera.zoom=shot.zoom || 1;
  camera.updateProjectionMatrix();
  cached=-1;
  lastPixels=null;
  lastState=null;
  transform=new THREE.Matrix4().makeScale(1/normalization.radius,1/normalization.radius,1/normalization.radius);
  transform.multiply(new THREE.Matrix4().makeTranslation(...normalization.center.map(value=>-value)));
  transform.multiply(new THREE.Matrix4().makeRotationX(Math.PI));
  transform.multiply(new THREE.Matrix4().fromArray(normalization.worldToCamera).transpose());
};
window.renderFrame=async(state)=>{
  if(cached!==state.frame){
    const response=await fetch('/cloud/'+state.frame);
    if(!response.ok)throw new Error('Missing PLY');
    const geometry=loader.parse(await response.arrayBuffer());
    geometry.applyMatrix4(transform);
    points.geometry.dispose();
    points.geometry=geometry;
    cached=state.frame;
  }
  const ease=value=>value*value*(3-2*value);
  const orbit=settings.orbitAngle ?? 0.28;
  const final=settings.finalAngle ?? -0.16;
  const angle=state.stage==='orbit'?orbit*ease(state.phase):state.stage==='dynamic'?orbit:state.stage==='final'?orbit+(final-orbit)*ease(state.phase):0;
  camera.position.set(Math.sin(angle)*2.6,0.10,Math.cos(angle)*2.6);
  camera.lookAt(0,0,0);
  renderer.render(scene,camera);
  const pixels=new Uint8Array(width*height*4);
  const context=renderer.getContext();
  context.readPixels(0,0,width,height,context.RGBA,context.UNSIGNED_BYTE,pixels);
  let occupied=0,changed=0;
  for(let offset=0;offset<pixels.length;offset+=4){
    if(Math.abs(pixels[offset]-244)+Math.abs(pixels[offset+1]-246)+Math.abs(pixels[offset+2]-245)>70)occupied++;
    if(lastPixels && Math.abs(pixels[offset]-lastPixels[offset])+Math.abs(pixels[offset+1]-lastPixels[offset+1])+Math.abs(pixels[offset+2]-lastPixels[offset+2])>30)changed++;
  }
  const sameCamera=lastState && lastState.angle===angle;
  const sourceChanged=lastState && lastState.frame!==state.frame;
  lastPixels=pixels;
  lastState={angle,frame:state.frame};
  return {image:renderer.domElement.toDataURL('image/jpeg',0.97).split(',')[1],points:points.geometry.getAttribute('position').count,occupied:occupied/(width*height),changed,sameCamera,sourceChanged,angle};
};
</script></body></html>`;
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end(html);
    } else if (pathname.startsWith("/three/")) {
      const root = resolve(project, "node_modules/three");
      const filename = resolve(root, pathname.slice(7));
      assert(filename.startsWith(root + "/"));
      response.setHeader("Content-Type", "text/javascript");
      response.end(await readFile(filename));
    } else if (/^\/cloud\/\d+$/.test(pathname) && active) {
      const frame = Number(pathname.split("/").at(-1));
      assert(frame >= 0 && frame <= 80);
      const filename = resolve(
        dirname(gallery.cases[active.scene].videos.rgb.source),
        "point_cloud",
        `frame_${String(frame).padStart(4, "0")}.ply`,
      );
      const data = await readFile(filename);
      sourceHashes[filename] = hash(data);
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
    const scene = gallery.cases[shot.scene];
    const metadataPath = resolve(dirname(scene.videos.rgb.source), "meta.json");
    const metadataBytes = await readFile(metadataPath);
    const metadata = JSON.parse(metadataBytes);
    assert.equal(metadata.task_type, "ti2v");
    assert.equal(metadata.num_condition_frames, 1);
    sourceHashes[metadataPath] = hash(metadataBytes);
    const videoPath = resolve(destination, `${shot.name}.mp4`);
    const reportPath = resolve(destination, `${shot.name}.json`);
    if (!preview && (await exists(videoPath))) {
      const report = JSON.parse(await readFile(reportPath, "utf8"));
      assert.equal(report.configuration, configuration);
      assert.equal(report.outputSha256, hash(await readFile(videoPath)));
      for (const [path, expected] of Object.entries(report.sourceHashes))
        assert.equal(hash(await readFile(path)), expected, path);
      console.log(`Reuse validated ${shot.name}`);
      continue;
    }
    await page.evaluate((metadata) => window.configure(metadata), {
      normalization: scene.sequence,
      shot,
    });
    const indices = preview
      ? selectedFrames
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
            videoPath,
          ],
          { stdio: ["pipe", "ignore", "inherit"] },
        );
        completed = once(encoder, "close");
      }
      for (const index of indices) {
        const result = await page.evaluate(
          (state) => window.renderFrame(state),
          schedule[index],
        );
        assert.equal(result.points, 141120, `${shot.name}/${index}`);
        assert(
          result.occupied > 0.04,
          `Empty ${shot.name}/${index}: ${result.occupied}`,
        );
        const data = Buffer.from(result.image, "base64");
        if (preview)
          await writeFile(
            resolve(destination, `${shot.name}-${index}.jpg`),
            data,
            { flag: "wx" },
          );
        else if (!encoder.stdin.write(data)) await once(encoder.stdin, "drain");
        const { image: renderedImage, ...metrics } = result;
        void renderedImage;
        samples.push({ index, ...schedule[index], ...metrics });
        if (index % 60 === 0 || index === 269)
          console.log(
            `${shot.name}: ${index + 1}/${schedule.length} occupancy=${result.occupied.toFixed(3)}`,
          );
      }
      if (encoder) {
        encoder.stdin.end();
        const [code] = await completed;
        assert.equal(code, 0);
      }
      const moving = samples.filter(
        (sample) =>
          sample.stage === "dynamic" &&
          sample.sameCamera &&
          sample.sourceChanged,
      );
      assert(
        moving.length > 0 && moving.every((sample) => sample.changed > 100),
        `${shot.name}: no fixed-camera motion`,
      );
      await writeFile(
        reportPath,
        JSON.stringify(
          {
            configuration,
            sceneId: scene.id,
            inputFrames: 1,
            originalPrompt: scene.prompt,
            normalization: scene.sequence,
            frames: schedule.length,
            fps: board.sourceFps,
            width: board.renderWidth,
            height: board.renderHeight,
            sourceHashes,
            samples,
            outputSha256: preview ? null : hash(await readFile(videoPath)),
          },
          null,
          2,
        ) + "\n",
        { flag: "wx" },
      );
    } finally {
      if (encoder && encoder.exitCode === null) {
        encoder.kill("SIGTERM");
        await completed;
      }
    }
  }
  assert.deepEqual(errors, []);
  console.log(`Completed: ${destination}`);
} finally {
  if (browser) await browser.close();
  await new Promise((closed) => server.close(closed));
}
