# 发现与依据

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
