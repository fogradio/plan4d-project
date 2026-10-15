import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const url = process.env.PLAN4D_TEST_URL || "http://127.0.0.1:4321/";
const output = process.env.PLAN4D_TEST_OUTPUT || "artifacts/paper-browser";
const proxyOrigin = process.env.PLAN4D_TEST_PROXY_ORIGIN;
const proxyPrefix = process.env.PLAN4D_TEST_PROXY_PREFIX;
const paperRoot =
  process.env.PLAN4D_PAPER_ROOT ||
  "/mnt/workspace/hwzhang/69e090695f534d4b6292331f";
const normalize = (text) => text.replace(/\s+/g, " ").trim();
const aggregated = JSON.parse(
  await readFile("src/data/aggregated.json", "utf8"),
);
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

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  if (proxyOrigin && proxyPrefix) {
    const publicOrigin = new URL(url).origin;
    await page.route(`${publicOrigin}${proxyPrefix}/**`, async (route) => {
      const requestUrl = new URL(route.request().url());
      const target = new URL(
        requestUrl.pathname.slice(proxyPrefix.length) + requestUrl.search,
        proxyOrigin,
      );
      const response = await route.fetch({
        url: target.href,
        ignoreHTTPSErrors: true,
        headers: {
          ...route.request().headers(),
          host: new URL(url).hostname,
        },
      });
      await route.fulfill({ response });
    });
    report.checks.push(
      `Forwarded requests through ${proxyOrigin}, stripping ${proxyPrefix}`,
    );
  }
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      report.errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  assert.equal(await page.title(), "Plan4D: Generative Plannable 4D Worlds");
  assert.equal(
    normalize(await page.locator("h1").innerText()),
    "Plan4D: Generative Plannable 4D Worlds",
  );
  assert.equal(
    await page.locator("h1 + .paper-conference").innerText(),
    "NeurIPS 2026",
  );
  assert.equal(await page.locator(".paper-conference + .authors").count(), 1);
  assert(
    !(await page.locator("body").innerText())
      .toLowerCase()
      .includes("video generation meets 4d geometry"),
  );
  assert.equal(
    await page
      .locator("#quantitative, [data-benchmark], .metrics-table")
      .count(),
    0,
  );
  assert.equal(await page.locator("#teaser-video").count(), 1);
  assert.equal(await page.locator("#teaser-video source").count(), 2);
  assert.equal(await page.locator("#comparisons .comparison-row").count(), 6);
  assert.equal(await page.locator("#comparisons .cloud-cell").count(), 24);
  assert.equal(
    await page.locator("#aggregated .aggregate-row").count(),
    aggregated.cases.length,
  );
  assert.equal(
    await page.locator("#aggregated .cloud-cell").count(),
    Object.keys(aggregated.sequences).length,
  );
  for (const section of ["#comparisons", "#aggregated"]) {
    assert.equal(
      await page.locator(`${section} article:not([hidden])`).count(),
      1,
    );
    assert.equal(
      await page
        .locator(`${section} article:not([hidden]) .cloud-cell:not([hidden])`)
        .count(),
      2,
    );
    assert.equal(
      await page.locator(`${section} [data-baseline-select] option`).count(),
      3,
    );
  }
  assert.equal(await page.locator("#gallery-case option").count(), 17);
  assert.equal(await page.locator(".gallery-mode").count(), 5);
  assert.deepEqual(
    await page
      .locator(".paper-links > *")
      .allTextContents()
      .then((labels) => labels.map(normalize)),
    ["Paper", "Code", "Model", "BibTeX"],
  );
  assert.equal(await page.locator(".paper-links button:disabled").count(), 3);
  assert.equal(
    await page.locator(".paper-links a").getAttribute("href"),
    "#citation",
  );
  for (const name of ["Jiahong Wu", "Chuanxia Zheng"]) {
    assert.match(
      await page
        .locator(".authors > span")
        .filter({ hasText: name })
        .innerText(),
      /†/,
    );
  }
  assert.equal(
    await page.locator(".author-note").innerText(),
    "† Corresponding authors",
  );
  assert.match(
    await page.locator(".affiliations").innerText(),
    /PVG, Nanyang Technological University/,
  );
  const abstractPath = resolve(paperRoot, "sections/0_abstract.tex");
  if (existsSync(abstractPath)) {
    const abstractSource = (await readFile(abstractPath, "utf8"))
      .split("\\begin{abstract}")[1]
      .split("\\end{abstract}")[0]
      .replace(/%[^\n]*/g, "")
      .replace(/\\shortname/g, "Plan4D")
      .replace(/\\(?:emph|url)\{([^}]+)\}/g, "$1")
      .replace(
        /\s*Project Page:\s*https:\/\/fogradio\.github\.io\/plan4d-project\/?\.?\s*$/,
        "",
      );
    assert.equal(
      normalize(await page.locator("#abstract .text-shell").innerText()),
      `Abstract ${normalize(abstractSource)}`,
    );
    report.checks.push(
      "Abstract matches the current manuscript without the final Project Page sentence",
    );
  }
  assert.doesNotMatch(
    await page.locator("#abstract .text-shell").innerText(),
    /Project Page:|https:\/\/fogradio\.github\.io\/plan4d-project/,
  );
  report.checks.push(
    "Title, author affiliations, both corresponding authors and four resource entries match",
    `Teaser, six frame comparisons, ${aggregated.cases.length} aggregated comparisons and 17-scene Gallery are present`,
    "Quantitative tables and dataset tabs are absent",
  );
  assert.equal(
    (await page.locator("#citation-text").textContent()).split("\n")[1],
    "  title     = {Plan4D: Generative Plannable 4D Worlds},",
  );
  await page.locator("#copy-citation").click();
  await page.waitForFunction(
    () => document.getElementById("copy-status").textContent.length > 0,
  );
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    await page.locator("#citation-text").textContent(),
  );
  for (const href of await page
    .locator("a[href^='#']")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")))) {
    assert.equal(await page.locator(href).count(), 1, href);
  }
  report.checks.push(
    "BibTeX copies correctly and all navigation targets exist",
  );

  const method = page.locator(".method-figure img");
  await method.scrollIntoViewIfNeeded();
  await method.evaluate((image) => image.decode());
  assert(
    await method.evaluate(
      (image) => image.naturalWidth === 2447 && image.naturalHeight === 657,
    ),
  );
  for (const [width, height] of [
    [1920, 1080],
    [1440, 1000],
    [901, 1000],
    [768, 1024],
    [601, 844],
    [600, 844],
    [390, 844],
    [375, 844],
    [320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    const layout = await page.evaluate(() => {
      const heading = document.querySelector("h1");
      const bounds = heading.getBoundingClientRect();
      const style = getComputedStyle(heading);
      const conference = document.querySelector(".paper-conference");
      const conferenceBounds = conference.getBoundingClientRect();
      const conferenceText = document.createRange();
      conferenceText.selectNodeContents(conference);
      const conferenceTextBounds = conferenceText.getBoundingClientRect();
      const authorBounds = document
        .querySelector(".authors")
        .getBoundingClientRect();
      return {
        pageWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        titleWidth: heading.scrollWidth,
        availableWidth: heading.clientWidth,
        titleHeight: bounds.height,
        lineHeight: parseFloat(style.lineHeight),
        conferenceCenterOffset: Math.abs(
          (conferenceTextBounds.left + conferenceTextBounds.right) / 2 -
            (bounds.left + bounds.right) / 2,
        ),
        conferenceBelowTitle: conferenceBounds.top >= bounds.bottom,
        authorsBelowConference: authorBounds.top >= conferenceBounds.bottom,
      };
    });
    assert(layout.pageWidth <= width, `Page overflows at ${width}px`);
    assert(
      layout.titleWidth <= layout.availableWidth + 1,
      `Title overflows at ${width}px`,
    );
    assert(
      Math.abs(layout.titleHeight - layout.lineHeight) < 1,
      `Title uses multiple lines at ${width}px`,
    );
    assert(
      layout.conferenceCenterOffset < 1,
      `Conference line is not centered at ${width}px`,
    );
    assert(
      layout.conferenceBelowTitle && layout.authorsBelowConference,
      `Title, conference and authors overlap at ${width}px`,
    );
    await page.screenshot({
      path: `${output}/page-${width}.png`,
    });
    report.viewports.push({ width, height, ...layout });
  }
  assert.deepEqual(report.errors, []);
  report.checks.push(
    "Updated method figure renders; title stays on one line from 320px to 1920px",
    "NeurIPS 2026 is centered between the title and authors at every viewport",
    "No page overflow or browser errors",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
