import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";

const url = process.env.PLAN4D_TEST_URL || "http://127.0.0.1:4327/";
const output =
  process.env.PLAN4D_TEST_OUTPUT || "artifacts/comparison-refinement/layout";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-dev-shm-usage",
  ],
});
const report = { checks: [], viewports: [], errors: [] };
const imageRequests = [];
const cloudRequests = [];
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  reducedMotion: "reduce",
});
page.on("pageerror", (error) => report.errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") report.errors.push(message.text());
});
page.on("request", (request) => {
  if (request.url().includes("/conditions/")) imageRequests.push(request.url());
  if (/\.ply(?:\.gz)?$/.test(request.url())) cloudRequests.push(request.url());
});
page.on("requestfailed", (request) => {
  if (request.failure()?.errorText !== "net::ERR_ABORTED")
    report.errors.push(`${request.failure()?.errorText} ${request.url()}`);
});
page.on("response", (response) => {
  if (response.status() >= 400)
    report.errors.push(`${response.status()} ${response.url()}`);
});
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function ready(row, frame) {
  await row.page().waitForFunction(
    ({ id, frame }) => {
      const element = document.getElementById(id);
      return (
        element.dataset.state === "ready" &&
        (frame === undefined || element.dataset.frame === String(frame))
      );
    },
    { id: await row.getAttribute("id"), frame },
  );
}

async function zoom(targetPage, section, mobile = false) {
  const row = targetPage.locator(`${section} article:not([hidden])`);
  const button = row.locator("[data-condition-image]");
  await button.scrollIntoViewIfNeeded();
  const expected = await button.getAttribute("data-full-image");
  const prompt = await row.locator(".prompt-cell > p").innerText();
  const frame = await row.getAttribute("data-frame");
  const requestedBefore = new Set(imageRequests);
  await button.click();
  const dialog = targetPage.locator("#condition-dialog");
  assert(await dialog.evaluate((element) => element.open));
  assert(await dialog.locator(".condition-dialog-actions").isHidden());
  await targetPage.waitForFunction(
    () => document.querySelector("#condition-dialog-image").naturalWidth > 0,
  );
  assert((await dialog.locator("img").getAttribute("src")).endsWith(expected));
  assert(
    await dialog.locator("img").evaluate((image) => image.naturalWidth >= 832),
  );
  assert.equal(await dialog.locator("p").innerText(), prompt);
  if (!mobile)
    assert(
      imageRequests
        .filter((source) => !requestedBefore.has(source))
        .every((source) => source === new URL(expected, url).href),
      "Opening one image loaded other high-resolution assets",
    );
  assert.equal(
    await dialog
      .locator("img")
      .evaluate((image) => getComputedStyle(image).objectFit),
    "contain",
  );
  await targetPage.screenshot({
    path: `${output}/${section.slice(1)}-image-${mobile ? "mobile" : "desktop"}.png`,
  });
  await targetPage.keyboard.press("Tab");
  assert(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  );
  await targetPage.keyboard.press("Escape");
  assert(!(await dialog.evaluate((element) => element.open)));
  assert(
    await button.evaluate((element) => document.activeElement === element),
  );
  await button.click();
  await dialog.locator("[data-condition-close]").click();
  assert(!(await dialog.evaluate((element) => element.open)));
  await button.click();
  await targetPage.mouse.click(2, 2);
  assert(!(await dialog.evaluate((element) => element.open)));
  assert.equal(await row.getAttribute("data-frame"), frame);
  report.checks.push(
    `${section}: original image/prompt, focus trap/return, Escape/button/backdrop close, frame retained (${mobile ? "mobile" : "desktop"})`,
  );
}

async function selectionState(targetPage) {
  return targetPage
    .locator("[data-pairwise-comparison]")
    .evaluateAll((sections) =>
      sections.map((section) => ({
        selected: section.querySelector(
          '[data-select-case][aria-pressed="true"]',
        ).dataset.selectCase,
        active: section.querySelector("article:not([hidden])").id,
        frame: section.querySelector("article:not([hidden])").dataset.frame,
        baseline: section.querySelector("[data-baseline-select]").value,
        linked: section.querySelector(".check-control input").checked,
        pointSize: section.querySelector(".point-control input").value,
        canvases: document.querySelectorAll(".point-cloud-canvas").length,
      })),
    );
}

