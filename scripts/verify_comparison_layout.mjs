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
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  reducedMotion: "reduce",
});
page.on("pageerror", (error) => report.errors.push(error.message));
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
  await button.click();
  const dialog = targetPage.locator("#condition-dialog");
  assert(await dialog.evaluate((element) => element.open));
  await targetPage.waitForFunction(
    () => document.querySelector("#condition-dialog-image").naturalWidth > 0,
  );
  assert((await dialog.locator("img").getAttribute("src")).endsWith(expected));
  assert(
    await dialog.locator("img").evaluate((image) => image.naturalWidth >= 832),
  );
  assert.equal(await dialog.locator("p").innerText(), prompt);
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

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
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
    report.viewports.push(layout);
  }
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  mobile.on("pageerror", (error) => report.errors.push(error.message));
  await mobile.goto(url, { waitUntil: "domcontentloaded" });
  for (const section of ["#comparisons", "#aggregated"]) {
    const row = mobile.locator(`${section} article:not([hidden])`);
    await row.locator(".input-cell img").scrollIntoViewIfNeeded();
    await ready(row, 0);
    await zoom(mobile, section, true);
    await row
      .locator("[data-condition-image]")
      .evaluate((element) =>
        element.scrollIntoView({ block: "start", behavior: "instant" }),
      );
    await mobile.screenshot({
      path: `${output}/${section.slice(1)}-mobile.png`,
    });
  }
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report.checks, null, 2));
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
