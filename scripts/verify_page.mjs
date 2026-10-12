import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import sharp from "sharp";

const url = process.env.PLAN4D_TEST_URL || "http://127.0.0.1:4321/";
const output = "artifacts/browser";
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
const report = { url, scenes: [], checks: [], errors: [] };
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (error) => report.errors.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 400)
    report.errors.push(`${response.status()} ${response.url()}`);
});

async function waitFrame(row, frame) {
  await page.waitForFunction(
    ({ caseId, frame }) => {
      const element = document.querySelector(`[data-case="${caseId}"]`);
      return (
        element.dataset.frame === String(frame) &&
        [...element.querySelectorAll(".cloud-cell")].every(
          (cell) =>
            cell.dataset.frame === String(frame) &&
            cell.dataset.state === "ready",
        )
      );
    },
    { caseId: await row.getAttribute("data-case"), frame },
    { timeout: 45000 },
  );
  await page.waitForTimeout(80);
}

async function setFrame(row, frame) {
  await row.locator(".frame-slider").evaluate((slider, value) => {
    slider.value = String(value);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }, frame);
  await waitFrame(row, frame);
}

async function assertPixels(surface, label) {
  const screenshot = await surface.screenshot();
  const { data, info } = await sharp(screenshot)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let coloredPixels = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    if (
      Math.max(red, green, blue) - Math.min(red, green, blue) > 24 &&
      Math.min(red, green, blue) < 200
    )
      coloredPixels++;
  }
  assert(
    coloredPixels > 180,
    `${label} is blank or poorly framed (${coloredPixels} colored pixels)`,
  );
  return {
    label,
    coloredPixels,
    hash: createHash("sha256").update(screenshot).digest("hex"),
  };
}

