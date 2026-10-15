# 发现与依据

## GitHub Pages 发布准备（2026-10-14）
- origin 为公开仓库 https://github.com/fogradio/plan4d-project.git，main 与远端 cb45131 一致。
- GitHub API 的 has_pages 为 false，公开页面返回 404，最近 Actions 在 Setup Pages 步骤失败。
- public/results 被 Git 忽略，现有工作流支持通过 PLAN4D_RESULTS_ARCHIVE_URL 恢复 Release 媒体；仅推送源码不能完成发布。
- 当前完整静态构建约 1,060,656,322 字节，媒体约 1,055,330,412 字节；发布前需检查大小及资源完整性。
- git push --dry-run 在沙箱内外均因失效的 VS Code askpass socket 失败，无匿名写权限。准备官方 gh CLI 设备登录，不索取聊天 token。

## 会议名称与摘要微调（2026-10-14）
- 用户要求在标题与作者之间新增独立居中的 NeurIPS 2026，并仅去掉摘要末尾项目网址段落。
- 摘要测试需排除论文源文件中的最后一句 Project Page，其他正文继续逐字比对；不回写论文。

## 新版论文同步（2026-10-14）
- 摘要来源为论文仓库 `sections/0_abstract.tex`，页面采用正文原文，将 LaTeX 标记转换为 HTML。
- `neurips_2026.tex` 将 Jiahong Wu 与 Chuanxia Zheng 同时标记为通讯作者，第一单位为 PVG, Nanyang Technological University。
- 新方法图来源为 `figs/plab4d_final-chuanxia.pdf`，原网页方法图生成于 10 月 12 日，需重新渲染。
- 用户最终要求为保留全部定性展示，移除原定量表格。恢复 teaser、六场景逐帧对比、三场景聚合点云和 17 场景五模态 Gallery。
- `src/data/benchmarks.ts` 定量数据文件保留，但页面不再导入或渲染，相关表格导航与交互脚本移除。
- 本机 code-server 的 HTTPS `/proxy/4321/` 返回 200，可在浏览器检查中剥离外层 notebook 路径，验证实际端口代理与域名白名单。

## Gallery
- 下拉选项以输入文本中的主要动作命名，保留 01-17 编号和原顺序；场景 ID 仅作为内部资源关联，不再出现在选项名称中。
- 17 个指定场景均有 81 帧 PLY、输入图片、RGB/depth 视频及含轨迹的聚合 PLY。
- 用户随后指定 Scene Flow 为 notch14_pointcloud_trails/pred_scene_flow_raw_notch14_pointcloud_trails_vis.mp4，全部 17 份已核实存在。
- 参考 Beyond-Pixels 的输入条件、单一舞台和样例选择布局；本页按用户要求改成下拉选择和五模态左右切换。
- 新资源独立置于 public/results/gallery，不重新导出/覆盖旧比较数据。视频保留源 MP4 并提供 Chromium 兼容 WebM。

## 聚合点云更新
- 指定三个场景为 iaHNa6cm64k-0:02:50.044-0:02:56.759、test_cab_e_3rd_00000_00081、ZHwqSpZfPCI-0:05:13.280-0:05:19.640。
- 重新检查后 12 份 global_pcd_with_camera_trajectory.ply 均存在，包含 TesserAct 的 test_cab；不得显示缺失占位。
- 当前已有未提交的 VIST3A AnySplat 来源纠正及代理 allowedHosts 配置，必须保留。
- 聚合文件配套 manifest 标记场景点数、相机视锥和轨迹点数，导出时应保留全部相机顶点。
- 新区三列标题为 Input text、Input image、Aggregated 4D Point Cloud；第三列依次 Gen3R、TesserAct、VIST3A、Plan4D。
- 聚合派生资源约 36 MiB，按可见行加载；全部来源哈希、采样 XYZ/RGB、相机顶点及无损输入图像均通过校验。
- 三个场景全部四方法可用。原逐帧六场景与纠正后的 VIST3A Wan2.1 + AnySplat 数据未重新导出或覆盖。

