# Plan4D 项目页

## 内容与范围

页面包括论文标题与作者、teaser、摘要、六场景交互式方法对比、RGB/深度视频、方法图、四个数据集的论文定量结果和 BibTeX。

Plan4D 仅来自 `../../plan4d_final_outputs-best`。排除 `P28_101_119`，使用 `P02_122_161`、`P02_129_354`、`P02_135_92`、`P06_102_75`、`P07_116_25`、`P25_104_94`。各方法严格按场景 ID 匹配，共 24 组序列、1,944 帧。对比区不显示数据集名称，不包含额外版本切换。

列顺序固定为输入文本、输入图像、Gen3R、TesserAct、VIST3A、Plan4D。对比支持同步播放/暂停、帧滑块、前后帧、倍速、相机联动、旋转/平移/缩放、点大小、视角复位、放大和失败重试。手机保留六列，可横向浏览并放大单项。

## 本地运行

要求 Node >= 22.12。当前机器可用 Node 22.18.0：

```bash
export PATH=/home/admin/code-server-4.104.3-linux-amd64/lib:$PATH
export ASTRO_TELEMETRY_DISABLED=1
npm install
npm run dev -- --host 0.0.0.0 --port 4321
```

访问 `http://localhost:4321/`。远程机器可通过编辑器转发 4321 端口访问。

## 资源生成

```bash
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/prepare_assets.py
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/validate_assets.py
```

导出器只读原始结果。点云保留 81 个时间步，每帧最多均匀采样 16,000 个顶点，以 gzip 压缩的 binary PLY 存储。原始世界坐标和颜色保留，double 坐标转换为 float32。浏览器使用第一帧相机与整个序列的固定显示尺度，不按帧重新居中。此展示尺度不是跨方法的公制对齐，页面中有相应说明。

`src/data/results.json` 记录场景、点数、相机和 SHA-256；`public/results/provenance.json` 记录原始目录。图像和视频来自同一个 best 结果。视频同时提供原始 H.264 MP4 与 VP9 WebM，兼容未安装 H.264 解码器的浏览器。WebM 使用现有 dav3 环境的 imageio-ffmpeg 导出。论文图由 PDF 转换，定量数据来自论文 `tables/4d_generation_subset.tex`，未更改数值。输入图像保持完整，不裁切。

`public/results/` 约 380 MiB，作为可复现产物被 Git 忽略。初次范围更正前生成的资源保留在 `artifacts/initial-results-original-source/`，不参与页面或构建。

## 验证

```bash
npm run check
npm run build
npm exec playwright install chromium --only-shell
npm run validate:page
```

本机 Playwright 浏览器已安装在 `/tmp/plan4d-browsers`，运行验证时设置 `PLAYWRIGHT_BROWSERS_PATH=/tmp/plan4d-browsers`。可通过 `PLAN4D_TEST_URL` 指定验证地址或带子路径的构建预览地址。浏览器检查覆盖首尾帧、点云像素、播放/暂停、快速拖动、重试、放大、手机布局、定量表切换和引用复制。截图与报告保存到 `artifacts/browser/`。

构建器会先检查必需媒体，避免发布空 viewer。已有 `dist` 会被移动到 `artifacts/build-时间戳/dist` 保留，之后再生成新构建，不主动删除旧产物。

## 静态发布

`npm run build` 产出的 `dist/` 自包含图像、视频、点云和前端，无需 Python/GPU 服务。可部署到支持静态文件的网站服务。若以仓库子路径托管，可运行：

```bash
npm run build -- --base /plan4d-project
npm run preview -- --host 0.0.0.0 --port 4322
```

不能直接用 `file://` 打开，需要 HTTP 服务加载点云。托管服务器应把 `.ply.gz` 当作 gzip 文件直接提供；如果服务器设置了 `Content-Encoding: gzip` 并让浏览器自动解压，加载器也能识别已解压的 PLY。

若使用 GitHub Actions，需在构建前准备 `public/results/`。可在仓库变量 `PLAN4D_RESULTS_ARCHIVE_URL` 中配置仅含 `results/` 目录的可信资源归档地址；工作流将下载并恢复到 `public/`。未配置且仓库未包含资源时，构建会明确失败。当前未部署网站，也没有填入尚未提供的论文、arXiv、代码仓库公开链接。

## 主要文件

- `src/pages/index.astro`：论文页面。
- `src/components/ResultsComparison.astro`：六列对比及控制项。
- `src/scripts/comparison.ts`：Three.js、PLY 解码、加载缓存和时间同步。
- `src/styles/plan4d.css`：响应式样式。
- `src/data/benchmarks.ts`：论文定量结果。
- `scripts/prepare_assets.py`：生成网页资源。
- `scripts/validate_assets.py`、`scripts/verify_page.mjs`：数据与浏览器验证。
