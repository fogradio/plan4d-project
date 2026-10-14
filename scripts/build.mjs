import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const manifest = JSON.parse(readFileSync("src/data/results.json", "utf8"));
const aggregated = JSON.parse(readFileSync("src/data/aggregated.json", "utf8"));
const gallery = JSON.parse(readFileSync("src/data/gallery.json", "utf8"));
const files = ["figures/teaser.webp", "figures/method.webp"];
for (const scene of [...manifest.cases, ...aggregated.cases])
  files.push(scene.image);
for (const sequence of Object.values(aggregated.sequences))
  files.push(sequence.path);
for (const sequence of Object.values(manifest.sequences)) {
  for (let frame = 0; frame < sequence.frameCount; frame++)
    files.push(`${sequence.path}/${String(frame).padStart(4, "0")}.ply.gz`);
}
for (const scene of gallery.cases) {
  files.push(scene.image, scene.aggregate.path);
  for (const video of Object.values(scene.videos))
    files.push(video.mp4, video.webm, video.poster);
  for (let frame = 0; frame < scene.sequence.frameCount; frame++)
    files.push(
      `${scene.sequence.path}/${String(frame).padStart(4, "0")}.ply.gz`,
    );
}
const missing = files.filter((file) => !existsSync(resolve("public", file)));
if (missing.length) {
  console.error(
    `${missing.length} required media files are missing. Run scripts/prepare_assets.py, scripts/prepare_aggregates.py and scripts/prepare_gallery.py or restore public/results before building.`,
  );
  process.exit(1);
}

function astro(args) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/.bin/astro", ...args],
    {
      stdio: "inherit",
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
    },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

astro(["check"]);
const args = process.argv.slice(2);
const outDirIndex = args.indexOf("--outDir");
const output = outDirIndex >= 0 ? args[outDirIndex + 1] : "dist";
if (existsSync(output)) {
  const archive = resolve(
    "artifacts",
    `build-${new Date().toISOString().replaceAll(":", "-")}`,
  );
  mkdirSync(archive, { recursive: true });
  renameSync(output, resolve(archive, "dist"));
  console.log(`Previous build preserved in ${archive}`);
}
astro(["build", ...args]);
