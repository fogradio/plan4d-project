# 单帧图像与文本驱动的未来 4D Teaser

## 叙事与成片

新版按照导师意见，以 **One image. One action. A 4D future.** 为主题。四个案例各 12 秒，总长 48 秒，16:9，30 fps，英文简短标签，无配音或音乐。顶部持续展示真实单帧观测图和对应动作文本，下方依次呈现同一个未来的 RGB、深度、三维点云和跟踪轨迹。

参考视频 `https://physicalvision.github.io/videos/geo4d-short.mp4` 的有效表达是 RGB → 深度 → 转视角点云。新版沿用这种连续视觉叙事，并通过顶部单帧条件、GENERATED FUTURE 标签和时间轴，明确本任务生成尚未观测的未来。参考片仅用于分析，没有使用其画面作为本片素材。

| 时间 | 场景 | 动作文本摘要 |
| --- | --- | --- |
| 0–12 秒 | 移液 | Dispense pink liquid into the glass dish. |
| 12–24 秒 | 人物弯腰 | Bend forward with both arms extended. |
| 24–36 秒 | 勺中滴液 | Lift the spoon. Let the thick liquid drip back into the bowl. |
| 36–48 秒 | 搅拌 | Blend the vegetables into a smooth soup. |

每段先展示 1.2 秒单张观测图，然后播放未来 RGB 的第 0–30 帧。在同一第 30 帧完成深度擦除、彩色点云显现与转视角，时间明确标为 TIME HELD。随后第 31–80 帧以原始 15 fps 继续，展示动态几何和轨迹，最后固定第 80 帧短暂转视角。全部 81 个源时间步按顺序出现，不倒放、不重复播放未来动作、不插值运动。

顶部两次选取的未压缩输入区域逐像素一致，确保输入没有随着未来输出变化。四个场景的原始 `meta.json` 均为 `task_type=ti2v`、`num_condition_frames=1`。时间轴表示生成视频的播放时间，不代表在线推理耗时或标定物理时间。

## Tracking 的来源

既有 `notch14_pointcloud_trails` 表示最近数帧的独立 scene-flow 位移线段，原报告明确说明它不是 tracked trajectories。因此本片没有直接将它改名为 tracking。

新版对生成的 `generated_video_geometry.mp4` 使用 OpenCV pyramidal Lucas–Kanade，进行前后向检查（误差不超过 0.75 像素），去除短轨迹、静止特征、无效点和过大的 3D 跳变。通过对应帧的 `point_map_world.pt` 双线性采样，将有效 2D 轨迹提升至 3D。轨迹连续、长度至少 9 帧，在画面中显示最近 18 帧的真实位置，不放大位移。

共筛选出 598 条轨迹：移液 225、人物 233、勺子 64、搅拌 76。它们是预测结果的可视化后处理，不是 Plan4D 原生 tracking head，也不是观测未来视频的输入。片中及页面 caption 明确标注 Tracks from generated RGB + predicted geometry。

每个场景第 0、30、80 帧的完整 141,120 个点已核对 `point_map_world.pt` 与原始 PLY 一致。三维镜头读取全部原始点，仅做固定场景归一化和展示相机运动；深度到点云采用画面叠化，不变形或补全几何。跟踪 ROI、过滤参数、原 prompt、源文件哈希与检查结果保存在来源记录中。

## 输出与接入

- `public/results/teaser-future-20261015/plan4d-future-teaser-1080p.mp4`：高清合成版。
- `public/results/teaser-future-20261015/plan4d-future-teaser.mp4`：720p 网页 MP4。
- `public/results/teaser-future-20261015/plan4d-future-teaser.webm`：720p 浏览器兼容版。
- `public/results/teaser-future-20261015/plan4d-future-teaser-poster.webp`：封面。
- `public/results/teaser-future-20261015/provenance.json`：分镜、来源和时间语义。
- `artifacts/future-teaser-20261015/`：追踪、点云渲染、分镜及验证记录。

项目页通过 `src/data/teaser.json` 选择新版本，视频组件、分享封面与构建资产检查共用该配置。原来的 54 秒 teaser 和两个 group demo 继续保留。用户已明确授权发布，工作流在恢复旧媒体后，额外恢复独立的 `plan4d-future-teaser-20261015` Release；独立 group demo 不上传。

发布包为 `plan4d-future-teaser-20261015-release.tar.gz`，仅含上述五份最终文件，顶层为 `results/teaser-future-20261015/`。SHA-256 为 `646c6f704ced9ceeb076266eb46f4e92b929bda7c7e9caf9f89ad4931a70dc7a`，工作流下载后校验再解压。目标站点为 `https://fogradio.github.io/plan4d-project/`。

## 复现与验证

在项目根目录运行，使用现有 CPU 环境与软件 WebGL，不训练模型：

```bash
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/prepare_future_teaser_assets.py
PLAYWRIGHT_BROWSERS_PATH=/tmp/plan4d-browsers /home/admin/code-server-4.104.3-linux-amd64/lib/node scripts/render_future_teaser.mjs
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/create_future_teaser.py
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/create_future_teaser.py --verify-only
```

正式媒体拒绝覆盖，配置改变后的旧 tracking 会移动至带时间戳的保留目录。点云渲染依据文件哈希复用；需要修改渲染参数时应在分镜中选择新的工作目录。分镜预览先运行渲染器 `--preview`，再运行合成器 `--preview`。旧预览同样保留。

浏览器验证复用 `scripts/verify_teaser.mjs`，包括四场景运动、八个关键阶段、自动播放、离屏暂停、手动暂停保持、减少动态效果与五种桌面手机视口。`scripts/create_future_teaser.py --verify-only` 完整解码三份成片并校验来源、时间顺序、单帧输入、tracking 及 faststart。

## 已完成的验证与预览

三个成片各 1,440 帧，共 4,320 帧全部解码；369 项来源哈希一致，两个 MP4 faststart 正常。固定输入条逐像素一致，全部源时间步按顺序出现，渲染与分镜的源帧索引一致。598 条轨迹通过追踪校验，四场景开启/关闭轨迹的实际画面差分均大于 738 像素。

生产构建成功，成片副本哈希一致。五种视口的 teaser 播放检查、九种视口的论文回归通过，浏览器错误为零。已检查桌面、手机和八个关键阶段截图。检查报告在 `artifacts/future-teaser-20261015/validation.json`、`browser/report.json` 和 `paper-browser/report.json`。

预览为 `http://localhost:4331/`（机器地址 `http://33.78.174.88:4331/`），远程编辑器转发 4331 端口后访问。

```bash
ASTRO_TELEMETRY_DISABLED=1 /home/admin/code-server-4.104.3-linux-amd64/lib/node scripts/build.mjs --outDir artifacts/future-teaser-page-20261015
ASTRO_TELEMETRY_DISABLED=1 /home/admin/code-server-4.104.3-linux-amd64/lib/node node_modules/.bin/astro preview --outDir artifacts/future-teaser-page-20261015 --host 0.0.0.0 --port 4331
```

保留现有三项 Astro 提示和 Three.js 体积提示，没有新增构建错误。OpenSpec CLI 不可用，规范通过结构检查。发布结果与线上验证记录见 `progress.md`。
