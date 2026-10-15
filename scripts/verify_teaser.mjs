import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.env.PLAN4D_TEST_URL || "http://127.0.0.1:4323/";
const output =
  process.env.PLAN4D_TEST_OUTPUT || "artifacts/teaser-20261015/browser";
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
const report = { url, checks: [], viewports: [], errors: [] };

async function ready(page) {
  await page.waitForFunction(
    () => {
      const video = document.querySelector("#teaser-video");
      return video.readyState >= 2 && video.duration > 50;
    },
    null,
    { timeout: 60000 },
  );
}

async function pixels(page, time) {
  return page.locator("#teaser-video").evaluate(async (video, time) => {
    video.pause();
    const sought = new Promise((resolve) =>
      video.addEventListener("seeked", resolve, { once: true }),
    );
    video.currentTime = time;
    await sought;
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, 320, 180);
    const data = context.getImageData(0, 0, 320, 180).data;
    let colored = 0;
    let checksum = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      const channels = [data[offset], data[offset + 1], data[offset + 2]];
      if (Math.max(...channels) - Math.min(...channels) > 24) colored++;
      checksum = (checksum + data[offset] * (offset + 1)) % 1000000007;
    }
    return { colored, checksum, currentTime: video.currentTime };
  }, time);
}

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      report.errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await ready(page);
  const video = page.locator("#teaser-video");
  await video.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () =>
      !document.querySelector("#teaser-video").paused &&
      document.querySelector("#teaser-video").currentTime > 0.3,
  );
  report.checks.push("Visible teaser autoplays muted");
  const metadata = await video.evaluate((element) => ({
    duration: element.duration,
    width: element.videoWidth,
    height: element.videoHeight,
    muted: element.muted,
    loop: element.loop,
    controls: element.controls,
    source: element.currentSrc,
  }));
  assert.equal(metadata.duration, 54);
  assert.equal(metadata.width, 1280);
  assert.equal(metadata.height, 720);
  assert(metadata.muted && metadata.loop && metadata.controls);
  report.metadata = metadata;
  for (const [start, end] of [
    [1.2, 4.2],
    [22.5, 25.2],
    [33.4, 36.2],
  ]) {
    const first = await pixels(page, start);
    const second = await pixels(page, end);
    assert(first.colored > 1000 && second.colored > 1000);
    assert.notEqual(first.checksum, second.checksum);
  }
  report.checks.push(
    "Decoded RGB, animated PLY and aggregate shots contain changing colored pixels",
  );
  await video.evaluate((element) => element.play());
  await page.locator("#citation").scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => document.querySelector("#teaser-video").paused,
  );
  await video.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => !document.querySelector("#teaser-video").paused,
  );
  report.checks.push("Offscreen pause and visible resume");
  await video.evaluate((element) => {
    if (element instanceof HTMLVideoElement) element.pause();
  });
  await page.waitForTimeout(100);
  await page.locator("#citation").scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await video.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  assert(await video.evaluate((element) => element.paused));
  report.checks.push("Manual pause preserved after scrolling");
  for (const [width, height] of [
    [1920, 1080],
    [1440, 1000],
    [768, 1024],
    [390, 844],
    [320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    await pixels(page, 2.6);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    const layout = await video.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
      };
    });
    assert(layout.left >= 0 && layout.right <= width + 1);
    assert(layout.scrollWidth <= width + 1);
    assert(Math.abs(layout.width / layout.height - 16 / 9) < 0.01);
    assert(
      layout.top < height,
      `Teaser must begin in first viewport at ${width}`,
    );
    await page.screenshot({ path: `${output}/${width}x${height}.png` });
    report.viewports.push({
      viewportWidth: width,
      viewportHeight: height,
      ...layout,
    });
  }
  const reduced = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await reduced.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await ready(reduced);
  assert(
    await reduced
      .locator("#teaser-video")
      .evaluate((element) => element.paused && element.currentTime === 0),
  );
  await reduced.locator("#teaser-video").evaluate((element) => element.play());
  await reduced.waitForFunction(
    () => document.querySelector("#teaser-video").currentTime > 0.2,
  );
  report.checks.push(
    "Reduced-motion preference prevents autoplay; manual playback works",
  );
  assert.equal(report.errors.length, 0, report.errors.join("\n"));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