async function previewContent(targetPage, section, index) {
  const button = targetPage
    .locator(`${section} [data-preview-case]`)
    .nth(index);
  const expectedImage =
    (await button.getAttribute("data-full-image")) ||
    (await button.getAttribute("data-image"));
  const expectedPrompt = await button.getAttribute("data-prompt");
  const dialog = targetPage.locator("#condition-dialog");
  await targetPage.waitForFunction(
    () =>
      document.querySelector(".condition-image-stage").dataset.imageState ===
      "ready",
  );
  assert.equal(await dialog.locator("img").getAttribute("src"), expectedImage);
  assert.equal(
    await dialog.locator("#condition-dialog-prompt").innerText(),
    expectedPrompt,
  );
  assert.equal(
    await dialog.locator("h3").innerText(),
    `Scene ${String(index + 1).padStart(2, "0")} / 06 - Input Preview`,
  );
  assert(
    await dialog
      .locator("img")
      .evaluate(
        (image) =>
          image.complete &&
          image.naturalWidth > 0 &&
          getComputedStyle(image).objectFit === "contain",
      ),
  );
  assert(await dialog.locator(".condition-dialog-actions").isVisible());
  if (await button.getAttribute("data-full-image"))
    assert(
      await dialog
        .locator("img")
        .evaluate((image) => image.naturalWidth >= 832),
    );
}

async function previewDuringPlayback() {
  const row = page.locator("#comparisons article:not([hidden])");
  await row.scrollIntoViewIfNeeded();
  await ready(row);
  const selected = await row.getAttribute("data-case");
  const baseline = await page
    .locator("#comparisons [data-baseline-select]")
    .inputValue();
  await row.locator(".playback-button").click();
  await page.locator("#comparisons [data-preview-case]").first().click();
  await previewContent(page, "#comparisons", 0);
  const frame = await row.getAttribute("data-frame");
  await page.keyboard.press("ArrowRight");
  await previewContent(page, "#comparisons", 1);
  await page.waitForFunction((previousFrame) => {
    const element = document.querySelector(
      "#comparisons article:not([hidden])",
    );
    return (
      element.dataset.frame !== previousFrame &&
      element.querySelector(".playback-button").getAttribute("aria-pressed") ===
        "true"
    );
  }, frame);
  await page.keyboard.press("Escape");
  await row.locator(".playback-button").click();
  await ready(row);
  assert.equal(await row.getAttribute("data-case"), selected);
  assert.equal(
    await page.locator("#comparisons [data-baseline-select]").inputValue(),
    baseline,
  );
  report.checks.push(
    "Preview browsing preserves ongoing playback, scene and baseline",
  );
}