- 页面仓库当前为干净的 Astro 6 学术模板，已依赖 Three.js 0.182。
- 论文标题：Plan4D: Generative Plannable 4D Worlds。
- 作者与单位以 neurips_2026.tex 为准，不捏造公开论文或代码地址。
- Plan4D 使用 LongCat-Video 与扩展 scene flow head 的 DA3，经 latent-to-geometry stitching 读出深度、射线与场景流。
- 用户更正：Plan4D 来自 plan4d_final_outputs-best，排除 P28_101_119，baseline 同样排除，最终各 6 个场景。
- 每场景只展示 best 目录的一套结果，匹配 Gen3R、TesserAct、VIST3A，各有 81 帧 PLY。
- 输入文本、条件图和帧率可从每个结果的 meta.json 与 condition_image.png 获得。
- 原始 PLY 大小因方法而异，需避免一次下载所有场景和帧。
- 最终 24 个方法/场景的 meta.json 或 metadata.json 中的 prompt 均与对应输入文本一致。
- 浏览器使用一个共享 WebGL renderer 渲染可见对比单元，独立相机与时间稳定的显示尺度；LRU 缓存限制为 80 帧几何，最多 6 个请求并发。
- 当前 Chromium 缺少 H.264 解码能力，已为 12 个视频生成 VP9 WebM 备选并保留原始 MP4；双视频同步播放验证通过。

## Teaser 素材与参考（2026-10-15）
- 当前首屏是 public/figures/teaser.webp 静态图，视频制作可沿用原有 Gallery 的 17 场景资产与来源清单。
- CUT3R 首屏使用 muted/autoplay/loop 的点云演示视频；VGGT-Omega 使用同步的输入视频与重建视频。借鉴真实结果优先、同时展示外观与几何的表达方式。
- Gallery 视频均为 81 帧 / 15 fps（5.4 秒）；RGB 512x288，深度 504x280，场景流 960x720，具体以各文件元数据为准。
- 场景流必须使用 notch14_pointcloud_trails 版本；输入是观测图像与动作文本，不应将生成 RGB 标为输入视频。
- 现有 dav3 环境具备 Pillow、OpenCV、NumPy、plyfile、imageio-ffmpeg；项目具备 Three.js、Playwright、sharp，无需安装或升级核心依赖。
- 已目视检查 17 场景接触表。移液、搅拌、滴液、洗手、人物弯腰和街景具有清楚的动作或结构变化，适合作为主镜头；场景流原视频有白色背景，剪辑采用明亮中性底色。
- 点云镜头使用原始 best 结果的逐帧 PLY，经 Three.js 渲染，仅改变展示视角，不做几何修复或合成动作；所有模态保留 15 fps 的真实 81 帧时间对应关系。
- 第一版 10 帧分镜已目视核对。聚合点云的初始取景留白较多，调整摄影机视场至 22 度，保留旧渲染并生成 v2；其余点云使用 40 度视场和固定场景归一化。
- 采用 1920x1080 合成、30 fps 输出，源视频保持 15 fps 原动作速度，每帧重复而不做运动插值。段落间 5 帧短叠化，无黑场、无配音、无背景音乐。
- 成片与网页播放器通过全量解码和五视口浏览器验证；本机 Chromium 实际选择 VP9 WebM。1080p 成片约 30.5 MiB，网页 MP4 约 8.4 MiB，WebM 约 8.8 MiB。
- 宽范围父仓库 AGENTS 搜索耗时过长，已在完成精准规则检查后使用会话中断停止；不影响目标目录规则确认。期间进程终止命令未命中，最终使用原搜索会话 Ctrl-C 成功结束。
- 生产构建成功，类型检查零错误，Three.js 产生一个超过 500 kB 的构建体积提示；网页媒体约 380 MiB，不在首屏全量下载。
