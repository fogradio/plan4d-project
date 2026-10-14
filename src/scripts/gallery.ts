import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import gallery from "../data/gallery.json";

const root = document.querySelector<HTMLElement>("#gallery")!;
const output = root.querySelector<HTMLElement>(".gallery-output")!;
const slot = root.querySelector<HTMLElement>("#gallery-slot")!;
const select = root.querySelector<HTMLSelectElement>("#gallery-case")!;
const cloud = root.querySelector<HTMLElement>("#gallery-cloud")!;
const video = root.querySelector<HTMLVideoElement>("#gallery-video")!;
const status = root.querySelector<HTMLElement>(".gallery-status")!;
const retry = root.querySelector<HTMLButtonElement>(".gallery-retry")!;
const slider = root.querySelector<HTMLInputElement>("#gallery-frame")!;
const play = root.querySelector<HTMLButtonElement>(".gallery-play")!;
const speed = root.querySelector<HTMLSelectElement>("#gallery-speed")!;
const size = root.querySelector<HTMLInputElement>("#gallery-point-size")!;
const dialog = document.querySelector<HTMLDialogElement>("#gallery-dialog")!;
const modeBar = root.querySelector<HTMLElement>(".gallery-mode-bar")!;
const modeButtons = [
  ...root.querySelectorAll<HTMLButtonElement>(".gallery-mode"),
];
const modes = [
  "INTERACTIVE 4D OUTPUT",
  "RGB Video",
  "Depth Video",
  "Aggregated 4D Point Cloud",
  "Scene Flow",
];
const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
const loader = new PLYLoader();
const cache = new Map<string, THREE.BufferGeometry>();
const material = new THREE.PointsMaterial({
  vertexColors: true,
  size: 0.027,
  sizeAttenuation: true,
});
const points = new THREE.Points(new THREE.BufferGeometry(), material);
const scene3d = new THREE.Scene();
scene3d.add(points);
points.frustumCulled = false;
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200);
let renderer: THREE.WebGLRenderer | undefined;
let controls: OrbitControls | undefined;
let scene = gallery.cases[0];
let mode = 0;
let frame = 0;
let requestedFrame = 0;
let playhead = 0;
let playing = false;
let visible = false;
let initialized = false;
let revision = 0;
let timer = 0;
let scrubTimer = 0;
let renderFrame = 0;
let request: AbortController | undefined;
let videoPaths: string[] = [];
let videoPathIndex = 0;
let videoTimeout = 0;
let expandedHeight = "";

function isCloud() {
  return mode === 0 || mode === 3;
}

function render() {
  renderFrame = 0;
  if (!renderer || !isCloud() || document.hidden || (!visible && !dialog.open))
    return;
  const bounds = cloud.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  renderer.setSize(bounds.width, bounds.height, false);
  camera.aspect = bounds.width / bounds.height;
  camera.fov = THREE.MathUtils.radToDeg(
    2 * Math.atan(Math.tan(Math.PI / 8) / Math.min(1, camera.aspect)),
  );
  camera.updateProjectionMatrix();
  renderer.render(scene3d, camera);
}

function scheduleRender() {
  if (!renderFrame) renderFrame = requestAnimationFrame(render);
}

function resetView() {
  if (mode === 3) camera.position.set(1.25, 0.65, 2.5);
  else camera.position.set(0.12, 0.05, 2.8);
  camera.up.set(0, 1, 0);
  controls?.target.set(0, 0, 0);
  controls?.update();
  scheduleRender();
}

function setStatus(message: string, error = false) {
  status.hidden = !message;
  status.querySelector("span")!.textContent = message;
  retry.hidden = !error;
  if (message) output.dataset.state = error ? "error" : "loading";
}

function ready() {
  setStatus("");
  output.dataset.state = "ready";
}

function ensureRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0xeef5f1);
  cloud.append(renderer.domElement);
  controls = new OrbitControls(camera, cloud);
  controls.minDistance = 0.5;
  controls.maxDistance = 15;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.7;
  controls.addEventListener("change", scheduleRender);
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    stop();
    setStatus("Restoring graphics");
  });
  renderer.domElement.addEventListener("webglcontextrestored", () => {
    if (isCloud()) void showFrame(frame);
  });
  resetView();
}

function trimCache() {
  for (const [key, geometry] of cache) {
    if (cache.size <= 24) break;
    if (geometry !== points.geometry) {
      geometry.dispose();
      cache.delete(key);
    }
  }
}

async function loadGeometry(path: string, signal: AbortSignal) {
  const cached = cache.get(path);
  if (cached) {
    cache.delete(path);
    cache.set(path, cached);
    return cached;
  }
  const metadata = mode === 3 ? scene.aggregate : scene.sequence;
  const response = await fetch(base + path, { signal });
  if (!response.ok)
    throw new Error(`Point-cloud request failed: ${response.status}`);
  let buffer = await response.arrayBuffer();
  const signature = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
  if (signature[0] === 0x1f && signature[1] === 0x8b) {
    buffer = await new Response(
      new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).arrayBuffer();
  }
  signal.throwIfAborted();
  const geometry = loader.parse(buffer);
  if (
    !geometry.getAttribute("position")?.count ||
    !geometry.getAttribute("color")
  ) {
    geometry.dispose();
    throw new Error("No colored vertices in point cloud");
  }
  const transform = new THREE.Matrix4().makeScale(
    1 / metadata.radius,
    1 / metadata.radius,
    1 / metadata.radius,
  );
  transform.multiply(
    new THREE.Matrix4().makeTranslation(
      -metadata.center[0],
      -metadata.center[1],
      -metadata.center[2],
    ),
  );
  transform.multiply(new THREE.Matrix4().makeRotationX(Math.PI));
  transform.multiply(
    new THREE.Matrix4().fromArray(metadata.worldToCamera).transpose(),
  );
  geometry.applyMatrix4(transform);
  geometry.computeBoundingSphere();
  cache.set(path, geometry);
  return geometry;
}

async function showFrame(nextFrame: number) {
  requestedFrame = nextFrame;
  const currentRevision = ++revision;
  request?.abort();
  request = new AbortController();
  if (output.dataset.state !== "ready") setStatus("Loading point cloud");
  const path =
    mode === 3
      ? scene.aggregate.path
      : `${scene.sequence.path}/${String(nextFrame).padStart(4, "0")}.ply.gz`;
  try {
    ensureRenderer();
    const geometry = await loadGeometry(path, request.signal);
    if (currentRevision !== revision) return false;
    if (!points.geometry.getAttribute("position")) points.geometry.dispose();
    points.geometry = geometry;
    points.visible = true;
    frame = nextFrame;
    if (mode === 0) playhead = frame / scene.fps;
    slider.value = String(frame);
    output.querySelector("#gallery-frame-counter")!.textContent =
      `${String(frame + 1).padStart(2, "0")} / 81`;
    output.dataset.frame = String(frame);
    output.dataset.points = String(geometry.getAttribute("position").count);
    play.disabled = false;
    slider.disabled = false;
    ready();
    trimCache();
    scheduleRender();
    return true;
  } catch {
    if (currentRevision === revision) {
      stop();
      setStatus("Could not load point cloud", true);
    }
    return false;
  }
}

function stop() {
  playing = false;
  window.clearTimeout(timer);
  play.setAttribute("aria-pressed", "false");
  play.setAttribute("aria-label", "Play sequence");
  play.title = "Play sequence";
  video.pause();
}

async function tick() {
  if (!playing || mode !== 0 || document.hidden) return;
  const started = performance.now();
  const updated = await showFrame((frame + 1) % 81);
  if (!updated || !playing) return;
  timer = window.setTimeout(
    () => void tick(),
    Math.max(
      0,
      1000 / (scene.fps * Number(speed.value)) - (performance.now() - started),
    ),
  );
}