async function previewCandidates(targetPage, section, mobile = false) {
  const buttons = targetPage.locator(`${section} [data-preview-case]`);
  const choices = targetPage.locator(`${section} [data-select-case]`);
  const dialog = targetPage.locator("#condition-dialog");
  assert.equal(await buttons.count(), 6);
  assert.equal(await choices.count(), 6);
  assert.equal(await targetPage.locator(`${section} button button`).count(), 0);
  const originalRow = targetPage.locator(`${section} article:not([hidden])`);
  await originalRow.scrollIntoViewIfNeeded();
  await ready(originalRow);
  const originalSurface = originalRow.locator(".ours-cell .viewer-surface");
  async function cameraSnapshot() {
    await originalSurface.evaluate((element) =>
      element.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    await targetPage.waitForTimeout(150);
    return hash(await originalSurface.screenshot());
  }
  const cameraBefore = await cameraSnapshot();
  await buttons.first().scrollIntoViewIfNeeded();
  const before = await selectionState(targetPage);
  const requestsBefore = cloudRequests.length;
  for (let index = 0; index < 6; index++) {
    await buttons.nth(index).click();
    await previewContent(targetPage, section, index);
    assert.deepEqual(await selectionState(targetPage), before);
    await dialog.locator("[data-condition-close]").click();
    await targetPage.waitForFunction(
      () => !document.querySelector("#condition-dialog").open,
    );
    assert(
      await buttons
        .nth(index)
        .evaluate((button) => document.activeElement === button),
    );
  }
  await buttons.first().focus();
  await targetPage.keyboard.press("Enter");
  await previewContent(targetPage, section, 0);
  const focusOrder = [
    "[data-condition-previous]",
    "[data-condition-next]",
    "[data-condition-select]",
    "[data-condition-close]",
  ];
  for (const selector of focusOrder) {
    await targetPage.keyboard.press("Tab");
    assert(
      await dialog
        .locator(selector)
        .evaluate((button) => document.activeElement === button),
      `Tab did not reach ${selector}`,
    );
  }
  await targetPage.keyboard.press("Shift+Tab");
  assert(
    await dialog
      .locator("[data-condition-select]")
      .evaluate((button) => document.activeElement === button),
  );
  await targetPage.keyboard.press("ArrowLeft");
  await previewContent(targetPage, section, 5);
  await dialog.locator("[data-condition-next]").click();
  await previewContent(targetPage, section, 0);
  await dialog.locator("[data-condition-previous]").click();
  await previewContent(targetPage, section, 5);
  await targetPage.keyboard.press("ArrowRight");
  await targetPage.keyboard.press("ArrowRight");
  await previewContent(targetPage, section, 1);
  assert.deepEqual(await selectionState(targetPage), before);
  if (!mobile)
    assert.equal(
      cloudRequests.length,
      requestsBefore,
      "Preview loaded point clouds",
    );
  await targetPage.screenshot({
    path: `${output}/${section.slice(1)}-candidate-${mobile ? "mobile" : "desktop"}.png`,
  });
  await targetPage.keyboard.press("Escape");
  assert(
    await buttons
      .first()
      .evaluate((button) => document.activeElement === button),
  );
  assert.equal(await cameraSnapshot(), cameraBefore, "Preview moved camera");

  const selectedIndex = await choices.evaluateAll((elements) =>
    elements.findIndex(
      (button) => button.getAttribute("aria-pressed") === "true",
    ),
  );
  await buttons.nth(selectedIndex).click();
  await dialog.locator("[data-condition-select]").click();
  assert.deepEqual(
    await selectionState(targetPage),
    before,
    "Reselecting scene reset state",
  );
  await buttons.first().click();
  await targetPage.mouse.click(2, 2);
  assert(!(await dialog.evaluate((element) => element.open)));
  assert.deepEqual(await selectionState(targetPage), before);

  for (let index = 0; index < 6; index++) {
    await buttons.nth(index).click();
    await previewContent(targetPage, section, index);
    await dialog.locator("[data-condition-next]").click();
    const selected = (index + 1) % 6;
    await previewContent(targetPage, section, selected);
    await dialog.locator("[data-condition-select]").click();
    assert(!(await dialog.evaluate((element) => element.open)));
    const row = targetPage.locator(`${section} article:not([hidden])`);
    await row.scrollIntoViewIfNeeded();
    await ready(row, 0);
    assert.equal(
      await row.getAttribute("data-case"),
      await choices.nth(selected).getAttribute("data-select-case"),
    );
    assert.equal(
      await choices.nth(selected).getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await row.locator(".input-cell img").getAttribute("src"),
      await buttons.nth(selected).getAttribute("data-image"),
    );
    assert.equal(
      await row.locator(".prompt-cell > p").innerText(),
      await buttons.nth(selected).getAttribute("data-prompt"),
    );
    assert.equal(
      await row
        .locator('.cloud-cell:not([hidden])[data-state="ready"]')
        .count(),
      2,
    );
    const after = await selectionState(targetPage);
    const ownIndex = section === "#comparisons" ? 0 : 1;
    assert.equal(after[ownIndex].baseline, before[ownIndex].baseline);
    assert.deepEqual(
      after[1 - ownIndex],
      before[1 - ownIndex],
      "Selection leaked to other section",
    );
  }
  for (let index = 5; index >= 0; index--) {
    await choices.nth(index).click({ position: { x: 8, y: 12 } });
    const row = targetPage.locator(`${section} article:not([hidden])`);
    await row.scrollIntoViewIfNeeded();
    await ready(row, 0);
    assert.equal(
      await row.getAttribute("data-case"),
      await choices.nth(index).getAttribute("data-select-case"),
    );
  }
  report.checks.push(
    `${section}: six independent previews/direct selections, high-resolution images/prompts, keyboard/focus/close, navigation isolation, camera/frame/baseline retention, six confirmed selections (${mobile ? "mobile" : "desktop"})`,
  );
}

async function imageFailures() {
  const failurePage = await browser.newPage({ reducedMotion: "reduce" });
  failurePage.on("pageerror", (error) => report.errors.push(error.message));
  await failurePage.goto(url, { waitUntil: "domcontentloaded" });
  const button = failurePage
    .locator("#comparisons [data-preview-case]")
    .first();
  const original = await button.getAttribute("data-full-image");
  const fullUrl = new URL(original, url).href;
  await failurePage.route(fullUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/webp",
      body: "invalid image for fallback test",
    }),
  );
  await button.click();
  await failurePage.waitForFunction(
    () =>
      document.querySelector(".condition-image-stage").dataset.imageState ===
      "fallback",
  );
  assert.equal(
    await failurePage.locator("#condition-dialog-image").getAttribute("src"),
    await button.getAttribute("data-image"),
  );
  await failurePage.keyboard.press("Escape");
  await failurePage.unroute(fullUrl);
  await button.evaluate((element) =>
    element.removeAttribute("data-full-image"),
  );
  await button.click();
  await previewContent(failurePage, "#comparisons", 0);
  await failurePage.keyboard.press("Escape");
  await button.evaluate((element, value) => {
    element.dataset.fullImage = value;
  }, original);
  await failurePage.route(fullUrl, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await button.click();
  assert.equal(
    await failurePage
      .locator(".condition-image-stage")
      .getAttribute("data-image-state"),
    "loading",
  );
  await failurePage.locator("[data-condition-next]").click();
  await previewContent(failurePage, "#comparisons", 1);
  await failurePage.waitForTimeout(1000);
  await previewContent(failurePage, "#comparisons", 1);
  await failurePage.keyboard.press("Escape");
  await failurePage.unroute(fullUrl);
  await failurePage.route("**/*.webp", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/webp",
      body: "invalid image for error test",
    }),
  );
  await button.click();
  await failurePage.waitForFunction(
    () =>
      document.querySelector(".condition-image-stage").dataset.imageState ===
      "error",
  );
  assert.equal(
    await failurePage.locator(".condition-image-status").innerText(),
    "Image unavailable.",
  );
  assert(await failurePage.locator("[data-condition-select]").isEnabled());
  await failurePage.keyboard.press("Escape");
  await failurePage.close();
  report.checks.push(
    "Images: missing mapping, failed high-resolution fallback, total failure, loading state and stale-load navigation",
  );
}

