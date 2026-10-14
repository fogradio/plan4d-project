import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import sharp from "sharp";

const url = process.env.PLAN4D_TEST_URL || "http://127.0.0.1:4322/";
const output = process.env.PLAN4D_TEST_OUTPUT || "artifacts/gallery-browser";
const manifest = JSON.parse(await readFile("src/data/gallery.json", "utf8"));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-dev-shm-usage",
  ],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1080 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 400)
    errors.push(`${response.status()} ${response.url()}`);
});
const report = { cases: [], checks: [], errors };
const surface = page.locator("#gallery-cloud");
const video = page.locator("#gallery-video");

async function waitReady(sceneId, mode, frame) {
  await page.waitForFunction(
    ({ sceneId, mode, frame }) => {
      const element = document.querySelector(".gallery-output");
      return (
        element.dataset.case === sceneId &&
        element.dataset.mode === String(mode) &&
        element.dataset.state === "ready" &&
        (frame === undefined || element.dataset.frame === String(frame))
      );
    },
    { sceneId, mode, frame },
    { timeout: 60000 },
  );
}

async function pixels(element, label, colored = true) {
  const screenshot = await element.screenshot();
  const { data, info } = await sharp(screenshot)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const channels = [data[offset], data[offset + 1], data[offset + 2]];
    if (
      colored
        ? Math.max(...channels) - Math.min(...channels) > 24 &&
          Math.min(...channels) < 200
        : Math.max(...channels) > 40 && Math.min(...channels) < 220
    )
      count++;
  }
  assert(count > 300, `${label}: blank media (${count} pixels)`);
  return {
    label,
    pixels: count,
    hash: createHash("sha256").update(screenshot).digest("hex"),
  };
}

async function chooseMode(mode, sceneId) {
  await page.locator(`.gallery-mode[data-mode="${mode}"]`).click();
  await waitReady(sceneId, mode);
  assert.equal(await page.locator(".gallery-output").count(), 1);
  assert.equal(
    await page
      .locator("#gallery-cloud:visible, #gallery-video:visible")
      .count(),
    1,
  );
  assert.equal(
    await page
      .locator(`.gallery-mode[data-mode="${mode}"]`)
      .getAttribute("aria-pressed"),
    "true",
  );
}