try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  assert.equal(await page.title(), "Plan4D: Generative Plannable 4D Worlds");
  assert.equal(await page.locator(".comparison-row").count(), 6);
  assert.equal(await page.locator(".cloud-cell").count(), 24);
  assert(!/epic/i.test(await page.locator("#comparisons").innerText()));
  assert.equal(await page.locator('[data-case="P28_101_119"]').count(), 0);
  const images = await page
    .locator("img")
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.complete && !element.naturalWidth)
        .map((element) => element.src),
    );
  assert.deepEqual(images, []);
  await page.screenshot({ path: `${output}/desktop-overview.png` });

  const allRows = await page.locator(".comparison-row").all();
  for (const row of allRows) {
    await row.evaluate((element) =>
      element.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    await waitFrame(row, 0);
    const caseId = await row.getAttribute("data-case");
    const methods = await row
      .locator(".cloud-cell")
      .evaluateAll((cells) => cells.map((cell) => cell.dataset.method));
    assert.deepEqual(methods, ["gen3r", "tesseract", "vist3a", "plan4d"]);
    const pixels = [];
    for (const cell of await row.locator(".cloud-cell").all())
      pixels.push(
        await assertPixels(
          cell.locator(".viewer-surface"),
          `${caseId}/${await cell.getAttribute("data-method")}`,
        ),
      );
    await setFrame(row, 80);
    const lastFrame = await assertPixels(
      row.locator(".ours-cell .viewer-surface"),
      `${caseId}/last`,
    );
    assert.notEqual(
      lastFrame.hash,
      pixels[3].hash,
      `${caseId} does not change across time`,
    );
    report.scenes.push({ caseId, pixels, lastFrame });
    await setFrame(row, 0);
  }
  report.checks.push(
    "Six scenes, correct column order, all 24 canvases nonblank, all first/last frames differ",
  );

  const first = allRows[0];
  await first.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await page
    .locator("#comparisons")
    .evaluate((element) =>
      window.scrollTo({ top: element.offsetTop - 64, behavior: "instant" }),
    );
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${output}/desktop-comparisons.png` });
  const surface = first.locator(".ours-cell .viewer-surface");
  const beforeOrbit = await assertPixels(surface, "before orbit");
  const bounds = await surface.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 60,
    bounds.y + bounds.height / 2 + 20,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForTimeout(100);
  const afterOrbit = await assertPixels(surface, "after orbit");
  assert.notEqual(beforeOrbit.hash, afterOrbit.hash);
  await first.locator(".ours-cell .reset-view").click();

  await first.locator(".playback-button").click();
  await page.waitForFunction(
    () => Number(document.querySelector(".comparison-row").dataset.frame) > 2,
    {},
    { timeout: 30000 },
  );
  await first.locator(".playback-button").click();
  assert.equal(
    await first.locator(".playback-button").getAttribute("aria-pressed"),
    "false",
  );
  await first.locator(".frame-slider").evaluate((slider) => {
    for (const frame of [40, 20, 79, 12]) {
      slider.value = String(frame);
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await waitFrame(first, 12);
  report.checks.push(
    "Orbit changes pixels; playback advances; pause and rapid seek work",
  );

  await page.route(
    "**/gen3r-P02_122_161/0057.ply.gz",
    (route) => route.abort("failed"),
    { times: 1 },
  );
  await first.locator(".frame-slider").evaluate((slider) => {
    slider.value = "57";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await first
    .locator('.cloud-cell[data-state="error"] .retry-button')
    .waitFor({ state: "visible" });
  await first.locator('.cloud-cell[data-state="error"] .retry-button').click();
  await waitFrame(first, 57);
  report.checks.push(
    "A failed PLY request exposes a retry and recovers without desynchronizing methods",
  );

  await first.locator(".ours-cell .expand-view").click();
  assert.equal(
    await page.locator("#cloud-dialog").evaluate((element) => element.open),
    true,
  );
  await page.waitForTimeout(100);
  await assertPixels(page.locator(".dialog-surface"), "expanded desktop");
  await page.locator(".dialog-slider").evaluate((slider) => {
    slider.value = "30";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await waitFrame(first, 30);
  await page.screenshot({ path: `${output}/desktop-expanded.png` });
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator("#cloud-dialog").evaluate((element) => element.open),
    false,
  );
  report.checks.push("Expanded viewer renders, seeks, and closes with Escape");

  for (const tab of await page.locator("[data-benchmark]").all()) {
    await tab.click();
    assert.equal(await tab.getAttribute("aria-selected"), "true");
    assert.equal(
      await page.locator(".benchmark-panel:not([hidden])").count(),
      1,
    );
  }
  await page.locator("#output-scene").selectOption("P25_104_94");
  assert(
    (
      await page.locator("#rgb-video source").first().getAttribute("src")
    ).includes("P25_104_94"),
  );
  assert(
    (
      await page.locator("#depth-video source").first().getAttribute("src")
    ).includes("P25_104_94"),
  );
  await page.locator("#copy-citation").click();
  await page.waitForFunction(() =>
    /Copied|selected/.test(document.getElementById("copy-status").textContent),
  );
  assert.match(
    await page.locator("#copy-status").innerText(),
    /Copied|selected/,
  );
  report.checks.push(
    "Benchmark tabs, video scene selection, and citation control work",
  );
  await page.locator("#rgb-video").evaluate((video) => video.play());
  await page.waitForFunction(
    () =>
      ["rgb-video", "depth-video"].every(
        (id) => document.getElementById(id).currentTime > 0.25,
      ),
    {},
    { timeout: 30000 },
  );
  const videoTimes = await page.evaluate(() => [
    document.getElementById("rgb-video").currentTime,
    document.getElementById("depth-video").currentTime,
  ]);
  assert(Math.abs(videoTimes[0] - videoTimes[1]) < 0.3);
  await page.locator("#rgb-video").evaluate((video) => {
    if (video instanceof HTMLVideoElement) video.pause();
  });
  await page.waitForFunction(() =>
    ["rgb-video", "depth-video"].every(
      (id) => document.getElementById(id).paused,
    ),
  );
  report.checks.push(
    "RGB and depth videos decode, play in sync, and pause together",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(150);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  );
  await page.screenshot({ path: `${output}/mobile-overview.png` });
  await first.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await page.locator(".comparison-scroll").evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await page.waitForTimeout(100);
  await assertPixels(
    first.locator(".ours-cell .viewer-surface"),
    "mobile Plan4D",
  );
  await page.screenshot({ path: `${output}/mobile-comparison.png` });
  await first.locator(".ours-cell .expand-view").click();
  await page.waitForTimeout(100);
  await assertPixels(page.locator(".dialog-surface"), "expanded mobile");
  await page.screenshot({ path: `${output}/mobile-expanded.png` });
  const dialogBounds = await page.locator("#cloud-dialog").boundingBox();
  assert(dialogBounds.width <= 390 && dialogBounds.height <= 844);
  await page.locator(".dialog-close").click();
  report.checks.push(
    "390px mobile layout has no page overflow; horizontal comparison and expanded canvas work",
  );
  assert.deepEqual(report.errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        scenes: report.scenes.length,
        checks: report.checks,
        errors: report.errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
