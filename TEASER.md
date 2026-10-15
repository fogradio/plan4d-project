# Plan4D 项目页 Teaser

## 交付内容

成片为 54 秒、16:9、英文短字幕、无配音、无背景音乐。使用项目现有 best 定性结果，包含 12 个独立场景。主线为观测图像与计划动作、未来 RGB、深度、动态点云、场景流和聚合几何，最后以多场景拼接结束。

| 文件 | 用途 |
| --- | --- |
| `public/results/teaser/plan4d-teaser-1080p.mp4` | 1920x1080、30 fps 的高质量 H.264 成片 |
| `public/results/teaser/plan4d-teaser.mp4` | 1280x720、30 fps 的网页 H.264 版本 |
| `public/results/teaser/plan4d-teaser.webm` | 1280x720、30 fps 的 VP9 兼容版本 |
| `public/results/teaser/plan4d-teaser-poster.webp` | 项目页封面 |
| `public/results/teaser/provenance.json` | 分镜、原始 prompt、来源路径及 SHA-256 |
| `artifacts/teaser-20261015/storyboard.jpg` | 十段分镜接触表 |

MP4 使用 faststart；网页优先 MP4，并提供 WebM 兼容浏览器。原生控制支持暂停、进度、全屏；离屏与隐藏页面时暂停，保留手动暂停状态，尊重 `prefers-reduced-motion`。

## 分镜

| 时间 | 内容 |
| --- | --- |
| 00.0–05.4 | Plan4D 开场：移液 RGB 与转视角动态点云 |
| 05.4–10.8 | 搅拌场景的输入图像、计划动作与未来结果 |
| 10.8–16.2 | 同一搅拌场景的 RGB、深度、动态点云、场景流 |
| 16.2–21.6 | 滴液场景的精细动作与几何、运动 |
| 21.6–27.0 | 人物弯腰：RGB 与动态 4D 点云 |
| 27.0–32.4 | 多主体室内场景：RGB 与深度 |
| 32.4–37.8 | 移液场景的跨时间聚合点云与相机轨迹 |
| 37.8–43.2 | 移动街景：RGB 与深度 |
| 43.2–48.6 | 九个动作场景同步拼接 |
| 48.6–54.0 | 六场景收尾与论文标题 |

## 素材与真实性

- RGB、深度和场景流均取自 `src/data/gallery.json` 已记录的结果，场景流严格使用 `notch14_pointcloud_trails` 版本。
- 动态点云直接读取原始 best 场景的全部 `frame_0000.ply` 至 `frame_0080.ply`，每帧 141,120 个点，使用 Three.js 离线渲染。
- 聚合镜头读取原始 `global_pcd_with_camera_trajectory.ply`，完整保留 1,023,296 个顶点与相机轨迹。该镜头明确标为聚合结果，不当作逐帧动态点云。
- 点云采用固定场景归一化、缓慢摄影机方位角扫描；不修补几何、不合成动作、不运行新模型。
- 每段保留 81 帧、15 fps 的原始时间关系。30 fps 交付仅重复源帧，不使用运动插值；段落边界有 5 个源帧长度的短叠化。
- 视频中的动作句是原始输入文本的简短摘要；完整 prompt 保存在来源清单中。
- 合成画布为 1080p，原始 RGB 多为 512x288；排版保留素材完整画面与宽高比，不声称源视频具备原生 1080p 细节。
- 旧静态 teaser、源结果和第一版点云渲染均保留。

## 复现

使用当前 `dav3` 环境和项目现成 Node/Playwright，无需安装模型或改动训练依赖。

```bash
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/teaser_contact_sheet.py
PLAYWRIGHT_BROWSERS_PATH=/tmp/plan4d-browsers /home/admin/code-server-4.104.3-linux-amd64/lib/node scripts/render_teaser_clouds.mjs
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/create_teaser.py --preview
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/create_teaser.py
```

分镜、字幕、场景顺序位于 `scripts/teaser_storyboard.json`。制作脚本拒绝覆盖已存在的正式 MP4；需要新版本时先将旧输出移动至新的归档目录保留，再运行。`--web-only` 从已有 1080p 成片生成缺失的网页格式。点云渲染复用带来源清单的已完成镜头。

## 验证

本次制作已完成全量解码、来源哈希、实际浏览器播放和生产构建验证，均通过。报告位于 `artifacts/teaser-20261015/validation.json`、`artifacts/teaser-20261015/production-browser-verified/report.json` 与 `artifacts/teaser-20261015/paper-regression/report.json`。

```bash
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/validate_teaser.py
PLAYWRIGHT_BROWSERS_PATH=/tmp/plan4d-browsers /home/admin/code-server-4.104.3-linux-amd64/lib/node scripts/verify_teaser.mjs
```

验证覆盖三个成片文件的全部 1,620 帧、尺寸、时长、帧率、faststart、非空图像、十段实际运动以及来源哈希。浏览器验证覆盖实际解码、静音播放、离屏暂停、手动暂停保持、减少动态效果设置和五种桌面/移动视口。

媒体继承项目 `public/results/` 的 Git 忽略规则。用户于 2026-10-15 授权正式发布，54 秒 teaser 通过 `plan4d-teaser-20261015` Release 增量包供 Actions 下载并校验；原 Gallery 媒体继续使用已有 Release。独立 16.2 秒 group publication 视频不参与此次公开发布。

## 本地预览

生产预览地址为 `http://localhost:4323/`，机器地址为 `http://33.78.174.88:4323/`。远程使用编辑器转发 4323 端口；原 4321 预览不变。

```bash
ASTRO_TELEMETRY_DISABLED=1 /home/admin/code-server-4.104.3-linux-amd64/lib/node node_modules/.bin/astro preview --outDir artifacts/teaser-preview-20261015 --host 0.0.0.0 --port 4323
```
