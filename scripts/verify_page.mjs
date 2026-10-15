import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const sourceCases = JSON.parse(
  await readFile("src/data/results.json", "utf8"),
).cases;
const cloudRequests = [];
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (error) => report.errors.push(error.message));
page.on("request", (request) => {
  if (request.url().endsWith(".ply.gz")) cloudRequests.push(request.url());
});
page.on("response", (response) => {
  if (response.status() >= 400)
    report.errors.push(`${response.status()} ${response.url()}`);
});

async function waitFrame(row, frame) {
  await page.waitForFunction(
    ({ caseId, frame }) => {
      const element = document.querySelector(`[data-case="${caseId}"]`);
      return (
        !element.hidden &&
        element.dataset.state === "ready" &&
        element.dataset.frame === String(frame) &&
        [...element.querySelectorAll(".cloud-cell:not([hidden])")].every(
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

async function selectScene(section, row) {
  const caseId = await row.getAttribute("data-case");
  await page.locator(`${section} [data-select-case="${caseId}"]`).click();
  await row.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await waitFrame(row, 0);
  assert.equal(
    await page.locator(`${section} article:not([hidden])`).count(),
    1,
  );
  assert.equal(await row.locator(".cloud-cell:not([hidden])").count(), 2);
  assert.equal(
    await page
      .locator(`${section} [data-select-case="${caseId}"]`)
      .getAttribute("aria-pressed"),
    "true",
  );
  const thumbnail = page.locator(
    `${section} [data-select-case="${caseId}"] img`,
  );
  assert.equal(
    await row.locator(".input-cell img").getAttribute("src"),
    await thumbnail.getAttribute("src"),
  );
  if (section === "#comparisons")
    assert.equal(
      await row.locator(".prompt-cell > p").innerText(),
      sourceCases.find((scene) => scene.id === caseId).prompt,
    );
}

async function selectBaseline(section, row, method, frame = 0) {
  await page.locator(`${section} [data-baseline-select]`).selectOption(method);
  await waitFrame(row, frame);
  assert.deepEqual(
    await row
      .locator(".cloud-cell:not([hidden])")
      .evaluateAll((cells) => cells.map((cell) => cell.dataset.method)),
    [method, "plan4d"],
  );
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
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  assert.equal(await page.title(), "Plan4D: Generative Plannable 4D Worlds");
  assert.equal(await page.locator(".comparison-row").count(), 6);
  assert.equal(await page.locator("#comparisons .cloud-cell").count(), 24);
  assert.equal(await page.locator("#aggregated .cloud-cell").count(), 12);
  assert.equal(await page.locator("#comparisons .scene-choice").count(), 6);
  assert.equal(await page.locator("#aggregated .scene-choice").count(), 3);
  assert.equal(await page.locator("#point-size").inputValue(), "1");
  assert.equal(await page.locator("#aggregate-point-size").inputValue(), "0.5");
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
    await selectScene("#comparisons", row);
    if (row === allRows[0]) {
      const initialRequests = cloudRequests.filter((request) =>
        /\/(gen3r|tesseract|vist3a|plan4d)-P\d/.test(request),
      );
      assert.equal(initialRequests.length, 2);
      assert(
        initialRequests.every((request) =>
          /\/(gen3r|plan4d)-P02_122_161\/0000.ply.gz$/.test(request),
        ),
      );
      report.checks.push(
        "Initial comparison fetches only the selected scene's two methods; input image and prompt match every scene",
      );
    }
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
    for (const method of ["gen3r", "tesseract", "vist3a"]) {
      await selectBaseline("#comparisons", row, method);
      const cell = row.locator(`[data-method="${method}"]`);
      pixels.push(
        await assertPixels(
          cell.locator(".viewer-surface"),
          `${caseId}/${await cell.getAttribute("data-method")}`,
        ),
      );
    }
    pixels.push(
      await assertPixels(
        row.locator(".ours-cell .viewer-surface"),
        `${caseId}/plan4d`,
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
    "Six selectable scenes and all three baselines render as pairs, all 24 clouds nonblank, original VIST3A differs from Plan4D, all first/last frames differ",
  );

  const first = allRows[0];
  await selectScene("#comparisons", first);
  await selectBaseline("#comparisons", first, "gen3r");
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
  await selectBaseline("#comparisons", first, "tesseract", 12);
  await selectBaseline("#comparisons", first, "gen3r", 12);
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
  await page.route(
    "**/aggregated/tesseract-test_cab_e_3rd_00000_00081/*.ply.gz",
    (route) => route.abort("failed"),
    { times: 1 },
  );
  for (const [index, row] of aggregateRows.entries()) {
    await selectScene("#aggregated", row);
    assert.deepEqual(
      await row
        .locator(".cloud-cell")
        .evaluateAll((cells) => cells.map((cell) => cell.dataset.method)),
      ["gen3r", "tesseract", "vist3a", "plan4d"],
    );
    const pixels = [];
    for (const method of ["gen3r", "tesseract", "vist3a", "plan4d"]) {
      if (method !== "plan4d") {
        await page.locator("#aggregate-baseline").selectOption(method);
        if (index === 1 && method === "tesseract") {
          const retry = row.locator('[data-method="tesseract"] .retry-button');
          await retry.waitFor({ state: "visible" });
          await retry.click();
        }
        await waitFrame(row, 0);
      }
      const cell = row.locator(`[data-method="${method}"]`);
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
  await selectScene("#aggregated", aggregateFirst);
  await selectBaseline("#aggregated", aggregateFirst, "gen3r");
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

  assert.equal(
    await page
      .locator("#quantitative, [data-benchmark], .metrics-table")
      .count(),
    0,
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
    "Quantitative tables are absent; citation control works; old RGB/depth comparison is removed",
  );

  await setFrame(first, 0);
  await selectBaseline("#comparisons", first, "vist3a");
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
  const mobileBaselineBounds = await first
    .locator('[data-method="vist3a"]')
    .boundingBox();
  const mobileOursBounds = await first.locator(".ours-cell").boundingBox();
  assert(
    mobileOursBounds.y >= mobileBaselineBounds.y + mobileBaselineBounds.height,
  );
  assert(mobileOursBounds.width >= 350);
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
    "390px mobile layout has two full-width stacked results and no page overflow; expanded Plan4D/VIST3A canvases work",
  );
  await aggregateFirst.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
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
  await selectScene("#comparisons", first);
  await setFrame(first, 0);
  await first.locator(".playback-button").click();
  await page.locator("#comparisons .scene-choice").evaluateAll((buttons) => {
    for (const index of [1, 4, 2, 5, 0, 3]) {
      const button = buttons[index];
      if (button instanceof HTMLButtonElement) button.click();
    }
  });
  const finalRow = allRows[3];
  await waitFrame(finalRow, 0);
  assert.equal(
    await first.locator(".playback-button").getAttribute("aria-pressed"),
    "false",
  );
  await page.locator("#comparison-baseline").evaluate((select) => {
    for (const value of ["tesseract", "gen3r", "vist3a"]) {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await waitFrame(finalRow, 0);
  assert.deepEqual(
    await finalRow
      .locator(".cloud-cell:not([hidden])")
      .evaluateAll((cells) => cells.map((cell) => cell.dataset.method)),
    ["vist3a", "plan4d"],
  );
  report.checks.push(
    "Rapid scene/baseline changes keep the final pair synchronized and stop previous playback",
  );
  await finalRow.locator(".ours-cell .viewer-surface").scrollIntoViewIfNeeded();
  await page.locator("#comparisons .scene-choice").evaluateAll((buttons) => {
    for (const index of [1, 3]) {
      const button = buttons[index];
      if (button instanceof HTMLButtonElement) button.click();
    }
  });
  await waitFrame(finalRow, 0);
  await assertPixels(
    finalRow.locator(".ours-cell .viewer-surface"),
    "rapid return to same scene",
  );
  await page.locator("#aggregate-baseline").evaluate((select) => {
    for (const value of ["vist3a", "tesseract", "gen3r"]) {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await waitFrame(aggregateFirst, 0);
  for (const width of [1920, 1440, 901, 768, 601, 600, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const row of [finalRow, aggregateFirst]) {
      const panels = row.locator(".cloud-cell:not([hidden])");
      const baselineBounds = await panels.nth(0).boundingBox();
      const oursBounds = await panels.nth(1).boundingBox();
      assert(Math.abs(baselineBounds.width - oursBounds.width) < 1);
      if (width > 600) {
        assert(Math.abs(baselineBounds.y - oursBounds.y) < 1);
        assert(oursBounds.x >= baselineBounds.x + baselineBounds.width);
      } else {
        assert(oursBounds.y >= baselineBounds.y + baselineBounds.height);
        assert(Math.abs(baselineBounds.x - oursBounds.x) < 1);
      }
      assert(
        await row.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      );
    }
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await selectScene("#comparisons", first);
  await selectBaseline("#comparisons", first, "gen3r");
  let releaseFrame;
  const delayedFrame = new Promise((resolve) => {
    releaseFrame = resolve;
  });
  await page.route(
    "**/gen3r-P02_122_161/0063.ply.gz",
    async (route) => {
      await delayedFrame;
      await route.continue();
    },
    { times: 1 },
  );
  const requestStarted = page.waitForRequest(
    "**/gen3r-P02_122_161/0063.ply.gz",
  );
  await first.locator(".frame-slider").evaluate((slider) => {
    slider.value = "63";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await requestStarted;
  await selectScene("#comparisons", allRows[1]);
  const requestFinished = page.waitForResponse(
    "**/gen3r-P02_122_161/0063.ply.gz",
  );
  releaseFrame();
  await requestFinished;
  await page.waitForTimeout(200);
  await waitFrame(allRows[1], 0);
  assert.equal(await first.getAttribute("data-frame"), "0");
  await selectScene("#comparisons", first);
  await waitFrame(first, 0);
  await setFrame(first, 80);
  await selectScene("#comparisons", allRows[1]);
  await page.locator("#comparisons").evaluate((section) => {
    section.querySelector("button.scene-choice").click();
    const select = section.querySelector("select[data-baseline-select]");
    select.value = "tesseract";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitFrame(first, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator("#comparisons")
    .evaluate((section) =>
      section.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  await page.screenshot({ path: `${output}/mobile-scene-selector.png` });
  report.checks.push(
    "Late frame responses cannot update a different scene; rapid return renders correctly; equal-size panels fit 320-1920px",
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
