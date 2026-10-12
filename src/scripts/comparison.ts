import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import results from "../data/results.json";

type Sequence = (typeof results.sequences)[keyof typeof results.sequences];
const sequences: Record<string, Sequence> = results.sequences;
const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
const loader = new PLYLoader();
const cache = new Map<string, THREE.BufferGeometry>();
const pending = new Map<string, Promise<THREE.BufferGeometry>>();
const waiting: Array<() => void> = [];
const rows: ComparisonRow[] = [];
const linked = document.querySelector<HTMLInputElement>("#sync-views")!;
const scrollRegion = document.querySelector<HTMLElement>(
  "[data-comparison-scroll]",
)!;
const dialog = document.querySelector<HTMLDialogElement>("#cloud-dialog")!;
const dialogSurface = dialog.querySelector<HTMLElement>(".dialog-surface")!;
const dialogSlider = dialog.querySelector<HTMLInputElement>(".dialog-slider")!;
const dialogPlay = dialog.querySelector<HTMLButtonElement>(".dialog-play")!;
const material = new THREE.PointsMaterial({
  size: 0.03,
  vertexColors: true,
  sizeAttenuation: true,
});
let concurrent = 0;
let renderer: THREE.WebGLRenderer;
let expanded: ExpandedView | null = null;
let dirty = true;
let animationFrame = 0;
let viewportWidth = 0;
let viewportHeight = 0;
let syncingCamera = false;

interface ExpandedView {
  row: ComparisonRow;
  view: CloudView;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  scene: THREE.Scene;
  points: THREE.Points;
}

async function withFetchSlot<T>(operation: () => Promise<T>): Promise<T> {
  if (concurrent >= 6)
    await new Promise<void>((resolve) => waiting.push(resolve));
  concurrent++;
  try {
    return await operation();
  } finally {
    concurrent--;
    waiting.shift()?.();
  }
}