function beginVideo() {
  setStatus("Loading video");
  window.clearTimeout(videoTimeout);
  video.src = base + videoPaths[videoPathIndex];
  video.preload = "auto";
  video.load();
  videoTimeout = window.setTimeout(() => {
    if (!isCloud() && video.readyState < 2)
      setStatus("Could not load video", true);
  }, 30000);
}

function showMode() {
  initialized = true;
  ++revision;
  request?.abort();
  window.clearTimeout(scrubTimer);
  window.clearTimeout(videoTimeout);
  stop();
  output.dataset.case = scene.id;
  output.dataset.mode = String(mode);
  output.dataset.frame = String(frame);
  output.dataset.state = "loading";
  output.querySelector("#gallery-mode-title")!.textContent = modes[mode];
  output.querySelector("#gallery-mode-counter")!.textContent =
    `${mode + 1} / 5`;
  for (const [index, button] of modeButtons.entries())
    button.setAttribute("aria-pressed", String(index === mode));
  output.querySelector<HTMLElement>(".gallery-timeline")!.hidden = mode !== 0;
  output.querySelector<HTMLElement>(".gallery-cloud-tools")!.hidden =
    !isCloud();
  cloud.hidden = !isCloud();
  video.hidden = isCloud();
  if (isCloud()) {
    video.removeAttribute("src");
    video.load();
    points.visible = false;
    material.size = Number(size.value) * (mode === 3 ? 0.0036 : 0.018);
    resetView();
    play.disabled = true;
    slider.disabled = true;
    void showFrame(
      mode === 3 ? 0 : Math.min(80, Math.round(playhead * scene.fps)),
    );
  } else {
    const kind = mode === 1 ? "rgb" : mode === 2 ? "depth" : "flow";
    const media = scene.videos[kind];
    const preferMp4 = Boolean(
      video.canPlayType('video/mp4; codecs="avc1.64001f"'),
    );
    videoPaths = preferMp4 ? [media.mp4, media.webm] : [media.webm, media.mp4];
    videoPathIndex = 0;
    video.poster = base + media.poster;
    video.setAttribute("aria-label", `${modes[mode]} for ${scene.id}`);
    beginVideo();
  }
}

function changeMode(next: number) {
  if (!isCloud() && video.readyState >= 1) playhead = video.currentTime;
  mode = (next + modes.length) % modes.length;
  showMode();
}

select.addEventListener("change", () => {
  scene = gallery.cases.find((candidate) => candidate.id === select.value)!;
  frame = 0;
  playhead = 0;
  const inputImage = root.querySelector<HTMLImageElement>("#gallery-image")!;
  inputImage.src = base + scene.image;
  inputImage.alt = `Input for ${scene.id}`;
  root.querySelector("#gallery-prompt")!.textContent = scene.prompt;
  showMode();
});
output
  .querySelector(".gallery-previous")!
  .addEventListener("click", () => changeMode(mode - 1));
output
  .querySelector(".gallery-next")!
  .addEventListener("click", () => changeMode(mode + 1));
for (const button of modeButtons)
  button.addEventListener("click", () =>
    changeMode(Number(button.dataset.mode)),
  );
