# Plan4D 项目页

## 开场视频（2026-10-15）

首屏 teaser 更新为 54 秒真实结果视频，提供 1080p MP4 下载与 720p MP4/WebM 网页播放，英文短字幕、无配音。素材来源、分镜、复现和验证方式见 [TEASER.md](TEASER.md)。旧静态 teaser 与所有定性结果保留。

## 内容与范围

当前页面包括单行论文标题、居中的 NeurIPS 2026、作者与单位、Paper/Code/Model/BibTeX 四个入口、teaser、新版论文摘要与方法图、六场景逐帧对比、三场景聚合点云对比、17 场景五模态 Gallery 和 BibTeX。根据用户最终更正，保留全部原定性展示，移除原定量表格。

摘要来自 `/mnt/workspace/hwzhang/69e090695f534d4b6292331f/sections/0_abstract.tex`，按用户要求省略末尾 Project Page 网址段落；通讯作者为 Jiahong Wu 和 Chuanxia Zheng，单位以同目录的 `neurips_2026.tex` 为准。方法图从 `figs/plab4d_final-chuanxia.pdf` 重新导出到 `public/figures/method-chuanxia-20261014.webp`。

Paper、Code、Model 公开地址尚未提供，当前入口不可点击；BibTeX 跳转到引用区。`src/data/benchmarks.ts` 定量数据文件保留，但当前页面不导入、不展示其内容。

## 定性展示资源

以下记录定性资源的来源与复现方式。逐帧、聚合与 Gallery 组件沿用原有数据和交互。

Plan4D 仅来自 `../../plan4d_final_outputs-best`。排除 `P28_101_119`，使用 `P02_122_161`、`P02_129_354`、`P02_135_92`、`P06_102_75`、`P07_116_25`、`P25_104_94`。各方法严格按场景 ID 匹配，共 24 组序列、1,944 帧。对比区不显示数据集名称，不包含额外版本切换。

VIST3A 指原始 Wan2.1 + AnySplat baseline，原始结果来自 `../../ti2v_bench_anysplat_outputs/epic_kitchens100_81`，整理副本位于 `../../plan4d_final_outputs-baselines/vist3a`。它的相机取自 `decode_outputs.pt` 的 `extrinsic_w2c`，不使用 DA3 后处理几何或基于 VIST3A 的 Plan4D 输出。

列顺序固定为输入文本、输入图像、Gen3R、TesserAct、VIST3A、Plan4D。对比支持同步播放/暂停、帧滑块、前后帧、倍速、相机联动、旋转/平移/缩放、点大小、视角复位、放大和失败重试。手机保留六列，可横向浏览并放大单项。

聚合对比位于 `#aggregated`，三列为 `Input text`、`Input image`、`Aggregated 4D Point Cloud`。第三列按 Gen3R、TesserAct、VIST3A、Plan4D 顺序并排展示，使用三个指定场景：

- `iaHNa6cm64k-0:02:50.044-0:02:56.759`
- `test_cab_e_3rd_00000_00081`
- `ZHwqSpZfPCI-0:05:13.280-0:05:19.640`

12 份来源均为对应目录下的 `point_cloud/global_pcd_with_camera_trajectory.ply`，包含 TesserAct 的 test_cab 结果。输入文本与图像来自 best 目录。聚合查看器复用共享 WebGL、旋转/平移/缩放、相机联动、复位、放大和重试；它展示单份聚合几何，不显示时间轴，也不使用视频替代。

网页默认对每份聚合文件的场景顶点均匀采样最多 200,000 个，完整保留相机视锥与轨迹顶点，不过滤或重建几何。坐标转为 float32、颜色不变，以 gzip PLY 发布；输入图像无损转换为 WebP。显示以第一相机方向对齐，使用独立尺度，不声称公制对齐。`src/data/aggregated.json` 与 `public/results/aggregated/provenance.json` 记录来源哈希、数量和变换；原文件只读。

## Gallery

`#gallery` 按用户指定顺序提供 17 个 best 场景的下拉菜单。页面仅有一个 Gallery 输出框，左右箭头循环切换以下五种模态，也可以使用底部图标直接选择；导航条支持左右键和触摸滑动，不与点云旋转手势冲突。

1. `INTERACTIVE 4D OUTPUT`：81 帧真实 PLY，可播放/暂停、拖动时间轴、调速、旋转/平移/缩放、调整点大小、复位、放大和失败重试。
2. `RGB Video`：来自 `generated_video.mp4`。
3. `Depth Video`：来自 `pred_depth_vis.mp4`。
4. `Aggregated 4D Point Cloud`：来自 `point_cloud/global_pcd_with_camera_trajectory.ply`，完整保留相机视锥和轨迹顶点。
5. `Scene Flow`：严格使用 `notch14_pointcloud_trails/pred_scene_flow_raw_notch14_pointcloud_trails_vis.mp4`，不回退到 raw_vis 或其他场景流版本。

场景切换同步更新输入图像和文本，保持当前模态；切换模态或场景、离开可视区域、隐藏页面和关闭放大窗口时暂停旧播放器。快速切换会中止过期点云请求。放大时将同一输出框移入对话框，不创建第二套播放器。

