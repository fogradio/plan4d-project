# 九案例动态 4D 片尾

## 目标与版本

按用户要求恢复旧版片尾九宫格，保留原案例和顺序，延长为 66 秒。前 48 秒沿用已发布的单帧与文本驱动未来 4D 成片，追加 18 秒同屏动态点云。用户于 2026-10-17 明确授权发布；保留上一轮 b217ed7 的全部作者链接、场景预览和其他页面功能。

新版另存于 `public/results/teaser-future-20261015/dynamic-grid-20261017/`，旧目录直属的 48 秒成片与 54 秒旧版不覆盖。网页仍使用统一的 `src/data/teaser.json` 配置。

## 原九案例

顺序来自 `scripts/teaser_storyboard.json` 的 mosaic：`[0, 1, 4, 5, 6, 7, 10, 12, 16]`。

1. 搅拌汤锅。
2. 抬起勺子，让液体滴落。
3. 旋转并切开蛋糕。
4. 喷洗车轮。
5. 按压塑造黏土。
6. 将西兰花搅入意面。
7. 挤出肥皂并洗手。
8. 用移液管滴入粉色液体。
9. 向章鱼烧淋酱。

九格分别有自己的单帧图像与动作文本，不将它们描述为同一输入的九种未来。所有 `meta.json` 均为 `task_type=ti2v`、`num_condition_frames=1`。

## 新增分镜

| 全片时间 | 内容 | 源帧与时间语义 |
| --- | --- | --- |
| 48.0–49.2 秒 | 九格单帧输入 | 源帧 0；每格固定输入缩略图与动作文本 |
| 49.2–51.27 秒 | 九格未来 RGB | 源帧 0–30，原速 |
| 51.27–52.47 秒 | RGB 叠化至三维点云 | 源帧 30，TIME HELD |
| 52.47–54.27 秒 | 转动视角显现空间关系 | 源帧 30，TIME HELD |
| 54.27–60.93 秒 | 固定视角动态 4D | 源帧 31–80，0.5x PLAYBACK |
| 60.93–66.0 秒 | 同屏转视角结束 | 源帧 80，TIME HELD |

时间标签表示生成序列的播放时间，不是模型推理耗时或标定物理时间。半速通过重复原始帧实现，不生成插值几何。全部 81 个源时间步依次出现。

## 数据与画面真实性

读取原始 `point_cloud/frame_0000.ply` 至 `frame_0080.ply`，九案例共 729 份。每帧保留全部 141,120 点，不删点、补全或修改几何；只使用已有固定场景归一化和展示相机。各格使用独立、全段不变的取景缩放。几何中的空洞来自预测结果，未修补掩饰。

动态阶段的展示相机固定，转视角阶段的源时间固定，以便区分物体运动与相机运动。片尾不新增或声称 tracking；前 48 秒既有 tracking 的来源仍按 `FUTURE_TEASER.md` 记录。

## 制作与验证

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/plan4d-browsers /home/admin/code-server-4.104.3-linux-amd64/lib/node scripts/render_future_grid.mjs --preview
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/create_future_grid.py --preview artifacts/future-grid-20261017/preview-具体时间戳
PLAYWRIGHT_BROWSERS_PATH=/tmp/plan4d-browsers /home/admin/code-server-4.104.3-linux-amd64/lib/node scripts/render_future_grid.mjs
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/create_future_grid.py
/mnt/workspace/hwzhang/miniconda3/envs/dav3/bin/python scripts/create_future_grid.py --verify-only
```

渲染器保留预览目录，复用正式渲染时核对配置、源码、输入与输出哈希。正式成片拒绝覆盖。通过 FFmpeg concat demuxer 拼接码流，验证器将前 48 秒全部解码帧的 MD5 与原片逐帧比较。

验收覆盖三个成片的全部帧、原媒体哈希、729 份 PLY 与其他来源、九格固定视角动作变化、冻结旋转、单帧输入条不变及 faststart。浏览器检查覆盖九格非空与运动、48 秒拼接点、五种桌面手机视口和原有播放行为。

正式构建与浏览器结果记录在 `progress.md`。部署工作流新增独立版本媒体包，同时保留原有四项媒体恢复步骤和旧版本视频。

## 发布配置

- 站点：`https://fogradio.github.io/plan4d-project/`。
- Release：`plan4d-future-grid-20261017`。
- 归档：`plan4d-future-grid-20261017-release.tar.gz`，仅含三份成片、封面和来源记录。
- SHA-256：`e01c5ffe9db0c8541c6636f21a0d100f570c515685f0826867fe4f47f46acb6c`。
- 网页源码只修改 `src/data/teaser.json` 的媒体路径和时长。原始实验资产、独立 group demo 和混合任务日志不公开提交。
- 发布部署结果与公网验收另记于 `progress.md`。

## 已完成的媒体验收

三份 66 秒成片各 1,980 帧，全部 5,940 帧完整解码。782 项来源哈希一致；每个成片前 1,440 帧的解码 MD5 均逐帧等于相应原版，原媒体哈希未变。九格动态与转视角差分均通过，全部输入条逐像素不变，两个 MP4 均为 faststart。

点云渲染共 2,430 帧，使用全部 729 份原始 PLY。固定视角下的 450 次源帧切换最少改变 11,152 个画布像素；最小画面占用比例 8.43%。报告在 `artifacts/future-grid-20261017/validation.json`。

## 页面预览

- 本地：`http://localhost:4336/plan4d-project/`。
- 机器地址：`http://33.78.174.88:4336/plan4d-project/`。
- 1080p 文件：`public/results/teaser-future-20261015/dynamic-grid-20261017/plan4d-future-teaser-1080p.mp4`。
- 从第 48 秒开始为新增片尾。手机观看九宫格细节建议横屏全屏。

正式子路径构建成功，构建媒体哈希一致。五种 teaser 视口和九种论文页面视口验收通过，九格独立运动、拼接点实际播放和原有自动/手动播放逻辑正常，浏览器错误为零。截图与报告在 `artifacts/future-grid-20261017/browser/` 和 `paper-browser/`。保留既有 Astro 提示与 Three.js 体积提示。
