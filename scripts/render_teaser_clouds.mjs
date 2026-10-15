import { createServer } from "node:http";
import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { chromium } from "playwright";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(project, "artifacts/teaser-20261015/clouds");
const manifest = JSON.parse(
  await readFile(resolve(project, "src/data/gallery.json"), "utf8"),
);
const ffmpeg =
  process.env.PLAN4D_FFMPEG ||
  "/mnt/workspace/hwzhang/miniconda3/envs/dav3/lib/python3.10/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2";
const preview = process.argv.includes("--preview");
const shots = [
  { name: "pipette", index: 12, aggregate: false },
  { name: "soup", index: 0, aggregate: false },
  { name: "body", index: 14, aggregate: false },
  { name: "pipette-aggregate-v2", index: 12, aggregate: true },
];
await mkdir(output, { recursive: true });
let activeShot;
let hashes;
const html = `<!doctype html><html><head><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script></head><body style="margin:0"><script type="module">
import * as THREE from 'three';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1280, 800);
renderer.setClearColor(0xf4f6f5);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1280 / 800, 0.01, 200);
const material = new THREE.PointsMaterial({vertexColors: true, size: 0.009, sizeAttenuation: true});
const points = new THREE.Points(new THREE.BufferGeometry(), material);
points.frustumCulled = false;
scene.add(points);
const loader = new PLYLoader();
let aggregateGeometry;
window.reset = () => { aggregateGeometry = undefined; };
window.renderFrame = async (metadata, frame, aggregate) => {
  if (!aggregate || !aggregateGeometry) {
    const response = await fetch('/cloud/' + frame);
    if (!response.ok) throw new Error('Cloud request failed');
    const geometry = loader.parse(await response.arrayBuffer());
    const transform = new THREE.Matrix4().makeScale(1 / metadata.radius, 1 / metadata.radius, 1 / metadata.radius);
    transform.multiply(new THREE.Matrix4().makeTranslation(...metadata.center.map(value => -value)));
    transform.multiply(new THREE.Matrix4().makeRotationX(Math.PI));
    transform.multiply(new THREE.Matrix4().fromArray(metadata.worldToCamera).transpose());
    geometry.applyMatrix4(transform);
    points.geometry.dispose();
    points.geometry = geometry;
    if (aggregate) aggregateGeometry = geometry;
  }
  const phase = frame / 80;
  camera.fov = aggregate ? 22 : 40;
  camera.updateProjectionMatrix();
  const angle = (-1 + 2 * phase) * (aggregate ? 0.48 : 0.27);
  const distance = aggregate ? 2.65 : 2.45;
  camera.position.set(Math.sin(angle) * distance, aggregate ? 0.30 : 0.10, Math.cos(angle) * distance);
  camera.lookAt(0, 0, 0);
  material.size = aggregate ? 0.005 : 0.0075;
  renderer.render(scene, camera);
  return { image: renderer.domElement.toDataURL('image/jpeg', 0.96).split(',')[1], points: points.geometry.getAttribute('position').count };
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
    } else if (/^\/cloud\/\d+$/.test(pathname)) {
      const frame = Number(pathname.split("/").at(-1));
      if (frame > 80 || !activeShot) throw new Error("Invalid frame");
      const scene = manifest.cases[activeShot.index];
      const root = dirname(scene.videos.rgb.source);
      const filename = resolve(
        root,
        "point_cloud",
        activeShot.aggregate
          ? "global_pcd_with_camera_trajectory.ply"
          : `frame_${String(frame).padStart(4, "0")}.ply`,
      );
      const data = await readFile(filename);
      hashes[filename] = createHash("sha256").update(data).digest("hex");
      response.setHeader("Content-Type", "application/octet-stream");
      response.end(data);
    } else {
      response.writeHead(404).end();
    }
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
await new Promise((resolveReady) =>
  server.listen(0, "127.0.0.1", resolveReady),
);
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-dev-shm-usage",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  page.on("pageerror", (error) => console.error(error));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => typeof window.renderFrame === "function");
  for (const shot of shots) {
    const destination = resolve(output, `${shot.name}.mp4`);
    const reportPath = resolve(output, `${shot.name}.json`);
    if (!preview) {
      const cached = await access(reportPath).then(
        () => true,
        () => false,
      );
      if (cached) {
        console.log(`Reuse ${shot.name}`);
        continue;
      }
      const exists = await access(destination).then(
        () => true,
        () => false,
      );
      if (exists)
        throw new Error(
          `Incomplete output exists: ${destination}. Choose a new output directory.`,
        );
    }
    activeShot = shot;
    hashes = {};
    await page.evaluate("window.reset()");
    const scene = manifest.cases[shot.index];
    const metadata = shot.aggregate ? scene.aggregate : scene.sequence;
    const frames = preview
      ? [0, 40, 80]
      : Array.from({ length: 81 }, (_, index) => index);
    let encoder;
    let completed;
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
          "15",
          "-vcodec",
          "mjpeg",
          "-i",
          "pipe:0",
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "16",
          "-pix_fmt",
          "yuv420p",
          "-threads",
          "4",
          "-movflags",
          "+faststart",
          destination,
        ],
        { stdio: ["pipe", "ignore", "inherit"] },
      );
      completed = once(encoder, "close");
    }
    let points = 0;
    for (const frame of frames) {
      const result = await page.evaluate(
        async ({ metadata, frame, aggregate }) =>
          window.renderFrame(metadata, frame, aggregate),
        { metadata, frame, aggregate: shot.aggregate },
      );
      points = result.points;
      const buffer = Buffer.from(result.image, "base64");
      if (preview)
        await writeFile(resolve(output, `${shot.name}-${frame}.jpg`), buffer);
      else if (!encoder.stdin.write(buffer)) await once(encoder.stdin, "drain");
      if (frame % 20 === 0)
        console.log(`${shot.name} ${frame}/80 (${points} points)`);
    }
    if (encoder) {
      encoder.stdin.end();
      const [code] = await completed;
      if (code !== 0)
        throw new Error(`Encoder failed for ${shot.name}: ${code}`);
      await writeFile(
        reportPath,
        JSON.stringify(
          {
            shot,
            sceneId: scene.id,
            frames: 81,
            fps: 15,
            width: 1280,
            height: 800,
            points,
            sourceHashes: hashes,
            transform: metadata,
            camera:
              "Fixed scene normalization, azimuth sweep; no geometry edits",
          },
          null,
          2,
        ) + "\n",
      );
    }
  }
} finally {
  await browser.close();
  server.close();
}
