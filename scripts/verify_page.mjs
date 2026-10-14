import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import sharp from "sharp";

const url = process.env.PLAN4D_TEST_URL || "http://127.0.0.1:4321/";
const output = process.env.PLAN4D_TEST_OUTPUT || "artifacts/browser";
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
const report = { url, scenes: [], aggregated: [], checks: [], errors: [] };
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
  assert.equal(await page.locator("#comparisons .cloud-cell").count(), 24);
  assert.equal(await page.locator("#aggregated .cloud-cell").count(), 12);
  assert.equal(
    await page
      .locator("#outputs, #output-scene, #rgb-video, #depth-video")
      .count(),
    0,
  );
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
    assert.match(
      await row.locator('[data-method="vist3a"]').getAttribute("data-sequence"),
      /-wan21-anysplat$/,
    );
    const pixels = [];
    for (const cell of await row.locator(".cloud-cell").all())
      pixels.push(
        await assertPixels(
          cell.locator(".viewer-surface"),
          `${caseId}/${await cell.getAttribute("data-method")}`,
        ),
      );
    assert.notEqual(
      pixels[2].hash,
      pixels[3].hash,
      `${caseId} VIST3A duplicates Plan4D`,
    );
    await setFrame(row, 80);
    const lastFrame = await assertPixels(
      row.locator(".ours-cell .viewer-surface"),
      `${caseId}/last`,
    );
    const lastVist3aFrame = await assertPixels(
      row.locator('[data-method="vist3a"] .viewer-surface'),
      `${caseId}/vist3a-last`,
    );
    assert.notEqual(
      lastVist3aFrame.hash,
      pixels[2].hash,
      `${caseId} VIST3A does not change across time`,
    );
    assert.notEqual(
      lastFrame.hash,
      pixels[3].hash,
      `${caseId} does not change across time`,
    );
    report.scenes.push({ caseId, pixels, lastFrame, lastVist3aFrame });
    await setFrame(row, 0);
  }
  report.checks.push(
    "Six scenes, correct column order, all 24 canvases nonblank, original VIST3A differs from Plan4D, all first/last frames differ",
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

  const aggregateRows = await page.locator(".aggregate-row").all();
  assert.equal(aggregateRows.length, 3);
  assert.deepEqual(
    await page
      .locator(".aggregate-table .comparison-header > div")
      .allTextContents(),
    ["Input text", "Input image", "Aggregated 4D Point Cloud"],
  );
  await page.route(
    "**/aggregated/tesseract-test_cab_e_3rd_00000_00081/*.ply.gz",
    (route) => route.abort("failed"),
    { times: 1 },
  );
  for (const [index, row] of aggregateRows.entries()) {
    await row.evaluate((element) =>
      element.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    if (index === 1) {
      const retry = row.locator('[data-method="tesseract"] .retry-button');
      await retry.waitFor({ state: "visible" });
      await retry.click();
    }
    await waitFrame(row, 0);
    assert.deepEqual(
      await row
        .locator(".cloud-cell")
        .evaluateAll((cells) => cells.map((cell) => cell.dataset.method)),
      ["gen3r", "tesseract", "vist3a", "plan4d"],
    );
    const pixels = [];
    for (const cell of await row.locator(".cloud-cell").all()) {
      assert(Number(await cell.getAttribute("data-points")) > 200000);
      pixels.push(
        await assertPixels(
          cell.locator(".viewer-surface"),
          `${await row.getAttribute("data-case")}/${await cell.getAttribute("data-method")}/aggregated`,
        ),
      );
    }
    assert.equal(new Set(pixels.map((pixel) => pixel.hash)).size, 4);
    report.aggregated.push({
      caseId: await row.getAttribute("data-case"),
      pixels,
    });
    await page.screenshot({ path: `${output}/aggregated-${index + 1}.png` });
  }
  const aggregateFirst = aggregateRows[0];
  await aggregateFirst.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  const aggregateSurface = aggregateFirst.locator(".ours-cell .viewer-surface");
  const aggregateBefore = await assertPixels(
    aggregateSurface,
    "aggregate before orbit",
  );
  const linkedBefore = await assertPixels(
    aggregateFirst.locator('[data-method="gen3r"] .viewer-surface'),
    "linked aggregate before orbit",
  );
  await aggregateSurface.focus();
  await page.keyboard.press("ArrowRight");
  const aggregateAfter = await assertPixels(
    aggregateSurface,
    "aggregate after orbit",
  );
  assert.notEqual(aggregateBefore.hash, aggregateAfter.hash);
  assert.notEqual(
    linkedBefore.hash,
    (
      await assertPixels(
        aggregateFirst.locator('[data-method="gen3r"] .viewer-surface'),
        "linked aggregate after orbit",
      )
    ).hash,
  );
  await page.locator("#aggregate-sync-views").uncheck();
  const unlinkedBefore = await assertPixels(
    aggregateFirst.locator('[data-method="gen3r"] .viewer-surface'),
    "unlinked aggregate",
  );
  await aggregateSurface.focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(
    unlinkedBefore.hash,
    (
      await assertPixels(
        aggregateFirst.locator('[data-method="gen3r"] .viewer-surface'),
        "unlinked aggregate unchanged",
      )
    ).hash,
  );
  await page.locator("#aggregate-sync-views").check();
  await aggregateFirst.locator(".ours-cell .expand-view").click();
  assert(await page.locator(".dialog-slider").isHidden());
  assert(await page.locator(".dialog-play").isHidden());
  assert(await page.locator(".dialog-reset").isVisible());
  await assertPixels(
    page.locator(".dialog-surface"),
    "expanded aggregated desktop",
  );
  await page.screenshot({ path: `${output}/aggregated-expanded.png` });
  await page.locator(".dialog-reset").click();
  await page.keyboard.press("Escape");
  await first.locator(".ours-cell .expand-view").click();
  assert(await page.locator(".dialog-slider").isVisible());
  await page.keyboard.press("Escape");
  report.checks.push(
    "All 12 aggregated clouds render, TesserAct test_cab retries, linked/unlinked orbit works, aggregate modal hides only playback controls, frame modal still works",
  );

  for (const tab of await page.locator("[data-benchmark]").all()) {
    await tab.click();
    assert.equal(await tab.getAttribute("aria-selected"), "true");
    assert.equal(
      await page.locator(".benchmark-panel:not([hidden])").count(),
      1,
    );
  }
  await page.locator("#copy-citation").click();
  await page.waitForFunction(() =>
    /Copied|selected/.test(document.getElementById("copy-status").textContent),
  );
  assert.match(
    await page.locator("#copy-status").innerText(),
    /Copied|selected/,
  );
  report.checks.push(
    "Benchmark tabs and citation control work; old RGB/depth comparison is removed",
  );

  await setFrame(first, 0);
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
  await page.locator("#comparisons .comparison-scroll").evaluate((element) => {
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
  const vist3aCell = first.locator('[data-method="vist3a"]');
  await assertPixels(vist3aCell.locator(".viewer-surface"), "mobile VIST3A");
  await vist3aCell.locator(".expand-view").click();
  await page.waitForTimeout(100);
  await assertPixels(page.locator(".dialog-surface"), "expanded mobile VIST3A");
  await page.screenshot({ path: `${output}/mobile-vist3a-expanded.png` });
  await page.locator(".dialog-close").click();
  report.checks.push(
    "390px mobile layout has no page overflow; horizontal comparison and expanded Plan4D/VIST3A canvases work",
  );
  await aggregateFirst.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await page.locator("#aggregated .comparison-scroll").evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await page.waitForTimeout(100);
  await assertPixels(aggregateSurface, "mobile aggregated Plan4D");
  await page.screenshot({ path: `${output}/aggregated-mobile.png` });
  await aggregateFirst.locator(".ours-cell .expand-view").click();
  await assertPixels(
    page.locator(".dialog-surface"),
    "expanded aggregated mobile",
  );
  await page.screenshot({ path: `${output}/aggregated-mobile-expanded.png` });
  const aggregateDialogBounds = await page
    .locator("#cloud-dialog")
    .boundingBox();
  assert(
    aggregateDialogBounds.width <= 390 && aggregateDialogBounds.height <= 844,
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 740 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  );
  report.checks.push(
    "Aggregated mobile viewer and modal render; 320px page has no overflow",
  );
  assert.deepEqual(report.errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        scenes: report.scenes.length,
        aggregated: report.aggregated.length,
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