async function rapidReopen() {
  const buttons = page.locator("#comparisons [data-preview-case]");
  await buttons.nth(5).click();
  await page.evaluate(() => {
    document.querySelector("[data-condition-close]").click();
    document.querySelector("#comparisons [data-preview-case]").click();
  });
  await previewContent(page, "#comparisons", 0);
  await page.waitForTimeout(100);
  assert(
    await page
      .locator("[data-condition-close]")
      .evaluate((button) => document.activeElement === button),
  );
  await page.keyboard.press("ArrowRight");
  await previewContent(page, "#comparisons", 1);
  await page.keyboard.press("Escape");
  report.checks.push(
    "Rapid close/reopen does not steal focus or clear the new preview state",
  );
}

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page
    .locator("#comparisons [data-preview-case]")
    .first()
    .scrollIntoViewIfNeeded();
  await ready(page.locator("#comparisons article:not([hidden])"), 0);
  assert.deepEqual(
    imageRequests,
    [],
    "High-resolution images loaded before opening preview",
  );
  assert.equal(
    await page.locator(".comparison-options [data-baseline-select]").count(),
    0,
  );
  for (const section of ["#comparisons", "#aggregated"]) {
    const row = page.locator(`${section} article:not([hidden])`);
    const ours = row.locator(".ours-cell .viewer-surface");
    await ours.scrollIntoViewIfNeeded();
    await ready(row, 0);
    const selector = page.locator(`${section} [data-baseline-select]`);
    assert.equal(
      await selector.evaluate(
        (element) => element.closest(".cloud-cell").dataset.method,
      ),
      "gen3r",
    );
    const imageBounds = await row.locator(".input-cell img").boundingBox();
    assert(imageBounds.width >= 450, "Conditioning image remains too small");
    const imageRatio = await row
      .locator(".input-cell img")
      .evaluate((image) => ({
        actual: image.clientWidth / image.clientHeight,
        natural: image.naturalWidth / image.naturalHeight,
      }));
    assert(Math.abs(imageRatio.actual - imageRatio.natural) < 0.02);
    await zoom(page, section);
    await ours.scrollIntoViewIfNeeded();
    await ours.focus();
    await page.keyboard.press("ArrowLeft");
    const linked = page.locator(
      section === "#comparisons" ? "#sync-views" : "#aggregate-sync-views",
    );
    for (const synchronized of [true, false]) {
      await linked.setChecked(synchronized);
      const baseline = row.locator('[data-method="gen3r"] .viewer-surface');
      await baseline.focus();
      await page.keyboard.press("ArrowRight");
      const before = {
        ours: hash(await ours.screenshot()),
        baseline: hash(await baseline.screenshot()),
      };
      for (const method of ["tesseract", "vist3a", "gen3r"]) {
        await selector.selectOption(method);
        await ready(row, 0);
        assert.equal(
          await selector.evaluate(
            (element) => element.closest(".cloud-cell").dataset.method,
          ),
          method,
        );
        assert.equal(
          hash(await ours.screenshot()),
          before.ours,
          "Baseline switch moved the Plan4D camera",
        );
      }
      assert.equal(
        hash(await baseline.screenshot()),
        before.baseline,
        "Baseline camera was not preserved on round trip",
      );
    }
    await linked.check();
    const slider = page.locator(
      section === "#comparisons" ? "#point-size" : "#aggregate-point-size",
    );
    const beforeSize = hash(await ours.screenshot());
    await slider.evaluate((element) => {
      element.value = element.max;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.notEqual(
      hash(await ours.screenshot()),
      beforeSize,
      "Point size did not change rendering",
    );
    await slider.evaluate((element) => {
      element.value = element.defaultValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    if (section === "#comparisons") {
      await row.locator(".frame-slider").evaluate((element) => {
        element.value = "20";
        element.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await ready(row, 20);
      await selector.selectOption("tesseract");
      await ready(row, 20);
      await row.locator(".playback-button").click();
      await selector.selectOption("vist3a");
      await page.waitForFunction(() => {
        const element = document.querySelector(".comparison-row:not([hidden])");
        return (
          element
            .querySelector(".playback-button")
            .getAttribute("aria-pressed") === "true" &&
          Number(element.dataset.frame) > 20
        );
      });
      await row.locator(".playback-button").click();
    }
    await row
      .locator("[data-condition-image]")
      .evaluate((element) =>
        element.scrollIntoView({ block: "start", behavior: "instant" }),
      );
    await page.screenshot({
      path: `${output}/${section.slice(1)}-desktop.png`,
    });
    report.checks.push(
      `${section}: header selector, linked/unlinked camera continuity, point-size rendering${section === "#comparisons" ? ", frame and playback preservation" : ""}`,
    );
  }
  await previewDuringPlayback();
  for (const section of ["#comparisons", "#aggregated"])
    await previewCandidates(page, section);
  await imageFailures();
  await rapidReopen();
  for (const width of [1920, 1440, 1024, 768, 601, 600, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await page.evaluate(() => {
      const containers = [
        ...document.querySelectorAll(
          ".content-shell, .wide-shell, .text-shell",
        ),
      ].filter((element) => element.getBoundingClientRect().width);
      const bounds = containers.map((element) => {
        const rectangle = element.getBoundingClientRect();
        return {
          name: element.className,
          left: rectangle.left,
          width: rectangle.width,
        };
      });
      const titles = [...document.querySelectorAll("main h2")].map(
        (element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const rectangle = range.getBoundingClientRect();
          return {
            title: element.textContent.trim(),
            offset: Math.abs(
              (rectangle.left + rectangle.right) / 2 - innerWidth / 2,
            ),
          };
        },
      );
      return {
        width: innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        bounds,
        titles,
      };
    });
    assert(layout.pageWidth <= width, `Overflow at ${width}`);
    for (const bounds of layout.bounds) {
      assert(
        Math.abs(bounds.left - layout.bounds[0].left) < 1,
        `${bounds.name} has inconsistent margin at ${width}`,
      );
      assert(
        Math.abs(bounds.width - layout.bounds[0].width) < 1,
        `${bounds.name} has inconsistent width at ${width}`,
      );
    }
    for (const title of layout.titles)
      assert(title.offset < 2, `${title.title} is not centered at ${width}`);
    assert(
      await page
        .locator("#comparisons [data-select-case]")
        .evaluateAll((buttons) =>
          buttons.every((button) => {
            const rectangle = button.getBoundingClientRect();
            const preview = button.parentElement
              .querySelector("[data-preview-case]")
              .getBoundingClientRect();
            const center = {
              x: rectangle.left + rectangle.width / 2,
              y: rectangle.top + rectangle.height / 2,
            };
            return (
              center.x < preview.left ||
              center.x > preview.right ||
              center.y < preview.top ||
              center.y > preview.bottom
            );
          }),
        ),
      `Preview button covers thumbnail center at ${width}`,
    );
    await page.locator("#comparisons [data-preview-case]").first().click();
    await previewContent(page, "#comparisons", 0);
    const dialogLayout = await page
      .locator("#condition-dialog")
      .evaluate((dialog) => {
        const bounds = dialog.getBoundingClientRect();
        const buttons = [...dialog.querySelectorAll("button")].filter(
          (button) => button.getClientRects().length,
        );
        return {
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          overflow: dialog.scrollWidth > dialog.clientWidth,
          buttonsInside: buttons.every((button) => {
            const rectangle = button.getBoundingClientRect();
            return (
              rectangle.left >= bounds.left &&
              rectangle.right <= bounds.right &&
              rectangle.top >= bounds.top &&
              rectangle.bottom <= bounds.bottom
            );
          }),
        };
      });
    assert(
      dialogLayout.left >= 0 &&
        dialogLayout.right <= width &&
        dialogLayout.top >= 0 &&
        dialogLayout.bottom <= 1000,
    );
    assert(
      !dialogLayout.overflow && dialogLayout.buttonsInside,
      `Dialog overflow at ${width}`,
    );
    await page.keyboard.press("Escape");
    report.viewports.push(layout);
  }
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  mobile.on("pageerror", (error) => report.errors.push(error.message));
  mobile.on("console", (message) => {
    if (message.type() === "error") report.errors.push(message.text());
  });
  mobile.on("response", (response) => {
    if (response.status() >= 400)
      report.errors.push(`${response.status()} ${response.url()}`);
  });
  await mobile.goto(url, { waitUntil: "domcontentloaded" });
  for (const section of ["#comparisons", "#aggregated"]) {
    const row = mobile.locator(`${section} article:not([hidden])`);
    await row.locator(".input-cell img").scrollIntoViewIfNeeded();
    await ready(row, 0);
    await zoom(mobile, section, true);
    await previewCandidates(mobile, section, true);
    await row
      .locator("[data-condition-image]")
      .evaluate((element) =>
        element.scrollIntoView({ block: "start", behavior: "instant" }),
      );
    await mobile.screenshot({
      path: `${output}/${section.slice(1)}-mobile.png`,
    });
  }
  await mobile.setViewportSize({ width: 320, height: 568 });
  await mobile
    .locator("#comparisons [data-preview-case]")
    .first()
    .evaluate((button) => {
      button.dataset.prompt = Array(25).fill(button.dataset.prompt).join(" ");
    });
  await mobile.locator("#comparisons [data-preview-case]").first().click();
  await previewContent(mobile, "#comparisons", 0);
  const compact = await mobile
    .locator("#condition-dialog")
    .evaluate((dialog) => {
      const content = dialog.querySelector(".condition-dialog-content");
      const footer = dialog
        .querySelector(".condition-dialog-actions")
        .getBoundingClientRect();
      const bounds = dialog.getBoundingClientRect();
      return {
        scrolls: content.scrollHeight > content.clientHeight,
        contained:
          bounds.left >= 0 &&
          bounds.right <= innerWidth &&
          bounds.top >= 0 &&
          bounds.bottom <= innerHeight &&
          dialog.scrollWidth <= dialog.clientWidth,
        footerVisible: footer.bottom <= innerHeight && footer.top >= 0,
      };
    });
  assert(
    compact.scrolls && compact.contained && compact.footerVisible,
    "Short mobile dialog cannot scroll while retaining controls",
  );
  await mobile.screenshot({
    path: `${output}/candidate-compact-long-prompt.png`,
  });
  await mobile.locator("[data-condition-close]").click();
  report.checks.push(
    "320x568 mobile: long prompt scrolls, close/navigation/selection remain accessible",
  );
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report.checks, null, 2));
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