`Phu_HyoQWVU-0:00:00.867-0:00:07.841` 的展示文本固定为：

> Hold the small glass dish. Dispense pink liquid using a pipette. Release the liquid smoothly. Fill the dish gradually.

源 prompt 另外保存在 `sourcePrompt` 和 provenance 中，源结果不改。此前聚合区 01/02 的用户指定文本保持不变。

Gallery 派生资源位于 `public/results/gallery/`，约 594 MiB，按当前场景/模态延迟加载。每帧最多均匀采样 16,000 点，保留全部 81 帧；聚合场景采样上限为 200,000，保留所有相机顶点。输入图像为无损 WebP。视频包含与源逐字节一致的 MP4 和同尺寸/同帧数的 VP9 WebM，避免浏览器缺少 H.264 时无法播放。只有当前视频被加载，点云 LRU 上限为 24 份几何。

```bash
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/prepare_gallery.py
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/prepare_gallery.py --validate
PLAYWRIGHT_BROWSERS_PATH=/tmp/plan4d-browsers node scripts/verify_gallery.mjs
```

`--resume` 可复用中断导出已完成的场景；普通重跑会将旧资源及清单归档到 `artifacts/gallery-时间戳/`，不删除文件。数据验证覆盖 1,377 帧全部采样 XYZ/RGB、17 个聚合文件、无损输入图像、51 个视频来源哈希及转码尺寸/帧数；报告在 `artifacts/gallery-validation.json`。浏览器验证覆盖 17×5 种结果、视频实际解码/播放、逐帧变化、旋转、快速切换、失败重试、放大、手机布局和关闭/离屏暂停。

## 本地运行

要求 Node >= 22.12。当前机器可用 Node 22.18.0：

```bash
export PATH=/home/admin/code-server-4.104.3-linux-amd64/lib:$PATH
export ASTRO_TELEMETRY_DISABLED=1
npm install
npm run dev -- --host 0.0.0.0 --port 4321
```

访问 `http://localhost:4321/`。远程机器可通过编辑器转发 4321 端口访问。

Nebula 的转发域名 `nebula-notebook2.alibaba-inc.com` 已加入 `astro.config.ts` 的 `server.allowedHosts`，同时适用于开发和构建预览。修改此配置后，需要重启已运行的预览服务。

本机现有的转发构建位于 `artifacts/forwarded-preview`，资源前缀为 `/notebook-331e09bc81d9-code/proxy/4321/`。启动方式：

```bash
npm run preview -- --outDir artifacts/forwarded-preview --base / --host 0.0.0.0 --port 4321
```

浏览器访问 `https://nebula-notebook2.alibaba-inc.com/notebook-331e09bc81d9-code/proxy/4321/`。Nebula 代理会剥离转发路径，因此构建资源使用完整转发前缀，而预览服务使用 `--base /`。更换 notebook 或端口、更新页面内容时，应重新构建，例如：

```bash
npm run build -- --base /notebook-331e09bc81d9-code/proxy/4321/ --outDir artifacts/forwarded-preview
```

## 资源生成

```bash
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/prepare_assets.py
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/validate_assets.py
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/prepare_aggregates.py
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/prepare_aggregates.py --validate
```

聚合导出器自动验证全部采样坐标/颜色、完整轨迹、三个输入图像和来源哈希；报告为 `artifacts/aggregated-validation.json`。可用 `--max-scene-points 0` 导出全部场景点。重新导出会将旧聚合资源和清单移动到 `artifacts/aggregated-时间戳/` 保留。

只更新 VIST3A baseline，保留其他方法、输入图像和 Plan4D 视频：

```bash
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/prepare_assets.py --refresh-vist3a
```

导出前检查 Wan2.1 模型、VIST3A 官方 LoRA、AnySplat 相机 bundle 和原始来源清单；错误来源会被拒绝。新 VIST3A 资源路径带 `-wan21-anysplat`，避免复用旧的浏览器缓存。替换前的 VIST3A 资产和清单保留在 `artifacts/vist3a-source-correction-时间戳/`。

2026-10-13 已完成 VIST3A 来源纠正，普通构建和 4321 转发构建均已更新。验证覆盖六组 VIST3A 的全部 486 帧源点云、AnySplat 相机、与 Plan4D 的差异，以及桌面/手机显示和交互。报告见 `artifacts/assets-validation.json` 和 `artifacts/browser/report.json`。

导出器只读原始结果。点云保留 81 个时间步，每帧最多均匀采样 16,000 个顶点，以 gzip 压缩的 binary PLY 存储。原始世界坐标和颜色保留，double 坐标转换为 float32。浏览器使用第一帧相机与整个序列的固定显示尺度，不按帧重新居中。此展示尺度不是跨方法的公制对齐，页面中有相应说明。