async function geometryFor(
  sequenceId: string,
  frame: number,
): Promise<THREE.BufferGeometry> {
  const key = `${sequenceId}/${frame}`;
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const existing = pending.get(key);
  if (existing) return existing;
  const sequence = sequences[sequenceId];
  const promise = withFetchSlot(async () => {
    const url = `${base}${sequence.path}/${String(frame).padStart(4, "0")}.ply.gz`;
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Point cloud request failed: ${response.status}`);
    let buffer = await response.arrayBuffer();
    const signature = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
    if (signature[0] === 0x1f && signature[1] === 0x8b) {
      const stream = new Blob([buffer])
        .stream()
        .pipeThrough(new DecompressionStream("gzip"));
      buffer = await new Response(stream).arrayBuffer();
    }
    const geometry = loader.parse(buffer);
    if (
      !geometry.getAttribute("position")?.count ||
      !geometry.getAttribute("color")
    ) {
      geometry.dispose();
      throw new Error("Point cloud has no colored vertices");
    }
    const transform = new THREE.Matrix4().makeScale(
      1 / sequence.radius,
      1 / sequence.radius,
      1 / sequence.radius,
    );
    transform.multiply(
      new THREE.Matrix4().makeTranslation(
        -sequence.center[0],
        -sequence.center[1],
        -sequence.center[2],
      ),
    );
    transform.multiply(new THREE.Matrix4().makeRotationX(Math.PI));
    transform.multiply(
      new THREE.Matrix4().fromArray(sequence.worldToCamera).transpose(),
    );
    geometry.applyMatrix4(transform);
    geometry.computeBoundingSphere();
    cache.set(key, geometry);
    return geometry;
  });
  pending.set(key, promise);
  try {
    return await promise;
  } finally {
    pending.delete(key);
  }
}

function trimCache() {
  if (cache.size <= 80) return;
  const inUse = new Set(
    rows.flatMap((row) => row.views.map((view) => view.points.geometry)),
  );
  if (expanded) inUse.add(expanded.points.geometry);
  for (const [key, geometry] of cache) {
    if (cache.size <= 80) break;
    if (!inUse.has(geometry)) {
      geometry.dispose();
      cache.delete(key);
    }
  }
}

function resetCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
  camera.position.set(0.12, 0.05, 2.8);
  camera.up.set(0, 1, 0);
  controls.target.set(0, 0, 0);
  controls.update();
  dirty = true;
}

function copyCamera(
  sourceCamera: THREE.PerspectiveCamera,
  sourceControls: OrbitControls,
  destinationCamera: THREE.PerspectiveCamera,
  destinationControls: OrbitControls,
) {
  destinationCamera.position.copy(sourceCamera.position);
  destinationCamera.quaternion.copy(sourceCamera.quaternion);
  destinationCamera.up.copy(sourceCamera.up);
  destinationControls.target.copy(sourceControls.target);
  destinationControls.update();
}

function configureControls(
  camera: THREE.PerspectiveCamera,
  surface: HTMLElement,
) {
  const controls = new OrbitControls(camera, surface);
  controls.enableDamping = false;
  controls.minDistance = 0.5;
  controls.maxDistance = 15;
  controls.zoomSpeed = 0.7;
  controls.rotateSpeed = 0.65;
  resetCamera(camera, controls);
  return controls;
}

function fitCameraAspect(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
) {
  camera.aspect = width / height;
  camera.fov = THREE.MathUtils.radToDeg(
    2 *
      Math.atan(
        Math.tan(THREE.MathUtils.degToRad(22.5)) / Math.min(1, camera.aspect),
      ),
  );
  camera.updateProjectionMatrix();
}

function cameraChanged(
  row: ComparisonRow,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
) {
  dirty = true;
  if (syncingCamera || !linked.checked) return;
  syncingCamera = true;
  for (const view of row.views) {
    if (view.camera !== camera)
      copyCamera(camera, controls, view.camera, view.controls);
  }
  if (expanded?.row === row && expanded.camera !== camera) {
    copyCamera(camera, controls, expanded.camera, expanded.controls);
  }
  syncingCamera = false;
}

class CloudView {
  surface: HTMLElement;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200);
  points = new THREE.Points(new THREE.BufferGeometry(), material);
  controls: OrbitControls;
  status: HTMLElement;
  ready = false;
  sequenceId: string;
  background: THREE.Color;

  constructor(
    public cell: HTMLElement,
    public row: ComparisonRow,
  ) {
    this.surface = cell.querySelector(".viewer-surface")!;
    this.status = cell.querySelector(".cloud-status")!;
    this.sequenceId = cell.dataset.sequence!;
    this.background = new THREE.Color(
      cell.dataset.method === "plan4d" ? 0xeef5f1 : 0xf0f3f2,
    );
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.controls = configureControls(this.camera, this.surface);
    this.controls.addEventListener("change", () =>
      cameraChanged(row, this.camera, this.controls),
    );
    cell.querySelector(".reset-view")!.addEventListener("click", () => {
      resetCamera(this.camera, this.controls);
      cameraChanged(row, this.camera, this.controls);
    });
    cell.querySelector(".expand-view")!.addEventListener("click", () => {
      if (this.ready) openExpanded(row, this);
    });
    cell
      .querySelector(".retry-button")!
      .addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
    cell.querySelector(".retry-button")!.addEventListener("click", () => {
      void row.showFrame(row.requestedFrame);
    });
    this.surface.addEventListener("keydown", (event) => {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-"].includes(
          event.key,
        )
      )
        return;
      event.preventDefault();
      const relative = this.camera.position.clone().sub(this.controls.target);
      const spherical = new THREE.Spherical().setFromVector3(relative);
      if (event.key === "ArrowLeft") spherical.theta -= 0.1;
      if (event.key === "ArrowRight") spherical.theta += 0.1;
      if (event.key === "ArrowUp") spherical.phi -= 0.1;
      if (event.key === "ArrowDown") spherical.phi += 0.1;
      if (event.key === "+")
        spherical.radius = Math.max(0.5, spherical.radius * 0.9);
      if (event.key === "-")
        spherical.radius = Math.min(15, spherical.radius * 1.1);
      spherical.makeSafe();
      this.camera.position
        .setFromSpherical(spherical)
        .add(this.controls.target);
      this.controls.update();
    });
  }

  setGeometry(geometry: THREE.BufferGeometry, frame: number) {
    if (!this.ready) this.points.geometry.dispose();
    this.points.geometry = geometry;
    this.ready = true;
    this.status.hidden = true;
    this.cell.querySelector<HTMLElement>(".retry-button")!.hidden = true;
    this.cell.querySelector(".cloud-frame")!.textContent =
      `${String(frame + 1).padStart(2, "0")} / 81`;
    this.cell.querySelector<HTMLButtonElement>(".expand-view")!.disabled =
      false;
    this.cell.dataset.frame = String(frame);
    this.cell.dataset.points = String(geometry.getAttribute("position").count);
    this.cell.dataset.state = "ready";
  }

  showError() {
    this.status.hidden = false;
    this.status.dataset.error = "true";
    this.status.textContent = "Could not load this frame";
    this.cell.querySelector<HTMLElement>(".retry-button")!.hidden = false;
    this.cell.dataset.state = "error";
  }
}

class ComparisonRow {
  views: CloudView[] = [];
  frame = 0;
  requestedFrame = 0;
  playing = false;
  visible = false;
  initialized = false;
  ready = false;
  revision = 0;
  timer = 0;
  scrubTimer = 0;
  slider: HTMLInputElement;
  playButton: HTMLButtonElement;
  state: HTMLElement;
  fps: number;

  constructor(public element: HTMLElement) {
    this.slider = element.querySelector(".frame-slider")!;
    this.playButton = element.querySelector(".playback-button")!;
    this.state = element.querySelector(".row-state")!;
    this.fps = Number(element.dataset.fps) || 16;
    this.playButton.addEventListener("click", () =>
      this.setPlaying(!this.playing),
    );
    this.slider.addEventListener("input", () =>
      this.scrub(Number(this.slider.value)),
    );
    element.querySelector(".previous-frame")!.addEventListener("click", () => {
      this.setPlaying(false);
      void this.showFrame(Math.max(0, this.frame - 1));
    });
    element.querySelector(".next-frame")!.addEventListener("click", () => {
      this.setPlaying(false);
      void this.showFrame(Math.min(80, this.frame + 1));
    });
  }

  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    this.views = Array.from(
      this.element.querySelectorAll<HTMLElement>(".cloud-cell"),
      (cell) => new CloudView(cell, this),
    );
    void this.showFrame(0);
  }

  scrub(frame: number) {
    this.setPlaying(false);
    this.revision++;
    this.requestedFrame = frame;
    window.clearTimeout(this.scrubTimer);
    this.scrubTimer = window.setTimeout(() => {
      void this.showFrame(frame);
    }, 65);
  }

  async showFrame(frame: number) {
    const revision = ++this.revision;
    this.requestedFrame = frame;
    this.state.dataset.error = "false";
    for (const view of this.views) {
      view.cell.querySelector<HTMLElement>(".retry-button")!.hidden = true;
      if (!view.ready) {
        view.status.hidden = false;
        view.status.dataset.error = "false";
        view.status.textContent = "Loading 4D scene";
      }
    }
    const loadingTimer = window.setTimeout(() => {
      if (revision === this.revision)
        this.state.textContent = this.ready ? "Buffering" : "Loading";
    }, 120);
    try {
      const geometries = await Promise.all(
        this.views.map(async (view) => {
          try {
            return await geometryFor(view.sequenceId, frame);
          } catch (error) {
            if (revision === this.revision) view.showError();
            throw error;
          }
        }),
      );
      if (revision !== this.revision) return false;
      for (const [index, view] of this.views.entries())
        view.setGeometry(geometries[index], frame);
      this.frame = frame;
      this.ready = true;
      this.slider.value = String(frame);
      this.element.dataset.frame = String(frame);
      this.element.dataset.state = "ready";
      this.element.querySelector(".frame-counter")!.textContent =
        `${String(frame + 1).padStart(2, "0")} / 81`;
      for (const control of this.element.querySelectorAll<
        HTMLInputElement | HTMLButtonElement
      >(".row-timeline [disabled]"))
        control.disabled = false;
      this.state.textContent = `${(frame / this.fps).toFixed(2)} s`;
      if (expanded?.row === this) {
        expanded.points.geometry = expanded.view.points.geometry;
        dialog.querySelector(".dialog-state")!.textContent = "";
        updateExpandedTimeline();
      }
      trimCache();
      dirty = true;
      return true;
    } catch {
      if (revision === this.revision) {
        this.setPlaying(false);
        this.state.textContent = "Load failed";
        this.state.dataset.error = "true";
        this.element.dataset.state = "error";
        if (expanded?.row === this) {
          updateExpandedTimeline();
          dialog.querySelector(".dialog-state")!.textContent =
            "Could not load this frame. Select a frame to retry.";
        }
      }
      return false;
    } finally {
      window.clearTimeout(loadingTimer);
    }
  }

  setPlaying(playing: boolean) {
    this.playing = playing && this.ready;
    window.clearTimeout(this.timer);
    this.playButton.setAttribute("aria-pressed", String(this.playing));
    this.playButton.setAttribute(
      "aria-label",
      this.playing ? "Pause sequence" : "Play sequence",
    );
    this.playButton.title = this.playing ? "Pause sequence" : "Play sequence";
    if (expanded?.row === this) updateExpandedTimeline();
    if (this.playing) {
      for (const row of rows) if (row !== this) row.setPlaying(false);
      void this.tick();
    }
  }

  async tick() {
    if (!this.playing || document.hidden) return;
    const started = performance.now();
    const displayed = await this.showFrame((this.frame + 1) % 81);
    if (!this.playing || !displayed) return;
    const speed = Number(
      this.element.querySelector<HTMLSelectElement>(".playback-speed")!.value,
    );
    this.timer = window.setTimeout(
      () => {
        void this.tick();
      },
      Math.max(0, 1000 / (this.fps * speed) - (performance.now() - started)),
    );
  }
}

function updateExpandedTimeline() {
  if (!expanded) return;
  dialogSlider.value = String(expanded.row.frame);
  dialog.querySelector(".dialog-counter")!.textContent =
    `${String(expanded.row.frame + 1).padStart(2, "0")} / 81`;
  dialogPlay.setAttribute("aria-pressed", String(expanded.row.playing));
  dialogPlay.setAttribute(
    "aria-label",
    expanded.row.playing ? "Pause sequence" : "Play sequence",
  );
  dialogPlay.title = expanded.row.playing ? "Pause sequence" : "Play sequence";
}

function openExpanded(row: ComparisonRow, view: CloudView) {
  row.setPlaying(false);
  if (expanded) closeExpanded();
  const modalRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
  });
  modalRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  modalRenderer.setClearColor(view.background);
  dialogSurface.append(modalRenderer.domElement);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200);
  const controls = configureControls(camera, dialogSurface);
  copyCamera(view.camera, view.controls, camera, controls);
  const scene = new THREE.Scene();
  const points = new THREE.Points(view.points.geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  expanded = {
    row,
    view,
    renderer: modalRenderer,
    camera,
    controls,
    scene,
    points,
  };
  controls.addEventListener("change", () =>
    cameraChanged(row, camera, controls),
  );
  const names: Record<string, string> = {
    gen3r: "Gen3R",
    tesseract: "TesserAct",
    vist3a: "VIST3A",
    plan4d: "Plan4D (ours)",
  };
  const prompt = row.element.querySelector(".prompt-cell > p")!.textContent;
  dialog.querySelector("#cloud-dialog-title")!.textContent =
    `${names[view.cell.dataset.method!]} · ${prompt}`;
  dialog.showModal();
  document.body.style.overflow = "hidden";
  updateExpandedTimeline();
  dirty = true;
}

function closeExpanded() {
  if (!expanded) return;
  expanded.row.setPlaying(false);
  expanded.controls.dispose();
  expanded.renderer.dispose();
  expanded.renderer.forceContextLoss();
  expanded.renderer.domElement.remove();
  expanded = null;
  document.body.style.overflow = "";
  dirty = true;
}

dialog
  .querySelector(".dialog-close")!
  .addEventListener("click", () => dialog.close());
dialog.addEventListener("close", closeExpanded);
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
dialogPlay.addEventListener("click", () => {
  if (expanded) expanded.row.setPlaying(!expanded.row.playing);
});
dialogSlider.addEventListener("input", () =>
  expanded?.row.scrub(Number(dialogSlider.value)),
);
dialog.querySelector(".dialog-reset")!.addEventListener("click", () => {
  if (expanded) resetCamera(expanded.camera, expanded.controls);
});
document
  .querySelector<HTMLInputElement>("#point-size")!
  .addEventListener("input", (event) => {
    material.size = Number((event.target as HTMLInputElement).value) * 0.012;
    dirty = true;
  });

function render() {
  animationFrame = requestAnimationFrame(render);
  if (!dirty || document.hidden) return;
  dirty = false;
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width !== viewportWidth || height !== viewportHeight) {
    renderer.setSize(width, height, false);
    viewportWidth = width;
    viewportHeight = height;
  }
  renderer.setScissorTest(false);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  if (expanded) {
    const bounds = dialogSurface.getBoundingClientRect();
    expanded.renderer.setSize(bounds.width, bounds.height, false);
    fitCameraAspect(expanded.camera, bounds.width, bounds.height);
    expanded.renderer.render(expanded.scene, expanded.camera);
    return;
  }
  const container = scrollRegion.getBoundingClientRect();
  const headerBottom = document
    .querySelector(".site-header")!
    .getBoundingClientRect().bottom;
  renderer.setScissorTest(true);
  for (const row of rows) {
    if (!row.visible) continue;
    for (const view of row.views) {
      if (!view.ready) continue;
      const bounds = view.surface.getBoundingClientRect();
      const left = Math.max(bounds.left, container.left, 0);
      const right = Math.min(bounds.right, container.right, width);
      const top = Math.max(bounds.top, container.top, headerBottom);
      const bottom = Math.min(bounds.bottom, container.bottom, height);
      if (right <= left || bottom <= top) continue;
      renderer.setViewport(
        bounds.left,
        height - bounds.bottom,
        bounds.width,
        bounds.height,
      );
      renderer.setScissor(left, height - bottom, right - left, bottom - top);
      renderer.setClearColor(view.background, 1);
      renderer.clear();
      fitCameraAspect(view.camera, bounds.width, bounds.height);
      renderer.render(view.scene, view.camera);
    }
  }
}

function markDirty() {
  dirty = true;
}

try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.domElement.className = "point-cloud-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  document.body.append(renderer.domElement);
  for (const element of document.querySelectorAll<HTMLElement>(
    ".comparison-row",
  ))
    rows.push(new ComparisonRow(element));
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const row = rows.find(
          (candidate) => candidate.element === entry.target,
        )!;
        row.visible = entry.isIntersecting;
        if (row.visible) row.initialize();
        else if (expanded?.row !== row) row.setPlaying(false);
      }
      dirty = true;
    },
    { rootMargin: "120px 0px" },
  );
  for (const row of rows) observer.observe(row.element);
  document.addEventListener("scroll", markDirty, true);
  window.addEventListener("resize", markDirty);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) for (const row of rows) row.setPlaying(false);
    dirty = true;
  });
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    for (const row of rows) {
      row.setPlaying(false);
      for (const view of row.views) {
        view.status.hidden = false;
        view.status.textContent = "Restoring graphics";
      }
    }
  });
  renderer.domElement.addEventListener("webglcontextrestored", () => {
    for (const row of rows)
      for (const view of row.views) if (view.ready) view.status.hidden = true;
    dirty = true;
  });
  render();
  import.meta.hot?.dispose(() => {
    cancelAnimationFrame(animationFrame);
    observer.disconnect();
    document.removeEventListener("scroll", markDirty, true);
    window.removeEventListener("resize", markDirty);
    closeExpanded();
    for (const row of rows) {
      row.setPlaying(false);
      window.clearTimeout(row.scrubTimer);
      for (const view of row.views) view.controls.dispose();
    }
    for (const geometry of cache.values()) geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  });
} catch {
  for (const status of document.querySelectorAll<HTMLElement>(".cloud-status"))
    status.textContent = "WebGL is unavailable in this browser";
  for (const status of document.querySelectorAll<HTMLElement>(".row-state"))
    status.textContent = "Unavailable";
}
