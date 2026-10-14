# 发现与依据

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
- 生产构建成功，类型检查零错误，Three.js 产生一个超过 500 kB 的构建体积提示；网页媒体约 380 MiB，不在首屏全量下载。