try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  assert.equal(await page.locator("#gallery-case option").count(), 17);
  assert.deepEqual(
    await page.locator("#gallery-case option").allTextContents(),
    manifest.cases.map((scene) => scene.label),
  );
  assert(manifest.cases.every((scene) => !scene.label.includes(scene.id)));
  assert.equal(await page.locator(".gallery-output").count(), 1);
  assert.equal(await page.locator("#outputs, #output-scene").count(), 0);
  await page
    .locator("#gallery")
    .evaluate((element) =>
      element.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  await waitReady(manifest.cases[0].id, 0, 0);
  await page.screenshot({ path: `${output}/desktop.png` });
  for (const [index, scene] of manifest.cases.entries()) {
    await page.locator("#gallery-case").selectOption(scene.id);
    await chooseMode(0, scene.id);
    assert.equal(
      await page.locator("#gallery-prompt").textContent(),
      scene.prompt,
    );
    assert(
      (await page.locator("#gallery-image").getAttribute("src")).endsWith(
        scene.image,
      ),
    );
    const first = await pixels(surface, `${index + 1}/frame0`);
    await page.locator("#gallery-frame").evaluate((slider) => {
      slider.value = "80";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitReady(scene.id, 0, 80);
    const last = await pixels(surface, `${index + 1}/frame80`);
    assert.notEqual(first.hash, last.hash);
    await page.locator("#gallery-frame").evaluate((slider) => {
      slider.value = "0";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitReady(scene.id, 0, 0);
    const media = [];
    for (const mode of [1, 2, 3, 4]) {
      await chooseMode(mode, scene.id);
      if (mode === 3) {
        assert(await page.locator(".gallery-timeline").isHidden());
        assert(await video.evaluate((element) => element.paused));
        assert(
          Number(
            await page.locator(".gallery-output").getAttribute("data-points"),
          ) > 200000,
        );
        media.push(await pixels(surface, `${index + 1}/aggregate`));
      } else {
        const kind = mode === 1 ? "rgb" : mode === 2 ? "depth" : "flow";
        assert(
          (await video.getAttribute("src")).includes(
            `/gallery/${scene.id}/${kind}.`,
          ),
        );
        await video.evaluate((element) => {
          element.currentTime = 0;
          return element.play();
        });
        await page.waitForFunction(
          () => document.querySelector("#gallery-video").currentTime > 0.18,
          null,
          { timeout: 15000 },
        );
        await video.evaluate((element) => {
          if (element instanceof HTMLVideoElement) element.pause();
        });
        media.push(await pixels(video, `${index + 1}/${kind}`, false));
        if (mode === 4)
          assert(
            scene.videos.flow.source.endsWith(
              `${scene.id}/notch14_pointcloud_trails/pred_scene_flow_raw_notch14_pointcloud_trails_vis.mp4`,
            ),
          );
      }
      if (index === 0)
        await page.screenshot({ path: `${output}/mode-${mode}.png` });
    }
    report.cases.push({ id: scene.id, first, last, media });
    console.log(`Verified ${index + 1}/17: ${scene.id}, all five modalities`);
  }
  const firstScene = manifest.cases[0];
  await page.locator("#gallery-case").selectOption(firstScene.id);
  await chooseMode(0, firstScene.id);
  const before = await pixels(surface, "before orbit");
  const bounds = await surface.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 75,
    bounds.y + bounds.height / 2 + 20,
    { steps: 8 },
  );
  await page.mouse.up();
  assert.notEqual(before.hash, (await pixels(surface, "after orbit")).hash);
  await page.locator(".gallery-reset").click();
  await page.locator(".gallery-play").click();
  await page.waitForFunction(
    () => Number(document.querySelector(".gallery-output").dataset.frame) > 2,
  );
  await page.locator(".gallery-play").click();
  assert.equal(
    await page.locator(".gallery-play").getAttribute("aria-pressed"),
    "false",
  );
  await page.route(
    "**/gallery/*/frames/0057.ply.gz",
    (route) => route.abort("failed"),
    { times: 1 },
  );
  await page.locator("#gallery-frame").evaluate((slider) => {
    slider.value = "57";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator(".gallery-retry").waitFor({ state: "visible" });
  await page.locator(".gallery-retry").click();
  await waitReady(firstScene.id, 0, 57);
  report.checks.push(
    "All 17 cases x 5 modalities render, 51 videos decode/play, first/last PLY frames differ, orbit/play/pause and failed-frame retry work",
  );

  for (const scene of manifest.cases.slice(0, 6))
    await page.locator("#gallery-case").selectOption(scene.id);
  for (const mode of [1, 3, 4, 2, 0])
    await page.locator(`.gallery-mode[data-mode="${mode}"]`).click();
  await waitReady(manifest.cases[5].id, 0, 0);
  assert.equal(
    await page.locator("#gallery-prompt").textContent(),
    manifest.cases[5].prompt,
  );
  assert(await video.evaluate((element) => element.paused));
  await page.locator(".gallery-previous").click();
  await waitReady(manifest.cases[5].id, 4);
  await page.locator(".gallery-next").click();
  await waitReady(manifest.cases[5].id, 0);
  await page.locator(".gallery-mode-bar").focus();
  await page.keyboard.press("ArrowRight");
  await waitReady(manifest.cases[5].id, 1);
  await page.locator(".gallery-expand").click();
  assert(
    await page.locator("#gallery-dialog").evaluate((element) => element.open),
  );
  await video.evaluate((element) => element.play());
  await page.waitForTimeout(250);
  await pixels(video, "expanded RGB", false);
  await chooseMode(3, manifest.cases[5].id);
  await pixels(surface, "expanded aggregate");
  await page.keyboard.press("Escape");
  assert(
    !(await page
      .locator("#gallery-dialog")
      .evaluate((element) => element.open)),
  );
  assert.equal(await page.locator(".gallery-output").count(), 1);
  report.checks.push(
    "Rapid scene/modality switches stay on the latest selection, arrows wrap in order, keyboard navigation and the single expanded output work",
  );

  const pipette = manifest.cases.find((scene) =>
    scene.id.startsWith("Phu_HyoQWVU-"),
  );
  await page.locator("#gallery-case").selectOption(pipette.id);
  await chooseMode(0, pipette.id);
  assert.equal(
    await page.locator("#gallery-prompt").textContent(),
    "Hold the small glass dish. Dispense pink liquid using a pipette. Release the liquid smoothly. Fill the dish gradually.",
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page
      .locator("#gallery")
      .evaluate((element) =>
        element.scrollIntoView({ block: "start", behavior: "instant" }),
      );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    );
    assert(
      await page.locator("#gallery-case").evaluate((select) => {
        const style = getComputedStyle(select);
        const context = document.createElement("canvas").getContext("2d");
        context.font = style.font;
        const available =
          select.clientWidth -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight);
        return Array.from(select.options).every(
          (option) => context.measureText(option.text).width <= available,
        );
      }),
      `Gallery option labels fit at ${width}px`,
    );
    await pixels(surface, `mobile ${width}px`);
    await page.screenshot({ path: `${output}/mobile-${width}.png` });
  }
  await page.locator(".gallery-expand").click();
  await pixels(surface, "expanded mobile");
  const dialogBounds = await page.locator("#gallery-dialog").boundingBox();
  assert(dialogBounds.width <= 320 && dialogBounds.height <= 844);
  await page.screenshot({ path: `${output}/mobile-expanded.png` });
  await chooseMode(4, pipette.id);
  await video.evaluate((element) => {
    element.currentTime = 0;
    return element.play();
  });
  await page.waitForFunction(
    () => document.querySelector("#gallery-video").currentTime > 0.18,
  );
  await pixels(video, "mobile scene flow", false);
  await page.locator(".gallery-close").click();
  await page.waitForFunction(
    () => document.querySelector("#gallery-video").paused,
  );
  await chooseMode(1, pipette.id);
  await video.evaluate((element) => element.play());
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForFunction(
    () => document.querySelector("#gallery-video").paused,
  );
  report.checks.push(
    "Pipette prompt matches exactly; mobile 390px/320px and expanded output render without overflow; leaving the Gallery pauses video",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      { cases: report.cases.length, checks: report.checks, errors },
      null,
      2,
    ),
  );
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
