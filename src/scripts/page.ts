const tabs = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-benchmark]"),
);

function selectBenchmark(selected: HTMLButtonElement) {
  for (const tab of tabs) {
    const active = tab === selected;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    const panel = document.getElementById(tab.getAttribute("aria-controls")!);
    if (panel) panel.hidden = !active;
  }
}

for (const [index, tab] of tabs.entries()) {
  tab.addEventListener("click", () => selectBenchmark(tab));
  tab.addEventListener("keydown", (event) => {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectBenchmark(tabs[next]);
    tabs[next].focus();
  });
}

document
  .getElementById("copy-citation")
  ?.addEventListener("click", async () => {
    const content = document.getElementById("citation-text")!;
    const status = document.getElementById("copy-status")!;
    try {
      await navigator.clipboard.writeText(content.textContent ?? "");
      status.textContent = "Copied to clipboard";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(content);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      status.textContent = "BibTeX selected";
    }
  });

const sceneSelect = document.querySelector<HTMLSelectElement>("#output-scene");
const rgbVideo = document.querySelector<HTMLVideoElement>("#rgb-video")!;
const depthVideo = document.querySelector<HTMLVideoElement>("#depth-video")!;
let synchronizing = false;

sceneSelect?.addEventListener("change", () => {
  const selected = sceneSelect.selectedOptions[0];
  rgbVideo.pause();
  depthVideo.pause();
  rgbVideo.poster = selected.dataset.image!;
  depthVideo.poster = selected.dataset.depthPoster!;
  for (const [video, path] of [
    [rgbVideo, selected.dataset.video!],
    [depthVideo, selected.dataset.depth!],
  ] as const) {
    video.querySelectorAll("source").forEach((source) => {
      source.src = source.type.startsWith("video/webm")
        ? path.replace(/\.mp4$/, ".webm")
        : path;
    });
    video.load();
  }
});

for (const [source, target] of [
  [rgbVideo, depthVideo],
  [depthVideo, rgbVideo],
]) {
  source.addEventListener("play", () => {
    if (synchronizing) return;
    synchronizing = true;
    target.currentTime = source.currentTime;
    void target
      .play()
      .catch(() => {})
      .finally(() => {
        synchronizing = false;
      });
  });
  source.addEventListener("pause", () => {
    if (!synchronizing) target.pause();
  });
  source.addEventListener("seeked", () => {
    if (Math.abs(target.currentTime - source.currentTime) > 0.15)
      target.currentTime = source.currentTime;
  });
  source.addEventListener("ratechange", () => {
    target.playbackRate = source.playbackRate;
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    rgbVideo.pause();
    depthVideo.pause();
  }
});