modeBar.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  changeMode(mode + (event.key === "ArrowLeft" ? -1 : 1));
});
let touchStart = 0;
modeBar.addEventListener(
  "touchstart",
  (event) => {
    touchStart = event.changedTouches[0].clientX;
  },
  { passive: true },
);
modeBar.addEventListener(
  "touchend",
  (event) => {
    const distance = event.changedTouches[0].clientX - touchStart;
    if (Math.abs(distance) > 45) changeMode(mode + (distance < 0 ? 1 : -1));
  },
  { passive: true },
);
play.addEventListener("click", () => {
  if (playing) stop();
  else {
    playing = true;
    play.setAttribute("aria-pressed", "true");
    play.setAttribute("aria-label", "Pause sequence");
    play.title = "Pause sequence";
    void tick();
  }
});
slider.addEventListener("input", () => {
  stop();
  ++revision;
  request?.abort();
  window.clearTimeout(scrubTimer);
  scrubTimer = window.setTimeout(
    () => void showFrame(Number(slider.value)),
    60,
  );
});
size.addEventListener("input", () => {
  material.size = Number(size.value) * (mode === 3 ? 0.0036 : 0.018);
  scheduleRender();
});
output.querySelector(".gallery-reset")!.addEventListener("click", resetView);
retry.addEventListener("click", () =>
  isCloud() ? void showFrame(requestedFrame) : beginVideo(),
);
video.addEventListener("loadedmetadata", () => {
  if (isCloud()) return;
  video.currentTime = Math.min(playhead, Math.max(0, video.duration - 0.05));
});
video.addEventListener("loadeddata", () => {
  if (!isCloud()) {
    window.clearTimeout(videoTimeout);
    ready();
  }
});
video.addEventListener("error", () => {
  if (isCloud()) return;
  if (++videoPathIndex < videoPaths.length) beginVideo();
  else {
    videoPathIndex = 0;
    window.clearTimeout(videoTimeout);
    setStatus("Could not load video", true);
  }
});
video.addEventListener("play", () => {
  if (isCloud() || document.hidden || (!visible && !dialog.open)) video.pause();
});
cloud.addEventListener("keydown", (event) => {
  if (
    !controls ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-"].includes(
      event.key,
    )
  )
    return;
  event.preventDefault();
  const spherical = new THREE.Spherical().setFromVector3(
    camera.position.clone().sub(controls.target),
  );
  if (event.key === "ArrowLeft") spherical.theta -= 0.1;
  if (event.key === "ArrowRight") spherical.theta += 0.1;
  if (event.key === "ArrowUp") spherical.phi -= 0.1;
  if (event.key === "ArrowDown") spherical.phi += 0.1;
  if (event.key === "+")
    spherical.radius = Math.max(0.5, spherical.radius * 0.9);
  if (event.key === "-")
    spherical.radius = Math.min(15, spherical.radius * 1.1);
  spherical.makeSafe();
  camera.position.setFromSpherical(spherical).add(controls.target);
  controls.update();
});

output.querySelector(".gallery-expand")!.addEventListener("click", () => {
  expandedHeight = document.body.style.overflow;
  slot.style.minHeight = `${slot.getBoundingClientRect().height}px`;
  dialog.append(output);
  output.querySelector<HTMLElement>(".gallery-expand")!.hidden = true;
  output.querySelector<HTMLElement>(".gallery-close")!.hidden = false;
  dialog.showModal();
  document.body.style.overflow = "hidden";
  scheduleRender();
});
output.querySelector(".gallery-close")!.addEventListener("click", () => {
  stop();
  dialog.close();
});
dialog.addEventListener("close", () => {
  stop();
  slot.append(output);
  slot.style.minHeight = "";
  output.querySelector<HTMLElement>(".gallery-expand")!.hidden = false;
  output.querySelector<HTMLElement>(".gallery-close")!.hidden = true;
  document.body.style.overflow = expandedHeight;
  output
    .querySelector<HTMLButtonElement>(".gallery-expand")!
    .focus({ preventScroll: true });
  scheduleRender();
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
const observer = new IntersectionObserver(
  (entries) => {
    visible = entries[0].isIntersecting;
    if (visible && !initialized) showMode();
    if (!visible && !dialog.open) stop();
    scheduleRender();
  },
  { rootMargin: "100px 0px" },
);
observer.observe(root);
const resize = new ResizeObserver(scheduleRender);
resize.observe(cloud);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
  scheduleRender();
});
import.meta.hot?.dispose(() => {
  stop();
  ++revision;
  request?.abort();
  window.clearTimeout(scrubTimer);
  window.clearTimeout(videoTimeout);
  cancelAnimationFrame(renderFrame);
  observer.disconnect();
  resize.disconnect();
  if (dialog.open) dialog.close();
  controls?.dispose();
  for (const geometry of cache.values()) geometry.dispose();
  material.dispose();
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer?.domElement.remove();
});