`src/data/results.json` 记录场景、点数、相机和 SHA-256；`public/results/provenance.json` 记录整理目录，并为 VIST3A 额外记录原始 AnySplat 来源、模型与相机来源。图像和视频来自同一个 best 结果。视频同时提供原始 H.264 MP4 与 VP9 WebM，兼容未安装 H.264 解码器的浏览器。WebM 使用现有 dav3 环境的 imageio-ffmpeg 导出。论文图由 PDF 转换，定量数据来自论文 `tables/4d_generation_subset.tex`，未更改数值。输入图像保持完整，不裁切。

`public/results/` 当前合计约 1007 MiB（含 Gallery），作为可复现产物被 Git 忽略。初次范围更正前生成的资源保留在 `artifacts/initial-results-original-source/`，不参与页面或构建。

## 验证

```bash
npm run check
npm run build
npm exec playwright install chromium --only-shell
npm run validate:page
```

本机 Playwright 浏览器已安装在 `/tmp/plan4d-browsers`，运行验证时设置 `PLAYWRIGHT_BROWSERS_PATH=/tmp/plan4d-browsers`。可通过 `PLAN4D_TEST_URL` 指定验证地址或带子路径的构建预览地址。`npm run validate:page` 使用 `scripts/verify_paper.mjs`，核对论文原文、通讯作者、四个入口、引用复制、新方法图、320–1920px 单行标题与无页面溢出，并确认全部定性区块存在、定量表格已移除。默认截图与报告保存在 `artifacts/paper-browser/`，可用 `PLAN4D_TEST_OUTPUT` 指定独立目录。

`node scripts/verify_page.mjs` 检查全部逐帧/聚合点云及其播放、旋转、放大、重试和手机布局；`node scripts/verify_gallery.mjs` 检查 17×5 模态、51 个视频播放及 Gallery 交互。

构建器检查图标、teaser、新方法图与全部逐帧、聚合、Gallery 媒体，避免发布空查看器。已有 `dist` 会被移动到 `artifacts/build-时间戳/dist` 保留，之后再生成新构建，不主动删除旧产物。

## 静态发布

`npm run build` 产出的 `dist/` 自包含图像、视频、点云和前端，无需 Python/GPU 服务。可部署到支持静态文件的网站服务。若以仓库子路径托管，可运行：

```bash
npm run build -- --base /plan4d-project
npm run preview -- --host 0.0.0.0 --port 4322
```

不能直接用 `file://` 打开，需要 HTTP 服务加载点云。托管服务器应把 `.ply.gz` 当作 gzip 文件直接提供；如果服务器设置了 `Content-Encoding: gzip` 并让浏览器自动解压，加载器也能识别已解压的 PLY。

当前页面构建需要 `public/results/`。GitHub Actions 可通过 `PLAN4D_RESULTS_ARCHIVE_URL` 恢复媒体；未准备媒体时构建检查会明确失败。当前未填入尚未提供的论文、代码和模型公开链接。

GitHub Pages 目标为 `https://fogradio.github.io/plan4d-project/`，仓库 Settings → Pages 的 Source 应设为 GitHub Actions。媒体以公开 Release 附件发布，不加入源码 Git 历史；压缩包内的顶层目录须为 `results/`，使工作流解压到 `public/` 后得到正确路径。仓库 Actions 变量 `PLAN4D_RESULTS_ARCHIVE_URL` 应指向该附件的固定版本下载地址，再推送 `main` 触发构建和部署。

2026-10-14 发布候选的媒体包为 `artifacts/plan4d-results-20261014-release.tar.gz`，SHA-256：`79240366da1e22f100804d54fecb67046c3503ec1cd25168d7202c170547daef`。正式构建位于 `artifacts/github-pages-release-20261014/`，使用 `/plan4d-project/` 资源前缀，与 Nebula 预览构建分开保存。

2026-10-15 teaser 以独立 Release `plan4d-teaser-20261015` 补充，附件为 `plan4d-teaser-20261015-release.tar.gz`，SHA-256：`431aa1138690b4b1d168f95711477df16a0601c22b65b2a755c0b6a0acb27b88`。工作流先恢复原定性媒体，再下载、校验并解压 teaser；无需重新上传原 1 GB 媒体包。16.2 秒 group publication 短片仅在本地 `artifacts/`，不加入公开站点或 Release。

## 主要文件

- `src/pages/index.astro`：论文页面。
- `src/components/ResultsComparison.astro`：六列对比及控制项。
- `src/components/AggregatedComparison.astro`：三列聚合对比及四方法查看器。
- `src/components/Gallery.astro`、`src/scripts/gallery.ts`：17 场景、单输出框及五模态交互。
- `src/scripts/comparison.ts`：Three.js、PLY 解码、加载缓存和时间同步。
- `src/styles/plan4d.css`：响应式样式。
- `src/data/benchmarks.ts`：论文定量结果。
- `scripts/prepare_assets.py`：生成网页资源。
- `scripts/prepare_aggregates.py`：生成并验证聚合点云资源。
- `scripts/prepare_gallery.py`、`scripts/verify_gallery.mjs`：Gallery 来源与浏览器验证。
- `scripts/validate_assets.py`、`scripts/verify_page.mjs`：数据与浏览器验证。
